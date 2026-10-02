/* The password gate.

   There is no server behind this site, so a password screen alone would
   protect nothing: anyone could read the data file. Instead the build
   encrypts data/site-data.js (every bill, the agenda, the site pages, the
   search index) with a key derived from the password, and this script
   decrypts it in the browser. Without the password the pages are empty
   shells. The password never appears in the repository; the build reads it
   from a file outside it.

   Pages call window.siteReady(fn). fn runs once window.SITE_DATA exists:
   immediately in a plain build, after unlock in an encrypted one. The
   derived key is kept for the tab in sessionStorage, or on the device in
   localStorage when the visitor asks to be remembered. */

(function () {
  const callbacks = [];
  let ready = false;

  window.siteReady = function (fn) {
    if (ready) run(fn);
    else callbacks.push(fn);
  };

  /* A page that cannot draw itself says so in one line rather than stay on "Loading…":
     when the payload never arrived, or when a page script throws. The error still
     reaches the console. */
  const LOAD_ERROR = "This page could not load. Reload, or try again later.";
  function showLoadError() {
    const main = document.getElementById("main");
    if (!main || document.getElementById("load-error")) return;
    main.insertAdjacentHTML("afterbegin", `<div class="wrap"><p class="load-error" id="load-error" role="alert">${LOAD_ERROR}</p></div>`);
  }
  function run(fn) {
    try {
      fn();
    } catch (err) {
      showLoadError();
      if (window.reportError) window.reportError(err);
      else setTimeout(() => { throw err; }, 0);
    }
  }

  /* While the password screen shows, everything behind it is inert: no keyboard focus,
     no clicks, out of the accessibility tree (site review 1.18). Elements added to the
     body later (nav.js swaps in the header and footer) are made inert as they arrive. */
  let observer = null;
  function lockPage(gate) {
    const lock = (el) => {
      if (el === gate || el.nodeType !== 1 || el.hasAttribute("inert")) return;
      el.setAttribute("inert", "");
      el.setAttribute("data-gate-inert", "");
    };
    [...document.body.children].forEach(lock);
    if (window.MutationObserver) {
      observer = new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(lock)));
      observer.observe(document.body, { childList: true });
    }
  }
  function unlockPage() {
    if (observer) { observer.disconnect(); observer = null; }
    document.querySelectorAll("[data-gate-inert]").forEach((el) => { el.removeAttribute("inert"); el.removeAttribute("data-gate-inert"); });
  }

  function fire() {
    ready = true;
    document.body.classList.remove("locked");
    const overlay = document.getElementById("gate");
    if (overlay) overlay.remove();
    unlockPage();
    if (!window.SITE_DATA) showLoadError();
    while (callbacks.length) run(callbacks.shift());
    // After the password screen, focus goes to the page's heading, not back to the body.
    if (overlay) focusHeading();
  }
  function focusHeading() {
    const main = document.getElementById("main");
    const target = (main && main.querySelector("h1")) || main;
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }

  async function deriveKey(password, salt, iterations) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, 256);
    return new Uint8Array(bits);
  }

  async function decryptWith(rawKey, payload) {
    const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  const canDecrypt = () => !!(window.crypto && window.crypto.subtle);

  function storedKey() {
    try {
      return sessionStorage.getItem("siteKey") || localStorage.getItem("siteKey");
    } catch (e) { return null; }
  }
  function storeKey(b64, remember) {
    try {
      sessionStorage.setItem("siteKey", b64);
      if (remember) localStorage.setItem("siteKey", b64);
    } catch (e) { /* storage unavailable: the unlock lasts for this page only */ }
  }
  function forgetKey() {
    try { sessionStorage.removeItem("siteKey"); localStorage.removeItem("siteKey"); } catch (e) {}
  }

  function renderOverlay() {
    document.body.classList.add("locked");
    const el = document.createElement("div");
    el.id = "gate";
    el.className = "gate";
    // The page's own <main> is inert behind this one while it shows (site review 1.38).
    el.innerHTML = `
      <main class="gate-main">
      <form class="gate-card" id="gate-form" autocomplete="off">
        <img class="gate-mark" src="assets/img/mark-project2729-words-200.png" srcset="assets/img/mark-project2729-words-400.png 2x" width="200" height="200" alt="">
        <h1 class="gate-title">Project ’27 to ’29</h1>
        <div class="gate-subtitle">100 Bills in 100 Days</div>
        <p class="gate-line">This site is not yet public. Enter the password to continue.</p>
        <label class="gate-label" for="gate-password">Password</label>
        <input class="gate-input" id="gate-password" type="password" autocomplete="current-password" autofocus>
        <label class="gate-remember"><input type="checkbox" id="gate-remember"> Remember this device</label>
        <button class="btn btn-primary gate-btn" id="gate-btn" type="submit">Enter</button>
        <p class="gate-error" id="gate-error" role="alert" hidden>That password did not work.</p>
      </form>
      </main>`;
    document.body.appendChild(el);
    lockPage(el);
    const form = document.getElementById("gate-form");
    const input = document.getElementById("gate-password");
    const error = document.getElementById("gate-error");
    const button = document.getElementById("gate-btn");
    /* A browser offers Web Crypto only in a secure context. Over plain http every
       password would fail, so the screen says what is wrong instead of asking for one. */
    if (!canDecrypt()) {
      el.querySelector(".gate-line").textContent = "This browser can open the site only over a secure connection. Use the site’s https:// address.";
      input.disabled = true;
      button.disabled = true;
      document.getElementById("gate-remember").disabled = true;
      return;
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (button.disabled) return;
      error.hidden = true;
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
      // Deriving the key takes a moment; the button says so and cannot be pressed twice.
      button.disabled = true;
      button.textContent = "Unlocking…";
      const payload = window.SITE_DATA_ENC;
      try {
        const raw = await deriveKey(input.value, b64ToBytes(payload.salt), payload.iter);
        const data = await decryptWith(raw, payload);
        window.SITE_DATA = data;
        storeKey(bytesToB64(raw), document.getElementById("gate-remember").checked);
        fire();
      } catch (err) {
        button.disabled = false;
        button.textContent = "Enter";
        error.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", "gate-error");
        input.select();
      }
    });
    setTimeout(() => input.focus(), 0);
  }

  async function start() {
    if (window.SITE_DATA) return fire();               // plain build (local preview with --plain)
    const payload = window.SITE_DATA_ENC;
    if (!payload) return fire();                        // nothing to unlock
    const saved = canDecrypt() ? storedKey() : null;   // a saved key is kept for a secure visit
    if (saved) {
      try {
        window.SITE_DATA = await decryptWith(b64ToBytes(saved), payload);
        return fire();
      } catch (err) {
        forgetKey();                                    // the password changed since this key was saved
      }
    }
    renderOverlay();
  }

  window.siteLock = function () { forgetKey(); window.location.reload(); };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
