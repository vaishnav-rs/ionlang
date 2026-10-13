import { renderMarkdown, escapeHtml } from "/markdown.js";

/* ───────────── tiny helpers ───────────── */
const $ = (s, root = document) => root.querySelector(s);
const el = (tag, cls = "", html = "") => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html) n.innerHTML = html;
  return n;
};

const ICONS = {
  plus: "M12 5v14M5 12h14",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  auto: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  menu: "M4 6h16M4 12h16M4 18h16",
  volume: "M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  download: "M12 4v11M7 11l5 5 5-5M4 20h16",
  mic: "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  "arrow-up": "M12 19V5M6 11l6-6 6 6",
  "arrow-down": "M12 5v14M6 13l6 6 6-6",
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  copy: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  check: "M5 12.5l4.5 4.5L19 7",
  chevron: "M9 6l6 6-6 6",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  terminal: "M4 17l6-5-6-5M12 19h8",
  mail: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 7l9 6 9-6",
  users: "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM21 20v-1a4 4 0 0 0-3-3.9M16 3.2a3.5 3.5 0 0 1 0 6.8",
  box: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  alert: "M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  refresh: "M20 11a8 8 0 1 0-2.3 6.7M20 4v7h-7",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  keyboard: "M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10",
  message: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ""}"/></svg>`;
const hydrateIcons = (root = document) => root.querySelectorAll("[data-icon]").forEach((n) => (n.innerHTML = icon(n.dataset.icon)));

const safe = (fn) => { try { return fn(); } catch { return undefined; } };
const store = {
  get: (k) => safe(() => localStorage.getItem(k)),
  set: (k, v) => safe(() => localStorage.setItem(k, v)),
  del: (k) => safe(() => localStorage.removeItem(k))
};

function agentColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 52% 46%)`;
}
function avatar(name, small = false) {
  const a = el("span", `avatar${small ? " sm" : ""}`);
  a.style.setProperty("--c", agentColor(name));
  a.textContent = (name[0] || "?").toUpperCase();
  a.setAttribute("aria-hidden", "true");
  return a;
}
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtMs = (ms) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`);
const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ───────────── state & elements ───────────── */
const app = $("#app");
const scroller = $("#scroller");
const thread = $("#thread");
const input = $("#composer-input");
const sendBtn = $("#send-btn");
const micBtn = $("#mic-btn");
const mentionsEl = $("#mentions");

const STORE_KEY = `ion.chat.${location.port || "80"}`;
const state = {
  ws: null, agents: [], entry: null, config: {}, turn: null, queue: [], items: [],
  stick: true, speak: false, retry: 0, dropped: false, everConnected: false,
  confirms: [], expandAll: false, working: new Map(), titleBase: "Ion"
};

const TOOL_META = {
  read_file: { icon: "file", ing: "Reading", done: "Read" },
  write_file: { icon: "file", ing: "Writing", done: "Wrote" },
  list_files: { icon: "file", ing: "Listing files in", done: "Listed files in" },
  fetch_url: { icon: "globe", ing: "Fetching", done: "Fetched" },
  browse_page: { icon: "globe", ing: "Browsing", done: "Browsed" },
  run_command: { icon: "terminal", ing: "Running", done: "Ran" },
  search_gmail: { icon: "mail", ing: "Searching Gmail for", done: "Searched Gmail for" },
  read_gmail_message: { icon: "mail", ing: "Reading email", done: "Read email" }
};
const GRANT_META = {
  "file-access": { icon: "file", text: "access files" },
  "web-browsing": { icon: "globe", text: "browse the web" },
  "shell-exec": { icon: "terminal", text: "run a command" },
  "gmail-access": { icon: "mail", text: "read your Gmail" },
  "orchestration-powers": { icon: "users", text: "delegate to teammates" }
};

