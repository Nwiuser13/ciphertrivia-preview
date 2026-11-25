/* ==========================================================================
   AI attack-surface map — AI Security page, under the overview.
   The cards are an AI application laid out by the CSS grid: user prompts
   reach the AI application and the LLM, which draws on enterprise documents
   through RAG retrieval and directs an AI agent that calls APIs and external
   tools and connected systems. The darker cards are where the AI-specific
   risks sit. This canvas draws the connections from wherever the grid put
   the cards, keeps request traffic flowing along them, and sends the
   tester's probe round the map: each card it reaches lights up with the
   risks tested there, then keeps an orange mark as covered. When every
   point has been tested the marks clear and the round starts again.
   Runs only while on screen; reduced motion gets one still frame; the
   button pauses it.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-aimap]');
  if (!root) return;
  var board = root.querySelector('[data-aimap-board]');
  var canvas = board && board.querySelector('canvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) return;

  var EDGES = [['prompt', 'app'], ['app', 'llm'], ['docs', 'rag'], ['rag', 'llm'],
               ['llm', 'agent'], ['agent', 'tools'], ['tools', 'systems']];
  var TOUR = ['prompt', 'app', 'llm', 'rag', 'docs', 'agent', 'tools', 'systems'];
  var els = {};
  Array.prototype.forEach.call(root.querySelectorAll('[data-aimap-node]'), function (el) {
    els[el.getAttribute('data-aimap-node')] = el;
  });
  if (!TOUR.every(function (id) { return els[id]; })) return;
  var btn = root.querySelector('[data-aimap-toggle]');
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var SIG = '255,79,31', INK = '0,5,20';
  function col(rgb, a) { return 'rgba(' + rgb + ',' + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ')'; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* ---- Geometry, measured from the grid ---- */
  var W = 0, H = 0, dpr = 1, k = 1, R = {}, lines = [];

  function measure() {
    var b = board.getBoundingClientRect();
    if (b.width < 10 || b.height < 10) return false;
    W = b.width; H = b.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    TOUR.forEach(function (id) {
      var r = els[id].getBoundingClientRect();
      R[id] = { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height,
                cx: r.left - b.left + r.width / 2, cy: r.top - b.top + r.height / 2 };
    });
    k = clamp(W / 1200, 0.75, 1.1);
    lines = EDGES.map(function (e) { return poly(route(R[e[0]], R[e[1]])); });
    return true;
  }

  /* Card edge to card edge: straight across a row or down a column, else one elbow */
  function route(A, C) {
    if (A.y < C.y + C.h && C.y < A.y + A.h) {
      var y = (Math.max(A.y, C.y) + Math.min(A.y + A.h, C.y + C.h)) / 2;
      return C.cx > A.cx ? [[A.x + A.w, y], [C.x, y]] : [[A.x, y], [C.x + C.w, y]];
    }
    if (A.x < C.x + C.w && C.x < A.x + A.w) {
      var x = (Math.max(A.x, C.x) + Math.min(A.x + A.w, C.x + C.w)) / 2;
      return C.cy > A.cy ? [[x, A.y + A.h], [x, C.y]] : [[x, A.y], [x, C.y + C.h]];
    }
    var sx = C.cx > A.cx ? A.x + A.w : A.x;
    return [[sx, A.cy], [C.cx, A.cy], [C.cx, C.cy > A.cy ? C.y : C.y + C.h]];
  }
  function poly(pts) {
    var segs = [], L = 0;
    for (var i = 1; i < pts.length; i++) {
      var l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      segs.push(l); L += l;
    }
    return { pts: pts, segs: segs, len: L };
  }
  function at(p, d) {
    d = clamp(d, 0, p.len);
    for (var i = 0; i < p.segs.length; i++) {
      if (d <= p.segs[i] || i === p.segs.length - 1) {
        var t = p.segs[i] ? d / p.segs[i] : 0, a = p.pts[i], b = p.pts[i + 1];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
      d -= p.segs[i];
    }
    return p.pts[p.pts.length - 1];
  }
  function reversed(p) { return poly(p.pts.slice().reverse()); }

  /* The probe's way from one card to the next: along the connections, through the cards */
  function leg(from, to) {
    var prev = {}, q = [from], seen = {}; seen[from] = 1;
    while (q.length) {
      var n = q.shift();
      if (n === to) break;
      EDGES.forEach(function (e, i) {
        var m = e[0] === n ? e[1] : e[1] === n ? e[0] : null;
        if (m && !seen[m]) { seen[m] = 1; prev[m] = [n, i]; q.push(m); }
      });
    }
    var hops = [], c = to;
    while (c !== from) { hops.unshift(prev[c]); c = prev[c][0]; }
    var pts = [[R[from].cx, R[from].cy]];
    hops.forEach(function (h) {
      var p = EDGES[h[1]][0] === h[0] ? lines[h[1]] : reversed(lines[h[1]]);
      pts = pts.concat(p.pts);
    });
    pts.push([R[to].cx, R[to].cy]);
    return poly(pts);
  }

  /* ---- Simulation ---- */
  var clock = 0, phase = 'dwell', ti = 0, pt = 0, path = null, probe = null, trail = [], rings = [], sparks = [];
  var DWELL = 1.9, SPEED = 340;

  function setHot(id, on) { els[id].classList.toggle('is-hot', on); }
  function setDone(id, on) { els[id].classList.toggle('is-done', on); }
  function arrive(id) {
    setHot(id, true);
    rings.push({ id: id, t: 0 }, { id: id, t: -0.28 });
    var r = R[id];
    for (var i = 0; i < 10; i++) {
      var a = Math.PI * 2 * i / 10 + 0.3;
      sparks.push({ x: r.cx + Math.cos(a) * r.w * 0.5, y: r.cy + Math.sin(a) * r.h * 0.5, a: a, life: 1 });
    }
  }
  function start() {
    TOUR.forEach(function (id) { setHot(id, false); setDone(id, false); });
    ti = 0; pt = 0; phase = 'dwell'; trail = [];
    probe = [R[TOUR[0]].cx, R[TOUR[0]].cy];
    arrive(TOUR[0]);
  }

  function step(dt) {
    clock += dt;
    pt += dt;
    if (phase === 'dwell' && pt > DWELL) {
      setHot(TOUR[ti], false);
      setDone(TOUR[ti], true);
      if (ti === TOUR.length - 1) { phase = 'rest'; pt = 0; }
      else { phase = 'move'; pt = 0; path = leg(TOUR[ti], TOUR[ti + 1]); }
    } else if (phase === 'move') {
      var dur = clamp(path.len / (SPEED * k), 0.55, 1.6), u = Math.min(1, pt / dur);
      probe = at(path, path.len * ease(u));
      trail.push([probe[0], probe[1], 1]);
      if (u >= 1) { ti++; phase = 'dwell'; pt = 0; arrive(TOUR[ti]); }
    } else if (phase === 'rest') {
      // the marks clear one by one, then the round starts again
      var n = Math.floor(pt / 0.12);
      for (var i = 0; i < Math.min(n, TOUR.length); i++) setDone(TOUR[i], false);
      if (pt > 1.6) start();
    }
    trail.forEach(function (p) { p[2] -= dt * 2.6; });
    trail = trail.filter(function (p) { return p[2] > 0; });
    rings.forEach(function (r) { r.t += dt; });
    rings = rings.filter(function (r) { return r.t < 1.1; });
    sparks.forEach(function (s) { s.life -= dt * 1.8; });
    sparks = sparks.filter(function (s) { return s.life > 0; });
  }

  /* ---- Drawing ---- */
  function seg(x1, y1, x2, y2, rgb, a, w) {
    ctx.strokeStyle = col(rgb, a); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function drawLines() {
    lines.forEach(function (p) {
      ctx.strokeStyle = col(INK, 0.28); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.pts[0][0], p.pts[0][1]);
      for (var i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0], p.pts[i][1]);
      ctx.stroke();
      // arrowhead into the next card
      var b = p.pts[p.pts.length - 1], a = p.pts[p.pts.length - 2];
      var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = 6;
      ctx.fillStyle = col(INK, 0.45);
      ctx.beginPath();
      ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] - Math.cos(ang - 0.5) * s, b[1] - Math.sin(ang - 0.5) * s);
      ctx.lineTo(b[0] - Math.cos(ang + 0.5) * s, b[1] - Math.sin(ang + 0.5) * s);
      ctx.fill();
      // request traffic
      var gap = 34 * k, n = Math.max(1, Math.floor(p.len / gap)), off = (clock * 38 * k) % gap;
      for (var j = 0; j < n; j++) {
        var d = off + j * gap;
        if (d > p.len - 8) continue;
        var q = at(p, d), fadeIn = clamp(d / 18, 0, 1);
        ctx.fillStyle = col(INK, 0.55 * fadeIn);
        ctx.fillRect(Math.round(q[0]) - 1.5, Math.round(q[1]) - 1.5, 3, 3);
      }
    });
  }
  function drawRings() {
    rings.forEach(function (r) {
      if (r.t < 0) return;
      var c = R[r.id], e = 1 - Math.pow(1 - Math.min(1, r.t / 1.1), 3), pad = 4 + e * 22 * k;
      ctx.strokeStyle = col(SIG, (1 - e) * 0.9); ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x - pad, c.y - pad, c.w + pad * 2, c.h + pad * 2);
    });
    sparks.forEach(function (s) {
      var r0 = (8 + (1 - s.life) * 18) * k, r1 = r0 + 7 * k * s.life;
      seg(s.x + Math.cos(s.a) * r0, s.y + Math.sin(s.a) * r0, s.x + Math.cos(s.a) * r1, s.y + Math.sin(s.a) * r1, SIG, s.life, 1.5);
    });
  }
  function drawProbe() {
    if (phase !== 'move') return;
    for (var i = 1; i < trail.length; i++) {
      var a = trail[i - 1], b = trail[i];
      seg(a[0], a[1], b[0], b[1], SIG, b[2] * 0.8, 3);
    }
    var s = 10 * k;
    ctx.fillStyle = col(SIG, 1);
    ctx.fillRect(probe[0] - s / 2, probe[1] - s / 2, s, s);
    ctx.strokeStyle = col(SIG, 0.35); ctx.lineWidth = 1;
    ctx.strokeRect(probe[0] - s, probe[1] - s, s * 2, s * 2);
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    drawLines(); drawRings(); drawProbe();
  }

  /* ---- Run only on screen, unpaused, in a visible tab ---- */
  var running = false, raf = 0, last = 0, onScreen = false, paused = reduce, ready = false;

  function frame(now) {
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    step(dt);
    draw();
    raf = running ? window.requestAnimationFrame(frame) : 0;
  }
  function sync() {
    var want = ready && !paused && onScreen && !document.hidden;
    if (want && !running) { running = true; last = performance.now(); raf = window.requestAnimationFrame(frame); }
    else if (!want && running) { running = false; if (raf) window.cancelAnimationFrame(raf); raf = 0; }
    root.classList.toggle('is-paused', paused);
    if (btn) btn.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
  }
  function reset() {
    if (!measure()) return;
    if (reduce) {
      // still picture: the map and its traffic, no probe
      TOUR.forEach(function (id) { setHot(id, false); setDone(id, false); });
      clock = 0.4; phase = 'still';
    } else if (!ready) {
      start();
    } else {
      // keep the round going; just re-aim a probe that was travelling
      if (phase === 'move') { phase = 'dwell'; pt = DWELL; }
      rings = []; sparks = []; trail = [];
    }
    draw();
    ready = true;
  }

  var lastW = 0, lastH = 0, rt = 0;
  function onResize() {
    var b = board.getBoundingClientRect();
    if (Math.abs(b.width - lastW) < 1 && Math.abs(b.height - lastH) < 1) return;
    lastW = b.width; lastH = b.height;
    clearTimeout(rt);
    rt = setTimeout(function () { reset(); sync(); }, ready ? 160 : 0);
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(board);
  else window.addEventListener('resize', onResize);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { onScreen = entries[0].isIntersecting; sync(); }, { threshold: 0.1 }).observe(root);
  } else {
    onScreen = true;
  }
  document.addEventListener('visibilitychange', sync);
  if (btn) btn.addEventListener('click', function () { paused = !paused; sync(); });
  onResize();
})();
