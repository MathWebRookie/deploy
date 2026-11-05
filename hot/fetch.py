#!/usr/bin/env python3
"""Fetch public hot lists into data.json. Stdlib only."""

import fcntl
import gzip
import json
import os
import sys
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
        return read_body(response)


def get_json(url, headers=None):
    return json.loads(get_text(url, headers))


def post_json(url, payload, headers=None):
    request_headers = {
        "User-Agent": UA,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=request_headers,
    )
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


SOURCES = (
    ("zhihu", "知乎热榜", fetch_zhihu),
    ("weibo", "微博热搜", fetch_weibo),
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


def collect_source(source_id, name, fetch, updated_at, previous):
    try:
        items = fetch()
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
        if old and old.get("items"):
            kept = dict(old)
            kept["ok"] = False
            kept["error"] = "更新失败，显示上次的结果"
            return kept
        return {
            "id": source_id,
            "name": name,
            "ok": False,
            "error": "更新失败",
            "updatedAt": None,
            "items": [],
        }


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
        if chosen == SOURCES:
            sources = [refreshed[source_id] for source_id, _, _ in SOURCES]
        else:
            sources = []
            seen = set()
            for source in previous.get("sources") or []:
                source_id = source.get("id")
                if not source_id or source_id in seen:
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
