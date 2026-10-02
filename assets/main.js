/* رشفة — الحركة والتفاعل */
(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ظهور العناصر عند التمرير، مع تأخير متدرّج لأبناء [data-stagger] */
  document.querySelectorAll('[data-stagger]').forEach(function (group) {
    var step = parseFloat(group.getAttribute('data-stagger')) || 0.12;
    group.querySelectorAll(':scope > [data-reveal]').forEach(function (el, i) {
      el.style.setProperty('--d', (i * step).toFixed(2) + 's');
    });
  });

  var revealTargets = document.querySelectorAll('[data-reveal], .steps, .timeline');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('is-visible');
        io.unobserve(el);
        // بعد انتهاء حركة الظهور نزيل التأخير حتى يكون hover فورياً
        setTimeout(function () { el.classList.add('revealed'); }, 1200 + parseFloat(getComputedStyle(el).getPropertyValue('--d') || 0) * 1000);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add('is-visible', 'revealed'); });
  }

  /* الفقاعات المتصاعدة */
  if (!reduceMotion) {
    document.querySelectorAll('[data-bubbles]').forEach(function (box) {
      var count = parseInt(box.getAttribute('data-bubbles'), 10) || 14;
      for (var i = 0; i < count; i++) {
        var b = document.createElement('span');
        b.className = 'bubble';
        var size = 6 + Math.random() * 22;
        b.style.setProperty('--x', (Math.random() * 100).toFixed(1) + '%');
        b.style.setProperty('--s', size.toFixed(0) + 'px');
        b.style.setProperty('--d', (9 + Math.random() * 10).toFixed(1) + 's');
        b.style.setProperty('--delay', (-Math.random() * 16).toFixed(1) + 's');
        box.appendChild(b);
      }
    });
  }

  /* العدّ التصاعدي للأسعار */
  var counters = document.querySelectorAll('[data-count]');
  function runCounter(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var decimals = (el.getAttribute('data-count').split('.')[1] || '').length;
    if (reduceMotion) { el.textContent = target.toFixed(decimals); return; }
    var start = null, duration = 1400;
    function tick(t) {
      if (!start) start = t;
      var p = Math.min((t - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = (target * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  if ('IntersectionObserver' in window && !reduceMotion) {
    counters.forEach(function (el) {
      var decimals = (el.getAttribute('data-count').split('.')[1] || '').length;
      el.textContent = (0).toFixed(decimals);
    });
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { runCounter(entry.target); co.unobserve(entry.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { co.observe(el); });
  } else {
    counters.forEach(runCounter);
  }

  /* التمرير: شريط التنقل، زر واتساب العائم، شريط التقدم، البارالاكس */
  var nav = document.querySelector('.nav');
  var fab = document.querySelector('.fab');
  var progress = document.querySelector('.progress');
  var parallax = document.querySelectorAll('[data-parallax]');
  var ticking = false;

  function onScroll() {
    var y = window.scrollY;
    if (nav) nav.classList.toggle('scrolled', y > 10);
    if (fab) fab.classList.toggle('show', y > 320);
    if (progress) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
    }
    if (!reduceMotion) {
      parallax.forEach(function (el) {
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.1;
        var limit = parseFloat(el.getAttribute('data-parallax-max')) || 60;
        var shift = Math.max(-limit, Math.min(limit, y * speed));
        el.style.setProperty('--py', shift.toFixed(1) + 'px');
      });
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* إمالة البطاقات مع حركة الماوس */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll('.card').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width;
        var y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--ry', ((x - 0.5) * 10).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - y) * 8).toFixed(2) + 'deg');
        card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* السنة الحالية في التذييل */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
