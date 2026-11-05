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
  { id: "toutiao", name: "头条", short: "头", color: "#f85959" },
  { id: "douyin", name: "抖音", short: "抖", color: "#fe2c55" },
  { id: "huxiu", name: "虎嗅", short: "虎", color: "#ff6a00" },
  { id: "smzdm", name: "值得买", short: "值", color: "#e4393c" },
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
    fontSize: 14,
    cardWidth: 300,
    cardHeight: 360,
    sideSpace: 0,
    stealth: false,
    clipOverflow: false,
    showLogo: false,
    showCategories: false,
    showToday: false,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const normalized = normalizeSources(raw.sources, raw.sourcesSeen);
    const mobileSource = raw.mobileSource === "today" || normalized.sources.includes(raw.mobileSource)
      ? raw.mobileSource
      : normalized.sources[0];
    return {
      linkMode: raw.linkMode === "iframe" ? "iframe" : defaults.linkMode,
      showHeat: raw.showHeat === false ? false : defaults.showHeat,
      listMode: raw.listMode === "expanded" ? "expanded" : defaults.listMode,
      sources: normalized.sources,
      sourcesSeen: normalized.seen,
      mobileSource,
      fontSize: readNumber(raw.fontSize, 12, 20, defaults.fontSize),
      cardWidth: readNumber(raw.cardWidth, 240, 400, defaults.cardWidth),
      cardHeight: readNumber(raw.cardHeight, 240, 680, defaults.cardHeight),
      sideSpace: readNumber(raw.sideSpace, 0, 240, defaults.sideSpace),
      stealth: raw.stealth === true,
      clipOverflow: raw.clipOverflow === true,
      showLogo: raw.showLogo === true,
      showCategories: raw.showCategories === true,
      showToday: raw.showToday === true,
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
  const known = new Set(seenIds);
  const newcomers = all.filter((id) => !known.has(id) && !picked.includes(id));
  const sources = [...picked, ...newcomers];
  return { sources: sources.length ? sources : all, seen: all };
}

const NUMBER_LIMITS = {
  fontSize: [12, 20, 1],
  cardWidth: [240, 400, 10],
  cardHeight: [240, 680, 20],
  sideSpace: [0, 240, 8],
};

function readNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function persist() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applyHeat() {
  document.documentElement.dataset.heat = settings.showHeat ? "on" : "off";
}

function applyAppearance() {
  document.documentElement.dataset.stealth = settings.stealth ? "on" : "off";
  const style = document.documentElement.style;
  style.setProperty("--list-size", `${settings.fontSize}px`);
  style.setProperty("--card-width", `${settings.cardWidth}px`);
  style.setProperty("--card-height", `${settings.cardHeight}px`);
  style.setProperty("--side-space", `${settings.sideSpace}px`);
  style.setProperty("--grid-max", `${5 * settings.cardWidth + 4 * 14 + 40}px`);
  for (const key of Object.keys(NUMBER_LIMITS)) {
    const stepper = document.querySelector(`[data-number="${key}"]`);
    if (!stepper) continue;
    const [min, max] = NUMBER_LIMITS[key];
    stepper.querySelector("span").textContent = String(settings[key]);
    stepper.querySelector("[data-dir='-1']").disabled = settings[key] <= min;
    stepper.querySelector("[data-dir='1']").disabled = settings[key] >= max;
  }
  const themeName = document.querySelector("#theme-name");
  if (themeName) themeName.textContent = document.documentElement.dataset.theme === "light" ? "浅色" : "暗夜";
}

function changeNumber(key, direction) {
  const [min, max, step] = NUMBER_LIMITS[key];
  settings[key] = Math.min(max, Math.max(min, settings[key] + direction * step));
  persist();
  applyAppearance();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  themeButton.setAttribute("aria-label", isDark ? "切换到浅色" : "切换到深色");
  localStorage.setItem(THEME_KEY, theme);
  applyAppearance();
}

