const grid = document.querySelector("#grid");
const updated = document.querySelector("#updated");
const note = document.querySelector("#note");
const refreshButton = document.querySelector("#refresh");
const themeButton = document.querySelector("#theme");
const settingsButton = document.querySelector("#settings");
const sourceBar = document.querySelector("#source-bar");
const backdrop = document.querySelector("#backdrop");
const drawer = document.querySelector("#drawer");
const drawerClose = document.querySelector("#drawer-close");
const preview = document.querySelector("#preview");
const previewTitle = document.querySelector("#preview-title");
const previewOpen = document.querySelector("#preview-open");
const previewClose = document.querySelector("#preview-close");
const previewFrame = document.querySelector("#preview-frame");
const THEME_KEY = "hot-theme";
const SETTINGS_KEY = "hot-settings";
const CATALOG = [
  { id: "zhihu", name: "知乎", short: "知", color: "#1772f6" },
  { id: "weibo", name: "微博", short: "微", color: "#e6162d" },
  { id: "bilibili", name: "B站", short: "B", color: "#fb7299" },
  { id: "ithome", name: "IT之家", short: "IT", color: "#c0392b" },
  { id: "juejin", name: "掘金", short: "掘", color: "#1e80ff" },
  { id: "baidu", name: "百度", short: "百", color: "#4e6ef2" },
  { id: "netease", name: "网易", short: "网", color: "#c20c0c" },
  { id: "qq", name: "腾讯", short: "腾", color: "#0052d9" },
  { id: "kr36", name: "36氪", short: "氪", color: "#4285f4" },
  { id: "thepaper", name: "澎湃", short: "澎", color: "#0072c6" },
  { id: "acfun", name: "A站", short: "A", color: "#fd4c5d" },
  { id: "douban", name: "豆瓣", short: "豆", color: "#007722" },
];
const ORIGINAL_SOURCES = ["zhihu", "weibo", "bilibili", "ithome", "juejin", "baidu"];
const mobileQuery = matchMedia("(max-width: 720px)");
const expandedIds = new Set();
const collapsedIds = new Set();
let settings = loadSettings();
let lastData = null;

function loadSettings() {
  const defaults = {
    linkMode: "blank",
    showHeat: true,
    listMode: "collapsed",
    mobileSource: "zhihu",
    sources: CATALOG.map((item) => item.id),
  };
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const normalized = normalizeSources(raw.sources, raw.sourcesSeen);
    return {
      linkMode: raw.linkMode === "iframe" ? "iframe" : defaults.linkMode,
      showHeat: raw.showHeat === false ? false : defaults.showHeat,
      listMode: raw.listMode === "expanded" ? "expanded" : defaults.listMode,
      sources: normalized.sources,
      sourcesSeen: normalized.seen,
      mobileSource: normalized.sources.includes(raw.mobileSource) ? raw.mobileSource : normalized.sources[0],
    };
  } catch (error) {
    return defaults;
  }
}

function normalizeSources(value, seen) {
  const all = CATALOG.map((item) => item.id);
  const allowed = new Set(all);
  const picked = Array.isArray(value) ? value.filter((id) => allowed.has(id)) : null;
  if (!picked || !picked.length) return { sources: all, seen: all };
  const seenIds = Array.isArray(seen) ? seen.filter((id) => allowed.has(id)) : ORIGINAL_SOURCES;
  const newcomers = all.filter((id) => !seenIds.includes(id));
  const sources = all.filter((id) => picked.includes(id) || newcomers.includes(id));
  return { sources: sources.length ? sources : all, seen: all };
}

function persist() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applyHeat() {
  document.documentElement.dataset.heat = settings.showHeat ? "on" : "off";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  themeButton.setAttribute("aria-label", isDark ? "切换到浅色" : "切换到深色");
  localStorage.setItem(THEME_KEY, theme);
}

themeButton.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
applyHeat();

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch (error) {
    return "";
  }
  return "";
}

function isMobile() {
  return mobileQuery.matches;
}

function isExpanded(sourceId) {
  if (expandedIds.has(sourceId)) return true;
  if (collapsedIds.has(sourceId)) return false;
  return settings.listMode === "expanded";
}

function toggleFold(sourceId) {
  if (isExpanded(sourceId)) {
    expandedIds.delete(sourceId);
    collapsedIds.add(sourceId);
  } else {
    collapsedIds.delete(sourceId);
    expandedIds.add(sourceId);
  }
  if (lastData) render(lastData);
}

function enabledSources(sources) {
  const allow = new Set(settings.sources);
  return sources.filter((source) => allow.has(source.id));
}

function sourceForMobile(sources) {
  return sources.find((source) => source.id === settings.mobileSource) || sources[0] || null;
}