/* ───────────── scrolling ───────────── */
function atBottom() { return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 110; }
function followScroll() {
  if (state.stick) scroller.scrollTop = scroller.scrollHeight;
  updateJump();
}
function updateJump() { $("#jump").hidden = state.stick || thread.children.length === 0; }
scroller.addEventListener("scroll", () => { state.stick = atBottom(); updateJump(); }, { passive: true });
$("#jump").addEventListener("click", () => { state.stick = true; scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" }); });
function syncEmpty() { scroller.classList.toggle("is-empty", thread.children.length === 0); }

/* ───────────── toasts ───────────── */
function toast(text, ms = 2600) {
  const t = el("div", "toast");
  t.textContent = text;
  $("#toasts").append(t);
  setTimeout(() => t.remove(), ms);
}

/* ───────────── theme ───────────── */
const THEMES = ["auto", "light", "dark"];
function currentTheme() { const t = store.get("ion.theme"); return THEMES.includes(t) ? t : "auto"; }
function applyTheme(t) {
  if (t === "auto") { document.documentElement.removeAttribute("data-theme"); store.del("ion.theme"); }
  else { document.documentElement.dataset.theme = t; store.set("ion.theme", t); }
  $("#theme-btn [data-icon]").innerHTML = icon(t === "dark" ? "moon" : t === "light" ? "sun" : "auto");
  $("#theme-label").textContent = t[0].toUpperCase() + t.slice(1);
}
function cycleTheme() { applyTheme(THEMES[(THEMES.indexOf(currentTheme()) + 1) % 3]); }

/* ───────────── roster / sidebar ───────────── */
function capsFor(a) {
  const caps = [];
  for (const g of a.grants || []) if (GRANT_META[g]) caps.push(`<span title="${escapeHtml(GRANT_META[g].text)}">${icon(GRANT_META[g].icon)}${escapeHtml(GRANT_META[g].text)}</span>`);
  for (const t of a.tools || []) caps.push(`<span>${icon("box")}${escapeHtml(t)}</span>`);
  if (a.teammates?.length) caps.push(`<span>${icon("users")}leads ${a.teammates.length}</span>`);
  return caps.join("");
}
function renderRoster() {
  const ul = $("#roster");
  ul.innerHTML = "";
  for (const a of state.agents) {
    const li = el("li");
    const b = el("button", "agent-card");
    b.type = "button";
    b.dataset.agent = a.name;
    b.dataset.working = "false";
    b.title = `Message ${a.name} directly`;
    const av = avatar(a.name);
    av.append(el("i", "dot"));
    const meta = el("div", "meta");
    meta.innerHTML = `<div class="name">${escapeHtml(a.name)}${a.entry ? '<span class="tag">entry</span>' : a.team ? '<span class="tag">team</span>' : ""}</div>` +
      (a.role ? `<div class="caps" style="color:var(--text-2)">${escapeHtml(trunc(a.role, 70))}</div>` : "") +
      `<div class="caps">${capsFor(a) || "General conversation"}</div>`;
    b.append(av, meta);
    b.addEventListener("click", () => { mention(a.name); closeDrawer(); });
    li.append(b);
    ul.append(li);
  }
  const people = state.agents.filter((a) => !a.team).length;
  $("#side-sub").textContent = state.agents.length > 1
    ? `${people} agent${people === 1 ? "" : "s"} · ${state.entry} leads`
    : state.entry ? `${state.entry}` : "Ready";
}
function setWorking(agent, on) {
  const n = Math.max(0, (state.working.get(agent) || 0) + (on ? 1 : -1));
  state.working.set(agent, n);
  const card = $(`.agent-card[data-agent="${CSS.escape(agent)}"]`);
  if (card) card.dataset.working = String(n > 0);
}
function clearWorking() {
  state.working.clear();
  document.querySelectorAll(".agent-card").forEach((c) => (c.dataset.working = "false"));
}
function closeDrawer() { app.dataset.drawer = "closed"; }
$("#menu-btn").addEventListener("click", () => (app.dataset.drawer = "open"));
$("#scrim").addEventListener("click", closeDrawer);

/* ───────────── suggestions / empty state ───────────── */
function renderEmpty() {
  const entry = state.agents.find((a) => a.name === state.entry);
  const related = [entry, ...state.agents.filter((a) => entry?.teammates?.includes(a.name))].filter(Boolean);
  const grants = new Set(related.flatMap((a) => a.grants || []));
  const sug = [];
  if (grants.has("web-browsing")) sug.push(["globe", "Research the latest news about a topic I care about"]);
  if (grants.has("file-access")) sug.push(["file", "What files can you see? Give me a quick tour"]);
  if (grants.has("shell-exec")) sug.push(["terminal", "Show me what's in the current directory"]);
  if (grants.has("gmail-access")) sug.push(["mail", "Summarize my unread emails from today"]);
  if (entry?.teammates?.length) sug.push(["users", "Who is on your team and what is each person good at?"]);
  sug.push(["spark", "What can you help me with?"]);
  sug.push(["message", "Tell me something interesting"]);
  const box = $("#suggestions");
  box.innerHTML = "";
  for (const [ic, text] of sug.slice(0, 4)) {
    const b = el("button", "suggestion", `${icon(ic)}<span></span>`);
    b.type = "button";
    $("span", b).textContent = text;
    b.addEventListener("click", () => { input.value = text; resizeInput(); submit(); });
    box.append(b);
  }
  $("#empty-name").textContent = state.entry && state.agents.length > 1 ? `${state.entry}'s team` : state.entry || "I";
}

/* ───────────── message rendering ───────────── */
function pushItem(item) {
  state.items.push(item);
  store.set(STORE_KEY, JSON.stringify(state.items.slice(-80)));
}
function addDivider(text) {
  const d = el("div", "divider");
  d.textContent = text;
  thread.append(d);
  syncEmpty();
  followScroll();
}
function addUserMessage(text, { addressed, queued = false, t = Date.now() } = {}) {
  const m = el("div", `msg user${queued ? " queued" : ""}`);
  const b = el("div", "bubble");
  b.textContent = text;
  m.append(b);
  if (addressed || queued) {
    const tag = el("div", "tagline");
    tag.textContent = queued ? "Queued · sends when the team is free" : `→ ${addressed}`;
    m.append(tag);
  }
  thread.append(m);
  syncEmpty();
  state.stick = true;
  followScroll();
  return m;
}
function buildAgentMsg(agent, t = Date.now()) {
  const msg = el("div", "msg agent");
  const col = el("div", "col");
  const head = el("div", "msg-head");
  const who = el("span", "who");
  who.textContent = agent;
  const time = el("time");
  time.textContent = fmtTime(t);
  head.append(who, time);
  const body = el("div", "md");
  col.append(head, body);
  msg.append(avatar(agent, true), col);
  return { msg, col, body, time };
}
function addActions(col, text, { error = false, retryText } = {}) {
  const row = el("div", "msg-actions");
  const mk = (ic, label, fn) => {
    const b = el("button", "icon-btn", icon(ic));
    b.type = "button"; b.title = label; b.setAttribute("aria-label", label);
    b.addEventListener("click", () => fn(b));
    row.append(b);
  };
  mk("copy", "Copy", async (b) => {
    try { await navigator.clipboard.writeText(text); b.innerHTML = icon("check"); setTimeout(() => (b.innerHTML = icon("copy")), 1400); }
    catch { toast("Couldn't copy"); }
  });
  if ("speechSynthesis" in window && !error) mk("volume", "Read aloud", () => speakText(text, true));
  if (retryText) mk("refresh", "Try again", () => submitText(retryText));
  col.append(row);
}

/* code-block copy buttons (event delegation) */
thread.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  const code = btn.closest(".code-block")?.querySelector("code")?.textContent ?? "";
  try { await navigator.clipboard.writeText(code); btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy"), 1400); }
  catch { toast("Couldn't copy"); }
});

/* ───────────── turns & activity timeline ───────────── */
function startTurn(userText, addressed) {
  const agent = state.entry || "Ion";
  const m = buildAgentMsg(agent);
  m.body.innerHTML = '<div class="typing" aria-label="Working"><i></i><i></i><i></i></div>';
  thread.append(m.msg);
  const turn = {
    userText, addressed, ...m, agent, startedAt: performance.now(), status: "Thinking", stepCount: 0, openSteps: [],
    pendingNote: new Map(), activity: null, stepsEl: null, labelEl: null, agentsSeen: new Set([agent]), timer: null
  };
  state.turn = turn;
  setWorking(agent, true);
  turn.timer = setInterval(() => refreshLabel(turn), 1000);
  followScroll();
  return turn;
}

function ensureActivity(turn) {
  if (turn.activity) return;
  const a = el("div", "activity");
  a.dataset.state = "working";
  a.dataset.open = "true";
  const head = el("button", "activity-head", `<span class="orb"></span><span class="label"></span><span class="chev">${icon("chevron")}</span>`);
  head.type = "button";
  head.setAttribute("aria-expanded", "true");
  head.addEventListener("click", () => {
    const open = a.dataset.open !== "true";
    a.dataset.open = String(open);
    head.setAttribute("aria-expanded", String(open));
  });
  const steps = el("ol", "steps");
  a.append(head, steps);
  turn.col.insertBefore(a, turn.body);
  turn.activity = a;
  turn.stepsEl = steps;
  turn.labelEl = $(".label", head);
  turn.headEl = head;
  refreshLabel(turn);
}

function refreshLabel(turn, doneState) {
  if (!turn.labelEl) return;
  const elapsed = performance.now() - turn.startedAt;
  if (doneState) {
    const n = turn.stepCount;
    const others = turn.agentsSeen.size - 1;
    turn.labelEl.textContent = doneState === "failed"
      ? `Stopped after ${fmtMs(elapsed)}`
      : `Worked for ${fmtMs(elapsed)} · ${n} step${n === 1 ? "" : "s"}${others > 0 ? ` · ${others + 1} agents` : ""}`;
  } else {
    turn.labelEl.textContent = `${turn.status} · ${Math.floor(elapsed / 1000)}s`;
  }
}
function setStatus(turn, text, activityState = "working") {
  turn.status = text;
  if (turn.activity) turn.activity.dataset.state = activityState;
  refreshLabel(turn);
}

function parseArgs(detail) {
  try { const v = JSON.parse(detail); return v && typeof v === "object" ? v : { value: String(v) }; }
  catch { return { value: detail }; }
}
function summarize(args) {
  const v = args.path ?? args.url ?? args.command ?? args.query ?? args.message_id ?? args.task ?? Object.values(args).find((x) => typeof x === "string") ?? "";
  return trunc(String(v), 90);
}

function addStep(turn, { agent, ic, verb, arg, raw, handoffTo }) {
  ensureActivity(turn);
  turn.agentsSeen.add(agent);
  if (handoffTo) turn.agentsSeen.add(handoffTo);
  turn.stepCount++;
  const li = el("li", "step");
  li.dataset.status = "running";
  const chip = (n) => `<span class="agent-chip" style="--c:${agentColor(n)}">${escapeHtml(n)}</span>`;
  li.innerHTML =
    `<span class="ico">${icon(ic)}</span><div><div class="line">${chip(agent)}` +
    (handoffTo ? `${icon("arrow-right").replace('class="i"', 'class="i" style="width:13px;height:13px;color:var(--text-3)"')}${chip(handoffTo)}` : "") +
    `<span class="what"></span>${arg ? '<code class="arg"></code>' : ""}<span class="dur"></span></div></div>`;
  $(".what", li).textContent = verb;
  if (arg) $(".arg", li).textContent = arg;
  const detailsHost = $("div", li);
  if (raw) {
    const d = el("details");
    d.innerHTML = "<summary>Details</summary><pre></pre>";
    $("pre", d).textContent = raw;
    detailsHost.append(d);
  }
  turn.stepsEl.append(li);
  followScroll();
  return li;
}

function onToolCall(msg) {
  const turn = state.turn;
  if (!turn) return;
  flushNote(turn, msg.agent);
  const args = parseArgs(msg.detail);
  let step;
  if (msg.tool.startsWith("delegate_to_")) {
    const to = msg.tool.slice("delegate_to_".length);
    step = addStep(turn, { agent: msg.agent, ic: "users", verb: "handed off", arg: trunc(String(args.task ?? msg.detail), 100), raw: String(args.task ?? msg.detail), handoffTo: to });
    setStatus(turn, `${msg.agent} is working with ${to}`);
    setWorking(to, true);
    step.dataset.handoff = to;
  } else {
    const meta = TOOL_META[msg.tool] || { icon: "box", ing: `Using ${msg.tool}`, done: `Used ${msg.tool}` };
    step = addStep(turn, { agent: msg.agent, ic: meta.icon, verb: meta.ing, arg: summarize(args), raw: JSON.stringify(args, null, 2) });
    step.dataset.doneVerb = meta.done;
    setStatus(turn, `${msg.agent} is ${meta.ing.toLowerCase()}${summarize(args) ? " " + trunc(summarize(args), 40) : ""}`);
    setWorking(msg.agent, true);
  }
  step.dataset.tool = msg.tool;
  step.dataset.agent = msg.agent;
  turn.openSteps.push(step);
}

function onToolResult(msg) {
  const turn = state.turn;
  if (!turn) return;
  const idx = [...turn.openSteps].reverse().findIndex((s) => s.dataset.tool === msg.tool && s.dataset.agent === msg.agent);
  if (idx < 0) return;
  const step = turn.openSteps.splice(turn.openSteps.length - 1 - idx, 1)[0];
  step.dataset.status = msg.isError ? "error" : "ok";
  $(".dur", step).textContent = fmtMs(msg.ms);
  const what = $(".what", step);
  if (step.dataset.doneVerb) what.textContent = msg.isError ? `${step.dataset.doneVerb} (failed)` : step.dataset.doneVerb;
  else if (what.textContent === "handed off" && msg.isError) what.textContent = "hand-off failed";
  $(".ico", step).innerHTML = icon(msg.isError ? "alert" : "check");
  if (msg.result) {
    let d = $("details", step);
    if (!d) { d = el("details"); d.innerHTML = "<summary>Details</summary>"; $("div", step).append(d); }
    const label = el("div"); label.style.cssText = "font-size:12px;color:var(--text-3);margin-top:8px";
    label.textContent = msg.isError ? "Error" : "Result";
    const pre = el("pre"); pre.textContent = msg.result;
    d.append(label, pre);
  }
  setWorking(step.dataset.handoff || msg.agent, false);
  setStatus(turn, "Thinking");
}

/** Text an agent writes before calling a tool is shown as a quiet note in the timeline. */
function onChunk(msg) {
  const turn = state.turn;
  if (!turn || !msg.text) return;
  turn.pendingNote.set(msg.agent, msg.text);
}
function flushNote(turn, agent) {
  const text = turn.pendingNote.get(agent);
  if (!text) return;
  turn.pendingNote.delete(agent);
  ensureActivity(turn);
  const li = el("li", "step");
  li.dataset.status = "ok";
  li.innerHTML = `<span class="ico">${icon("message")}</span><div><div class="line"><span class="agent-chip" style="--c:${agentColor(agent)}"></span><span class="what note"></span></div></div>`;
  $(".agent-chip", li).textContent = agent;
  $(".note", li).textContent = trunc(text.replace(/\s+/g, " "), 220);
  turn.stepsEl.append(li);
}

/* permission requests */
function onConfirm(msg) {
  const turn = state.turn || startTurn("", undefined);
  ensureActivity(turn);
  const meta = GRANT_META[msg.grant] || { icon: "shield", text: `use ${msg.grant}` };
  const card = el("div", "confirm");
  card.setAttribute("role", "alertdialog");
  card.setAttribute("aria-label", "Permission request");
  card.innerHTML = `<div class="q">${icon("shield")}<div><strong></strong> wants to ${escapeHtml(meta.text)}.<code></code></div></div>` +
    `<div class="btns"><button class="allow" type="button">Allow <kbd>Y</kbd></button><button class="deny" type="button">Deny <kbd>N</kbd></button></div>`;
  $("strong", card).textContent = msg.agent;
  $("code", card).textContent = msg.detail;
  const entry = { respond: null };
  entry.respond = (ok) => {
    state.ws?.send(JSON.stringify({ type: "confirm_response", confirmId: msg.confirmId, ok }));
    state.confirms = state.confirms.filter((c) => c !== entry);
    card.className = "confirm resolved";
    card.innerHTML = `${ok ? "Allowed" : "Denied"}: <strong></strong> ${ok ? "was allowed to" : "was not allowed to"} ${escapeHtml(meta.text)}.`;
    $("strong", card).textContent = msg.agent;
    if (!state.confirms.length) {
      document.title = state.titleBase;
      if (state.turn) setStatus(state.turn, "Thinking");
    }
  };
  $(".allow", card).addEventListener("click", () => entry.respond(true));
  $(".deny", card).addEventListener("click", () => entry.respond(false));
  state.confirms.push(entry);
  turn.col.insertBefore(card, turn.body);
  setStatus(turn, "Waiting for your permission", "waiting");
  document.title = `⚠ Permission needed · ${state.titleBase}`;
  followScroll();
  $(".allow", card).focus({ preventScroll: true });
}

function finishTurn(text, { error = false } = {}) {
  const turn = state.turn;
  state.turn = null;
  if (!turn) {
    const m = buildAgentMsg(state.entry || "Ion");
    thread.append(m.msg);
    m.body.innerHTML = renderMarkdown(text);
    addActions(m.col, text, { error });
    pushItem({ role: "agent", agent: state.entry, text, t: Date.now(), error });
    followScroll();
    return;
  }
  clearInterval(turn.timer);
  const doneState = error ? "failed" : "done";
  if (turn.activity) {
    turn.activity.dataset.state = doneState;
    const open = state.expandAll;
    turn.activity.dataset.open = String(open);
    turn.headEl.setAttribute("aria-expanded", String(open));
    if (error) turn.openSteps.forEach((s) => { s.dataset.status = "error"; });
    refreshLabel(turn, doneState);
  }
  state.confirms.forEach((c) => c.respond(false));
  turn.msg.classList.toggle("error", error);
  turn.body.innerHTML = renderMarkdown(text || "_(no reply)_");
  turn.time.textContent = fmtTime(Date.now());
  addActions(turn.col, text, { error, retryText: error ? turn.userText : undefined });
  clearWorking();
  pushItem({ role: "agent", agent: turn.agent, text, t: Date.now(), error, steps: turn.stepCount });
  followScroll();
  if (!error && state.speak) speakText(text);
  if (document.hidden) document.title = `● Reply ready · ${state.titleBase}`;
  next();
}

function next() {
  const q = state.queue.shift();
  if (!q) return;
  q.el?.classList.remove("queued");
  $(".tagline", q.el)?.remove();
  dispatch(q.text);
}

/* ───────────── sending ───────────── */
function detectAddressed(text) {
  const m = text.trim().match(/^@([a-zA-Z0-9_-]+)\b/);
  return m && state.agents.some((a) => a.name === m[1]) ? m[1] : undefined;
}
function dispatch(text) {
  const ws = state.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) { toast("Not connected yet. Retrying…"); return false; }
  const addressed = detectAddressed(text);
  window.speechSynthesis?.cancel();
  ws.send(JSON.stringify({ type: "message", text, addressedTo: addressed }));
  startTurn(text, addressed);
  return true;
}
function submitText(text) {
  text = text.trim();
  if (!text) return;
  const addressed = detectAddressed(text);
  pushItem({ role: "user", text, t: Date.now() });
  if (state.turn) {
    const e = addUserMessage(text, { addressed, queued: true });
    state.queue.push({ text, el: e });
    return;
  }
  const e = addUserMessage(text, { addressed });
  if (!dispatch(text)) { e.remove(); state.items.pop(); input.value = text; resizeInput(); syncEmpty(); }
}
function submit() {
  const text = input.value;
  if (!text.trim()) return;
  input.value = "";
  resizeInput();
  hideMentions();
  submitText(text);
}
$("#composer").addEventListener("submit", (e) => { e.preventDefault(); submit(); });

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
  sendBtn.disabled = !input.value.trim();
}

