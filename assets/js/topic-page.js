/* Two tabs, split by the author 2026-10-01. Promises are tagged on bills (D1670), each
   tag carrying the sentence saying how the bill keeps that promise (D1671, W3533). A
   family's promises are derived from its bills. ("Policy Playlists" replaced "families",
   author, 2026-10-01.)

   The Policy Playlists tab (topic.html, body data-page "agenda"):
   topic.html              the playlists as CDs, a shuffle button showing a
                           random bill, and a link to the one-page list.
   topic.html?topic=X      one playlist: its bills, each with every how-sentence,
                           and a shuffle button limited to that playlist.
   topic.html?all=1        every playlist and every bill with its how-sentences
                           on one page; &status= and &keeps= (1-3 or all) filter it.
   topic.html?shuffle=1    the nav's Shuffle tab.
   topic.html?promise=N    an old link: forwarded to promises.html?promise=N.

   The 100 Bills in 100 Days tab (promises.html, body data-page "promises"):
   promises.html           the three promises as cards, each with its count of the
                           hundred and its first three bills, and a fourth card for
                           the bills keeping all three (promises.html?promise=all).
   promises.html?promise=N one promise (1-3, or "all" for bills keeping all three):
                           the bills that keep it, grouped under playlist headings
                           with jump links, each card showing how (D1672);
                           &status= filters it.

   Counts are of the hundred: the three entries with "counts": false are listed and
   explained by AGENDA.notCountedNote() (nav.js), never counted (site review, 2026-10-01).
   A status filter is ?status=full-text|planned|proposed, so a filtered page can be shared.
*/
(function () {
  const params = new URLSearchParams(window.location.search);
  const topicSlug = params.get("topic");
  const showAll = params.get("all") === "1";
  const promiseParam = params.get("promise");
  const shuffleParam = params.get("shuffle") === "1";   // the nav's Shuffle tab (W3937)
  const onPromisesTab = document.body.dataset.page === "promises";
  // The Shuffle tab is its own page (author, 2026-10-01), so it, not Policy Playlists, is the
  // current nav tab. Set before nav.js draws the header on DOMContentLoaded.
  const onShuffleTab = shuffleParam && !onPromisesTab;
  if (onShuffleTab) document.body.dataset.page = "shuffle";

  const esc = (s) => window.escapeHtml(s);
  const md = (s) => window.inlineMd(s);

  function tagsOf(b) { return (b.promises || []).map((t) => t.promise); }
  function keeps(b, n) { return n === "all" ? [1, 2, 3].every((k) => tagsOf(b).includes(k)) : tagsOf(b).includes(n); }
  function billsKeeping(cats, n) { return cats.flatMap((c) => c.bills.filter((b) => keeps(b, n))); }
  function familiesKeeping(cats, n) { return cats.filter((c) => c.bills.some((b) => keeps(b, n))); }
  function plural(k, one, many) { return `${k} ${k === 1 ? one : many}`; }

  function promiseTitle(n) {
    if (n === "all") return window.AGENDA.allThreeTitle();
    const p = window.AGENDA.promises().find((x) => x.n === n);
    return p ? p.title : "";
  }

  const counted = (bills) => bills.filter((b) => window.AGENDA.counted(b));
  // The one sentence on the three non-bills, where any of them is on the page.
  const notCounted = (bills) => (bills.some((b) => !window.AGENDA.counted(b)) ? ` ${window.AGENDA.notCountedNote()}` : "");
  const shownName = (b) => b.display_name || b.name;

  /* A top view has no trail, so it has no breadcrumb landmark, not an empty one. */
  function removeCrumbs() {
    const crumbs = document.getElementById("crumbs");
    if (crumbs) crumbs.remove();
  }
  // The shuffle names the count it draws from: the hundred, never the three non-bills.
  const shuffleLabel = (cats) => `Shuffle the ${counted(cats.flatMap((c) => c.bills)).length} bills`;

  /* The tab's landing view: the three promises and the all-three card, each with how many
     of the hundred keep it and the names of the first three in agenda order, so the view
     shows bills rather than repeating the home page (site review 2.17). The count sits
     under the title (author, 2026-10-01: no "Promise N" line over it). */
  function promiseCards(cats) {
    const keys = [...window.AGENDA.promises().map((p) => p.n), "all"];
    const cards = keys.map((n) => {
      const keep = counted(billsKeeping(cats, n));
      const names = keep.slice(0, 3).map((b) => `<li>${esc(shownName(b))}</li>`).join("");
      const more = keep.length > 3 ? `<li class="promise-card-more">and ${keep.length - 3} more</li>` : "";
      const bills = `<p class="promise-card-count">${plural(keep.length, "bill keeps", "bills keep")} ${n === "all" ? "all three" : "this promise"}</p>` +
        `<ul class="promise-card-bills">${names}${more}</ul>`;
      // The symbol at 72 px (author, 2026-09-30: no symbol image below 72 px); the
      // all-three card takes the wheel and the all-three page's title.
      const art = n === "all" ? window.AGENDA.wheel([1, 2, 3], 72, true) : window.AGENDA.animatedSymbol(n, 72);
      const cls = n === "all" ? "promise-card-all" : `promise-card-${n} pa-trigger`;
      return `<a class="door promise-card ${cls}" href="promises.html?promise=${n}">
          <span class="promise-card-art">${art}</span>
          <div class="promise-card-text">
            <h2${n === "all" ? "" : ` class="promise-text-${n}"`}>${esc(promiseTitle(n))}</h2>
            ${bills}
          </div>
        </a>`;
    }).join("");
    return `<div class="door-grid promise-cards">${cards}</div>`;
  }

  /* The status filter (site review 2.16): chips that hide the cards or rows of other
     statuses through a class, and write the choice into the URL with replaceState so a
     filtered page can be shared. `keeps` adds the every-bill page's promise filter. */
  const STATUS_PARAM = { "full-text": "canonical", planned: "planned", proposed: "proposed" };
  function filterChips(name, label, options, current) {
    return `<div class="filter-chips" role="group" aria-label="${esc(label)}" data-filter="${name}">` +
      `<span class="filter-chips-label">${esc(label)}</span>` +
      options.map(([value, text]) => `<button type="button" class="filter-chip" data-value="${value}" aria-pressed="${value === current}">${esc(text)}</button>`).join("") +
      `</div>`;
  }
  function statusChips() {
    const v = params.get("status");
    return filterChips("status", "Show", [["", "All"], ["full-text", "Full text"], ["planned", "Planned"], ["proposed", "Proposed"]], STATUS_PARAM[v] ? v : "");
  }
  function keepsChips() {
    const v = params.get("keeps");
    const opts = [["", "Any promise"], ...window.AGENDA.promises().map((p) => [String(p.n), window.AGENDA.promiseWord(p.n)]), ["all", "All three"]];
    return filterChips("keeps", "Keeps", opts, opts.some(([k]) => k && k === v) ? v : "");
  }
  // items: the filtered elements, each with data-status and data-keeps; groups: sections
  // hidden when nothing in them shows, with their jump links (a[href="#id"]).
  function bindFilters(root, itemSel, groupSel) {
    const apply = () => {
      const st = STATUS_PARAM[params.get("status")] || "";
      const kp = params.get("keeps") || "";
      root.querySelectorAll(itemSel).forEach((el) => {
        const keepsList = (el.dataset.keeps || "").split(" ").filter(Boolean);
        const okKeeps = !kp || (kp === "all" ? ["1", "2", "3"].every((k) => keepsList.includes(k)) : keepsList.includes(kp));
        el.classList.toggle("filter-hidden", !!(st && el.dataset.status !== st) || !okKeeps);
      });
      root.querySelectorAll(groupSel).forEach((g) => {
        const empty = !g.querySelector(`${itemSel}:not(.filter-hidden)`);
        g.classList.toggle("filter-hidden", empty);
        root.querySelectorAll(`a[href="#${g.id}"]`).forEach((a) => a.classList.toggle("filter-hidden", empty));
      });
      root.querySelectorAll(".filter-chips").forEach((box) => {
        const cur = params.get(box.dataset.filter) || "";
        box.querySelectorAll(".filter-chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === cur)));
      });
    };
    root.addEventListener("click", (e) => {
      const chip = e.target.closest(".filter-chip");
      if (!chip) return;
      const name = chip.closest(".filter-chips").dataset.filter;
      if (chip.dataset.value) params.set(name, chip.dataset.value); else params.delete(name);
      const url = new URL(window.location.href);
      url.search = params.toString();
      try { history.replaceState(null, "", url); } catch (err) { /* file:// in some browsers */ }
      apply();
    });
    apply();
  }
  const filterData = (b) => `data-status="${b.status}" data-keeps="${tagsOf(b).join(" ")}"`;

  /* The playlists as CDs (author, 2026-10-01), four across, two to a row on a tablet and on
     a phone. Each is a navy disc with a hole and a clear hub at the
     center, as a CD has, ringed by the three promise-color arcs of the small Project mark at
     its geometry (scripts/round_wordmarks.py small(): disc radius 481, arcs at 446, 40 wide,
     6 degrees apart, the first starting at -144 degrees). A CD opens its playlist's page.
     Units are the SVG's: the disc is 962 across. The hole and hub follow a 120 mm CD's
     15 mm hole and 33 mm clear ring. */
  // The small marks' ring, placed as the A/F/I wheel: mustard centered at six o'clock, teal
  // upper left, purple upper right, 6 degrees between thirds (author, 2026-10-01).
  const CD_ARCS = [[33, 147], [153, 267], [273, 387]];
  const CD = { hole: 60, hub: 132, ringIn: 426, edge: 10, maxFs: 94, minFs: 40, lead: 1.05, outward: 30, alignFrom: 0.85, wordGap: 40, pad: 1.01, gap: 10 * Math.PI / 180 };

  function annulus(r0, r1) {
    const ring = (r) => `M${-r},0a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
    return ring(r1) + (r0 ? ring(r0) : "");
  }

  /* The name is set on arcs around the hole, as the words are on the Project mark: curving
     over the top above the hole, and under it, upright, below (author, 2026-10-01). Each
     half holds at most two lines. The halves share the circle: either may run past the
     midline, as FAIRNESS, AFFORDABILITY and INTEGRITY do on the mark, so long as 10 degrees
     stay clear between the top and bottom text at the left and at the right. How the
     words divide is cdLayout's. Every CD uses one type size, the largest at which all
     sixteen names fit, up to CD.maxFs: 94 is the largest at which every name but the
     three longest fits in two lines (measured 2026-10-01), and above it medium names are
     forced into four. Widths are measured in Inter once the face has loaded. */
  let measureCtx = null;
  function wordWidth(w) {
    if (measureCtx === null) {
      try { measureCtx = document.createElement("canvas").getContext("2d") || false; } catch (e) { measureCtx = false; }
      if (measureCtx) measureCtx.font = `800 100px ${getComputedStyle(document.body).getPropertyValue("--display") || "sans-serif"}`;
    }
    return (measureCtx ? measureCtx.measureText(w).width : w.length * 60) / 100;   // per unit of font size
  }
  // A line does not end on a word that leads into the next one, if any other break fits.
  const CD_WEAK = new Set(["a", "an", "the", "and", "&", "for", "from", "of", "to", "in", "through", "is", "can", "you"]);

  // The radii of the middles of n lines in one half (dir -1 above the hole, +1 below), in reading
  // order: above, the first line is the outermost; below, the last one is. The capitals are
  // centered CD.outward units outside the middle of the band between the hub and the ring,
  // moved in where that would crowd the ring (author, 2026-10-01: nearer equal space on both
  // sides, "more equal" is enough). A lone line sits midway between where two would. Null
  // if the lines do not fit between the hub and the ring.
  function cdRadii(fs, dir, n) {
    const lh = CD.lead * fs, cap = 0.73 * fs, desc = 0.22 * fs;
    const h = (n === 2 ? lh / 2 : 0) + cap / 2;
    let mid = (CD.hub + CD.ringIn) / 2 + CD.outward;
    mid -= Math.max(0, mid + h + (dir > 0 ? desc : 0) - (CD.ringIn - CD.edge));
    if (mid - h - (dir < 0 ? desc : 0) < CD.hub + CD.edge) return null;
    return n === 1 ? [mid] : dir < 0 ? [mid + lh / 2, mid - lh / 2] : [mid - lh / 2, mid + lh / 2];
  }
  // The angle a line takes: its width over its radius. Letters are centered on their arc
  // (dominant-baseline central), so the spacing is true at mid-height and the distortion of
  // a tall letter on a curve splits between its top and its foot instead of crowding the
  // tops below the hole and spreading them above it (author, 2026-10-01: "fix the arcs so
  // that the words are circular").
  const lineAngle = (line, r, fs) => wordWidth(line) * fs * CD.pad / r;

  // Every way to set one half in the given number of lines, each with the angle it takes
  // (its widest line) and a cost: uneven lines, a line ending on a leading word, and a
  // credit for a line that starts with "&" or follows a comma.
  function halfOptions(words, fs, dir, n) {
    const radii = cdRadii(fs, dir, n);
    if (!radii || words.length < n) return [];
    const endCost = (w) => (CD_WEAK.has(w.toLowerCase()) ? 1 : 0) - (w.endsWith(",") ? 0.3 : 0);
    if (n === 1) return [{ lines: [words.join(" ")], angle: lineAngle(words.join(" "), radii[0], fs), cost: 0 }];
    const out = [];
    for (let b = 1; b < words.length; b++) {
      const lines = [words.slice(0, b).join(" "), words.slice(b).join(" ")];
      const a = lines.map((l, i) => lineAngle(l, radii[i], fs));
      out.push({ lines, angle: Math.max(...a),
        cost: 6 * (1 - Math.min(...a) / Math.max(...a)) ** 2 + endCost(words[b - 1]) - (words[b] === "&" ? 0.5 : 0) });
    }
    return out;
  }

  /* A name is set in two lines, one in each half, or four, two in each (author,
     2026-10-01), four only where two do not fit. The halves split at the playlist's
     cd_break in agenda.json where it has one; otherwise at the word that leaves them
     nearest in length, never after a leading word, and best before an "&". The angles of
     the two halves must leave CD.gap clear on each side. */
  function cdLayout(cat, fs) {
    // A playlist's cd_lines in agenda.json sets its two or four lines by hand.
    if (Array.isArray(cat.cd_lines) && [2, 4].includes(cat.cd_lines.length) && cat.cd_lines.join(" ") === cat.title) {
      const n = cat.cd_lines.length / 2, top = cat.cd_lines.slice(0, n), bottom = cat.cd_lines.slice(n);
      const rt = cdRadii(fs, -1, n), rb = cdRadii(fs, 1, n);
      if (!rt || !rb) return null;
      const angle = (lines, radii) => Math.max(...lines.map((l, i) => lineAngle(l, radii[i], fs)));
      return angle(top, rt) + angle(bottom, rb) <= 2 * Math.PI - 2 * CD.gap ? { top, bottom } : null;
    }
    const words = cat.title.split(/\s+/).filter(Boolean), br = cat.cd_break;
    const hinted = br && cat.title.endsWith(" " + br) ? [words.length - br.split(/\s+/).length] : null;
    const room = 2 * Math.PI - 2 * CD.gap;
    let best = null;
    for (const i of hinted || words.map((_, k) => k).slice(1)) {
      const above = words.slice(0, i), below = words.slice(i);
      const split = hinted ? 0 : Math.abs(above.join(" ").length - below.join(" ").length) / 20 +
        (CD_WEAK.has(above[i - 1].toLowerCase()) ? 3 : 0) - (below[0] === "&" ? 0.5 : 0);
      for (const n of [1, 2]) {
        for (const t of halfOptions(above, fs, -1, n)) for (const b of halfOptions(below, fs, 1, n)) {
          if (t.angle + b.angle > room) continue;
          const cost = split + t.cost + b.cost + (n === 2 ? 1.5 : 0) + 0.5 * Math.abs(t.angle - b.angle) / room;
          if (!best || cost < best.cost) best = { cost, top: t.lines, bottom: b.lines };
        }
      }
    }
    return best;
  }
  function cdFontSize(cats) {
    for (let fs = CD.maxFs; fs > CD.minFs; fs -= 1) if (cats.every((c) => cdLayout(c, fs))) return fs;
    return CD.minFs;
  }

  /* Where a half has two lines of two or more words each, both are spread to the same angle,
     the wider line's, so their left and right ends line up (author, 2026-10-01), provided
     the shorter already takes CD.alignFrom of the wider's angle (95 percent if it is two
     words, whose one gap would take all the added space); spreading further opens holes,
     so a pair further apart is centered as set (author, 2026-10-01: Claude's call on what
     looks best). The added
     length goes mostly between words, each word gap taking CD.wordGap times what each
     letter gap takes. Each word is placed on its own,
     the last anchored to the right end. Other lines are centered. */
  let cdPathId = 0;
  function cdHalf(lines, radii, fs, dir) {
    const words = lines.map((l) => l.split(" "));
    const angle = (l, r) => wordWidth(l) * fs / r;
    const angles = lines.map((l, i) => angle(l, radii[i]));
    // A short line with one gap takes all the added space there, so it needs a closer match.
    const short = angles[0] <= angles[1] ? 0 : 1, ratio = Math.min(...angles) / Math.max(...angles);
    const spread = lines.length === 2 && words.every((w) => w.length > 1) &&
      ratio >= (words[short].length > 2 ? CD.alignFrom : 0.95) ? Math.max(...angles) : 0;
    return lines.map((line, i) => {
      // A whole circle, so a line may run past the midline: above the hole it starts at the
      // bottom and runs clockwise, below it starts at the top and runs counterclockwise, and
      // either way its middle (half its length along) is where the line is centered.
      const r = radii[i], R = r.toFixed(1), id = `cd-arc-${++cdPathId}`, half = Math.PI * r;
      const y0 = dir < 0 ? R : `-${R}`, y1 = dir < 0 ? `-${R}` : R, sweep = dir < 0 ? 1 : 0;
      const path = `<path id="${id}" class="cd-arc" d="M0,${y0}A${R},${R} 0 1 ${sweep} 0,${y1}A${R},${R} 0 1 ${sweep} 0,${y0}"/>`;
      const put = (t, at, anchor, ls) => `<text class="cd-text" font-size="${fs}" text-anchor="${anchor}" dominant-baseline="central"${ls ? ` letter-spacing="${ls.toFixed(2)}"` : ""}>` +
        `<textPath href="#${id}" startOffset="${at.toFixed(1)}">${esc(t)}</textPath></text>`;
      if (!spread) return path + put(line, half, "middle");
      const ws = words[i].map((w) => wordWidth(w) * fs), space = wordWidth(" ") * fs, n = ws.length;
      const letterGaps = words[i].reduce((t, w) => t + w.length - 1, 0);
      const len = spread * r, natural = ws.reduce((t, x) => t + x, 0) + (n - 1) * space;
      const ls = Math.max(0, (len - natural) / (letterGaps + CD.wordGap * (n - 1)));
      let at = half - len / 2;
      return path + words[i].map((w, k) => {
        // The browser adds letter spacing after a word's last letter too, so the right-anchored
        // last word is moved right by one letter gap.
        const out = k === n - 1 ? put(w, half + len / 2 + ls, "end", ls) : put(w, at, "start", ls);
        at += ws[k] + ls * (w.length - 1) + space + CD.wordGap * ls;
        return out;
      }).join("");
    }).join("");
  }
  function cdText(cat, fs) {
    const { top, bottom } = cdLayout(cat, fs) || { top: [cat.title], bottom: [] };
    return cdHalf(top, cdRadii(fs, -1, top.length) || [], fs, -1) + (bottom.length ? cdHalf(bottom, cdRadii(fs, 1, bottom.length), fs, 1) : "");
  }

  function cdArt() {
    const pt = (deg) => [446 * Math.cos(deg * Math.PI / 180), 446 * Math.sin(deg * Math.PI / 180)].map((v) => v.toFixed(1));
    const arcs = CD_ARCS.map(([a, b], i) => {
      const [x0, y0] = pt(a), [x1, y1] = pt(b);
      return `<path class="cd-ring cd-ring-${i + 1}" d="M${x0},${y0} A446,446 0 0 1 ${x1},${y1}"/>`;
    }).join("");
    return `<path class="cd-disc" fill-rule="evenodd" d="${annulus(CD.hub, 481)}"/>` +
      `<path class="cd-hub" fill-rule="evenodd" d="${annulus(CD.hole, CD.hub)}"/>` +
      `<circle class="cd-hub-line" r="${CD.hole + 22}"/>${arcs}`;
  }

  /* A measure that is not a bill is a track on its CD but is counted apart from the bills,
     as everywhere else on the site: "5 bills + 1 amendment". */
  const KIND_NOUN = { "Constitutional amendment": ["amendment", "amendments"], "Senate rule": ["Senate rule", "Senate rules"] };
  function cdShelf(cats) {
    // Under each CD, in HTML, its count of bills and how many have full text (site review
    // 2.22), so the captions add up to the hundred. Each piece keeps together, so a narrow
    // CD breaks the line between them.
    const caption = (c) => {
      const bills = counted(c.bills), others = c.bills.filter((b) => !window.AGENDA.counted(b));
      const kinds = [...new Set(others.map((b) => b.kind || "measure"))].map((k) => {
        const n = others.filter((b) => (b.kind || "measure") === k).length;
        const [one, many] = KIND_NOUN[k] || [k.toLowerCase(), `${k.toLowerCase()}s`];
        return `+ ${plural(n, one, many)}`;
      });
      const full = bills.filter((b) => b.status === "canonical").length;
      const pieces = [plural(bills.length, "bill", "bills"), ...kinds];
      pieces[pieces.length - 1] += " ·";
      // Beside a non-bill, "N bills with full text" says the count is of the bills.
      pieces.push(`${others.length ? plural(full, "bill", "bills") + " " : full + " "}with full text`);
      return pieces.map((t) => `<span>${esc(t)}</span>`).join(" ");
    };
    const cds = cats.map((c) => `<li><a class="cd" href="topic.html?topic=${c.slug}" aria-label="${esc(c.title)}">` +
      `<svg class="cd-art" viewBox="-481 -481 962 962" aria-hidden="true">${cdArt()}<g class="cd-label" data-slug="${c.slug}"></g></svg></a>` +
      `<p class="cd-caption">${caption(c)}</p></li>`).join("");
    return `<ul class="cd-shelf">${cds}</ul>`;
  }
  // The names are set once Inter has loaded, since the line breaks depend on its widths.
  function setCdLabels() {
    const cats = window.AGENDA.categories();
    const fill = () => {
      const fs = cdFontSize(cats);
      document.querySelectorAll(".cd-label").forEach((g) => {
        const cat = cats.find((c) => c.slug === g.dataset.slug);
        if (cat) g.innerHTML = cdText(cat, fs);
      });
    };
    const fonts = document.fonts;
    if (fonts && fonts.load) fonts.load("800 100px Inter").then(() => { measureCtx = null; fill(); }, fill);
    else fill();
  }

  /* Shuffle (the author, 2026-10-01: "own the imagery" of the playlist), without
     replacement (site review): the pool is shuffled once and stepped through; at the end
     it is reshuffled, and the new order never starts on the card just shown. */
  function shuffleBox(label) {
    return `<div class="shuffle">
        <button type="button" class="btn btn-secondary shuffle-button">${window.shuffleIcon(18)}<span>${label}</span></button>
        <div class="shuffle-slot" aria-live="polite"></div>
      </div>`;
  }
  function shuffledOrder(n, notFirst) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (n > 1 && a[0] === notFirst) { const k = 1 + Math.floor(Math.random() * (n - 1)); [a[0], a[k]] = [a[k], a[0]]; }
    return a;
  }
  function player(n) {
    let order = shuffledOrder(n, -1), pos = 0, last = -1;
    return () => {
      if (pos >= order.length) { order = shuffledOrder(n, last); pos = 0; }
      last = order[pos++];
      return last;
    };
  }
  /* The CD index and the Shuffle tab: each press shows one card, under a line naming its
     track and playlist that links to it there. `from` is the tab, for the bill page's nav. */
  function bindShuffle(cats, from) {
    const btn = document.querySelector("#topic-body .shuffle-button");
    const slot = document.querySelector("#topic-body .shuffle-slot");
    // The pool is the hundred bills its label names; a non-bill keeps its track number.
    const pool = cats.flatMap((c) => c.bills.map((b, i) => ({ b, c, track: i + 1 }))).filter(({ b }) => window.AGENDA.counted(b));
    if (!btn || !slot || pool.length === 0) return;
    const next = player(pool.length);
    btn.addEventListener("click", () => {
      const { b, c, track } = pool[next()];
      slot.innerHTML = `<div class="now-playing">Now playing</div>` +
        `<a class="now-playing-track" href="topic.html?topic=${c.slug}#${window.AGENDA.cardId(b)}">Track ${window.trackNum(track)} of ${esc(c.title)} →</a>` +
        `<div class="bill-cards">${window.AGENDA.billCard(b, { level: 2, from })}</div>`;
      if (window.PromiseAnim) window.PromiseAnim.bind(slot);
    });
  }
  /* A playlist's own shuffle shows no second copy of a card already listed (site review
     2.23): it scrolls to the track in the list and highlights it for a moment. The
     highlight is a class; reduced motion gets no smooth scroll and no fade. */
  function bindPlaylistShuffle(cat) {
    const btn = document.querySelector("#topic-body .shuffle-button");
    const slot = document.querySelector("#topic-body .shuffle-slot");
    if (!btn || !slot || cat.bills.length === 0) return;
    const next = player(cat.bills.length);
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer = null;
    btn.addEventListener("click", () => {
      const i = next(), b = cat.bills[i];
      const card = document.getElementById(window.AGENDA.cardId(b));
      if (!card) return;
      document.querySelectorAll("#topic-body .bill-card.is-playing").forEach((el) => el.classList.remove("is-playing"));
      card.classList.add("is-playing");
      card.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      // The slot only announces the track to screen readers; the list shows it.
      slot.classList.add("sr-only");
      slot.textContent = `Now playing track ${window.trackNum(i + 1)}, ${shownName(b)}.`;
      clearTimeout(timer);
      timer = setTimeout(() => card.classList.remove("is-playing"), 2600);
    });
  }

  /* The Policy Playlists tab opens on the playlists as CDs (author, 2026-10-01). */
  function renderIndex(cats, notice) {
    document.title = "Policy Playlists — Project ’27 to ’29";
    removeCrumbs();
    // One line stands alone, no visible heading (author, 2026-10-01); the heading stays for
    // screen readers.
    const h1 = document.getElementById("topic-title");
    h1.textContent = "Policy Playlists";
    h1.classList.add("sr-only");
    const lead = document.getElementById("topic-explainer");
    lead.classList.add("topic-lead");
    // The author's two sentences, and one pointing at the CDs (site review 2.22).
    lead.innerHTML = "Playlists are groups of bills that address a central challenge facing America. " +
      "Each bill takes on one piece of the puzzle. Pick a CD to see its bills.";
    // An unknown ?topic= lands here with a line saying so (site review).
    if (notice) lead.insertAdjacentHTML("beforebegin", `<p class="topic-notice" role="status">${esc(notice)}</p>`);
    const all = cats.flatMap((c) => c.bills);
    // The playlists as CDs, which replaced the list of names (author, 2026-10-01).
    document.getElementById("topic-body").innerHTML = `
      ${cdShelf(cats)}
      <div class="topic-counts">${window.AGENDA.countLine(all)}${notCounted(all)}</div>
      ${shuffleBox(shuffleLabel(cats))}
      ${window.AGENDA.legend()}
      <p class="theme-index-more"><a href="topic.html?all=1">Every bill and the promises it keeps, on one page →</a></p>`;
    setCdLabels();
    bindShuffle(cats, "playlists");
    nextPlaylistButton(cats[0], true);
  }

  /* The nav's Shuffle tab (W3937): the shuffle alone, as it sits on the Policy Playlists tab,
     arriving with a bill playing (author, 2026-10-01). The heading is for screen readers. */
  function renderShuffle(cats) {
    document.title = "Shuffle — Project ’27 to ’29";
    removeCrumbs();
    const h1 = document.getElementById("topic-title");
    h1.textContent = shuffleLabel(cats);
    h1.classList.add("sr-only");
    document.getElementById("topic-explainer").hidden = true;
    document.querySelector(".law-header").classList.add("law-header-bare");
    const body = document.getElementById("topic-body");
    body.classList.add("shuffle-page");
    body.innerHTML = shuffleBox(shuffleLabel(cats)) + window.AGENDA.legend();
    bindShuffle(cats, "shuffle");
    // The tab arrives with a bill playing. That first card is the page, not news, so the
    // slot is not live while it fills (site review 1.38); later presses are announced.
    const slot = document.querySelector("#topic-body .shuffle-slot");
    slot.setAttribute("aria-live", "off");
    document.querySelector("#topic-body .shuffle-button").click();
    setTimeout(() => slot.setAttribute("aria-live", "polite"), 0);
  }

  /* The 100 Bills in 100 Days tab: the 100 bills grouped by the promises they keep
     (author, 2026-10-01), under an opening screen of its mark (home-intro.js). */
  function renderPromisesIndex(cats) {
    document.title = "100 Bills in 100 Days — Project ’27 to ’29";
    removeCrumbs();
    document.getElementById("topic-title").textContent = "100 Bills in 100 Days";
    document.getElementById("topic-explainer").innerHTML =
      `Start from a promise to see how each bill keeps it. ${window.AGENDA.notCountedNote()}`;
    document.getElementById("topic-body").innerHTML = promiseCards(cats);
    if (window.PromiseAnim) window.PromiseAnim.bind(document.getElementById("topic-body"));
  }

  function renderPromise(n, cats) {
    const title = promiseTitle(n);
    document.title = `${title} — Project ’27 to ’29`;
    const h1 = document.getElementById("topic-title");
    h1.textContent = title;
    // The large symbol beside the title; the all-three page takes the full wheel.
    h1.parentNode.classList.add("promise-hero", `promise-hero-${n}`);
    h1.insertAdjacentHTML("beforebegin",
      `<span class="promise-hero-art">${n === "all" ? window.AGENDA.wheel([1, 2, 3], 120, true) : window.AGENDA.symbol(n, 120)}</span>`);
    document.getElementById("crumbs").innerHTML =
      `<a href="promises.html">100 Bills in 100 Days</a> <span>›</span> <span>${n === "all" ? "All three promises" : `Promise ${n}`}</span>`;
    const fams = familiesKeeping(cats, n);
    const bills = billsKeeping(cats, n);
    const k = counted(bills).length;
    document.getElementById("topic-explainer").innerHTML = (n === "all"
      ? `These ${plural(k, "bill keeps", "bills keep")} all three promises. Each card says how.`
      : `${plural(k, "bill", "bills")} in ${plural(fams.length, "playlist", "playlists")} keep this promise. Each card says how.`) + notCounted(bills);
    const jumps = fams.map((c) => `<a href="#fam-${c.slug}">${c.title}</a>`).join("");
    // Cards sit under the group's h2, so their titles are h3.
    const groups = fams.map((c) => {
      const cards = c.bills.filter((b) => keeps(b, n))
        .map((b) => window.AGENDA.billCard(b, n === "all" ? { level: 3, from: "promises" } : { promise: n, level: 3, from: "promises" })).join("");
      return `<section class="promise-group" id="fam-${c.slug}">
          <h2 class="promise-group-title"><a href="topic.html?topic=${c.slug}">${c.title}</a></h2>
          <div class="bill-cards">${cards}</div>
        </section>`;
    }).join("");
    const others = [...window.AGENDA.promises().map((p) => p.n), "all"].filter((x) => x !== n)
      .map((x) => `<a href="promises.html?promise=${x}">${esc(promiseTitle(x))} →</a>`).join("");
    const body = document.getElementById("topic-body");
    body.innerHTML = `
      ${window.AGENDA.legend()}
      ${statusChips()}
      <nav class="family-jumps" aria-label="Playlists">${jumps}</nav>
      ${groups}
      <nav class="prev-next">${others}</nav>`;
    bindFilters(body, ".bill-card", ".promise-group");
    // The grid links into a family's group by hash; the group did not exist when
    // the browser looked for it, so scroll once it does.
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1));
    if (target) target.scrollIntoView();
  }

  /* A "Next Playlist" button above the tab's "Next:" button (author, 2026-10-01): from the
     tab's main view to the first playlist ("Start with Playlist 1", since none is current
     there), from each playlist to the one after it; none after the last. Where it shows,
     the tab's own button below it is styled as secondary (site review 2.x: one primary
     next control). nav.js writes the .next-tab block on DOMContentLoaded, which can run
     after this page renders, so a missing block is retried once the event has finished. */
  function nextPlaylistButton(cat, first) {
    if (!cat) return;
    const place = () => {
      const wrap = document.querySelector(".next-tab");
      if (!wrap) return false;
      wrap.classList.add("next-tab-has-playlist");
      wrap.insertAdjacentHTML("afterbegin", `<a class="btn btn-primary btn-next btn-next-playlist" href="topic.html?topic=${cat.slug}">` +
        `${first ? "Start with Playlist 1" : "Next Playlist"}: ${esc(cat.title)} <span class="btn-arrow" aria-hidden="true">${window.trackIcon("next")}</span></a>`);
      return true;
    };
    if (!place()) setTimeout(place, 0);
  }

  function renderOne(cat, index, cats) {
    document.title = `${cat.title} — Project ’27 to ’29`;
    document.getElementById("topic-title").textContent = cat.title;
    document.getElementById("topic-explainer").innerHTML = md(cat.explainer);
    document.getElementById("crumbs").innerHTML =
      `<a href="topic.html">Policy Playlists</a> <span>›</span> <span>Playlist ${index + 1} of ${cats.length}</span>`;
    const prev = cats[index - 1];
    const next = cats[index + 1];
    // Cards sit directly under the page's h1, so their titles are h2.
    const cards = cat.bills.map((b, i) => window.AGENDA.billCard(b, { track: i + 1, level: 2, from: "playlists" })).join("");
    // The way forward is the Next Playlist button below; the text link keeps only the way back.
    document.getElementById("topic-body").innerHTML = `
      <div class="topic-counts">${window.AGENDA.countLine(cat.bills)}${notCounted(cat.bills)}</div>
      ${window.AGENDA.legend()}
      ${shuffleBox("Shuffle this playlist")}
      <div class="bill-cards">${cards}</div>
      <nav class="prev-next">
        ${prev ? `<a href="topic.html?topic=${prev.slug}">${window.trackIcon("prev")} ${prev.title}</a>` : `<a href="topic.html">${window.trackIcon("prev")} Policy Playlists</a>`}
      </nav>`;
    bindPlaylistShuffle(cat);
    nextPlaylistButton(next);
  }

  /* Every bill on one page: a jump row to each playlist, the status and promise filters,
     and per row the site label with the statutory name as its tooltip, as on the cards. */
  function renderAll(cats) {
    const title = "Every bill and the promises it keeps";
    document.title = `${title} — Project ’27 to ’29`;
    document.getElementById("crumbs").innerHTML =
      `<a href="topic.html">Policy Playlists</a> <span>›</span> <span>${title}</span>`;
    document.getElementById("topic-title").textContent = title;
    document.getElementById("topic-explainer").innerHTML =
      `All ${cats.length} policy playlists on one page. A bill with full text opens to it. A planned or proposed bill shows what it would do.`;
    const all = cats.flatMap((c) => c.bills);
    const jumps = cats.map((c) => `<a href="#${c.slug}">${c.title}</a>`).join("");
    const html = [`<div class="topic-counts">${window.AGENDA.countLine(all)}${notCounted(all)}</div>`,
      window.AGENDA.legend(), statusChips(), keepsChips(),
      `<nav class="family-jumps" aria-label="Playlists">${jumps}</nav>`];
    cats.forEach((c, i) => {
      html.push(`<section class="topic-block" id="${c.slug}">
        <h2 class="topic-block-title"><span class="topic-num">${String(i + 1).padStart(2, "0")}</span> <a href="topic.html?topic=${c.slug}">${c.title}</a></h2>
        <p class="topic-block-explainer">${md(c.explainer)}</p>
        <ul class="one-line-list">
          ${c.bills.map((b) => {
            const alt = b.display_name ? ` title="${esc(b.name)}"` : "";
            const name = `<strong${alt}>${esc(shownName(b))}</strong>`;
            const kind = !window.AGENDA.counted(b) && b.kind ? ` <span class="pill-kind" title="Not counted among the 100">${esc(b.kind)}</span>` : "";
            return `<li ${filterData(b)}>
            <span class="row-mark">${tagsOf(b).length ? window.AGENDA.wheel(tagsOf(b), 28) : ""}</span>
            <span class="pill-status pill-${b.status}">${window.AGENDA.statusLabel(b.status)}</span>
            <span class="row-name">${b.slug ? `<a href="law.html?bill=${b.slug}&from=playlists">${name}</a>` : name}${kind}</span>
            <div class="one-line">${window.AGENDA.promiseHows(b)}</div>
          </li>`;
          }).join("")}
        </ul>
      </section>`);
    });
    const body = document.getElementById("topic-body");
    body.innerHTML = html.join("\n");
    bindFilters(body, ".one-line-list > li", ".topic-block");
  }

  window.siteReady(() => {
    const cats = window.AGENDA.categories();
    const promiseN = promiseParam === "all" ? "all" : Number(promiseParam);
    const validPromise = promiseParam && (promiseN === "all" || window.AGENDA.promises().some((p) => p.n === promiseN));
    if (onPromisesTab) return validPromise ? renderPromise(promiseN, cats) : renderPromisesIndex(cats);
    // A promise's page moved to the 100 Bills in 100 Days tab; forward old links.
    if (validPromise) return window.location.replace(`promises.html?promise=${promiseParam}`);
    if (topicSlug) {
      const i = cats.findIndex((c) => c.slug === topicSlug);
      if (i >= 0) return renderOne(cats[i], i, cats);
    }
    if (showAll) return renderAll(cats);
    if (onShuffleTab) return renderShuffle(cats);
    renderIndex(cats, topicSlug ? "No playlist by that name." : "");
  });
})();
