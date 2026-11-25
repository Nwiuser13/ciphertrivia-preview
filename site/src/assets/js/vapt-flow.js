/* ==========================================================================
   VAPT workflow board — VAPT Security Services page, under the intro.
   One canvas plays an engagement as a pipeline across the seven stages:
   the scope brackets the in-scope assets; the scan rasters across them and
   raises candidate findings; the manual tester meets each candidate at the
   gate and bounces false positives back; confirmed findings are classified
   and drop into four severity bins (critical always leaves first); they are
   written into the report, the vulnerable line of code is replaced by the
   fix, and the retest locks on: a fix that fails goes back to remediation,
   a verified one travels home to its asset.
   One confirmed finding at a time is tracked (corner brackets) and its
   stage label lights. Geometry comes from the CSS grid ([data-vflow-zone]),
   so the same simulation runs on one row or wrapped rows. Runs only while
   on screen; reduced motion gets one still frame; the button pauses it.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-vflow]');
  if (!root) return;
  var board = root.querySelector('[data-vflow-board]');
  var canvas = root.querySelector('canvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var stageEls = Array.prototype.slice.call(root.querySelectorAll('[data-vflow-stage]'));
  if (!board || !ctx || stageEls.length !== 7) return;
  var zoneEls = stageEls.map(function (el) { return el.querySelector('[data-vflow-zone]'); });
  var btn = root.querySelector('[data-vflow-toggle]');
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---- Palette (tokens.css). Severity reads as orange intensity, never a second accent ---- */
  var SIG = '255,79,31', PAP = '247,246,242', STO = '141,145,152', INK = '0,5,20';
  var SEV = [[SIG, 1], [SIG, 0.58], [SIG, 0.22], [STO, 0.7]];   // critical, high, medium, low
  var SEV_ODDS = [0.16, 0.3, 0.34, 0.2];
  var FALSE_POSITIVE = 0.38, RETEST_FAIL = 0.14;

  function col(rgb, a) { return 'rgba(' + rgb + ',' + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ')'; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function pick(odds) {
    var r = Math.random(), s = 0;
    for (var i = 0; i < odds.length; i++) { s += odds[i]; if (r < s) return i; }
    return odds.length - 1;
  }

  /* Damped spring: every pop, snap and settle is one of these */
  function Spring(x, stiff, damp) { this.x = x; this.t = x; this.v = 0; this.k = stiff; this.d = damp; }
  Spring.prototype.step = function (dt) {
    this.v += (this.t - this.x) * this.k * dt;
    this.v *= Math.exp(-this.d * dt);
    this.x += this.v * dt;
  };

  /* ---- Geometry, measured from the grid ---- */
  var W = 0, H = 0, dpr = 1, k = 1, T = 8, G = 1500, single = true;
  var Z = [], conn = [], laneL = 0, laneR = 0, retY = 0;

  function AY(i) { return Z[i].y + Z[i].h * (single ? 0.46 : 0.5); }   // the flow axis through a stage
  function entryP(i) { return [Z[i].x, AY(i)]; }
  function exitP(i) { return [Z[i].x + Z[i].w, AY(i)]; }

  function measure() {
    var b = board.getBoundingClientRect();
    if (b.width < 10 || b.height < 10) return false;
    W = b.width; H = b.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var stageBottom = [];
    Z = zoneEls.map(function (el, i) {
      var r = el.getBoundingClientRect();
      stageBottom.push(stageEls[i].getBoundingClientRect().bottom - b.top);
      return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height, cx: r.left - b.left + r.width / 2 };
    });
    single = Z.every(function (z) { return Math.abs(z.y - Z[0].y) < 2; });
    var gl = Math.min.apply(null, Z.map(function (z) { return z.x; }));
    var gr = Math.max.apply(null, Z.map(function (z) { return z.x + z.w; }));
    laneL = gl / 2;
    laneR = gr + (W - gr) / 2;
    var m = Math.min.apply(null, Z.map(function (z) { return Math.min(z.w, z.h); }));
    k = clamp(m / 180, 0.7, 1.15);
    T = Math.round(8 * k);
    G = 1500 * k;
    // Connectors: nothing between neighbours on a row; a cable round the edge between rows
    conn = [];
    for (var i = 0; i < 6; i++) {
      var a = Z[i], c = Z[i + 1];
      if (Math.abs(a.y - c.y) < 2) { conn.push([]); continue; }
      var gy = (stageBottom[i] + c.y) / 2;
      conn.push([[laneR, AY(i)], [laneR, gy], [laneL, gy], [laneL, AY(i + 1)]]);
    }
    retY = Z[0].y + Z[0].h * 0.93;
    return true;
  }

  /* ---- Simulation state ---- */
  var scope, assets, oos, scan, gate, bins, bg, rep, code, ret, retQ, tokens, sparks;
  var tracked = null, trackCool = 0, hotStage = -1, clock = 0, liveN = 0, binN = 0;

  function build() {
    var z, i, r, c;
    tokens = []; sparks = []; retQ = []; tracked = null; trackCool = 0;

    /* Scope: in-scope assets inside the orange brackets, two out-of-scope ones outside */
    z = Z[0];
    var tall = z.h > z.w * 1.05;
    var cols = tall ? 3 : 4, rows = tall ? 4 : 3;
    var x0 = z.x + z.w * (tall ? 0.3 : 0.26), x1 = z.x + z.w * (tall ? 0.7 : 0.74);
    var y0 = z.y + z.h * (tall ? 0.2 : 0.24), y1 = z.y + z.h * (single ? 0.68 : 0.76);
    var A = Math.max(6, Math.round(Math.min(14 * k, (x1 - x0) / (cols - 1) * 0.5, (y1 - y0) / (rows - 1) * 0.5)));
    scope = { x0: x0, x1: x1, y0: y0, y1: y1, A: A, cols: cols, rows: rows, dx: (x1 - x0) / (cols - 1) };
    assets = [];
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      assets.push({ x: x0 + scope.dx * c, y: y0 + (y1 - y0) * r / (rows - 1), s: new Spring(1, 300, 9), lit: 0, flag: 0, ok: 0 });
    }
    oos = tall ? [[x1, y0 - A * 2.8], [x0, y1 + A * 2.8]] : [[x0 - A * 2.7, y1], [x1 + A * 2.7, y0]];

    /* Scan: one row of checks per asset row; the probe rasters across them */
    z = Z[1];
    scan = { x0: z.x + z.w * 0.16, x1: z.x + z.w * 0.72, lane: z.x + z.w * 0.86, n: z.w > 150 ? 6 : 5,
             rows: [], flash: [], row: 0, col: -1, t: 0, px: 0 };
    for (r = 0; r < rows; r++) {
      scan.rows.push(assets[r * cols].y);
      scan.flash.push([]);
      for (c = 0; c < scan.n; c++) scan.flash[r].push(0);
    }
    scan.px = scan.x0;

    /* Manual testing: candidates wait in lanes, the tester's probe meets each one */
    z = Z[2];
    gate = { x: z.x + z.w * 0.6, y0: z.y + z.h * 0.14, y1: z.y + z.h * (single ? 0.78 : 0.86),
             inX: z.x + z.w * 0.16, outX: z.x + z.w * 0.86, floor: z.y + z.h * (single ? 0.86 : 0.95),
             lanes: [], used: [], queue: [], cur: null, ph: 0, t: 0, jab: 0 };
    var nl = clamp(Math.floor((gate.y1 - gate.y0) / (T * 3.2)), 3, 7);
    for (i = 0; i < nl; i++) { gate.lanes.push(gate.y0 + (gate.y1 - gate.y0) * (i + 0.5) / nl); gate.used.push(null); }
    gate.p = new Spring(AY(2), 200, 15);

    /* Classification: an assessment point, then four severity bins with trapdoors */
    z = Z[3];
    var bx0 = z.x + z.w * 0.12, bx1 = z.x + z.w * 0.88, gap = Math.max(3, z.w * 0.025);
    var bw = (bx1 - bx0 - gap * 3) / 4;
    var tb = Math.max(5, Math.min(Math.round(T * 1.15), Math.floor(bw * 0.5)));
    bg = { top: z.y + z.h * (single ? 0.5 : 0.44), bot: z.y + z.h * (single ? 0.8 : 0.84), tb: tb, slot: tb + 3,
           ax: z.x + z.w * 0.5, ay: z.y + z.h * (single ? 0.2 : 0.17), inX: z.x + z.w * 0.06, outX: z.x + z.w * 0.94,
           q: [], t: 0 };
    bg.conv = bg.bot + tb + 3;
    bins = [];
    for (i = 0; i < 4; i++) bins.push({ x: bx0 + i * (bw + gap), w: bw, cx: bx0 + i * (bw + gap) + bw / 2, items: [], flash: 0 });

    /* Report: a sheet whose rows fill as findings are written in */
    z = Z[4];
    var maxH = z.h * (single ? 0.64 : 0.86);
    var sw = Math.min(z.w * 0.64, maxH / 1.12), sh = Math.min(maxH, sw * 1.36);
    rep = { x: z.cx - sw / 2, y: AY(4) - sh / 2, w: sw, h: sh, hb: Math.max(9, sh * 0.11), rows: [] };
    rep.chip = rep.x + 6 * k + T / 2;
    rep.bar = rep.chip + T / 2 + 6 * k;
    rep.barW = rep.x + sw - 7 * k - rep.bar;
    var nr = clamp(Math.floor((sh - rep.hb - 8) / (T * 2.3)), 3, 7), rh = (sh - rep.hb - 8) / nr;
    for (i = 0; i < nr; i++) rep.rows.push({ y: rep.y + rep.hb + 4 + rh * (i + 0.5), st: 0, t: 0, len: 0, tok: null, at: 0 });

    /* Remediation: a block of code; the vulnerable line is replaced by the fix */
    z = Z[5];
    var c0 = z.y + z.h * 0.17, c1 = z.y + z.h * (single ? 0.72 : 0.84);
    var nc = clamp(Math.floor((c1 - c0) / (T * 2)) + 1, 4, 9);
    code = { gx: z.x + z.w * 0.13, x0: z.x + z.w * 0.25, x1: z.x + z.w * 0.86, top: c0 - T * 1.5, outX: z.x + z.w * 0.94,
             lines: [], busy: 0 };
    for (i = 0; i < nc; i++) {
      code.lines.push({ y: c0 + (c1 - c0) * i / (nc - 1), ind: (Math.random() * 3) | 0, len: rand(0.4, 1), nlen: 0, st: 0, t: 0, tok: null });
    }

    /* Retest: a reticle that locks onto each fix, with a short queue in front of it */
    z = Z[6];
    var R = Math.min(z.w * 0.4, z.h * 0.44, 100 * k);
    ret = { x: z.cx, y: AY(6), r: R, o: new Spring(R / 2, 230, 12), tok: null, ph: 0, t: 0, fail: 0 };
    ret.stage = function (i) { return [ret.x - R / 2 - 14 * k - i * (T + 6 * k), ret.y]; };
  }

  /* ---- Tokens: the findings ---- */
  function token(x, y, kind) {
    var t = { x: x, y: y, lx: x, ly: y, kind: kind, sev: -1, a: 1, rot: 0, sz: T, szT: T, s: new Spring(0, 320, 10),
              v: 0, vmax: 0, mode: 'idle', path: null, pi: 0, cb: null, t: 0, m: 0 };
    t.s.t = 1;   // pops in past full size and settles
    tokens.push(t);
    return t;
  }
  function go(t, path, cb, speed) { t.path = path; t.pi = 0; t.mode = 'path'; t.cb = cb; t.v = 0; t.vmax = 150 * k * (speed || 1); }
  function stepPath(t, dt) {
    t.v = Math.min(t.vmax, t.v + t.vmax * 3 * dt);
    if (t.pi === t.path.length - 1) {   // ease into the last point
      var e = t.path[t.pi];
      t.v = Math.min(t.v, Math.max(24 * k, (Math.abs(e[0] - t.x) + Math.abs(e[1] - t.y)) * 7));
    }
    var d = t.v * dt;
    while (d > 0 && t.pi < t.path.length) {
      var p = t.path[t.pi], dx = p[0] - t.x, dy = p[1] - t.y, L = Math.sqrt(dx * dx + dy * dy);
      if (L <= d) { t.x = p[0]; t.y = p[1]; d -= L; t.pi++; }
      else { t.x += dx / L * d; t.y += dy / L * d; d = 0; }
    }
    if (t.pi >= t.path.length) { t.mode = 'idle'; var cb = t.cb; t.cb = null; if (cb) cb(t); }
  }
  function burst(x, y, rgb, n, dir) {
    for (var i = 0; i < n; i++) {
      var ang = dir === undefined ? (i / n) * Math.PI * 2 + Math.PI / 4 : dir + (i - (n - 1) / 2) * 0.55;
      sparks.push({ x: x, y: y, ang: ang, life: 1, rgb: rgb });
    }
  }

  /* Scope + scan */
  function cellX(c) { return scan.x0 + (scan.x1 - scan.x0) * c / (scan.n - 1); }
  function stepScan(dt) {
    scan.t += dt;
    while (scan.t >= 0.13) {
      scan.t -= 0.13;
      if (++scan.col >= scan.n) {
        scan.col = 0;
        scan.row = (scan.row + 1) % scan.rows.length;
        for (var c = 0; c < scope.cols; c++) { var a = assets[scan.row * scope.cols + c]; a.lit = 1; a.s.x = 1.22; }
      }
      scan.flash[scan.row][scan.col] = 1;
      if (Math.random() < (liveN < 15 && binN < 7 ? 0.15 : 0.02)) spawn(scan.row, scan.col);
    }
    scan.px += (cellX(Math.max(0, scan.col)) - scan.px) * Math.min(1, dt * 30);
  }
  function spawn(r, c) {
    var ai = r * scope.cols + ((Math.random() * scope.cols) | 0);
    assets[ai].flag = 1; assets[ai].s.x = 1.4;
    var t = token(cellX(c), scan.rows[r], 'cand');
    t.asset = ai; t.fp = Math.random() < FALSE_POSITIVE; t.mode = 'hold'; t.t = 0.35;
    if (!tracked && trackCool <= 0 && !t.fp) tracked = t;
  }
  function freeLane() {
    var f = [];
    for (var i = 0; i < gate.used.length; i++) if (!gate.used[i]) f.push(i);
    return f.length ? f[(Math.random() * f.length) | 0] : -1;
  }
  function leaveScan(t) {
    var li = freeLane();
    if (li < 0) { t.t = 0.25; return; }
    gate.used[li] = t; t.lane = li;
    var ly = gate.lanes[li];
    go(t, [[scan.lane, t.y], [scan.lane, AY(1)], exitP(1)].concat(conn[1], [entryP(2), [gate.inX, AY(2)], [gate.inX, ly], [gate.x - T - 6 * k, ly]]),
       function (tk) { tk.mode = 'wait'; gate.queue.push(tk); });
  }

  /* Manual testing gate */
  function stepGate(dt) {
    if (!gate.cur && gate.queue.length) { gate.cur = gate.queue.shift(); gate.ph = 1; gate.t = 0; gate.p.t = gate.cur.y; }
    if (gate.cur) {
      gate.t += dt;
      if (gate.ph === 1 && ((gate.t > 0.3 && Math.abs(gate.p.x - gate.cur.y) < 1.5) || gate.t > 0.9)) { gate.ph = 2; gate.t = 0; gate.jab = 1; }
      else if (gate.ph === 2 && gate.t > 0.2) { decide(gate.cur); gate.cur = null; gate.ph = 0; }
    }
    gate.p.step(dt);
    gate.jab = Math.max(0, gate.jab - dt * 4);
  }
  function decide(t) {
    gate.used[t.lane] = null;
    if (t.fp) {   // false positive: knocked back, it tumbles, bounces and fades
      t.kind = 'fp'; t.mode = 'ball'; t.bn = 0;
      t.vx = -rand(60, 130) * k; t.vy = -rand(150, 240) * k; t.spin = -rand(4, 9);
      burst(gate.x - 4 * k, t.y, STO, 3, Math.PI);
    } else {      // confirmed: it turns orange and passes the gate
      t.kind = 'vuln'; t.s.x = 1.9; t.s.v = 0;
      burst(gate.x, t.y, SIG, 6);
      go(t, [[gate.x + T + 6 * k, t.y], [gate.outX, t.y], [gate.outX, AY(2)], exitP(2)].concat(conn[2], [entryP(3), [bg.inX, AY(3)], [bg.inX, bg.ay], [bg.ax, bg.ay]]),
         function (tk) { tk.mode = 'assess'; tk.t = 0; tk.sev = pick(SEV_ODDS); bg.q.push(tk); });
    }
  }
  function stepBall(t, dt) {
    var wall = Z[2].x + T;
    t.vy += G * dt; t.x += t.vx * dt; t.y += t.vy * dt; t.rot += t.spin * dt;
    if (t.x < wall) { t.x = wall; t.vx = -t.vx * 0.6; }
    if (t.y > gate.floor) {
      t.y = gate.floor; t.vy = -t.vy * 0.46; t.vx *= 0.7; t.spin *= 0.6; t.bn++;
      if (t.bn > 2 || Math.abs(t.vy) < 50 * k) { t.vy = 0; t.mode = 'fade'; }
    }
  }

  /* Risk classification: assess, then throw into a bin */
  function stepAssess(dt) {
    for (var i = 0; i < bg.q.length; i++) {
      var t = bg.q[i];
      if (i === 0) {
        t.t += dt;
        t.x += (bg.ax - t.x) * Math.min(1, dt * 12);
        if (t.t > 0.6) { bg.q.shift(); launch(t); i--; }
      } else {
        t.x += (bg.ax - i * (T + 5 * k) - t.x) * Math.min(1, dt * 10);
      }
    }
  }
  function slotY(t) { return bg.bot - 1.5 - (t.bin.items.indexOf(t) + 0.5) * bg.slot; }
  function launch(t) {
    var b = bins[t.sev];
    b.items.push(t); t.bin = b; t.mode = 'fly'; t.bn = 0; t.szT = bg.tb;
    var ty = slotY(t), tf = rand(0.48, 0.6);
    t.vx = (b.cx - t.x) / tf;
    t.vy = (ty - t.y - 0.5 * G * tf * tf) / tf;
  }
  function stepFly(t, dt) {
    var ty = slotY(t);
    t.vy += G * dt; t.x += t.vx * dt; t.y += t.vy * dt;
    if (t.vy > 0 && t.y >= ty) {
      t.y = ty; t.x = t.bin.cx; t.vx = 0;
      if (!t.bn) { t.bin.flash = 1; burst(t.x, ty + bg.tb / 2, PAP, 2, 0); burst(t.x, ty + bg.tb / 2, PAP, 1, Math.PI); }
      t.bn++; t.vy = -t.vy * 0.42;
      if (Math.abs(t.vy) < 38 * k) { t.vy = 0; t.mode = 'binned'; }
    }
  }
  function stepBins(dt) {
    bg.t += dt;
    if (bg.t < (binN > 6 ? 0.6 : 1.05)) return;
    var row = null;
    for (var i = 0; i < rep.rows.length; i++) if (!rep.rows[i].st) { row = rep.rows[i]; break; }
    if (!row) return;
    for (i = 0; i < 4; i++) {   // strict priority: critical, then high, medium, low
      var b = bins[i];
      if (!b.items.length) continue;
      if (b.items[0].mode !== 'binned') return;
      release(b.items.shift(), row);
      bg.t = 0;
      return;
    }
  }
  function release(t, row) {
    row.st = 1; row.tok = t; t.bin = null; t.szT = T;
    go(t, [[t.x, bg.conv], [bg.outX, bg.conv], [bg.outX, AY(3)], exitP(3)].concat(conn[3], [entryP(4), [rep.x - 10 * k, AY(4)], [rep.x - 10 * k, row.y], [rep.chip, row.y]]),
       function (tk) { tk.mode = 'dock'; tk.s.x = 1.6; row.st = 2; row.t = 0; row.at = clock; row.len = rand(0.45, 1) * rep.barW; });
  }

  /* Report → remediation */
  function freeLine() {
    var f = [], g = [];
    code.lines.forEach(function (l) { if (l.st === 0) f.push(l); else if (l.st === 2) g.push(l); });
    var p = f.length ? f : g;
    return p.length ? p[(Math.random() * p.length) | 0] : null;
  }
  function stepReport(dt) {
    var oldest = null;
    rep.rows.forEach(function (r) {
      r.t += dt;
      if (r.st === 3 && r.t > 0.5) { r.st = 0; r.t = 0; }
      if (r.st === 2 && r.t > 1.7 && (!oldest || r.at < oldest.at)) oldest = r;
    });
    if (!oldest || code.busy >= 2) return;
    var line = freeLine();
    if (!line) return;
    var t = oldest.tok, y = oldest.y;
    oldest.tok = null; oldest.st = 3; oldest.t = 0;
    code.busy++; line.st = -1;
    go(t, [[rep.x + rep.w + 10 * k, y], [rep.x + rep.w + 10 * k, AY(4)], exitP(4)].concat(conn[4], [entryP(5), [code.gx, AY(5)], [code.gx, line.y]]),
       function (tk) { atCode(tk, line); });
  }
  function atCode(t, line) { t.mode = 'patch'; t.s.x = 1.4; line.st = 1; line.t = 0; line.tok = t; line.nlen = rand(0.4, 1); }
  function stepCode(dt) {
    code.lines.forEach(function (l) {
      l.t += dt;
      if (l.st === 1) {
        var t = l.tok;
        t.m = clamp((l.t - 0.8) / 0.4, 0, 1);
        if (t.m > 0 && t.kind === 'vuln') t.kind = 'fixed';
        if (l.t > 1.3 && retQ.length < 2) {
          l.st = 2; l.t = 0; l.len = l.nlen; l.tok = null; code.busy--;
          retQ.push(t); t.ready = false;
          var s = ret.stage(retQ.length - 1);
          go(t, [[code.gx, code.top], [code.outX, code.top], [code.outX, AY(5)], exitP(5)].concat(conn[5], [entryP(6), s]),
             function (tk) { tk.mode = 'wait'; tk.ready = true; });
        }
      } else if (l.st === 2 && l.t > 3) {
        l.st = 0;
      }
    });
  }

  /* Retest */
  function stepRet(dt) {
    ret.o.step(dt);
    ret.fail = Math.max(0, ret.fail - dt * 1.5);
    retQ.forEach(function (t, i) {   // the waiting fixes close up the queue
      if (t.ready) { var s = ret.stage(i); t.x += (s[0] - t.x) * Math.min(1, dt * 10); t.y += (s[1] - t.y) * Math.min(1, dt * 10); }
    });
    if (ret.ph === 0 && retQ.length && retQ[0].ready) {
      var t = retQ.shift();
      ret.tok = t; ret.ph = -1;
      go(t, [[ret.x, ret.y]], function (tk) { tk.mode = 'dock'; ret.ph = 1; ret.t = 0; ret.o.t = T * 1.1 + 3 * k; });
    } else if (ret.ph === 1) {
      ret.t += dt;
      if (ret.t > 0.9) result();
    } else if (ret.ph === 2) {
      ret.t += dt;
      if (ret.t > 0.25) ret.ph = 0;
    }
  }
  function result() {
    var t = ret.tok, line = freeLine();
    ret.tok = null; ret.ph = 2; ret.t = 0; ret.o.t = ret.r / 2;
    if (line && Math.random() < RETEST_FAIL) {   // the fix did not hold: back to remediation
      ret.fail = 1; t.kind = 'vuln'; t.m = 0; t.s.x = 1.8;
      line.st = -1; code.busy++;
      go(t, [entryP(6)].concat(conn[5].slice().reverse(), [exitP(5), [code.outX, AY(5)], [code.outX, code.top], [code.gx, code.top], [code.gx, line.y]]),
         function (tk) { atCode(tk, line); });
      return;
    }
    t.kind = 'ok'; t.s.x = 1.8;
    ret.o.v = 260 * k;   // the brackets spring open past rest
    burst(ret.x, ret.y, PAP, 4);
    if (single) {        // verified: it travels home along the return lane
      var a = assets[t.asset];
      t.home = true;
      go(t, [[ret.x, retY], [a.x + scope.dx / 2, retY], [a.x + scope.dx / 2, a.y], [a.x + scope.A / 2 + 2, a.y]],
         function (tk) { verify(tk.asset); tk.dead = true; }, 0.85);
    } else {
      t.mode = 'rise';
      verify(t.asset);
    }
  }
  function verify(i) { var a = assets[i]; a.ok = 1; a.s.x = 1.5; burst(a.x, a.y, PAP, 4); }

  /* ---- One simulation step ---- */
  function step(dt) {
    var i, t;
    clock += dt;
    liveN = 0;
    for (i = 0; i < tokens.length; i++) { t = tokens[i]; if (t.kind === 'cand' || t.kind === 'vuln' || t.kind === 'fixed') liveN++; }
    binN = bins[0].items.length + bins[1].items.length + bins[2].items.length + bins[3].items.length;

    stepScan(dt); stepGate(dt); stepAssess(dt); stepBins(dt); stepReport(dt); stepCode(dt); stepRet(dt);

    for (i = 0; i < tokens.length; i++) {
      t = tokens[i];
      switch (t.mode) {
        case 'hold': t.t -= dt; if (t.t <= 0) leaveScan(t); break;
        case 'path': stepPath(t, dt); break;
        case 'ball': stepBall(t, dt); break;
        case 'fade': t.a -= dt * 1.8; if (t.a <= 0) t.dead = true; break;
        case 'fly': stepFly(t, dt); break;
        case 'binned': if (t.y < slotY(t) - 0.5) { t.mode = 'fly'; t.vx = 0; t.vy = 0; t.bn = 1; } break;
        case 'rise': t.y -= 26 * k * dt; t.a -= dt * 1.3; if (t.a <= 0) t.dead = true; break;
      }
      t.s.step(dt);
      t.sz += (t.szT - t.sz) * Math.min(1, dt * 8);
      t.lx += (t.x - t.lx) * Math.min(1, dt * 14);
      t.ly += (t.y - t.ly) * Math.min(1, dt * 14);
    }
    tokens = tokens.filter(function (tk) { return !tk.dead; });

    if (tracked && (tracked.dead || tracked.kind === 'fp')) { tracked = null; trackCool = 1.4; }
    trackCool -= dt;

    assets.forEach(function (a) {
      a.s.step(dt);
      a.lit = Math.max(0, a.lit - dt * 1.2);
      a.flag = Math.max(0, a.flag - dt * 0.7);
      a.ok = Math.max(0, a.ok - dt * 0.22);
    });
    scan.flash.forEach(function (row) { for (var c = 0; c < row.length; c++) row[c] = Math.max(0, row[c] - dt * 2.5); });
    bins.forEach(function (b) { b.flash = Math.max(0, b.flash - dt * 2.5); });
    for (i = 0; i < sparks.length; i++) sparks[i].life -= dt * 3;
    sparks = sparks.filter(function (p) { return p.life > 0; });
  }

  /* ---- Drawing ---- */
  function line(x1, y1, x2, y2, rgb, a, w) {
    if (x1 === x2) x1 = x2 = Math.round(x1) + 0.5;   // keep hairlines crisp
    if (y1 === y2) y1 = y2 = Math.round(y1) + 0.5;
    ctx.strokeStyle = col(rgb, a); ctx.lineWidth = w || 1;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function poly(pts, rgb, a, w) {
    ctx.strokeStyle = col(rgb, a); ctx.lineWidth = w || 1;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  function sq(x, y, s, fill, stroke, w) {
    var h = s / 2;
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x - h, y - h, s, s); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w || 1; ctx.strokeRect(x - h, y - h, s, s); }
  }
  function bar(x, y, w, h, fill) { if (w > 0) { ctx.fillStyle = fill; ctx.fillRect(x, y - h / 2, w, h); } }
  function corners(x, y, hw, hh, L, rgb, a, w) {
    ctx.strokeStyle = col(rgb, a); ctx.lineWidth = w || 1.5;
    ctx.beginPath();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) {
      var cx = x + s[0] * hw, cy = y + s[1] * hh;
      ctx.moveTo(cx - s[0] * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - s[1] * L);
    });
    ctx.stroke();
  }
  function chevron(x, y, ang, s, rgb, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.strokeStyle = col(rgb, a); ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(-s / 2, -s); ctx.lineTo(s / 2, 0); ctx.lineTo(-s / 2, s); ctx.stroke();
    ctx.restore();
  }
  function tick(x, y, s, rgb, a, w) {
    ctx.strokeStyle = col(rgb, a); ctx.lineWidth = w || 1.5;
    ctx.beginPath(); ctx.moveTo(x - s * 0.45, y); ctx.lineTo(x - s * 0.1, y + s * 0.35); ctx.lineTo(x + s * 0.5, y - s * 0.35); ctx.stroke();
  }

  function drawRails() {
    var i, ch = 3.5 * k;
    ctx.setLineDash([2 * k, 5 * k]);
    if (single) {
      for (i = 1; i < 7; i++) line(Z[i].x - 14 * k, AY(i), Z[i].x + 14 * k, AY(i), PAP, 0.16);
      line(Z[6].cx, ret.y + ret.r / 2 + 14 * k, Z[6].cx, retY, PAP, 0.12);
      line(scope.x0 + scope.dx / 2, retY, Z[6].cx, retY, PAP, 0.12);
    } else {
      for (i = 0; i < 6; i++) if (conn[i].length) poly([exitP(i)].concat(conn[i], [entryP(i + 1)]), PAP, 0.16);
    }
    ctx.setLineDash([]);
    if (single) {
      for (i = 1; i < 7; i++) chevron(Z[i].x, AY(i), 0, ch, PAP, 0.4);
      for (i = 1; i < 7; i++) chevron(Z[i].cx - Z[i].w * 0.25, retY, Math.PI, ch * 0.8, PAP, 0.22);
    } else {
      for (i = 0; i < 6; i++) if (conn[i].length) chevron(Z[i + 1].x - 4 * k, AY(i + 1), 0, ch, PAP, 0.4);
    }
  }

  function drawScope() {
    var s = scope, A = s.A, pad = A * 1.15, r;
    corners((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.x1 - s.x0) / 2 + pad, (s.y1 - s.y0) / 2 + pad, A * 1.1, SIG, 0.9, 1.5);
    ctx.setLineDash([2, 3]);
    oos.forEach(function (p) { sq(p[0], p[1], A, null, col(PAP, 0.22), 1); });
    ctx.setLineDash([]);
    for (r = 0; r < s.rows; r++) {   // each asset row is wired to its row of checks
      var on = r === scan.row;
      line(s.x1 + A / 2 + 5 * k, scan.rows[r], scan.x0 - 7 * k, scan.rows[r], on ? SIG : PAP, on ? 0.4 : 0.07);
    }
    assets.forEach(function (a) {
      var z = A * a.s.x;
      sq(a.x, a.y, z, col(INK, 1), null);
      if (a.ok > 0) sq(a.x, a.y, z, col(PAP, a.ok * 0.92), null);
      sq(a.x, a.y, z, null, col(PAP, 0.36 + a.lit * 0.5), 1.25);
      if (a.ok > 0.25) tick(a.x, a.y, z * 0.55, INK, Math.min(1, a.ok * 2), 1.5);
      if (a.flag > 0) sq(a.x + z / 2, a.y - z / 2, Math.max(3, A * 0.34), col(SIG, a.flag), null);
    });
  }

  function drawScan() {
    var r, c, last = scan.rows.length - 1;
    for (r = 0; r <= last; r++) for (c = 0; c < scan.n; c++) {
      var f = scan.flash[r][c];
      sq(cellX(c), scan.rows[r], (3 + f * 2) * k, col(PAP, 0.2 + f * 0.6), null);
    }
    ctx.setLineDash([2 * k, 4 * k]);
    line(scan.lane, scan.rows[0], scan.lane, scan.rows[last], PAP, 0.1);
    ctx.setLineDash([]);
    var py = scan.rows[scan.row];
    line(scan.x0, py, scan.px, py, SIG, 0.35, 1.5);
    sq(scan.px, py, T + 5 * k, null, col(SIG, 0.95), 1.5);
  }

  function drawGate() {
    var g = gate, o = 2.5 * k, ps = 12 * k, py = g.p.x;
    line(Z[2].x + Z[2].w * 0.06, g.floor + T / 2 + 1, g.x - o - 6 * k, g.floor + T / 2 + 1, PAP, 0.1);   // where rejects land
    line(g.x - o, g.y0, g.x - o, g.y1, PAP, 0.22);
    line(g.x + o, g.y0, g.x + o, g.y1, PAP, 0.22);
    g.lanes.forEach(function (y) { line(g.x - o - 6 * k, y, g.x - o - 2 * k, y, PAP, 0.22); });
    if (g.cur && g.jab > 0) line(g.cur.x + T / 2 + 2, g.cur.y, g.x - o, g.cur.y, SIG, g.jab, 1.5);
    sq(g.x, py, ps, col(INK, 1), col(SIG, 1), 1.5);
    line(g.x - ps * 0.28, py, g.x + ps * 0.28, py, SIG, 1, 1.25);
    line(g.x, py - ps * 0.28, g.x, py + ps * 0.28, SIG, 1, 1.25);
  }

  function drawBins() {
    var gy = bg.ay + T * 1.6 + 2 * k, gs = 4 * k, gx0 = 8 * k;
    var head = bg.q[0], gi = head ? (head.t < 0.4 ? ((head.t * 16) | 0) % 4 : head.sev) : -1;
    for (var i = 0; i < 4; i++) {   // the assessment gauge: it settles on a rating
      var gx = bg.ax + (i - 1.5) * gx0;
      sq(gx, gy, gs, col(SEV[i][0], SEV[i][1]), null);
      if (i === gi) sq(gx, gy, gs + 4 * k, null, col(PAP, 0.9), 1);
    }
    if (head) corners(head.x, head.y, T * 0.9, T * 0.9, 3 * k, PAP, 0.6, 1);
    bins.forEach(function (b, n) {
      var x0 = b.x, x1 = b.x + b.w, door = bg.tb / 2 + 2 * k;
      ctx.strokeStyle = col(PAP, 0.22 + b.flash * 0.5); ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x0) + 0.5, bg.top); ctx.lineTo(Math.round(x0) + 0.5, Math.round(bg.bot) + 0.5); ctx.lineTo(b.cx - door, Math.round(bg.bot) + 0.5);
      ctx.moveTo(b.cx + door, Math.round(bg.bot) + 0.5); ctx.lineTo(Math.round(x1) - 0.5, Math.round(bg.bot) + 0.5); ctx.lineTo(Math.round(x1) - 0.5, bg.top);
      ctx.stroke();
      ctx.fillStyle = col(SEV[n][0], SEV[n][1]);
      ctx.fillRect(x0, bg.bot + 4 * k, b.w, 2 * k);
    });
  }

  function drawReport() {
    var p = rep, o = 4 * k;
    ctx.fillStyle = '#060B1A';
    ctx.fillRect(p.x + o, p.y + o, p.w, p.h);
    ctx.strokeStyle = col(PAP, 0.1); ctx.lineWidth = 1; ctx.strokeRect(p.x + o + 0.5, p.y + o + 0.5, p.w, p.h);
    ctx.fillStyle = '#060B1A';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = col(PAP, 0.26); ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w, p.h);
    ctx.fillStyle = col(PAP, 0.06); ctx.fillRect(p.x, p.y, p.w, p.hb);
    sq(p.x + 6 * k + 2.5 * k, p.y + p.hb / 2, 5 * k, col(SIG, 1), null);
    bar(p.x + 15 * k, p.y + p.hb / 2, p.w * 0.42, 2 * k, col(PAP, 0.3));
    p.rows.forEach(function (r) {
      bar(p.bar, r.y, p.barW * 0.86, 2 * k, col(PAP, 0.06));
      sq(p.chip, r.y, T, null, col(PAP, 0.1), 1);
      if (r.st === 2 || r.st === 3) {
        var g = r.st === 2 ? Math.min(1, r.t / 0.5) : 1, a = r.st === 3 ? 1 - r.t / 0.5 : 1;
        bar(p.bar, r.y, r.len * easeOut(g), 2 * k, col(PAP, 0.38 * a));
      }
    });
  }

  function drawCode() {
    var c = code, bh = Math.max(2, 2.4 * k), first = c.lines[0].y, lastY = c.lines[c.lines.length - 1].y;
    line(c.x0 - 7 * k, first - T, c.x0 - 7 * k, lastY + T, PAP, 0.08);
    c.lines.forEach(function (l) {
      var x = c.x0 + l.ind * 7 * k, full = c.x1 - x, w = full * l.len, mx = c.x0 - 3.5 * k, ms = 2 * k;
      if (l.st === 1) {
        if (l.t < 0.45) {   // the vulnerable line lights up
          bar(x, l.y, w, bh, col(SIG, 0.3 + (l.t / 0.45) * 0.6));
          line(mx - ms, l.y, mx + ms, l.y, SIG, 1, 1.25);
        } else {            // it slides out; the fix writes in
          var e = easeOut(clamp((l.t - 0.45) / 0.55, 0, 1));
          bar(x - e * 14 * k, l.y, w, bh, col(SIG, 0.9 * (1 - e)));
          bar(x, l.y, full * l.nlen * e, bh, col(PAP, 0.75));
          line(mx - ms, l.y, mx + ms, l.y, PAP, e, 1.25);
          line(mx, l.y - ms, mx, l.y + ms, PAP, e, 1.25);
        }
      } else if (l.st === 2) {
        bar(x, l.y, w, bh, col(PAP, 0.16 + 0.6 * Math.max(0, 1 - l.t / 3)));
      } else {
        bar(x, l.y, w, bh, col(PAP, 0.16));
      }
    });
  }

  function drawRet() {
    var r = ret, o = Math.max(T, r.o.x), L = clamp(o * 0.5, 4 * k, 12 * k), hair = r.r / 2 + 10 * k;
    line(r.x - hair, r.y, r.x - o - 3 * k, r.y, PAP, 0.08);
    line(r.x + o + 3 * k, r.y, r.x + hair, r.y, PAP, 0.08);
    line(r.x, r.y - hair, r.x, r.y - o - 3 * k, PAP, 0.08);
    line(r.x, r.y + o + 3 * k, r.x, r.y + hair, PAP, 0.08);
    var locked = r.ph === 1 || r.ph === -1 && r.tok && r.tok.mode === 'dock';
    corners(r.x, r.y, o, o, L, locked || r.fail > 0 ? SIG : PAP, locked ? 1 : r.fail > 0 ? Math.max(0.5, r.fail) : 0.5, 1.5);
    if (r.ph === 1 && r.t > 0.15) {   // the retest sweep
      var y = r.y - o + 2 * o * (((r.t - 0.15) * 1.8) % 1);
      line(r.x - o, y, r.x + o, y, SIG, 0.6, 1);
    }
  }

  function tokenRGB(t) { return t.kind === 'vuln' ? SIG : t.kind === 'fp' ? STO : PAP; }
  function drawTokens() {
    tokens.forEach(function (t) {
      var s = t.sz * Math.max(0, t.s.x), a = t.a, sv = t.sev < 0 ? 0 : t.sev;
      if (s <= 0.5 || a <= 0) return;
      var dx = t.x - t.lx, dy = t.y - t.ly;
      if (dx * dx + dy * dy > 4) line(t.lx, t.ly, t.x, t.y, tokenRGB(t), 0.22 * a, Math.max(1.5, s * 0.45));   // motion streak
      ctx.save();
      ctx.translate(t.x, t.y);
      if (t.rot) ctx.rotate(t.rot);
      if (t.kind === 'cand') {
        sq(0, 0, s, col(INK, 1), col(PAP, 0.9), 1.5);
      } else if (t.kind === 'fp') {
        sq(0, 0, s, col(INK, a), col(STO, 0.85 * a), 1.25);
        line(-s / 2, s / 2, s / 2, -s / 2, STO, 0.85 * a, 1);
      } else if (t.kind === 'vuln') {
        sq(0, 0, s, col(INK, 1), null);
        sq(0, 0, s, col(SEV[sv][0], SEV[sv][1]), col(SEV[sv][0], Math.min(1, SEV[sv][1] + 0.4)), 1.25);
      } else if (t.kind === 'fixed') {   // orange drains out, a white tick writes in
        sq(0, 0, s, col(INK, 1), null);
        if (t.m < 1) sq(0, 0, s, col(SEV[sv][0], SEV[sv][1] * (1 - t.m)), null);
        sq(0, 0, s, null, col(PAP, 0.15 + 0.85 * t.m), 1.25);
        if (t.m > 0.5) tick(0, 0, s * 0.62, PAP, (t.m - 0.5) * 2, 1.25);
      } else if (t.kind === 'ok') {
        sq(0, 0, s, col(PAP, a), null);
        tick(0, 0, s * 0.62, INK, a, 1.5);
      }
      ctx.restore();
    });
    if (tracked) {   // the finding the stage labels are following
      var h = tracked.sz * Math.max(0.6, tracked.s.x) / 2 + 4 * k;
      corners(tracked.x, tracked.y, h, h, 3 * k, PAP, 0.95, 1.25);
    }
  }

  function drawSparks() {
    sparks.forEach(function (p) {
      var e = 1 - p.life, r0 = (4 + e * 10) * k, r1 = r0 + 5 * k * p.life, cx = Math.cos(p.ang), sy = Math.sin(p.ang);
      line(p.x + cx * r0, p.y + sy * r0, p.x + cx * r1, p.y + sy * r1, p.rgb, p.life, 1.5);
    });
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    drawRails(); drawScope(); drawScan(); drawGate(); drawBins(); drawReport(); drawCode(); drawRet();
    drawTokens(); drawSparks();
  }

  /* Stage labels follow the tracked finding; Scope lights between findings */
  function zoneAt(x, y) {
    for (var i = 0; i < 7; i++) { var z = Z[i]; if (x >= z.x - 0.5 && x <= z.x + z.w + 0.5 && y >= z.y && y <= z.y + z.h) return i; }
    return -1;
  }
  function applyStage() {
    var s = 0;
    if (tracked) { s = tracked.home ? 6 : zoneAt(tracked.x, tracked.y); if (s < 0) s = hotStage; }
    if (s === hotStage) return;
    if (hotStage >= 0) stageEls[hotStage].classList.remove('is-hot');
    if (s >= 0) stageEls[s].classList.add('is-hot');
    hotStage = s;
  }

  /* ---- Run only on screen, unpaused, in a visible tab ---- */
  var running = false, raf = 0, last = 0, onScreen = false, paused = reduce, ready = false;

  function frame(now) {
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    var n = Math.max(1, Math.ceil(dt / 0.017));
    for (var i = 0; i < n; i++) step(dt / n);
    draw();
    applyStage();
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
    build();
    // Start mid-engagement so the board is never empty; reduced motion keeps this one frame
    for (var t = 0; t < 24; t += 1 / 60) step(1 / 60);
    draw();
    applyStage();
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
