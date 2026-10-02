/**
 * رشفة — أدوات الخادم المشتركة (تُستخدم من ملفات api/)
 *
 * التخزين: Redis من Vercel (Storage ← Upstash for Redis) عبر REST بدون مكتبات.
 * متغيرات البيئة:
 *  KV_REST_API_URL / KV_REST_API_TOKEN   (تنضاف تلقائياً لما تربط Redis بالمشروع)
 *  SESSION_SECRET                        نص عشوائي طويل لتوقيع جلسات الدخول
 *  OWNER_USERNAME / OWNER_PASSWORD       حساب المالك (مدير دائم، لا يمكن حذفه)
 */
const crypto = require('crypto');

// نقبل أي بادئة يختارها Vercel عند الربط (KV_ أو STORAGE_ أو غيرها)
function envBySuffix(suffix) {
  const key = Object.keys(process.env).find((k) => k.endsWith(suffix) && !/READ_ONLY/.test(k));
  return key ? process.env[key] : undefined;
}
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || envBySuffix('_REST_API_URL') || envBySuffix('REDIS_REST_URL');
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || envBySuffix('_REST_API_TOKEN') || envBySuffix('REDIS_REST_TOKEN');
const P = 'rashfa:';

const ROLES = { admin: 'مدير', staff: 'موظف' };
const ORDER_STATUSES = ['pending', 'confirmed', 'delivered', 'cancelled'];

// المنتجات الافتراضية — تُستخدم إذا قاعدة البيانات فاضية أو غير مربوطة
const DEFAULT_PRODUCTS = [
  { id: 'rashfa', name: 'رشفة برو', price: 1.7, label: 'الأكثر طلباً', image: 'assets/p-rashfa.jpg',
    desc: 'قهوتنا المختصة المميزة، تخمير بارد بطيء بتركيز غني وطعم عميق بلا مرارة.',
    tags: ['قهوة مختصة', 'مكونات طبيعية', 'مبرد وجاهز للشرب'], active: true, sort: 1 },
  { id: 'classic', name: 'كولد برو كلاسيك', price: 1.2, label: '', image: 'assets/p-classic.jpg',
    desc: 'نقي ومتوازن، الطعم الأصلي للقهوة الباردة كما هو.',
    tags: ['قهوة مختصة', 'مكونات طبيعية', 'مبرد وجاهز للشرب'], active: true, sort: 2 },
  { id: 'karkade', name: 'كركدية', price: 0.5, label: '', image: 'assets/p-karkade.jpg',
    desc: 'منعش وطبيعي، بديل خفيف خالٍ من الكافيين.',
    tags: ['مكونات طبيعية', 'طعم منعش', 'بارد ومنعش'], active: true, sort: 3 }
];

/* ---------------- Redis ---------------- */
function hasStore() { return !!(REDIS_URL && REDIS_TOKEN); }

async function redis(cmd) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const data = await res.json();
  if (data.error) throw new Error('redis: ' + data.error);
  return data.result;
}

async function getJSON(key, fallback) {
  const raw = await redis(['GET', P + key]);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}
async function setJSON(key, value) { return redis(['SET', P + key, JSON.stringify(value)]); }

