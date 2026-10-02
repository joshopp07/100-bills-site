/* The progress page (W2144). Reads SITE_DATA.progress, which
   Website/scripts/build_progress.py generates from the derived stage status and
   the effort weights. Each bill shows its phase and its percent of the way to
   final text; opening it shows every step, and selecting a step shows its
   one-line explanation (hovering shows it too). The cost estimate and the
   explanation steps are waiting by design and are shown that way, never as
   behind. Everything rendered here is text or a percent: no inline script, no
   handler attributes, so the published CSP holds. */
(function () {
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);

  // State codes from build_progress.py, each with a symbol and a word so the
  // state never rests on color alone. "e" is a step an earlier review covered
  // (2026-10-01); "x" is a step that genuinely does not apply to the bill.
  const STATE = {
    d: { mark: "✓", word: "Done" },
    e: { mark: "✓", word: "Done in an earlier review" },
    p: { mark: "◐", word: "Under way" },
    q: { mark: "◔", word: "Prepared, awaiting review" },
    n: { mark: "○", word: "Not started" },
    u: { mark: "○", word: "Not yet confirmed" },
    x: { mark: "–", word: "Does not apply" },
    k: { mark: "‖", word: "Waiting by design" },
  };

  const CHEVRON = `<svg class="progress-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`;

  function meter(pct, label) {
    const v = Math.max(0, Math.min(100, pct));
    return `<span class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="${esc(label)}" title="${esc(label)}: ${v}%">
      <span class="meter-fill" data-pct="${v}"></span></span>`;
  }

  /* The menu label of a How page, from nav.js, so a step's link uses the same
     words as the menu. */
  function howLabel(slug) {
    const h = (window.HOW_PAGES || []).find((x) => x.slug === slug);
    return h ? h.label : "";
  }

  function stageList(p, bill) {
    return p.sections.map((sec) => {
      const items = sec.stages.map((s) => {
        const code = bill.states.charAt(s.n - 1) || "u";
        const st = STATE[code] || STATE.u;
        const frac = code === "p" && bill.partial[String(s.n)] != null
          ? ` (${Math.round(100 * bill.partial[String(s.n)])}%)` : "";
        // The explanation is filled in when the step is selected or hovered, not
        // written into every row: 47 steps on each of 103 bills.
        return `<li class="stage stage-${code}"><span class="stage-mark" aria-hidden="true">${st.mark}</span>
          <button type="button" class="stage-label" data-n="${s.n}" aria-expanded="false">${esc(s.label)}</button>
          <span class="stage-state">${esc(st.word)}${frac}</span></li>`;
      }).join("");
      // Under the playlist's h2 (the bill row itself is a summary, not a heading).
      const head = `<h3 class="stage-section">${esc(sec.label)}${sec.parked ? ` <span class="stage-parked">waiting by design</span>` : ""}</h3>`;
      const milestone = sec.stages.some((s) => s.n === p.milestone.after_stage)
        ? `<li class="stage-milestone">${esc(p.milestone.label)}</li>` : "";
      return `${head}<ul class="stage-list">${items}${milestone}</ul>`;
    }).join("");
  }

  /* The agenda entry behind a progress row. build_progress.py writes the rows in the
     agenda's order, under its display name with a curly apostrophe; the name is checked
     so a reordering cannot pair a row with the wrong entry. */
  function agendaEntry(family, i, bill) {
    const cat = window.AGENDA.categories().find((c) => c.slug === family.slug);
    if (!cat) return null;
    const shown = (b) => String(b.display_name || b.name).replace(/'/g, "’");
    return [cat.bills[i], ...cat.bills].find((b) => b && shown(b) === bill.name) || null;
  }

  /* Each row carries its bill card's id, so a card links straight to it, and the
     status pill and, for the three measures that are not bills, the kind pill the
     card shows. */
  function billRow(p, bill, labels, entry) {
    const A = window.AGENDA;
    const id = entry ? ` id="${esc(A.cardId(entry))}"` : "";
    const pills = entry
      ? `<span class="pill-status pill-${esc(entry.status)}">${esc(A.statusLabel(entry.status))}</span>` +
        (!A.counted(entry) && entry.kind ? `<span class="pill-kind" title="Not counted among the 100">${esc(entry.kind)}</span>` : "")
      : "";
    const phase = bill.phase === "M" ? p.milestone.label : labels[bill.phase] || "";
    const next = bill.next ? labels.stage[bill.next].text : "";
    const name = bill.slug
      ? `<a href="law.html?bill=${esc(bill.slug)}">${esc(bill.name)}</a>` : esc(bill.name);
    const queued = bill.queued
      ? ` ${bill.queued} step${bill.queued > 1 ? "s are" : " is"} prepared and await${bill.queued > 1 ? "" : "s"} review.` : "";
    return `<li class="progress-bill"${id}>
      <details>
        <summary>
          ${CHEVRON}
          <span class="progress-bill-head"><span class="progress-bill-name">${esc(bill.name)}</span>${pills}</span>
          <span class="progress-bill-phase">${esc(phase)}</span>
          ${meter(bill.pct, bill.name)}
          <span class="progress-pct">${bill.pct}%</span>
        </summary>
        <div class="progress-detail">
          <p class="progress-next">${bill.slug ? `Read the bill: ${name}. ` : ""}${next ? `Next step: ${esc(next)}.` : `Every step to ${esc(p.milestone.label.toLowerCase())} is done.`}${queued}</p>
          ${stageList(p, bill)}
        </div>
      </details>
    </li>`;
  }

  /* One handler for every step on the page. Selecting a step opens its
     explanation below it, with a link to the How page that covers it; hovering
     shows the explanation as a tooltip. */
  function wireStages(body, labels) {
    body.addEventListener("click", (e) => {
      const btn = e.target.closest(".stage-label");
      if (!btn) return;
      const li = btn.closest(".stage");
      const open = li.querySelector(".stage-explain");
      if (open) {
        open.remove();
        btn.setAttribute("aria-expanded", "false");
        return;
      }
      const s = labels.stage[btn.dataset.n] || {};
      const more = s.how && howLabel(s.how)
        ? ` <a href="page.html?p=${esc(s.how)}">More: ${esc(howLabel(s.how))}</a>` : "";
      li.insertAdjacentHTML("beforeend", `<p class="stage-explain">${esc(s.explain)}${more}</p>`);
      btn.setAttribute("aria-expanded", "true");
    });
    body.addEventListener("mouseover", (e) => {
      const btn = e.target.closest && e.target.closest(".stage-label");
      if (btn && !btn.title) btn.title = (labels.stage[btn.dataset.n] || {}).explain || "";
    });
  }

  window.siteReady(() => {
    const p = (window.SITE_DATA || {}).progress;
    const body = document.getElementById("progress-body");
    if (!p) { body.textContent = "Progress data is not available."; return; }
    const labels = { stage: {} };
    for (const s of p.sections) {
      labels[s.key] = s.label;
      for (const st of s.stages) labels.stage[st.n] = { text: st.label, explain: st.explain, how: st.how };
    }
    document.getElementById("progress-explainer").textContent =
      `How far each bill has come toward ${p.milestone.label.toLowerCase()}. Each step is weighted by the work it takes, so a percent measures work done, not steps checked off.`;

    const how = (window.HOW_PAGES || [])[0];
    const intro = esc(p.intro || "").replace("{HOW}", how
      ? `<a href="page.html?p=${esc(how.slug)}">How These Bills Were Written</a>` : "How These Bills Were Written");

    const c = p.corpus;
    const measures = `${c.counted} bills and ${c.related} related measure${c.related === 1 ? "" : "s"}`;
    const reached = c.finished === 0
      ? `None of the ${measures} has reached it yet.`
      : `${c.finished} of the ${measures} ${c.finished === 1 ? "has" : "have"} reached it.`;
    const queued = c.queued
      ? ` ${c.queued} step${c.queued > 1 ? "s are" : " is"} prepared and await${c.queued > 1 ? "" : "s"} review.` : "";
    const footnote = c.placeholders
      ? `<p class="progress-footnote">Some steps are part done by an amount that cannot yet be measured (${c.placeholders} across all bills); each counts as half done.</p>` : "";
    const parked = p.sections.filter((s) => s.parked)
      .map((s) => `<li><strong>${esc(s.label)}.</strong> ${esc(s.note)}</li>`).join("");
    const jump = `<nav class="progress-jump" aria-label="Jump to a policy playlist"><ul>${p.families.map((f) =>
      `<li><a href="#family-${esc(f.slug)}">${esc(f.title)}</a></li>`).join("")}</ul></nav>`;
    const families = p.families.map((f) => `
      <section class="progress-family" id="family-${esc(f.slug)}">
        <h2 class="progress-family-title"><span>${esc(f.title)}</span>
          ${meter(f.pct, f.title)}<span class="progress-pct">${f.pct}%</span></h2>
        <ul class="progress-bills">${f.bills.map((b, i) => billRow(p, b, labels, agendaEntry(f, i, b))).join("")}</ul>
      </section>`).join("");

    body.innerHTML = `
      <div class="progress-intro"><p>${intro}</p>
        <p class="progress-asof">Figures as of ${esc(p.as_of)}.</p></div>
      ${jump}
      <div class="progress-summary">
        <div class="progress-hero"><span class="progress-hero-num">${c.pct}%</span>
          <span class="progress-hero-label">of the work to bring the ${esc(measures)} to ${esc(p.milestone.label.toLowerCase())}</span></div>
        ${meter(c.pct, "All bills")}
        <p class="progress-milestone">${esc(p.milestone.explainer)} ${esc(reached)}${esc(queued)}</p>
        <ul class="progress-parked">${parked}</ul>
        ${footnote}
      </div>
      ${families}`;
    // Widths are set through the CSSOM: the published style-src 'self' policy
    // blocks a style="" attribute written into markup, and permits this.
    for (const el of body.querySelectorAll(".meter-fill")) el.style.width = el.dataset.pct + "%";
    wireStages(body, labels);
    // A link to one bill's row opens it; nav.js scrolls to it and marks it.
    const openFromHash = () => {
      let id = "";
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch (e) { return; }
      const row = id && document.getElementById(id);
      if (row && row.classList.contains("progress-bill")) row.querySelector("details").open = true;
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    // A jump link lands its playlist below the sticky header, whose height
    // changes with the width (the nav wraps on a phone). Measured at the click,
    // because the header may not be injected yet when this runs.
    const fitHeader = () => {
      const header = document.querySelector(".site-header");
      body.style.setProperty("--header-h", (header ? header.offsetHeight : 0) + "px");
    };
    body.addEventListener("click", (e) => { if (e.target.closest(".progress-jump a")) fitHeader(); });
    window.addEventListener("load", fitHeader);
  });
})();