/* ───────────── @mentions ───────────── */
let mentionIdx = 0;
function mention(name) {
  const rest = input.value.replace(/^@[\w-]*\s*/, "");
  input.value = `@${name} ${rest}`;
  resizeInput();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  hideMentions();
}
function mentionCandidates() {
  const m = input.value.slice(0, input.selectionStart).match(/^@([\w-]*)$/);
  if (!m) return null;
  return state.agents.filter((a) => a.name.toLowerCase().startsWith(m[1].toLowerCase()));
}
function showMentions() {
  const list = mentionCandidates();
  if (!list || !list.length) return hideMentions();
  mentionIdx = Math.min(mentionIdx, list.length - 1);
  mentionsEl.innerHTML = "";
  list.forEach((a, i) => {
    const b = el("button", "mention");
    b.type = "button";
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", String(i === mentionIdx));
    b.append(avatar(a.name, true));
    const n = el("span"); n.textContent = a.name;
    const s = el("small"); s.textContent = a.entry ? "entry" : a.isOrchestrator ? "lead" : "";
    b.append(n, s);
    b.addEventListener("mousedown", (e) => { e.preventDefault(); mention(a.name); });
    mentionsEl.append(b);
  });
  mentionsEl.hidden = false;
}
function hideMentions() { mentionsEl.hidden = true; mentionIdx = 0; }

