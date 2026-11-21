/* Home page: the vision copy and the list of the three promises. The topic grid,
   the family count and the random-provision door were cut with their sections
   (the author, 2026-09-29). */
(function () {
  /* The vision copy (W3314) lives in the encrypted payload rather than the page
     source, so it is hidden until the gate opens (W3323). */
  function renderVision() {
    const mount = document.getElementById("home-vision");
    const home = ((window.SITE_DATA || {}).pages || {}).home;
    if (!mount || !home) return;
    // No draft banner (the author, 2026-10-01: "delete that line everywhere").
    mount.innerHTML = `<h1 class="hero-trade">${window.escapeHtml(home.title)}</h1>` +
      `<div class="hero-vision">${window.renderMarkdownBlock(home.markdown)}</div>`;
    // A bill page marks the tab the reader came from (nav.js activeIds): from=home.
    mount.querySelectorAll('a[href^="law.html?"]').forEach((a) => {
      const href = a.getAttribute("href");
      if (/[?&]from=/.test(href)) return;
      a.setAttribute("href", /^law\.html\?bill=[^&#]+/.test(href)
        ? href.replace(/^(law\.html\?bill=[^&#]+)/, "$1&from=home")
        : href.replace(/^law\.html\?/, "law.html?from=home&"));
    });
    renderPromiseList(mount);
    renderPromiseArt(mount);
    if (window.PromiseAnim) window.PromiseAnim.bind(mount);
  }

  /* D1667 (author, 2026-09-29): the three promises are listed under the title, each a
     link that jumps to its section, as "Fairness: ..." with the word and colon in
     bold (author, 2026-10-01: the "Promise 1)" numbering is gone). The promises are the
     FIRST THREE section headings of outputs/site-pages/home.md, in their order there
     (author, 2026-10-02: Fairness, Affordability, Integrity); each keeps its own number
     (AGENDA.promises()), which picks its symbol, color and anchor. render-test.js
     asserts the list matches them. */
  function renderPromiseList(mount) {
    const heads = Array.from(mount.querySelectorAll(".hero-vision h2")).slice(0, 3);
    if (heads.length < 3) return;
    const ns = window.AGENDA.promises().map((p) => p.n);
    const items = heads.map((h, i) => {
      const n = ns[i];
      h.id = `promise-${n}`;
      // Author, 2026-09-30: the symbol opens each row (72 px, the floor for symbol
      // images), and the promise's word is plain text (the letter chip that stood in
      // for its first letter was removed the same day).
      const [name, ...rest] = h.textContent.split(":");
      return `<li><a class="pa-trigger" href="#promise-${n}"><span class="promise-list-art">${window.AGENDA.animatedSymbol(n, 72)}</span>` +
        `<span class="promise-list-text promise-text-${n}"><strong class="promise-label promise-label-${n}">${window.escapeHtml(name)}:</strong>${window.escapeHtml(rest.join(":"))}</span></a></li>`;
    }).join("");
    mount.querySelector(".hero-trade").insertAdjacentHTML("afterend", `<ol class="promise-list">${items}</ol>`);
  }

  /* Each promise section opens with its symbol at 88 px and ends with the wheel,
     that promise's third dark and the others lighter, which introduces the wheel the
     bill cards use. The all-three section (the fourth heading) opens with the full
     wheel (author, 2026-09-30; the three-symbol badge is retired). Runs after
     renderPromiseList, which copies the headings' HTML. The symbols and the wheel
     move on hover as on the 100 Bills tab, and loop on screen on a phone (author,
     2026-09-30): each heading is the trigger. */
  function renderPromiseArt(mount) {
    const heads = Array.from(mount.querySelectorAll(".hero-vision h2")).slice(0, 4);
    if (heads.length < 4) return;
    const ns = window.AGENDA.promises().map((p) => p.n);
    heads.forEach((h, i) => {
      const art = i < 3 ? window.AGENDA.animatedSymbol(ns[i], 88) : window.AGENDA.wheel([1, 2, 3], 88, true);
      // Each promise sentence in its promise's color (author, 2026-10-01).
      h.classList.add("promise-head", i < 3 ? "pa-trigger" : "pa-trigger-all");
      if (i < 3) h.classList.add(`promise-text-${ns[i]}`);
      h.insertAdjacentHTML("afterbegin", `<span class="promise-head-art">${art}</span>`);
      // The wheel sits between the symbol and the words, where it is seen (author, 2026-10-01).
      if (i < 3) h.querySelector(".promise-head-art").insertAdjacentHTML("afterend", `<span class="promise-head-wheel">${window.AGENDA.wheel([ns[i]], 44, true)}</span>`);
    });
  }

  window.siteReady(() => {
    renderVision();
  });
})();