/* ---------------- HTTP ---------------- */
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === 'object' ? b : {};
}
function clip(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
function clientIp(req) { return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'; }

/* ---------------- كلمات المرور والجلسات ---------------- */
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function checkPassword(password, salt, hash) {
  const a = Buffer.from(crypto.scryptSync(String(password), salt, 64).toString('hex'), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const b64 = (s) => Buffer.from(s).toString('base64url');
function signToken(user) {
  const payload = b64(JSON.stringify({ u: user.username, r: user.role, exp: Date.now() + 7 * 24 * 3600 * 1000 }));
  const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function readToken(token) {
  if (!token || !process.env.SESSION_SECRET) return null;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  if (!safeEqual(sig, expect)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch (e) { return null; }
}

/* ---------------- المستخدمون ---------------- */
const OWNER = String(process.env.OWNER_USERNAME || '').trim().toLowerCase();
function isOwner(username) { return !!OWNER && username === OWNER; }

async function getUser(username) {
  if (isOwner(username)) return { username, name: 'المالك', role: 'admin', owner: true };
  if (!hasStore()) return null;
  const raw = await redis(['HGET', P + 'users', username]);
  return raw ? JSON.parse(raw) : null;
}
async function listUsers() {
  const users = [];
  if (OWNER) users.push({ username: OWNER, name: 'المالك', role: 'admin', owner: true });
  if (hasStore()) {
    const flat = (await redis(['HGETALL', P + 'users'])) || [];
    for (let i = 1; i < flat.length; i += 2) {
      const u = JSON.parse(flat[i]);
      users.push({ username: u.username, name: u.name, role: u.role, createdAt: u.createdAt });
    }
  }
  return users;
}
async function saveUser(user) { return redis(['HSET', P + 'users', user.username, JSON.stringify(user)]); }
async function deleteUser(username) { return redis(['HDEL', P + 'users', username]); }

async function verifyLogin(username, password) {
  if (isOwner(username)) {
    return process.env.OWNER_PASSWORD && safeEqual(password, process.env.OWNER_PASSWORD) ? await getUser(username) : null;
  }
  const u = await getUser(username);
  return u && u.hash && checkPassword(password, u.salt, u.hash) ? u : null;
}

/**
 * يتحقق من الجلسة والصلاحية. يرجع المستخدم، أو يرسل خطأ ويرجع null.
 * roles: مثال ['admin'] أو ['admin','staff']
 */
async function requireUser(req, res, roles) {
  if (!process.env.SESSION_SECRET) { send(res, 503, { ok: false, error: 'not_configured' }); return null; }
  const auth = String(req.headers.authorization || '');
  const data = readToken(auth.replace(/^Bearer\s+/i, ''));
  if (!data) { send(res, 401, { ok: false, error: 'unauthorized' }); return null; }
  const user = await getUser(data.u); // نتأكد إن الحساب ما انحذف أو تغيّرت رتبته
  if (!user) { send(res, 401, { ok: false, error: 'unauthorized' }); return null; }
  if (roles && roles.indexOf(user.role) === -1) { send(res, 403, { ok: false, error: 'forbidden' }); return null; }
  return user;
}

/* ---------------- المنتجات ---------------- */
async function getProducts() {
  if (!hasStore()) return DEFAULT_PRODUCTS;
  const list = await getJSON('products', null);
  return Array.isArray(list) ? list : DEFAULT_PRODUCTS;
}
async function saveProducts(list) { return setJSON('products', list); }
function sortProducts(list) { return list.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)); }

/* ---------------- الطلبات ---------------- */
async function saveOrder(order) {
  await redis(['SET', P + 'order:' + order.id, JSON.stringify(order)]);
  await redis(['LPUSH', P + 'orders', order.id]);
  await redis(['LTRIM', P + 'orders', 0, 999]);
}
async function getOrder(id) {
  const raw = await redis(['GET', P + 'order:' + id]);
  return raw ? JSON.parse(raw) : null;
}
async function listOrders(limit) {
  const ids = (await redis(['LRANGE', P + 'orders', 0, (limit || 150) - 1])) || [];
  if (!ids.length) return [];
  const raws = await redis(['MGET'].concat(ids.map((id) => P + 'order:' + id)));
  return raws.filter(Boolean).map((r) => JSON.parse(r));
}
async function updateOrder(order) { return redis(['SET', P + 'order:' + order.id, JSON.stringify(order)]); }

/* ---------------- الصور ---------------- */
async function saveImage(id, dataUrl) { return redis(['SET', P + 'img:' + id, dataUrl]); }
async function getImage(id) { return redis(['GET', P + 'img:' + id]); }
async function deleteImage(id) { return redis(['DEL', P + 'img:' + id]); }

module.exports = {
  P, ROLES, ORDER_STATUSES, DEFAULT_PRODUCTS,
  hasStore, redis, send, body, clip, clientIp,
  hashPassword, signToken, requireUser, verifyLogin,
  isOwner, getUser, listUsers, saveUser, deleteUser,
  getProducts, saveProducts, sortProducts,
  saveOrder, getOrder, listOrders, updateOrder,
  saveImage, getImage, deleteImage
};
