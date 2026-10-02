// تسجيل دخول فريق العمل — يرجع جلسة صالحة 7 أيام
const L = require('../lib/rashfa');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return L.send(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!L.isConfigured()) return L.send(res, 503, { ok: false, error: 'not_configured' });

  const b = L.body(req);
  const username = L.clip(b.username, 40).toLowerCase();
  const password = String(b.password || '').slice(0, 200);
  if (!username || !password) return L.send(res, 400, { ok: false, error: 'missing' });

  // حماية من التخمين: 10 محاولات لكل IP كل 15 دقيقة
  if (L.hasStore()) {
    const key = L.P + 'login:' + L.clientIp(req);
    const tries = await L.redis(['INCR', key]);
    if (tries === 1) await L.redis(['EXPIRE', key, 900]);
    if (tries > 10) return L.send(res, 429, { ok: false, error: 'too_many_attempts' });
  }

  const user = await L.verifyLogin(username, password);
  if (!user) return L.send(res, 401, { ok: false, error: 'invalid_credentials' });

  return L.send(res, 200, {
    ok: true,
    token: L.signToken(user),
    user: { username: user.username, name: user.name, role: user.role, owner: !!user.owner }
  });
};
