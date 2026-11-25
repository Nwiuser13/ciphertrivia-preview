/* ==========================================================================
   Signature animations — the coded line-art on the service pages (heroes,
   wide boards, explorer panels). Each visual is a container
   [data-sig="10"] (cycle length in seconds) whose parts carry their own
   timing in seconds, so the story is readable in the markup:
     data-fx="fade|hide|pop|draw|grow|growy|slide|move"
     data-at="2.4"   when the part starts
     data-len="0.6"  how long its entrance takes (default 0.5)
     data-out="9.2"  when it resets for the next loop (default 92 % of the cycle)
     move: data-path="#id" — travels along that <path> between at and at+len
   pop      scales in past full size and settles (the bounce)
   draw     strokes a path with pathLength="1"
   grow(y)  scales a bar in from its left (bottom) edge
   hide     a part that is there at the start and goes away at "at"
   slide    starts offset by data-dx / data-dy and slides into place (back at "out")
   One Web Animations timeline per container keeps the parts in sync. A
   visual plays only while on screen and, inside an explorer, only while its
   frame is showing (and starts from the top each time it is shown). Reduced
   motion and no-JS get the finished picture (CSS: .sig-still).
   ========================================================================== */
(function () {
  'use strict';

  var boxes = Array.prototype.slice.call(document.querySelectorAll('[data-sig]'));
  if (!boxes.length) return;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (reduce || !Element.prototype.animate) {
    boxes.forEach(function (box) { box.classList.add('sig-still'); });
    return;
  }

  var EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
  function num(el, name, d) { var v = parseFloat(el.getAttribute(name)); return isNaN(v) ? d : v; }

  function keyframes(el, D) {
    var fx = el.getAttribute('data-fx');
    var at = num(el, 'data-at', 0), len = num(el, 'data-len', 0.5), out = num(el, 'data-out', D * 0.92);
    var fade = Math.min(0.35, D * 0.035);
    function o(t) { return Math.max(0, Math.min(1, t / D)); }
    var a = o(at), b = Math.max(a, o(at + len)), c = Math.max(b, o(out)), d = Math.max(c, o(out + fade));
    var m = a + (b - a) * 0.62;

    switch (fx) {
      case 'fade':
        return [{ opacity: 0, offset: 0 }, { opacity: 0, offset: a, easing: EASE }, { opacity: 1, offset: b },
                { opacity: 1, offset: c }, { opacity: 0, offset: d }, { opacity: 0, offset: 1 }];
      case 'hide':
        return [{ opacity: 1, offset: 0 }, { opacity: 1, offset: a }, { opacity: 0, offset: b },
                { opacity: 0, offset: c }, { opacity: 1, offset: d }, { opacity: 1, offset: 1 }];
      case 'pop':
        return [{ opacity: 0, transform: 'scale(0)', offset: 0 }, { opacity: 0, transform: 'scale(0)', offset: a },
                { opacity: 1, transform: 'scale(1.28)', offset: m }, { opacity: 1, transform: 'scale(0.94)', offset: m + (b - m) * 0.55 },
                { opacity: 1, transform: 'scale(1)', offset: b }, { opacity: 1, transform: 'scale(1)', offset: c },
                { opacity: 0, transform: 'scale(1)', offset: d }, { opacity: 0, transform: 'scale(0)', offset: 1 }];
      case 'draw':
        return [{ strokeDashoffset: 1, opacity: 1, offset: 0 }, { strokeDashoffset: 1, opacity: 1, offset: a, easing: EASE },
                { strokeDashoffset: 0, opacity: 1, offset: b }, { strokeDashoffset: 0, opacity: 1, offset: c },
                { strokeDashoffset: 0, opacity: 0, offset: d }, { strokeDashoffset: 1, opacity: 0, offset: 1 }];
      case 'grow':
      case 'growy':
        var s0 = fx === 'grow' ? 'scaleX(0)' : 'scaleY(0)', s1 = fx === 'grow' ? 'scaleX(1)' : 'scaleY(1)';
        return [{ transform: s0, opacity: 1, offset: 0 }, { transform: s0, opacity: 1, offset: a, easing: EASE },
                { transform: s1, opacity: 1, offset: b }, { transform: s1, opacity: 1, offset: c },
                { transform: s1, opacity: 0, offset: d }, { transform: s0, opacity: 0, offset: 1 }];
      case 'slide':   // starts offset by data-dx/data-dy, slides into place, slides back at "out"
        var t0 = 'translate(' + num(el, 'data-dx', 0) + 'px,' + num(el, 'data-dy', 0) + 'px)', t1 = 'translate(0px,0px)';
        var e = Math.max(c, o(out + num(el, 'data-back', 0.7)));
        return [{ transform: t0, opacity: 1, offset: 0 }, { transform: t0, opacity: 1, offset: a, easing: EASE },
                { transform: t1, opacity: 1, offset: b }, { transform: t1, opacity: 1, offset: c, easing: 'cubic-bezier(0.7, 0, 0.3, 1)' },
                { transform: t0, opacity: 1, offset: e }, { transform: t0, opacity: 1, offset: 1 }];
      case 'move':
        var path = el.ownerSVGElement && el.ownerSVGElement.querySelector(el.getAttribute('data-path'));
        if (!path || !path.getTotalLength) return null;
        var L = path.getTotalLength(), n = 24, f = [], p = path.getPointAtLength(0);
        f.push({ transform: 'translate(' + p.x + 'px,' + p.y + 'px)', opacity: 0, offset: 0 });
        f.push({ transform: 'translate(' + p.x + 'px,' + p.y + 'px)', opacity: 0, offset: a });
        for (var i = 0; i <= n; i++) {
          p = path.getPointAtLength(L * i / n);
          f.push({ transform: 'translate(' + p.x + 'px,' + p.y + 'px)', opacity: 1, offset: a + (b - a) * i / n });
        }
        f.push({ transform: 'translate(' + p.x + 'px,' + p.y + 'px)', opacity: 0, offset: Math.min(1, b + fade / D) });
        f.push({ transform: 'translate(' + p.x + 'px,' + p.y + 'px)', opacity: 0, offset: 1 });
        return f;
    }
    return null;
  }

  boxes.forEach(function (box) {
    var D = parseFloat(box.getAttribute('data-sig')) || 10;
    var anims = [];
    Array.prototype.forEach.call(box.querySelectorAll('[data-fx]'), function (el) {
      var kf = keyframes(el, D);
      if (!kf) return;
      var an = el.animate(kf, { duration: D * 1000, iterations: Infinity, fill: 'both' });
      an.pause();
      anims.push(an);
    });
    if (!anims.length) return;

    var frame = box.closest('.explorer__frame');
    var btn = box.parentNode.querySelector('[data-sig-toggle]');
    var onScreen = false, shown = !frame || frame.classList.contains('is-active'), paused = false;

    function sync(restart) {
      var run = onScreen && shown && !paused && !document.hidden;
      anims.forEach(function (an) {
        if (restart) an.currentTime = 0;
        if (run) an.play(); else an.pause();
      });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { onScreen = entries[0].isIntersecting; sync(false); }, { threshold: 0.15 }).observe(box);
    } else {
      onScreen = true;
    }
    if (frame && 'MutationObserver' in window) {
      new MutationObserver(function () {
        var now = frame.classList.contains('is-active');
        if (now !== shown) { shown = now; sync(now); }
      }).observe(frame, { attributes: true, attributeFilter: ['class'] });
    }
    if (btn) {
      btn.addEventListener('click', function () {
        paused = !paused;
        btn.closest('[data-sig-wrap]').classList.toggle('is-paused', paused);
        btn.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
        sync(false);
      });
    }
    document.addEventListener('visibilitychange', function () { sync(false); });
    sync(false);
  });
})();
