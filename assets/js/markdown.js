/* Minimal markdown renderer for the subset the bills, the companion and the
   site pages actually use: headings (##, ###, ####), paragraph breaks,
   blockquotes, horizontal rules, numbered lists ("1.", "4A.") and "- " bullet
   lists, pipe tables, ~~struck~~ text, *italic*, `code`, and [text](url)
   links. Not a general markdown parser on purpose: the source documents are
   consistent enough that this covers them, and a tiny hand-rolled renderer is
   easier to audit than a dependency.

   Bold is never rendered as bold (the author, 2026-10-01). The bills use
   **...** for two things: new language in an amendment, and captions and
   emphasis everywhere else. So:
     - in quoted statutory text inside a section that amends existing law, and
       inside a quotation on a line that strikes text, **x** is an insertion and
       renders as <ins> (underlined: the redline convention, insertions
       underlined and deletions struck);
     - a leading caption such as **(a) In general.** stays plain even there;
     - a quotation introduced as the law "as it now reads" is current law, so
       its bold is the drafter's emphasis and stays plain;
     - everywhere else **x** renders as plain x.
   ~~x~~ renders as <del> everywhere. */

/* Quotes are escaped, not only the angle brackets. inlineMd builds ONE
   attribute -- the href of a link -- and before 2026-09-11 a quote reached it
   intact, so `[x](https://a"onmouseover="alert(1))` closed the href and opened
   an event handler. The search page renders its query through inlineMd and
   takes that query from ?q=, which made it a reflected XSS on a live origin
   that keeps the decryption key in localStorage. Two independent fixes, either
   sufficient: quotes cannot survive escaping, and the URL class below cannot
   contain one. */
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* A caption at the start of a line: **(a)**, **"(7) Heading.**, **(b-2) Caption.**.
   Matched after escaping, so a straight quote is &quot;. */
const CAPTION_RE = /^\*\*((?:&quot;|“)?\(?[0-9A-Za-z]{1,6}(?:-[0-9A-Za-z]+)?\)[^*]{0,90}?)\*\*(?=\s*\S)/;
/* The heading of a quoted Code section, **§ 1362. Right to counsel** or **"SEC. 461. ...**:
   the section's own caption, not inserted text. */
const SECTION_CAPTION_RE = /^\*\*((?:&quot;|“)?(?:§|SEC\.|Sec\.)\s*[0-9][^*]{0,120}?)\*\*/;

/* Is position i of an escaped line inside a quotation? Straight quotes are
   counted in pairs; curly quotes by opener and closer. */
function insideQuotation(line, i) {
  const before = line.slice(0, i);
  const straight = (before.match(/&quot;/g) || []).length;
  const open = (before.match(/“/g) || []).length;
  const close = (before.match(/”/g) || []).length;
  return straight % 2 === 1 || open > close;
}

/* opts.bold: "plain" (default) | "ins" (every bold an insertion, captions aside)
   | "quoted" (an insertion only inside a quotation on the line). */
