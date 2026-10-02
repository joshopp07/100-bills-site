/* A page's opening screen (author, 2026-10-01): the 3 Promises page opens on the Project
   mark, the 100 Bills in 100 Days tab on its own mark. The section's data-target names the
   title it glides to; with data-landing-only it shows only when the URL has no query.
   Only the mark shows at first, and the page has two resting places above the title, never one in between:
   the whole mark, or the title just under the header with the mark fully off screen.
   Down from the mark glides to the title; up from the title glides back to the mark.
   Any other way of stopping partway (a scrollbar drag, a fling on a phone, a restored
   scroll position) is finished when the scroll settles, in the direction it was going.
   Trackpad momentum after a glide is absorbed so it cannot carry past the title.
   Under reduced motion each glide is a jump. */
(function () {
  const intro = document.getElementById("home-intro");
  if (!intro) return;
  if ("landingOnly" in intro.dataset && window.location.search) { intro.remove(); return; }
  const targetSel = intro.dataset.target || ".hero-trade";
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  // The intro fills the screen under the sticky header; nav.js keeps its height in --header-h.
  function headerHeight() {
    const h = document.querySelector(".site-header");
    return h ? h.offsetHeight : 0;
  }

  // The lower resting place: the title 16 px under the header.
  function titleY() {
    const t = document.querySelector(targetSel) || document.getElementById("home-vision");
    return t ? Math.max(0, Math.round(t.getBoundingClientRect().top + window.scrollY - headerHeight() - 16)) : 0;
  }
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const between = () => window.scrollY > 1 && window.scrollY < titleY() - 1;

  // A glide holds every input until it arrives and the wheel has been quiet for 200 ms.
  let busy = false, quietTimer = null, arrived = true, lastY = window.scrollY;
  function release() {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => { if (arrived) busy = false; else release(); }, 200);
  }
  function glide(dest) {
    busy = true; arrived = false;
    window.scrollTo({ top: dest, behavior: still ? "auto" : "smooth" });
    const t0 = performance.now();
    (function wait() {
      if (Math.abs(window.scrollY - dest) < 2 || performance.now() - t0 > 1500) {
        window.scrollTo({ top: dest, behavior: "auto" });
        arrived = true; lastY = dest; release();
      } else requestAnimationFrame(wait);
    })();
  }
  const down = () => glide(titleY());
  const up = () => glide(0);

  intro.addEventListener("click", (e) => {
    if (!e.target.closest("a")) return;
    e.preventDefault();
    down();
  });

  window.addEventListener("wheel", (e) => {
    if (busy) { e.preventDefault(); release(); return; }
    const y = window.scrollY, t = titleY();
    if (e.deltaY > 0 && y < t - 1) { e.preventDefault(); down(); }
    else if (e.deltaY < 0 && y > 1 && y + e.deltaY < t - 1) { e.preventDefault(); up(); }
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    // Keys belong to the control that has focus: Space on a button or link presses it, and
    // the header's menus take the arrows (site review 1.16). The glide answers keys pressed
    // on the page itself.
    if (e.target.closest && e.target.closest("input, textarea, select, button, a, summary, [role], [contenteditable], .site-header")) return;
    const y = window.scrollY, t = titleY();
    const isDown = ["ArrowDown", "PageDown", " "].includes(e.key) && !e.shiftKey;
    const isUp = ["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey);
    if (busy && (isDown || isUp)) { e.preventDefault(); return; }
    if (isDown && y < t - 1) { e.preventDefault(); down(); }
    else if (isUp && y > 1 && y <= t + 120) { e.preventDefault(); up(); }
  });

  let touchY = null;
  window.addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (touchY === null) return;
    if (busy) { e.preventDefault(); return; }
    const dy = touchY - e.touches[0].clientY, y = window.scrollY, t = titleY();
    if (dy > 12 && y < t - 1) { e.preventDefault(); touchY = null; down(); }
    else if (dy < -12 && y > 1 && y <= t + 1) { e.preventDefault(); touchY = null; up(); }
  }, { passive: false });

  /* Back returns to where the reader was (site review 1.17). The browser's own restoration
     is off (above), and the page draws its content only after the gate opens, so the
     position is saved on leaving and put back once the page has rendered, on a return
     through the history only. Storage may be unavailable; the page then opens at the top. */
  const KEY = "scroll:" + window.location.pathname.split("/").pop() + window.location.search;
  window.addEventListener("pagehide", () => {
    try { sessionStorage.setItem(KEY, String(Math.round(window.scrollY))); } catch (e) { /* storage unavailable */ }
  });
  function returning() {
    const nav = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
    return nav ? nav.type === "back_forward" : !!(performance.navigation && performance.navigation.type === 2);
  }
  if (returning() && window.siteReady) {
    let saved = null;
    try { saved = sessionStorage.getItem(KEY); } catch (e) { /* storage unavailable */ }
    const y = Number(saved);
    if (saved !== null && y > 0) {
      window.siteReady(() => requestAnimationFrame(() => {
        lastY = y;
        window.scrollTo({ top: y, behavior: "instant" });
        // The web font can change the page's height after the first paint; settle again.
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
          if (Math.abs(window.scrollY - y) > 2 && !busy) { lastY = y; window.scrollTo({ top: y, behavior: "instant" }); }
        });
      }));
    }
  }

  // The catch-all: wherever a scroll comes to rest between the two places, finish it.
  let settleTimer = null;
  window.addEventListener("scroll", () => {
    if (busy) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (busy) return;
      if (between()) (window.scrollY >= lastY ? down : up)();
      else lastY = window.scrollY;
    }, 140);
  }, { passive: true });
})();
