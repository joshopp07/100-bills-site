/* The About page. Split out of about.html 2026-09-11 so the site can carry a
   Content-Security-Policy of script-src 'self': a policy that permits inline
   script is a policy an injected <script> also satisfies, and this was the only
   inline block on the site. Behavior is unchanged. */
const INAUGURATION = new Date(2029, 0, 20);

function daysUntilInauguration() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((INAUGURATION - today) / 86400000);
}

function fillCountdown(html) {
  const days = daysUntilInauguration();
  const replacement = days > 0
    ? `<span class="countdown" title="Days remaining before January 20, 2029"><span class="countdown-num">${days.toLocaleString()}</span> days</span>`
    : `<span class="countdown">days</span>`;
  return html.split("{{COUNTDOWN}}").join(replacement);
}

window.siteReady(() => {
  const about = (window.SITE_DATA || {}).about;
  if (!about) return;
  document.getElementById("about-title").textContent = about.title;
  document.title = about.title;
  document.getElementById("about-content").innerHTML =
    fillCountdown(window.renderMarkdownBlock(about.markdown));
});