function inlineMd(s, opts) {
  const mode = (opts && opts.bold) || "plain";
  let out = escapeHtml(s);
  out = out.replace(/\[([^\]]+)\]\((https?:[^)\s"'<>]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Links between the site's own pages (D1580). The page name is a closed list
  // and the query admits only [A-Za-z0-9=&_-] -- after escaping, & is "&amp;",
  // which is still inside that class -- so no quote or scheme can reach the href.
  out = out.replace(/\[([^\]]+)\]\(((?:index|page|law|topic|search|progress|methodology|promises)\.html(?:\?[A-Za-z0-9=&;_-]*)?(?:#[A-Za-z0-9_-]+)?)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/~~(.+?)~~/g, "<del>$1</del>");
  if (mode === "plain") {
    out = out.replace(/\*\*(.+?)\*\*/g, "$1");
  } else {
    out = out.replace(CAPTION_RE, "$1").replace(SECTION_CAPTION_RE, "$1").replace(BARE_CAPTION_RE, "$1");
    out = out.replace(/\*\*(.+?)\*\*/g, (m, inner, at, whole) =>
      (inner.trim() && (mode === "ins" || insideQuotation(whole, at))) ? `<ins>${inner}</ins>` : inner);
  }
  out = out.replace(/\*\*/g, "");   // an unpaired marker in the source
  out = out.replace(/(^|[^*])\*([^*]+?)\*([^*]|$)/g, "$1<em>$2</em>$3");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/§\s*([0-9]+[A-Za-z]?-[0-9A-Za-z()]+)/g, "§&nbsp;$1");
  return out;
}

function stripMd(s) {
  return s
    .replace(/^\s*\|?\s*:?-{3,}[-|: ]*$/gm, " ")   // table separator rows
    .replace(/^\s*-{3,}\s*$/gm, " ")                // horizontal rules
    .replace(/\*\*|\*|`|~~/g, "")
    .replace(/^>\s?/gm, "")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Text the law-page excerpt and the search snippet can show: struck words,
   table rules and list labels removed. */
function plainText(s) {
  return stripMd(s.replace(/~~[\s\S]+?~~/g, "").replace(/^\s*(?:>\s*)*(?:\d+[A-Za-z]?\.|[-*])\s+/gm, ""));
}

/* A whole line that is only a short caption: **(a) The child care guarantee**, **(4) Payment rates**.
   Text ends in punctuation ("...Act;") or runs longer; a caption does neither. */
const BARE_CAPTION_RE = /^\*\*((?:&quot;|“)?\(?[0-9A-Za-z]{1,6}(?:-[0-9A-Za-z]+)?\)\s+[^*;,:—]{1,60}?[^*;,:—\s])\*\*$/;

/* An instruction that inserts wholly new text ("by adding at the end", "the
   following new section"). The quotation after it is all new, so any bold
   inside it is the drafter's emphasis, not a marked insertion. */
const WHOLE_INSERT_RE = /\bby adding\b|\badding at the end\b|\bby inserting\b[^.]*\bthe following\b|\bfollowing new (?:section|subsection|paragraph|subparagraph|clause|title|part|chapter)\b|\bis added\b/i;
const INSTRUCTION_RE = /\bamend(?:s|ed)\b|\bto read as follows\b|\bby adding\b|\bby inserting\b|\bby striking\b/i;

const CURRENT_LAW_RE = /\b(?:as it now reads|now reads|currently reads|as it reads today|reads at present|as in force)\b/i;

/* opts:
     amend     the section amends existing law: quoted text marks insertions
     idPrefix  give each leading **(a)** / **(b-2)** paragraph an id, prefix-a
     quote     internal: rendering the inside of a blockquote
     bold      internal: the bold mode for this block's lines */
function renderMarkdownBlock(raw, opts) {
  const o = opts || {};
  const lines = (raw || "").split("\n");
  const html = [];
  const usedIds = o.usedIds || new Set();
  let list = null;          // { kind: "ol"|"ul", items: [{ label, lines: [] }] }
  let quote = [];
  let para = [];
  let table = [];
  let lastPara = "";
  let lastInstruction = o.instruction || "";
  let prevBlank = true;
  let lastSub = "";         // the letter of the last paragraph taken as a subsection

  /* A bold (i), (ii) or (v) is a clause, usually of text an amendment inserts
     ("by adding at the end the following new subparagraph: (E) ... (i) ..."),
     not a subsection of the section, unless it is the letter after the last
     subsection: (i) after (h). A clause that took the id would also take it
     from the section's real (i). */
  function isSubsection(label) {
    const base = label.split("-")[0];
    const ok = !/^[ivx]+$/.test(base) || (base.length === 1 &&
      (lastSub === base || lastSub === String.fromCharCode(base.charCodeAt(0) - 1)));
    if (ok && base.length === 1) lastSub = base;
    return ok;
  }

  const lineMode = (line) => {
    if (o.bold) return o.bold;
    if (o.amend && line.includes("~~")) return "quoted";
    return "plain";
  };

  function flushPara() {
    if (!para.length) return;
    const text = para.join(" ");
    lastPara = text;
    if (INSTRUCTION_RE.test(text)) lastInstruction = text;
    let attrs = "";
    if (o.idPrefix && !o.quote) {
      const m = text.match(/^\*\*\(([a-z]{1,3}(?:-[0-9a-z]+)?)\)/);
      if (m && isSubsection(m[1])) {
        const id = `${o.idPrefix}-${m[1]}`;
        if (!usedIds.has(id)) {
          usedIds.add(id);
          attrs = ` id="${id}" class="subsec" data-sub="${m[1]}"`;
        }
      }
    }
    html.push(`<p${attrs}>${inlineMd(text, { bold: lineMode(text) })}</p>`);
    para = [];
  }
  function flushList() {
    if (!list) return;
    if (list.kind === "ol") {
      html.push(`<ol class="src-list">${list.items.map((li) => {
        const t = li.lines.join(" ");
        return `<li><span class="li-num">${escapeHtml(li.label)}.</span><div class="li-body">${inlineMd(t, { bold: lineMode(t) })}</div></li>`;
      }).join("")}</ol>`);
    } else {
      html.push(`<ul>${list.items.map((li) => { const t = li.lines.join(" "); return `<li>${inlineMd(t, { bold: lineMode(t) })}</li>`; }).join("")}</ul>`);
    }
    list = null;
  }
  function flushQuote() {
    if (!quote.length) return;
    // A quotation introduced as the law as it now reads is current law: its bold is emphasis.
    // Bold in a quotation is an insertion only in a redline of existing text: a quotation
    // with struck words, or one that restates a provision "to read as follows".
    const struck = quote.some((l) => l.includes("~~"));
    const wholeNew = WHOLE_INSERT_RE.test(lastInstruction) && !/to read as follows/i.test(lastInstruction);
    const bold = o.amend && !CURRENT_LAW_RE.test(lastPara) && (struck || !wholeNew) ? "ins" : (o.bold || "plain");
    html.push(`<blockquote>${renderMarkdownBlock(quote.join("\n"), { amend: o.amend, quote: true, bold, usedIds })}</blockquote>`);
    quote = [];
  }
  function flushTable() {
    if (!table.length) return;
    const cells = (r) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    const isRule = (r) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(r);
    let head = null;
    let rows = table;
    if (table.length > 1 && isRule(table[1])) { head = cells(table[0]); rows = table.slice(2); }
    rows = rows.filter((r) => !isRule(r));
    const cell = (tag, c) => `<${tag}>${inlineMd(c, { bold: o.bold || "plain" })}</${tag}>`;
    // The scrolling region is named for its columns, so two tables on a page differ.
    const cols = stripMd((head || cells(rows[0] || "")).join(", "));
    const label = !cols ? "Table" : `Table: ${cols.length > 80 ? `${cols.slice(0, 80).replace(/\s+\S*$/, "")}…` : cols}`;
    html.push(`<div class="table-wrap" tabindex="0" role="region" aria-label="${escapeHtml(label)}"><table class="md-table">` +
      (head ? `<thead><tr>${head.map((c) => cell("th", c)).join("")}</tr></thead>` : "") +
      `<tbody>${rows.map((r) => `<tr>${cells(r).map((c) => cell("td", c)).join("")}</tr>`).join("")}</tbody></table></div>`);
    table = [];
  }
  function flushAll() {
    flushPara();
    flushList();
    flushQuote();
    flushTable();
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      // A blank line ends a paragraph, a quotation or a table, but not a list:
      // "1." and "2." separated by a blank line are one list.
      flushPara();
      flushQuote();
      flushTable();
      prevBlank = true;
      continue;
    }
    if (trimmed.startsWith("|")) {
      flushPara(); flushList(); flushQuote();
      table.push(trimmed);
      prevBlank = false;
      continue;
    }
    flushTable();
    const h = trimmed.match(/^(#{2,6})\s+(.*)/);
    if (h) {
      flushAll();
      const level = Math.min(h[1].length, 6);
      html.push(`<h${level}>${inlineMd(h[2])}</h${level}>`);
      prevBlank = false;
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      flushAll();
      html.push("<hr>");
      prevBlank = false;
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushPara();
      flushList();
      quote.push(trimmed.replace(/^>\s?/, ""));
      prevBlank = false;
      continue;
    }
    flushQuote();
    const numbered = trimmed.match(/^(\d+[A-Za-z]?)\.\s+(.*)/);
    if (numbered) {
      flushPara();
      if (list && list.kind !== "ol") flushList();
      if (!list) list = { kind: "ol", items: [] };
      list.items.push({ label: numbered[1], lines: [numbered[2]] });
      prevBlank = false;
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)/);
    if (bullet) {
      flushPara();
      if (list && list.kind !== "ul") flushList();
      if (!list) list = { kind: "ul", items: [] };
      list.items.push({ label: "", lines: [bullet[1]] });
      prevBlank = false;
      continue;
    }
    // A line directly under a list item continues it; after a blank line it starts a paragraph.
    if (list && !prevBlank) {
      list.items[list.items.length - 1].lines.push(trimmed);
      continue;
    }
    flushList();
    para.push(trimmed);
    prevBlank = false;
  }
  flushAll();
  while (html.length && html[html.length - 1] === "<hr>") html.pop();   // a section-final rule is a separator
  return html.join("\n");
}

window.renderMarkdownBlock = renderMarkdownBlock;
window.inlineMd = inlineMd;
window.stripMd = stripMd;
window.plainText = plainText;
window.escapeHtml = escapeHtml;
