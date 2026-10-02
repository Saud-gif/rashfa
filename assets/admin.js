/* رشفة — لوحة التحكم: الطلبات (مدير/موظف)، المنتجات والفريق (مدير) */
(function () {
  var KEY = 'rashfa.admin';
  var session = load();
  var orders = [], products = [], users = [], filter = 'all', pollTimer = null;

  var STATUS = { pending: 'قيد الانتظار', confirmed: 'مؤكد', delivered: 'تم التوصيل', cancelled: 'ملغي' };
  var ROLE = { admin: 'مدير', staff: 'موظف' };
  var ERRORS = {
    invalid_credentials: 'اسم المستخدم أو كلمة المرور غير صحيحة',
    too_many_attempts: 'محاولات كثيرة، حاول بعد 15 دقيقة',
    not_configured: 'لوحة التحكم غير مفعّلة بعد — راجع ملف ADMIN_SETUP.md',
    store_not_configured: 'قاعدة البيانات غير مربوطة — راجع ملف ADMIN_SETUP.md',
    unauthorized: 'انتهت الجلسة، سجّل دخول من جديد',
    forbidden: 'ما عندك صلاحية لهذا الإجراء',
    name_required: 'اكتب اسم المنتج',
    price_required: 'اكتب سعر صحيح',
    invalid_username: 'اسم المستخدم: 3 أحرف إنجليزية أو أرقام على الأقل بدون مسافات',
    weak_password: 'كلمة المرور لازم 8 أحرف على الأقل',
    owner_locked: 'حساب المالك ما يتعدّل من هنا',
    cannot_delete_self: 'ما تقدر تحذف حسابك',
    cannot_demote_self: 'ما تقدر تنزّل رتبة حسابك',
    image_too_large: 'الصورة كبيرة، جرّب صورة أصغر',
    invalid_image: 'صيغة الصورة غير مدعومة',
    network: 'تعذّر الاتصال بالخادم'
  };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) {} }
  function errText(code) { return ERRORS[code] || 'صار خطأ، حاول مرة ثانية'; }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'ad-toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'الآن';
    if (s < 3600) return 'قبل ' + Math.floor(s / 60) + ' د';
    if (s < 86400) return 'قبل ' + Math.floor(s / 3600) + ' س';
    return new Date(iso).toLocaleDateString('ar-OM', { day: 'numeric', month: 'short' }) + ' ' +
      new Date(iso).toLocaleTimeString('ar-OM', { hour: '2-digit', minute: '2-digit' });
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { Accept: 'application/json' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    if (session) headers.Authorization = 'Bearer ' + session.token;
    return fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401 && session) { logout(); }
          if (!r.ok || d.ok === false) throw new Error(d.error || 'server_error');
          return d;
        });
      }, function () { throw new Error('network'); });
  }

  /* ================= الدخول والخروج ================= */
  function showLogin() {
    $('#app').hidden = true; $('#login').hidden = false;
    clearInterval(pollTimer);
  }
  function logout() { session = null; save(null); showLogin(); }

  $('#login form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, err = $('[data-err]', f), btn = $('button', f);
    err.textContent = ''; btn.disabled = true;
    api('/api/login', { method: 'POST', body: { username: f.username.value.trim(), password: f.password.value } })
      .then(function (d) { session = { token: d.token, user: d.user }; save(session); f.password.value = ''; start(); })
      .catch(function (x) { err.textContent = errText(x.message); })
      .then(function () { btn.disabled = false; });
  });
  $('[data-logout]').addEventListener('click', logout);

  function start() {
    $('#login').hidden = true; $('#app').hidden = false;
    var isAdmin = session.user.role === 'admin';
    $('[data-me-name]').textContent = session.user.name || session.user.username;
    var role = $('[data-me-role]');
    role.textContent = ROLE[session.user.role] || session.user.role;
    role.classList.toggle('staff', !isAdmin);
    $$('[data-admin-only]').forEach(function (el) { el.hidden = !isAdmin; });
    var want = location.hash.slice(1);
    showTab(isAdmin && (want === 'products' || want === 'team') ? want : 'orders');
    loadOrders();
    clearInterval(pollTimer);
    pollTimer = setInterval(loadOrders, 30000); // تحديث تلقائي كل 30 ثانية
    if (isAdmin) { loadProducts(); loadUsers(); }
  }

  /* ================= التبويبات ================= */
  function showTab(name) {
    $$('.ad-tab').forEach(function (t) { t.setAttribute('aria-selected', String(t.getAttribute('data-tab') === name)); });
    $$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
  }
  $$('.ad-tab').forEach(function (t) { t.addEventListener('click', function () { showTab(t.getAttribute('data-tab')); }); });

  /* ================= الطلبات ================= */
  function loadOrders() {
    return api('/api/orders').then(function (d) { orders = d.orders || []; renderOrders(); })
      .catch(function (x) { $('[data-orders]').innerHTML = '<div class="ad-card ad-empty">' + esc(errText(x.message)) + '</div>'; });
  }
  function renderOrders() {
    var pending = orders.filter(function (o) { return o.status === 'pending'; }).length;
    var badge = $('[data-pending-count]');
    badge.hidden = !pending; badge.textContent = pending;
    var list = filter === 'all' ? orders : orders.filter(function (o) { return o.status === filter; });
    var box = $('[data-orders]');
    if (!list.length) { box.innerHTML = '<div class="ad-card ad-empty"><b>ما في طلبات هنا</b><p class="ad-muted">الطلبات الجديدة من الموقع تظهر هنا تلقائياً</p></div>'; return; }
    box.innerHTML = list.map(function (o) {
      var phone = String(o.phone || '').replace(/\D/g, '');
      var wa = 'https://api.whatsapp.com/send?phone=' + phone + '&text=' + encodeURIComponent('مرحباً ' + o.name + '، بخصوص طلبك ' + o.id + ' من رشفة');
      return '<article class="ad-card ad-order" data-status="' + esc(o.status) + '">' +
        '<div>' +
          '<h3>' + esc(o.name) + '<span class="id">' + esc(o.id) + ' · ' + esc(ago(o.createdAt)) + '</span></h3>' +
          '<div class="meta">' +
            '<a href="' + esc(wa) + '" target="_blank" rel="noopener" dir="ltr">' + esc(o.phone) + '</a>' +
            '<span>' + esc(o.area) + '</span>' +
            (o.map ? '<a href="' + esc(o.map) + '" target="_blank" rel="noopener">الموقع على الخريطة</a>' : '') +
            (o.address ? '<span>' + esc(o.address) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="side">' +
          '<span class="total">' + esc(o.total) + ' ر.ع</span>' +
          '<select class="ad-select" data-status-for="' + esc(o.id) + '">' +
            Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + STATUS[k] + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div class="items">' + (o.items || []).map(function (i) { return '<span>' + esc(i.name) + ' × ' + i.qty + '</span>'; }).join('') + '</div>' +
        (o.notes ? '<div class="note">ملاحظة الزبون: ' + esc(o.notes) + '</div>' : '') +
      '</article>';
    }).join('');
  }
  $('[data-orders]').addEventListener('change', function (e) {
    var sel = e.target.closest('[data-status-for]');
    if (!sel) return;
    var id = sel.getAttribute('data-status-for');
    sel.disabled = true;
    api('/api/orders', { method: 'POST', body: { id: id, status: sel.value } })
      .then(function (d) {
        orders = orders.map(function (o) { return o.id === id ? d.order : o; });
        renderOrders(); toast('تم تحديث حالة الطلب');
      })
      .catch(function (x) { toast(errText(x.message)); sel.disabled = false; });
  });
  $('[data-filter]').addEventListener('click', function (e) {
    var chip = e.target.closest('[data-f]');
    if (!chip) return;
    filter = chip.getAttribute('data-f');
    $$('[data-f]').forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
    renderOrders();
  });
  $('[data-refresh]').addEventListener('click', function () { loadOrders().then(function () { toast('تم التحديث'); }); });

  /* ================= المنتجات ================= */
  function loadProducts() {
    return api('/api/products?all=1').then(function (d) { products = d.products || []; renderProducts(); })
      .catch(function (x) { $('[data-products]').innerHTML = '<div class="ad-card ad-empty">' + esc(errText(x.message)) + '</div>'; });
  }
  function renderProducts() {
    var box = $('[data-products]');
    if (!products.length) { box.innerHTML = '<div class="ad-card ad-empty">ما في منتجات، أضف أول منتج</div>'; return; }
    box.innerHTML = products.map(function (p) {
      return '<article class="ad-card ad-product">' +
        (p.image ? '<img src="' + esc(p.image) + '" alt="">' : '<div class="ph"></div>') +
        '<div class="body">' +
          '<div class="row"><b>' + esc(p.name) + '</b><span class="pr">' + Number(p.price).toFixed(3) + ' ر.ع</span></div>' +
          '<div class="row"><span class="ad-muted">' + esc(p.label || '') + '</span>' + (p.active === false ? '<span class="hidden-tag">مخفي</span>' : '') + '</div>' +
          '<div class="acts"><button class="ad-link" type="button" data-edit="' + esc(p.id) + '">تعديل</button><button class="ad-link danger" type="button" data-del="' + esc(p.id) + '">حذف</button></div>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  var pm = $('#productModal'), pf = $('#productModal form');
  function openProduct(p) {
    pf.reset();
    $('[data-err]', pf).textContent = '';
    $('[data-title]', pf).textContent = p ? 'تعديل منتج' : 'إضافة منتج';
    pf.id.value = p ? p.id : '';
    pf.image.value = p ? (p.image || '') : '';
    pf.name.value = p ? p.name : '';
    pf.price.value = p ? Number(p.price).toFixed(3) : '';
    pf.sort.value = p ? (p.sort || '') : products.length + 1;
    pf.desc.value = p ? (p.desc || '') : '';
    pf.label.value = p ? (p.label || '') : '';
    pf.tags.value = p ? (p.tags || []).join('، ') : '';
    pf.active.checked = p ? p.active !== false : true;
    $('[data-preview]', pf).src = pf.image.value || '';
    $('[data-img-status]', pf).textContent = 'تنضغط تلقائياً قبل الرفع';
    pm.hidden = false;
    pf.name.focus();
  }
  $('[data-new-product]').addEventListener('click', function () { openProduct(null); });
  $('[data-products]').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) openProduct(products.filter(function (p) { return p.id === ed.getAttribute('data-edit'); })[0]);
    if (del) {
      var id = del.getAttribute('data-del');
      var p = products.filter(function (x) { return x.id === id; })[0];
      if (del.getAttribute('data-sure') !== '1') {
        // تأكيد بضغطة ثانية بدل نافذة confirm
        del.setAttribute('data-sure', '1'); del.textContent = 'متأكد؟ اضغط مرة ثانية';
        setTimeout(function () { del.removeAttribute('data-sure'); del.textContent = 'حذف'; }, 3500);
        return;
      }
      api('/api/products?id=' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function (d) { products = d.products; renderProducts(); toast('انحذف ' + (p ? p.name : 'المنتج')); })
        .catch(function (x) { toast(errText(x.message)); });
    }
  });

  // ضغط الصورة في المتصفح: أقصى عرض 900px، JPEG جودة 0.82
  function compress(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 900 / img.naturalWidth);
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { reject(new Error('invalid_image')); };
      img.src = URL.createObjectURL(file);
    });
  }
  $('[data-file]', pf).addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var status = $('[data-img-status]', pf);
    status.textContent = 'جاري الرفع...';
    compress(file)
      .then(function (dataUrl) {
        $('[data-preview]', pf).src = dataUrl;
        return api('/api/image', { method: 'POST', body: { dataUrl: dataUrl } });
      })
      .then(function (d) { pf.image.value = d.url; status.textContent = 'تم رفع الصورة ✓'; })
      .catch(function (x) { status.textContent = errText(x.message); });
  });
  pf.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('[type=submit]', pf), err = $('[data-err]', pf);
    err.textContent = ''; btn.disabled = true;
    api('/api/products', { method: 'POST', body: {
      id: pf.id.value || undefined, name: pf.name.value, price: pf.price.value, sort: pf.sort.value,
      desc: pf.desc.value, label: pf.label.value, tags: pf.tags.value, image: pf.image.value, active: pf.active.checked
    } })
      .then(function (d) { products = d.products; renderProducts(); pm.hidden = true; toast('تم حفظ المنتج'); })
      .catch(function (x) { err.textContent = errText(x.message); })
      .then(function () { btn.disabled = false; });
  });

  /* ================= الفريق ================= */
  function loadUsers() {
    return api('/api/users').then(function (d) { users = d.users || []; renderUsers(); })
      .catch(function (x) { $('[data-users]').innerHTML = '<div class="ad-card ad-empty">' + esc(errText(x.message)) + '</div>'; });
  }
  function renderUsers() {
    $('[data-users]').innerHTML = users.map(function (u) {
      var me = session && u.username === session.user.username;
      return '<article class="ad-card ad-user">' +
        '<div class="who"><span class="ad-avatar">' + esc((u.name || u.username).charAt(0)) + '</span>' +
          '<div><b>' + esc(u.name || u.username) + (me ? ' <span class="ad-muted">(أنت)</span>' : '') + '</b><div class="u">@' + esc(u.username) + '</div></div>' +
          '<span class="ad-role' + (u.role === 'staff' ? ' staff' : '') + '">' + (u.owner ? 'المالك' : ROLE[u.role]) + '</span></div>' +
        (u.owner ? '<span class="ad-muted">حساب ثابت</span>' :
          '<div><button class="ad-link" type="button" data-uedit="' + esc(u.username) + '">تعديل</button>' +
          (me ? '' : '<button class="ad-link danger" type="button" data-udel="' + esc(u.username) + '">حذف</button>') + '</div>') +
      '</article>';
    }).join('');
  }
  var um = $('#userModal'), uf = $('#userModal form');
  function openUser(u) {
    uf.reset();
    $('[data-err]', uf).textContent = '';
    $('[data-title]', uf).textContent = u ? 'تعديل عضو' : 'إضافة عضو';
    uf.name.value = u ? (u.name || '') : '';
    uf.username.value = u ? u.username : '';
    uf.username.readOnly = !!u;
    uf.role.value = u ? u.role : 'staff';
    $('[data-pass-hint]', uf).textContent = u ? '(اتركها فاضية إذا ما تبي تغيّرها)' : '(8 أحرف على الأقل)';
    um.hidden = false;
    (u ? uf.name : uf.name).focus();
  }
  $('[data-new-user]').addEventListener('click', function () { openUser(null); });
  $('[data-users]').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-uedit]'), del = e.target.closest('[data-udel]');
    if (ed) openUser(users.filter(function (u) { return u.username === ed.getAttribute('data-uedit'); })[0]);
    if (del) {
      if (del.getAttribute('data-sure') !== '1') {
        del.setAttribute('data-sure', '1'); del.textContent = 'متأكد؟ اضغط مرة ثانية';
        setTimeout(function () { del.removeAttribute('data-sure'); del.textContent = 'حذف'; }, 3500);
        return;
      }
      api('/api/users?username=' + encodeURIComponent(del.getAttribute('data-udel')), { method: 'DELETE' })
        .then(function (d) { users = d.users; renderUsers(); toast('انحذف العضو'); })
        .catch(function (x) { toast(errText(x.message)); });
    }
  });
  uf.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('[type=submit]', uf), err = $('[data-err]', uf);
    err.textContent = ''; btn.disabled = true;
    api('/api/users', { method: 'POST', body: { name: uf.name.value, username: uf.username.value.trim(), password: uf.password.value, role: uf.role.value } })
      .then(function (d) { users = d.users; renderUsers(); um.hidden = true; toast('تم حفظ العضو'); })
      .catch(function (x) { err.textContent = errText(x.message); })
      .then(function () { btn.disabled = false; });
  });

  /* إغلاق النوافذ */
  $$('.ad-modal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-cancel]')) m.hidden = true; });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $$('.ad-modal').forEach(function (m) { m.hidden = true; }); });

  if (session) start(); else showLogin();
})();