input.addEventListener("input", () => { resizeInput(); showMentions(); });
input.addEventListener("keydown", (e) => {
  if (!mentionsEl.hidden) {
    const list = mentionCandidates() || [];
    if (e.key === "ArrowDown") { e.preventDefault(); mentionIdx = (mentionIdx + 1) % list.length; showMentions(); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); mentionIdx = (mentionIdx - 1 + list.length) % list.length; showMentions(); return; }
    if ((e.key === "Enter" || e.key === "Tab") && list[mentionIdx]) { e.preventDefault(); mention(list[mentionIdx].name); return; }
    if (e.key === "Escape") { e.preventDefault(); hideMentions(); return; }
  }
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
});
input.addEventListener("blur", () => setTimeout(hideMentions, 120));

/* ───────────── voice ───────────── */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
function setupVoiceIn() {
  if (!SR || !state.config.input?.includes("voice")) return;
  micBtn.hidden = false;
  recognizer = new SR();
  recognizer.interimResults = true;
  recognizer.continuous = false;
  let finalText = "";
  recognizer.onresult = (e) => {
    let interim = "";
    finalText = "";
    for (const r of e.results) (r.isFinal ? (finalText += r[0].transcript) : (interim += r[0].transcript));
    input.value = (finalText + interim).trim();
    resizeInput();
  };
  recognizer.onend = () => {
    micBtn.classList.remove("recording");
    micBtn.setAttribute("aria-label", "Dictate");
    if (finalText.trim()) submit();
    finalText = "";
  };
  recognizer.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") toast(`Voice input: ${e.error}`); };
  micBtn.addEventListener("click", () => {
    if (micBtn.classList.contains("recording")) { recognizer.stop(); return; }
    window.speechSynthesis?.cancel();
    try { recognizer.start(); micBtn.classList.add("recording"); micBtn.setAttribute("aria-label", "Stop dictation"); } catch { /* already started */ }
  });
}
function speakText(text, force = false) {
  if (!("speechSynthesis" in window) || (!state.speak && !force)) return;
  const plain = text.replace(/```[\s\S]*?```/g, " code block ").replace(/[`*_#>|]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(plain));
}
function setSpeak(on) {
  state.speak = on;
  const b = $("#speak-toggle");
  b.setAttribute("aria-pressed", String(on));
  store.set("ion.speak", on ? "1" : "0");
  if (!on) window.speechSynthesis?.cancel();
}
$("#speak-toggle").addEventListener("click", () => setSpeak(!state.speak));

/* ───────────── export / new chat / history ───────────── */
function exportChat() {
  if (!state.items.length) return toast("Nothing to export yet");
  const lines = [`# Conversation with ${state.entry || "Ion"}`, ""];
  for (const it of state.items) {
    lines.push(it.role === "user" ? `**You** · ${new Date(it.t).toLocaleString()}` : `**${it.agent || "Agent"}** · ${new Date(it.t).toLocaleString()}`, "", it.text, "");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const a = el("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ion-chat-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function clearChat() {
  clearInterval(state.turn?.timer);
  state.turn = null; state.queue = []; state.items = []; state.confirms = [];
  store.del(STORE_KEY);
  thread.innerHTML = "";
  clearWorking();
  document.title = state.titleBase;
  syncEmpty();
  updateJump();
}
function newChat() {
  clearChat();
  if (state.ws) { state.ws._manual = true; state.ws.close(); }
  connect();
  input.focus();
  toast("Started a new chat");
}
$("#new-chat").addEventListener("click", () => { newChat(); closeDrawer(); });
$("#export-btn").addEventListener("click", exportChat);
$("#theme-btn").addEventListener("click", cycleTheme);
function toggleAllActivity() {
  state.expandAll = !state.expandAll;
  document.querySelectorAll(".activity").forEach((a) => {
    a.dataset.open = String(state.expandAll);
    $(".activity-head", a).setAttribute("aria-expanded", String(state.expandAll));
  });
  toast(state.expandAll ? "Showing all activity" : "Activity collapsed");
}
$("#collapse-btn").addEventListener("click", toggleAllActivity);

function restoreHistory() {
  let items = [];
  try { items = JSON.parse(store.get(STORE_KEY) || "[]"); } catch { /* ignore */ }
  if (!Array.isArray(items) || !items.length) return;
  state.items = items;
  for (const it of items) {
    if (it.role === "user") addUserMessage(it.text, { t: it.t });
    else {
      const m = buildAgentMsg(it.agent || state.entry || "Ion", it.t);
      m.msg.classList.toggle("error", !!it.error);
      m.body.innerHTML = renderMarkdown(it.text);
      addActions(m.col, it.text, { error: it.error });
      thread.append(m.msg);
    }
  }
  thread.querySelectorAll(".msg").forEach((m) => (m.style.animation = "none"));
  addDivider("Earlier conversation · the agents start fresh and won't remember it");
  state.stick = true;
  scroller.scrollTop = scroller.scrollHeight;
}

/* ───────────── command palette ───────────── */
const palette = $("#palette");
const pInput = $("#palette-input");
const pList = $("#palette-list");
let pItems = [];
let pIdx = 0;
function paletteActions() {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % 3];
  const acts = [
    { label: "New chat", icon: "plus", hint: "Ctrl+Shift+O", run: newChat },
    { label: `Switch theme to ${next}`, icon: next === "dark" ? "moon" : "sun", run: cycleTheme },
    { label: "Export chat as Markdown", icon: "download", run: exportChat },
    { label: "Expand or collapse all activity", icon: "layers", run: toggleAllActivity },
    { label: "Keyboard shortcuts", icon: "keyboard", run: () => $("#help").showModal() },
    { label: "Clear saved history", icon: "trash", run: () => { clearChat(); toast("History cleared"); } }
  ];
  if ("speechSynthesis" in window) acts.splice(3, 0, { label: `Read replies aloud: turn ${state.speak ? "off" : "on"}`, icon: "volume", run: () => setSpeak(!state.speak) });
  for (const a of state.agents) acts.push({ label: `Message ${a.name} directly`, icon: "users", hint: a.entry ? "entry" : "", run: () => mention(a.name) });
  return acts;
}
function renderPalette() {
  const q = pInput.value.trim().toLowerCase();
  pItems = paletteActions().filter((a) => !q || a.label.toLowerCase().includes(q));
  pIdx = Math.min(pIdx, Math.max(0, pItems.length - 1));
  pList.innerHTML = "";
  if (!pItems.length) { pList.innerHTML = '<li class="none">No matching commands</li>'; return; }
  pItems.forEach((a, i) => {
    const li = el("li", "", `${icon(a.icon)}<span></span>${a.hint ? "<small></small>" : ""}`);
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === pIdx));
    $("span", li).textContent = a.label;
    if (a.hint) $("small", li).textContent = a.hint;
    li.addEventListener("click", () => runPalette(i));
    li.addEventListener("mousemove", () => { if (pIdx !== i) { pIdx = i; renderPalette(); } });
    pList.append(li);
  });
  $('[aria-selected="true"]', pList)?.scrollIntoView({ block: "nearest" });
}
function openPalette() { pInput.value = ""; pIdx = 0; palette.hidden = false; renderPalette(); pInput.focus(); }
function closePalette() { palette.hidden = true; input.focus(); }
function runPalette(i) { const a = pItems[i]; closePalette(); a?.run(); }
pInput.addEventListener("input", () => { pIdx = 0; renderPalette(); });
pInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); pIdx = (pIdx + 1) % Math.max(1, pItems.length); renderPalette(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); pIdx = (pIdx - 1 + pItems.length) % Math.max(1, pItems.length); renderPalette(); }
  else if (e.key === "Enter") { e.preventDefault(); runPalette(pIdx); }
});
palette.addEventListener("mousedown", (e) => { if (e.target === palette) closePalette(); });
$("#palette-btn").addEventListener("click", openPalette);

