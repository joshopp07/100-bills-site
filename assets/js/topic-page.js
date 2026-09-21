/* The themes page, in three views.

   topic.html            an index of the themes, and nothing else. This
                         is the default because the full list was a wall: the
                         second theme sat a screen and a half down.
   topic.html?topic=X    one theme: its blurb, then its bills as cards.
   topic.html?all=1      every theme with every bill in one sentence. The
                         thirty-minute read, kept but no longer the front door.
*/
(function () {
  const params = new URLSearchParams(window.location.search);
  const topicSlug = params.get("topic");
  const showAll = params.get("all") === "1";

  function counts(bills) {
    const c = { canonical: 0, planned: 0, proposed: 0 };
    for (const b of bills) c[b.status] = (c[b.status] || 0) + 1;
    return c;
  }

  function statusLine(bills) {
    const c = counts(bills);
    return `${bills.length} bills: ${c.canonical} drafted, ${c.planned} planned, ${c.proposed} proposed`;
  }

  function renderIndex(cats) {
    document.title = "The 100 Bills — Project 2027-2029";
    document.getElementById("crumbs").innerHTML = "";
    document.getElementById("topic-title").textContent = "The 100 Bills";
    document.getElementById("topic-explainer").innerHTML =
      `${cats.length} themes, in order. Open one to see what it covers and every bill in it. Two constitutional amendments are listed with the bills and are not counted among the hundred, because a statute cannot undo a constitutional holding.`;
    const total = cats.reduce((n, c) => n + c.bills.length, 0);
    const drafted = cats.reduce((n, c) => n + c.bills.filter((b) => b.status === "canonical").length, 0);
    const rows = cats
      .map((c, i) => {
        const n = counts(c.bills);
        return `<a class="theme-row" href="topic.html?topic=${c.slug}">
          <span class="theme-row-num">${String(i + 1).padStart(2, "0")}</span>
          <span class="theme-row-name">${c.title}</span>
          <span class="theme-row-count">${c.bills.length} bills<span class="theme-row-drafted">, ${n.canonical} drafted</span></span>
          <span class="theme-row-arrow" aria-hidden="true">→</span>
        </a>`;
      })
      .join("");
    document.getElementById("topic-body").innerHTML = `
      <div class="topic-counts">${total} bills, ${drafted} drafted so far</div>
      <nav class="theme-index" aria-label="Themes">${rows}</nav>
      <p class="theme-index-more"><a href="topic.html?all=1">Read every bill in one sentence, on one page →</a></p>`;
  }

  function renderOne(cat, index, cats) {
    document.title = `${cat.title} — Project 2027-2029`;
    document.getElementById("topic-title").textContent = cat.title;
    document.getElementById("topic-explainer").innerHTML = window.inlineMd(cat.explainer);
    document.getElementById("crumbs").innerHTML =
      `<a href="topic.html">The 100 Bills</a> <span>›</span> <span>Theme ${index + 1} of ${cats.length}</span>`;
    const prev = cats[index - 1];
    const next = cats[index + 1];
    const cards = cat.bills.map((b) => window.AGENDA.billCard(b)).join("");
    document.getElementById("topic-body").innerHTML = `
      <div class="topic-counts">${statusLine(cat.bills)}</div>
      <div class="bill-cards">${cards}</div>
      <nav class="prev-next">
        ${prev ? `<a href="topic.html?topic=${prev.slug}">← ${prev.title}</a>` : `<a href="topic.html">← All themes</a>`}
        ${next ? `<a href="topic.html?topic=${next.slug}">${next.title} →</a>` : `<a href="topic.html">All themes →</a>`}
      </nav>`;
  }

  function renderAll(cats) {
    document.title = "Every bill in one sentence — Project 2027-2029";
    document.getElementById("crumbs").innerHTML =
      `<a href="topic.html">The 100 Bills</a> <span>›</span> <span>Every bill in one sentence</span>`;
    document.getElementById("topic-title").textContent = "Every bill in one sentence";
    document.getElementById("topic-explainer").innerHTML =
      `All ${cats.length} themes on one page. A drafted bill opens to its full text. A planned or proposed bill shows what it will do.`;
    const total = cats.reduce((n, c) => n + c.bills.length, 0);
    const drafted = cats.reduce((n, c) => n + c.bills.filter((b) => b.status === "canonical").length, 0);
    const html = [`<div class="topic-counts">${total} bills, ${drafted} drafted so far</div>`];
    cats.forEach((c, i) => {
      html.push(`<section class="topic-block" id="${c.slug}">
        <h2 class="topic-block-title"><span class="topic-num">${String(i + 1).padStart(2, "0")}</span> <a href="topic.html?topic=${c.slug}">${c.title}</a></h2>
        <p class="topic-block-explainer">${window.inlineMd(c.explainer)}</p>
        <ul class="one-line-list">
          ${c.bills.map((b) => `<li>
            <span class="pill-status pill-${b.status}">${window.AGENDA.statusLabel(b.status)}</span>
            ${b.slug ? `<a href="law.html?bill=${b.slug}"><strong>${b.name}</strong></a>` : `<strong>${b.name}</strong>`}
            <span class="one-line">${window.inlineMd(b.line || "")}</span>
          </li>`).join("")}
        </ul>
      </section>`);
    });
    document.getElementById("topic-body").innerHTML = html.join("\n");
  }

  window.siteReady(() => {
    const cats = window.AGENDA.categories();
    if (topicSlug) {
      const i = cats.findIndex((c) => c.slug === topicSlug);
      if (i >= 0) return renderOne(cats[i], i, cats);
    }
    if (showAll) return renderAll(cats);
    renderIndex(cats);
  });
})();
