// صور المنتجات: رفع (للمدير) وعرض (للجميع). الصورة تنضغط في المتصفح قبل الرفع.
const crypto = require('crypto');
const L = require('../lib/rashfa');

const MAX_BYTES = 500 * 1024; // حد Upstash للطلب الواحد 1MB، والـ base64 يكبّر الحجم الثلث

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const id = String((req.query && req.query.id) || '');
      if (!/^[a-f0-9]{16,40}$/.test(id) || !L.hasStore()) { res.statusCode = 404; return res.end(); }
      const dataUrl = await L.getImage(id);
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
      if (!m) { res.statusCode = 404; return res.end(); }
      const buf = Buffer.from(m[2], 'base64');
      res.statusCode = 200;
      res.setHeader('Content-Type', m[1]);
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.end(buf);
    }

    if (req.method === 'POST') {
      const user = await L.requireUser(req, res, ['admin']);
      if (!user) return;
      if (!L.hasStore()) return L.send(res, 503, { ok: false, error: 'store_not_configured' });
      const dataUrl = String(L.body(req).dataUrl || '');
      const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!m) return L.send(res, 400, { ok: false, error: 'invalid_image' });
      if (Buffer.byteLength(m[2], 'base64') > MAX_BYTES) return L.send(res, 413, { ok: false, error: 'image_too_large' });
      const id = crypto.randomBytes(12).toString('hex');
      await L.saveImage(id, dataUrl);
      return L.send(res, 200, { ok: true, url: '/api/image?id=' + id });
    }

    return L.send(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (err) {
    console.error('image error', err);
    return L.send(res, 500, { ok: false, error: 'server_error' });
  }
};
