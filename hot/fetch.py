#!/usr/bin/env python3
"""Fetch public hot lists into data.json. Stdlib only."""

import fcntl
import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(os.environ.get("HOT_DIR", "/var/www/portal/hot"))
DATA = ROOT / "data.json"
LOCK = Path(os.environ.get("HOT_LOCK", "/tmp/hot-fetch.lock"))
LIMIT = 30
TIMEOUT = 12
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)


def read_body(response):
    raw = response.read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return raw.decode("utf-8")


def get_text(url, headers=None):
    request_headers = {"User-Agent": UA, "Accept": "application/json,text/plain,*/*"}
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(url, headers=request_headers)
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        raw = response.read()
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        encoding = response.headers.get_content_charset() or "utf-8"
        return raw.decode(encoding)


def get_json(url, headers=None):
    return json.loads(get_text(url, headers))


def post_json(url, payload, headers=None):
    return post_body(url, json.dumps(payload).encode("utf-8"), "application/json", headers)


def post_form(url, form, headers=None):
    body = urllib.parse.urlencode(form).encode("utf-8")
    return post_body(url, body, "application/x-www-form-urlencoded", headers)


def post_body(url, body, content_type, headers=None):
    request_headers = {
        "User-Agent": UA,
        "Accept": "application/json",
        "Content-Type": content_type,
    }
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(url, data=body, headers=request_headers)
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(read_body(response))


def format_heat(value):
    if value is None or value == "":
        return ""
    if isinstance(value, str) and not value.isdigit():
        return value
    try:
        number = int(value)
    except (TypeError, ValueError):
        return str(value)
    if number >= 10000:
        text = f"{number / 10000:.1f}万"
        return text.replace(".0万", "万")
    return str(number)


def fetch_zhihu():
    payload = get_json("https://www.zhihu.com/api/v3/feed/topstory/hot-list-web?limit=50")
    items = []
    for row in payload.get("data") or []:
        target = row.get("target") or {}
        title = ((target.get("title_area") or {}).get("text") or "").strip()
        url = (target.get("link") or {}).get("url") or ""
        heat = ((target.get("metrics_area") or {}).get("text") or "").strip()
        if title and url.startswith("http"):
            items.append({"title": title, "url": url, "heat": heat})
        if len(items) >= LIMIT:
            break
    return items


def fetch_weibo():
    payload = get_json(
        "https://weibo.com/ajax/side/hotSearch",
        {"Referer": "https://weibo.com/"},
    )
    items = []
    for row in (payload.get("data") or {}).get("realtime") or []:
        if row.get("is_ad") or row.get("small_icon_desc") in ("商", "荐"):
            continue
        word = (row.get("word") or "").strip()
        if not word:
            continue
        scheme = row.get("word_scheme") or f"#{word}#"
        items.append(
            {
                "title": word,
                "url": "https://s.weibo.com/weibo?q=" + urllib.parse.quote(scheme),
                "heat": format_heat(row.get("num")),
            }
        )
        if len(items) >= LIMIT:
            break
    return items


def fetch_bilibili():
    items = []
    seen = set()
    for page in (1, 2):
        try:
            payload = get_json(f"https://api.bilibili.com/x/web-interface/popular?ps=20&pn={page}")
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            break
        for row in (payload.get("data") or {}).get("list") or []:
            title = (row.get("title") or "").strip()
            bvid = row.get("bvid") or ""
            if not title or bvid in seen:
                continue
            url = row.get("short_link_v2") or (f"https://www.bilibili.com/video/{bvid}" if bvid else "")
            if not url.startswith("http"):
                continue
            seen.add(bvid)
            items.append(
                {
                    "title": title,
                    "url": url,
                    "heat": format_heat((row.get("stat") or {}).get("view")),
                }
            )
            if len(items) >= LIMIT:
                return items
    return items


def ithome_item(row):
    title = (row.get("title") or "").strip()
    url = (row.get("url") or "").strip()
    if url.startswith("/"):
        url = "https://www.ithome.com" + url
    elif not url:
        newsid = str(row.get("newsid") or "")
        if len(newsid) > 3:
            url = f"https://www.ithome.com/0/{newsid[:3]}/{newsid[3:]}.htm"
    if not title or not url.startswith("http"):
        return None
    return {"title": title, "url": url, "heat": format_heat(row.get("hitcount"))}


