/* The short site pages (D1580): "Why Project ’27 to ’29?" and the pages under
   "How These Bills Were Written." One template, page.html?p=<slug>; the text
   comes from outputs/site-pages/<slug>.md through the encrypted payload, so it
   stays behind the password like everything else. */
(function () {
  const INAUGURATION = new Date(2029, 0, 20);

  function fillCountdown(html) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((INAUGURATION - today) / 86400000);
    const replacement = days > 0
      ? `<span class="countdown" title="Days remaining before January 20, 2029"><span class="countdown-num">${days.toLocaleString()}</span> days</span>`
      : `<span class="countdown">days</span>`;
    return html.split("{{COUNTDOWN}}").join(replacement);
  }

  window.siteReady(() => {
    const slug = new URLSearchParams(window.location.search).get("p") || "";
    const pages = (window.SITE_DATA || {}).pages || {};
    const page = Object.prototype.hasOwnProperty.call(pages, slug) ? pages[slug] : null;
    const title = document.getElementById("page-title");
    const content = document.getElementById("page-content");
    if (!page || slug === "home") {
      title.textContent = "Page not found";
      content.innerHTML = `<p>There is no page by that name. <a href="index.html">Return home</a>.</p>`;
      return;
    }
    title.textContent = page.title;
    document.title = `${page.title} — Project ’27 to ’29`;
    // No draft banner (the author, 2026-10-01: "delete that line everywhere").
    content.innerHTML = fillCountdown(window.renderMarkdownBlock(page.markdown));
  });
})();
