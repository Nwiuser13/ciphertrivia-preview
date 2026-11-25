/* Home hero (partials/enterprise/console.njk, styles in sections/home.css).

   The assessment console plays one example engagement as an 18-second loop
   through the AI section's five stages: the recon agent maps the attack
   surface, the deep-scan agent raises signals, experts dismiss the false
   positives and validate three findings (Human + AI), the prioritization agent
   ranks them, the retest agent verifies each fix and the report is ready.
   Every frame is a pure function of the cycle time, so pausing, resuming and
   the reduced-motion still frame all draw the same way: the map is painted on
   a canvas, the panels change by class. It is a calm light screen: no radar,
   nothing blinks or pulses, captions fade in rather than scramble. Plays only
   while on screen; the pause button covers WCAG 2.2.2; reduced-motion users get
   the finished frame and no rise. */
(function () {
  'use strict';

  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // QA: /#console-t=9.8 holds the console on that moment of the cycle
  var pin = /console-t=([\d.]+)/.exec(location.hash);

  /* ---- Console ---- */
  var stage = document.querySelector('[data-console-stage]');
  if (!stage) return;
  var con = stage.querySelector('[data-console]');
  var mapEl = con.querySelector('[data-map]');
  var canvas = mapEl.querySelector('canvas');
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  var tiltEl = stage.querySelector('.console-tilt');
  var toggle = stage.querySelector('[data-console-toggle]');
  var phaseName = con.querySelector('[data-phase-name]');
  var phaseNote = con.querySelector('[data-phase-note]');
  var captionEl = phaseName.parentNode;
  var core = mapEl.querySelector('.console__node--core');
  var countEl = {};
  Array.prototype.forEach.call(con.querySelectorAll('[data-tally]'), function (el) { countEl[el.getAttribute('data-tally')] = el; });

  var CYCLE = 18;
  var SPAN = { recon: [0.3, 4.0], scan: [4.0, 7.6], review: [7.6, 11.2], rank: [11.2, 13.4], retest: [13.4, 16.8] };
  var STAGES = Array.prototype.map.call(con.querySelectorAll('[data-stage]'), function (el) {
    var id = el.getAttribute('data-stage');
    return { el: el, id: id, name: el.querySelector('.console__sname').textContent, note: el.getAttribute('data-note'), span: SPAN[id] };
  });
  var NODES = ['web', 'api', 'cloud', 'mobile', 'network'];
  var ANGLE = { web: -90, api: -18, cloud: 54, mobile: 126, network: 198 };
  var APPEAR = { web: 0.7, api: 1.15, cloud: 1.6, mobile: 2.05, network: 2.5 };
  // Each validated finding: its asset, when an expert confirms it, when the retest clears it,
  // its row slot before and after ranking, and its severity colour (tokens --sev-*)
  var FINDINGS = {
    dns:   { node: 'network', valid: 8.6,  fix: 15.6, slot: [0, 2], sev: '232, 163, 23' },
    cloud: { node: 'cloud',   valid: 9.6,  fix: 14.9, slot: [1, 1], sev: '240, 106, 26' },
    sqli:  { node: 'web',     valid: 10.6, fix: 14.2, slot: [2, 0], sev: '217, 54, 54' }
  };
  var RANK = 11.5, REPORT = 16.2, FADE = 17.35, ASSETS = 148;
  // The expert's path through the clusters during Human + AI
  var REVIEW = [['network', 7.75, 8.7], ['cloud', 8.7, 9.7], ['web', 9.7, 10.7], ['api', 10.7, 10.95], ['mobile', 10.95, 11.2]];
  var STILL = pin ? Math.min(CYCLE - 0.01, parseFloat(pin[1])) : 16.6;   // the finished frame shown without motion
  if (pin) reduce = true;

  var nodeEl = {}, targetEl = {}, rowEl = {}, findAt = {};
  NODES.forEach(function (id) {
    nodeEl[id] = mapEl.querySelector('[data-node="' + id + '"]');
    targetEl[id] = con.querySelector('[data-target="' + id + '"]');
  });
  var segEl = {};
  Object.keys(FINDINGS).forEach(function (f) {
    rowEl[f] = con.querySelector('[data-finding="' + f + '"]');
    segEl[f] = con.querySelector('[data-seg="' + f + '"]');
    findAt[FINDINGS[f].node] = f;
  });

  // 45 discovered assets, nine per target; 37 raise signals, 34 of those are false positives
  var seed = 11;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var QUIET = [1, 7, 11, 16, 25, 29, 33, 43];
  var dots = [];
  NODES.forEach(function (id) {
    for (var k = 0; k < 9; k++) {
      dots.push({
        node: id,
        spread: (k / 8 - 0.5) * 150 + (rnd() - 0.5) * 14,
        reach: 0.22 + rnd() * 0.2,
        appear: APPEAR[id] + 0.35 + k * 0.055,
        quiet: QUIET.indexOf(dots.length) !== -1,
        find: k === 4 && findAt[id] ? findAt[id] : null,
        lit: Infinity,
        dismiss: Infinity
      });
    }
  });
  var signalCount = dots.filter(function (d) { return !d.quiet; }).length;

  /* ---- Geometry (recomputed when the map changes size) ---- */
  var W = 0, H = 0, dpr = 1, C = { x: 0, y: 0 }, RX = 0, RY = 0, R = 0, pos = {}, keys = [];
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { v = clamp01(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; }
  function easeOut(v) { v = clamp01(v); return 1 - Math.pow(1 - v, 3); }

  function layout() {
    var rect = mapEl.getBoundingClientRect();
    W = rect.width; H = rect.height;
    if (!W || !H) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var top = captionEl.offsetTop + captionEl.offsetHeight + 6;   // keep the map clear of the caption
    var h = H - top;
    C.x = W / 2;
    C.y = top + h * 0.5;
    RY = h * 0.34;
    RX = Math.min(W * 0.36, RY * 1.6);
    R = Math.min(RX, RY);
    var tile = nodeEl.web.offsetWidth / 2 + 6;
    NODES.forEach(function (id) {
      var a = ANGLE[id] * Math.PI / 180;
      pos[id] = { x: C.x + RX * Math.cos(a), y: C.y + RY * Math.sin(a) };
      nodeEl[id].style.left = pos[id].x + 'px';
      nodeEl[id].style.top = pos[id].y + 'px';
    });
    core.style.left = C.x + 'px';
    core.style.top = C.y + 'px';
    dots.forEach(function (d) {
      var a = (ANGLE[d.node] + d.spread) * Math.PI / 180, p = pos[d.node], dist = tile + R * d.reach;
      d.x = Math.max(8, Math.min(W - 8, p.x + Math.cos(a) * dist));
      d.y = Math.max(top + 8, Math.min(H - 8, p.y + Math.sin(a) * dist));
      // Bearing from the core on the orbit: 0 straight up, clockwise
      var b = Math.atan2((d.y - C.y) * RX / RY, d.x - C.x) * 180 / Math.PI + 90;
      d.bearing = (b + 360) % 360;
      d.lit = d.quiet ? Infinity : SPAN.scan[0] + d.bearing / 200 + 0.03;   // signals raised clockwise from the top
    });
    planReview();
    return true;
  }

  // The review bracket's keyframes and each false positive's dismissal time
  function planReview() {
    keys = [{ t: SPAN.review[0], x: C.x, y: C.y, s: 56 }];
    REVIEW.forEach(function (w) {
      var id = w[0], a = w[1], b = w[2], f = findAt[id], o = ANGLE[id] * Math.PI / 180;
      var cx = pos[id].x + Math.cos(o) * R * 0.42, cy = pos[id].y + Math.sin(o) * R * 0.42, size = R * 0.95;
      var end = f ? FINDINGS[f].valid : b;
      var noise = dots.filter(function (d) { return d.node === id && !d.quiet && !d.find; });
      var d0 = a + 0.3, d1 = end - (f ? 0.34 : 0.04);
      noise.forEach(function (d, i) { d.dismiss = d0 + (i + 0.5) * (d1 - d0) / noise.length; });
      keys.push({ t: a + 0.26, x: cx, y: cy, s: size });
      if (f) {
        var fd = dots.filter(function (d) { return d.find === f; })[0];
        keys.push({ t: end - 0.3, x: cx, y: cy, s: size });
        keys.push({ t: end, x: fd.x, y: fd.y, s: 20 });
      } else {
        keys.push({ t: b, x: cx, y: cy, s: size });
      }
    });
  }
  function bracketAt(t) {
    for (var i = 1; i < keys.length; i++) {
      if (t <= keys[i].t) {
        var p = keys[i - 1], q = keys[i], k = ease((t - p.t) / Math.max(0.001, q.t - p.t));
        return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, s: p.s + (q.s - p.s) * k };
      }
    }
    return keys[keys.length - 1];
  }

  /* ---- Canvas ---- */
  var SIGNAL = '255, 79, 31', INK = '0, 5, 20', CLEAR = '47, 143, 91';
  function corners(x, y, s, len) {
    var h = s / 2;
    ctx.beginPath();
    ctx.moveTo(x - h, y - h + len); ctx.lineTo(x - h, y - h); ctx.lineTo(x - h + len, y - h);
    ctx.moveTo(x + h - len, y - h); ctx.lineTo(x + h, y - h); ctx.lineTo(x + h, y - h + len);
    ctx.moveTo(x + h, y + h - len); ctx.lineTo(x + h, y + h); ctx.lineTo(x + h - len, y + h);
    ctx.moveTo(x - h + len, y + h); ctx.lineTo(x - h, y + h); ctx.lineTo(x - h, y + h - len);
    ctx.stroke();
  }
  function square(x, y, s) { ctx.fillRect(x - s / 2, y - s / 2, s, s); }

  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
    // Two faint orbits round the analysis core, the outer one through the assets: never faded
    ctx.save();
    ctx.translate(C.x, C.y);
    ctx.scale(1, RY / RX);
    ctx.strokeStyle = 'rgba(' + INK + ', 0.06)';
    ctx.beginPath(); ctx.arc(0, 0, RX * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(' + INK + ', 0.1)';
    ctx.beginPath(); ctx.arc(0, 0, RX, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    ctx.globalAlpha = 1 - clamp01((t - FADE) / 0.5);

    // Links from the analysis core to each asset, with traffic while the agents work
    NODES.forEach(function (id, i) {
      var p = pos[id], k = ease((t - APPEAR[id] + 0.05) / 0.45);
      if (k <= 0) return;
      ctx.strokeStyle = 'rgba(' + INK + ', 0.18)';
      ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.lineTo(C.x + (p.x - C.x) * k, C.y + (p.y - C.y) * k); ctx.stroke();
      if (k >= 1 && t < SPAN.scan[1]) {
        var q = (t * 0.7 + i * 0.21) % 1, live = t >= SPAN.scan[0];
        ctx.fillStyle = live ? 'rgba(' + SIGNAL + ', 0.9)' : 'rgba(' + INK + ', 0.45)';
        square(C.x + (p.x - C.x) * q, C.y + (p.y - C.y) * q, 3);
      }
    });

    // Discovered assets: grey, orange once a signal is raised, faint once an expert dismisses it
    dots.forEach(function (d) {
      var k = clamp01((t - d.appear) / 0.25);
      if (k <= 0) return;
      var p = pos[d.node], f = d.find && FINDINGS[d.find];
      ctx.strokeStyle = 'rgba(' + INK + ', ' + (0.08 * k) + ')';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(d.x, d.y); ctx.stroke();
      if (f && t >= f.valid) return;   // drawn as a finding below
      if (t >= d.dismiss) {
        var m = clamp01((t - d.dismiss) / 0.3);
        ctx.fillStyle = 'rgba(' + SIGNAL + ', ' + (0.9 * (1 - m)) + ')';
        square(d.x, d.y, 3);
        ctx.fillStyle = 'rgba(' + INK + ', ' + (0.16 * m) + ')';
        square(d.x, d.y, 3);
      } else if (t >= d.lit) {
        var g = clamp01((t - d.lit) / 0.3);
        ctx.fillStyle = 'rgba(' + SIGNAL + ', ' + (0.16 * g) + ')';
        square(d.x, d.y, 8);
        ctx.fillStyle = 'rgba(' + SIGNAL + ', ' + (0.4 + 0.6 * g) + ')';
        square(d.x, d.y, 3.5);
      } else {
        ctx.fillStyle = 'rgba(' + INK + ', ' + (0.42 * k) + ')';
        square(d.x, d.y, 3);
      }
    });

    // Human + AI: the expert's bracket works through each cluster and settles on the real finding
    if (t >= SPAN.review[0] && t < SPAN.review[1] + 0.3) {
      var b = bracketAt(t);
      ctx.save();
      ctx.globalAlpha *= clamp01((t - SPAN.review[0]) / 0.2) * (1 - clamp01((t - SPAN.review[1]) / 0.3));
      ctx.strokeStyle = 'rgba(' + SIGNAL + ', 0.95)';
      ctx.lineWidth = 1.5;
      corners(b.x, b.y, b.s, Math.max(5, b.s * 0.16));
      ctx.restore();
    }

    // Findings: confirmed, ranked by severity, retested, cleared
    Object.keys(FINDINGS).forEach(function (id) {
      var f = FINDINGS[id];
      if (t < f.valid) return;
      var d = dots.filter(function (x) { return x.find === id; })[0];
      if (t >= f.fix) {
        var c = clamp01((t - f.fix) / 0.3);
        ctx.fillStyle = 'rgba(' + CLEAR + ', ' + (0.12 * c) + ')';
        ctx.fillRect(d.x - 7, d.y - 7, 14, 14);
        ctx.strokeStyle = 'rgba(' + CLEAR + ', ' + (0.95 * c) + ')';
        ctx.lineWidth = 1.25;
        ctx.strokeRect(d.x - 7, d.y - 7, 14, 14);
        ctx.beginPath(); ctx.moveTo(d.x - 3.5, d.y + 0.2); ctx.lineTo(d.x - 0.8, d.y + 2.8); ctx.lineTo(d.x + 3.8, d.y - 2.6); ctx.stroke();
        ctx.lineWidth = 1;
        return;
      }
      ctx.fillStyle = 'rgba(' + SIGNAL + ', 0.2)';
      square(d.x, d.y, 15);
      ctx.fillStyle = 'rgba(' + SIGNAL + ', 1)';
      square(d.x, d.y, 7);
      // Validated: the expert's brackets close in; ranked: they become a steady outline in the
      // severity colour (a second, fainter one for the critical finding)
      var grow = easeOut((t - f.valid) / 0.35), bs = 34 - 12 * grow;
      var r = t >= RANK ? clamp01((t - RANK) / 0.4) : 0;
      if (r < 1) {
        ctx.strokeStyle = 'rgba(' + INK + ', ' + (0.75 * (1 - r)) + ')';
        corners(d.x, d.y, bs, 5);
      }
      if (r > 0) {
        ctx.strokeStyle = 'rgba(' + f.sev + ', ' + (0.9 * r) + ')';
        ctx.strokeRect(d.x - 11, d.y - 11, 22, 22);
        if (id === 'sqli') {
          ctx.strokeStyle = 'rgba(' + f.sev + ', ' + (0.35 * r) + ')';
          ctx.strokeRect(d.x - 16, d.y - 16, 32, 32);
        }
      }
      // Retest: a probe runs from the core to the finding just before it clears
      var go = (t - (f.fix - 0.7)) / 0.7;
      if (go > 0 && go < 1) {
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(' + SIGNAL + ', 0.55)';
        ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.lineTo(d.x, d.y); ctx.stroke();
        ctx.restore();
        var e = ease(go);
        ctx.fillStyle = 'rgba(' + SIGNAL + ', 1)';
        square(C.x + (d.x - C.x) * e, C.y + (d.y - C.y) * e, 5);
      }
    });
    ctx.globalAlpha = 1;
  }

  /* ---- Panels ---- */
  var shown = {}, capStage = null;
  function text(key, el, value) { if (shown[key] !== value) { shown[key] = value; el.textContent = value; } }
  function apply(t) {
    var fade = t >= FADE;
    con.classList.toggle('is-ranked', t >= RANK);
    con.classList.toggle('is-report', t >= REPORT);
    con.classList.toggle('is-fade', fade);
    con.classList.toggle('has-findings', t >= FINDINGS.dns.valid);

    NODES.forEach(function (id, i) {
      var f = findAt[id] && FINDINGS[findAt[id]];
      var found = !!f && t >= f.valid && t < f.fix, cleared = !!f && t >= f.fix;
      nodeEl[id].classList.toggle('is-on', t >= APPEAR[id]);
      nodeEl[id].classList.toggle('is-find', found);
      nodeEl[id].classList.toggle('is-clear', cleared);
      var el = targetEl[id];
      if (!el) return;
      var p = clamp01((t - (SPAN.scan[0] + i * 0.28)) / (2.2 + i * 0.12));
      el.style.setProperty('--p', p.toFixed(3));
      el.classList.toggle('is-on', t >= APPEAR[id]);
      el.classList.toggle('is-scan', p > 0 && p < 1);
      el.classList.toggle('is-done', p >= 1);
      el.classList.toggle('is-find', found);
    });

    var open = 0, worst = 3, SEV = { sqli: 0, cloud: 1, dns: 2 };
    Object.keys(FINDINGS).forEach(function (id) {
      var f = FINDINGS[id], el = rowEl[id];
      var on = t >= f.valid, fixed = t >= f.fix;
      if (on && !fixed) { open++; worst = Math.min(worst, SEV[id]); }
      if (segEl[id]) segEl[id].classList.toggle('is-on', on && !fixed);
      el.style.setProperty('--slot', t >= RANK ? f.slot[1] : f.slot[0]);
      el.classList.toggle('is-in', on);
      el.classList.toggle('is-fixed', fixed);
    });

    var lit = 0, gone = 0;
    dots.forEach(function (d) { if (t >= d.lit) lit++; if (t >= d.dismiss) gone++; });
    if (countEl.assets) text('assets', countEl.assets, String(Math.round(ASSETS * easeOut((t - 0.7) / 3.1))));
    if (countEl.signals) text('signals', countEl.signals, String(Math.min(lit, signalCount)));
    if (countEl.dismissed) text('dismissed', countEl.dismissed, String(gone));
    if (countEl.open) text('open', countEl.open, open + ' open');
    if (countEl.risk) text('risk', countEl.risk, t < FINDINGS.dns.valid ? 'Assessing' : t < RANK ? 'Validating' : ['Critical', 'High', 'Medium', 'Low'][worst]);

    var cur = STAGES[0];
    STAGES.forEach(function (s) { if (t >= s.span[0]) cur = s; });
    STAGES.forEach(function (s) {
      var active = s === cur, done = t >= s.span[1] && !active;
      s.el.classList.toggle('is-active', active);
      s.el.classList.toggle('is-done', done);
      s.el.style.setProperty('--p', (done ? 1 : active ? clamp01((t - s.span[0]) / (s.span[1] - s.span[0])) : 0).toFixed(3));
    });
    if (cur !== capStage) {   // the caption changes with a soft fade
      capStage = cur;
      phaseName.textContent = cur.name;
      phaseNote.textContent = cur.note;
      if (running && captionEl.animate) captionEl.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'ease-out' });
    }
  }

  /* ---- Clock ---- */
  var running = false, raf = 0, base = 0, tNow = 0, lastT = -1, onScreen = false, paused = reduce, ready = false;
  function render(t) {
    if (!ready) return;
    if (t < lastT) {   // a new engagement: reset without animating the panels back
      con.classList.add('is-reset');
      requestAnimationFrame(function () { con.classList.remove('is-reset'); });
    }
    lastT = t;
    tNow = t;
    apply(t);
    draw(t);
  }
  function frame(now) {
    if (!running) return;
    render(((now - base) / 1000) % CYCLE);
    raf = requestAnimationFrame(frame);
  }
  function play() {
    if (running || !ready) return;
    running = true;
    base = performance.now() - tNow * 1000;
    raf = requestAnimationFrame(frame);
  }
  function halt() { running = false; cancelAnimationFrame(raf); }
  function sync() {
    stage.classList.toggle('is-paused', paused && !reduce);
    if (toggle) toggle.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    if (paused || !onScreen) halt(); else play();
  }
  function relayout() {
    ready = layout();
    if (!ready) return;
    if (reduce) { tNow = STILL; lastT = -1; }
    if (!running) { lastT = -1; render(tNow); }
  }

  if (reduce) stage.classList.add('is-still');
  relayout();
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(mapEl);
  else window.addEventListener('resize', relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  if (toggle) toggle.addEventListener('click', function () { paused = !paused; sync(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      sync();
    }, { threshold: 0 }).observe(con);
  } else {
    onScreen = true;
  }
  sync();

  /* ---- Rise: the console starts a little low and small under the headline and comes
         up to full size, facing the reader, as the page scrolls, with a little give to
         the pointer (wide screens, motion allowed) ---- */
  if (reduce || !tiltEl) return;
  var wide = window.matchMedia('(min-width: 901px)');
  var hero = stage.closest('.hero') || stage;
  var queued = false, px = 0, py = 0;
  function tilt() {
    queued = false;
    if (!wide.matches) {
      tiltEl.style.removeProperty('--tilt');
      tiltEl.style.removeProperty('--px');
      tiltEl.style.removeProperty('--py');
      return;
    }
    var r = stage.getBoundingClientRect(), vh = window.innerHeight || 800;
    tiltEl.style.setProperty('--tilt', clamp01((r.top - vh * 0.1) / (vh * 0.62)).toFixed(3));
    tiltEl.style.setProperty('--px', px.toFixed(2));
    tiltEl.style.setProperty('--py', py.toFixed(2));
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(tilt); } }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  hero.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var r = hero.getBoundingClientRect();
    px = ((e.clientX - r.left) / r.width - 0.5) * 4;
    py = -((e.clientY - r.top) / r.height - 0.5) * 3;
    queue();
  });
  hero.addEventListener('pointerleave', function () { px = 0; py = 0; queue(); });
  tilt();
})();