function highlightSource(activeId) {
  sourceBar.querySelectorAll(".source-tab").forEach((button) => {
    const on = button.dataset.source === activeId;
    button.classList.toggle("active", on);
    button.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function selectSource(sourceId) {
  settings.mobileSource = sourceId;
  persist();
  if (lastData) render(lastData);
  else highlightSource(sourceId);
}

function buildSourceBar() {
  sourceBar.replaceChildren();
  for (const item of CATALOG.filter((entry) => settings.sources.includes(entry.id))) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "source-tab";
    button.dataset.source = item.id;
    button.style.setProperty("--mark", item.color);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-label", item.name);
    const mark = document.createElement("span");
    mark.className = item.short.length > 1 ? "mark compact" : "mark";
    mark.textContent = item.short;
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = item.name;
    button.append(mark, label);
    button.addEventListener("click", () => selectSource(item.id));
    sourceBar.append(button);
  }
  highlightSource(settings.mobileSource);
}

function refreshIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arc.setAttribute("d", "M20 12a8 8 0 1 1-2.3-5.7");
  arc.setAttribute("fill", "none");
  arc.setAttribute("stroke", "currentColor");
  arc.setAttribute("stroke-width", "2");
  arc.setAttribute("stroke-linecap", "round");
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrow.setAttribute("d", "M20 4v5h-5");
  arrow.setAttribute("fill", "none");
  arrow.setAttribute("stroke", "currentColor");
  arrow.setAttribute("stroke-width", "2");
  arrow.setAttribute("stroke-linecap", "round");
  arrow.setAttribute("stroke-linejoin", "round");
  svg.append(arc, arrow);
  return svg;
}

function openPreview(title, href) {
  previewTitle.textContent = title || "预览";
  previewOpen.href = href;
  previewFrame.src = href;
  preview.hidden = false;
  syncScrollLock();
  previewClose.focus();
}

function closePreview() {
  preview.hidden = true;
  previewFrame.src = "about:blank";
  syncScrollLock();
}

function settingValue(key) {
  if (key === "showHeat") return settings.showHeat ? "on" : "off";
  return settings[key];
}

function syncDrawer() {
  drawer.querySelectorAll("[data-setting]").forEach((button) => {
    const on = button.dataset.value === settingValue(button.dataset.setting);
    button.classList.toggle("active", on);
    button.setAttribute("aria-checked", on ? "true" : "false");
  });
  drawer.querySelectorAll("#source-checks input").forEach((input) => {
    input.checked = settings.sources.includes(input.value);
  });
}

function toggleSource(sourceId, checked) {
  const next = new Set(settings.sources);
  if (checked) next.add(sourceId);
  else next.delete(sourceId);
  if (!next.size) return false;
  settings.sources = CATALOG.map((item) => item.id).filter((id) => next.has(id));
  if (!settings.sources.includes(settings.mobileSource)) settings.mobileSource = settings.sources[0];
  persist();
  buildSourceBar();
  syncDrawer();
  if (lastData) render(lastData);
  return true;
}

function buildSourceChecks() {
  const box = document.querySelector("#source-checks");
  for (const item of CATALOG) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = item.id;
    input.addEventListener("change", () => {
      if (!toggleSource(item.id, input.checked)) input.checked = true;
    });
    const text = document.createElement("span");
    text.textContent = item.name;
    label.append(input, text);
    box.append(label);
  }
}

function updateSetting(key, value) {
  if (key === "showHeat") settings.showHeat = value === "on";
  else settings[key] = value;
  if (key === "listMode") {
    expandedIds.clear();
    collapsedIds.clear();
  }
  persist();
  applyHeat();
  syncDrawer();
  if (lastData) render(lastData);
}

function openDrawer() {
  syncDrawer();
  backdrop.hidden = false;
  drawer.hidden = false;
  syncScrollLock();
  drawerClose.focus();
}

function closeDrawer() {
  backdrop.hidden = true;
  drawer.hidden = true;
  syncScrollLock();
  settingsButton.focus();
}

function syncScrollLock() {
  document.body.classList.toggle("overlay-open", !drawer.hidden || !preview.hidden);
}

