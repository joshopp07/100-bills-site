/* Client-side search over SITE_DATA. No server and no external request.

   Matching.
   1. Word boundaries, never raw substrings. Searching "AI" used to return the
      Intercity Rail Act, because "rail" contains "ai". A term now has to begin
      a word, so "hous" still finds "housing" while "ai" no longer finds
      "rail". A term of one or two characters has to match a whole word, which
      is what makes "AI" behave: it finds the AI Safety Act and not "aid".
   2. The whole text, not an excerpt. The index carries headings only; the
      full statutory text, the site pages and the notes are already loaded on
      the page, so matching runs against them.
   3. A multi-word search requires every word except the small ones (the, a,
      an, of, and, act, to, in, for, all, on, or, by, with), so "prior
      authorization" returns the sections that discuss it, and "Medicare for
      All" is not sunk by "for" and "all". Words in double quotes are a phrase
      that must appear as written, small words included.
   4. Word forms: "banks" also finds "bank", "tenants" "tenant",
      "gerrymandering" "gerrymandered". The form typed scores higher.
   5. A one-letter word joins the word before it, so "pre K" is "pre-K" and
      "Part B" is "Part-B"; a hyphen between letters also matches a space or a
      period, so "pre-K" finds "pre K" and "U S C" finds "U.S.C.".
   6. When fewer than three results have every word in one place, partial
      matches follow, labeled: first bills with every word somewhere in them,
      then results with some of the words.
   7. A query with "." or "§" in it ("26 U.S.C.") also matches as a literal
      string, because a citation is not a list of words. A section citation
      ("section 3-5", "§ 3-5", "sec. 3-5") puts the section with that number in
      its heading first.
   Curly and straight apostrophes are the same character to the search.

   Scoring, highest first: a whole-word hit in the title, another form of the
   word in the title, a prefix hit in the title, then the same three in the
   text, and a bonus for the whole phrase or the literal string. Results are
   grouped by bill, under the name its card carries.

   The address bar always carries the query (q=) and the type filter (type=),
   so a search is a link. A result passes q= on to the page it opens, which
   marks the terms in the section it opens. */