/* ───────────── global keyboard ───────────── */
document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palette.hidden ? openPalette() : closePalette(); return; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); newChat(); return; }
  if (e.key === "Escape") {
    if (!palette.hidden) closePalette();
    else if (recognizer && micBtn.classList.contains("recording")) recognizer.stop();
    else closeDrawer();
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (state.confirms.length && (e.key === "y" || e.key === "Y")) { e.preventDefault(); state.confirms[0].respond(true); return; }
  if (state.confirms.length && (e.key === "n" || e.key === "N")) { e.preventDefault(); state.confirms[0].respond(false); return; }
  if (e.key === "/") { e.preventDefault(); input.focus(); }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden && !state.confirms.length) document.title = state.titleBase; });

/* ───────────── connection ───────────── */
function setConn(stateName, text) {
  $("#conn").dataset.state = stateName;
  $("#conn-text").textContent = text;
}
function connect() {
  setConn("connecting", state.everConnected ? "Reconnecting" : "Connecting");
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/stream`);
  state.ws = ws;
  ws.addEventListener("open", () => {
    setConn("open", "Connected");
    state.retry = 0;
    if (state.dropped) { addDivider("Reconnected · the agents' short-term memory restarted"); state.dropped = false; }
    state.everConnected = true;
  });
  ws.addEventListener("close", () => {
    if (ws._manual) return;
    setConn("closed", "Disconnected");
    state.dropped = state.everConnected;
    if (state.turn) finishTurn("Error: the connection to the server was lost before a reply arrived.", { error: true });
    const delay = Math.min(1000 * 2 ** state.retry++, 8000);
    setTimeout(() => state.ws === ws && connect(), delay);
  });
  ws.addEventListener("message", (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === "chunk") onChunk(msg);
    else if (msg.type === "tool_call") onToolCall(msg);
    else if (msg.type === "tool_result") onToolResult(msg);
    else if (msg.type === "confirm_required") onConfirm(msg);
    else if (msg.type === "final") finishTurn(msg.text, { error: /^Error:/.test(msg.text) });
  });
}

/* ───────────── boot ───────────── */
async function boot() {
  hydrateIcons();
  applyTheme(currentTheme());
  resizeInput();
  app.dataset.drawer = "closed";

  try { state.config = await (await fetch("/config")).json(); } catch { state.config = {}; }
  try { state.agents = await (await fetch("/agents")).json(); } catch { state.agents = []; }
  state.entry = state.config.entry || state.agents.find((a) => a.entry)?.name || state.agents[0]?.name || null;
  state.titleBase = state.entry ? `Ion · ${state.entry}` : "Ion";
  document.title = state.titleBase;
  $("#title").textContent = state.entry || "Ion";
  $("#composer-input").placeholder = state.entry
    ? state.agents.length > 1 ? `Message ${state.entry}'s team…` : `Message ${state.entry}…`
    : "Message the team…";

  if ("speechSynthesis" in window) {
    $("#speak-toggle").hidden = false;
    const saved = store.get("ion.speak");
    setSpeak(saved === null || saved === undefined ? !!state.config.output?.includes("voice") : saved === "1");
  }
  renderRoster();
  renderEmpty();
  setupVoiceIn();
  restoreHistory();
  syncEmpty();
  connect();
  if (matchMedia("(hover: hover)").matches) input.focus(); // avoid popping the keyboard on phones
}
boot();
