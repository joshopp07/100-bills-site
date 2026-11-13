/* Client-side search over SITE_DATA. No server and no external request.

   Matching.
   1. Word boundaries, never raw substrings. Searching "AI" used to return the
      Intercity Rail Act, because "rail" contains "ai". A term now has to begin
      a word, so "hous" still finds "housing" while "ai" no longer finds
      "rail". A term of one or two characters has to match a whole word, which
      is what makes "AI" behave: it finds the AI Safety Act and not "aid".
      In a search of several words, a word the site contains as a word matches
      only as a word, so "stock trading" is not satisfied by "Stockyards".
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
      then results with some of the words. A partial match from a bill or page
      group already listed joins that group, so a bill never appears twice.
   7. A query with "." or "§" in it ("26 U.S.C.") also matches as a literal
      string, because a citation is not a list of words. A section citation
      ("section 3-5", "§ 3-5", "sec. 3-5") puts the section with that number in
      its heading first.
   8. The compounds in markdown.js are one search however they are written, so
      "childcare", "child care", and "child-care" return the same results.
   9. In a search of three or more words, a bill whose title holds every word
      but one is a full match: "Supreme Court term limits" finds The Supreme
      Court Terms Amendment, which never says "limits". A quoted phrase or a
      citation is never the word left out.
   Curly and straight apostrophes are the same character to the search.

   Scoring, highest first: a whole-word hit in the title, another form of the
   word in the title, a part of a hyphenated word or a prefix hit in the title,
   then the same three in the text, and a bonus for the whole phrase or the
   literal string. "Term" still finds "Long-Term" but scores as a part of a
   word, not as the word. A bill that matches also gains for each word of the
   search in its title, as the word or another form of it, so a bill named for
   the search leads sections that share one word with it. Results are grouped
   by bill, under the name its card carries.

   The address bar always carries the query (q=) and the type filter (type=),
   so a search is a link. A result passes q= on to the page it opens, which
   marks the terms in the section it opens. */
