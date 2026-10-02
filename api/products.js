// المنتجات: عرض للجميع، وإضافة/تعديل/حذف للمدير فقط
const L = require('../lib/rashfa');

function cleanProduct(input, existing) {
  const p = Object.assign({}, existing || {});
  p.name = L.clip(input.name, 60);
  p.desc = L.clip(input.desc, 240);
  p.label = L.clip(input.label, 30);
  p.price = Math.round(Math.max(0, Math.min(999, parseFloat(input.price) || 0)) * 1000) / 1000;
  p.tags = (Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(/[،,]/))
    .map((t) => L.clip(t, 30)).filter(Boolean).slice(0, 5);
  p.active = input.active !== false;
  p.sort = parseInt(input.sort, 10) || 0;
  const img = String(input.image || '');
  if (/^assets\/[\w.-]+\.(jpe?g|png|webp)$/i.test(img) || /^\/api\/image\?id=[a-f0-9]{16,40}$/.test(img)) p.image = img;
  return p;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const all = req.query && req.query.all === '1';
      let list = L.sortProducts(await L.getProducts());
      if (all) {
        const user = await L.requireUser(req, res, ['admin']);
        if (!user) return;
      } else {
        list = list.filter((p) => p.active !== false);
        res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok: true, products: list }));
    }

    const user = await L.requireUser(req, res, ['admin']);
    if (!user) return;
    if (!L.hasStore()) return L.send(res, 503, { ok: false, error: 'store_not_configured' });

    let list = await L.getProducts();

    if (req.method === 'POST') {
      const input = L.body(req);
      const existing = input.id ? list.find((p) => p.id === input.id) : null;
      const product = cleanProduct(input, existing);
      if (product.name.length < 2) return L.send(res, 400, { ok: false, error: 'name_required' });
      if (!(product.price > 0)) return L.send(res, 400, { ok: false, error: 'price_required' });
      if (existing) {
        // إذا تغيّرت الصورة نحذف القديمة المرفوعة
        if (existing.image !== product.image && /^\/api\/image\?id=/.test(existing.image || '')) {
          await L.deleteImage(existing.image.split('id=')[1]);
        }
        list = list.map((p) => (p.id === existing.id ? product : p));
      } else {
        product.id = 'p' + Date.now().toString(36);
        if (!product.sort) product.sort = list.length + 1;
        list.push(product);
      }
      product.updatedAt = new Date().toISOString();
      product.updatedBy = user.username;
      await L.saveProducts(list);
      return L.send(res, 200, { ok: true, product, products: L.sortProducts(list) });
    }

    if (req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || '');
      const target = list.find((p) => p.id === id);
      if (!target) return L.send(res, 404, { ok: false, error: 'not_found' });
      if (/^\/api\/image\?id=/.test(target.image || '')) await L.deleteImage(target.image.split('id=')[1]);
      list = list.filter((p) => p.id !== id);
      await L.saveProducts(list);
      return L.send(res, 200, { ok: true, products: L.sortProducts(list) });
    }

    return L.send(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (err) {
    console.error('products error', err);
    return L.send(res, 500, { ok: false, error: 'server_error' });
  }
};
