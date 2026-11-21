/* The four-month calendar on the "Is this possible?" page (W10251). page-page.js puts
   <div class="cal" id="calendar-2029"> where the page's markdown says {{CALENDAR}} and
   calls window.renderCalendar with SITE_DATA.calendar, the part built from
   outputs/site-pages/calendar-2029.json, the one file that holds the dates.

   Two views. Overview marks the first day of session, Inauguration Day, the 100th day,
   holidays and recesses, and the package's milestones, a stretch of days on its first and
   last day only. Detailed adds every floor vote,
   day by day: each group's House passage, the Senate's separate final vote on each bill,
   each signing and each Cabinet confirmation. Any day can be selected; the panel under
   the grids says what happens on it.

   Every string from the data is set with textContent, never innerHTML, and nothing sets
   a style attribute: the published Content-Security-Policy allows neither. */
(function () {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"];
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const DAY = 86400000;

  const curl = (s) => String(s).replace(/(\w)'(\w)/g, "$1’$2");
  const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const longDate = (t) => { const d = new Date(t); return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
  const shortDate = (t) => { const d = new Date(t); return `${WEEKDAYS[d.getUTCDay()].slice(0, 3)}., ${MONTHS[d.getUTCMonth()].slice(0, 3)}. ${d.getUTCDate()}`; };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* Everything the data says, indexed by date. Overview events carry view "overview";
     floor votes and signings carry view "detailed". */
  function index(cal, pageOf) {
    const by = new Map();
    const add = (date, ev) => { if (!by.has(date)) by.set(date, []); by.get(date).push(ev); };
    const span = (from, to, fn) => { for (let t = parse(from); t <= parse(to); t += DAY) fn(iso(t)); };
    for (const h of cal.holidays || []) add(h.date, { view: "overview", kind: "holiday", label: h.label });
    for (const n of cal.noSession || []) span(n.from, n.to, (d) => add(d, { view: "overview", kind: "break", label: n.label }));
    // A stretch of days is colored only on its first and last day (W10643); every day in it
    // still names the stretch when selected.
    for (const m of cal.milestones || []) span(m.from, m.to, (d) => add(d, { view: "overview", kind: m.kind, label: m.label,
      marked: d === m.from || d === m.to }));
    for (const s of cal.senate || []) add(s.date, { view: "detailed", chamber: "Senate", kind: s.kind, label: s.label });
    for (const s of cal.house || []) add(s.date, { view: "detailed", chamber: "House", kind: s.kind, label: s.label });
    for (const g of cal.groups || []) {
      const name = curl(g.name), n = g.bills.length, each = n === 1 ? "its bill" : `its ${n} bills, each by its own vote`;
      add(g.house, { view: "detailed", chamber: "House", kind: "house", code: `H${g.n}`,
        label: `Group ${g.n}, ${name}: passes ${each}, under a special rule.` });
      add(g.senate, { view: "detailed", chamber: "Senate", kind: "senate", code: `S${g.n}`,
        label: n === 1 ? `Group ${g.n}, ${name}: one 12-hour period, then the final vote.`
          : `Group ${g.n}, ${name}: one 12-hour period for the group, then a separate final vote on each bill.`,
        bills: g.bills.map((b) => ({ name: curl(b), page: pageOf(b) })) });
      add(g.signed, { view: "detailed", chamber: "President", kind: "signed", code: `P${g.n}`,
        label: g.presented ? `Group ${g.n}, ${name}: held since the Senate vote, presented after noon and signed (${n} ${n === 1 ? "law" : "laws"}).`
          : `Group ${g.n}, ${name}: signed (${n} ${n === 1 ? "law" : "laws"}).` });
    }
    return by;
  }

  /* The days the Senate sits: every weekday from the first day to the last session day,
     less the days with no session, plus the Saturday sittings. */
  function sessionDays(cal) {
    const off = new Set();
    for (const n of cal.noSession || []) for (let t = parse(n.from); t <= parse(n.to); t += DAY) off.add(iso(t));
    const days = new Set(cal.saturdaySittings || []);
    for (let t = parse(cal.convenes); t <= parse(cal.lastSessionDay); t += DAY) {
      const wd = new Date(t).getUTCDay();
      if (wd !== 0 && wd !== 6 && !off.has(iso(t))) days.add(iso(t));
    }
    return days;
  }

  function dayCounts(cal, t) {
    const out = [];
    const congress = Math.round((t - parse(cal.convenes)) / DAY) + 1;
    const last = Math.round((parse(cal.dayHundred) - parse(cal.convenes)) / DAY) + 1;
    if (congress >= 1 && congress <= last) out.push(`Day ${congress} of ${last} for Congress`);
    const pres = Math.round((t - parse(cal.inauguration)) / DAY) + 1;
    if (pres >= 1 && t <= parse(cal.dayHundred)) out.push(`day ${pres} of 100 for the President`);
    return out.join("; ");
  }

  window.renderCalendar = function (root, cal) {
    const agenda = ((window.SITE_DATA || {}).agenda || {}).categories || [];
    const pages = new Map();
    for (const c of agenda) for (const b of c.bills) {
      pages.set(b.name, b.page);
      if (b.display_name) pages.set(b.display_name, b.page);
    }
    const pageOf = (name) => pages.get(name) || pages.get(name.replace(/'/g, "’")) || null;
    const events = index(cal, pageOf);
    const sitting = sessionDays(cal);
    const first = parse(cal.convenes), lastDay = parse(cal.dayHundred);
    let view = "overview", selected = null;
    root.textContent = "";

    // --- the view switch ---------------------------------------------------
    const bar = el("div", "cal-bar");
    const group = el("div", "cal-views");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Calendar view");
    const btns = {};
    for (const [key, label] of [["overview", "Overview"], ["detailed", "Detailed: every vote"]]) {
      const b = el("button", "cal-view-btn", label);
      b.type = "button";
      b.dataset.view = key;
      b.addEventListener("click", () => setView(key));
      btns[key] = b;
      group.appendChild(b);
    }
    bar.appendChild(group);
    const note = el("p", "cal-note");
    bar.appendChild(note);
    root.appendChild(bar);

    // --- the legend ----------------------------------------------------------
    const legend = el("ul", "cal-legend");
    legend.setAttribute("aria-label", "Key");
    for (const [cls, label, onlyDetailed] of [
      ["is-first", "First day of session"], ["is-inauguration", "Inauguration Day"], ["is-hundred", "100th day"],
      ["is-milestone", "Milestone"], ["is-break", "Holiday or recess"],
      ["is-sitting", "Senate in session", true]]) {
      const li = el("li", "cal-legend-item" + (onlyDetailed ? " cal-detailed-only" : ""));
      li.appendChild(el("span", `cal-swatch ${cls}`));
      li.appendChild(document.createTextNode(label));
      legend.appendChild(li);
    }
    { const li = el("li", "cal-legend-item cal-detailed-only");
      li.appendChild(el("span", "cal-code", "S5"));
      li.appendChild(document.createTextNode("Senate votes on group 5; H, the House; P, the President signs"));
      legend.appendChild(li); }
    root.appendChild(legend);

    // --- the four months -----------------------------------------------------
    const grids = el("div", "cal-months");
    const cells = [];
    for (const ym of cal.months) {
      const [y, m] = ym.split("-").map(Number);
      const sec = el("section", "cal-month");
      const h = el("h3", "cal-month-title", `${MONTHS[m - 1]} ${y}`);
      h.id = `cal-${ym}`;
      sec.appendChild(h);
      const table = el("table", "cal-grid");
      table.setAttribute("aria-labelledby", h.id);
      const thead = el("thead"), hr = el("tr");
      for (const wd of WEEKDAYS) {
        const th = el("th", "", wd[0]);
        th.scope = "col";
        th.setAttribute("abbr", wd);
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      table.appendChild(thead);
      const tbody = el("tbody");
      const start = Date.UTC(y, m - 1, 1), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      let row = el("tr");
      for (let i = 0; i < new Date(start).getUTCDay(); i++) row.appendChild(el("td", "cal-empty"));
      for (let d = 1; d <= days; d++) {
        const t = Date.UTC(y, m - 1, d), date = iso(t);
        const td = el("td");
        const evs = events.get(date) || [];
        const kinds = new Set(evs.filter((e) => e.view === "overview").map((e) => e.kind));
        const b = el("button", "cal-day");
        b.type = "button";
        b.dataset.date = date;
        if (t < first || t > lastDay) b.classList.add("is-outside");
        if (kinds.has("first")) b.classList.add("is-first");
        if (kinds.has("inauguration")) b.classList.add("is-inauguration");
        if (kinds.has("hundred")) b.classList.add("is-hundred");
        if (evs.some((e) => e.kind === "milestone" && e.marked)) b.classList.add("is-milestone");
        if (kinds.has("holiday") || kinds.has("break")) b.classList.add("is-break");
        if (sitting.has(date)) b.classList.add("is-sitting");
        b.appendChild(el("span", "cal-num", String(d)));
        const codes = evs.filter((e) => e.code).map((e) => e.code);
        if (codes.length) b.appendChild(el("span", "cal-codes cal-detailed-only", codes.join(" ")));
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", () => select(date));
        cells.push(b);
        td.appendChild(b);
        row.appendChild(td);
        if (new Date(t).getUTCDay() === 6) { tbody.appendChild(row); row = el("tr"); }
      }
      if (row.children.length) {
        while (row.children.length < 7) row.appendChild(el("td", "cal-empty"));
        tbody.appendChild(row);
      }
      table.appendChild(tbody);
      sec.appendChild(table);
      grids.appendChild(sec);
    }
    root.appendChild(grids);

    // --- the selected day ----------------------------------------------------
    const panel = el("div", "cal-panel");
    panel.setAttribute("aria-live", "polite");
    root.appendChild(panel);

    // --- every vote, day by day (detailed view only) -------------------------
    const list = el("section", "cal-list cal-detailed-only");
    const lh = el("h3", "cal-list-title", "Every vote, day by day");
    lh.id = "cal-list-title";
    list.setAttribute("aria-labelledby", lh.id);
    list.appendChild(lh);
    const ol = el("ol", "cal-days");
    const dated = [...events.keys()].filter((d) => events.get(d).some((e) => e.view === "detailed")).sort();
    for (const date of dated) {
      const li = el("li", "cal-days-item");
      li.dataset.date = date;
      li.appendChild(el("p", "cal-days-date", `${shortDate(parse(date))} (${dayCounts(cal, parse(date))})`));
      li.appendChild(eventList(events.get(date).filter((e) => e.view === "detailed")));
      ol.appendChild(li);
    }
    list.appendChild(ol);
    root.appendChild(list);

    function eventList(evs) {
      const ul = el("ul", "cal-events");
      for (const e of evs) {
        const li = el("li", `cal-event cal-event-${e.kind}`);
        if (e.chamber) li.appendChild(el("strong", "cal-chamber", `${e.chamber}. `));
        li.appendChild(document.createTextNode(curl(e.label)));
        if (e.bills) {
          const bl = el("ul", "cal-bills");
          for (const bill of e.bills) {
            const bi = el("li");
            if (bill.page) {
              const a = el("a", "", bill.name);
              a.href = `law.html?bill=${encodeURIComponent(bill.page)}`;
              bi.appendChild(a);
            } else bi.textContent = bill.name;
            bi.appendChild(document.createTextNode(": final vote"));
            bl.appendChild(bi);
          }
          li.appendChild(bl);
        }
        ul.appendChild(li);
      }
      return ul;
    }

    function drawPanel() {
      panel.textContent = "";
      if (!selected) {
        panel.appendChild(el("p", "cal-panel-hint", "Select a day to see what happens on it."));
        return;
      }
      const t = parse(selected);
      const head = el("p", "cal-panel-date", longDate(t));
      panel.appendChild(head);
      const counts = dayCounts(cal, t);
      if (counts) panel.appendChild(el("p", "cal-panel-count", counts + "."));
      const evs = (events.get(selected) || []).filter((e) => view === "detailed" || e.view === "overview");
      const seen = new Set();
      const shown = evs.filter((e) => { const k = e.kind + e.label; if (seen.has(k)) return false; seen.add(k); return true; });
      if (shown.length) panel.appendChild(eventList(shown));
      else if (t < first || t > lastDay) panel.appendChild(el("p", "", "Outside the hundred days."));
      else if (view === "detailed" && sitting.has(selected)) panel.appendChild(el("p", "", "The Senate sits. No vote is set for this day in the example; it is held for debate, procedural votes and anything that slips."));
      else if (view === "detailed") panel.appendChild(el("p", "", "No session."));
      else panel.appendChild(el("p", "", "No milestone on this day. The detailed view shows every vote."));
    }

    function select(date) {
      selected = date;
      for (const c of cells) c.setAttribute("aria-pressed", c.dataset.date === date ? "true" : "false");
      drawPanel();
    }

    function setView(key) {
      view = key;
      root.classList.toggle("is-detailed", key === "detailed");
      for (const [k, b] of Object.entries(btns)) b.setAttribute("aria-pressed", k === key ? "true" : "false");
      for (const d of root.querySelectorAll(".cal-detailed-only")) d.hidden = key !== "detailed";
      note.textContent = key === "detailed"
        ? "An example for staff: the plan fixes the week of each vote; the day within the week is illustrative. Each bill gets its own final vote and becomes its own law."
        : "The plan’s milestones. Switch to the detailed view for every vote, day by day.";
      for (const c of cells) {
        const date = c.dataset.date;
        const evs = (events.get(date) || []).filter((e) => key === "detailed" || e.view === "overview");
        const uniq = [...new Set(evs.map((e) => (e.chamber ? e.chamber + ": " : "") + curl(e.label)))];
        c.setAttribute("aria-label", `${longDate(parse(date))}${uniq.length ? ". " + uniq.join(" ") : ""}`);
      }
      drawPanel();
    }

    setView("overview");
  };
})();
