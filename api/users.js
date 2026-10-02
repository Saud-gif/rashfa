// حسابات فريق العمل — للمدير فقط
const L = require('../lib/rashfa');

module.exports = async function handler(req, res) {
  try {
    const me = await L.requireUser(req, res, ['admin']);
    if (!me) return;

    if (req.method === 'GET') return L.send(res, 200, { ok: true, users: await L.listUsers(), roles: L.ROLES });

    if (!L.hasStore()) return L.send(res, 503, { ok: false, error: 'store_not_configured' });

    if (req.method === 'POST') {
      const b = L.body(req);
      const username = L.clip(b.username, 40).toLowerCase();
      const name = L.clip(b.name, 60);
      const role = L.ROLES[b.role] ? b.role : 'staff';
      const password = String(b.password || '');
      if (!/^[a-z0-9._-]{3,40}$/.test(username)) return L.send(res, 400, { ok: false, error: 'invalid_username' });
      if (L.isOwner(username)) return L.send(res, 400, { ok: false, error: 'owner_locked' });

      const existing = await L.getUser(username);
      if (!existing && password.length < 8) return L.send(res, 400, { ok: false, error: 'weak_password' });
      if (password && password.length < 8) return L.send(res, 400, { ok: false, error: 'weak_password' });
      if (existing && username === me.username && role !== 'admin') return L.send(res, 400, { ok: false, error: 'cannot_demote_self' });

      const user = Object.assign({}, existing || { createdAt: new Date().toISOString(), createdBy: me.username }, {
        username, name: name || username, role
      });
      if (password) Object.assign(user, L.hashPassword(password));
      await L.saveUser(user);
      return L.send(res, 200, { ok: true, users: await L.listUsers() });
    }

    if (req.method === 'DELETE') {
      const username = String((req.query && req.query.username) || '').toLowerCase();
      if (L.isOwner(username)) return L.send(res, 400, { ok: false, error: 'owner_locked' });
      if (username === me.username) return L.send(res, 400, { ok: false, error: 'cannot_delete_self' });
      await L.deleteUser(username);
      return L.send(res, 200, { ok: true, users: await L.listUsers() });
    }

    return L.send(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (err) {
    console.error('users error', err);
    return L.send(res, 500, { ok: false, error: 'server_error' });
  }
};
