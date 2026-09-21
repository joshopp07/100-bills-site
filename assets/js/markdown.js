/* Minimal markdown renderer for the subset the bills, the companion and the
   explainer actually use: headings (##, ###), **bold**, *italic*, paragraph
   breaks, blockquotes, horizontal rules, "1." numbered lists and "- " bullet
   lists, and [text](url) links. Not a general markdown parser on purpose:
   the source documents are consistent enough that this covers them, and a
   tiny hand-rolled renderer is easier to audit than a dependency. */

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

function inlineMd(s) {
  let out = escapeHtml(s);
  out = out.replace(/\[([^\]]+)\]\((https?:[^)\s"'<>]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+?)\*([^*]|$)/g, "$1<em>$2</em>$3");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/§\s*([0-9]+[A-Za-z]?-[0-9A-Za-z()]+)/g, "§&nbsp;$1");
  return out;
}

function stripMd(s) {
  return s.replace(/\*\*|\*|`/g, "").replace(/^>\s?/gm, "").replace(/\s+/g, " ").trim();
}

function renderMarkdownBlock(raw) {
  const lines = raw.split("\n");
  const html = [];
  let ol = [];
  let ul = [];
  let quote = [];
  let para = [];

  function flushPara() {
    if (para.length) {
      html.push(`<p>${inlineMd(para.join(" "))}</p>`);
      para = [];
    }
  }
  function flushLists() {
    if (ol.length) {
      html.push("<ol>" + ol.map((li) => `<li>${inlineMd(li)}</li>`).join("") + "</ol>");
      ol = [];
    }
    if (ul.length) {
      html.push("<ul>" + ul.map((li) => `<li>${inlineMd(li)}</li>`).join("") + "</ul>");
      ul = [];
    }
  }
  function flushQuote() {
    if (quote.length) {
      html.push(`<blockquote>${renderMarkdownBlock(quote.join("\n"))}</blockquote>`);
      quote = [];
    }
  }
  function flushAll() {
    flushPara();
    flushLists();
    flushQuote();
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      flushAll();
      continue;
    }
    const h = trimmed.match(/^(#{2,4})\s+(.*)/);
    if (h) {
      flushAll();
      const level = Math.min(h[1].length, 4);
      html.push(`<h${level}>${inlineMd(h[2])}</h${level}>`);
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      flushAll();
      html.push("<hr>");
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushPara();
      flushLists();
      quote.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }
    flushQuote();
    const numbered = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numbered) {
      flushPara();
      if (ul.length) flushLists();
      ol.push(numbered[2]);
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)/);
    if (bullet) {
      flushPara();
      if (ol.length) flushLists();
      ul.push(bullet[1]);
      continue;
    }
    flushLists();
    para.push(trimmed);
  }
  flushAll();
  return html.join("\n");
}

window.renderMarkdownBlock = renderMarkdownBlock;
window.inlineMd = inlineMd;
window.stripMd = stripMd;
window.escapeHtml = escapeHtml;
