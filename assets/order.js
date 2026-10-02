/* رشفة — نموذج الطلب: يجمع بيانات الزبونة ويرسل الطلب على واتساب */
(function () {
  /* ===== الإعدادات ===== */
  var WHATSAPP_NUMBER = '96893933166';
  // رابط Google Apps Script لحفظ الطلبات في Google Sheet (اتركيه فارغاً لإرسال الطلبات على واتساب فقط)
  var ORDER_ENDPOINT = '';
  // دالة Vercel التي ترسل الطلب تلقائياً عبر WhatsApp Cloud API (انظري WHATSAPP_SETUP.md)
  var ORDER_API = '/api/order';
  var CURRENCY = 'ر.ع';
  var PRODUCTS = [
    { id: 'rashfa',  name: 'كولد برو رشفة', price: 1.700, note: 'الأكثر طلباً' },
    { id: 'classic', name: 'كلاسيكي',       price: 1.200 },
    { id: 'karkade', name: 'كركديه',         price: 0.500 }
  ];
  var STORE_KEY = 'rashfa.customer';
  var LAST_ORDER_KEY = 'rashfa.lastOrder';

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { return null; }
  }
  function money(n) { return n.toFixed(3) + ' ' + CURRENCY; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // تحويل الأرقام العربية/الفارسية إلى إنجليزية
  function toLatinDigits(s) {
    return s.replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; })
            .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 1776; });
  }
  function normalizePhone(raw) {
    var d = toLatinDigits(raw).replace(/\D/g, '');
    if (d.indexOf('00968') === 0) d = d.slice(5);
    else if (d.indexOf('968') === 0 && d.length === 11) d = d.slice(3);
    return d;
  }

  var icons = {
    wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 01-8.9 8.4c-1.4-.1-2.3-.4-3.4-1L3 20l1.1-3.7a8 8 0 01-1.1-4.1A8.4 8.4 0 0112 3.5a8.3 8.3 0 019 8z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.4"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };

  /* ===== بناء النافذة ===== */
  var productRows = PRODUCTS.map(function (p) {
    return '<div class="om-product" data-id="' + p.id + '">' +
      '<div class="om-product-info"><b>' + esc(p.name) + '</b>' +
      (p.note ? '<span class="om-tag">' + esc(p.note) + '</span>' : '') +
      '<small>' + money(p.price) + '</small></div>' +
      '<div class="om-stepper">' +
        '<button type="button" class="om-step" data-act="inc" aria-label="زيادة ' + esc(p.name) + '">+</button>' +
        '<output class="om-qty" aria-live="polite">0</output>' +
        '<button type="button" class="om-step" data-act="dec" aria-label="إنقاص ' + esc(p.name) + '">−</button>' +
      '</div></div>';
  }).join('');

  var modal = document.createElement('div');
  modal.className = 'om';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="om-backdrop" data-close></div>' +
    '<div class="om-sheet" role="dialog" aria-modal="true" aria-labelledby="omTitle">' +
      '<button type="button" class="om-close" data-close aria-label="إغلاق">' + icons.close + '</button>' +

      '<form class="om-form" novalidate>' +
        '<div class="om-head"><span class="eyebrow">New Order</span><h2 id="omTitle">طلب جديد</h2><p>عبّي بياناتك ونوصلك طلبك داخل سمائل</p></div>' +

        '<fieldset class="om-section"><legend>١. اختاري طلبك</legend>' + productRows +
          '<p class="om-error" data-err="items"></p>' +
        '</fieldset>' +

        '<fieldset class="om-section"><legend>٢. بياناتك</legend>' +
          '<input name="website" class="om-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<label class="om-field"><span>الاسم</span><input name="name" autocomplete="name" required placeholder="اسمك الكريم"><em class="om-error" data-err="name"></em></label>' +
          '<label class="om-field"><span>رقم الهاتف</span><div class="om-phone"><span class="om-cc">968+</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" required placeholder="9XXXXXXX" dir="ltr"></div><em class="om-error" data-err="phone"></em></label>' +
          '<label class="om-field"><span>المنطقة</span><input name="area" required placeholder="مثال: سمائل — الحي / القرية"><em class="om-error" data-err="area"></em></label>' +
          '<div class="om-field"><span>الموقع</span>' +
            '<button type="button" class="om-locate">' + icons.pin + '<span>حددي موقعي الحالي</span></button>' +
            '<input type="hidden" name="map">' +
            '<div class="om-map" hidden><iframe title="موقعك على الخريطة" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
              '<a target="_blank" rel="noopener">' + icons.pin + 'فتح في خرائط جوجل</a></div>' +
            '<textarea name="address" rows="2" placeholder="وصف العنوان (مثال: بجانب المسجد، بيت لونه أبيض) — اختياري إذا حددتي الموقع"></textarea>' +
            '<em class="om-error" data-err="location"></em>' +
          '</div>' +
          '<label class="om-field"><span>ملاحظات <small>(اختياري)</small></span><textarea name="notes" rows="2" placeholder="وقت التوصيل المناسب، أي طلب خاص..."></textarea></label>' +
        '</fieldset>' +

        '<div class="om-footer">' +
          '<div class="om-total"><span>المجموع</span><b>' + money(0) + '</b></div>' +
          '<button type="submit" class="btn btn-primary om-submit">' + icons.wa + 'إرسال الطلب</button>' +
        '</div>' +
      '</form>' +

      '<div class="om-done" hidden>' +
        '<div class="om-check"><svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>' +
        '<h2>شكراً لتواصلك معنا!</h2>' +
        '<p class="om-done-num">رقم طلبك: <b class="ltr" data-order-id></b></p>' +
        '<div class="om-status">' + icons.clock + '<div><b>طلبك قيد الانتظار</b><span data-status-text></span></div></div>' +
        '<div class="om-summary" data-summary></div>' +
        '<p class="om-hint" data-manual-only><b>مهم:</b> اضغطي «إرسال» داخل واتساب حتى يوصلنا طلبك. إذا ما انفتح واتساب، جرّبي الروابط تحت.</p>' +
        '<div class="om-done-actions">' +
          '<a class="btn btn-primary" data-wa-link data-manual-only target="_blank" rel="noopener">' + icons.wa + 'إرسال الطلب على واتساب</a>' +
          '<button type="button" class="btn btn-ghost" data-close>تم</button>' +
        '</div>' +
        '<div class="om-alt-actions" data-manual-only>' +
          '<a data-wa-web target="_blank" rel="noopener">فتح واتساب ويب</a>' +
          '<button type="button" data-copy>نسخ نص الطلب</button>' +
        '</div>' +
        '<p class="om-copy-note" hidden>تم نسخ الطلب ✓ الصقيه في محادثة واتساب مع <span class="ltr">+968 9393 3166</span></p>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  var form = modal.querySelector('.om-form');
  var done = modal.querySelector('.om-done');
  var totalEl = modal.querySelector('.om-total b');
  var locateBtn = modal.querySelector('.om-locate');
  var qty = {};
  var lastFocus = null;
  var lastMessage = '';

  // نسخ نص الطلب كحل احتياطي إذا ما انفتح واتساب
  done.querySelector('[data-copy]').addEventListener('click', function () {
    var note = done.querySelector('.om-copy-note');
    function shown() { note.hidden = false; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastMessage).then(shown, fallback);
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = lastMessage; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); shown(); } catch (e) {}
      document.body.removeChild(ta);
    }
  });

  function setQty(id, n) {
    qty[id] = Math.max(0, Math.min(50, n));
    var row = form.querySelector('.om-product[data-id="' + id + '"]');
    row.querySelector('.om-qty').textContent = qty[id];
    row.classList.toggle('selected', qty[id] > 0);
    var total = PRODUCTS.reduce(function (s, p) { return s + (qty[p.id] || 0) * p.price; }, 0);
    totalEl.textContent = money(total);
    totalEl.classList.remove('bump'); void totalEl.offsetWidth; totalEl.classList.add('bump');
    if (total > 0) showError('items', '');
  }

  function showError(key, msg) {
    var el = form.querySelector('[data-err="' + key + '"]');
    if (el) el.textContent = msg;
    var input = form.elements[key];
    if (input && input.classList) input.classList.toggle('invalid', !!msg);
  }

  /* ===== فتح وإغلاق ===== */
  function open(productId) {
    lastFocus = document.activeElement;
    form.hidden = false; done.hidden = true;
    PRODUCTS.forEach(function (p) { if (qty[p.id] === undefined) setQty(p.id, 0); });
    if (productId && !qty[productId]) setQty(productId, 1);
    var saved = store(STORE_KEY);
    if (saved) ['name', 'phone', 'area', 'address'].forEach(function (k) { if (saved[k] && !form.elements[k].value) form.elements[k].value = saved[k]; });
    modal.hidden = false;
    document.documentElement.classList.add('om-open');
    requestAnimationFrame(function () { modal.classList.add('show'); });
    setTimeout(function () { modal.querySelector('.om-close').focus(); }, 50);
    // نطلب الموقع تلقائياً أول ما ينفتح النموذج
    if (!form.elements.map.value) setTimeout(locate, 400);
  }
  function close() {
    modal.classList.remove('show');
    document.documentElement.classList.remove('om-open');
    setTimeout(function () { modal.hidden = true; }, 350);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-order]');
    if (trigger) { e.preventDefault(); open(trigger.getAttribute('data-order')); return; }
    if (e.target.closest('[data-close]') && modal.contains(e.target)) close();
  });
  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(modal.querySelectorAll('button, a[href], input:not([type=hidden]), textarea'), function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  form.addEventListener('click', function (e) {
    var b = e.target.closest('.om-step');
    if (!b) return;
    var id = b.closest('.om-product').getAttribute('data-id');
    setQty(id, (qty[id] || 0) + (b.getAttribute('data-act') === 'inc' ? 1 : -1));
  });
  form.addEventListener('input', function (e) {
    if (e.target.name) showError(e.target.name, '');
    if (e.target.name === 'address') showError('location', '');
  });

  /* ===== تحديد الموقع ===== */
  // يأخذ موقع الزبونة من GPS جوالها ويحوّله لرابط Google Maps مع معاينة على الخريطة
  var mapBox = modal.querySelector('.om-map');
  var locating = false;
  function locate() {
    var label = locateBtn.querySelector('span');
    if (locating) return;
    if (!navigator.geolocation || window.isSecureContext === false) {
      label.textContent = 'تحديد الموقع غير متاح هنا — اكتبي وصف العنوان';
      return;
    }
    locating = true;
    locateBtn.classList.remove('done', 'failed');
    locateBtn.classList.add('loading'); label.textContent = 'جاري تحديد موقعك من الجوال...';
    navigator.geolocation.getCurrentPosition(function (pos) {
      locating = false;
      var lat = pos.coords.latitude.toFixed(6), lng = pos.coords.longitude.toFixed(6);
      var link = 'https://maps.google.com/?q=' + lat + ',' + lng;
      form.elements.map.value = link;
      locateBtn.classList.remove('loading'); locateBtn.classList.add('done');
      var acc = Math.round(pos.coords.accuracy);
      label.textContent = 'تم تحديد موقعك ✓' + (acc ? ' (دقة ' + acc + ' م)' : '') + ' — اضغطي للتحديث';
      mapBox.querySelector('iframe').src = 'https://maps.google.com/maps?q=' + lat + ',' + lng + '&z=16&output=embed';
      mapBox.querySelector('a').href = link;
      mapBox.hidden = false;
      showError('location', '');
    }, function (err) {
      locating = false;
      locateBtn.classList.remove('loading', 'done'); locateBtn.classList.add('failed');
      form.elements.map.value = '';
      mapBox.hidden = true;
      label.textContent = err.code === 1
        ? 'لم يتم السماح بالموقع — فعّلي الموقع للمتصفح أو اكتبي العنوان'
        : 'تعذّر تحديد الموقع — اضغطي للمحاولة مرة ثانية';
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  }
  locateBtn.addEventListener('click', locate);

  /* ===== الإرسال ===== */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = {
      name: form.elements.name.value.trim(),
      phone: normalizePhone(form.elements.phone.value),
      area: form.elements.area.value.trim(),
      map: form.elements.map.value,
      address: form.elements.address.value.trim(),
      notes: form.elements.notes.value.trim()
    };
    var items = PRODUCTS.filter(function (p) { return qty[p.id] > 0; }).map(function (p) {
      return { name: p.name, qty: qty[p.id], subtotal: qty[p.id] * p.price };
    });
    var total = items.reduce(function (s, i) { return s + i.subtotal; }, 0);

    var ok = true;
    function fail(k, m) { showError(k, m); ok = false; }
    if (!items.length) fail('items', 'اختاري منتج واحد على الأقل');
    if (v.name.length < 2) fail('name', 'اكتبي اسمك');
    if (!/^[79]\d{7}$/.test(v.phone)) fail('phone', 'رقم عُماني من 8 أرقام يبدأ بـ 9 أو 7');
    if (v.area.length < 2) fail('area', 'اكتبي منطقتك');
    if (!v.map && v.address.length < 4) fail('location', 'حددي موقعك أو اكتبي وصف العنوان');
    if (!ok) {
      var first = form.querySelector('.om-error:not(:empty)');
      if (first) first.closest('.om-section, .om-field').scrollIntoView({ behavior: 'smooth', block: 'center' });
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      return;
    }


    // رسالة احتياطية (إذا الإرسال التلقائي غير مُعدّ أو فشل) — بدون إيموجي لأن api.whatsapp.com يحوّلها إلى (�)
    function buildMessage(orderId) {
      var lines = [
        '*طلب جديد - رشفة*',
        'رقم الطلب: ' + orderId,
        '',
        '*الاسم:* ' + v.name,
        '*الهاتف:* +968 ' + v.phone,
        '*المنطقة:* ' + v.area
      ];
      if (v.map) lines.push('*الموقع:* ' + v.map);
      if (v.address) lines.push('*العنوان:* ' + v.address);
      lines.push('', '*الطلبات:*');
      items.forEach(function (i) { lines.push('- ' + i.name + ' × ' + i.qty + ' = ' + money(i.subtotal)); });
      lines.push('', '*المجموع: ' + money(total) + '*', 'الدفع عند الاستلام');
      if (v.notes) lines.push('', '*ملاحظات:* ' + v.notes);
      return lines.join('\n');
    }

    var submitBtn = form.querySelector('.om-submit');
    var submitLabel = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.classList.add('sending');
    submitBtn.textContent = 'جاري إرسال طلبك...';

    var qtyMap = {};
    PRODUCTS.forEach(function (p) { if (qty[p.id] > 0) qtyMap[p.id] = qty[p.id]; });
    var payload = {
      name: v.name, phone: v.phone, area: v.area, map: v.map,
      address: v.address, notes: v.notes, items: qtyMap,
      website: form.elements.website.value
    };

    // الإرسال التلقائي عبر الخادم (WhatsApp Cloud API) — مع مهلة 15 ثانية
    var controller = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 15000);
    fetch(ORDER_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok && data.ok, data: data }; });
    }).catch(function () {
      return { ok: false, data: {} };
    }).then(function (result) {
      clearTimeout(timer);
      submitBtn.disabled = false;
      submitBtn.classList.remove('sending');
      submitBtn.innerHTML = submitLabel;
      if (result.ok) finish(result.data.orderId, true, result.data.customerNotified !== false);
      else finish('R' + Date.now().toString().slice(-6), false, false);
    });

    function finish(orderId, auto, customerNotified) {
      var message = buildMessage(orderId);
      lastMessage = message;
      // api.whatsapp.com بدل wa.me لأن wa.me محجوب في بعض الشبكات
      var waUrl = 'https://api.whatsapp.com/send?phone=' + WHATSAPP_NUMBER + '&text=' + encodeURIComponent(message);
      var waWebUrl = 'https://web.whatsapp.com/send?phone=' + WHATSAPP_NUMBER + '&text=' + encodeURIComponent(message);
      var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

      // حفظ الطلب في Google Sheet (إذا تم الإعداد)
      if (ORDER_ENDPOINT) {
        var body = new URLSearchParams({
          orderId: orderId, name: v.name, phone: '+968' + v.phone, area: v.area,
          map: v.map, address: v.address, notes: v.notes,
          items: items.map(function (i) { return i.name + ' × ' + i.qty; }).join('، '),
          total: total.toFixed(3)
        });
        fetch(ORDER_ENDPOINT, { method: 'POST', mode: 'no-cors', body: body }).catch(function () {});
      }

      store(STORE_KEY, { name: v.name, phone: v.phone, area: v.area, address: v.address });
      store(LAST_ORDER_KEY, { id: orderId, at: Date.now(), total: total });

      // شاشة التأكيد (الرقم معزول باتجاه LTR حتى لا ينقلب داخل الجملة العربية)
      var ltrPhone = '⁦+968 ' + v.phone + '⁩';
      done.querySelector('[data-order-id]').textContent = orderId;
      done.querySelector('[data-status-text]').textContent = auto
        ? (customerNotified
            ? 'وصلنا طلبك، وأرسلنا لك رسالة تأكيد على واتساب على رقم ' + ltrPhone + '. طلبك قيد الانتظار إلى أن نتواصل معك لتأكيده وتحديد موعد التوصيل.'
            : 'وصلنا طلبك، وراح نتواصل معك على واتساب على رقم ' + ltrPhone + ' لتأكيده وتحديد موعد التوصيل. طلبك قيد الانتظار إلى أن يتم الرد عليك.')
        : 'خطوة أخيرة: اضغطي الزر تحت لإرسال طلبك لنا على واتساب. بعدها طلبك يبقى قيد الانتظار إلى أن نرد عليك.';
      done.querySelectorAll('[data-manual-only]').forEach(function (el) { el.hidden = auto; });
      done.querySelector('[data-wa-link]').href = isMobile ? waUrl : waWebUrl;
      var alt = done.querySelector('[data-wa-web]');
      alt.href = isMobile ? waWebUrl : waUrl;
      alt.textContent = isMobile ? 'فتح واتساب ويب' : 'فتح تطبيق واتساب';
      done.querySelector('.om-copy-note').hidden = true;
      done.querySelector('[data-summary]').innerHTML =
        items.map(function (i) { return '<div><span>' + esc(i.name) + ' × ' + i.qty + '</span><span>' + money(i.subtotal) + '</span></div>'; }).join('') +
        '<div class="om-summary-total"><span>المجموع</span><span>' + money(total) + '</span></div>';
      form.hidden = true; done.hidden = false;
      modal.querySelector('.om-sheet').scrollTop = 0;
      PRODUCTS.forEach(function (p) { setQty(p.id, 0); });
      form.elements.notes.value = '';
      updatePendingBadge();
    }
  });

  /* ===== تنبيه "طلبك قيد الانتظار" عند العودة للموقع ===== */
  var badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'om-pending';
  badge.hidden = true;
  document.body.appendChild(badge);
  badge.addEventListener('click', function () { badge.classList.toggle('expanded'); });

  function updatePendingBadge() {
    var last = store(LAST_ORDER_KEY);
    var fresh = last && Date.now() - last.at < 24 * 60 * 60 * 1000;
    badge.hidden = !fresh;
    if (fresh) {
      badge.innerHTML = icons.clock + '<span>طلبك <b class="ltr">' + esc(last.id) + '</b> قيد الانتظار</span>' +
        '<small>راح نتواصل معك على واتساب قريباً</small>';
    }
  }
  updatePendingBadge();
})();
