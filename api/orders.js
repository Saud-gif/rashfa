// الطلبات المحفوظة — للمدير والموظف: عرض وتغيير الحالة
const L = require('../lib/rashfa');

module.exports = async function handler(req, res) {
  try {
    const me = await L.requireUser(req, res, ['admin', 'staff']);
    if (!me) return;
    if (!L.hasStore()) return L.send(res, 503, { ok: false, error: 'store_not_configured' });

    if (req.method === 'GET') return L.send(res, 200, { ok: true, orders: await L.listOrders(200) });

    if (req.method === 'POST') {
      const b = L.body(req);
      const order = await L.getOrder(L.clip(b.id, 20));
      if (!order) return L.send(res, 404, { ok: false, error: 'not_found' });
      if (L.ORDER_STATUSES.indexOf(b.status) === -1) return L.send(res, 400, { ok: false, error: 'invalid_status' });
      order.status = b.status;
      order.history = (order.history || []).concat({ status: b.status, by: me.username, at: new Date().toISOString() }).slice(-20);
      if (typeof b.note === 'string') order.staffNote = L.clip(b.note, 300);
      await L.updateOrder(order);
      return L.send(res, 200, { ok: true, order });
    }

    return L.send(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (err) {
    console.error('orders error', err);
    return L.send(res, 500, { ok: false, error: 'server_error' });
  }
};