themeButton.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
applyHeat();
applyAppearance();

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.round(hours / 24)}天前`;
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
  const byId = new Map(sources.map((source) => [source.id, source]));
  return settings.sources.map((id) => byId.get(id)).filter(Boolean);
}

function catalogItem(sourceId) {
  return CATALOG.find((item) => item.id === sourceId) || null;
}

function todaySource(sources) {
  const items = [];
  for (const source of sources) {
    const first = (source.items || []).find((item) => safeUrl(item.url));
    if (!first) continue;
    const name = catalogItem(source.id)?.name || source.name || "";
    items.push({ ...first, title: name ? `${name} · ${first.title}` : first.title });
    if (items.length >= 30) break;
  }
  const times = sources.map((source) => Date.parse(source.updatedAt)).filter((time) => !Number.isNaN(time));
  return {
    id: "today",
    name: "今日热门",
    ok: true,
    updatedAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    items,
  };
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
  const items = settings.sources.map((id) => catalogItem(id)).filter(Boolean);
  if (settings.showToday) items.unshift({ id: "today", name: "今日", short: "今", color: "#ffb020" });
  for (const item of items) {
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
  if (["stealth", "clipOverflow", "showLogo", "showCategories", "showToday"].includes(key)) {
    return settings[key] ? "on" : "off";
  }
  return settings[key];
}

function syncDrawer() {
  buildSourceChecks();
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
  const next = settings.sources.filter((id) => id !== sourceId);
  if (checked) next.push(sourceId);
  if (!next.length) return false;
  settings.sources = next;
  if (settings.mobileSource !== "today" && !settings.sources.includes(settings.mobileSource)) {
    settings.mobileSource = settings.sources[0];
  }
  persist();
  syncDrawer();
  if (lastData) render(lastData);
  else buildSourceBar();
  return true;
}

function moveSource(sourceId, delta) {
  const index = settings.sources.indexOf(sourceId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= settings.sources.length) return;
  const next = settings.sources.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  settings.sources = next;
  persist();
  syncDrawer();
  if (lastData) render(lastData);
  else buildSourceBar();
}

function buildSourceChecks() {
  const box = document.querySelector("#source-checks");
  box.replaceChildren();
  const enabled = new Set(settings.sources);
  const items = [
    ...settings.sources.map((id) => catalogItem(id)).filter(Boolean),
    ...CATALOG.filter((item) => !enabled.has(item.id)),
  ];
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "order-row";
    row.dataset.source = item.id;
    const grip = document.createElement("span");
    grip.className = "grip";
    grip.setAttribute("aria-hidden", "true");
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = item.id;
    input.checked = enabled.has(item.id);
    input.addEventListener("change", () => {
      if (!toggleSource(item.id, input.checked)) input.checked = true;
    });
    const text = document.createElement("span");
    text.textContent = item.name;
    label.append(input, text);
    const up = document.createElement("button");
    up.type = "button";
    up.className = "nudge";
    up.textContent = "↑";
    up.setAttribute("aria-label", `${item.name}上移`);
    up.disabled = !enabled.has(item.id) || settings.sources[0] === item.id;
    up.addEventListener("click", () => moveSource(item.id, -1));
    const down = document.createElement("button");
    down.type = "button";
    down.className = "nudge";
    down.textContent = "↓";
    down.setAttribute("aria-label", `${item.name}下移`);
    down.disabled = !enabled.has(item.id) || settings.sources[settings.sources.length - 1] === item.id;
    down.addEventListener("click", () => moveSource(item.id, 1));
    row.append(grip, label, up, down);
    box.append(row);
  });
}

const sourceChecks = document.querySelector("#source-checks");
let suppressRowClick = false;
let dragState = null;

sourceChecks.addEventListener("click", (event) => {
  if (!suppressRowClick) return;
  event.preventDefault();
  event.stopPropagation();
  suppressRowClick = false;
}, true);

sourceChecks.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || dragState) return;
  const row = event.target.closest(".order-row");
  if (!row || event.target.closest("button, input")) return;
  if (!row.querySelector("input").checked) return;
  const startX = event.clientX;
  const startY = event.clientY;
  let armed = true;
  const disarm = () => {
    armed = false;
    row.removeEventListener("pointermove", watchMove);
    row.removeEventListener("pointerup", watchEnd);
    row.removeEventListener("pointercancel", watchEnd);
  };
  const timer = setTimeout(() => {
    if (!armed) return;
    disarm();
    startRowDrag(row, event.pointerId, startX, startY);
  }, 320);
  function watchMove(ev) {
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
      clearTimeout(timer);
      disarm();
    }
  }
  function watchEnd() {
    clearTimeout(timer);
    disarm();
  }
  row.addEventListener("pointermove", watchMove);
  row.addEventListener("pointerup", watchEnd);
  row.addEventListener("pointercancel", watchEnd);
});

function startRowDrag(row, pointerId, clientX, clientY) {
  const rect = row.getBoundingClientRect();
  const ghost = row.cloneNode(true);
  ghost.className = "order-row drag-ghost";
  ghost.querySelectorAll("button, input").forEach((control) => {
    control.disabled = true;
  });
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  document.body.append(ghost);
  row.classList.add("is-origin");
  suppressRowClick = true;
  dragState = {
    row,
    ghost,
    pointerId,
    offsetX: clientX - rect.left,
    offsetY: clientY - rect.top,
    anchor: row.nextElementSibling,
    locked: false,
  };
  try { row.setPointerCapture(pointerId); } catch (error) {}
  document.addEventListener("pointermove", moveRowDrag, { passive: false });
  document.addEventListener("pointerup", endRowDrag);
  document.addEventListener("pointercancel", endRowDrag);
}

function moveRowDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  event.preventDefault();
  dragState.ghost.style.left = `${event.clientX - dragState.offsetX}px`;
  dragState.ghost.style.top = `${event.clientY - dragState.offsetY}px`;
  settleDragRow(event.clientY);
}

function settleDragRow(pointerY) {
  if (!dragState || dragState.locked) return;
  const origin = dragState.row;
  const checked = [...sourceChecks.querySelectorAll(".order-row")].filter((row) => {
    return row !== origin && row.querySelector("input").checked;
  });
  let before = null;
  for (const row of checked) {
    const rect = row.getBoundingClientRect();
    if (pointerY < rect.top + rect.height / 2) {
      before = row;
      break;
    }
  }
  const unchecked = [...sourceChecks.querySelectorAll(".order-row")].find((row) => !row.querySelector("input").checked);
  const anchor = before || unchecked || null;
  if (anchor === dragState.anchor) return;
  if (origin.nextElementSibling === anchor) return;
  if (!anchor && origin === sourceChecks.lastElementChild) return;
  dragState.anchor = anchor;
  dragState.locked = true;
  const nodes = [...sourceChecks.children];
  const first = new Map(nodes.map((node) => [node, node.getBoundingClientRect()]));
  sourceChecks.insertBefore(origin, anchor);
  for (const node of sourceChecks.children) {
    const start = first.get(node);
    if (!start || node === origin) continue;
    const dy = start.top - node.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) continue;
    node.style.transition = "none";
    node.style.transform = `translateY(${dy}px)`;
  }
  sourceChecks.offsetHeight;
  for (const node of sourceChecks.children) {
    if (!node.style.transform) continue;
    node.style.transition = "";
    node.style.transform = "";
  }
  setTimeout(() => {
    if (dragState) dragState.locked = false;
  }, 180);
}

function endRowDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  document.removeEventListener("pointermove", moveRowDrag);
  document.removeEventListener("pointerup", endRowDrag);
  document.removeEventListener("pointercancel", endRowDrag);
  dragState.ghost.remove();
  dragState.row.classList.remove("is-origin");
  const order = [...sourceChecks.querySelectorAll(".order-row input:checked")].map((input) => input.value);
  dragState = null;
  if (order.join() === settings.sources.join()) return;
  settings.sources = order;
  persist();
  syncDrawer();
  if (lastData) render(lastData);
  else buildSourceBar();
}

function updateSetting(key, value) {
  if (["showHeat", "stealth", "clipOverflow", "showLogo", "showCategories", "showToday"].includes(key)) {
    settings[key] = value === "on";
  } else settings[key] = value;
  if (key === "showToday" && !settings.showToday && settings.mobileSource === "today") {
    settings.mobileSource = settings.sources[0];
  }
  if (key === "listMode") {
    expandedIds.clear();
    collapsedIds.clear();
  }
  persist();
  applyHeat();
  applyAppearance();
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

function buildCategories(sources) {
  const bar = document.querySelector("#categories");
  bar.replaceChildren();
  bar.hidden = !settings.showCategories;
  if (!settings.showCategories) return;
  const chips = settings.showToday ? [todaySource(sources), ...sources] : sources;
  for (const source of chips) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cat-chip";
    button.textContent = source.name || "热榜";
    if (isMobile() && source.id === settings.mobileSource) button.classList.add("active");
    button.addEventListener("click", () => {
      if (isMobile()) {
        selectSource(source.id);
        return;
      }
      document.querySelector(`[data-source="${source.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    bar.append(button);
  }
}

