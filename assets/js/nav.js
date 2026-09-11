/* Shared header/footer, injected so nav only has to be edited in one place.
   Pages provide a page id via <body data-page="..."> to highlight the
   active nav item. Feedback is one outbound link; the site itself has no
   comments and no editing anywhere. */

(function () {
  const REDDIT_URL = "https://www.reddit.com/r/REPLACE_ME"; // TODO: set real subreddit/thread URL

  const NAV_ITEMS = [
    { id: "home", label: "Home", href: "index.html" },
    { id: "agenda", label: "The 100 Bills", href: "topic.html" },
    { id: "about", label: "Why and How", href: "about.html" },
    { id: "search", label: "Search", href: "search.html" },
    { id: "feedback", label: "Feedback ↗", href: REDDIT_URL, external: true },
  ];

  function renderHeader(activePage) {
    const nav = NAV_ITEMS.map((item) => {
      const current = item.id === activePage ? ' aria-current="page"' : "";
      const target = item.external ? ' target="_blank" rel="noopener"' : "";
      return `<a href="${item.href}"${current}${target}>${item.label}</a>`;
    }).join("");

    return `
      <header class="site-header">
        <div class="site-header-inner">
          <a class="site-title" href="index.html"><span class="site-title-main">Project 2027-2029</span><span class="site-title-sub">100 Bills in 100 Days</span></a>
          <nav class="site-nav">${nav}</nav>
        </div>
      </header>`;
  }

  function renderFooter() {
    return `
      <footer class="site-footer">
        <div class="site-footer-inner">
          <span>Model federal legislation for the 2027-2029 Congress, published for discussion. Nothing here is enacted law.</span>
          <span><a href="about.html">Why and how this was built</a> · <a href="methodology.html">Method</a></span>
        </div>
      </footer>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page || "";
    const headerMount = document.getElementById("site-header");
    const footerMount = document.getElementById("site-footer");
    if (headerMount) headerMount.outerHTML = renderHeader(page);
    if (footerMount) footerMount.outerHTML = renderFooter();
  });

  // Shared helpers for the agenda, used by several pages.
  window.AGENDA = {
    categories() {
      return ((window.SITE_DATA || {}).agenda || { categories: [] }).categories;
    },
    findBill(slug) {
      for (const c of this.categories()) {
        for (const b of c.bills) if (b.slug === slug) return { bill: b, category: c };
      }
      return null;
    },
    statusLabel(status) {
      return { canonical: "Drafted", planned: "Planned", proposed: "Proposed" }[status] || status;
    },
    billCard(b, opts) {
      const o = opts || {};
      const pill = `<span class="pill-status pill-${b.status}">${this.statusLabel(b.status)}</span>`;
      const draft = b.draft ? `<span class="pill-draft" title="Card text written for the site; awaiting the author's review">draft card</span>` : "";
      const line = window.inlineMd ? window.inlineMd(b.line || "") : (b.line || "");
      // D882: display_name is the site label where it differs from the statutory short
      // title. The card shows the label; the real short title stays in the tooltip, because
      // a committee cites the statute's name and it must not vanish from the page.
      const shown = b.display_name || b.name;
      const alt = b.display_name ? ` title="${b.name}"` : "";
      const inner = `<div class="bill-card-top">${pill}${draft}</div>
        <h4${alt}>${shown}</h4>
        <p>${line}</p>`;
      if (b.slug) {
        return `<a class="bill-card bill-card-link" href="law.html?bill=${b.slug}">${inner}<span class="bill-card-cta">Open the bill →</span></a>`;
      }
      return `<div class="bill-card bill-card-flat">${inner}${o.showPlanned !== false ? `<span class="bill-card-cta muted">Text not yet published</span>` : ""}</div>`;
    },
  };
})();