function render(data) {
  lastData = data;
  const when = formatTime(data.updatedAt);
  updated.textContent = when ? `更新于 ${when}` : "还没有数据";
  const sources = enabledSources(data.sources || []);
  const mobileSource = sourceForMobile(sources);
  const visible = isMobile() ? [mobileSource].filter(Boolean) : sources;
  highlightSource(isMobile() ? mobileSource && mobileSource.id : settings.mobileSource);
  grid.replaceChildren();
  for (const source of visible) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.source = source.id || "";
    const head = document.createElement("header");
    const heading = document.createElement("div");
    heading.className = "card-heading";
    const title = document.createElement("h2");
    title.textContent = source.name || "热榜";
    const state = document.createElement("div");
    state.className = source.ok ? "state" : "state bad";
    state.textContent = source.ok ? "" : (source.error || "更新失败");
    const cardRefresh = document.createElement("button");
    cardRefresh.type = "button";
    cardRefresh.className = "card-refresh";
    cardRefresh.setAttribute("aria-label", `刷新${source.name || "这个热榜"}`);
    cardRefresh.append(refreshIcon());
    cardRefresh.addEventListener("click", () => refreshSource(source.id, cardRefresh, state));
    heading.append(title, state);
    head.append(heading, cardRefresh);
    card.append(head);
    const items = source.items || [];
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "暂无内容";
      card.append(empty);
    } else {
      const list = document.createElement("ol");
      items.forEach((item, index) => {
        const href = safeUrl(item.url);
        if (!href) return;
        const row = document.createElement("li");
        const link = document.createElement("a");
        link.href = href;
        if (settings.linkMode === "blank") {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        link.addEventListener("click", (event) => {
          if (settings.linkMode !== "iframe") return;
          event.preventDefault();
          openPreview(item.title || "", href);
        });
        const rank = document.createElement("span");
        rank.className = "rank";
        rank.textContent = String(index + 1);
        const text = document.createElement("span");
        text.className = "title";
        text.textContent = item.title || "";
        const heat = document.createElement("span");
        heat.className = "heat";
        heat.textContent = item.heat || "";
        link.append(rank, text, heat);
        row.append(link);
        list.append(row);
      });
      const shown = list.children.length;
      const mobile = isMobile();
      const expanded = mobile && shown > 8 && isExpanded(source.id);
      list.classList.toggle("is-collapsed", mobile && shown > 8 && !expanded);
      list.classList.toggle("is-expanded", expanded);
      list.classList.toggle("is-scroll", !mobile);
      card.append(list);
      if (mobile && shown > 8) {
        const fold = document.createElement("button");
        fold.type = "button";
        fold.className = "fold";
        fold.textContent = expanded ? "收起" : `展开其余 ${shown - 8} 条`;
        fold.setAttribute("aria-expanded", expanded ? "true" : "false");
        fold.addEventListener("click", () => toggleFold(source.id));
        card.append(fold);
      }
    }
    grid.append(card);
  }
}

async function refreshSource(sourceId, button, state) {
  if (button.classList.contains("spinning")) return;
  button.classList.add("spinning");
  let replaced = false;
  try {
    const response = await Promise.all([
      fetch(`/hot/refresh?source=${encodeURIComponent(sourceId)}`, {
        method: "POST",
        cache: "no-store",
      }),
      new Promise((resolve) => setTimeout(resolve, 700)),
    ]).then(([result]) => result);
    const body = await response.json().catch(() => ({}));
    if (response.status === 429 || body.status === "limited") {
      state.className = "state bad";
      state.textContent = "请稍后再刷新";
    } else if (body.status === "busy") {
      state.className = "state bad";
      state.textContent = "正在更新";
    } else if (!response.ok) {
      state.className = "state bad";
      state.textContent = "刷新失败";
    } else {
      replaced = true;
      await load();
    }
  } catch (error) {
    state.className = "state bad";
    state.textContent = "刷新失败";
  } finally {
    if (!replaced) button.classList.remove("spinning");
  }
}

async function load() {
  const response = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  render(await response.json());
}

refreshButton.addEventListener("click", async () => {
  if (refreshButton.disabled) return;
  refreshButton.disabled = true;
  refreshButton.classList.add("spinning");
  note.textContent = "";
  try {
    const response = await fetch("/hot/refresh", { method: "POST", cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.status === 429 || body.status === "limited") {
      note.textContent = "一分钟内只能刷新一次";
    } else if (body.status === "busy") {
      note.textContent = "正在更新，先显示当前结果";
    } else if (!response.ok) {
      note.textContent = "刷新失败，先显示当前结果";
    }
    await load();
  } catch (error) {
    note.textContent = "刷新失败";
  } finally {
    refreshButton.disabled = false;
    refreshButton.classList.remove("spinning");
  }
});

settingsButton.addEventListener("click", openDrawer);
drawerClose.addEventListener("click", closeDrawer);
backdrop.addEventListener("click", () => {
  if (!preview.hidden) closePreview();
  closeDrawer();
});
drawer.addEventListener("click", (event) => {
  const button = event.target.closest("[data-setting]");
  if (!button) return;
  updateSetting(button.dataset.setting, button.dataset.value);
});
previewClose.addEventListener("click", closePreview);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!preview.hidden) {
    closePreview();
    return;
  }
  if (!drawer.hidden) closeDrawer();
});
mobileQuery.addEventListener("change", () => {
  if (lastData) render(lastData);
});

buildSourceChecks();
buildSourceBar();
persist();
syncDrawer();
load().catch(() => {
  updated.textContent = "还没有数据";
  note.textContent = "热榜还在准备，过一会儿再打开";
});
