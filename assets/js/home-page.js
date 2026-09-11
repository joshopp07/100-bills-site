/* Home page: the topic grid from the agenda, and the random-provision door. */
(function () {
  function counts(cat) {
    const c = { canonical: 0, planned: 0, proposed: 0 };
    for (const b of cat.bills) c[b.status] = (c[b.status] || 0) + 1;
    return c;
  }

  /* The hero says "Sixteen themes." in the page source so the sentence reads
     correctly before the gate opens, and this corrects it from the agenda after
     it does. A count written into the copy goes stale the next time a theme is
     added, and nothing fails when it does -- the page just says something untrue. */
  function renderThemeCount(cats) {
    const el = document.getElementById("theme-count");
    if (!el) return;
    const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven",
      "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
      "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
    const w = WORDS[cats.length] || String(cats.length);
    el.textContent = w.charAt(0).toUpperCase() + w.slice(1);
  }

  function renderTopicGrid() {
    const mount = document.getElementById("topic-grid");
    if (!mount) return;
    const cats = window.AGENDA.categories();
    renderThemeCount(cats);
    mount.innerHTML = cats
      .map((c, i) => {
        const n = counts(c);
        return `<a class="topic-card" href="topic.html?topic=${c.slug}">
          <div class="topic-num">${String(i + 1).padStart(2, "0")}</div>
          <h3>${c.title}</h3>
          <p>${window.inlineMd(c.explainer)}</p>
          <div class="topic-meta">${c.bills.length} bills · ${n.canonical} drafted</div>
        </a>`;
      })
      .join("");
  }

  function randomProvisionUrl() {
    const data = window.SITE_DATA || {};
    const candidates = [];
    for (const slug of Object.keys(data.links || {})) {
      const links = data.links[slug];
      for (const g of links.groups || []) {
        for (const b of g.bullets || []) {
          if ((b.billAnchors || []).length) candidates.push({ slug, anchor: b.billAnchors[0] });
        }
      }
    }
    if (!candidates.length) return "topic.html";
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return `law.html?bill=${pick.slug}&sec=${pick.anchor}&open=1`;
  }

  window.siteReady(() => {
    renderTopicGrid();
    const door = document.getElementById("random-door");
    if (door) {
      door.addEventListener("click", (e) => {
        e.preventDefault();
        window.location.href = randomProvisionUrl();
      });
    }
  });
})();
