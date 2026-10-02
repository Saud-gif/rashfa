/* رشفة — الحركات المتقدمة: شاشة البداية، ستارة الانتقال، المؤشر، الأزرار المغناطيسية،
   ظهور العناوين كلمة كلمة، حبوب القهوة العائمة، تعبئة خط "قصتنا" مع التمرير */
(function () {
  var html = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var readyCallbacks = [];
  var isReady = false;

  function ready() {
    if (isReady) return;
    isReady = true;
    html.classList.add('ready');
    readyCallbacks.forEach(function (cb) { cb(); });
  }
  function onReady(cb) { if (isReady) cb(); else readyCallbacks.push(cb); }
  function remember(key) { try { sessionStorage.setItem(key, '1'); } catch (e) {} }

  /* ===== شاشة البداية (أول زيارة في الجلسة) ===== */
  var loader = document.querySelector('.loader');
  var curtain = document.querySelector('.curtain');

  if (loader && !html.classList.contains('seen') && !html.classList.contains('from-nav') && !reduceMotion) {
    var started = performance.now();
    var finish = function () {
      var wait = Math.max(0, 1900 - (performance.now() - started));
      setTimeout(function () {
        loader.classList.add('done');
        remember('rashfa.seen');
        ready();
        setTimeout(function () { html.classList.add('loader-gone'); }, 1200);
      }, wait);
    };
    if (document.readyState === 'complete') finish();
    else {
      window.addEventListener('load', finish, { once: true });
      setTimeout(finish, 3500); // لا ننتظر أكثر من هذا حتى لو الصور بطيئة
    }
  } else if (html.classList.contains('from-nav') && curtain && !reduceMotion) {
    /* ===== ستارة: كشف الصفحة الجديدة ===== */
    requestAnimationFrame(function () {
      html.classList.add('loader-gone');
      curtain.classList.add('leave');
      html.classList.remove('from-nav');
      ready();
      setTimeout(function () { curtain.classList.remove('leave'); }, 900);
    });
    remember('rashfa.seen');
  } else {
    html.classList.remove('from-nav');
    remember('rashfa.seen');
    ready();
  }

  /* ===== ستارة: تغطية الصفحة عند الانتقال لصفحة داخلية ===== */
  if (curtain && !reduceMotion) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('data-order') || a.hasAttribute('download')) return;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname) return; // روابط # داخل نفس الصفحة
      if (!/(\.html|\/)$/.test(url.pathname)) return;
      e.preventDefault();
      try { sessionStorage.setItem('rashfa.nav', '1'); } catch (err) {}
      curtain.classList.remove('leave');
      curtain.classList.add('enter');
      setTimeout(function () { location.href = url.href; }, 560);
    });
    // عند الرجوع بزر الرجوع (bfcache) نشيل الستارة
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) { curtain.classList.remove('enter', 'leave'); html.classList.remove('from-nav'); ready(); }
    });
  }

  if (reduceMotion) return;

  /* ===== ظهور العناوين كلمة كلمة ===== */
  var splitTargets = document.querySelectorAll('.section-title, .page-hero h1, .cta-band h2, .delivery h2');
  splitTargets.forEach(function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.setAttribute('aria-label', el.textContent.trim());
    el.innerHTML = words.map(function (w, i) {
      return '<span class="w" aria-hidden="true"><span style="--i:' + i + '">' + w + '</span></span>';
    }).join(' ');
    el.classList.add('is-split');
  });
  onReady(function () {
    if (!('IntersectionObserver' in window)) { splitTargets.forEach(function (el) { el.classList.add('split-in'); }); return; }
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('split-in'); so.unobserve(en.target); } });
    }, { threshold: 0.4 });
    splitTargets.forEach(function (el) { so.observe(el); });
  });

  /* ===== حبوب قهوة عائمة في الواجهة ===== */
  var hero = document.querySelector('.hero');
  if (hero) {
    var bean = '<svg viewBox="0 0 40 52"><ellipse cx="20" cy="26" rx="17" ry="24"/><path d="M20 3c-7 9-7 17 0 23s7 14 0 23"/></svg>';
    var beans = [
      { x: 6, y: 18, s: 34, r: -25, d: 1.6 }, { x: 88, y: 12, s: 22, r: 40, d: 0.8 },
      { x: 46, y: 8, s: 16, r: 10, d: 0.5 },  { x: 94, y: 70, s: 30, r: -60, d: 1.3 },
      { x: 3, y: 78, s: 20, r: 70, d: 0.9 },  { x: 52, y: 90, s: 26, r: -15, d: 1.1 }
    ];
    var layer = document.createElement('div');
    layer.className = 'beans';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = beans.map(function (b, i) {
      return '<span class="bean" style="left:' + b.x + '%;top:' + b.y + '%;--s:' + b.s + 'px;--r:' + b.r + 'deg;--depth:' + b.d + ';--delay:' + (-i * 1.3) + 's">' + bean + '</span>';
    }).join('');
    hero.insertBefore(layer, hero.firstChild);

    if (finePointer) {
      var hx = 0, hy = 0, tx = 0, ty = 0, raf = null;
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        tx = (e.clientX - r.left) / r.width - 0.5;
        ty = (e.clientY - r.top) / r.height - 0.5;
        if (!raf) raf = requestAnimationFrame(tick);
      });
      hero.addEventListener('pointerleave', function () { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
      var tick = function () {
        hx += (tx - hx) * 0.08; hy += (ty - hy) * 0.08;
        hero.style.setProperty('--hx', hx.toFixed(4));
        hero.style.setProperty('--hy', hy.toFixed(4));
        raf = (Math.abs(tx - hx) > 0.001 || Math.abs(ty - hy) > 0.001) ? requestAnimationFrame(tick) : null;
      };
    }
  }

  /* ===== خط "قصتنا" يتعبّى مع التمرير، وكل فصل يضيء لما يوصله الخط ===== */
  var timeline = document.querySelector('.timeline');
  if (timeline) {
    var items = timeline.querySelectorAll('.tl-item');
    var tlTick = false;
    var updateTimeline = function () {
      tlTick = false;
      var r = timeline.getBoundingClientRect();
      var mark = window.innerHeight * 0.62;
      var p = Math.max(0, Math.min(1, (mark - r.top) / r.height));
      timeline.style.setProperty('--tl', p.toFixed(4));
      items.forEach(function (it) {
        var ir = it.querySelector('.tl-icon').getBoundingClientRect();
        it.classList.toggle('lit', ir.top + ir.height / 2 < mark);
      });
    };
    window.addEventListener('scroll', function () { if (!tlTick) { tlTick = true; requestAnimationFrame(updateTimeline); } }, { passive: true });
    window.addEventListener('resize', updateTimeline);
    onReady(updateTimeline);
  }

  /* ===== تموّج عند الضغط على الأزرار ===== */
  document.addEventListener('pointerdown', function (e) {
    var btn = e.target.closest('.btn, .fab, .om-step');
    if (!btn) return;
    var r = btn.getBoundingClientRect();
    var size = Math.max(r.width, r.height) * 2.2;
    var rip = document.createElement('span');
    rip.className = 'ripple';
    rip.style.width = rip.style.height = size + 'px';
    rip.style.left = (e.clientX - r.left - size / 2) + 'px';
    rip.style.top = (e.clientY - r.top - size / 2) + 'px';
    btn.appendChild(rip);
    setTimeout(function () { rip.remove(); }, 700);
  });

  if (!finePointer) return;

  /* ===== أزرار مغناطيسية ===== */
  document.querySelectorAll('.btn, .fab, .explore-go').forEach(function (el) {
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      var x = e.clientX - (r.left + r.width / 2);
      var y = e.clientY - (r.top + r.height / 2);
      el.style.setProperty('--mgx', (x * 0.22).toFixed(1) + 'px');
      el.style.setProperty('--mgy', (y * 0.3).toFixed(1) + 'px');
    });
    el.addEventListener('pointerleave', function () {
      el.style.setProperty('--mgx', '0px');
      el.style.setProperty('--mgy', '0px');
    });
  });

  /* ===== حلقة تتبع المؤشر ===== */
  var ring = document.createElement('div');
  ring.className = 'cursor-ring';
  ring.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ring);
  var cx = -100, cy = -100, rx = -100, ry = -100, cursorRaf = null;
  function follow() {
    rx += (cx - rx) * 0.2; ry += (cy - ry) * 0.2;
    ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
    cursorRaf = (Math.abs(cx - rx) > 0.3 || Math.abs(cy - ry) > 0.3) ? requestAnimationFrame(follow) : null;
  }
  document.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    cx = e.clientX; cy = e.clientY;
    ring.classList.add('on');
    var hot = e.target.closest('a, button, .product, .explore-card, input, textarea');
    ring.classList.toggle('hot', !!hot && !e.target.closest('input, textarea'));
    ring.classList.toggle('text', !!e.target.closest('input, textarea'));
    if (!cursorRaf) cursorRaf = requestAnimationFrame(follow);
  });
  document.addEventListener('pointerdown', function () { ring.classList.add('press'); });
  document.addEventListener('pointerup', function () { ring.classList.remove('press'); });
  document.documentElement.addEventListener('pointerleave', function () { ring.classList.remove('on'); });
})();
