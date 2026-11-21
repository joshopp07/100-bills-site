/* The progress page (W2144; four public stages since 2026-10-31, W7423). Reads
   SITE_DATA.progress, which Website/scripts/build_progress.py generates. The page
   explains the four stages, counts the bills at each, and lists every bill with its
   stage. Everything rendered here is text: no inline script, no handler attributes,
   no style attributes, so the published CSP holds. */
(function () {
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);

  /* One segment per stage shown, filled up to the bill's stage. The stage name is printed beside
     it, so the stage never rests on the graphic alone. */
  function steps(n, total) {
    let segs = "";
    for (let i = 1; i <= total; i++) segs += `<span class="pstep${i <= n ? " is-on" : ""}"></span>`;
    return `<span class="psteps" aria-hidden="true">${segs}</span>`;
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

  /* Each row carries its bill card's id, so a card links straight to it, and, for the
     measures that are not bills, the kind pill the card shows. */
  function billRow(p, bill, entry) {
    const A = window.AGENDA;
    const id = entry ? ` id="${esc(A.cardId(entry))}"` : "";
    const kind = entry && !A.counted(entry) && entry.kind
      ? `<span class="pill-kind" title="Not counted among the 100">${esc(entry.kind)}</span>` : "";
    const page = entry ? entry.page : bill.slug;
    const name = page ? `<a href="law.html?bill=${esc(page)}">${esc(bill.name)}</a>` : esc(bill.name);
    const stage = p.stages[bill.stage - 1];
    return `<li class="progress-bill progress-stage-${bill.stage}"${id}>
      <span class="progress-bill-head"><span class="progress-bill-name">${name}</span>${kind}</span>
      ${steps(bill.stage, p.stages.length)}
      <span class="progress-bill-phase">${esc(stage.name)}</span>
    </li>`;
  }

  window.siteReady(() => {
    const p = (window.SITE_DATA || {}).progress;
    const body = document.getElementById("progress-body");
    if (!p) { body.textContent = "Progress data is not available."; return; }
    document.getElementById("progress-explainer").textContent =
      `Each bill is at one of ${({ 3: "three", 4: "four" })[p.stages.length] || p.stages.length} stages.`;

    const how = (window.HOW_PAGES || [])[0];
    const intro = esc(p.intro || "").replace("{HOW}", how
      ? `<a href="page.html?p=${esc(how.slug)}">How These Bills Were Written</a>` : "How These Bills Were Written");

    const c = p.corpus;
    const measures = `${c.counted} bills and ${c.related} related measure${c.related === 1 ? "" : "s"}`;
    const stageCards = p.stages.map((s) => `
      <li class="progress-stage">
        <span class="progress-stage-num">Stage ${s.n}</span>
        <h2 class="progress-stage-name">${esc(s.name)}</h2>
        <p class="progress-stage-explain">${esc(s.explain)}</p>
        <p class="progress-stage-count">${s.count
          ? `${s.count} of the ${c.bills} measures ${s.count === 1 ? "is" : "are"} at this stage.`
          : esc(p.empty)}</p>
      </li>`).join("");

    const jump = `<nav class="progress-jump" aria-label="Jump to a policy playlist"><ul>${p.families.map((f) =>
      `<li><a href="#family-${esc(f.slug)}">${esc(f.title)}</a></li>`).join("")}</ul></nav>`;
    const families = p.families.map((f) => `
      <section class="progress-family" id="family-${esc(f.slug)}">
        <h2 class="progress-family-title"><span>${esc(f.title)}</span></h2>
        <ul class="progress-bills">${f.bills.map((b, i) => billRow(p, b, agendaEntry(f, i, b))).join("")}</ul>
      </section>`).join("");

    // The closing "Upcoming work" section (W9673): the work that follows once every
    // bill is written and reviewed.
    const up = p.upcoming;
    const upcoming = up && up.items && up.items.length ? `
      <section class="progress-family progress-upcoming" id="upcoming-work">
        <h2 class="progress-family-title"><span>${esc(up.title)}</span></h2>
        ${up.intro ? `<p class="progress-upcoming-intro">${esc(up.intro)}</p>` : ""}
        <dl class="progress-upcoming-list">${up.items.map((it) =>
          `<dt>${esc(it.name)}</dt><dd>${esc(it.explain)}</dd>`).join("")}</dl>
      </section>` : "";

    body.innerHTML = `
      <div class="progress-intro"><p>${intro}</p>
        <p class="progress-asof">Counts cover the ${esc(measures)}, as of ${esc(p.as_of)}.</p></div>
      <ol class="progress-stages">${stageCards}</ol>
      ${jump}
      ${families}
      ${upcoming}`;
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
