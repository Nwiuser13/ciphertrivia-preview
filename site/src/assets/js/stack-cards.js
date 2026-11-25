/* Emerging-security stack (home): the cards stick by CSS alone. This only measures how far the
   next card has risen over each one and sets --cover (0 to 1) so the covered card settles back a
   little. Skipped with reduced motion; without it the stack still works. */
(function () {
  'use strict';
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-stack-card]'));
  if (cards.length < 2) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var queued = false;
  function update() {
    queued = false;
    var vh = window.innerHeight || 800;
    for (var i = 0; i < cards.length - 1; i++) {
      var next = cards[i + 1];
      var stuck = parseFloat(getComputedStyle(next).top) || 0;
      var top = next.getBoundingClientRect().top;
      // 0 while the next card is still a screen away, 1 once it has reached its stuck position
      var c = 1 - (top - stuck) / (vh * 0.6);
      c = c < 0 ? 0 : c > 1 ? 1 : c;
      cards[i].style.setProperty('--cover', c.toFixed(3));
    }
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  update();
})();

/* Visual panels: the icon tilts toward the pointer and a light follows it; hovering a focus-area
   tag names it in the panel. Pointer screens only, skipped with reduced motion. */
(function () {
  'use strict';
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && window.matchMedia('(hover: hover)').matches;
  if (!fine) return;
  Array.prototype.forEach.call(document.querySelectorAll('[data-stack-card]'), function (card) {
    var vis = card.querySelector('[data-stack-visual]');
    var tilt = card.querySelector('.stack__tilt');
    var read = card.querySelector('[data-stack-read]');
    var base = read ? read.textContent : '';
    if (vis && !calm) {
      vis.addEventListener('pointermove', function (e) {
        var r = vis.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        vis.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        vis.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        tilt.style.setProperty('--tx', (x * 2 - 1).toFixed(3));
        tilt.style.setProperty('--ty', (y * 2 - 1).toFixed(3));
      });
      vis.addEventListener('pointerleave', function () {
        tilt.style.setProperty('--tx', 0);
        tilt.style.setProperty('--ty', 0);
      });
    }
    Array.prototype.forEach.call(card.querySelectorAll('[data-stack-tag]'), function (tag) {
      tag.addEventListener('pointerenter', function () { read.textContent = tag.getAttribute("data-label"); read.classList.add('is-set'); });
      tag.addEventListener('pointerleave', function () { read.textContent = base; read.classList.remove('is-set'); });
    });
  });
})();