function render(data) {
  lastData = data;
  const when = formatTime(data.updatedAt);
  updated.textContent = when ? `更新于 ${when}` : "还没有数据";
  const sources = enabledSources(data.sources || []);
  const today = settings.showToday ? todaySource(sources) : null;
  const mobileSource = settings.showToday && settings.mobileSource === "today"
    ? today
    : sourceForMobile(sources);
  const visible = isMobile() ? [mobileSource].filter(Boolean) : (today ? [today, ...sources] : sources);
  buildSourceBar();
  buildCategories(sources);
  highlightSource(isMobile() ? mobileSource && mobileSource.id : settings.mobileSource);
  grid.replaceChildren();
  for (const source of visible) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.source = source.id || "";
    const head = document.createElement("header");
    const heading = document.createElement("div");
    heading.className = "card-heading";
    const brand = catalogItem(source.id) || (source.id === "today" ? { short: "今", color: "#ffb020" } : null);
    if (settings.showLogo && brand) {
      const logo = document.createElement("span");
      logo.className = "card-logo";
      logo.textContent = brand.short;
      logo.style.background = brand.color;
      heading.append(logo);
    }
    const titleWrap = document.createElement("div");
    titleWrap.className = "title-wrap";
    const title = document.createElement("h2");
    title.textContent = source.name || "热榜";
    titleWrap.append(title);
    const ago = relativeTime(source.updatedAt);
    if (ago) {
      const time = document.createElement("span");
      time.className = "ago";
      time.textContent = ago;
      titleWrap.append(time);
    }
    const state = document.createElement("div");
    state.className = source.ok ? "state" : "state bad";
    state.textContent = source.ok ? "" : (source.error || "更新失败");
    heading.append(titleWrap, state);
    if (source.id !== "today") {
      const cardRefresh = document.createElement("button");
      cardRefresh.type = "button";
      cardRefresh.className = "card-refresh";
      cardRefresh.setAttribute("aria-label", `刷新${source.name || "这个热榜"}`);
      cardRefresh.append(refreshIcon());
      cardRefresh.addEventListener("click", () => refreshSource(source.id, cardRefresh, state));
      head.append(heading, cardRefresh);
    } else {
      head.append(heading);
    }
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
      const clip = settings.clipOverflow;
      const expanded = mobile && !clip && shown > 8 && isExpanded(source.id);
      list.classList.toggle("is-collapsed", mobile && shown > 8 && !expanded);
      list.classList.toggle("is-expanded", expanded);
      list.classList.toggle("is-scroll", !mobile && !clip);
      list.classList.toggle("is-clip", !mobile && clip);
      card.append(list);
      if (mobile && shown > 8 && !clip) {
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

document.querySelector("#theme-stepper").addEventListener("click", (event) => {
  if (!event.target.closest("[data-theme-step]")) return;
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
settingsButton.addEventListener("click", openDrawer);
drawerClose.addEventListener("click", closeDrawer);
backdrop.addEventListener("click", () => {
  if (!preview.hidden) closePreview();
  closeDrawer();
});
drawer.addEventListener("click", (event) => {
  if (suppressRowClick) {
    event.preventDefault();
    event.stopPropagation();
    suppressRowClick = false;
    return;
  }
  const step = event.target.closest("[data-dir]");
  const stepper = step && step.closest("[data-number]");
  if (stepper) {
    changeNumber(stepper.dataset.number, Number(step.dataset.dir));
    return;
  }
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
