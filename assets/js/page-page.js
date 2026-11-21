/* The short site pages (D1580): "Why Project ’27 to ’29?" and the pages under
   "How These Bills Were Written." One template, page.html?p=<slug>; the text
   comes from outputs/site-pages/<slug>.md through the encrypted payload, so it
   stays behind the password like everything else. */
(function () {
  // What Is This Project? is the front door (index.html) since 2026-11-13, which names its
  // page in data-slug; its old address forwards there.
  const query = new URLSearchParams(window.location.search).get("p");
  if (query === "about" && document.body.dataset.page === "page") { window.location.replace("index.html"); return; }
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

  // The calendar part (W10251) is loaded only on the page that draws it.
  if ((query || document.body.dataset.slug) === "possible") window.siteNeeds("calendar");

  /* {{CALENDAR}} on a line of its own becomes the calendar's container; calendar.js
     draws into it. Without the part, the placeholder is dropped rather than shown. */
  function placeCalendar(html) {
    const box = (window.SITE_DATA || {}).calendar && window.renderCalendar ? '<div class="cal" id="calendar-2029"></div>' : "";
    return html.split("<p>{{CALENDAR}}</p>").join(box).split("{{CALENDAR}}").join("");
  }

  window.siteReady(() => {
    const slug = query || document.body.dataset.slug || "";
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
    if (!document.body.dataset.slug) document.title = `${page.title} — Project ’27 to ’29`;
    // No draft banner (the author, 2026-10-01: "delete that line everywhere").
    content.innerHTML = placeCalendar(fillCountdown(window.renderMarkdownBlock(page.markdown)));
    const cal = document.getElementById("calendar-2029");
    if (cal) window.renderCalendar(cal, window.SITE_DATA.calendar);
  });
})();
