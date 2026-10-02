/* رشفة — حركات المستوى الثاني:
   صورة سائلة (WebGL)، مشهد الزجاجة المثبّت مع التمرير، رذاذ قطرات عند الضغط،
   تمرير ناعم، انحناء المحتوى مع سرعة التمرير، تلاشي الواجهة عند النزول */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var html = document.documentElement;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var vh = window.innerHeight;
  window.addEventListener('resize', function () { vh = window.innerHeight; });

  /* ===================== 1) تمرير ناعم (كمبيوتر فقط) ===================== */
  var lenis = null;
  if (finePointer && window.Lenis) {
    lenis = new window.Lenis({ duration: 1.15, smoothWheel: true, wheelMultiplier: 0.9 });
    var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // نوقف التمرير الناعم لما تنفتح نافذة الطلب
    new MutationObserver(function () {
      if (html.classList.contains('om-open')) lenis.stop(); else lenis.start();
    }).observe(html, { attributes: true, attributeFilter: ['class'] });
  }

  /* ===================== 2) صورة سائلة في الواجهة (WebGL) ===================== */
  function liquidImage(img) {
    var host = img.parentElement;
    var canvas = document.createElement('canvas');
    canvas.className = 'liquid-canvas';
    var gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
    if (!gl) return;

    var vs = 'attribute vec2 p;varying vec2 v;void main(){v=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}';
    var fs = [
      'precision mediump float;',
      'uniform sampler2D t;uniform vec2 m;uniform float time;uniform float s;uniform vec2 sc;uniform vec2 of;uniform float a;',
      'varying vec2 v;',
      'void main(){',
      '  vec2 uv=v;',
      '  vec2 d=uv-m; d.x*=a;',
      '  float r=length(d);',
      '  float w=sin(r*38.0-time*5.0)*exp(-r*5.5)*s;',
      '  vec2 dir=r>0.0001?d/r:vec2(0.0); dir.x/=a;',
      '  uv+=dir*w*0.028;',
      '  uv.y+=sin(uv.x*9.0+time*0.8)*0.0025;',
      '  uv.x+=cos(uv.y*7.0+time*0.6)*0.002;',
      '  vec2 tu=uv*sc+of;',
      '  vec4 c=texture2D(t,tu);',
      '  c.rgb+=w*0.12;',
      '  gl_FragColor=c;',
      '}'
    ].join('\n');
    function sh(type, src) { var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    } catch (e) { return; } // صورة من مصدر مختلف (مثلاً فتح الملف مباشرة) — نخلي الصورة العادية
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    var U = {};
    ['m', 'time', 's', 'sc', 'of', 'a'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = host.clientWidth, h = host.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      var ca = w / h, ia = img.naturalWidth / img.naturalHeight;
      var sx = 1, sy = 1;
      if (ca > ia) sy = ia / ca; else sx = ca / ia;
      sx *= 0.92; sy *= 0.92; // هامش حتى لا تظهر الحواف مع التموج
      gl.uniform2f(U.sc, sx, sy);
      gl.uniform2f(U.of, (1 - sx) / 2, (1 - sy) * 0.45);
      gl.uniform1f(U.a, ca);
    }
    host.appendChild(canvas);
    size();
    window.addEventListener('resize', size);
    img.classList.add('liquid-hidden');

    var mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5, str = 0, tstr = 0, visible = true;
    function point(e) {
      var r = canvas.getBoundingClientRect();
      tmx = (e.clientX - r.left) / r.width;
      tmy = 1 - (e.clientY - r.top) / r.height;
      tstr = 1;
    }
    host.addEventListener('pointermove', point);
    host.addEventListener('pointerdown', function (e) { point(e); str = 1.6; });
    host.addEventListener('pointerleave', function () { tstr = 0; });
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(host);

    var t0 = performance.now();
    (function loop(now) {
      requestAnimationFrame(loop);
      if (!visible) return;
      mx += (tmx - mx) * 0.08; my += (tmy - my) * 0.08;
      str += (tstr - str) * 0.04;
      gl.uniform2f(U.m, mx, my);
      gl.uniform1f(U.time, (now - t0) / 1000);
      gl.uniform1f(U.s, str);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    })(t0);
  }
  var heroImg = document.querySelector('.arch img');
  if (heroImg && location.protocol !== 'file:') {
    if (heroImg.complete && heroImg.naturalWidth) liquidImage(heroImg);
    else heroImg.addEventListener('load', function () { liquidImage(heroImg); }, { once: true });
  }

  /* ===================== 3) مشهد الزجاجة المثبّت ===================== */
  var pins = document.querySelectorAll('[data-pin]');

  /* ===================== 4) تلاشي الواجهة + انحناء مع السرعة ===================== */
  var hero = document.querySelector('.hero');
  var skewEls = document.querySelectorAll('.products, .explore, .features, .timeline');
  var lastY = window.scrollY, skew = 0, ticking = false;

  function frame() {
    ticking = false;
    var y = window.scrollY;

    if (hero) {
      var so = Math.max(0, Math.min(1, y / (hero.offsetHeight * 0.9)));
      hero.style.setProperty('--so', so.toFixed(3));
    }

    pins.forEach(function (pin) {
      var r = pin.getBoundingClientRect();
      var total = pin.offsetHeight - vh;
      var p = Math.max(0, Math.min(1, -r.top / total));
      pin.style.setProperty('--p', p.toFixed(4));
      pin.querySelectorAll('[data-at]').forEach(function (line) {
        var at = parseFloat(line.getAttribute('data-at'));
        var span = parseFloat(line.getAttribute('data-span') || 0.22);
        var local = (p - at) / span; // 0..1 داخل نافذة السطر
        line.style.setProperty('--l', Math.max(-1, Math.min(2, local)).toFixed(3));
        line.classList.toggle('on', local >= 0 && local <= 1);
      });
    });

    var v = y - lastY; lastY = y;
    var target = Math.max(-4, Math.min(4, v * 0.12));
    skew += (target - skew) * 0.25;
    if (Math.abs(skew) < 0.01) skew = 0;
    skewEls.forEach(function (el) { el.style.transform = skew ? 'skewY(' + skew.toFixed(2) + 'deg)' : ''; });
    if (skew !== 0) { ticking = true; requestAnimationFrame(frame); }
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  frame();

  /* ===================== 5) رذاذ قطرات عند الضغط ===================== */
  var cv = document.createElement('canvas');
  cv.className = 'splash-canvas';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  var ctx = cv.getContext('2d');
  var drops = [], running = false, dpr = Math.min(window.devicePixelRatio || 1, 2);
  function fit() { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; }
  fit(); window.addEventListener('resize', fit);
  var colors = ['#6E2035', '#8B2C44', '#C79A5F', '#3E0F1C', '#A87A42'];

  document.addEventListener('pointerdown', function (e) {
    if (e.target.closest('input, textarea, .om-sheet')) return;
    var n = 14 + Math.floor(Math.random() * 6);
    for (var i = 0; i < n; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
      var sp = 3 + Math.random() * 6;
      drops.push({
        x: e.clientX, y: e.clientY,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        r: 2 + Math.random() * 4.5, life: 1,
        c: colors[(Math.random() * colors.length) | 0]
      });
    }
    if (!running) { running = true; requestAnimationFrame(draw); }
  });
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    drops = drops.filter(function (d) { return d.life > 0; });
    drops.forEach(function (d) {
      d.vy += 0.32; d.vx *= 0.985; d.x += d.vx; d.y += d.vy; d.life -= 0.022;
      var stretch = Math.min(2.4, 1 + Math.abs(d.vy) * 0.08);
      ctx.save();
      ctx.globalAlpha = Math.max(0, d.life);
      ctx.translate(d.x, d.y);
      ctx.rotate(Math.atan2(d.vy, d.vx) - Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, d.r, d.r * stretch, 0, 0, Math.PI * 2);
      ctx.fillStyle = d.c;
      ctx.fill();
      ctx.restore();
    });
    if (drops.length) requestAnimationFrame(draw);
    else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
})();
