/* The bill page, built around the zoom (D785).

   Four pages deep is the whole site: home, topic, bill, and everything else
   opens in place here. On "The policy" tab each section of the bill is a
   card. Open a card and its plain-English policy points appear (from the
   hand-authored links file, inverted by section). Open a point and the exact
   statutory subsections that implement it appear. Open "Why this?" and the
   companion's reasoning appears inline. The card above never disappears; it
   is the breadcrumb. "Read the law" is the full text with a pinned table of
   contents. A bill with no links file marked policyReady (every bill, as of
   2026-10-01, D2028) has no policy tab: its page is the full text alone.

   URL contract:
     law.html?bill=<slug>[&tab=policy|text][&sec=<anchor>][&open=1][&why=<note>][&q=<terms>][#<anchor>]
   sec + open expands that section (and its first point, or the point holding
   the companion note named by why=) on load and scrolls to it, which is what
   search results link to. sec with tab=text, or a #<anchor> hash, opens the
   full text at that section or subsection. q= marks the search terms in the
   section that opens. Opening a card rewrites the URL to its sec= form so the
   address bar is always a link to what is on screen.

   Closed cards use hidden="until-found", so the browser's find-in-page reaches
   their text and opens them; the beforematch listener keeps aria-expanded true
   to what is shown. */

