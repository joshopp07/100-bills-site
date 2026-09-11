/* Client-side search over SITE_DATA. No server and no external request.

   Two things this gets right that a naive version does not.

   1. Word boundaries, never raw substrings. Searching "AI" used to return the
      Intercity Rail Act, because "rail" contains "ai". A term now has to begin
      a word, so "hous" still finds "housing" while "ai" no longer finds
      "rail". A term of one or two characters has to match a whole word, which
      is what makes "AI" behave: it finds the AI Safety Act and not "aid".

   2. The whole section, not the first 400 characters. The prebuilt index
      carries a short excerpt for display, but the full statutory text is
      already loaded on the page, so matching runs against that. Before this,
      "prior authorization" found two sections out of six.

   A multi-word search requires every word, so "prior authorization" returns the
   six sections that discuss it rather than everything containing either word.
   Scoring, highest first: a whole-word hit in the title, a whole-word hit in
   the text, a prefix hit in the title, a prefix hit in the text, and a bonus
   for the whole phrase. The result snippet is the passage around the first
   hit rather than the opening line. */
(function () {
  const params = new URLSearchParams(window.location.search);
  let corpus = null;

  function tokens(q) {
    return q.toLowerCase().split(/[^a-z0-9§-]+/).filter((t) => t.length > 1);
  }

  function escapeRe(t) {
    return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function pattern(term) {
    const e = escapeRe(term);
    return {
      term,
      whole: new RegExp(`\\b${e}\\b`, "i"),
      prefix: new RegExp(`\\b${e}`, "i"),
      shortTerm: term.length <= 2,   // "AI", "IG": a whole word or nothing
    };
  }

  /* The index holds a display excerpt. Searching wants the whole section, and
     the bills are already in memory, so pair them once on the first query. */
  function buildCorpus() {
    const data = window.SITE_DATA || {};
    const index = data.searchIndex || [];
    const byAnchor = {};
    for (const slug of Object.keys(data.bills || {})) {
      const map = (byAnchor[slug] = {});
      for (const s of data.bills[slug].sections) map[s.anchor] = s.body;
    }
    return index.map((e) => {
      const full = e.t === "section" && byAnchor[e.slug] && byAnchor[e.slug][e.anchor];
      return { e, title: e.title || "", body: full || e.text || "" };
    });
  }

  function score(row, pats, phraseRe) {
    let s = 0;
    let matched = 0;
    for (const p of pats) {
      let hit = 0;
      if (p.whole.test(row.title)) hit += 6;
      else if (!p.shortTerm && p.prefix.test(row.title)) hit += 3;
      if (p.whole.test(row.body)) hit += 3;
      else if (!p.shortTerm && p.prefix.test(row.body)) hit += 1;
      if (hit) matched += 1;
      s += hit;
    }
    if (matched < pats.length) return 0;   // every word has to appear somewhere
    if (phraseRe && (phraseRe.test(row.title) || phraseRe.test(row.body))) s += 6;
    if (row.e.t === "bill") s += 1;
    return s;
  }

  /* Show the passage the term appears in, not always the opening line. */
  function snippet(text, pats, len) {
    const width = len || 240;
    let at = -1;
    for (const p of pats) {
      const m = text.match(p.shortTerm ? p.whole : p.prefix);
      if (m && m.index !== undefined && (at < 0 || m.index < at)) at = m.index;
    }
    if (at < 0) return text.slice(0, width) + (text.length > width ? "…" : "");
    const start = Math.max(0, at - 90);
    const cut = text.slice(start, start + width);
    return (start > 0 ? "…" : "") + cut.trim() + (start + width < text.length ? "…" : "");
  }

  function clean(t) {
    return window.stripMd ? window.stripMd(t) : t;
  }

  function highlight(text, pats) {
    let out = window.escapeHtml ? window.escapeHtml(text) : text;
    for (const p of pats) {
      const re = new RegExp(`\\b(${escapeRe(p.term)}${p.shortTerm ? "\\b" : ""})`, "ig");
      out = out.replace(re, "<mark>$1</mark>");
    }
    return out;
  }

  function href(entry) {
    if (entry.t === "bill") return entry.slug ? `law.html?bill=${entry.slug}` : `topic.html?topic=${entry.cat}`;
    const sec = entry.anchor ? `&sec=${entry.anchor}&open=1` : "";
    return `law.html?bill=${entry.slug}${sec}`;
  }

  function kind(entry) {
    return { bill: "Bill", section: "Section", bullet: "Policy point" }[entry.t] || "";
  }

  function run(q) {
    const mount = document.getElementById("search-results");
    const terms = tokens(q);
    if (!terms.length) {
      mount.innerHTML = "";
      return;
    }
    if (!corpus) corpus = buildCorpus();
    const pats = terms.map(pattern);
    const phraseRe = terms.length > 1 ? new RegExp(`\\b${escapeRe(terms.join(" "))}\\b`, "i") : null;
    const hits = corpus
      .map((row) => ({ row, s: score(row, pats, phraseRe) }))
      .filter((h) => h.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 60);
    if (!hits.length) {
      mount.innerHTML = `<p class="search-empty">Nothing matched “${window.inlineMd(q)}”. Try a different word.</p>`;
      return;
    }
    mount.innerHTML = `<p class="search-count">${hits.length} result${hits.length === 1 ? "" : "s"}</p>` +
      hits.map(({ row }) => {
        const e = row.e;
        return `<a class="result" href="${href(e)}">
          <div class="result-kind">${kind(e)}${e.bill ? ` · ${e.bill}` : ""}</div>
          <div class="result-title">${highlight(clean(row.title), pats)}</div>
          <div class="result-text">${highlight(snippet(clean(row.body), pats), pats)}</div>
        </a>`;
      }).join("");
  }

  window.siteReady(() => {
    const box = document.getElementById("search-box");
    const form = document.getElementById("search-form");
    const initial = params.get("q") || "";
    box.value = initial;
    if (initial) run(initial);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = box.value.trim();
      try {
        const url = new URL(window.location);
        if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
        history.replaceState(null, "", url);
      } catch (err) { /* file:// preview */ }
      run(q);
    });
    let timer = null;                 // matching runs over the whole corpus
    box.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (box.value.trim().length >= 2) run(box.value.trim());
      }, 150);
    });
    box.focus();
  });
})();
