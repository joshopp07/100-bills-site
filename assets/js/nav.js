/* Shared header/footer, injected so nav only has to be edited in one place.
   Pages provide a page id via <body data-page="..."> to highlight the
   active nav item. Feedback is one outbound link; the site itself has no
   comments and no editing anywhere. */

(function () {
  const REDDIT_URL = "https://www.reddit.com/r/REPLACE_ME"; // TODO: set real subreddit/thread URL
  // Until the address is set, the Feedback link is left out of the header and the footer;
  // publish.sh checks for this test before it stages a placeholder.
  const FEEDBACK_READY = !/REPLACE_ME/.test(REDDIT_URL);

  // D1580: the pages under "How These Bills Were Written", in menu order. Each
  // slug is a file in outputs/site-pages/; render-test.js checks the two agree.
  // This list is the one source of the menu labels (2026-10-01): each label is the
  // page's title, or the part of it before a colon, and every cross-link to a page
  // uses the same words. The order is the author's of 2026-11-13.
  const HOW_PAGES = [
    { slug: "philosophy", label: "Political Philosophy" },
    { slug: "congress", label: "Why Congress Needs to Lead" },
    { slug: "amendments", label: "Five Constitutional Amendments" },
    { slug: "filibuster", label: "The Filibuster" },
    { slug: "courts", label: "Writing for Today’s Court" },
    { slug: "game-theory", label: "Game Theory" },
    { slug: "built-to-survive", label: "Built to Survive" },
    { slug: "evidence", label: "Following the Evidence" },
    { slug: "goals-conflict", label: "Where the Goals Conflict" },
    { slug: "ai", label: "Artificial Intelligence" },
    { slug: "methodology", label: "Methodology" },
    { slug: "sources", label: "Sources of Policy Ideas" },
  ];
  window.HOW_PAGES = HOW_PAGES;

  /* Skip-track symbols for every "go to the next one" control (the author,
     2026-10-01, with Policy Playlists): a triangle and a bar, drawn in SVG so
     it takes the text color. Arrows that only open something stay arrows. */
  window.trackIcon = (dir) => {
    const shape = dir === "prev"
      ? `<path d="M18 5 8 12l10 7z" fill="currentColor"/><path d="M6 5v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`
      : `<path d="M6 5l10 7-10 7z" fill="currentColor"/><path d="M18 5v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`;
    return `<svg class="track-icon track-icon-${dir === "prev" ? "prev" : "next"}" viewBox="0 0 24 24" width="0.95em" height="0.95em" aria-hidden="true">${shape}</svg>`;
  };
  window.shuffleIcon = (size) => `<svg class="shuffle-icon" viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>`;
  // A playlist's tracks are numbered in its order, on its page and on each bill page.
  window.trackNum = (n) => String(n).padStart(2, "0");

  // The classic magnifying glass, drawn like the shuffle icon.
  window.searchIcon = (size) => `<svg class="search-icon" viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>`;
  // Search and Shuffle are icons alone (author, 2026-10-01); the word stays for screen readers
  // and shows as a tooltip.
  const iconLabel = (icon, word) => `<span class="nav-icon">${icon}<span class="sr-only">${word}</span></span>`;

  const NAV_ITEMS = [
    // The author, 2026-11-13: the tab order is What Is This Project?, 3 Promises,
    // Policy Playlists, 100 Bills, Why ’27 to ’29, How, Progress, Search, Shuffle.
    // What Is This Project? is the front door, with the opening banner (author, 2026-11-13).
    { id: "about", label: "What Is This Project?", href: "index.html" },
    // D1660 (author, 2026-09-29): the three promises. Its id stays "home" (from=home on bill links).
    { id: "home", label: "3 Promises", href: "three-promises.html" },
    // Author, 2026-10-01: "Policy Playlists" (renamed the same day from "100 Bills in 16
    // Policy Playlists"), and to its right the bills grouped by promise.
    { id: "agenda", label: "Policy Playlists", href: "topic.html" },
    { id: "promises", label: "100 Bills in 100 Days", href: "promises.html" },
    { id: "why", label: "Why ’27 to ’29, not 2029", href: "page.html?p=why" },
    { id: "how", label: "How These Bills Were Written", menu: HOW_PAGES },
    { id: "progress", label: "Progress", href: "progress.html" },
    { id: "search", label: iconLabel(window.searchIcon(18), "Search"), title: "Search", href: "search.html", icon: true },
    // W3937: one press anywhere opens the 100 Bills tab with a random bill playing.
    { id: "shuffle", label: iconLabel(window.shuffleIcon(18), "Shuffle"), title: "Shuffle", href: "topic.html?shuffle=1", icon: true },
    { id: "feedback", label: "Feedback", href: REDDIT_URL, external: true },
  ].filter((item) => item.id !== "feedback" || FEEDBACK_READY);
  // An outbound link's arrow is decoration; screen readers hear that it opens a new tab.
  const EXTERNAL_MARK = `<span aria-hidden="true"> ↗</span><span class="sr-only"> (opens in a new tab)</span>`;

  // page.html serves several nav entries, so its active entry comes from ?p=.
  /* A bill page belongs to no tab of its own (site review 2.17). A link to it from a bill
     card carries ?from=<tab>, and that tab is current; with no `from`, none is. */
  const FROM_TABS = { playlists: "agenda", promises: "promises", shuffle: "shuffle", search: "search", home: "home" };
  function activeIds(activePage) {
    if (/\/law(\.html)?$/.test(window.location.pathname)) {
      return { top: FROM_TABS[new URLSearchParams(window.location.search).get("from")] || "", sub: "" };
    }
    if (activePage !== "page") return { top: activePage, sub: "" };
    const p = new URLSearchParams(window.location.search).get("p") || "";
    if (p === "about" || p === "why") return { top: p, sub: "" };
    if (HOW_PAGES.some((h) => h.slug === p)) return { top: "how", sub: p };
    return { top: "", sub: "" };
  }

  function renderMenu(item, active) {
    const links = item.menu.map((h) => {
      const current = h.slug === active.sub ? ' aria-current="page"' : "";
      return `<li><a href="page.html?p=${h.slug}"${current}>${h.label}</a></li>`;
    }).join("");
    const open = item.id === active.top ? " nav-menu-active" : "";
    return `<div class="nav-menu${open}">
        <button type="button" class="nav-menu-button" aria-expanded="false" aria-controls="nav-menu-${item.id}">${item.label}<svg class="nav-caret" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
        <ul class="nav-menu-list" id="nav-menu-${item.id}">${links}</ul>
      </div>`;
  }

  const svg = (cls, body) => `<svg class="${cls}" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const ICON_SUN = svg("icon-sun", `<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>`);
  const ICON_MOON = svg("icon-moon", `<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/>`);
  const ICON_MENU = svg("icon-menu", `<path d="M4 7h16M4 12h16M4 17h16"/>`);
  const ICON_CLOSE = svg("icon-close", `<path d="M6 6l12 12M18 6 6 18"/>`);

  function renderHeader(activePage) {
    const active = activeIds(activePage);
    const nav = NAV_ITEMS.map((item) => {
      if (item.menu) return renderMenu(item, active);
      const current = item.id === active.top ? ' aria-current="page"' : "";
      const target = item.external ? ' target="_blank" rel="noopener"' : "";
      const title = item.title ? ` title="${item.title}"` : "";
      const cls = item.icon ? ' class="nav-icon-link"' : "";
      return `<a href="${item.href}"${cls}${current}${target}${title}>${item.label}${item.external ? EXTERNAL_MARK : ""}</a>`;
    }).join("");

    // The header link's name says where it goes (site review 1.37); the campaign line
    // "100 Bills in 100 Days" is a tab, so it is not repeated here (site review 2.17).
    return `
      <header class="site-header">
        <div class="site-header-inner">
          <div class="site-header-bar">
            <a class="site-title" href="index.html" aria-label="Project ’27 to ’29, home"><img class="site-mark" src="assets/img/mark-project2729-small-48.png" srcset="assets/img/mark-project2729-small-96.png 2x" width="44" height="44" alt=""><span class="site-title-main">Project ’27 to ’29</span></a>
            <div class="site-header-tools">
              <button type="button" class="theme-toggle" aria-pressed="false" aria-label="Dark theme" title="Switch to the dark theme">${ICON_MOON}${ICON_SUN}</button>
              <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="site-nav">${ICON_MENU}${ICON_CLOSE}<span class="nav-toggle-word">Menu</span></button>
            </div>
          </div>
          <nav class="site-nav" id="site-nav" aria-label="Main">${nav}</nav>
        </div>
      </header>`;
  }

  /* The footer (site review 1.34, 2.3). The date fills in once the payload is open: it is
     the day the site was built (build_site_data.py, builtOn), or the progress figures' date
     in a payload built before builtOn existed. */
  function renderFooter() {
    return `
      <footer class="site-footer">
        <div class="site-footer-inner">
          <div class="site-footer-text">
            <p>Model federal legislation published for discussion. Nothing here is enacted law or legal advice.</p>
            <p class="site-footer-updated" hidden></p>
          </div>
          <ul class="site-footer-links">
            <li><a href="page.html?p=methodology">Methodology</a></li>
            ${FEEDBACK_READY ? `<li><a href="${REDDIT_URL}" target="_blank" rel="noopener">Feedback${EXTERNAL_MARK}</a></li>` : ""}
          </ul>
        </div>
      </footer>`;
  }

  function fillFooterDate() {
    const el = document.querySelector(".site-footer-updated");
    const data = window.SITE_DATA || {};
    if (!el) return;
    let iso = data.builtOn || "", shown = "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      shown = new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    } else if (data.progress && data.progress.as_of) {
      shown = data.progress.as_of;
      iso = "";
    }
    if (!shown) return;
    el.innerHTML = `Last updated <time${iso ? ` datetime="${iso}"` : ""}>${window.escapeHtml ? window.escapeHtml(shown) : shown}</time>.`;
    el.hidden = false;
  }

  /* The sticky header's height, as --header-h on <html>, for scroll offsets (html's
     scroll-padding-top), the opening screens and the bill page's sticky contents. The
     header changes height as the web font loads, the window narrows and the menu wraps. */
  function trackHeaderHeight() {
    const header = document.querySelector(".site-header");
    if (!header) return;
    const set = () => document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
    set();
    window.addEventListener("resize", set);
    if (window.ResizeObserver) new ResizeObserver(set).observe(header);
  }

  /* The light/dark switch (site review 3.8). theme.js, loaded in the <head>, holds the
     theme; this draws its state and flips it. */
  function wireThemeToggle() {
    const button = document.querySelector(".theme-toggle");
    if (!button || !window.siteTheme) { if (button) button.hidden = true; return; }
    const show = () => {
      const dark = window.siteTheme.current() === "dark";
      button.setAttribute("aria-pressed", String(dark));
      button.title = dark ? "Switch to the light theme" : "Switch to the dark theme";
    };
    show();
    button.addEventListener("click", () => { window.siteTheme.toggle(); show(); });
    document.addEventListener("site-themechange", show);
  }

  /* The reading order of the tabs (the author, 2026-09-29): each tab page ends with a
     button to the next one, the "How" pages in their menu order. Search, a bill page
     and the footer pages are not steps, and the last step (Progress) has no button. */
  const STEPS = [
    { href: "index.html", label: "What Is This Project?" },
    { href: "three-promises.html", label: "3 Promises" },
    { href: "topic.html", label: "Policy Playlists" },
    { href: "promises.html", label: "100 Bills in 100 Days" },
    { href: "page.html?p=why", label: "Why ’27 to ’29, not 2029" },
    ...HOW_PAGES.map((h) => ({ href: `page.html?p=${h.slug}`, label: h.label })),
    { href: "progress.html", label: "Progress" },
  ];

  function currentStep() {
    // The Shuffle tab shares topic.html with Policy Playlists but is not a step. Neither is
    // the not-found page (data-page=""), whatever the missing address happens to end in.
    if (document.body.dataset.page === "shuffle" || document.body.dataset.page === "") return -1;
    const file = window.location.pathname.split("/").pop() || "index.html";
    if (file === "page.html") {
      const p = new URLSearchParams(window.location.search).get("p") || "";
      return STEPS.findIndex((s) => s.href === `page.html?p=${p}`);
    }
    return STEPS.findIndex((s) => s.href === file);
  }

  function renderNextTab() {
    const i = currentStep();
    if (i < 0 || i === STEPS.length - 1) return "";
    const next = STEPS[i + 1];
    return `<div class="wrap next-tab"><a class="btn btn-primary btn-next" href="${next.href}">` +
      `Next: ${next.label} <span class="btn-arrow" aria-hidden="true">${window.trackIcon("next")}</span></a></div>`;
  }

  /* publish.sh sets data-root on the not-found page, which is served at any depth of a
     missing address (/a/b/c), where a relative link points into a folder that does not
     exist. A <base> tag cannot do this: the published policy sets base-uri 'none', and a
     base would send the skip link's #main to the home page. */
  function rootHeaderAndFooter(root) {
    if (!root) return;
    const relative = (u) => !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(u);
    const fix = (el, attr) => {
      const u = el.getAttribute(attr);
      if (u && relative(u)) el.setAttribute(attr, root + u);
    };
    for (const el of document.querySelectorAll(".site-header a, .site-footer a")) fix(el, "href");
    for (const img of document.querySelectorAll(".site-header img, .site-footer img")) {
      fix(img, "src");
      const set = img.getAttribute("srcset");
      if (set) img.setAttribute("srcset", set.split(",").map((c) => root + c.trim()).join(", "));
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page || "";
    const headerMount = document.getElementById("site-header");
    const footerMount = document.getElementById("site-footer");
    const main = document.getElementById("main");
    if (headerMount) headerMount.outerHTML = renderHeader(page);
    if (footerMount) footerMount.outerHTML = renderFooter();
    rootHeaderAndFooter(document.body.dataset.root);
    if (main) main.insertAdjacentHTML("beforeend", renderNextTab());
    trackHeaderHeight();
    wireMenus();
    wireThemeToggle();
    if (window.siteReady) window.siteReady(fillFooterDate);
  });

  /* A #fragment naming an element a page script draws (a planned bill's card, which
     search links to) arrives before that element exists, so the browser cannot scroll
     to it. Scroll once the page has rendered. The bill page handles its own. */
  if (window.siteReady && window.location.hash && !/law\.html$/.test(window.location.pathname)) {
    window.siteReady(() => setTimeout(() => {
      let id = "";
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch (e) { return; }   // a malformed fragment
      const el = id && document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      el.classList.add("is-highlighted");
    }, 0));
  }

  /* Hover opens the How menu through CSS where the device has hover; this adds the tap,
     click and keyboard path. A menu closes on Escape (focus returns to its button), on a
     click elsewhere, and when focus leaves it (site review 1.18).
     The phone menu (under 60rem) works the same way around the whole tab list: the Menu
     button opens it, and Escape, a click outside the header, following a link in it, or
     focus leaving the header closes it (site review 2.1). */
  function wireMenus() {
    const menus = [...document.querySelectorAll(".nav-menu")];
    const setOpen = (menu, open) => {
      menu.classList.toggle("nav-menu-open", open);
      menu.querySelector(".nav-menu-button").setAttribute("aria-expanded", String(open));
    };
    for (const menu of menus) {
      const button = menu.querySelector(".nav-menu-button");
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = !menu.classList.contains("nav-menu-open");
        menus.forEach((m) => setOpen(m, false));
        setOpen(menu, open);
      });
      menu.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && menu.classList.contains("nav-menu-open")) {
          e.stopPropagation();
          setOpen(menu, false);
          button.focus();
        }
      });
      menu.addEventListener("focusout", (e) => {
        if (!e.relatedTarget || !menu.contains(e.relatedTarget)) setOpen(menu, false);
      });
    }
    document.addEventListener("click", () => menus.forEach((m) => setOpen(m, false)));

    const header = document.querySelector(".site-header");
    const toggle = header && header.querySelector(".nav-toggle");
    if (!toggle) return;
    const setNav = (open, refocus) => {
      header.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      if (!open) menus.forEach((m) => setOpen(m, false));
      if (!open && refocus) toggle.focus();
    };
    toggle.addEventListener("click", () => setNav(!header.classList.contains("nav-open")));
    header.addEventListener("click", (e) => { if (e.target.closest(".site-nav a")) setNav(false); });
    header.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && header.classList.contains("nav-open")) setNav(false, true);
    });
    header.addEventListener("focusout", (e) => {
      if (header.classList.contains("nav-open") && (!e.relatedTarget || !header.contains(e.relatedTarget))) setNav(false);
    });
    // A click anywhere outside the header closes the panel.
    document.addEventListener("click", (e) => {
      if (header.classList.contains("nav-open") && !header.contains(e.target)) setNav(false);
    });
    // Widening past the phone layout leaves no open panel behind.
    const wide = window.matchMedia ? window.matchMedia("(min-width: 60.01rem)") : null;
    if (wide && wide.addEventListener) wide.addEventListener("change", () => { if (wide.matches) setNav(false); });
  }

  const PROMISE_LETTERS = { 1: "A", 2: "F", 3: "I" }; // D1782

  /* Decorative: the heading or label beside it names the promise. Images are
     written by scripts/promise_site_images.py. */
  // Bottom to top, above the base (D1853). Promise 2 waits on W3816.
  const ANIM_LAYERS = { 1: ["envelope"], 2: ["tophat", "hardhat"], 3: ["s1", "s2", "s3", "s4", "s5", "thread", "needle"] };

  /* A picture's dark file follows the theme in force, the visitor's choice or else the
     system's: theme.js rewrites the media of every source[data-theme-dark] when it changes. */
  const darkMedia = () => (window.siteTheme ? window.siteTheme.darkMedia() : "(prefers-color-scheme: dark)");

  function promiseImage(stem, px) {
    return `<picture class="promise-img"><source srcset="assets/img/${stem}-dark.webp" media="${darkMedia()}" data-theme-dark>` +
      `<img src="assets/img/${stem}-light.webp" width="${px}" height="${px}" alt=""></picture>`;
  }

  // Shared helpers for the agenda, used by several pages.
  window.AGENDA = {
    categories() {
      return ((window.SITE_DATA || {}).agenda || { categories: [] }).categories;
    },
    /* Every entry has a page at law.html?bill=<page> (build_site_data.py, W6808). "slug"
       means the bill has text, and only a bill with text has one. */
    findBill(page) {
      for (const c of this.categories()) {
        for (const b of c.bills) if (b.page === page) return { bill: b, category: c };
      }
      return null;
    },
    /* The current address of a page that used to be at this one, or null (W9447). The
       address comes from the URL, so a plain lookup of "constructor" would find a function. */
    movedTo(page) {
      const moved = ((window.SITE_DATA || {}).agenda || {}).moved || {};
      return Object.prototype.hasOwnProperty.call(moved, page) ? moved[page] : null;
    },
    /* The four public stages, the progress page's (data/progress-stages.json). Each
       agenda entry carries its stage in the payload (build_site_data.py, W7441). */
    stages() {
      return ((window.SITE_DATA || {}).progress || { stages: [] }).stages;
    },
    /* The stages at least one bill has reached: the only ones a legend or filter names. */
    stagesInUse() {
      return this.stages().filter((s) => s.count > 0);
    },
    stageName(b) {
      const s = this.stages().find((x) => x.n === b.stage);
      return s ? s.name : "";
    },
    stagePill(b) {
      return `<span class="pill-status pill-stage-${b.stage}">${window.escapeHtml(this.stageName(b))}</span>`;
    },
    /* The playlist an agenda entry sits in, and its track number there. */
    placeOf(b) {
      for (const c of this.categories()) {
        const i = c.bills.findIndex((x) => x === b || x.name === b.name);
        if (i >= 0) return { category: c, track: i + 1 };
      }
      return null;
    },
    /* Some entries are listed with the bills but are not among the hundred ("counts":
       false in agenda.json). Every count on the site is of the hundred, and this one
       sentence explains the others wherever they appear (site review 2.x, 2026-10-01).
       It counts them from the agenda by kind, because a hand-written count went stale
       when a third amendment was added (2026-10-27). Given a family's bills, it counts
       only those and says "these bills"; with no argument it speaks for the whole site
       (W9418). */
    counted(b) { return b.counts !== false; },
    notCountedNote(onPage) {
      const others = (onPage || this.categories().flatMap((c) => c.bills)).filter((b) => !this.counted(b));
      const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
      const word = (n) => WORDS[n] || String(n);
      const NOUN = { "Constitutional amendment": ["constitutional amendment", "constitutional amendments"], "Senate rule": ["Senate rule", "Senate rules"] };
      const parts = [...new Set(others.map((b) => b.kind))].map((k) => {
        const n = others.filter((b) => b.kind === k).length;
        const [one, many] = NOUN[k] || [String(k).toLowerCase(), `${String(k).toLowerCase()}s`];
        return n === 1 ? `a ${one}` : `${word(n)} ${many}`;
      });
      const list = parts.length > 2 ? `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}` : parts.join(" and ");
      const lead = word(others.length);
      const one = others.length === 1;
      return `${lead.charAt(0).toUpperCase()}${lead.slice(1)} ${one ? "measure is" : "measures are"} listed with ${onPage ? "these" : "the"} bills but ${one ? "is" : "are"} not counted among the hundred, because ${one ? "it is not" : "none is"} a bill: ${list}.`;
    },
    /* The stages in use, defined in one line wherever cards or counts appear, with the
       note that the card sentences are AI-drafted (the per-card "draft card" pill it
       replaces is gone; the `draft` flag stays in the data). */
    legend() {
      const esc = (s) => window.escapeHtml(String(s));
      return `<p class="card-legend">${this.stagesInUse().map((s) => `<span>${esc(s.name)}: ${esc(s.legend)}</span>`).join(" ")} ` +
        `<span class="card-legend-ai">Card sentences are AI-drafted and under the author’s review.</span></p>`;
    },
    /* "N bills: a at the platform stage, b at the draft under review stage, and c at the reviewed draft stage", counting
       only the hundred. */
    countLine(bills) {
      const counted = bills.filter((b) => this.counted(b));
      const parts = this.stages().map((s) => [counted.filter((b) => b.stage === s.n).length, `at the ${s.name.toLowerCase()} stage`]).filter(([k]) => k > 0);
      const noun = counted.length === 1 ? "bill" : "bills";
      if (parts.length === 1) return `${counted.length} ${noun}, ${counted.length === 1 ? "" : "all "}${parts[0][1]}.`;
      const said = parts.map(([k, w]) => `${k} ${w}`);
      return `${counted.length} ${noun}: ${said.length === 2 ? said.join(" and ") : `${said.slice(0, -1).join(", ")}, and ${said[said.length - 1]}`}.`;
    },
    /* The three promises: the home page's first three headings, carried into the
       payload by build_site_data.py (D1670), in the order the site shows them (author,
       2026-10-02: Fairness, Affordability, Integrity). Each keeps its own number n
       (Affordability 1, Fairness 2, Integrity 3), which names its symbol, color and
       promises.html?promise=N; anything listing promises follows this array's order. */
    promises() {
      return ((window.SITE_DATA || {}).agenda || {}).promises || [];
    },
    /* Promise numbers sorted into display order. */
    inPromiseOrder(ns) {
      const rank = Object.fromEntries(this.promises().map((p, i) => [p.n, i]));
      return [...ns].sort((a, b) => (rank[a] ?? a) - (rank[b] ?? b));
    },
    allThreeTitle() {
      return ((window.SITE_DATA || {}).agenda || {}).allThree || "";
    },
    /* The promise's one word, the part of its heading before the colon (D1782). */
    promiseWord(n) {
      const p = this.promises().find((x) => x.n === n);
      return p ? p.title.split(":")[0] : `Promise ${n}`;
    },
    /* The promise marks (D1767, option C). Under 72 px a promise is a vector mark:
       the wheel, one third per promise with its letter: A at the bottom, F top left, I
       top right, where the Project mark sets Fairness, Affordability and Integrity
       (author, 2026-10-01),
       an unkept third a lighter shade of its own color (author, 2026-09-30); or one
       letter chip. At 72 px and up, the symbol images, and for all three promises the
       wheel itself (the three-symbol badge was retired, author, 2026-09-30). Colors
       come from the stylesheet through classes, because the published style-src
       forbids style attributes. Sizes: D1761-D1764. With `decorative`, the wheel is
       hidden from screen readers because the text beside it names the promise. */
    wheel(kept, px, decorative) {
      const has = new Set(kept);
      const pt = (deg, r) => [50 + r * Math.cos(deg * Math.PI / 180), 50 + r * Math.sin(deg * Math.PI / 180)].map((v) => v.toFixed(2));
      const mid = { 1: 90, 2: 210, 3: 330 };
      const on = (n) => (has.has(n) ? `${n}` : `${n} mk-off`);
      const sectors = [1, 2, 3].map((n) => {
        const [x0, y0] = pt(mid[n] - 60, 48), [x1, y1] = pt(mid[n] + 60, 48);
        return `<path class="mk-p${on(n)}" d="M50,50 L${x0},${y0} A48,48 0 0 1 ${x1},${y1} Z"/>`;
      }).join("");
      const gaps = [1, 2, 3].map((n) => { const [x, y] = pt(mid[n] + 60, 50); return `<line class="mk-gap" x1="50" y1="50" x2="${x}" y2="${y}"/>`; }).join("");
      const letters = [1, 2, 3].map((n) => { const [x, y] = pt(mid[n], 27); return `<text class="mk-t mk-t${on(n)}" x="${x}" y="${y}">${PROMISE_LETTERS[n]}</text>`; }).join("");
      // "Keeps Fairness and Affordability": the SVG's <title> is the tooltip and its name.
      const words = this.inPromiseOrder([...has]).map((n) => this.promiseWord(n));
      const label = "Keeps " + (words.length < 3 ? words.join(" and ") : `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`);
      const a11y = decorative ? 'aria-hidden="true"' : `role="img" aria-label="${window.escapeHtml(label)}"`;
      const title = decorative ? "" : `<title>${window.escapeHtml(label)}</title>`;
      return `<svg class="mark mark-wheel" width="${px}" height="${px}" viewBox="0 0 100 100" ${a11y}>${title}${sectors}${gaps}${letters}</svg>`;
    },
    chip(n, px) {
      return `<svg class="mark mark-chip" width="${px}" height="${px}" viewBox="0 0 100 100" aria-hidden="true">` +
        `<circle class="mk-p${n}" cx="50" cy="50" r="48"/><text class="mk-t mk-t${n} mk-chip-t" x="50" y="52">${PROMISE_LETTERS[n]}</text></svg>`;
    },
    /* A promise's symbol image, with its dark-mode file. */
    symbol(n, px) {
      return promiseImage(`promise-${n}`, px);
    },
    /* A promise card's symbol with its moving parts as stacked layers (D1853), which the
       stylesheet animates on hover, or always where there is no hover. A promise whose
       layers are not cut yet gets the still image. Layers: scripts/promise_anim_layers.py. */
    animatedSymbol(n, px) {
      const layers = ANIM_LAYERS[n];
      if (!layers) return this.symbol(n, px);
      const pic = (l) => `<picture class="pa pa-${l}"><source srcset="assets/img/promise-${n}-dark-${l}.webp" media="${darkMedia()}" data-theme-dark>` +
        `<img src="assets/img/promise-${n}-light-${l}.webp" width="${px}" height="${px}" alt=""></picture>`;
      return `<span class="promise-anim promise-anim-${n}">${["base", ...layers].map(pic).join("")}</span>`;
    },
    /* Each bill's how-sentences replace its one-line description everywhere (D1673).
       With `only`, just that promise's sentence; otherwise every sentence, each
       marked with its promise. A bill with no tag shows no sentence. */
    /* A bill's Sources section (W7229), grouped; a group with no entry is left out. The
       build allows only http and https addresses, so each url is safe as a link. */
    sourcesList(b) {
      const list = b.sources || [];
      if (!list.length) return "";
      const esc = window.escapeHtml;
      const sentence = (t) => /[.?!]$/.test(t) ? t : `${t}.`;
      const groups = [["built_on", "Built on"], ["idea", "Ideas from"], ["evidence", "Evidence"], ["related", "Similar earlier proposals"]];
      return `<h2 class="sources-title" id="sources-title">Sources</h2>
        <p class="sources-lead">Listing a source does not mean its authors endorse this bill.</p>` +
        groups.map(([rel, label]) => {
          const items = list.filter((s) => s.relation === rel);
          if (!items.length) return "";
          return `<h3 class="sources-group">${label}</h3><ul class="sources-list">${items.map((s) => {
            const by = [s.authors, s.year].filter(Boolean).join(", ");
            return `<li><a href="${esc(s.url)}" rel="noopener noreferrer">${esc(s.title)}</a>${/[.?!]$/.test(s.title) ? "" : "."}` +
              `${by ? ` ${esc(sentence(by))}` : ""} ${esc(sentence(s.used_for))}</li>`;
          }).join("")}</ul>`;
        }).join("");
    },

    promiseHows(b, only) {
      const order = this.inPromiseOrder((b.promises || []).map((t) => t.promise));
      const tags = (b.promises || []).filter((t) => !only || t.promise === only)
        .sort((x, y) => order.indexOf(x.promise) - order.indexOf(y.promise));
      if (!tags.length) return "";
      const titles = Object.fromEntries(this.promises().map((p) => [p.n, p.title]));
      const md = (s) => (window.inlineMd ? window.inlineMd(s) : s);
      if (only) return `<p class="promise-how">${md(tags[0].how)}</p>`;
      return `<ul class="promise-hows">${tags.map((t) =>
        // The promise's word in its color, no chip or number (author, 2026-10-01).
        `<li><span class="promise-mark promise-mark-${t.promise}" title="${window.escapeHtml ? window.escapeHtml(titles[t.promise] || "") : ""}">${this.promiseWord(t.promise)}:</span> ${md(t.how)}</li>`
      ).join("")}</ul>`;
    },
    /* Every card's id, the one scheme search and the progress page link to: "bill-" and
       the statutory short title without its leading "The", lowercased, every run of other
       characters a hyphen ("The People's Banking Act" -> "bill-people-s-banking-act").
       search-page.js slugify computes the same string. */
    cardId(b) {
      return "bill-" + String(b.name || "").replace(/[’‘]/g, "'").toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    },
    /* A bill card. opts: track (its number in the playlist), promise (show only that
       promise's sentence), level (the heading level under the page's headings, 2-4;
       default 3; the size is the stylesheet's whatever the level), from (the tab the card
       is on, carried to the bill page so its nav highlights that tab), id: false (no id,
       for a second copy of a card on one page). */
    billCard(b, opts) {
      const o = opts || {};
      const esc = (s) => window.escapeHtml(String(s));
      const pill = this.stagePill(b);
      // The amendments and the Senate rule say what they are (agenda.json "kind").
      const kind = !this.counted(b) && b.kind ? `<span class="pill-kind" title="Not counted among the 100">${esc(b.kind)}</span>` : "";
      const tags = b.promises || [];
      // D882: display_name is the site label where it differs from the statutory short
      // title. The card shows the label; the real short title stays in the tooltip, because
      // a committee cites the statute's name and it must not vanish from the page.
      const shown = b.display_name || b.name;
      const alt = b.display_name ? ` title="${esc(b.name)}"` : "";
      const wheel = tags.length ? `<span class="bill-card-mark">${this.wheel(tags.map((t) => t.promise), 40)}</span>` : "";
      const track = o.track ? `<span class="track-num" aria-label="Track ${o.track}">${window.trackNum(o.track)}</span>` : "";
      const h = [2, 3, 4].includes(o.level) ? o.level : 3;
      const inner = `<div class="bill-card-top">${track}${pill}${kind}${wheel}</div>
        <h${h} class="bill-card-title"${alt}>${shown}</h${h}>
        ${this.promiseHows(b, o.promise)}`;
      // The stage and promises ride on the card for the pages' filters (topic-page.js).
      const id = (o.id === false ? "" : ` id="${this.cardId(b)}"`) +
        ` data-stage="${b.stage}" data-keeps="${tags.map((t) => t.promise).join(" ")}"`;
      const from = o.from ? `&from=${encodeURIComponent(o.from)}` : "";
      const cta = b.slug ? "Open the bill →" : "See what it would do →";
      return `<a class="bill-card bill-card-link"${id} href="law.html?bill=${b.page}${from}">${inner}<span class="bill-card-cta">${cta}</span></a>`;
    },
  };
})();