(function () {
  const params = new URLSearchParams(window.location.search);
  const PAGE = 60;
  const PARTIAL_BELOW = 3;   // fewer full matches than this, and partial matches follow
  const STOP = new Set(["the", "a", "an", "of", "and", "act", "to", "in", "for", "all", "on", "or", "by", "with"]);
  const EXAMPLES = ["overdraft", "wetlands", "recusal", "child care"];
  // The policy-point and note types return when a bill has a policy tab; until then
  // the corpus holds none, and a type with no entries is never offered.
  const TYPES = [
    { id: "all", label: "All" },
    { id: "bill", label: "Bills" },
    { id: "section", label: "Sections" },
    { id: "page", label: "Pages" },
    { id: "bullet", label: "Policy points" },
    { id: "note", label: "Why this? notes" },
  ];
  // Words a plural rule would wrongly shorten ("news" is not "new").
  const NO_STEM = new Set(["news", "series", "species", "means", "this", "its", "has", "was", "does",
    "less", "unless", "across", "whereas", "always", "perhaps", "thus", "status", "bus", "gas", "plus",
    "bonus", "census", "focus", "virus", "lens"]);
  const SEP = "[-.\\s]";       // what a hyphen between letters also matches
  let corpus = null;
  let types = null;
  let vocab = null;
  let shown = PAGE;
  let type = TYPES.some((t) => t.id === params.get("type")) ? params.get("type") : "all";
  let lastQuery = "";

  const norm = (s) => (s || "").replace(/[’‘]/g, "'").replace(/ /g, " ");

  function escapeRe(t) {
    return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* Letters and digits, hyphens kept inside a word, a possessive "'s" dropped. */
  function words(s) {
    return s.replace(/'s\b/g, "").split(/[^a-z0-9-]+/).map((t) => t.replace(/^-+|-+$/g, "")).filter(Boolean);
  }

  /* The query as words and quoted phrases. A one-letter word joins the word before it
     when that word ends in a letter and neither is a small word. */
  function parse(q) {
    const text = norm(q).replace(/[“”]/g, '"').toLowerCase();
    const phrases = [];
    const rest = text.replace(/"([^"]*)"/g, (m, p) => {
      const w = words(p);
      if (w.length) phrases.push(w);
      return " ";
    });
    const all = [];
    for (const w of words(rest)) {
      const prev = all[all.length - 1];
      if (/^[a-z]$/.test(w) && !STOP.has(w) && prev && /[a-z]$/.test(prev) && !STOP.has(prev)) all[all.length - 1] = `${prev}-${w}`;
      else all.push(w);
    }
    return { all, phrases };
  }

  /* A term as a regular expression source: a hyphen between letters matches a hyphen,
     a space or a period. */
  function termSrc(term) {
    return escapeRe(term).replace(/([a-z])-(?=[a-z])/g, `$1${SEP}`);
  }

  /* Other forms of a word: the base a plural or -ing/-ed/-ery form comes from, and that
     base's own plural and verb forms. Only whole words; a form found nowhere costs nothing. */
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

  function pattern(term) {
    const src = termSrc(term);
    const alt = forms(term);
    return {
      term,
      src,
      whole: new RegExp(`\\b${src}\\b`, "i"),
      prefix: new RegExp(`\\b${src}`, "i"),
      variant: alt.length ? new RegExp(`\\b(?:${alt.join("|")})\\b`, "i") : null,
      variantSrc: alt.join("|"),
      shortTerm: term.length <= 2,   // "AI", "IG": a whole word or nothing
    };
  }

  /* A quoted phrase: every word as written, in order. */
  function phrasePattern(ws) {
    const src = ws.map(termSrc).join(`(?:'s)?${SEP}+`);
    const re = new RegExp(`\\b${src}\\b`, "i");
    return { term: ws.join(" "), src, whole: re, prefix: re, variant: null, variantSrc: "", shortTerm: true };
  }

  function slugify(name) {
    return "bill-" + norm(name).toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  /* The index holds titles. Searching wants the whole section, page or note, and all
     are already in memory, so pair them once on the first query. A bill's results
     carry the name its card shows, not the bill's formal title. */
  function buildCorpus() {
    const data = window.SITE_DATA || {};
    const index = data.searchIndex || [];
    const byAnchor = {};
    for (const slug of Object.keys(data.bills || {})) {
      const map = (byAnchor[slug] = {});
      for (const s of data.bills[slug].sections) map[s.anchor] = s.body;
    }
    const notes = {};
    for (const n of ((data.notes || {}).sections || [])) notes[n.anchor] = n.body;
    const pages = data.pages || {};
    const billName = {};
    for (const slug of Object.keys(data.bills || {})) billName[slug] = data.bills[slug].title;
    for (const c of ((data.agenda || {}).categories || [])) {
      for (const b of c.bills) if (b.slug) billName[b.slug] = b.display_name || b.name;
    }
    return index.map((e) => {
      let full = null;
      if (e.t === "section") full = byAnchor[e.slug] && byAnchor[e.slug][e.anchor];
      if (e.t === "note") full = notes[e.note];
      if (e.t === "page") full = pages[e.slug] && (pages[e.slug].markdown || "").replace(/\{\{COUNTDOWN\}\}/g, "days");
      const title = norm(e.title || "");
      const body = norm(full || e.text || "");
      return { e, title, body, bill: (e.t !== "bill" && e.t !== "page" && (billName[e.slug] || e.bill)) || "", lower: (title + "\n" + body).toLowerCase().replace(/\s+/g, " ") };
    });
  }

  /* Words a misspelling can be corrected to: bill names and section headings. */
  function buildVocab() {
    const ws = new Set();
    for (const row of corpus) {
      if (row.e.t !== "bill" && row.e.t !== "section") continue;
      for (const w of row.title.toLowerCase().split(/[^a-z]+/)) if (w.length >= 4) ws.add(w);
    }
    return [...ws];
  }

  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diag = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = tmp;
      }
    }
    return prev[b.length];
  }

  /* "recusl" -> "recusal": each word found nowhere on the site becomes the closest
     heading word within one edit (two for longer words), preferring a word that
     shares the first letter. A word the site contains is left as it is. */
  function suggest(terms, unknown) {
    if (!vocab) vocab = buildVocab();
    let changed = false;
    const fixed = terms.map((t, i) => {
      if (!unknown[i] || t.length < 4 || /[\d-]/.test(t) || vocab.includes(t)) return t;
      const limit = t.length >= 7 ? 2 : 1;
      let best = null;
      for (const w of vocab) {
        const d = distance(t, w);
        if (d <= limit && (!best || d < best.d || (d === best.d && w[0] === t[0] && best.w[0] !== t[0]))) best = { w, d };
      }
      if (best) { changed = true; return best.w; }
      return t;
    });
    return changed ? fixed.join(" ") : "";
  }

  /* The score, and which terms the row holds as a bit mask. */
  function score(row, q) {
    let s = 0;
    let mask = 0;
    q.pats.forEach((p, i) => {
      let hit = 0;
      if (p.whole.test(row.title)) hit += 6;
      else if (p.variant && p.variant.test(row.title)) hit += 5;
      else if (!p.shortTerm && p.prefix.test(row.title)) hit += 3;
      if (p.whole.test(row.body)) hit += 3;
      else if (p.variant && p.variant.test(row.body)) hit += 2;
      else if (!p.shortTerm && p.prefix.test(row.body)) hit += 1;
      if (hit) mask |= 1 << i;
      s += hit;
    });
    const lit = !!q.literal && row.lower.includes(q.literal);
    if (lit) s += 8;
    if (q.phraseRe && (q.phraseRe.test(row.title) || q.phraseRe.test(row.body))) s += 6;
    if (q.citeRe && row.e.t === "section" && q.citeRe.test(row.title)) s += 100;
    if (row.e.t === "bill") s += 1;
    const full = lit || (q.pats.length > 0 && mask === q.fullMask);
    return { s, mask, full };
  }

  function bits(n) {
    let c = 0;
    for (; n; n &= n - 1) c += 1;
    return c;
  }

  function groupOf(row) {
    const e = row.e;
    if (e.t === "page") return { key: "pages", slug: null, name: "Pages on this site" };
    if (e.t === "bill") return { key: `bill:${e.slug || e.title}`, slug: e.slug, name: e.title };
    return { key: `bill:${e.slug}`, slug: e.slug, name: row.bill };
  }

  /* Everything a query needs to score a row. */
  function compile(raw) {
    const q = (raw || "").trim();
    // "section 3-5", "§ 3-5", "sec. 3-5": the number is the term, and a heading that
    // begins with it ranks first.
    const cite = q.match(/^(?:§+|sec(?:tion|\.)?)\s*(\d+[a-z]?(?:-\d+[a-z]*)*)\.?$/i);
    if (cite) {
      const num = cite[1].toLowerCase();
      // Whole number only: "3-5" is not "3-50" or "3-5C".
      const pats = [{ ...pattern(num), shortTerm: true }];
      return { pats, fullMask: 1, literal: "", phraseRe: null, partialOk: false,
        citeRe: new RegExp(`^(?:§+|sec(?:tion|\\.)?)\\s*${escapeRe(num)}(?![\\w-])`, "i") };
    }
    const { all, phrases } = parse(q);
    const terms = all.filter((t) => !STOP.has(t));
    const required = terms.length || phrases.length ? terms : all;
    const literal = /[.§]/.test(q) ? norm(q).toLowerCase().replace(/\s+/g, " ") : "";
    const pats = required.slice(0, 20).map(pattern).concat(phrases.slice(0, 5).map(phrasePattern));
    const phraseRe = all.length > 1 ? new RegExp(`\\b${all.map(termSrc).join(`(?:'s)?${SEP}+`)}\\b`, "i") : null;
    return { pats, fullMask: (1 << pats.length) - 1, literal, phraseRe, citeRe: null, partialOk: pats.length > 1 && !literal, required };
  }

  /* Full matches, and partial ones when there are few: bills holding every word
     somewhere first, then rows with some of the words. */
  function find(q) {
    const scored = corpus.map((row) => ({ row, ...score(row, q) })).filter((h) => h.s > 0 && (h.full || h.mask));
    const full = scored.filter((h) => h.full).sort((a, b) => b.s - a.s);
    let partial = [];
    if (q.partialOk && full.length < PARTIAL_BELOW) {
      const billMask = {};
      for (const h of scored) { const k = groupOf(h.row).key; billMask[k] = (billMask[k] || 0) | h.mask; }
      partial = scored.filter((h) => !h.full).map((h) => ({ ...h, tier: billMask[groupOf(h.row).key] === q.fullMask ? 1 : 2 }))
        .sort((a, b) => a.tier - b.tier || bits(b.mask) - bits(a.mask) || b.s - a.s);
    }
    return { full, partial };
  }

  /* Show the passage the term appears in, not always the opening line. */
  function snippet(text, pats, literal, len) {
    const width = len || 240;
    let at = -1;
    if (literal) at = text.toLowerCase().indexOf(literal);
    for (const p of pats) {
      for (const re of [p.shortTerm ? p.whole : p.prefix, p.variant]) {
        const m = re && text.match(re);
        if (m && m.index !== undefined && (at < 0 || m.index < at)) at = m.index;
      }
    }
    if (at < 0) return text.slice(0, width) + (text.length > width ? "…" : "");
    const start = Math.max(0, at - 90);
    const cut = text.slice(start, start + width);
    return (start > 0 ? "…" : "") + cut.trim() + (start + width < text.length ? "…" : "");
  }

  function clean(t) {
    return window.plainText ? window.plainText(t) : (window.stripMd ? window.stripMd(t) : t);
  }

  /* Escape first, then mark: the query never reaches the page as markup. Every term
     is letters, digits and hyphens, so its pattern needs no escaping of its own. */
  function highlight(text, pats, literal) {
    let out = window.escapeHtml(text);
    const parts = [];
    for (const p of pats) {
      parts.push(`\\b${p.src}${p.shortTerm ? "\\b" : ""}`);
      if (p.variantSrc) parts.push(`\\b(?:${p.variantSrc})\\b`);
    }
    if (literal) parts.unshift(escapeRe(window.escapeHtml(literal)));
    if (!parts.length) return out;
    const re = new RegExp(`(${parts.join("|")})`, "ig");
    // Only outside entities: split on them so "&amp;" is never cut by a mark.
    return out.split(/(&[a-z#0-9]+;)/i).map((seg) => (/^&[a-z#0-9]+;$/i.test(seg) ? seg : seg.replace(re, "<mark>$1</mark>"))).join("");
  }

  function href(entry, q) {
    const qq = q ? `&q=${encodeURIComponent(q)}` : "";
    if (entry.t === "page") return entry.slug === "home" ? "index.html" : `page.html?p=${encodeURIComponent(entry.slug)}`;
    if (entry.t === "bill") {
      // from=search: the bill page marks the Search tab as where the reader came from (nav.js).
      if (entry.slug) return `law.html?bill=${entry.slug}&from=search`;
      // A planned or proposed bill has no page yet: its card on its playlist.
      return `topic.html?topic=${encodeURIComponent(entry.cat)}#${slugify(entry.name || entry.title)}`;
    }
    const sec = entry.anchor ? `&sec=${encodeURIComponent(entry.anchor)}&open=1` : "";
    const why = entry.t === "note" && entry.note ? `&why=${encodeURIComponent(entry.note)}` : "";
    return `law.html?bill=${entry.slug}&from=search${sec}${why}${qq}`;
  }

  function kind(entry) {
    if (entry.t === "bill") return entry.slug ? "Bill" : `Bill · ${entry.status === "planned" ? "planned" : "proposed"}, text not yet published`;
    return { section: "Section", page: "Page", bullet: "Policy point", note: "Why this? note" }[entry.t] || "";
  }

  function setUrl(q) {
    try {
      const url = new URL(window.location);
      if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
      if (type !== "all") url.searchParams.set("type", type); else url.searchParams.delete("type");
      history.replaceState(null, "", url);
    } catch (err) { /* file:// preview */ }
  }

  function playlists() {
    const cats = (window.AGENDA && window.AGENDA.categories()) || [];
    return `<ul class="search-chips">${cats.map((c) => `<li><a href="topic.html?topic=${encodeURIComponent(c.slug)}">${window.escapeHtml(c.title)}</a></li>`).join("")}</ul>`;
  }

  function emptyState() {
    return `<p class="search-empty">Try one of these:</p><ul class="search-chips">${EXAMPLES.map((x) =>
      `<li><a href="search.html?q=${encodeURIComponent(x)}" data-example="${window.escapeHtml(x)}">${window.escapeHtml(x)}</a></li>`).join("")}</ul>`;
  }

  function filters(counts) {
    // A type with no results is not offered; the selected type always has some.
    return `<div class="search-tools" role="group" aria-label="Show">${TYPES.filter((t) => t.id === "all" || counts[t.id]).map((t) => {
      const n = t.id === "all" ? counts.all : counts[t.id];
      return `<button type="button" class="search-filter" data-type="${t.id}" aria-pressed="${t.id === type}">${t.label} (${n})</button>`;
    }).join("")}</div>`;
  }

  function groupsHtml(rows, q, pats, literal, partial) {
    // Group by bill, in the order each bill's best result ranks.
    const groups = [];
    const byKey = {};
    for (const h of rows) {
      const g = groupOf(h.row);
      if (!byKey[g.key]) {
        byKey[g.key] = { ...g, rows: [] };
        groups.push(byKey[g.key]);
      }
      byKey[g.key].rows.push(h);
    }
    return groups.map((g) => {
      const title = g.slug ? `<a href="law.html?bill=${g.slug}&from=search">${window.escapeHtml(g.name)}</a>` : window.escapeHtml(g.name);
      return `<section class="search-group"><h2 class="search-group-title">${title}<span class="search-group-count">${g.rows.length} result${g.rows.length === 1 ? "" : "s"}</span></h2>` +
        g.rows.map(({ row }) => {
          const e = row.e;
          return `<a class="result" href="${href(e, q)}">
            <div class="result-kind">${window.escapeHtml(kind(e) + (partial ? " · partial match" : ""))}</div>
            <div class="result-title">${highlight(clean(row.title), pats, literal)}</div>
            <div class="result-text">${highlight(snippet(clean(row.body), pats, literal), pats, literal)}</div>
          </a>`;
        }).join("") + `</section>`;
    }).join("");
  }

  function run(raw, keepShown) {
    const mount = document.getElementById("search-results");
    const q = (raw || "").trim();
    lastQuery = q;
    if (!keepShown) shown = PAGE;
    if (!corpus) {
      corpus = buildCorpus();
      types = new Set(corpus.map((row) => row.e.t));
      if (!types.has(type)) type = "all";   // e.g. a shared link to a type the site no longer has
    }
    setUrl(q);
    const cq = compile(q);
    if (!cq.pats.length && !cq.literal) {
      mount.innerHTML = emptyState();
      return;
    }
    const { full, partial } = find(cq);
    // Suggest a spelling only for a word found nowhere on the site, and only when the
    // corrected search finds something.
    let suggestion = "";
    if (cq.required) {
      const reqPats = cq.pats.slice(0, cq.required.length);
      const unknown = reqPats.map((p) => !p.shortTerm && !corpus.some((row) => p.prefix.test(row.lower) || (p.variant && p.variant.test(row.lower))));
      const fix = unknown.some(Boolean) ? suggest(cq.required, unknown) : "";
      if (fix && fix !== cq.required.join(" ") && find(compile(fix)).full.length) {
        suggestion = `<p class="search-suggest">Did you mean <a href="search.html?q=${encodeURIComponent(fix)}" data-example="${window.escapeHtml(fix)}">${window.escapeHtml(fix)}</a>?</p>`;
      }
    }
    const hits = full.concat(partial);
    if (!hits.length) {
      mount.innerHTML = `<p class="search-empty">Nothing matched “${window.escapeHtml(q)}”.</p>${suggestion}` +
        `<p class="search-empty">Browse the Policy Playlists instead:</p>${playlists()}`;
      return;
    }
    const counts = { all: hits.length };
    for (const h of hits) counts[h.row.e.t] = (counts[h.row.e.t] || 0) + 1;
    // A type with nothing to show falls back to All rather than an empty list.
    if (type !== "all" && !counts[type]) { type = "all"; setUrl(q); }
    const keep = (h) => type === "all" || h.row.e.t === type;
    const fullShown = full.filter(keep);
    const partialShown = partial.filter(keep);
    const total = fullShown.length + partialShown.length;
    const fullPage = fullShown.slice(0, shown);
    const partialPage = partialShown.slice(0, Math.max(0, shown - fullPage.length));
    const onPage = fullPage.length + partialPage.length;
    const count = total > onPage
      ? `Showing ${onPage} of ${total} results`
      : `${total} result${total === 1 ? "" : "s"}`;
    let partialHtml = "";
    if (partialPage.length) {
      const tiers = new Set(partialPage.map((h) => h.tier));
      const which = [tiers.has(1) ? "bills with every word, but not all in one section" : "", tiers.has(2) ? "results with some of the words" : ""].filter(Boolean).join(", then ");
      partialHtml = `<p class="search-count search-partial">${fullShown.length ? "Partial matches" : "No result has every word in one section. Partial matches"}: ${which}.</p>` +
        groupsHtml(partialPage, q, cq.pats, cq.literal, true);
    }
    mount.innerHTML = `${suggestion}${filters(counts)}<p class="search-count" aria-live="polite">${count}</p>` +
      groupsHtml(fullPage, q, cq.pats, cq.literal, false) + partialHtml +
      (total > onPage ? `<button type="button" class="btn search-more" data-more>Show ${Math.min(PAGE, total - onPage)} more</button>` : "");
  }

  window.siteReady(() => {
    const box = document.getElementById("search-box");
    const form = document.getElementById("search-form");
    const mount = document.getElementById("search-results");
    const initial = params.get("q") || "";
    box.value = initial;
    run(initial);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      run(box.value);
    });
    let timer = null;                 // matching runs over the whole corpus
    box.addEventListener("input", () => {
      clearTimeout(timer);
      const v = box.value.trim();
      if (!v) { run(""); return; }    // clearing the box clears the results
      timer = setTimeout(() => { if (v.length >= 2) run(box.value); }, 150);
    });
    mount.addEventListener("click", (e) => {
      const ex = e.target.closest("[data-example]");
      if (ex) { e.preventDefault(); box.value = ex.dataset.example; run(box.value); return; }
      const f = e.target.closest("[data-type]");
      if (f) { type = f.dataset.type; run(lastQuery); return; }
      if (e.target.closest("[data-more]")) { shown += PAGE; run(lastQuery, true); }
    });
    box.focus();
  });
})();
