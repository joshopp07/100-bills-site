/* The Integrity symbol sews its pocket shut (D1853; author, 2026-09-30). The layers are cut by
   scripts/promise_anim_layers.py; this file moves them, because a thread tied to a moving needle
   and a needle half under the fabric are beyond CSS keyframes.

   The stitch is a whipstitch across the pocket opening, and each step follows from the thread
   being one piece:
     - the seam starts from the back, so the needle's point first comes up through the bottom
       of stitch 1;
     - the needle goes in at the top of one stitch, runs under the fabric, and its point comes
       out at the bottom of the next, so the part between the two holes is hidden;
     - the thread follows the eye, so it goes under when the eye does and comes out after it;
     - a stitch is the thread drawn from one exit hole to the next entry, so it is complete when
       the eye enters that entry;
     - the last stitch is the thread lying from the last exit up to the raised needle, which is
       the still symbol, so the loop ends where it began.
   Depth (author, 2026-09-30: the needle goes in and out of the jacket, not up and down): the
   needle is tilted out of the cloth by an angle phi. Tilted, it looks shorter (its length times
   cos phi), and it casts a shadow that meets it where it pierces the cloth and falls away with
   height. It dives in steep, is carried flatter between stitches, and lies flat at rest.
   Runs on hover or keyboard focus; where there is no hover it loops while on screen; never under
   reduced motion. Geometry is in pixels of the 962 px disc crop, printed by the layer script. */