def fetch_ithome():
    rank = get_json("https://api.ithome.com/json/newslist/rank")
    news = get_json("https://api.ithome.com/json/newslist/news")
    items = []
    seen = set()
    rows = list(rank.get("channel48rank") or []) + list(news.get("newslist") or [])
    for row in rows:
        item = ithome_item(row)
        if not item or item["title"] in seen:
            continue
        seen.add(item["title"])
        items.append(item)
        if len(items) >= LIMIT:
            break
    return items


def fetch_juejin():
    payload = get_json(
        "https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot&count=30&from=1"
    )
    items = []
    for row in payload.get("data") or []:
        content = row.get("content") or {}
        title = (content.get("title") or "").strip()
        content_id = content.get("content_id") or ""
        if title and content_id:
            heat = (row.get("content_counter") or {}).get("view")
            items.append(
                {
                    "title": title,
                    "url": f"https://juejin.cn/post/{content_id}",
                    "heat": format_heat(heat),
                }
            )
        if len(items) >= LIMIT:
            break
    return items


def fetch_baidu():
    payload = get_json(
        "https://top.baidu.com/api/board?platform=wise&tab=realtime",
        {"Referer": "https://top.baidu.com/board?tab=realtime"},
    )
    rows = []

    def walk(node):
        if isinstance(node, dict):
            if node.get("word"):
                rows.append(node)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk((payload.get("data") or {}).get("cards") or [])
    items = []
    seen = set()
    for row in rows:
        word = (row.get("word") or "").strip()
        if not word or word in seen:
            continue
        seen.add(word)
        url = row.get("url") or ("https://www.baidu.com/s?wd=" + urllib.parse.quote(word))
        if not str(url).startswith("http"):
            url = "https://www.baidu.com/s?wd=" + urllib.parse.quote(word)
        items.append({"title": word, "url": url, "heat": format_heat(row.get("hotScore"))})
        if len(items) >= LIMIT:
            break
    return items


def fetch_netease():
    text = get_text(
        "https://3g.163.com/touch/reconstruct/article/list/BBM54PGAwangning/0-20.html",
        {"Referer": "https://3g.163.com/"},
    )
    start, end = text.find("("), text.rfind(")")
    if start != -1 and end > start:
        text = text[start + 1 : end]
    payload = json.loads(text)
    rows = []
    for value in payload.values():
        if isinstance(value, list):
            rows = value
            break
    items = []
    for row in rows:
        title = (row.get("title") or "").strip()
        docid = (row.get("docid") or "").strip()
        url = (row.get("url") or "").strip()
        if not url.startswith("http") and docid:
            url = f"https://www.163.com/dy/article/{docid}.html"
        if title and url.startswith("http"):
            items.append({"title": title, "url": url, "heat": format_heat(row.get("commentCount"))})
        if len(items) >= LIMIT:
            break
    return items


def fetch_qq():
    payload = get_json("https://r.inews.qq.com/gw/event/hot_ranking_list?page_size=50")
    rows = []
    for block in payload.get("idlist") or []:
        rows.extend(block.get("newslist") or [])
    items = []
    for row in rows:
        url = (row.get("url") or row.get("surl") or "").strip()
        hot = row.get("hotEvent") or {}
        title = (hot.get("title") or row.get("title") or "").strip()
        if not title or not url.startswith("http"):
            continue
        items.append({"title": title, "url": url, "heat": format_heat(hot.get("hotScore"))})
        if len(items) >= LIMIT:
            break
    return items


def fetch_kr36():
    payload = post_json(
        "https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot",
        {"partner_id": "web", "param": {"siteId": 1, "platformId": 2}},
        {"Referer": "https://36kr.com/"},
    )
    rows = ((payload.get("data") or {}).get("hotRankList") or [])
    items = []
    for row in rows:
        material = row.get("templateMaterial") or {}
        title = (material.get("widgetTitle") or "").strip()
        item_id = row.get("itemId") or material.get("itemId")
        if title and item_id:
            items.append(
                {
                    "title": title,
                    "url": f"https://36kr.com/p/{item_id}",
                    "heat": format_heat(material.get("statRead")),
                }
            )
        if len(items) >= LIMIT:
            break
    return items


def fetch_thepaper():
    payload = get_json("https://cache.thepaper.cn/contentapi/contVisit/hotNews")
    items = []
    for row in payload.get("data") or []:
        title = (row.get("name") or "").strip()
        content_id = str(row.get("contId") or "").strip()
        if title and content_id:
            items.append(
                {
                    "title": title,
                    "url": f"https://www.thepaper.cn/newsDetail_forward_{content_id}",
                    "heat": format_heat(row.get("interactionNum")),
                }
            )
        if len(items) >= LIMIT:
            break
    return items