(function () {
  /* A hand-edited or truncated address can carry a malformed escape (#%E0%A4%A);
     decodeURIComponent throws on it, and the page would stop before it renders. */
  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (err) { return s; }
  }

  const params = new URLSearchParams(window.location.search);
  const billSlug = params.get("bill") || "prosperity";
  const hashAnchor = safeDecode((window.location.hash || "").slice(1));
  const focusSec = params.get("sec");
  let initialTab = params.get("tab") || (hashAnchor ? "text" : "policy");
  const openOnLoad = params.get("open") === "1";
  const focusWhy = params.get("why");
  const query = params.get("q") || "";

  const SITE_NAME = "Project ’27 to ’29";

  /* Housekeeping sections collapse into "Also in this measure". Only whole
     headings match: a heading that merely contains "construction" or
     "severability" is substantive and stays in the list (a severability
     section can run 8,000 characters). */
  const BOILER_WORDS = "short title|definitions?|effective dates?|table of contents";
  const BOILERPLATE = new RegExp(`^(?:${BOILER_WORDS})(?:\\s*(?:;|,|and)\\s*(?:${BOILER_WORDS}))*\\.?$`, "i");
  /* Drafting notes ("The defect", "The single theory", a provenance note) once sat
     in the bill files between sections. They left the bills on 2026-10-01 and
     audit.py's check_bill_text_has_no_drafting_notes keeps them out, so the note
     card below should never render; it stays as a guard, labeling any heading
     that is not a section heading rather than presenting it as bill text. A
     section heading starts with §, SEC., SECTION, a subsection label, or names a
     resolution's own parts. */
  const TEXT_HEADING = /^(?:§|SEC(?:TION)?\b|Sec\.|\(|RESOLUTION\b|ARTICLE\b|SCHEDULE\b|TITLE\b)/i;
  /* A section that amends existing law. Its quoted text shows insertions. */
  const AMENDS = /~~|\b(?:is|are) (?:hereby )?amended\b|to read as follows|\bby (?:adding|inserting|striking)\b/i;
  // The search page's small words; the term rules in markQuery are its rules too.
  const STOP = new Set(["the", "a", "an", "of", "and", "act", "to", "in", "for", "all", "on", "or", "by", "with"]);

  let BILL = null;
  let BILL_NAME = "";
  let AS_OF = "";

  function md(s) { return window.inlineMd(s || ""); }
  /* A URL-fed value inside an attribute selector: a quote in ?sec= must not break the query. */
  function cssEsc(s) { return window.CSS && window.CSS.escape ? window.CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"); }
  function esc(s) { return window.escapeHtml(String(s == null ? "" : s)); }
  function plainHeading(h) { return window.stripMd(h || ""); }
  function headingWords(h) { return plainHeading(h).replace(/^(?:§+\s*[0-9A-Za-z.-]+|SEC(?:TION)?\.?\s*[0-9A-Za-z-]+)\.?\s*/i, "").trim(); }
  function isNote(s) { return !TEXT_HEADING.test(plainHeading(s.heading)); }
  function isBoiler(s) { return BOILERPLATE.test(headingWords(s.heading)); }
  function amends(s) { return !isNote(s) && AMENDS.test(s.body || ""); }

  /* "§ 3-6. The match." -> "§ 3-6"; "SECTION 3." -> "Section 3". */
  function secLabel(s) {
    const h = plainHeading(s.heading);
    let m = h.match(/^§+\s*([0-9]+[A-Za-z]?(?:-[0-9]+[A-Za-z]?)?)/);
    if (m) return `§ ${m[1]}`;
    m = h.match(/^SEC(?:TION)?\.?\s*([0-9]+[A-Za-z]?)/i);
    if (m) return `Section ${m[1]}`;
    return "";
  }

  /* What a "Read ... in the full text" link names: the section number, else the Schedule. */
  function jumpLabel(s) {
    return secLabel(s) || (/^SCHEDULE\b/i.test(plainHeading(s.heading)) ? "the Schedule" : "this section");
  }

  function body(s, extra) {
    const amend = amends(s);
    const html = window.renderMarkdownBlock(s.body || "", Object.assign({ amend }, extra || {}));
    const legend = amend && /<(?:ins|del)>/.test(html)
      ? `<p class="redline-key">Underlined text is inserted into existing law; struck text is removed.</p>`
      : "";
    return legend + html;
  }

  /* Card excerpts: no struck words, no table rules, no list labels, and for an
     amending section, not the instruction ("Section 9858c ... is amended to
     read as follows:") but the new language after it. */
  function excerpt(s, n) {
    const limit = n || 220;
    let paras = (s.body || "").split(/\n\s*\n/).filter((p) => p.trim() && !/^\s*-{3,}\s*$/.test(p));
    if (amends(s)) {
      // "... is amended to read as follows:" or an italic "*Amends 8 U.S.C. § 1252(e)(2).*"
      const isInstruction = (p) => !/^\s*>/.test(p) &&
        ((/:\s*$/.test(p.trim()) && /amended|as follows|the following|adding|inserting|striking/i.test(p)) || /^\s*\*[^*]*\bAmends?\b[^*]*\*\s*$/.test(p.trim()));
      while (paras.length > 1 && isInstruction(paras[0])) paras = paras.slice(1);
    }
    const t = window.plainText(paras.join("\n\n"));
    if (t.length <= limit) return t;
    const cut = t.slice(0, limit);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
    if (end > 80) return cut.slice(0, end + 1);
    const c = cut.trimEnd();
    return /[.;:]$/.test(c) ? c : c + "…";
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
     appears under each (renderPoints gives each appearance its own ids); a bullet
     with none is listed under the bill as a whole. */
  function bulletsBySection(links) {
    const map = {};
    const loose = [];
    if (!links) return { map, loose };
    let n = 0;
    for (const g of links.groups || []) {
      for (const b of g.bullets || []) {
        const item = { id: `pt-${n++}`, text: b.text, anchors: b.billAnchors || [], notes: b.noteAnchors || [], lead: g.lead || "" };
        if (!item.anchors.length) { loose.push(item); continue; }
        for (const a of item.anchors) (map[a] = map[a] || []).push(item);
      }
    }
    return { map, loose };
  }

  /* ---------- toggles ---------- */

  function setOpen(btn, panel, open) {
    if (!btn || !panel) return;
    if (open) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "until-found");
    btn.setAttribute("aria-expanded", String(open));
    btn.classList.toggle("is-open", open);
    const host = btn.matches(".zoom-head, .zoom-point-head") ? btn.closest(".zoom-section, .zoom-point") : null;
    if (host) host.classList.toggle("is-open", open);
  }
  function toggle(btn, panel) {
    if (!panel) return false;
    const open = panel.hasAttribute("hidden");
    setOpen(btn, panel, open);
    return open;
  }
  function controller(panel) {
    return panel && panel.id ? document.querySelector(`[aria-controls="${cssEsc(panel.id)}"]`) : null;
  }

  /* ---------- the policy tab ---------- */

  function renderStatute(sections) {
    return sections.map((s) => `
      <div class="statute-body">
        <div class="bullet-detail-label">${md(s.heading)}</div>
        ${body(s)}
      </div>`).join("");
  }

  function noteName(n) {
    // "B.1A The citizenship line, argued rather than flagged" -> "The citizenship line, argued rather than flagged"
    return plainHeading(n.heading).replace(/^[A-Z]+\.?[0-9]+[A-Za-z]?\.?\s+/, "").replace(/^[IVX]+\.\s+/, "");
  }

  function renderNote(note) {
    if (!note) return "";
    return `<div class="why-inline">
      <div class="why-inline-label">Why this? From the companion: ${md(note.heading)}</div>
      ${window.renderMarkdownBlock(note.body)}
    </div>`;
  }

  function renderPoint(item, byAnchor, notes, where) {
    const pid = `${item.id}-${where}`;   // a point listed under two sections gets ids in each
    const statute = renderStatute(item.anchors.map((a) => byAnchor[a]).filter(Boolean));
    const found = item.notes.map((a) => notes[a]).filter(Boolean);
    const whyBtns = found.map((n) => {
      const id = `why-${pid}-${n.anchor}`;
      return `<button class="why-btn" type="button" data-why="${pid}-${n.anchor}" data-note="${esc(n.anchor)}" aria-expanded="false" aria-controls="${id}">Why this? ${esc(noteName(n))}</button>`;
    }).join("");
    const whyPanels = found.map((n) => `<div class="why-panel" id="why-${pid}-${n.anchor}" hidden="until-found">${renderNote(n)}</div>`).join("");
    const jump = item.anchors.filter((a) => byAnchor[a]).map((a) => {
      const label = jumpLabel(byAnchor[a]);
      return `<a href="#${a}" data-jump-tab="text">Read ${esc(label)} in the full text ↓</a>`;
    }).join("");
    return `<li class="zoom-point" id="${pid}">
      <button class="zoom-point-head" type="button" aria-expanded="false" aria-controls="body-${pid}" data-point="${pid}">
        <span class="zoom-point-text">${md(item.text)}</span>
        <span class="zoom-chevron" aria-hidden="true">›</span>
      </button>
      <div class="zoom-point-body" id="body-${pid}" hidden="until-found">
        <div class="zoom-level-label">The statutory text</div>
        ${statute || "<p><em>No matching section found.</em></p>"}
        <div class="bullet-detail-footer">${jump}${whyBtns}</div>
        ${whyPanels}
      </div>
    </li>`;
  }

  /* Points grouped under the problem statement (the links file's "lead") they share. */
  function renderPoints(points, byAnchor, notes, where) {
    const out = [];
    let lead = null;
    let open = false;
    for (const p of points) {
      if (p.lead !== lead || !open) {
        if (open) out.push("</ul>");
        if (p.lead && p.lead !== lead) out.push(`<p class="point-lead">${md(p.lead)}</p>`);
        out.push(`<ul class="zoom-points">`);
        open = true;
        lead = p.lead;
      }
      out.push(renderPoint(p, byAnchor, notes, where));
    }
    if (open) out.push("</ul>");
    return out.join("");
  }

  function renderSectionCard(s, points, byAnchor, notes, level) {
    const note = isNote(s);
    const n = points.length;
    const count = n ? `${n} policy point${n === 1 ? "" : "s"}` : "";
    const inner = n
      ? `<div class="zoom-level-label">What it does</div>${renderPoints(points, byAnchor, notes, s.anchor)}`
      : `<div class="zoom-level-label">${note ? "Note" : "The statutory text"}</div><div class="statute-body">${body(s)}</div>`;
    const label = note ? `<span class="note-label">Note — not bill text</span>` : "";
    const where = note ? "Read this note in the full text ↓" : `Read ${esc(jumpLabel(s))} in the full text ↓`;
    return `<section class="zoom-section${note ? " zoom-note" : ""}" id="zs-${s.anchor}" data-anchor="${s.anchor}">
      <h${level} class="zoom-h"><button class="zoom-head" type="button" aria-expanded="false" aria-controls="zb-${s.anchor}" data-section="${s.anchor}">
        ${label}<span class="zoom-heading">${md(s.heading)}</span>
        <span class="zoom-excerpt">${esc(excerpt(s))}</span>
        <span class="zoom-meta">${count}<span class="zoom-chevron" aria-hidden="true">›</span></span>
      </button></h${level}>
      <div class="zoom-body" id="zb-${s.anchor}" hidden="until-found">
        ${inner}
        <div class="bullet-detail-footer"><a href="#${s.anchor}" data-jump-tab="text">${where}</a></div>
      </div>
    </section>`;
  }

  /* What the bill does, for a bill with no hand-authored summary: the opening
     paragraph of its own "The single theory" note, extended by the next
     paragraph when the first is a single line. A bill without that note shows
     nothing here, because its promise sentences already sit under the title.
     Since 2026-10-01 no bill carries that note, so this returns "" for every bill
     and the page opens on its sections; it is kept so a returned note is shown
     rather than dropped silently. */
  function theoryIntro(bill) {
    const t = bill.sections.find((s) => /^the single theory$/i.test(plainHeading(s.heading)));
    if (!t) return "";
    const paras = t.body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !/^[>|#-]/.test(p));
    const take = [];
    for (const p of paras) {
      take.push(p);
      if (take.join(" ").length >= 250 || take.length >= 2) break;
    }
    if (!take.length) return "";
    return `<div class="law-summary law-theory"><h2 class="intro-label">What this bill does</h2>${take.map((p) => `<p>${md(p)}</p>`).join("")}<p class="intro-source">From the note at the head of the bill.</p></div>`;
  }

  function renderPolicyTab(bill, links) {
    const el = document.getElementById("panel-policy");
    const byAnchor = sectionsByAnchor(bill);
    const notes = notesByAnchor();
    const { map, loose } = bulletsBySection(links);
    const hasLinks = !!links;
    const main = [];
    const boiler = [];
    const parts = [];
    let lastPart = null;
    for (const s of bill.sections) {
      if (!(s.body || "").trim()) continue;            // a heading with no text of its own ("ARTICLE —")
      const points = map[s.anchor] || [];
      const target = isBoiler(s) && !points.length ? boiler : main;
      if (target === main && s.part && s.part !== lastPart) {
        const id = `pp-${parts.length}`;
        parts.push({ id, label: s.part });
        main.push(`<h2 class="statute-part zoom-part" id="${id}">${md(s.part)}</h2>`);
        lastPart = s.part;
      }
      target.push(renderSectionCard(s, points, byAnchor, notes, s.part && target === main ? 3 : 2));
    }
    const intro = links && links.summary ? `<p class="law-summary">${md(links.summary)}</p>` : theoryIntro(bill);
    const anyWhy = hasLinks && /class="why-btn"/.test(main.join(""));
    const anyPoints = hasLinks && Object.keys(map).length > 0;
    const hint = anyPoints
      ? `Open a section to see what it does. Open a policy point to see the text that does it.${anyWhy ? " Open “Why this?” for the reasoning." : ""}`
      : "Open a section to read its text.";
    const looseHtml = loose.length
      ? `<section class="zoom-section zoom-loose"><div class="zoom-level-label">Policy points not tied to one section</div>${renderPoints(loose, byAnchor, notes, "loose")}</section>`
      : "";
    const boilerHtml = boiler.length
      ? `<details class="zoom-boiler"><summary>Also in this measure: ${boiler.length} housekeeping section${boiler.length === 1 ? "" : "s"}</summary>${boiler.join("")}</details>`
      : "";
    // A jump list by Title or Part for a long bill, in the space beside the cards.
    const index = parts.length >= 3
      ? `<details class="policy-index" data-collapse-narrow><summary>Parts (${parts.length})</summary><nav class="policy-index-nav" aria-label="Parts of this bill">${parts.map((p) => `<a href="#${p.id}">${md(p.label)}</a>`).join("")}</nav></details>`
      : "";
    el.innerHTML = `${intro}<p class="zoom-hint">${hint}</p><div class="policy-layout${index ? " has-index" : ""}"><div class="policy-main">${main.join("\n")}${looseHtml}${boilerHtml}</div>${index}</div>`;

    el.addEventListener("click", (e) => {
      const head = e.target.closest("[data-section]");
      if (head) {
        const opened = toggle(head, document.getElementById(`zb-${head.dataset.section}`));
        rememberCard(head.dataset.section, opened);
        return;
      }
      const pt = e.target.closest("[data-point]");
      if (pt) return toggle(pt, document.getElementById(`body-${pt.dataset.point}`));
      const why = e.target.closest("[data-why]");
      if (why) toggle(why, document.getElementById(`why-${why.dataset.why}`));
    });
  }

  /* The address bar names the open card, so it can be copied and shared. */
  function rememberCard(anchor, opened) {
    try {
      const url = new URL(window.location);
      if (opened) {
        url.searchParams.set("tab", "policy");
        url.searchParams.set("sec", anchor);
        url.searchParams.set("open", "1");
        url.searchParams.delete("why");
      } else if (url.searchParams.get("sec") === anchor) {
        url.searchParams.delete("sec");
        url.searchParams.delete("open");
        url.searchParams.delete("why");
      }
      url.hash = "";
      history.replaceState(null, "", url);
    } catch (err) { /* file:// preview: the URL cannot be rewritten; the page still works */ }
  }

  /* ---------- the full text ---------- */

  function pageUrl(extra, hash) {
    let base;
    try {
      const u = new URL(window.location);
      u.search = "";
      u.hash = "";
      base = u.toString();
    } catch (err) { base = "law.html"; }
    return `${base}?bill=${encodeURIComponent(billSlug)}${extra || ""}${hash ? `#${hash}` : ""}`;
  }

  /* single: the bill has no policy tab, so nothing above the text names it; a
     heading with the section count does. */
  function renderTextTab(bill, hasPoints, single) {
    const el = document.getElementById("panel-text");
    const toc = [];
    const html = [];
    let lastPart = null;
    let count = 0;
    const usedIds = new Set();
    for (const s of bill.sections) {
      /* The section that opens a part carries the part headings before it, each with
         the prose under it (a Title's effective-date condition), as partHeads. */
      const heads = Array.isArray(s.partHeads) && s.partHeads.length ? s.partHeads
        : s.part && s.part !== lastPart ? [{ heading: s.part, body: "" }] : [];
      for (const h of heads) {
        html.push(`<h2 class="statute-part">${md(h.heading)}</h2>`);
        if ((h.body || "").trim()) html.push(`<div class="statute-body part-intro">${window.renderMarkdownBlock(h.body)}</div>`);
        toc.push(`<div class="notes-toc-part">${md(h.heading)}</div>`);
      }
      if (heads.length) lastPart = s.part;
      const note = isNote(s);
      const empty = !(s.body || "").trim();
      // A heading with no text of its own ("ARTICLE —") stays in the text but not in the contents.
      if (!empty) {
        count += 1;
        toc.push(`<a href="#${s.anchor}" data-toc="${s.anchor}"${note ? ' class="toc-note"' : ""}>${md(s.heading)}</a>`);
      }
      const level = s.part ? 3 : 2;
      const what = !note && hasPoints(s.anchor)
        ? `<a class="why-link" href="law.html?bill=${billSlug}&amp;sec=${s.anchor}&amp;open=1">What it does</a>` : "";
      html.push(`
        <section class="statute-section${note ? " statute-note" : ""}" id="${s.anchor}">
          <div class="statute-heading-row"><h${level} class="statute-heading"><a class="sec-link" href="${esc(pageUrl("&tab=text", s.anchor))}">${md(s.heading)}</a></h${level}>
            <span class="sec-tools"><button class="copy-link" type="button" data-copy-link="${s.anchor}" aria-label="Copy link to ${esc(plainHeading(s.heading))}">Copy link</button>${what}</span></div>
          ${note ? `<p class="note-label">Note — not bill text</p>` : ""}
          ${empty ? "" : `<div class="statute-body">${body(s, note ? {} : { idPrefix: s.anchor, usedIds })}</div>`}
        </section>`);
    }
    const head = single
      ? `<div class="text-head"><h2 class="text-title">Text of the bill</h2><p class="text-count">${count} section${count === 1 ? "" : "s"}</p></div>`
      : "";
    el.innerHTML = `${head}<div class="notes-layout">
        <details class="toc-disclosure" data-collapse-narrow open><summary>Sections (${count})</summary><nav class="notes-toc" aria-label="Sections">${toc.join("")}</nav></details>
        <div class="notes-content"><div class="statute">${html.join("\n")}</div></div>
      </div>`;
    /* A "Copy citation" control on every lettered subsection. The stylesheet keeps it
       out of the text flow and hidden until its paragraph is hovered, tapped or targeted. */
    el.querySelectorAll(".statute-section").forEach((sec) => {
      const s = BILL.sections.find((x) => x.anchor === sec.id);
      const label = s ? secLabel(s) : "";
      if (!label) return;
      sec.querySelectorAll(".subsec").forEach((p) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cite-btn";
        b.dataset.cite = p.id;
        b.dataset.citeLabel = `${label}(${p.dataset.sub})`;
        b.textContent = "Copy citation";
        b.setAttribute("aria-label", `Copy citation to ${label}(${p.dataset.sub})`);
        p.appendChild(b);
      });
    });
    el.addEventListener("click", (e) => {
      const copy = e.target.closest("[data-copy-link]");
      if (copy) return copyText(pageUrl("&tab=text", copy.dataset.copyLink), copy, "Link copied");
      const cite = e.target.closest("[data-cite]");
      if (cite) {
        const text = `${BILL_NAME} ${cite.dataset.citeLabel}, ${SITE_NAME} model text${AS_OF ? ` as of ${AS_OF}` : ""}, ${pageUrl("&tab=text", cite.dataset.cite)}`;
        return copyText(text, cite, "Citation copied");
      }
      // On a touch screen, with no hover, a tap on a lettered paragraph shows its control.
      const sub = e.target.closest(".subsec");
      if (noHover() && !e.target.closest("a, button")) {
        const sel = window.getSelection ? String(window.getSelection()) : "";
        if (sel) return;
        el.querySelectorAll(".subsec.cite-on").forEach((x) => { if (x !== sub) x.classList.remove("cite-on"); });
        if (sub) sub.classList.toggle("cite-on");
      }
    });
  }

  function noHover() {
    return !!(window.matchMedia && window.matchMedia("(hover: none)").matches);
  }

  function copyText(text, btn, done) {
    const label = btn.textContent;
    const finish = (ok) => {
      btn.textContent = ok ? done : "Copy failed";
      btn.classList.toggle("is-done", ok);
      setTimeout(() => { btn.textContent = label; btn.classList.remove("is-done"); }, 1800);
    };
    const fallback = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.className = "copy-scratch";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand && document.execCommand("copy");
        ta.remove();
        finish(!!ok);
      } catch (err) { finish(false); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => finish(true), fallback);
    } else fallback();
    btn.dataset.copied = text;
  }

  /* ---------- cross-references and bill names ---------- */

  /* Section references ("§ 3-6(b)", "section 103", and each number in a list:
     "§§ 5-1 through 5-5", "sections 8-2 and 8-4") become links to that section,
     and an exact drafted-bill name becomes a link to its page. A same-bill link is
     a plain #anchor, so the jump is the browser's own and Back returns from it. A
     wrong link is worse than none, so a reference is linked only when its bill is
     certain:
       - "<Name> § N" or "section N of <Name>": that bill, if <Name> is a bill on this site;
       - "section N of <anything else>" or "<Other> Act § N": not linked;
       - "section N" or "§ N of this Act" with nothing else: this bill, except
         inside quoted statutory text, where "this Act" means the Act quoted;
       - after "U.S.C.", "title N", "such" or an Act's name: not linked;
     and only when the section exists in the bill it points at. A three-digit
     number is a common citation to other law ("section 501(c)(3)"), so one that
     names a subsection links only when that subsection exists. */
  function siteBills() {
    const out = [];
    for (const c of window.AGENDA.categories()) {
      for (const b of c.bills) {
        if (!b.slug || !window.SITE_DATA.bills[b.slug]) continue;
        const core = b.name.replace(/^The\s+/, "");
        const re = core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’]/g, "['’]");
        out.push({ slug: b.slug, name: b.name, display: b.display_name || b.name, core, re });
      }
    }
    return out.sort((a, b) => b.core.length - a.core.length);
  }

  function sectionTarget(slug, num, subs) {
    const bill = window.SITE_DATA.bills[slug];
    if (!bill) return null;
    const anchor = `sec-${num.toLowerCase()}`;
    const s = bill.sections.find((x) => x.anchor === anchor);
    if (!s) return null;
    const first = (subs.match(/^\(([a-z]{1,3}(?:-[0-9a-z]+)?)\)/) || [])[1];
    if (first && new RegExp(`(^|\\n)\\*\\*\\(${first.replace(/-/g, "\\-")}\\)`).test(s.body)) return `${anchor}-${first}`;
    if (subs && !num.includes("-")) return null;
    return anchor;
  }

  function linkRefs(root, bills) {
    if (!root) return;
    const others = bills.filter((b) => b.slug !== billSlug);
    const nameAtEnd = bills.map((b) => ({ b, re: new RegExp(`${b.re}\\s*,?\\s*$`, "i") }));
    const nameAtStart = bills.map((b) => ({ b, re: new RegExp(`^${b.re}\\b`, "i") }));
    /* A section number: hyphenated (3-6, 12A-4) or three digits (103, 205A). A list
       continues with a comma, "and", "or", "through", "to" or a dash before the next
       number; a number followed by a unit ("180 days") ends it. */
    const NUM = String.raw`\d+[A-Z]?-\d+[A-Za-z]?|\d{3}[A-Z]?(?![\d-])`;
    const SUBS = String.raw`(?:\([A-Za-z0-9-]+\))*`;
    const SEP = String.raw`\s*,\s*(?:(?:and|or|through|to)\s+)?|\s+(?:and|or|through|to)\s+|\s*[–—]\s*`;
    const UNIT = String.raw`(?!\s+(?:calendar\s+|business\s+)?(?:days?|weeks?|months?|years?|hours?|percent)\b|\s*%)`;
    const refRe = new RegExp(String.raw`(§§?\s*|\b[Ss]ections?\s+)(${NUM})(${SUBS})${UNIT}((?:(?:${SEP})(?:${NUM})${SUBS}${UNIT})*)`, "g");
    const itemRe = new RegExp(String.raw`(${SEP})(${NUM})(${SUBS})`, "y");
    const nameRe = others.length ? new RegExp(`\\b(?:[Tt]he\\s+)?(?:${others.map((b) => b.re).join("|")})(?![\\w’'-])`, "g") : null;

    const skip = (node) => !!(node.parentElement && node.parentElement.closest("a, button, del, h1, h2, h3, h4, h5, h6, .zoom-head, summary, code, .bullet-detail-label"));
    const textNodes = (r) => {
      const out = [];
      const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) if (n.nodeValue.trim() && !skip(n)) out.push(n);
      return out;
    };
    const replaceWith = (node, pieces) => {
      const frag = document.createDocumentFragment();
      for (const p of pieces) {
        if (typeof p === "string") { if (p) frag.appendChild(document.createTextNode(p)); continue; }
        const a = document.createElement("a");
        a.href = p.href;
        a.className = p.cls;
        a.textContent = p.text;
        frag.appendChild(a);
      }
      node.parentNode.replaceChild(frag, node);
    };

    // Pass 1: section references.
    for (const node of textNodes(root)) {
      const text = node.nodeValue;
      const quoted = !!node.parentElement.closest("blockquote");
      const pieces = [];
      let last = 0;
      let m;
      refRe.lastIndex = 0;
      while ((m = refRe.exec(text))) {
        const before = text.slice(Math.max(0, m.index - 160), m.index);
        const after = text.slice(m.index + m[0].length, m.index + m[0].length + 160);
        let slug = null;
        const of = after.match(/^\s*of\s+(?:the\s+)?(.*)$/s);
        if (/U\.\s?S\.\s?C\.\s*$|\btitle\s+\d+\s*,?\s*$|\bsuch\s+$/i.test(before)) slug = null;
        else if (of) {
          if (/^this\s+(?:Act|Resolution|Amendment)\b/i.test(of[1])) slug = quoted ? null : billSlug;
          else { const hit = nameAtStart.find((x) => x.re.test(of[1])); slug = hit ? hit.b.slug : null; }
        } else {
          const hit = nameAtEnd.find((x) => x.re.test(before));
          if (hit) slug = hit.b.slug;
          else if (/\b(?:Act|Amendment|Resolution|Code|Constitution)\s*,?\s*$/.test(before)) slug = null;
          else slug = quoted ? null : billSlug;
        }
        if (!slug) continue;
        // The list's items, each [start, text, number, subsections]; the first carries the § or "section".
        const items = [[m.index, m[1] + m[2] + m[3], m[2], m[3] || ""]];
        let at = m.index + m[1].length + m[2].length + m[3].length;
        itemRe.lastIndex = at;
        let it;
        while (at < m.index + m[0].length && (it = itemRe.exec(text))) {
          items.push([at + it[1].length, it[2] + it[3], it[2], it[3] || ""]);
          at = itemRe.lastIndex;
        }
        for (const [start, label, num, subs] of items) {
          const target = sectionTarget(slug, num, subs);
          if (!target) continue;
          pieces.push(text.slice(last, start));
          pieces.push(slug === billSlug
            ? { href: `#${target}`, cls: "xref", text: label }
            : { href: `law.html?bill=${slug}&tab=text#${target}`, cls: "xref", text: label });
          last = start + label.length;
        }
      }
      if (pieces.length) { pieces.push(text.slice(last)); replaceWith(node, pieces); }
    }
    // Pass 2: bill names.
    if (!nameRe) return;
    for (const node of textNodes(root)) {
      const text = node.nodeValue;
      const pieces = [];
      let last = 0;
      let m;
      nameRe.lastIndex = 0;
      while ((m = nameRe.exec(text))) {
        const core = m[0].replace(/^[Tt]he\s+/, "");
        const hit = others.find((b) => new RegExp(`^${b.re}$`, "i").test(core));
        if (!hit) continue;
        pieces.push(text.slice(last, m.index));
        pieces.push({ href: `law.html?bill=${hit.slug}`, cls: "bill-ref", text: m[0] });
        last = m.index + m[0].length;
      }
      if (pieces.length) { pieces.push(text.slice(last)); replaceWith(node, pieces); }
    }
  }

  /* Bills whose names appear in this bill's text, plus the mirrored pair. */
  function renderRelated(bill, bills) {
    const mount = document.getElementById("related-bills");
    if (!mount) return;
    const text = bill.sections.map((s) => `${s.heading}\n${s.body}`).join("\n");
    const related = bills.filter((b) => b.slug !== billSlug && new RegExp(`\\b${b.re}(?![\\w’'-])`, "i").test(text));
    const pair = { executive: "congressional", congressional: "executive" }[billSlug];
    if (pair && !related.some((b) => b.slug === pair)) {
      const p = bills.find((b) => b.slug === pair);
      if (p) related.unshift(p);
    }
    if (!related.length) { mount.hidden = true; mount.removeAttribute("aria-labelledby"); return; }
    mount.innerHTML = `<h2 class="related-title" id="related-title">Related bills</h2>
      <p class="related-lead">Bills this one names in its text${pair ? ", and the bill that mirrors it for the other branch" : ""}.</p>
      <ul class="related-list">${related.map((b) => `<li><a href="law.html?bill=${b.slug}">${esc(b.display)}</a></li>`).join("")}</ul>`;
    mount.setAttribute("aria-labelledby", "related-title");
    mount.hidden = false;
  }

  /* ---------- search terms ---------- */

  /* The search page's term rules (search-page.js: words, parse, termSrc, forms), copied
     because that file does not load here; keep the two in step. A section a result
     opens is marked for the words the search matched it on: a one-letter word joins
     the word before it ("pre K" is "pre-k"), a hyphen between letters also matches a
     space or a period, and a word also marks its plural, -ing and -ed forms. */
  const NO_STEM = new Set(["news", "series", "species", "means", "this", "its", "has", "was", "does",
    "less", "unless", "across", "whereas", "always", "perhaps", "thus", "status", "bus", "gas", "plus",
    "bonus", "census", "focus", "virus", "lens"]);
  const TERM_SEP = "[-.\\s]";
  const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function queryTerms(q) {
    const text = (q || "").replace(/[’‘]/g, "'").replace(/ /g, " ").replace(/[“”"]/g, " ").toLowerCase();
    const words = text.replace(/'s\b/g, "").split(/[^a-z0-9-]+/).map((t) => t.replace(/^-+|-+$/g, "")).filter(Boolean);
    const all = [];
    for (const w of words) {
      const prev = all[all.length - 1];
      if (/^[a-z]$/.test(w) && !STOP.has(w) && prev && /[a-z]$/.test(prev) && !STOP.has(prev)) all[all.length - 1] = `${prev}-${w}`;
      else all.push(w);
    }
    return all.filter((t) => !STOP.has(t));
  }

  function termSrc(term) {
    return escapeRe(term).replace(/([a-z])-(?=[a-z])/g, `$1${TERM_SEP}`);
  }

  function forms(t) {
    if (t.length < 4 || !/^[a-z]+$/.test(t) || NO_STEM.has(t)) return [];
    const bases = new Set([t]);
    const undouble = (b) => (/([b-df-hj-np-tv-z])\1$/.test(b) && !/(ll|ss|ff|zz)$/.test(b) ? b.slice(0, -1) : null);
    const verbBase = (b) => { bases.add(b); bases.add(b + "e"); const u = undouble(b); if (u) bases.add(u); };
    if (/ies$/.test(t)) bases.add(t.slice(0, -3) + "y");
    else if (/(ss|x|z|ch|sh)es$/.test(t)) bases.add(t.slice(0, -2));
    else if (/[^siu]s$/.test(t)) bases.add(t.slice(0, -1));
    else if (/ing$/.test(t) && t.length > 5) verbBase(t.slice(0, -3));
    else if (/ied$/.test(t)) bases.add(t.slice(0, -3) + "y");
    else if (/ed$/.test(t) && t.length > 4) verbBase(t.slice(0, -2));
    else if (/ery$/.test(t) && t.length > 6) bases.add(t.slice(0, -2));   // "bribery" -> "bribe"
    const out = new Set();
    for (const b of bases) {
      if (b.length < 3) continue;
      for (const f of [b, b + "s", b + "es", b + "ing", b + "ed"]) out.add(f);
      if (/e$/.test(b)) { out.add(b.slice(0, -1) + "ing"); out.add(b + "d"); }
      if (/[^aeiou]y$/.test(b)) { out.add(b.slice(0, -1) + "ies"); out.add(b.slice(0, -1) + "ied"); }
      if (b.length <= 5 && /[^aeiou][aeiou][b-df-hj-np-tv-z]$/.test(b)) { out.add(b + b.slice(-1) + "ing"); out.add(b + b.slice(-1) + "ed"); }
    }
    out.delete(t);
    return [...out];
  }

  function markQuery(root, q) {
    if (!root || !q) return;
    // "section 3-5", "§ 3-5": the number, whole ("3-5" is not "3-50").
    const cite = q.trim().match(/^(?:§+|sec(?:tion|\.)?)\s*(\d+[a-z]?(?:-\d+[a-z]*)*)\.?$/i);
    const terms = cite ? [] : queryTerms(q);
    if (!cite && !terms.length) return;
    const parts = cite ? [`\\b${escapeRe(cite[1].toLowerCase())}(?![\\w-])`] : [];
    for (const t of terms) {
      parts.push(`\\b${termSrc(t)}${t.length <= 2 ? "\\b" : ""}`);   // "AI": a whole word or nothing
      const alt = forms(t);
      if (alt.length) parts.push(`\\b(?:${alt.join("|")})\\b`);
    }
    const re = new RegExp(`(${parts.join("|")})`, "gi");
    const nodes = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (n.nodeValue.trim() && !(n.parentElement && n.parentElement.closest("button, mark"))) nodes.push(n);
    for (const node of nodes) {
      const text = node.nodeValue;
      re.lastIndex = 0;
      if (!re.test(text)) continue;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      let m;
      while ((m = re.exec(text))) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const mark = document.createElement("mark");
        mark.textContent = m[0];
        frag.appendChild(mark);
        last = m.index + m[0].length;
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
  }

  /* ---------- tabs, navigation, layout ---------- */

  let activate = () => {};

  /* Mark a jumped-to section or subsection for a moment; a targeted subsection
     also shows its Copy citation control, in place of any other. */
  function flash(target) {
    target.classList.add("is-highlighted");
    setTimeout(() => target.classList.remove("is-highlighted"), 2200);
    if (!target.classList.contains("subsec")) return;
    document.querySelectorAll(".subsec.cite-on").forEach((x) => x.classList.remove("cite-on"));
    target.classList.add("cite-on");
  }

  /* With one view (no policy tab) there are no tab buttons, and the address is left
     as the visitor wrote it: there is no tab for it to name. */
  function wireTabs() {
    const buttons = [...document.querySelectorAll(".tab-btn")];
    const tabbed = buttons.length > 1;
    activate = (tabId, focusAnchor) => {
      if (!document.getElementById(`panel-${tabId}`)) tabId = "text";
      buttons.forEach((b) => {
        const on = b.dataset.tab === tabId;
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
      });
      document.querySelectorAll(".tab-panel").forEach((p) => p.toggleAttribute("hidden", p.id !== `panel-${tabId}`));
      if (tabbed) try {
        const url = new URL(window.location);
        url.searchParams.set("tab", tabId);
        if (tabId === "text") { url.searchParams.delete("open"); url.searchParams.delete("why"); url.searchParams.delete("sec"); }
        if (focusAnchor && tabId === "text") url.hash = focusAnchor;
        else if (tabId !== "text") url.hash = "";
        history.replaceState(null, "", url);
      } catch (err) { /* file:// preview: the URL cannot be rewritten; the page still works */ }
      document.body.classList.toggle("on-text-tab", tabId === "text");
      if (focusAnchor) {
        requestAnimationFrame(() => {
          const target = document.getElementById(focusAnchor);
          if (!target) return;
          scrollToEl(target);
          flash(target);
        });
      }
    };
    buttons.forEach((b, i) => {
      b.addEventListener("click", () => activate(b.dataset.tab));
      b.addEventListener("keydown", (e) => {
        let j = null;
        if (e.key === "ArrowRight") j = (i + 1) % buttons.length;
        else if (e.key === "ArrowLeft") j = (i - 1 + buttons.length) % buttons.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = buttons.length - 1;
        if (j === null) return;
        e.preventDefault();
        buttons[j].focus();
        activate(buttons[j].dataset.tab);
      });
    });
    document.addEventListener("click", (e) => {
      const link = e.target.closest("[data-jump-tab]");
      if (!link) return;
      e.preventDefault();
      activate(link.dataset.jumpTab, link.getAttribute("href").replace("#", ""));
    });
    /* A cross-reference is a plain #anchor link, so the browser makes the jump (and the
       history entry Back returns through); this opens the full text first when the
       policy tab is showing, and marks the target. */
    window.addEventListener("hashchange", () => {
      const a = safeDecode(window.location.hash.slice(1));
      const t = a && document.getElementById(a);
      if (!t || !t.closest("#panel-text")) return;
      if (document.getElementById("panel-text").hidden) activate("text", a);
      else flash(t);
    });
  }

  /* Find-in-page opens a closed card; keep its button's state true to it. */
  function wireFindInPage() {
    const policy = document.getElementById("panel-policy");
    if (!policy) return;
    policy.addEventListener("beforematch", (e) => {
      const panel = e.target;
      const btn = controller(panel);
      if (!btn) return;
      btn.setAttribute("aria-expanded", "true");
      btn.classList.add("is-open");
      const host = btn.closest(".zoom-section, .zoom-point");
      if (host) host.classList.add("is-open");
    }, true);
  }

  function openOnLoadSection() {
    if (!focusSec) return;
    if (initialTab === "text") {
      if (document.getElementById(focusSec)) activate("text", focusSec);
      return;
    }
    const head = document.querySelector(`[data-section="${cssEsc(focusSec)}"]`);
    if (!head) return;
    const boiler = head.closest("details");
    if (boiler) boiler.open = true;
    const panel = document.getElementById(`zb-${focusSec}`);
    if (openOnLoad) {
      setOpen(head, panel, true);
      let point = null;
      let whyBtn = null;
      if (focusWhy) {
        whyBtn = panel.querySelector(`[data-note="${cssEsc(focusWhy)}"]`);
        if (whyBtn) point = whyBtn.closest(".zoom-point").querySelector("[data-point]");
      }
      if (!point) point = panel.querySelector("[data-point]");
      if (point) setOpen(point, document.getElementById(`body-${point.dataset.point}`), true);
      if (whyBtn) setOpen(whyBtn, document.getElementById(`why-${whyBtn.dataset.why}`), true);
    }
    markQuery(panel, query);
    requestAnimationFrame(() => {
      scrollToEl(head.closest(".zoom-section"));
      head.closest(".zoom-section").classList.add("is-highlighted");
    });
  }

  /* Scroll an element to just below the sticky header, measured now: the header's
     height changes as the web font loads and as the window narrows, so a value
     taken at load can leave the target under it. */
  function scrollToEl(el) {
    if (!el) return;
    const go = () => {
      const header = document.querySelector(".site-header");
      const h = header ? header.getBoundingClientRect().height : 0;
      const top = el.getBoundingClientRect().top + window.scrollY - h - 16;
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    };
    go();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(go));
  }

  /* The sticky header's real height, for scroll offsets and the sticky contents list. */
  function trackHeader() {
    const header = document.querySelector(".site-header");
    if (!header) return;
    const set = () => document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
    set();
    window.addEventListener("resize", set);
    if (window.ResizeObserver) new ResizeObserver(set).observe(header);
  }

  /* On a phone the contents list and the parts index fold behind a disclosure,
     closed by default; on a wider screen they are always open. */
  function wireNarrow() {
    const mq = window.matchMedia ? window.matchMedia("(max-width: 55rem)") : null;
    const apply = () => document.querySelectorAll("[data-collapse-narrow]").forEach((d) => { d.open = !(mq && mq.matches); });
    apply();
    if (mq && mq.addEventListener) mq.addEventListener("change", apply);
    document.querySelectorAll("[data-collapse-narrow] a").forEach((a) => a.addEventListener("click", () => {
      if (mq && mq.matches) a.closest("details").open = false;
    }));
  }

  /* The contents list marks the section on screen and keeps it in view. */
  function wireCurrentSection() {
    const toc = document.querySelector("#panel-text .toc-disclosure");
    const links = {};
    document.querySelectorAll("#panel-text [data-toc]").forEach((a) => { links[a.dataset.toc] = a; });
    if (!toc || !window.IntersectionObserver) return;
    const visible = new Set();
    let current = null;
    const pick = () => {
      // The section at the reading line: the last one whose top has passed just below the header.
      const line = (header ? header.getBoundingClientRect().height : 0) + 48;
      const els = [...visible].map((id) => document.getElementById(id)).filter(Boolean)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const passed = els.filter((el) => el.getBoundingClientRect().top <= line);
      const top = passed.length ? passed[passed.length - 1] : els[0];
      if (!top || top.id === current) return;
      if (current && links[current]) links[current].removeAttribute("aria-current");
      current = top.id;
      const a = links[current];
      if (!a) return;
      a.setAttribute("aria-current", "true");
      if (toc.scrollHeight > toc.clientHeight) {
        const aTop = a.offsetTop - toc.offsetTop;
        if (aTop < toc.scrollTop || aTop > toc.scrollTop + toc.clientHeight - a.offsetHeight) toc.scrollTop = Math.max(0, aTop - toc.clientHeight / 3);
      }
    };
    const header = document.querySelector(".site-header");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) { if (e.isIntersecting) visible.add(e.target.id); else visible.delete(e.target.id); }
      pick();
    }, { rootMargin: `-${(header ? header.offsetHeight : 120) + 8}px 0px -55% 0px` });
    document.querySelectorAll("#panel-text .statute-section").forEach((s) => io.observe(s));
  }

  function wireBackToTop(bill) {
    const btn = document.getElementById("back-to-top");
    if (!btn) return;
    if (bill.sections.length < 15) { btn.remove(); return; }
    const update = () => btn.classList.toggle("is-shown", window.scrollY > window.innerHeight * 1.5);
    window.addEventListener("scroll", update, { passive: true });
    update();
    // Focus follows to the top: the selected tab, or with one view the bill's title.
    btn.addEventListener("click", () => {
      const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      let target = document.querySelector('.tab-btn[aria-selected="true"]');
      if (!target) {
        target = document.getElementById("law-title");
        if (target) target.setAttribute("tabindex", "-1");
      }
      if (target) target.focus({ preventScroll: true });
    });
  }

  /* ---------- header ---------- */

  /* What the number before the hyphen means, from the bill's own structure
     (drafting-rules.md: each bill numbers its sections by Section 0, 1 ... N;
     the amendment bills by Title, § 501 in Title V; the health care bills keep
     one number per topic across every bill that carries it). Stated only where
     every numbered section in the bill fits the pattern. */
  function numberingLine(bill) {
    const roman = (r) => { const v = { I: 1, V: 5, X: 10, L: 50, C: 100 }; let t = 0; for (let i = 0; i < r.length; i++) { const a = v[r[i]], b = v[r[i + 1]]; t += b > a ? -a : a; } return t; };
    const partNum = (p) => {
      const m = (p || "").match(/^(SECTION|TITLE)\s+([0-9]+[A-Z]?|[IVXLC]+)(?![A-Za-z0-9])/);
      return m ? { kind: m[1], raw: m[2], n: /^\d/.test(m[2]) ? parseInt(m[2], 10) : roman(m[2]), digits: /^\d/.test(m[2]) } : null;
    };
    let hy = 0, fits = 0, three = 0, fits3 = 0, parts = 0, example = null, example3 = null;
    for (const s of bill.sections) {
      const h = plainHeading(s.heading);
      const pn = partNum(s.part);
      if (pn) parts += 1;
      const m = h.match(/^§\s*([0-9]+[A-Z]?)-([0-9]+[A-Z]?)/);
      const m3 = h.match(/^§\s*([0-9]{3,4})[A-Z]?\./);
      if (m) {
        hy += 1;
        if (!pn) continue;
        const ok = pn.digits ? m[1].toUpperCase() === pn.raw.toUpperCase() : parseInt(m[1], 10) === pn.n && /^\d+$/.test(m[1]);
        if (!ok) return "";
        fits += 1;
        if (!example && pn.n > 0) example = { sec: `${m[1]}-${m[2]}`, pn };
      } else if (m3) {
        three += 1;
        if (!pn) continue;
        if (Math.floor(Number(m3[1]) / 100) !== pn.n) return "";
        fits3 += 1;
        if (!example3 && pn.n > 1) example3 = { sec: m3[1], pn };
      }
    }
    if (fits >= 3 && example) {
      const unit = example.pn.kind === "TITLE" ? `Title ${example.pn.raw}` : `Section ${example.pn.raw}`;
      return `The number before the hyphen is the ${example.pn.kind === "TITLE" ? "Title" : "Section"} a section sits in: § ${example.sec} is in ${unit}.`;
    }
    if (fits3 >= 3 && example3) {
      return `The leading digit${example3.sec.length > 3 ? "s give" : " gives"} the Title: § ${example3.sec} is in Title ${example3.pn.raw}.`;
    }
    if (hy >= 3 && parts === 0) {
      return "Section numbers are shared across the health care bills: the number before the hyphen names a topic and stays the same in whichever bill carries it, so the numbers here are not consecutive.";
    }
    return "";
  }

  function renderHeader(meta, found, bill) {
    const title = found ? found.bill.name : meta.title;
    BILL_NAME = title.replace(/^The\s+/, "");
    document.title = `${title} — ${SITE_NAME}`;
    document.getElementById("law-title").textContent = title;
    const aka = document.getElementById("law-aka");
    if (aka && found && found.bill.display_name && found.bill.display_name !== title) {
      aka.textContent = `On the playlists as ${found.bill.display_name}`;
      aka.hidden = false;
    }
    AS_OF = bill.asOf || "";
    const metaEl = document.getElementById("law-meta");
    if (metaEl) {
      const bits = [];
      if (AS_OF) bits.push(`<span class="law-asof">Text as of <time datetime="${esc(AS_OF)}">${esc(AS_OF)}</time></span>`);
      const num = numberingLine(bill);
      if (num) bits.push(`<span class="law-numbering">${esc(num)}</span>`);
      metaEl.innerHTML = bits.join("");
      metaEl.hidden = !bits.length;
    }
    // D1673: the promises this bill keeps, each with how, in place of a one-line description.
    document.getElementById("law-line").innerHTML = found ? window.AGENDA.promiseHows(found.bill) : "";
    const crumbs = document.getElementById("crumbs");
    crumbs.innerHTML = found
      ? `<a href="topic.html">Policy Playlists</a> <span>›</span> <a href="topic.html?topic=${found.category.slug}">${found.category.title}</a> <span>›</span> <span>Track ${found.category.bills.findIndex((b) => b.slug === billSlug) + 1} of ${found.category.bills.length}</span> <span class="pill-status pill-${esc(found.bill.status)}">${esc(window.AGENDA.statusLabel(found.bill.status))}</span>`
      : `<a href="topic.html">Policy Playlists</a>`;
    if (found) {
      const bills = found.category.bills.filter((b) => b.slug);
      const i = bills.findIndex((b) => b.slug === billSlug);
      const prev = bills[i - 1];
      const next = bills[i + 1];
      document.getElementById("bill-prev-next").innerHTML =
        // W3938: previous and next move through this bill's own playlist, as tracks.
        `${prev ? `<a class="track-link" href="law.html?bill=${prev.slug}">${window.trackIcon("prev")} <span><span class="track-label">Previous track</span>${prev.name}</span></a>` : "<span></span>"}` +
        `${next ? `<a class="track-link track-link-next" href="law.html?bill=${next.slug}"><span><span class="track-label">Next track</span>${next.name}</span> ${window.trackIcon("next")}</a>` : `<a class="track-link track-link-next" href="topic.html?topic=${found.category.slug}"><span><span class="track-label">End of playlist</span>All of ${found.category.title}</span> ${window.trackIcon("next")}</a>`}`;
    } else {
      const nav = document.getElementById("bill-prev-next");
      if (nav) nav.remove();
    }
    const printNote = document.getElementById("print-note");
    if (printNote) printNote.textContent = `${pageUrl("&tab=text")} · ${SITE_NAME} model text${AS_OF ? ` as of ${AS_OF}` : ""}. Nothing here is enacted law.`;
  }

  /* Elements with nothing to hold are removed, not left empty: an empty breadcrumb or
     playlist nav is still a landmark to a screen reader. */
  function removeEls(...sel) {
    for (const s of sel) { const el = document.querySelector(s); if (el) el.remove(); }
  }

  function renderNotFound() {
    const title = "Bill not found";
    document.title = `${title} — ${SITE_NAME}`;
    document.getElementById("law-title").textContent = title;
    removeEls(".tab-row", "#panel-text", "#crumbs", "#bill-prev-next", "#related-bills");
    document.querySelector(".law-header-bill").classList.add("is-single");
    const panel = document.getElementById("panel-policy");
    panel.hidden = false;
    panel.removeAttribute("role");
    panel.removeAttribute("aria-labelledby");
    panel.innerHTML = `<p class="law-summary">No bill on this site has the address “${esc(billSlug)}”. ` +
      `Browse the bills in the <a href="topic.html">Policy Playlists</a>, or <a href="search.html?q=${encodeURIComponent(billSlug)}">search for “${esc(billSlug)}”</a>.</p>`;
    const top = document.getElementById("back-to-top");
    if (top) top.remove();
  }

  window.siteReady(() => {
    trackHeader();
    const bill = window.SITE_DATA.bills[billSlug];
    const links = window.SITE_DATA.links[billSlug];
    const meta = (window.SITE_DATA.billsIndex || []).find((b) => b.slug === billSlug) || { slug: billSlug, title: billSlug };
    if (!bill) { renderNotFound(); return; }
    BILL = bill;
    renderHeader(meta, window.AGENDA.findBill(billSlug), bill);
    /* The policy tab shows only for a bill whose plain-English points are ready: the
       build ships a links file only when it is marked policyReady (D2028, author
       2026-10-01). Every other bill page is the law alone: the tab row and the policy
       panel leave the page, and an old policy-tab address opens the full text at the
       same section. The policy code stays for the bill that is marked ready. */
    const single = !links;
    if (links) renderPolicyTab(bill, links);
    else {
      initialTab = "text";
      removeEls(".tab-row", "#panel-policy");
      const text = document.getElementById("panel-text");
      text.removeAttribute("role");
      text.removeAttribute("aria-labelledby");
      document.querySelector(".law-header-bill").classList.add("is-single");
    }
    const pointed = new Set();
    document.querySelectorAll("#panel-policy .zoom-section[data-anchor]").forEach((s) => { if (s.querySelector(".zoom-point")) pointed.add(s.dataset.anchor); });
    renderTextTab(bill, (a) => pointed.has(a), single);
    const bills = siteBills();
    linkRefs(document.getElementById("panel-text"), bills);
    linkRefs(document.getElementById("panel-policy"), bills);
    renderRelated(bill, bills);
    /* A #hash opens the full text only when it names something there. With no ?tab=,
       or one naming no panel, the page opens on the full text for such a hash and
       otherwise on the default view, never on no panel at all. */
    const hashEl = hashAnchor ? document.getElementById(hashAnchor) : null;
    const hashInText = !!(hashEl && hashEl.closest("#panel-text"));
    if (!params.get("tab") || !["policy", "text"].includes(initialTab) || !document.getElementById(`panel-${initialTab}`)) {
      initialTab = hashInText || single ? "text" : "policy";
    }
    wireTabs();
    wireFindInPage();
    wireNarrow();
    activate(initialTab);
    if (hashInText) {
      activate("text", hashAnchor);
      markQuery(document.getElementById(hashAnchor), query);
    } else if (focusSec) {
      openOnLoadSection();
      if (initialTab === "text") markQuery(document.getElementById(focusSec), query);
    }
    wireCurrentSection();
    wireBackToTop(bill);
  });
})();
