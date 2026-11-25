(function () {
  'use strict';

  var hdr = document.querySelector('[data-hdr]');

  // Header border once the page scrolls
  function onScroll() {
    if (hdr) hdr.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mega panels: hover handled in CSS; click/keyboard toggles for touch and a11y
  var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-panel-trigger]'));

  function closePanels(except) {
    triggers.forEach(function (btn) {
      var item = btn.closest('.nav__item');
      if (item === except) return;
      item.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  triggers.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.nav__item');
      var open = !item.classList.contains('is-open');
      closePanels(item);
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav__item')) closePanels();
  });

  // Mobile drawer
  var toggle = document.querySelector('[data-drawer-toggle]');
  var drawer = document.getElementById('drawer');

  function setDrawer(open) {
    if (!toggle || !drawer) return;
    if (open && hdr) {
      // Fill exactly the space below the header, utility bar visible or not
      drawer.style.height = (window.innerHeight - hdr.getBoundingClientRect().bottom) + 'px';
    }
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    drawer.hidden = !open;
    document.body.classList.toggle('no-scroll', open);
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      setDrawer(toggle.getAttribute('aria-expanded') !== 'true');
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closePanels();
    if (toggle && toggle.getAttribute('aria-expanded') === 'true') {
      setDrawer(false);
      toggle.focus();
    }
  });

  // Quick contact on phones (partials/enterprise/actionbar.njk): the bar steps aside while a
  // form field has focus, so the keyboard never pushes it over what someone is typing
  var bar = document.querySelector('[data-actionbar]');
  if (bar) {
    var typing = function () {
      var el = document.activeElement;
      document.body.classList.toggle('is-typing', !!el && el.matches('input, textarea, select') && !bar.contains(el));
    };
    document.addEventListener('focusin', typing);
    document.addEventListener('focusout', function () { setTimeout(typing, 0); });
  }

  // Where this visit came from (ad click IDs, campaign tags, referring site, first page), kept for
  // the tab and sent with an enquiry (the contact page's form reads it too). A later ad click or
  // outside link in the same tab replaces it; moving between our own pages doesn't.
  try {
    var arrived = new URLSearchParams(location.search), visit = new URLSearchParams(), tagged = false;
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'li_fat_id'].forEach(function (k) {
      if (arrived.get(k)) { visit.set(k, arrived.get(k).slice(0, 200)); tagged = true; }
    });
    var referrer = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
    if (referrer && referrer !== location.hostname.replace(/^www\./, '')) { visit.set('ref', referrer); tagged = true; }
    if (tagged || !sessionStorage.getItem('ct_source')) {
      visit.set('landing', location.pathname);
      sessionStorage.setItem('ct_source', visit.toString());
    }
  } catch (e) {}

  // Enquiry forms (the quick-quote sheet and the inquiry section on landing pages) post the
  // contact form's fields to /api/contact, then show the thank-you page
  var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var phone = window.matchMedia ? window.matchMedia('(max-width: 767px)') : { matches: false };
  var pageLoadedAt = Date.now();
  var isField = function (el) { return /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.type !== 'hidden' && el.tabIndex !== -1; };

  Array.prototype.forEach.call(document.querySelectorAll('[data-lead-form]'), function (form) {
    var btn = form.querySelector('[type="submit"]');
    var label = btn.querySelector('.btn__label');
    var idle = label.textContent;
    var msg = form.querySelector('[data-form-msg]');
    var fields = Array.prototype.filter.call(form.elements, isField);

    // The keyboard's Next key moves on to the following field instead of sending early
    fields.forEach(function (el, i) {
      if (el.tagName !== 'INPUT') return;
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.isComposing) return;
        var next = fields[i + 1];
        if (!next) return;   // the last field sends
        e.preventDefault();
        next.focus();
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      // Bots: the hidden field filled in, or a post within seconds of the page loading
      if (form.querySelector('[name="hp_field"]').value !== '' || Date.now() - pageLoadedAt < 4000) return;

      btn.disabled = true;
      btn.classList.add('is-loading');
      label.textContent = 'Sending...';
      msg.hidden = true;
      form.querySelector('[name="page_url"]').value = location.href.split('#')[0] + '#' + form.getAttribute('data-lead-form');
      // The server checks these two to tell people from bots: time on the page, where the visit came from
      var body = new URLSearchParams(new FormData(form));
      body.set('elapsed', String(Date.now() - pageLoadedAt));
      try { body.set('source', sessionStorage.getItem('ct_source') || ''); } catch (err) {}

      fetch(form.getAttribute('action'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: body.toString()
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Server error');
          window.location.href = '/thank-you/';
        })
        .catch(function () {
          msg.textContent = 'Something went wrong. Please email us at projects@ciphertrivia.com or call +91 90083 72466.';
          msg.className = 'form__msg form__msg--error';
          msg.hidden = false;
          btn.disabled = false;
          btn.classList.remove('is-loading');
          label.textContent = idle;
        });
    });
  });

  // Phones: once the keyboard is up, bring the field being typed in to the middle of what it
  // leaves visible, so the next box is never hidden behind the keys
  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (!phone.matches || !el.closest || !el.closest('[data-lead-form]') || !isField(el)) return;
    setTimeout(function () {
      if (document.activeElement === el) el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    }, 350);
  });

  // Quick-quote sheet (pages without the inquiry section). Without <dialog> support its
  // buttons stay links to the contact form.
  var qq = document.querySelector('[data-qq]');
  var inquiry = document.querySelector('[data-inquiry]');
  var sheet = !!qq && typeof qq.showModal === 'function';
  if (sheet) {
    qq.querySelector('[data-qq-close]').addEventListener('click', function () { qq.close(); });
    qq.addEventListener('click', function (e) { if (e.target === qq) qq.close(); });   // a tap on the backdrop
    qq.addEventListener('close', function () {
      document.body.classList.remove('no-scroll');
      qq.style.bottom = '';
      qq.style.maxHeight = '';
    });
    // Keep the sheet above the keyboard where the browser doesn't resize the page for it (iOS)
    if (window.visualViewport) {
      var vv = window.visualViewport;
      var fit = function () {
        if (!qq.open) return;
        var kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        qq.style.bottom = kb ? kb + 'px' : '';
        qq.style.maxHeight = (vv.height - 12) + 'px';
      };
      vv.addEventListener('resize', fit);
      vv.addEventListener('scroll', fit);
    }
  }

  // Every quick-quote and contact button: on landing pages it scrolls to the inquiry form and
  // puts the cursor in it; elsewhere it opens the sheet
  function toInquiry() {
    if (toggle && toggle.getAttribute('aria-expanded') === 'true') setDrawer(false);
    var first = Array.prototype.filter.call(inquiry.querySelector('form').elements, isField)[1];   // after the pre-chosen service
    var settled = false;
    var arrive = function () {
      if (settled) return;
      settled = true;
      window.removeEventListener('scrollend', arrive);
      // If a smooth scroll was cut short, finish the trip before putting the cursor in the form
      if (Math.abs(inquiry.getBoundingClientRect().top) > 8) inquiry.scrollIntoView({ block: 'start' });
      if (first) first.focus({ preventScroll: true });
    };
    window.addEventListener('scrollend', arrive);
    inquiry.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    setTimeout(arrive, calm ? 0 : 1400);
  }
  var qqTriggers = document.querySelectorAll(inquiry
    ? '[data-qq-open], a.btn[href^="/contact/"], .contact-card__row a[href^="/contact/"]'
    : '[data-qq-open]');
  Array.prototype.forEach.call(qqTriggers, function (a) {
    a.addEventListener('click', function (e) {
      if (inquiry) { e.preventDefault(); toInquiry(); return; }
      if (!sheet) return;
      e.preventDefault();
      qq.querySelector('[data-form-msg]').hidden = true;
      qq.showModal();
      document.body.classList.add('no-scroll');
    });
  });

  // Reveal on scroll
  var reveals = document.querySelectorAll('.rv, .rv-line, .rv-mask');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  // Explorer: the sticky media frame follows the list item in view
  Array.prototype.forEach.call(document.querySelectorAll('[data-explorer]'), function (root) {
    var items = Array.prototype.slice.call(root.querySelectorAll('[data-explorer-item]'));
    var frames = Array.prototype.slice.call(root.querySelectorAll('[data-explorer-media]'));
    var count = root.querySelector('[data-explorer-count]');
    if (!items.length) return;
    var current = -1;
    var pending = false;

    function setActive(i) {
      if (i === current) return;
      current = i;
      items.forEach(function (el, k) { el.classList.toggle('is-active', k === i); });
      frames.forEach(function (el, k) { el.classList.toggle('is-active', k === i); });
      if (count) count.textContent = String(i + 1).padStart(2, '0');
    }
    function update() {
      var line = window.innerHeight * 0.5;
      var active = 0;
      items.forEach(function (el, k) { if (el.getBoundingClientRect().top < line) active = k; });
      setActive(active);
      pending = false;
    }

    window.addEventListener('scroll', function () {
      if (!pending) { pending = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    items.forEach(function (el, k) { el.addEventListener('mouseenter', function () { setActive(k); }); });
    update();
  });

  // Hero video: muted loop that plays only while on screen, never for
  // reduced-motion users, and can always be paused (WCAG 2.2.2)
  Array.prototype.forEach.call(document.querySelectorAll('[data-hero-video]'), function (wrap) {
    var video = wrap.querySelector('video');
    var btn = wrap.querySelector('[data-video-toggle]');
    if (!video) return;
    var paused = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var onScreen = false;

    function play() { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
    function sync() {
      wrap.classList.toggle('is-paused', paused);
      if (btn) btn.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
      if (paused || !onScreen) video.pause(); else play();
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        sync();
      }, { threshold: 0.15 }).observe(wrap);
    } else {
      onScreen = true;
    }
    if (btn) btn.addEventListener('click', function () { paused = !paused; sync(); });
    sync();
  });

  // Map embed: the Google Maps frame is heavy, so it loads only as it nears
  // the screen (the browser's own lazy loading starts far earlier), then fades in
  Array.prototype.forEach.call(document.querySelectorAll('[data-map]'), function (wrap) {
    var frame = wrap.querySelector('iframe[data-src]');
    if (!frame) return;
    function load() {
      frame.addEventListener('load', function () { wrap.classList.add('is-loaded'); });
      frame.src = frame.getAttribute('data-src');
      frame.removeAttribute('data-src');
    }
    if ('IntersectionObserver' in window) {
      var mio = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        mio.disconnect();
        load();
      }, { rootMargin: '300px 0px' });
      mio.observe(wrap);
    } else {
      load();
    }
  });

  // Accordions built as heading + button (questions stay real headings)
  Array.prototype.forEach.call(document.querySelectorAll('[data-acc] .acc__q[aria-controls]'), function (btn) {
    var item = btn.closest('.acc__item');
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      if (item) item.classList.toggle('is-open', open);
    });
  });

  // Article contents rail: mark the section being read
  var toc = document.querySelector('[data-toc]');
  if (toc) {
    var tocLinks = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    var tocSecs = tocLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
    var tocTick = false;

    function updateToc() {
      var line = window.innerHeight * 0.3;
      var active = 0;
      tocSecs.forEach(function (s, i) { if (s && s.getBoundingClientRect().top < line) active = i; });
      tocLinks.forEach(function (a, i) {
        if (i === active) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      tocTick = false;
    }
    window.addEventListener('scroll', function () {
      if (!tocTick) { tocTick = true; window.requestAnimationFrame(updateToc); }
    }, { passive: true });
    updateToc();
  }

  // Count-up figures: only those that start off-screen, so nothing flashes
  var counters = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (counters.length && 'IntersectionObserver' in window && !reduceMotion) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        cio.unobserve(entry.target);
        var el = entry.target;
        var end = parseInt(el.getAttribute('data-count'), 10);
        var t0 = null;
        function step(ts) {
          if (t0 === null) t0 = ts;
          var p = Math.min(1, (ts - t0) / 1400);
          el.textContent = String(Math.round(end * (1 - Math.pow(1 - p, 3))));
          if (p < 1) window.requestAnimationFrame(step);
        }
        window.requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) {
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.textContent = '0';
        cio.observe(el);
      }
    });
  }

  // Attack-surface map (industry pages): the node and spoke for the challenge being read light up
  Array.prototype.forEach.call(document.querySelectorAll('[data-surface]'), function (root) {
    var items = Array.prototype.slice.call(root.querySelectorAll('[data-surface-item]'));
    var groups = [items,
      Array.prototype.slice.call(root.querySelectorAll('[data-surface-node]')),
      Array.prototype.slice.call(root.querySelectorAll('[data-surface-spoke]'))];
    if (!items.length) return;
    var current = -1;
    var pending = false;

    function setActive(i) {
      if (i === current) return;
      current = i;
      groups.forEach(function (group) {
        group.forEach(function (el, k) { el.classList.toggle('is-active', k === i); });
      });
    }
    function update() {
      var line = window.innerHeight * 0.5;
      var active = 0;
      items.forEach(function (el, k) { if (el.getBoundingClientRect().top < line) active = k; });
      setActive(active);
      pending = false;
    }

    window.addEventListener('scroll', function () {
      if (!pending) { pending = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    items.forEach(function (el, k) { el.addEventListener('mouseenter', function () { setActive(k); }); });
    update();
  });

  // Services hub: "What are you securing?" keeps the matching services lit and steps the
  // rest back; the result is announced for screen readers
  Array.prototype.forEach.call(document.querySelectorAll('[data-svc-filter]'), function (bar) {
    var cat = document.querySelector('[data-svc-catalogue]');
    if (!cat) return;
    var cards = Array.prototype.slice.call(cat.querySelectorAll('[data-assets]'));
    var groups = Array.prototype.slice.call(cat.querySelectorAll('[data-svc-group]'));
    var status = document.querySelector('[data-svc-status]');
    var buttons = Array.prototype.slice.call(bar.querySelectorAll('[data-asset]'));

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var asset = btn.getAttribute('data-asset');
        var all = asset === 'all';
        var hits = 0;
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        cards.forEach(function (card) {
          var hit = !all && (' ' + card.getAttribute('data-assets') + ' ').indexOf(' ' + asset + ' ') > -1;
          card.classList.toggle('is-hit', hit);
          if (hit) hits++;
        });
        groups.forEach(function (g) { g.classList.toggle('is-empty', !all && !g.querySelector('.is-hit')); });
        cat.classList.toggle('is-filtering', !all);
        if (status) {
          status.textContent = all ? 'Showing all services'
            : hits + (hits === 1 ? ' service covers ' : ' services cover ') + btn.textContent.trim();
        }
      });
    });

    // Deep link: /services/?for=api opens with that filter applied
    var match = /[?&]for=([a-z]+)/.exec(window.location.search);
    if (match) {
      buttons.forEach(function (b) { if (b.getAttribute('data-asset') === match[1]) b.click(); });
    }
  });

  // Overview story (industry pages): words darken up to a reading line as the passage
  // scrolls past it; the rail fills and the shield closes when the last word is reached.
  // Paragraphs here are plain text, so wrapping each word is safe.
  Array.prototype.forEach.call(document.querySelectorAll('[data-lit]'), function (root) {
    var body = root.querySelector('.story__body');
    if (!body) return;
    var words = [];
    Array.prototype.forEach.call(body.querySelectorAll('p'), function (p) {
      var parts = p.textContent.split(/(\s+)/);
      p.textContent = '';
      parts.forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { p.appendChild(document.createTextNode(part)); return; }
        var w = document.createElement('span');
        w.className = 'lit__w';
        w.textContent = part;
        p.appendChild(w);
        words.push(w);
      });
    });
    var shown = -1;
    var pending = false;

    function update() {
      var rect = body.getBoundingClientRect();
      var progress = (window.innerHeight * 0.7 - rect.top) / rect.height;
      progress = Math.min(1, Math.max(0, progress));
      var n = Math.round(progress * words.length);
      if (n !== shown) {
        words.forEach(function (w, i) { w.classList.toggle('is-lit', i < n); });
        shown = n;
      }
      root.style.setProperty('--lit', progress.toFixed(4));
      root.classList.toggle('is-done', progress >= 1);
      pending = false;
    }

    window.addEventListener('scroll', function () {
      if (!pending) { pending = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  // Engagement track (industry pages): the rail fills as the section is read and each
  // step lights once the fill reaches its node. Horizontal on wide screens, vertical below.
  Array.prototype.forEach.call(document.querySelectorAll('[data-track]'), function (track) {
    var steps = Array.prototype.slice.call(track.querySelectorAll('.track__step'));
    if (!steps.length) return;
    var pending = false;

    function update() {
      var vh = window.innerHeight;
      var rect = track.getBoundingClientRect();
      var across = steps.length > 1 && steps[1].offsetTop === steps[0].offsetTop;
      var progress = across
        ? (vh * 0.85 - rect.top) / (vh * 0.45)
        : (vh * 0.6 - rect.top) / rect.height;
      progress = Math.min(1, Math.max(0, progress));
      track.style.setProperty('--progress', progress.toFixed(4));
      steps.forEach(function (step) {
        var at = across ? step.offsetLeft / track.offsetWidth : step.offsetTop / track.offsetHeight;
        step.classList.toggle('is-active', progress > 0 && at <= progress + 0.001);
      });
      pending = false;
    }

    window.addEventListener('scroll', function () {
      if (!pending) { pending = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  // Process rail: fill line + active step + counter
  var list = document.querySelector('[data-process]');
  if (list) {
    var steps = Array.prototype.slice.call(list.querySelectorAll('.step'));
    var counter = document.querySelector('[data-step-current]');
    var ticking = false;

    function update() {
      var vh = window.innerHeight;
      var line = vh * 0.55;
      var rect = list.getBoundingClientRect();
      var progress = Math.min(1, Math.max(0, (line - rect.top) / rect.height));
      list.style.setProperty('--progress', progress.toFixed(4));

      var active = -1;
      steps.forEach(function (step, i) {
        if (step.getBoundingClientRect().top < line) active = i;
      });
      steps.forEach(function (step, i) {
        step.classList.toggle('is-active', i <= active);
      });
      if (counter) counter.textContent = String(Math.max(active, 0) + 1).padStart(2, '0');
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }
})();
