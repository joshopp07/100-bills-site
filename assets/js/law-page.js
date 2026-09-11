/* The bill page, built around the zoom (D785).

   Four pages deep is the whole site: home, topic, bill, and everything else
   opens in place here. On "The policy" tab each section of the bill is a
   card. Open a card and its plain-English policy points appear (from the
   hand-authored links file, inverted by section). Open a point and the exact
   statutory subsections that implement it appear. Open "Why this?" and the
   companion's reasoning appears inline. The card above never disappears; it
   is the breadcrumb. "Read the law" is the full text with a pinned table of
   contents.

   URL contract: law.html?bill=<slug>[&tab=policy|text][&sec=<anchor>][&open=1]
   sec + open expands that section (and its first point) on load and scrolls
   to it, which is what search results and the random door link to. */

(function () {
  const params = new URLSearchParams(window.location.search);
  const billSlug = params.get("bill") || "prosperity";
  const initialTab = params.get("tab") || "policy";
  const focusSec = params.get("sec");
  const openOnLoad = params.get("open") === "1";

  const BOILERPLATE = /short title|definitions?$|severability|effective date|construction|table of contents|citation|general provisions|conforming amendments|authorization of appropriations/i;

  function md(s) { return window.inlineMd(s || ""); }

  function excerpt(body, n) {
    const t = window.stripMd(body || "");
    const limit = n || 220;
    if (t.length <= limit) return t;
    const cut = t.slice(0, limit);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
    return (end > 80 ? cut.slice(0, end + 1) : cut.trimEnd() + "…");
  }

  function sectionsByAnchor(bill) {
    const map = {};
    for (const s of bill.sections) map[s.anchor] = s;
    return map;
  }

  function notesByAnchor() {
    const map = {};
    const notes = (window.SITE_DATA.notes || {}).sections || [];
    for (const n of notes) map[n.anchor] = n;
    return map;
  }

  /* Invert the links file: anchor -> [bullets]. A bullet with several anchors
     appears under each; a bullet with none is listed under the bill as a whole. */
  function bulletsBySection(links) {
    const map = {};
    const loose = [];
    if (!links) return { map, loose };
    let n = 0;
    for (const g of links.groups || []) {
      for (const b of g.bullets || []) {
        const item = { id: `pt-${n++}`, text: b.text, anchors: b.billAnchors || [], notes: b.noteAnchors || [], lead: g.lead };
        if (!item.anchors.length) { loose.push(item); continue; }
        for (const a of item.anchors) (map[a] = map[a] || []).push(item);
      }
    }
    return { map, loose };
  }

  function renderStatute(sections) {
    return sections.map((s) => `
      <div class="statute-body">
        <div class="bullet-detail-label">${md(s.heading)}</div>
        ${window.renderMarkdownBlock(s.body)}
      </div>`).join("");
  }

  function renderNote(note) {
    if (!note) return "";
    return `<div class="why-inline">
      <div class="why-inline-label">Why this? From the companion: ${md(note.heading)}</div>
      ${window.renderMarkdownBlock(note.body)}
    </div>`;
  }

  function renderPoint(item, byAnchor, notes) {
    const statute = renderStatute(item.anchors.map((a) => byAnchor[a]).filter(Boolean));
    const whyBtns = item.notes
      .map((a) => notes[a])
      .filter(Boolean)
      .map((n) => `<button class="why-btn" type="button" data-why="${item.id}-${n.anchor}">Why this?</button>`)
      .join("");
    const whyPanels = item.notes
      .map((a) => notes[a])
      .filter(Boolean)
      .map((n) => `<div class="why-panel" id="why-${item.id}-${n.anchor}" hidden>${renderNote(n)}</div>`)
      .join("");
    const jump = item.anchors.map((a) => `<a href="#${a}" data-jump-tab="text">Read § in full text ↓</a>`).join("");
    return `<li class="zoom-point" id="${item.id}">
      <button class="zoom-point-head" type="button" aria-expanded="false" data-point="${item.id}">
        <span class="zoom-point-text">${md(item.text)}</span>
        <span class="zoom-chevron" aria-hidden="true">›</span>
      </button>
      <div class="zoom-point-body" id="body-${item.id}" hidden>
        <div class="zoom-level-label">The statutory text</div>
        ${statute || "<p><em>No matching section found.</em></p>"}
        <div class="bullet-detail-footer">${jump}${whyBtns}</div>
        ${whyPanels}
      </div>
    </li>`;
  }

  function renderSectionCard(s, points, byAnchor, notes, hasLinks) {
    const n = points.length;
    const count = hasLinks ? (n ? `${n} policy point${n === 1 ? "" : "s"}` : "no policy points mapped yet") : "";
    const body = hasLinks && n
      ? `<div class="zoom-level-label">What it does</div><ul class="zoom-points">${points.map((p) => renderPoint(p, byAnchor, notes)).join("")}</ul>`
      : `<div class="zoom-level-label">The statutory text</div><div class="statute-body">${window.renderMarkdownBlock(s.body)}</div>`;
    return `<section class="zoom-section" id="zs-${s.anchor}" data-anchor="${s.anchor}">
      <button class="zoom-head" type="button" aria-expanded="false" data-section="${s.anchor}">
        <span class="zoom-heading">${md(s.heading)}</span>
        <span class="zoom-excerpt">${md(excerpt(s.body))}</span>
        <span class="zoom-meta">${count}<span class="zoom-chevron" aria-hidden="true">›</span></span>
      </button>
      <div class="zoom-body" id="zb-${s.anchor}" hidden>
        ${body}
        <div class="bullet-detail-footer"><a href="#${s.anchor}" data-jump-tab="text">Read this section in the full text ↓</a></div>
      </div>
    </section>`;
  }

  function renderPolicyTab(bill, links) {
    const el = document.getElementById("panel-policy");
    const byAnchor = sectionsByAnchor(bill);
    const notes = notesByAnchor();
    const { map, loose } = bulletsBySection(links);
    const hasLinks = !!links;
    const main = [];
    const boiler = [];
    let lastPart = null;
    for (const s of bill.sections) {
      const target = BOILERPLATE.test(window.stripMd(s.heading)) && !(map[s.anchor] || []).length ? boiler : main;
      if (target === main && s.part && s.part !== lastPart) {
        main.push(`<div class="statute-part zoom-part">${md(s.part)}</div>`);
        lastPart = s.part;
      }
      target.push(renderSectionCard(s, map[s.anchor] || [], byAnchor, notes, hasLinks));
    }
    const intro = links && links.summary
      ? `<p class="law-summary">${md(links.summary)}</p>`
      : `<p class="law-summary muted">Plain-English policy points for this bill have not been authored into the site yet. Each section below opens to its statutory text.</p>`;
    const looseHtml = loose.length
      ? `<section class="zoom-section zoom-loose"><div class="zoom-level-label">Policy points not tied to one section</div><ul class="zoom-points">${loose.map((p) => renderPoint(p, byAnchor, notes)).join("")}</ul></section>`
      : "";
    const boilerHtml = boiler.length
      ? `<details class="zoom-boiler"><summary>Also in this Act: ${boiler.length} housekeeping section${boiler.length === 1 ? "" : "s"}</summary>${boiler.join("")}</details>`
      : "";
    el.innerHTML = `${intro}<div class="zoom-hint">Open a section to see what it does. Open a policy point to see the text that does it. Open “Why this?” for the reasoning.</div>${main.join("\n")}${looseHtml}${boilerHtml}`;

    el.addEventListener("click", (e) => {
      const head = e.target.closest("[data-section]");
      if (head) return toggle(head, document.getElementById(`zb-${head.dataset.section}`));
      const pt = e.target.closest("[data-point]");
      if (pt) return toggle(pt, document.getElementById(`body-${pt.dataset.point}`));
      const why = e.target.closest("[data-why]");
      if (why) {
        const panel = document.getElementById(`why-${why.dataset.why}`);
        if (panel) { panel.toggleAttribute("hidden"); why.classList.toggle("is-open"); }
      }
    });
  }

  function toggle(btn, panel) {
    if (!panel) return;
    const open = panel.hasAttribute("hidden");
    panel.toggleAttribute("hidden", !open);
    btn.setAttribute("aria-expanded", String(open));
    btn.closest(".zoom-section, .zoom-point").classList.toggle("is-open", open);
  }

  function renderTextTab(bill) {
    const el = document.getElementById("panel-text");
    const toc = [];
    const html = [];
    let lastPart = null;
    for (const s of bill.sections) {
      if (s.part && s.part !== lastPart) {
        html.push(`<div class="statute-part">${md(s.part)}</div>`);
        toc.push(`<div class="notes-toc-part">${md(s.part)}</div>`);
        lastPart = s.part;
      }
      toc.push(`<a href="#${s.anchor}">${md(s.heading)}</a>`);
      html.push(`
        <section class="statute-section" id="${s.anchor}">
          <h4 class="statute-heading"><span>${md(s.heading)}</span>
            <a class="why-link" href="law.html?bill=${billSlug}&sec=${s.anchor}&open=1">What it does</a></h4>
          <div class="statute-body">${window.renderMarkdownBlock(s.body)}</div>
        </section>`);
    }
    el.innerHTML = `<div class="notes-layout"><nav class="notes-toc" aria-label="Sections">${toc.join("")}</nav><div class="notes-content"><div class="statute">${html.join("\n")}</div></div></div>`;
  }

  function wireTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    function activate(tabId, focusAnchor) {
      buttons.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tabId)));
      document.querySelectorAll(".tab-panel").forEach((p) => p.toggleAttribute("hidden", p.id !== `panel-${tabId}`));
      try {
        const url = new URL(window.location);
        url.searchParams.set("tab", tabId);
        history.replaceState(null, "", url);
      } catch (err) { /* file:// preview: the URL cannot be rewritten; the page still works */ }
      if (focusAnchor) {
        requestAnimationFrame(() => {
          const target = document.getElementById(focusAnchor);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            target.classList.add("is-highlighted");
            setTimeout(() => target.classList.remove("is-highlighted"), 2200);
          }
        });
      }
    }
    buttons.forEach((b) => b.addEventListener("click", () => activate(b.dataset.tab)));
    document.addEventListener("click", (e) => {
      const link = e.target.closest("[data-jump-tab]");
      if (!link) return;
      e.preventDefault();
      activate(link.dataset.jumpTab, link.getAttribute("href").replace("#", ""));
    });
    activate(initialTab);
  }

  function openOnLoadSection() {
    if (!focusSec) return;
    const head = document.querySelector(`[data-section="${focusSec}"]`);
    if (!head) return;
    const boiler = head.closest("details");
    if (boiler) boiler.open = true;
    if (openOnLoad) {
      toggle(head, document.getElementById(`zb-${focusSec}`));
      const firstPt = document.querySelector(`#zb-${focusSec} [data-point]`);
      if (firstPt) toggle(firstPt, document.getElementById(`body-${firstPt.dataset.point}`));
    }
    requestAnimationFrame(() => {
      head.scrollIntoView({ behavior: "smooth", block: "start" });
      head.closest(".zoom-section").classList.add("is-highlighted");
    });
  }

  function renderHeader(meta, found) {
    const title = found ? found.bill.name : meta.title;
    document.title = `${title} — Project 2027-2029`;
    document.getElementById("law-title").textContent = title;
    document.getElementById("law-line").innerHTML = found ? md(found.bill.line) : "";
    const crumbs = document.getElementById("crumbs");
    crumbs.innerHTML = found
      ? `<a href="topic.html">The 100 Bills</a> <span>›</span> <a href="topic.html?topic=${found.category.slug}">${found.category.title}</a> <span>›</span> <span class="pill-status pill-canonical">Drafted</span>`
      : `<a href="topic.html">The 100 Bills</a>`;
    if (found) {
      const bills = found.category.bills.filter((b) => b.slug);
      const i = bills.findIndex((b) => b.slug === billSlug);
      const prev = bills[i - 1];
      const next = bills[i + 1];
      document.getElementById("bill-prev-next").innerHTML =
        `${prev ? `<a href="law.html?bill=${prev.slug}">← ${prev.name}</a>` : "<span></span>"}` +
        `${next ? `<a href="law.html?bill=${next.slug}">${next.name} →</a>` : `<a href="topic.html?topic=${found.category.slug}">All of ${found.category.title} →</a>`}`;
    }
  }

  window.siteReady(() => {
    const bill = window.SITE_DATA.bills[billSlug];
    const links = window.SITE_DATA.links[billSlug];
    const meta = (window.SITE_DATA.billsIndex || []).find((b) => b.slug === billSlug) || { slug: billSlug, title: billSlug };
    if (!bill) {
      document.getElementById("law-title").textContent = "Bill not found";
      return;
    }
    renderHeader(meta, window.AGENDA.findBill(billSlug));
    renderPolicyTab(bill, links);
    renderTextTab(bill);
    wireTabs();
    openOnLoadSection();
  });
})();