(function () {
  const G = {"eye": [793.3, 210.1], "tip": [566, 483], "stitches": [{"b": [427.6, 687.3], "t": [470.4, 567.7], "w": 27.0}, {"b": [505.5, 680.3], "t": [548.5, 559.7], "w": 27.0}, {"b": [591.6, 673.3], "t": [635.4, 553.7], "w": 27.1}, {"b": [670.9, 666.4], "t": [714.1, 553.6], "w": 27.1}, {"b": [754.2, 658.9], "t": [787.8, 554.1], "w": 27.6}], "thread_w": 16.2, "butt": -67.4, "rest_thread": [[790.1, 533], [793.5, 521], [790.0, 509], [787.0, 497], [785.0, 485], [784.5, 473], [786.0, 461], [789.5, 449], [795.0, 437], [802.5, 425], [811.5, 413], [820.5, 401], [828.5, 389], [834.5, 377], [840.0, 365], [843.0, 353], [845.5, 341], [846.5, 329], [847.0, 317], [846.5, 305], [844.5, 293], [842.0, 281], [838.0, 269], [833.0, 257], [828.0, 245], [823.5, 233], [817, 231], [793.3, 210.1]], "tail": [[793.3, 210.1], [817, 231], [821, 233.5], [829, 235.5], [837, 237.5], [845, 241.4], [853, 243.0], [861, 245.0]]};
  const BOX = 962;
  const NS = "http://www.w3.org/2000/svg";
  const DEG = Math.PI / 180;
  const PHI_IN = 52 * DEG;      // steep into and out of the cloth
  const PHI_MID = 22 * DEG;     // carried flatter between stitches
  const SHADOW = 0.5;           // shadow offset per unit of height
  const SHADOW_DIR = [0.55, 0.835];   // light from the upper left
  const HOVER = 25, PULL = 25;  // point above the hole before a stitch; eye past the exit after

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const len = (a) => Math.hypot(a[0], a[1]);
  const unit = (a) => mul(a, 1 / len(a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const pct = (v) => (v / BOX * 100).toFixed(3) + "%";
  const dir = (a) => [Math.cos(a), Math.sin(a)];

  // The needle in its own frame: point T0, eye E0, axis u0 from eye to point, normal n0.
  const T0 = G.tip, E0 = G.eye, L0 = len(sub(T0, E0)), u0 = unit(sub(T0, E0));
  const n0 = [-u0[1], u0[0]];
  const a0 = Math.atan2(u0[1], u0[0]);
  const B = G.stitches.map((s) => s.b), T = G.stitches.map((s) => s.t);
  const tops = [sub(T[0], sub(T[1], T[0])), ...T];   // the hidden first entry, behind the cloth

  /* A pose: the needle's axis point p (distance from the eye) sits at screen point H, the
     needle faces screen angle a, tilted phi out of the cloth. mapping() turns a pose into the
     affine map from the needle's own pixels to the screen. `lift` draws its shadow instead:
     -1 when the drawn part lies eye-side of the pivot, +1 point-side, so height grows away from
     the hole either way. */
  function mapping(pose, lift) {
    const us = dir(pose.a), ns = [-us[1], us[0]];
    const h = lift ? lift * SHADOW * Math.sin(pose.phi) : 0;
    const ax = add(mul(us, Math.cos(pose.phi)), mul(SHADOW_DIR, h));
    const A = [[ax[0] * u0[0] + ns[0] * n0[0], ax[0] * u0[1] + ns[0] * n0[1]],
               [ax[1] * u0[0] + ns[1] * n0[0], ax[1] * u0[1] + ns[1] * n0[1]]];
    const Q = add(E0, mul(u0, pose.p));
    const t = sub(pose.H, [A[0][0] * Q[0] + A[0][1] * Q[1], A[1][0] * Q[0] + A[1][1] * Q[1]]);
    return { A, t, at: (X) => add([A[0][0] * X[0] + A[0][1] * X[1], A[1][0] * X[0] + A[1][1] * X[1]], t) };
  }
  const css = (m) => `translate(${pct(m.t[0])}, ${pct(m.t[1])}) matrix(${m.A[0][0].toFixed(4)}, ${m.A[1][0].toFixed(4)}, ${m.A[0][1].toFixed(4)}, ${m.A[1][1].toFixed(4)}, 0, 0)`;
  const eyeOf = (pose) => mapping(pose, 0).at(E0);
  const tipOf = (pose) => mapping(pose, 0).at(T0);
  const free = (P, a, phi) => ({ H: P, p: L0, a, phi });   // pivot at the point, in the air
  const FULL = [-80, L0 + 80];

  const rest = free(T0, a0, 0);
  const bites = G.stitches.map((_, k) => {
    const from = tops[k], to = B[k], v = sub(to, from);
    return { from, to, u: unit(v), D: len(v), a: Math.atan2(v[1], v[0]) };
  });
  const f = Math.cos(PHI_IN);
  // Driving the needle s along its own length from the entry hole; its point is on screen at
  // from + f s u, so it reaches the exit hole at s = D / f.
  const biteEnd = (bt) => L0 + (bt.D + PULL) / f;
  // Where the first bite appears: the point out of the first exit by 75% of the needle, the
  // eye still under the cloth.
  const FIRST_OUT = (bt) => bt.D / f + 0.75 * L0;
  const poised = (k) => free(sub(bites[k].from, mul(bites[k].u, HOVER)), bites[k].a, PHI_IN);
  const pulled = (k) => free(tipOf({ H: bites[k].from, p: L0 - biteEnd(bites[k]), a: bites[k].a, phi: PHI_IN }), bites[k].a, PHI_IN);
  const carry = (p, q, t, bulge, dip) => {
    const P = lerp2(tipOf(p), tipOf(q), t), s = Math.sin(Math.PI * t);
    return free([P[0] + bulge * s, P[1]], lerp(p.a, q.a, t) - 0.25 * s, lerp(p.phi, q.phi, t) - dip * s);
  };
  const flat = (pose) => [{ iv: FULL, H: tipOf(pose), p: L0, lift: -1 }];

  // The timeline: a list of [seconds, frame(t in 0..1) -> state].
  const steps = [];
  // The seam starts from the back: the needle leaves the front as the stitches and thread
  // clear, and the open pocket holds a beat. The needle then appears already partway up
  // through the bottom of the first stitch and freezes for a beat before it moves (author,
  // 2026-09-30).
  steps.push([0.45, (t) => ({ pose: rest, segs: flat(rest), shown: 0, raster: 1 - t, fade: true, needleAlpha: 1 - t })]);
  steps.push([1.2, () => ({ pose: rest, segs: flat(rest), shown: 0, raster: 0, fade: true, needleAlpha: 0 })]);
  bites.forEach((bt, k) => {
    const bite = (t) => {
      const s = lerp(k === 0 ? FIRST_OUT(bt) : -HOVER / f, biteEnd(bt), ease(t));
      const h = L0 - s;                          // the entry hole, measured from the eye
      const pose = { H: bt.from, p: h, a: bt.a, phi: PHI_IN };
      const segs = [];
      if (s <= 0) segs.push({ iv: FULL, H: bt.from, p: h, lift: -1 });
      else {
        if (h > G.butt && k > 0) segs.push({ iv: [-80, h], H: bt.from, p: h, lift: -1 });
        if (h + bt.D / f < L0) segs.push({ iv: [h + bt.D / f, L0 + 80], H: bt.to, p: h + bt.D / f, lift: 1 });
      }
      let thread = null;
      if (h > 0 && k > 0) thread = { from: B[k - 1], to: eyeOf(pose) };   // still drawing the last stitch
      if (h + bt.D / f <= 0) thread = { from: bt.to, to: eyeOf(pose) };   // out of the new exit
      return { pose, segs, thread, shown: h <= 0 ? k : Math.max(0, k - 1), raster: 0 };
    };
    if (k === 0) {
      steps.push([0.45, (t) => ({ ...bite(0), needleAlpha: t })]);
      steps.push([1.2, () => bite(0)]);
    }
    steps.push([k === 0 ? 0.6 : 1.0, bite]);
    if (k < bites.length - 1) {
      steps.push([0.6, (t) => {
        const pose = carry(pulled(k), poised(k + 1), ease(t), 70, PHI_IN - PHI_MID);
        return { pose, segs: flat(pose), thread: { from: bt.to, to: eyeOf(pose) }, shown: k, raster: 0 };
      }]);
    }
  });
  const last = bites.length - 1;
  steps.push([1.0, (t) => {
    // As the needle comes to rest the thread goes slack and settles into the drawn curve.
    const pose = carry(pulled(last), rest, ease(t), 50, 0);
    return { pose, segs: flat(pose), thread: { from: B[last], to: eyeOf(pose), slack: ease(Math.min(1, t * 1.15)) }, shown: last, raster: 0 };
  }]);
  steps.push([0.4, (t) => ({ pose: rest, segs: flat(rest), thread: { from: B[last], to: eyeOf(rest), slack: 1 }, live: 1 - t, shown: last, raster: t, lastIn: t })]);
  steps.push([1.2, () => ({ pose: rest, segs: flat(rest), shown: 5, raster: 1 })]);
  // The durations above are the paced loop; it plays SPEED times as fast (author, 2026-09-30).
  const SPEED = 3;
  steps.forEach((s) => (s[0] /= SPEED));
  const TOTAL = steps.reduce((n, s) => n + s[0], 0);

  function stateAt(sec) {
    let t = sec % TOTAL;
    for (const [d, fr] of steps) {
      if (t < d) return fr(t / d);
      t -= d;
    }
    return steps[steps.length - 1][1](1);
  }

  // A visible stretch [from, to] of the needle's axis, as a clip in its own box.
  function clipFor(iv) {
    const W = 70;
    const p = (d, side) => add(add(E0, mul(u0, d)), mul(n0, side * W));
    const pts = [p(iv[0], -1), p(iv[1], -1), p(iv[1], 1), p(iv[0], 1)];
    return "polygon(" + pts.map((q) => `${pct(q[0])} ${pct(q[1])}`).join(", ") + ")";
  }

  /* The working thread runs from its last hole to the eye, sagging a little. `slack` (0 to 1)
     bends it toward the resting curve drawn in the art: the offset of that curve from its own
     chord is added to the live chord, so at slack 1 on the resting needle the live thread is the
     drawn thread and handing over to the art shows no jump. */
  const REST = [B[B.length - 1], T[T.length - 1], ...G.rest_thread];
  const REST_U = (() => {
    const d = [0];
    for (let i = 1; i < REST.length; i++) d.push(d[i - 1] + len(sub(REST[i], REST[i - 1])));
    return d.map((v) => v / d[d.length - 1]);
  })();
  function threadPts(th) {
    const w = th.slack || 0, sag = Math.min(40, len(sub(th.to, th.from)) * 0.1) * (1 - w);
    const r0 = REST[0], r1 = REST[REST.length - 1];
    return REST.map((p, i) => {
      const u = REST_U[i], c = lerp2(th.from, th.to, u), cr = lerp2(r0, r1, u);
      return [c[0] + w * (p[0] - cr[0]), c[1] + w * (p[1] - cr[1]) + sag * Math.sin(Math.PI * u)];
    });
  }
  // A smooth curve through the points (Catmull-Rom as cubic Beziers).
  function smooth(pts) {
    const f1 = (v) => v.toFixed(1);
    let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;
    }
    return d;
  }

  function controller(root) {
    const q = (c) => root.querySelector(c);
    const stitches = [1, 2, 3, 4, 5].map((i) => q(`.pa-s${i}`));
    const thread = q(".pa-thread");
    const needleA = q(".pa-needle");
    const clone = (cls, where) => {
      const el = needleA.cloneNode(true);
      el.classList.add(cls);
      where(el);
      return el;
    };
    const needleB = clone("pa-needle-tip", (el) => needleA.after(el));
    const shadowA = clone("pa-shadow", (el) => thread.after(el));
    const shadowB = clone("pa-shadow", (el) => shadowA.after(el));
    [shadowA, shadowB].forEach((el) => el.classList.remove("pa-needle"));
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "pa pa-live");
    svg.setAttribute("viewBox", `0 0 ${BOX} ${BOX}`);
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(NS, "path");
    const tail = document.createElementNS(NS, "path");
    path.setAttribute("stroke-width", String(G.thread_w));
    tail.setAttribute("stroke-width", String(G.thread_w));
    tail.setAttribute("class", "pa-tail");
    svg.append(path, tail);
    shadowB.after(svg);
    const moving = [needleA, needleB, shadowA, shadowB];
    let raf = 0, t0 = 0;

    function draw(el, m, iv, alpha) {
      if (!iv || alpha <= 0) { el.style.visibility = "hidden"; return; }
      el.style.visibility = "visible";
      el.style.transform = css(m);
      el.style.clipPath = clipFor(iv);
      el.style.opacity = String(alpha);
    }

    function apply(s) {
      const alpha = s.needleAlpha === undefined ? 1 : s.needleAlpha;
      const m = mapping(s.pose, 0);
      const shade = 0.3 * Math.min(1, Math.sin(s.pose.phi) / 0.3);
      [[needleA, shadowA], [needleB, shadowB]].forEach(([nd, sh], i) => {
        const seg = s.segs[i];
        draw(nd, m, seg && seg.iv, alpha);
        draw(sh, seg ? mapping({ H: seg.H, p: seg.p, a: s.pose.a, phi: s.pose.phi }, seg.lift) : m, seg && seg.iv, alpha * shade);
      });
      stitches.forEach((el, i) => {
        let o = i < s.shown ? 1 : 0;
        if (s.fade) o = s.raster;
        if (i === 4 && s.lastIn !== undefined) o = s.lastIn;
        el.style.opacity = String(o);
      });
      thread.style.opacity = String(s.raster);
      if (s.thread) {
        path.setAttribute("d", smooth(threadPts(s.thread)));
        // The tail beyond the eye rides with the needle; at rest it is where the art draws it.
        tail.setAttribute("d", smooth(G.tail.map((p) => m.at(p))));
        svg.style.opacity = String(s.live === undefined ? 1 : s.live);
      } else {
        path.setAttribute("d", "");
        tail.setAttribute("d", "");
      }
    }

    function frame(now) {
      apply(stateAt((now - t0) / 1000));
      raf = requestAnimationFrame(frame);
    }

    return {
      at(sec) { apply(stateAt(sec)); },
      start() {
        if (raf) return;
        t0 = performance.now();
        raf = requestAnimationFrame(frame);
      },
      stop() {
        cancelAnimationFrame(raf);
        raf = 0;
        [...moving, thread, ...stitches].forEach((el) => {
          el.style.transform = ""; el.style.clipPath = ""; el.style.opacity = ""; el.style.visibility = "";
        });
        path.setAttribute("d", "");
        tail.setAttribute("d", "");
      },
    };
  }

  // Called by the page after it renders the promise cards. `still` draws one moment of the
  // loop and holds it, for the render test and for checking frames.
  window.PromiseAnim = {
    total: TOTAL,
    still(scope, sec) {
      scope.querySelectorAll(".promise-anim-3").forEach((root) => (root.paControl || (root.paControl = controller(root))).at(sec));
    },
    bind(scope) {
      if (!window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const noHover = window.matchMedia("(hover: none)").matches;
      scope.querySelectorAll(".promise-anim-3").forEach((root) => {
        const card = root.closest(".pa-trigger") || root;
        const c = root.paControl || (root.paControl = controller(root));
        c.stop();
        if (noHover && "IntersectionObserver" in window) {
          new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? c.start() : c.stop())))
            .observe(card);
          return;
        }
        card.addEventListener("mouseenter", c.start);
        card.addEventListener("mouseleave", c.stop);
        card.addEventListener("focus", c.start);
        card.addEventListener("blur", c.stop);
      });
    },
  };
})();
