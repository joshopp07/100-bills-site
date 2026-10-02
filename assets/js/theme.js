/* The light/dark theme (site review 3.8, 2026-10-01). Loaded synchronously in every
   page's <head>, before the stylesheet paints, so a visitor's chosen theme shows on the
   first frame. Until a visitor chooses, the site follows the system setting through the
   stylesheet's prefers-color-scheme rules and <html> carries no data-theme; once they
   choose, data-theme="light" or "dark" overrides it and the choice is remembered on the
   device. Storage may be unavailable (a private window, blocked site data): the switch
   then lasts for the page only.

   Images with a dark-theme file are a <picture> whose dark <source> carries
   data-theme-dark; its media attribute is rewritten here so the picture follows the
   theme in force, not only the system setting. The header's switch is drawn by nav.js. */
(function () {
  var root = document.documentElement;
  var KEY = "theme";
  var PAPER = { light: "#fbfaf7", dark: "#16181c" };   // style.css --paper in each theme
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage unavailable */ }
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;

  function chosen() {
    var t = root.dataset.theme;
    return t === "light" || t === "dark" ? t : "";
  }
  function current() {
    return chosen() || (mq && mq.matches ? "dark" : "light");
  }
  // The media query a dark <source> needs for the theme in force.
  function darkMedia() {
    var t = chosen();
    return t === "dark" ? "all" : t === "light" ? "not all" : "(prefers-color-scheme: dark)";
  }
  function sync() {
    var media = darkMedia();
    var sources = document.querySelectorAll("source[data-theme-dark]");
    for (var i = 0; i < sources.length; i++) {
      if (sources[i].getAttribute("media") !== media) sources[i].setAttribute("media", media);
    }
    // The browser bar's color: both theme-color metas carry the chosen theme's paper, or
    // their own media-matched colors when no theme is chosen.
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var j = 0; j < metas.length; j++) {
      var m = metas[j];
      if (!m.dataset.content) m.dataset.content = m.getAttribute("content");
      m.setAttribute("content", chosen() ? PAPER[chosen()] : m.dataset.content);
    }
    document.dispatchEvent(new CustomEvent("site-themechange", { detail: { theme: current() } }));
  }
  function set(theme) {
    if (theme !== "light" && theme !== "dark") return;
    root.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch (e) { /* the choice lasts for this page */ }
    sync();
  }

  window.siteTheme = {
    current: current,
    darkMedia: darkMedia,
    set: set,
    toggle: function () { set(current() === "dark" ? "light" : "dark"); },
    sync: sync,
  };

  // A system change matters only while the visitor has not chosen.
  if (mq) {
    var onChange = function () { if (!chosen()) sync(); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  // A choice made in another tab carries over.
  window.addEventListener("storage", function (e) {
    if (e.key === KEY && (e.newValue === "light" || e.newValue === "dark")) { root.dataset.theme = e.newValue; sync(); }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
  else sync();
})();
