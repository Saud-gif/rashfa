/* رشفة — تحميل المنتجات من قاعدة البيانات (لوحة التحكم) وعرضها في الموقع.
   إذا ما في قاعدة بيانات أو فشل الطلب، يبقى المحتوى المكتوب في الصفحة كما هو. */
(function () {
  window.rashfaCatalog = (location.protocol === 'file:' ? Promise.resolve(null) :
    fetch('/api/products', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && Array.isArray(d.products) && d.products.length ? d.products : null; })
      .catch(function () { return null; }));

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function price(p) { return Number(p.price).toFixed(3); }

  var ICONS = {
    bean: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><ellipse cx="12" cy="12" rx="6" ry="9" transform="rotate(30 12 12)"/><path d="M9 5c3 3 3 11 6 14"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15z"/><path d="M5 19l9-9"/></svg>',
    snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7M9 4l3 2 3-2M9 20l3-2 3 2"/></svg>',
    flower: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2.5"/><path d="M12 9.5C10 6 10 3 12 3s2 3 0 6.5M14.4 11.2c2.6-2.9 5.4-3.7 6-1.8s-2.2 3.2-6 2.6M13.5 14.2c1.4 3.6 1 6.4-1 6.3s-2.1-3-.5-6.3M10.5 14.2c-3.4 1.9-6.3 1.8-6.4-.2s2.7-2.6 6.4-1.4"/></svg>',
    drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3C12 3 6 10.5 6 14.5a6 6 0 0012 0C18 10.5 12 3 12 3z"/></svg>'
  };
  function tagIcon(t) {
    if (/قهوة|بن/.test(t)) return ICONS.bean;
    if (/طبيع|مكون/.test(t)) return ICONS.leaf;
    if (/بارد|مبرد|ثلج/.test(t)) return ICONS.snow;
    if (/منعش|طعم|زهر/.test(t)) return ICONS.flower;
    return ICONS.drop;
  }
  var plus = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  function card(p) {
    return '<article class="product' + (p.label ? ' featured' : '') + '" data-reveal>' +
      '<div class="product-media">' +
        (p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' : '') +
        (p.label ? '<span class="label">' + esc(p.label) + '</span>' : '') +
      '</div>' +
      '<div class="product-body">' +
        '<h3 class="product-name">' + esc(p.name) + '</h3>' +
        (p.desc ? '<p class="product-desc">' + esc(p.desc) + '</p>' : '') +
        '<ul class="product-tags">' + (p.tags || []).map(function (t) { return '<li>' + tagIcon(t) + esc(t) + '</li>'; }).join('') + '</ul>' +
        '<div class="product-foot">' +
          '<div class="price"><b data-count="' + price(p) + '">' + price(p) + '</b><small>ر.ع</small></div>' +
          '<a class="btn btn-primary product-btn" data-order="' + esc(p.id) + '" href="https://api.whatsapp.com/send?phone=96893933166" target="_blank" rel="noopener">' + plus + 'اطلب</a>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function row(p) {
    return '<li>' +
      '<div class="pl-row"><span class="pl-name">' + esc(p.name) + (p.label ? ' <em>' + esc(p.label) + '</em>' : '') + '</span>' +
      '<span class="pl-dots"></span><span class="pl-price">' + price(p) + ' <small>ر.ع</small></span></div>' +
      (p.desc ? '<p>' + esc(p.desc) + '</p>' : '') +
    '</li>';
  }

  window.rashfaCatalog.then(function (list) {
    if (!list) return;
    var grid = document.querySelector('[data-catalog="cards"]');
    if (grid) {
      grid.innerHTML = list.map(card).join('');
      if (window.rashfaEnhance) window.rashfaEnhance(grid);
    }
    var ul = document.querySelector('[data-catalog="list"]');
    if (ul) ul.innerHTML = list.map(row).join('');
  });
})();
