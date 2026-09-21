/* The progress page (W2144). Reads SITE_DATA.progress, which
   Website/scripts/build_progress.py generates from the derived stage status and
   the effort weights. Each bill shows its phase and its percent of the way to
   a finished draft; opening it shows every stage. The cost estimate and the
   explanation stages are waiting by design and are shown that way, never as
   behind. Everything rendered here is text or a percent: no inline script, no
   handler attributes, so the published CSP holds. */
(function () {
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);

  // State codes from build_progress.py, each with a symbol and a word so the
  // state never rests on color alone.
  const STATE = {
    d: { mark: "✓", word: "Done" },
    p: { mark: "◐", word: "Under way" },
    q: { mark: "◔", word: "Prepared, awaiting review" },
    n: { mark: "○", word: "Not started" },
    u: { mark: "○", word: "Not yet confirmed" },
    x: { mark: "–", word: "Does not apply" },
    k: { mark: "‖", word: "Waiting by design" },
  };

  function meter(pct, label) {
    const v = Math.max(0, Math.min(100, pct));
    return `<span class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="${esc(label)}" title="${esc(label)}: ${v}%">
      <span class="meter-fill" data-pct="${v}"></span></span>`;
  }

  function stageList(p, bill) {
    return p.sections.map((sec) => {
      const items = sec.stages.map((s) => {
        const code = bill.states.charAt(s.n - 1) || "u";
        const st = STATE[code] || STATE.u;
        const frac = code === "p" && bill.partial[String(s.n)] != null
          ? ` (${Math.round(100 * bill.partial[String(s.n)])}%)` : "";
        return `<li class="stage stage-${code}"><span class="stage-mark" aria-hidden="true">${st.mark}</span>
          <span class="stage-label">${esc(s.label)}</span>
          <span class="stage-state">${esc(st.word)}${frac}</span></li>`;
      }).join("");
      const head = `<h4 class="stage-section">${esc(sec.label)}${sec.parked ? ` <span class="stage-parked">waiting by design</span>` : ""}</h4>`;
      const milestone = sec.stages.some((s) => s.n === p.milestone.after_stage)
        ? `<li class="stage-milestone">${esc(p.milestone.label)}</li>` : "";
      return `${head}<ul class="stage-list">${items}${milestone}</ul>`;
    }).join("");
  }

  function billRow(p, bill, labels) {
    const phase = bill.phase === "M" ? p.milestone.label : labels[bill.phase] || "";
    const next = bill.next ? labels.stage[bill.next] : "";
    const name = bill.slug
      ? `<a href="law.html?bill=${esc(bill.slug)}">${esc(bill.name)}</a>` : esc(bill.name);
    return `<li class="progress-bill">
      <details>
        <summary>
          <span class="progress-bill-name">${esc(bill.name)}</span>
          <span class="progress-bill-phase">${esc(phase)}</span>
          ${meter(bill.pct, bill.name)}
          <span class="progress-pct">${bill.pct}%</span>
        </summary>
        <div class="progress-detail">
          <p class="progress-next">${bill.slug ? `Read the bill: ${name}. ` : ""}${next ? `Next step: ${esc(next)}.` : `Every step to the ${esc(p.milestone.label.toLowerCase())} is done.`}${bill.queued ? ` ${bill.queued} step${bill.queued > 1 ? "s" : ""} prepared and awaiting review.` : ""}</p>
          ${stageList(p, bill)}
        </div>
      </details>
    </li>`;
  }

  window.siteReady(() => {
    const p = (window.SITE_DATA || {}).progress;
    const body = document.getElementById("progress-body");
    if (!p) { body.textContent = "Progress data is not available."; return; }
    const labels = { stage: {} };
    for (const s of p.sections) {
      labels[s.key] = s.label;
      for (const st of s.stages) labels.stage[st.n] = st.label;
    }
    const draft = p.draft ? ` <span class="pill-draft" title="Stage names written for the site; awaiting the author's review">draft labels</span>` : "";
    document.getElementById("progress-explainer").innerHTML =
      `How far each bill has come toward a finished draft. Each step is weighted by the work it takes, so a percent measures work done, not steps checked off.${draft}`;

    const c = p.corpus;
    const parked = p.sections.filter((s) => s.parked)
      .map((s) => `<li><strong>${esc(s.label)}.</strong> ${esc(s.note)}</li>`).join("");
    const families = p.families.map((f) => `
      <section class="progress-family" id="${esc(f.slug)}">
        <h2 class="progress-family-title"><span>${esc(f.title)}</span>
          ${meter(f.pct, f.title)}<span class="progress-pct">${f.pct}%</span></h2>
        <ul class="progress-bills">${f.bills.map((b) => billRow(p, b, labels)).join("")}</ul>
      </section>`).join("");

    body.innerHTML = `
      <div class="progress-summary">
        <div class="progress-hero"><span class="progress-hero-num">${c.pct}%</span>
          <span class="progress-hero-label">of the work to bring all ${c.bills} bills to a ${esc(p.milestone.label.toLowerCase())}</span></div>
        ${meter(c.pct, "All bills")}
        <p class="progress-milestone">${esc(p.milestone.explainer)} ${c.finished} of ${c.bills} bills have reached it.${c.queued ? ` ${c.queued} step${c.queued > 1 ? "s are" : " is"} prepared and awaiting review.` : ""}${c.placeholders ? ` ${c.placeholders} step${c.placeholders > 1 ? "s are" : " is"} part done in a way that cannot yet be measured; ${c.placeholders > 1 ? "each is" : "it is"} counted as half.` : ""}</p>
        <ul class="progress-parked">${parked}</ul>
      </div>
      ${families}`;
    // Widths are set through the CSSOM: the published style-src 'self' policy
    // blocks a style="" attribute written into markup, and permits this.
    for (const el of body.querySelectorAll(".meter-fill")) el.style.width = el.dataset.pct + "%";
  });
})();
