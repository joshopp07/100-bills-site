/* The password gate.

   There is no server behind this site, so a password screen alone would
   protect nothing: anyone could read the data file. Instead the build
   encrypts data/site-data.js (every bill, the agenda, the explainer, the
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
    if (ready) fn();
    else callbacks.push(fn);
  };

  function fire() {
    ready = true;
    document.body.classList.remove("locked");
    const overlay = document.getElementById("gate");
    if (overlay) overlay.remove();
    while (callbacks.length) callbacks.shift()();
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
    el.innerHTML = `
      <form class="gate-card" id="gate-form" autocomplete="off">
        <div class="gate-title">Project 2027-2029</div>
        <div class="gate-subtitle">100 Bills in 100 Days</div>
        <p class="gate-line">This site is not yet public. Enter the password to continue.</p>
        <label class="gate-label" for="gate-password">Password</label>
        <input class="gate-input" id="gate-password" type="password" autocomplete="current-password" autofocus>
        <label class="gate-remember"><input type="checkbox" id="gate-remember"> Remember this device</label>
        <button class="btn btn-primary gate-btn" type="submit">Enter</button>
        <p class="gate-error" id="gate-error" role="alert" hidden>That password did not work.</p>
      </form>`;
    document.body.appendChild(el);
    const form = document.getElementById("gate-form");
    const input = document.getElementById("gate-password");
    const error = document.getElementById("gate-error");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      error.hidden = true;
      const payload = window.SITE_DATA_ENC;
      try {
        const raw = await deriveKey(input.value, b64ToBytes(payload.salt), payload.iter);
        const data = await decryptWith(raw, payload);
        window.SITE_DATA = data;
        storeKey(bytesToB64(raw), document.getElementById("gate-remember").checked);
        fire();
      } catch (err) {
        error.hidden = false;
        input.select();
      }
    });
    setTimeout(() => input.focus(), 0);
  }

  async function start() {
    if (window.SITE_DATA) return fire();               // plain build (local preview with --plain)
    const payload = window.SITE_DATA_ENC;
    if (!payload) return fire();                        // nothing to unlock
    const saved = storedKey();
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
