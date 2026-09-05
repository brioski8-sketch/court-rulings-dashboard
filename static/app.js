/* ---- court-rulings-dashboard frontend ----
   Filterable, sortable rulings table (title, summary, court, date,
   importance) rendered client-side. Data comes from /api/rulings (reads the
   pipeline's rulings_*.jsonl snapshots). */

function getJSON(url) {
  return fetch(url).then(res => {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

let courtRulings = [];
let courtState = {
  sort: "importance", dir: "desc",
  q: "", court: "", from: "", to: "", minImportance: 0, PAGE_SIZE: 50, page: 1,
};

const COURT_LABELS = {
  scc: "Supreme Court of Canada",
  fca: "Federal Court of Appeal",
  fct: "Federal Court",
  onca: "Ont. Court of Appeal",
  onsc: "Ont. Superior Court",
  onscdc: "Ont. S.C. (Div. Court)",
  oncj: "Ont. Court of Justice",
};

function arxivShortSummary(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
}

function tr_append(tr, cells) { for (const c of cells) tr.appendChild(c); }

function courtApplyFilters() {
  const st = courtState;
  const q = st.q.trim().toLowerCase();
  let list = courtRulings.filter(p => {
    if (q && !(p.title.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q))) return false;
    if (st.court && p.court !== st.court) return false;
    if (st.from && p.date < st.from) return false;
    if (st.to && p.date > st.to) return false;
    if (st.minImportance > 0 && (p.importance || 0) < st.minImportance) return false;
    return true;
  });
  const dir = st.dir === "asc" ? 1 : -1;
  const key = st.sort;
  list.sort((a, b) => {
    let va, vb;
    if (key === "date") { va = a.date; vb = b.date; }
    else if (key === "court") { va = a.court; vb = b.court; }
    else if (key === "importance") { va = a.importance || 0; vb = b.importance || 0; }
    else { va = (a.title || "").toLowerCase(); vb = (b.title || "").toLowerCase(); }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
  return list;
}

function courtRenderTable() {
  const w = document.getElementById("widget-court");
  if (!w) return;
  const host = w.querySelector(".court-pane-rulings");
  if (!host) return;
  for (const n of [...host.querySelectorAll(".src, .arxiv-table, .arxiv-pager")]) n.remove();
  const body = host;
  const st = courtState;
  const list = courtApplyFilters();

  const count = document.createElement("div");
  count.className = "src";
  const total = courtRulings.length;
  count.textContent = `${list.length} of ${total} rulings` +
    (list.length ? ` · showing ${Math.min(st.page, Math.max(1, Math.ceil(list.length / st.PAGE_SIZE))) * st.PAGE_SIZE - st.PAGE_SIZE + 1}–${Math.min(list.length, st.page * st.PAGE_SIZE)}` : "");
  body.appendChild(count);

  const tbl = document.createElement("table");
  tbl.className = "arxiv-table court-table";

  const cols = [
    { key: "title", label: "Title" },
    { key: null, label: "Summary" },
    { key: "court", label: "Court" },
    { key: "date", label: "Date" },
    { key: "importance", label: "Importance" },
  ];
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const c of cols) {
    const th = document.createElement("th");
    if (c.key) {
      th.className = "sortable";
      th.textContent = (st.sort === c.key ? (st.dir === "asc" ? "▲ " : "▼ ") : "") + c.label;
      th.addEventListener("click", () => {
        if (st.sort === c.key) st.dir = st.dir === "asc" ? "desc" : "asc";
        else { st.sort = c.key; st.dir = "desc"; }
        st.page = 1;
        courtRenderTable();
      });
    } else th.textContent = c.label;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  tbl.appendChild(thead);

  const tbody = document.createElement("tbody");
  const start = (st.page - 1) * st.PAGE_SIZE;
  for (const p of list.slice(start, start + st.PAGE_SIZE)) {
    const tr = document.createElement("tr");
    const tdTitle = document.createElement("td");
    tdTitle.className = "arxiv-title";
    const a = document.createElement("a");
    a.href = p.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = p.title || p.url;
    tdTitle.appendChild(a);
    const tdSum = document.createElement("td");
    tdSum.className = "arxiv-summary";
    tdSum.title = p.summary || "";
    tdSum.textContent = arxivShortSummary(p.summary, 180);
    const tdCourt = document.createElement("td");
    tdCourt.className = "arxiv-cats court-court";
    tdCourt.textContent = COURT_LABELS[p.court] || p.court;
    const tdDate = document.createElement("td");
    tdDate.textContent = p.date;
    const tdImp = document.createElement("td");
    tdImp.className = "arxiv-score";
    tdImp.textContent = p.importance || 0;
    if ((p.importance || 0) >= 16) tdImp.classList.add("hot");
    else if ((p.importance || 0) >= 10) tdImp.classList.add("warm");
    tr_append(tr, [tdTitle, tdSum, tdCourt, tdDate, tdImp]);
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  body.appendChild(tbl);

  const pages = Math.max(1, Math.ceil(list.length / st.PAGE_SIZE));
  if (pages > 1) {
    const pager = document.createElement("div");
    pager.className = "arxiv-pager";
    const prev = document.createElement("button");
    prev.textContent = "‹ Prev";
    prev.disabled = st.page <= 1;
    prev.onclick = () => { st.page--; courtRenderTable(); };
    const next = document.createElement("button");
    next.textContent = "Next ›";
    next.disabled = st.page >= pages;
    next.onclick = () => { st.page++; courtRenderTable(); };
    const lbl = document.createElement("span");
    lbl.textContent = ` page ${st.page} / ${pages} `;
    pager.appendChild(prev); pager.appendChild(lbl); pager.appendChild(next);
    body.appendChild(pager);
  }
}

function courtFilterBar() {
  const bar = document.createElement("div");
  bar.className = "arxiv-filters";
  const mk = (labelText, el) => {
    const wrap = document.createElement("label");
    wrap.className = "arxiv-filter";
    const span = document.createElement("span");
    span.textContent = labelText;
    wrap.appendChild(span);
    wrap.appendChild(el);
    bar.appendChild(wrap);
    return el;
  };
  const q = document.createElement("input");
  q.type = "search"; q.placeholder = "keyword…";
  q.value = courtState.q;
  let qT; q.addEventListener("input", () => {
    clearTimeout(qT);
    qT = setTimeout(() => { courtState.q = q.value; courtState.page = 1; courtRenderTable(); }, 250);
  });
  mk("Keyword", q);

  const court = document.createElement("select");
  const courts = [...new Set(courtRulings.map(p => p.court))].sort();
  court.appendChild(new Option("All courts", ""));
  for (const c of courts) court.appendChild(new Option(COURT_LABELS[c] || c, c));
  court.value = courtState.court;
  court.addEventListener("change", () => { courtState.court = court.value; courtState.page = 1; courtRenderTable(); });
  mk("Court", court);

  const from = document.createElement("input");
  from.type = "date"; from.value = courtState.from;
  from.addEventListener("change", () => { courtState.from = from.value; courtState.page = 1; courtRenderTable(); });
  mk("From", from);

  const to = document.createElement("input");
  to.type = "date"; to.value = courtState.to;
  to.addEventListener("change", () => { courtState.to = to.value; courtState.page = 1; courtRenderTable(); });
  mk("To", to);

  const ms = document.createElement("select");
  ms.appendChild(new Option("Any importance", "0"));
  for (const v of [5, 10, 16, 20]) ms.appendChild(new Option("≥ " + v, String(v)));
  ms.value = String(courtState.minImportance);
  ms.addEventListener("change", () => { courtState.minImportance = parseInt(ms.value, 10) || 0; courtState.page = 1; courtRenderTable(); });
  mk("Min importance", ms);

  const reset = document.createElement("button");
  reset.textContent = "Reset";
  reset.onclick = () => {
    courtState = { ...courtState, q: "", court: "", from: "", to: "", minImportance: 0, page: 1 };
    courtRenderTable();
  };
  bar.appendChild(reset);
  return bar;
}

async function loadCourt() {
  const w = document.getElementById("widget-court");
  const body = w.querySelector(".widget-body");
  try {
    const d = await getJSON("/api/rulings");
    if (d.error) { body.textContent = "Source unavailable: " + d.error; return; }
    courtRulings = d.rulings || [];
    document.getElementById("ruling-count").textContent = d.count + " rulings";
    body.textContent = "";

    const strip = document.createElement("div");
    strip.className = "arxiv-tabs";
    const tabRulings = document.createElement("button");
    tabRulings.type = "button"; tabRulings.className = "tab active"; tabRulings.textContent = "Rulings";
    const tabBriefing = document.createElement("button");
    tabBriefing.type = "button"; tabBriefing.className = "tab"; tabBriefing.textContent = "Weekly Briefing";
    const paneRulings = document.createElement("div");
    paneRulings.className = "court-pane-rulings";
    const paneBriefing = document.createElement("div");
    paneBriefing.className = "court-pane-briefing";
    paneBriefing.hidden = true;
    function show(tab) {
      paneRulings.hidden = tab !== "rulings";
      paneBriefing.hidden = tab !== "briefing";
      tabRulings.classList.toggle("active", tab === "rulings");
      tabBriefing.classList.toggle("active", tab === "briefing");
    }
    tabRulings.onclick = () => show("rulings");
    tabBriefing.onclick = () => show("briefing");
    strip.appendChild(tabRulings); strip.appendChild(tabBriefing);
    body.appendChild(strip);
    paneRulings.appendChild(courtFilterBar());
    body.appendChild(paneRulings);

    // briefing pane (previous widget content)
    let b = [];
    try {
      const bd = await getJSON("/api/briefing");
      b = bd.briefings || [];
    } catch (e) { /* keep empty */ }
    for (const f of b.slice(0, 3)) {
      const det = document.createElement("details");
      const sum = document.createElement("summary");
      sum.textContent = f.name;
      const pre = document.createElement("pre");
      pre.className = "scrollable";
      pre.textContent = f.preview;
      det.appendChild(sum); det.appendChild(pre);
      paneBriefing.appendChild(det);
    }
    if (!b.length) paneBriefing.textContent = "No court briefings found yet.";
    body.appendChild(paneBriefing);
    courtRenderTable();
  } catch (err) {
    body.textContent = "Source unavailable: " + err.message;
  }
}

function loadBriefingPanel() {
  const widget = document.getElementById("widget-briefing");
  if (!widget) return;
  const body = widget.querySelector(".widget-body");
  getJSON("/api/briefing").then(d => {
    if (d.error) { body.textContent = "Source unavailable: " + d.error; return; }
    body.textContent = "";
    for (const f of (d.briefings || []).slice(0, 4)) {
      const det = document.createElement("details");
      const sum = document.createElement("summary");
      sum.textContent = f.name;
      const pre = document.createElement("pre");
      pre.className = "scrollable";
      pre.textContent = f.preview;
      det.appendChild(sum); det.appendChild(pre);
      body.appendChild(det);
    }
    if (!d.briefings.length) body.textContent = "No court briefings found yet.";
  }).catch(err => { body.textContent = "Source unavailable: " + err.message; });
}

async function refresh() {
  await loadCourt();
  loadBriefingPanel();
  document.getElementById("last-refresh").textContent = "refreshed " + new Date().toLocaleTimeString();
}
refresh();
setInterval(refresh, 1800000);