def fetch_acfun():
    payload = get_json(
        "https://www.acfun.cn/rest/pc-direct/rank/channel?channelId=0&rankLimit=30&rankPeriod=DAY"
    )
    items = []
    for row in payload.get("rankList") or []:
        title = (row.get("contentTitle") or row.get("title") or "").strip()
        url = (row.get("shareUrl") or "").strip()
        content_id = row.get("contentId") or row.get("dougaId")
        if not url.startswith("http") and content_id:
            url = f"https://www.acfun.cn/v/ac{content_id}"
        if title and url.startswith("http"):
            items.append({"title": title, "url": url, "heat": format_heat(row.get("viewCount"))})
        if len(items) >= LIMIT:
            break
    return items


def fetch_douban():
    payload = get_json(
        "https://movie.douban.com/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8&page_limit=30&page_start=0",
        {"Referer": "https://movie.douban.com/"},
    )
    items = []
    for row in payload.get("subjects") or []:
        title = (row.get("title") or "").strip()
        url = (row.get("url") or "").strip()
        if title and url.startswith("http"):
            items.append({"title": title, "url": url, "heat": (row.get("rate") or "").strip()})
        if len(items) >= LIMIT:
            break
    return items


def fetch_toutiao():
    payload = get_json(
        "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
        {"Referer": "https://www.toutiao.com/"},
    )
    items = []
    for row in payload.get("data") or []:
        title = (row.get("Title") or "").strip()
        url = (row.get("Url") or "").strip()
        if title and url.startswith("http"):
            items.append({"title": title, "url": url, "heat": format_heat(row.get("HotValue"))})
        if len(items) >= LIMIT:
            break
    return items


def fetch_douyin():
    payload = get_json(
        "https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web",
        {"Referer": "https://www.douyin.com/"},
    )
    rows = ((payload.get("data") or {}).get("word_list") or [])
    items = []
    for row in rows:
        title = (row.get("word") or "").strip()
        if not title:
            continue
        items.append(
            {
                "title": title,
                "url": "https://www.douyin.com/search/" + urllib.parse.quote(title),
                "heat": format_heat(row.get("hot_value")),
            }
        )
        if len(items) >= LIMIT:
            break
    return items


def fetch_huxiu():
    payload = post_form(
        "https://api-article.huxiu.com/web/article/articleList",
        {"platform": "www", "page": "1", "pagesize": "30"},
        {"Referer": "https://www.huxiu.com/"},
    )
    rows = ((payload.get("data") or {}).get("dataList") or [])
    items = []
    for row in rows:
        title = (row.get("title") or "").strip()
        url = (row.get("share_url") or "").strip()
        aid = row.get("aid")
        if not url.startswith("http") and aid:
            url = f"https://www.huxiu.com/article/{aid}.html"
        if title and url.startswith("http"):
            heat = (row.get("count_info") or {}).get("viewnum")
            items.append({"title": title, "url": url, "heat": format_heat(heat)})
        if len(items) >= LIMIT:
            break
    return items


def fetch_smzdm():
    payload = get_json(
        "https://api.smzdm.com/v1/home/articles?limit=30&f=android&v=10.6.0",
        {"User-Agent": "smzdm_android_V10.6.0", "Accept": "application/json"},
    )
    if str(payload.get("error_code")) != "0":
        raise RuntimeError(payload.get("error_msg") or "smzdm")
    rows = ((payload.get("data") or {}).get("rows")) or []
    items = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = str(row.get("article_title") or "").strip()
        url = str(row.get("article_url") or "").strip()
        if not title or not url.startswith("http"):
            continue
        heat = row.get("article_worthy")
        if heat in (None, "", 0, "0"):
            heat = row.get("article_comment")
        if heat in (None, "", 0, "0"):
            heat = row.get("article_price") or row.get("article_subtitle") or ""
        items.append({"title": title, "url": url, "heat": format_heat(heat)})
        if len(items) >= LIMIT:
            break
    return items


