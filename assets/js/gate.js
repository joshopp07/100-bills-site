/* The password gate.

   There is no server behind this site, so a password screen alone would
   protect nothing: anyone could read the data file. Instead the build
   encrypts data/site-data.js (every bill, the agenda, the site pages, the
   search index) with a key derived from the password, and this script
   decrypts it in the browser. Without the password the pages are empty
   shells. The password never appears in the repository; the build reads it
   from a file outside it.

   Pages call window.siteReady(fn). fn runs once window.SITE_DATA holds the
   agenda: immediately in a plain build (the local preview, or the public site
   published with publish.sh --plain), after unlock in an encrypted one. A
   page that shows more than the core file holds first names the parts it needs
   with window.siteNeeds; each is one more encrypted script in data/parts/, and
   fn waits for them. If the payload or a named part is missing, unreadable,
   or has no agenda, fn never runs and the page shows its load error. The
   derived key is kept for the tab in sessionStorage, or on the device in
   localStorage when the visitor asks to be remembered. */

(function () {
  const callbacks = [];
  let ready = false;
  let unusable = false;
  let partFailed = false;
  const needed = [];

  window.siteNeeds = function (...parts) { needed.push(...parts); };

  window.siteReady = function (fn) {
    if (unusable) return;
    if (ready) run(fn);
    else callbacks.push(fn);
  };

  /* A page that cannot draw itself says so in one line rather than stay on "Loading…":
     when the payload never arrived, or when a page script throws. The error still
     reaches the console. A heading still empty or reading "Loading…" is replaced too;
     one the page already drew stays. */
  const LOAD_ERROR = "This page could not load. Reload, or try again later.";
  const LOAD_ERROR_HEADING = "Page unavailable";
  function showLoadError() {
    const main = document.getElementById("main");
    if (!main || document.getElementById("load-error")) return;
    main.insertAdjacentHTML("afterbegin", `<div class="wrap"><p class="load-error" id="load-error" role="alert">${LOAD_ERROR}</p></div>`);
    const heading = main.querySelector("h1");
    if (heading && ["", "Loading…"].includes(heading.textContent.trim())) heading.textContent = LOAD_ERROR_HEADING;
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
    if (!(window.SITE_DATA || {}).agenda || partFailed) {
      unusable = true;
      callbacks.length = 0;
      showLoadError();
    }
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

  /* The build gzips each payload before encrypting it (W4203); "z" marks it. The write is
     not awaited before reading, since a stream's backpressure would otherwise stall it. */
  async function gunzip(bytes) {
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(bytes).catch(() => {});
    writer.close().catch(() => {});
    const reader = ds.readable.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  }

  async function decryptWith(rawKey, payload) {
    const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
    let plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.ct));
    if (payload.z === "gzip") plain = await gunzip(new Uint8Array(plain));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  /* A <script>, for the reason site-data.js is one: a page opened from disk cannot fetch(). */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error(`could not load ${src}`));
      document.head.appendChild(el);
    });
  }

  /* A Sources part (W9633) holds one entry's list, keyed by its page address; the list
     goes back on that agenda entry, where the page reads it. */
  function putSources(byPage) {
    for (const c of ((window.SITE_DATA.agenda || {}).categories || [])) {
      for (const b of c.bills) {
        if (Object.prototype.hasOwnProperty.call(byPage, b.page)) b.sources = byPage[b.page];
      }
    }
  }

  async function loadPart(entry, rawKey) {
    await loadScript(`data/parts/${entry.f}.js?v=${entry.v}`);
    const stored = (window.SITE_PARTS || {})[entry.f];
    if (!stored) throw new Error(`part ${entry.f} is empty`);
    const part = stored.plain || await decryptWith(rawKey, stored);
    for (const [name, value] of Object.entries(part)) {
      if (name === "bills") Object.assign(window.SITE_DATA.bills, value);
      else if (name === "sources") putSources(value);
      else window.SITE_DATA[name] = value;
    }
  }

  /* A name the payload does not list is skipped: a bill page's address is untrusted, and
     a bill with no text has no part. The page then draws what it would for that address. */
  async function finish(rawKey) {
    const parts = (window.SITE_DATA || {}).parts || {};
    const entries = needed.filter((name) => Object.prototype.hasOwnProperty.call(parts, name)).map((name) => parts[name]);
    try {
      await Promise.all(entries.map((entry) => loadPart(entry, rawKey)));
    } catch (err) {
      partFailed = true;
      console.error(err);
    }
    fire();
  }

  const canDecrypt = () => !!(window.crypto && window.crypto.subtle);
  const canUnpack = () => typeof window.DecompressionStream === "function";

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
    /* A browser without DecompressionStream (Safari before 16.4) cannot read the payload,
       and every password would fail; the screen says so instead. */
    if (!canUnpack()) {
      el.querySelector(".gate-line").textContent = "This browser is too old to open the site. Update it, or use a current browser.";
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
        await finish(raw);
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
    // A plain build: the local preview, or the public site published with publish.sh
    // --plain (W7426). A key a visitor saved while the site had a password unlocks
    // nothing now, so it is removed from the device.
    if (window.SITE_DATA) { forgetKey(); return finish(null); }
    const payload = window.SITE_DATA_ENC;
    if (!payload) return fire();                        // nothing to unlock
    const saved = canDecrypt() ? storedKey() : null;   // a saved key is kept for a secure visit
    if (saved) {
      try {
        const raw = b64ToBytes(saved);
        window.SITE_DATA = await decryptWith(raw, payload);
        return await finish(raw);
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