(function () {
  const params = new URLSearchParams(window.location.search);
  const PAGE = 60;
  const PARTIAL_BELOW = 3;   // fewer full matches than this, and partial matches follow
  const BILL_TITLE_WORD = 4; // what a bill gains for each word of the search in its title
  const VOCAB_FLOOR = 2;     // uses on the site before a word can be offered as a correction
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
      const w = window.splitCompounds(words(p));
      if (w.length) phrases.push(w);
      return " ";
    });
    const all = [];
    for (const w of window.splitCompounds(words(rest))) {
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
    if (t === "child") return ["children"];
    if (t.length === 3 && /^[a-z]+$/.test(t) && !NO_STEM.has(t)) return [t + "s", t + "es"];   // "tax" -> "taxes"
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

  /* A word standing alone: no hyphen joins it to another word. Written without a
     lookbehind, which older Safari refuses to compile; it is only ever tested, so
     the character it consumes does not matter. */
  function aloneRe(src) {
    return new RegExp(`(?:^|[^\\w-])(?:${src})(?![\\w-])`, "i");
  }

  /* "joined" is the one-word spelling of the compound this term is half of. It comes
     first so that a mark covers all of "childcare", not its first five letters. The
     hyphen in "child-care" is that compound's own, so it does not make a part of a word. */
  function pattern(term, joined) {
    const src = joined ? `(?:${joined}s?|${termSrc(term)})` : termSrc(term);
    const alt = forms(term);
    return {
      term,
      src,
      whole: joined ? new RegExp(`\\b${src}\\b`, "i") : aloneRe(src),
      prefix: new RegExp(`\\b${src}`, "i"),
      variant: alt.length ? aloneRe(alt.join("|")) : null,
      fragment: new RegExp(`\\b(?:${[src, ...alt].join("|")})\\b`, "i"),   // the word or a form of it, hyphenated or alone
      variantSrc: alt.join("|"),
      wordOnly: term.length <= 2,   // "AI", "IG": a whole word or nothing
    };
  }

  /* Words in order, a separator required between them except inside a compound. */
  function phraseSrc(ws) {
    return ws.map((w, i) => termSrc(w) + (i < ws.length - 1 ? `(?:'s)?${SEP}${window.compoundJoined(w, ws[i + 1]) ? "*" : "+"}` : "")).join("");
  }

  /* A quoted phrase: every word as written, in order. */
  function phrasePattern(ws) {
    const src = phraseSrc(ws);
    const re = new RegExp(`\\b${src}\\b`, "i");
    return { term: ws.join(" "), src, whole: re, prefix: re, variant: null, fragment: re, variantSrc: "", wordOnly: true };
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

  /* Words a misspelling can be corrected to, each with how often the site uses it:
     the words of the whole text used at least VOCAB_FLOOR times, so a slip in one
     section is never offered, and every word of a title and the joined compounds
     ("healthcare") however rarely they appear. */
  function buildVocab() {
    const counts = new Map();
    const always = new Set(window.compoundWords);
    for (const row of corpus) {
      for (const w of row.lower.split(/[^a-z]+/)) if (w.length >= 4) counts.set(w, (counts.get(w) || 0) + 1);
      for (const w of row.title.toLowerCase().split(/[^a-z]+/)) if (w.length >= 4) always.add(w);
    }
    const out = new Map();
    for (const [w, n] of counts) if (n >= VOCAB_FLOOR) out.set(w, n);
    for (const w of always) out.set(w, counts.get(w) || 0);
    return out;
  }

  /* Edits between two words; two neighboring letters swapped count as one edit. */
  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    let before = null;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) {
        let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, before[j - 2] + 1);
        row[j] = d;
      }
      before = prev;
      prev = row;
    }
    return prev[b.length];
  }

  /* "recusl" -> "recusal": each word found nowhere on the site becomes the closest
     word in the vocabulary within one edit (two from nine letters up, so "dreamers"
     is not "dealers"), preferring a word that shares the first letter, then the word
     the site uses most. A word the site contains is left as it is. */
  function suggest(terms, unknown) {
    if (!vocab) vocab = buildVocab();
    let changed = false;
    const fixed = terms.map((t, i) => {
      if (!unknown[i] || t.length < 4 || /[\d-]/.test(t) || vocab.has(t)) return t;
      const limit = t.length >= 9 ? 2 : 1;
      let best = null;
      for (const [w, n] of vocab) {
        const d = distance(t, w);
        if (d > limit) continue;
        const first = w[0] === t[0];
        if (!best || d < best.d || (d === best.d && (first > best.first || (first === best.first && n > best.n)))) best = { w, d, first, n };
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
    let inTitle = 0;           // words of the search in the title, a hyphen fragment not counted
    q.pats.forEach((p, i) => {
      let hit = 0;
      if (p.whole.test(row.title)) { hit += 6; inTitle += 1; }
      else if (p.variant && p.variant.test(row.title)) { hit += 5; inTitle += 1; }
      else if (p.fragment.test(row.title) || (!p.wordOnly && p.prefix.test(row.title))) hit += 3;
      if (p.whole.test(row.body)) hit += 3;
      else if (p.variant && p.variant.test(row.body)) hit += 2;
      else if (p.fragment.test(row.body) || (!p.wordOnly && p.prefix.test(row.body))) hit += 1;
      if (hit) mask |= 1 << i;
      s += hit;
    });
    const lit = !!q.literal && row.lower.includes(q.literal);
    if (lit) s += 8;
    if (q.phraseRe && (q.phraseRe.test(row.title) || q.phraseRe.test(row.body))) s += 6;
    if (q.citeRe && row.e.t === "section" && q.citeRe.test(row.title)) s += 100;
    if (row.e.t === "bill") s += 1;
    const named = row.e.t === "bill" && q.titleMayOmit && inTitle >= q.pats.length - 1;
    const full = lit || named || (q.pats.length > 0 && mask === q.fullMask);
    if (full && row.e.t === "bill") s += inTitle * BILL_TITLE_WORD;
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
    if (e.t === "bill") return { key: `bill:${e.slug || e.title}`, slug: e.page, name: e.title };
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
      const pats = [{ ...pattern(num), wordOnly: true }];
      return { pats, fullMask: 1, literal: "", phraseRe: null, partialOk: false, titleMayOmit: false,
        citeRe: new RegExp(`^(?:§+|sec(?:tion|\\.)?)\\s*${escapeRe(num)}(?![\\w-])`, "i") };
    }
    const { all, phrases } = parse(q);
    const terms = all.filter((t) => !STOP.has(t));
    const required = terms.length || phrases.length ? terms : all;
    const literal = /[.§]/.test(q) ? norm(q).toLowerCase().replace(/\s+/g, " ") : "";
    const pats = required.slice(0, 20).map((t, i) => pattern(t, window.compoundJoined(t, required[i + 1]) || window.compoundJoined(required[i - 1], t))).concat(phrases.slice(0, 5).map(phrasePattern));
    // A word the site contains is that word in a search of several: "stock" here is
    // not "Stockyards". A word it does not contain ("hous") is still being typed.
    if (pats.length > 1) for (const p of pats) if (!p.wordOnly && corpus.some((row) => p.fragment.test(row.lower))) p.wordOnly = true;
    const phraseRe = all.length > 1 ? aloneRe(phraseSrc(all)) : null;
    return { pats, fullMask: (1 << pats.length) - 1, literal, phraseRe, citeRe: null, partialOk: pats.length > 1 && !literal, titleMayOmit: pats.length >= 3 && !literal && !phrases.length, required };
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
      for (const re of [p.wordOnly ? p.fragment : p.prefix, p.fragment]) {
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
      parts.push(`\\b${p.src}${p.wordOnly ? "\\b" : ""}`);
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
    if (entry.t === "page") return entry.slug === "home" ? "three-promises.html" : entry.slug === "about" ? "index.html" : `page.html?p=${encodeURIComponent(entry.slug)}`;
    if (entry.t === "bill") {
      // from=search: the bill page marks the Search tab as where the reader came from (nav.js).
      return `law.html?bill=${entry.page}&from=search`;
    }
    const sec = entry.anchor ? `&sec=${encodeURIComponent(entry.anchor)}&open=1` : "";
    const why = entry.t === "note" && entry.note ? `&why=${encodeURIComponent(entry.note)}` : "";
    return `law.html?bill=${entry.slug}&from=search${sec}${why}${qq}`;
  }

  function kind(entry) {
    if (entry.t === "bill") return entry.slug ? "Bill" : "Bill · Platform, text not yet published";
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

  function groupsHtml(rows, q, pats, literal) {
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
        g.rows.map(({ row, full }) => {
          const e = row.e;
          return `<a class="result" href="${href(e, q)}">
            <div class="result-kind">${window.escapeHtml(kind(e) + (full ? "" : " · partial match"))}</div>
            <div class="result-title">${highlight(clean(row.title), pats, literal)}</div>
            <div class="result-text">${highlight(snippet(clean(row.body), pats, literal), pats, literal)}</div>
          </a>`;
        }).join("") + `</section>`;
    }).join("");
  }

  function run(raw, keepShown) {
    const mount = document.getElementById("search-results");
    const q = window.clipQuery(raw).trim();
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
      const unknown = reqPats.map((p) => !p.wordOnly && !corpus.some((row) => p.prefix.test(row.lower) || p.fragment.test(row.lower)));
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
    // A partial match from a group the full matches already list joins that group.
    const fullKeys = new Set(fullPage.map((h) => groupOf(h.row).key));
    const joined = partialPage.filter((h) => fullKeys.has(groupOf(h.row).key));
    const apart = partialPage.filter((h) => !fullKeys.has(groupOf(h.row).key));
    let partialHtml = "";
    if (apart.length) {
      const tiers = new Set(apart.map((h) => h.tier));
      const which = [tiers.has(1) ? "bills with every word, but not all in one section" : "", tiers.has(2) ? "results with some of the words" : ""].filter(Boolean).join(", then ");
      partialHtml = `<p class="search-count search-partial">${fullShown.length ? "Partial matches" : "No result has every word in one section. Partial matches"}: ${which}.</p>` +
        groupsHtml(apart, q, cq.pats, cq.literal);
    }
    mount.innerHTML = `${suggestion}${filters(counts)}<p class="search-count" aria-live="polite">${count}</p>` +
      groupsHtml(fullPage.concat(joined), q, cq.pats, cq.literal) + partialHtml +
      (total > onPage ? `<button type="button" class="btn search-more" data-more>Show ${Math.min(PAGE, total - onPage)} more</button>` : "");
  }

  window.siteNeeds("search");
  window.siteReady(() => {
    const box = document.getElementById("search-box");
    const form = document.getElementById("search-form");
    const mount = document.getElementById("search-results");
    const initial = window.clipQuery(params.get("q"));
    box.maxLength = window.MAX_QUERY;
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