QQ_HEADERS = {"Referer": "https://gu.qq.com/"}
SINA_HEADERS = {"Referer": "https://finance.sina.com.cn/"}
A_INDEXES = (
    ("sh000001", "上证指数"),
    ("sz399001", "深证成指"),
    ("sz399006", "创业板指"),
    ("sh000688", "科创50"),
    ("sh000300", "沪深300"),
)
HK_INDEXES = (
    ("r_hkHSI", "恒生指数"),
    ("r_hkHSCEI", "恒生国企指数"),
    ("r_hkHSTECH", "恒生科技指数"),
)


def parse_change(value):
    if value is None or value == "" or value == "-":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:
        return None
    return round(number, 2)


def format_price(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:
        return None
    return f"{number:.2f}"


def quote_fields(line):
    start = line.find('"')
    end = line.rfind('"')
    if start < 0 or end <= start:
        return []
    return line[start + 1:end].split("~")


def qq_index_quotes(specs):
    text = get_text("https://qt.gtimg.cn/q=" + ",".join(code for code, _name in specs), QQ_HEADERS)
    found = {}
    for line in text.split(";"):
        line = line.strip()
        if not line.startswith("v_") or "=" not in line:
            continue
        key = line[2:line.find("=")]
        parts = quote_fields(line)
        if len(parts) < 33:
            continue
        price = format_price(parts[3])
        change = parse_change(parts[32])
        if price is None or change is None:
            continue
        found[key] = (price, change)
    items = []
    for code, name in specs:
        row = found.get(code)
        if not row:
            continue
        link_code = code[2:] if code.startswith("r_") else code
        items.append(
            {
                "name": name,
                "price": row[0],
                "change": row[1],
                "url": f"https://gu.qq.com/{link_code}",
            }
        )
    return items


def qq_industry_boards(direction):
    payload = get_json(
        "https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank"
        "?_appver=11.17.0&board_type=hy&sort_type=priceRatio"
        f"&direct={direction}&offset=0&count=5",
        QQ_HEADERS,
    )
    if payload.get("code") not in (0, "0"):
        raise RuntimeError(payload.get("msg") or "qq board")
    items = []
    for row in ((payload.get("data") or {}).get("rank_list")) or []:
        name = str(row.get("name") or "").strip()
        code = str(row.get("code") or "").strip()
        change = parse_change(row.get("zdf"))
        if not name or not code or change is None:
            continue
        items.append({"name": name, "change": change, "url": f"https://gu.qq.com/{code}"})
        if len(items) >= 5:
            break
    return items


def hk_stock_movers(descending):
    payload = get_json(
        "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
        "Market_Center.getHKStockData?page=1&num=8&sort=changepercent&asc="
        + ("0" if descending else "1")
        + "&node=qbgg_hk",
        SINA_HEADERS,
    )
    if not isinstance(payload, list):
        raise RuntimeError("hk movers")
    items = []
    for row in payload:
        name = str(row.get("name") or "").strip()
        symbol = str(row.get("symbol") or "").strip()
        change = parse_change(row.get("changepercent"))
        if not name or not symbol or change is None:
            continue
        items.append(
            {
                "name": name,
                "change": change,
                "url": f"https://gu.qq.com/hk{symbol.zfill(5)}",
            }
        )
        if len(items) >= 5:
            break
    return items


def fetch_group(loader):
    for attempt in range(3):
        try:
            return loader()
        except (OSError, urllib.error.URLError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            if attempt == 2:
                return []
            time.sleep(0.4)


def quote_or_empty(indexes, up, down):
    quote = {"indexes": indexes, "up": up, "down": down}
    if not up and not down:
        raise RuntimeError("empty")
    return {"quote": quote}


def fetch_stock_a():
    return quote_or_empty(
        fetch_group(lambda: qq_index_quotes(A_INDEXES)),
        fetch_group(lambda: qq_industry_boards("down")),
        fetch_group(lambda: qq_industry_boards("up")),
    )


def fetch_stock_hk():
    return quote_or_empty(
        fetch_group(lambda: qq_index_quotes(HK_INDEXES)),
        fetch_group(lambda: hk_stock_movers(True)),
        fetch_group(lambda: hk_stock_movers(False)),
    )


SOURCES = (
    ("zhihu", "知乎热榜", fetch_zhihu),
    ("weibo", "微博热搜", fetch_weibo),
    ("stock-a", "A股", fetch_stock_a),
    ("stock-hk", "港股", fetch_stock_hk),
    ("bilibili", "B站热门", fetch_bilibili),
    ("ithome", "IT之家", fetch_ithome),
    ("juejin", "掘金热榜", fetch_juejin),
    ("baidu", "百度热搜", fetch_baidu),
    ("netease", "网易新闻", fetch_netease),
    ("qq", "腾讯热点", fetch_qq),
    ("kr36", "36氪热榜", fetch_kr36),
    ("thepaper", "澎湃热闻", fetch_thepaper),
    ("acfun", "AcFun日榜", fetch_acfun),
    ("douban", "豆瓣电影", fetch_douban),
    ("toutiao", "今日头条", fetch_toutiao),
    ("douyin", "抖音热搜", fetch_douyin),
    ("huxiu", "虎嗅", fetch_huxiu),
    ("smzdm", "值得买好价", fetch_smzdm),
)


def load_previous():
    try:
        return json.loads(DATA.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"sources": []}


def previous_source(previous, source_id):
    for source in previous.get("sources") or []:
        if source.get("id") == source_id:
            return source
    return None


QUOTE_SOURCES = {"stock-a", "stock-hk"}


def empty_quote():
    return {"indexes": [], "up": [], "down": []}


def collect_source(source_id, name, fetch, updated_at, previous):
    try:
        result = fetch()
        if isinstance(result, dict) and "quote" in result:
            quote = result.get("quote") or empty_quote()
            if not (quote.get("up") or quote.get("down")):
                raise RuntimeError("empty")
            return {
                "id": source_id,
                "name": name,
                "ok": True,
                "kind": "quote",
                "error": None,
                "updatedAt": updated_at,
                "quote": quote,
                "items": [],
            }
        items = result
        if not items:
            raise RuntimeError("empty")
        return {
            "id": source_id,
            "name": name,
            "ok": True,
            "error": None,
            "updatedAt": updated_at,
            "items": items,
        }
    except (OSError, urllib.error.URLError, KeyError, TypeError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"FAIL {source_id} {exc}", flush=True)
        old = previous_source(previous, source_id)
        old_quote = old.get("quote") if isinstance(old, dict) else None
        old_usable = bool(old and (old.get("items") or (isinstance(old_quote, dict) and any(old_quote.get(key) for key in ("indexes", "up", "down")))))
        if old_usable:
            kept = dict(old)
            kept["ok"] = False
            kept["error"] = "更新失败，显示上次的结果"
            return kept
        failed = {
            "id": source_id,
            "name": name,
            "ok": False,
            "error": "更新失败",
            "updatedAt": None,
            "items": [],
        }
        if source_id in QUOTE_SOURCES:
            failed["kind"] = "quote"
            failed["quote"] = empty_quote()
        return failed


def sources_to_fetch():
    if "--source" not in sys.argv:
        return SOURCES
    index = sys.argv.index("--source")
    if index + 1 >= len(sys.argv):
        print("BAD_SOURCE", flush=True)
        return None
    source_id = sys.argv[index + 1]
    chosen = tuple(item for item in SOURCES if item[0] == source_id)
    if len(chosen) != 1:
        print("BAD_SOURCE", flush=True)
        return None
    return chosen


def main() -> int:
    nonblocking = "--try" in sys.argv
    chosen = sources_to_fetch()
    if chosen is None:
        return 1
    ROOT.mkdir(parents=True, exist_ok=True)
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    with LOCK.open("a+") as lock_file:
        flags = fcntl.LOCK_EX | (fcntl.LOCK_NB if nonblocking else 0)
        try:
            fcntl.flock(lock_file, flags)
        except BlockingIOError:
            print("BUSY", flush=True)
            return 2

        previous = load_previous()
        updated_at = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
        refreshed = {
            source_id: collect_source(source_id, name, fetch, updated_at, previous)
            for source_id, name, fetch in chosen
        }
        known = {source_id for source_id, _, _ in SOURCES}
        if chosen == SOURCES:
            sources = [refreshed[source_id] for source_id, _, _ in SOURCES]
        else:
            sources = []
            seen = set()
            for source in previous.get("sources") or []:
                source_id = source.get("id")
                if not source_id or source_id in seen or source_id not in known:
                    continue
                sources.append(refreshed.get(source_id, source))
                seen.add(source_id)
            for source_id, _, _ in SOURCES:
                if source_id in refreshed and source_id not in seen:
                    sources.append(refreshed[source_id])

        payload = {"updatedAt": updated_at, "sources": sources}
        temporary = DATA.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.chmod(temporary, 0o644)
        os.replace(temporary, DATA)
        os.chmod(DATA, 0o644)
        print("OK", flush=True)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
