/**
 * رشفة — استقبال الطلبات وإرسالها تلقائياً عبر WhatsApp Cloud API (Vercel Serverless Function)
 *
 * يرسل رسالتين:
 *  1. لصاحبة المشروع (OWNER_NUMBER): تفاصيل الطلب كاملة
 *  2. للزبونة (الرقم اللي كتبته في النموذج): تأكيد أن طلبها وصل وقيد الانتظار
 *
 * متغيرات البيئة المطلوبة في Vercel (Settings ← Environment Variables):
 *  WA_TOKEN             توكن دائم من Meta (System User token)
 *  WA_PHONE_NUMBER_ID   معرّف رقم الإرسال في WhatsApp Cloud API
 *  OWNER_NUMBER         رقم استلام الطلبات بالصيغة الدولية بدون + (مثال: 96893933166)
 *  WA_TEMPLATE_OWNER    اسم قالب إشعار الطلب لصاحبة المشروع (مثال: rashfa_new_order)
 *  WA_TEMPLATE_CUSTOMER اسم قالب تأكيد الطلب للزبونة (مثال: rashfa_order_received)
 * اختياري:
 *  WA_TEMPLATE_LANG     لغة القوالب (الافتراضي ar)
 *  WA_API_VERSION       نسخة Graph API (الافتراضي v23.0)
 *
 * التفاصيل الكاملة للإعداد في WHATSAPP_SETUP.md
 */

// الأسعار هنا هي المرجع — لا نثق بالأسعار القادمة من المتصفح
const PRODUCTS = {
  rashfa:  { name: 'رشفة برو', price: 1.7 },
  classic: { name: 'كولد برو كلاسيك', price: 1.2 },
  karkade: { name: 'كركدية', price: 0.5 }
};

// قيم القوالب في واتساب لا تقبل أسطر جديدة ولا أكثر من 4 مسافات متتالية ولا قيمة فارغة
function param(value, max) {
  const text = String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max || 300);
  return { type: 'text', text: text || '-' };
}

function toLatinDigits(s) {
  return String(s || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}

async function sendTemplate(to, template, params) {
  const version = process.env.WA_API_VERSION || 'v23.0';
  const url = `https://graph.facebook.com/${version}/${process.env.WA_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: template,
        language: { code: process.env.WA_TEMPLATE_LANG || 'ar' },
        components: [{ type: 'body', parameters: params }]
      }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data.error && data.error.message) || `WhatsApp API ${res.status}`);
    err.details = data.error;
    throw err;
  }
  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const required = ['WA_TOKEN', 'WA_PHONE_NUMBER_ID', 'OWNER_NUMBER', 'WA_TEMPLATE_OWNER', 'WA_TEMPLATE_CUSTOMER'];
  if (required.some((k) => !process.env[k])) {
    // غير مُعدّ بعد — المتصفح يرجع لطريقة رابط واتساب
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'bad_request' });

  // حقل مخفي لصدّ البوتات
  if (body.website) return res.status(200).json({ ok: true, orderId: 'R000000', customerNotified: false });

  const name = String(body.name || '').trim();
  let phone = toLatinDigits(body.phone).replace(/\D/g, '');
  if (phone.startsWith('00968')) phone = phone.slice(5);
  else if (phone.startsWith('968') && phone.length === 11) phone = phone.slice(3);
  const area = String(body.area || '').trim();
  const map = /^https:\/\/maps\.google\.com\/\?q=-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(body.map || '') ? body.map : '';
  const address = String(body.address || '').trim();
  const notes = String(body.notes || '').trim();

  const items = [];
  const rawItems = body.items && typeof body.items === 'object' ? body.items : {};
  Object.keys(rawItems).forEach((id) => {
    const qty = parseInt(rawItems[id], 10);
    if (PRODUCTS[id] && qty > 0 && qty <= 50) items.push({ name: PRODUCTS[id].name, qty, subtotal: qty * PRODUCTS[id].price });
  });

  const errors = [];
  if (name.length < 2 || name.length > 80) errors.push('name');
  if (!/^[79]\d{7}$/.test(phone)) errors.push('phone');
  if (area.length < 2 || area.length > 120) errors.push('area');
  if (!map && address.length < 4) errors.push('location');
  if (!items.length) errors.push('items');
  if (errors.length) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });

  const total = items.reduce((s, i) => s + i.subtotal, 0).toFixed(3);
  const orderId = 'R' + Date.now().toString().slice(-6);
  const itemsText = items.map((i) => `${i.name} × ${i.qty}`).join('، ');
  const customerNumber = '968' + phone;

  // 1) إشعار صاحبة المشروع — هذا الأهم، إذا فشل نرجع خطأ حتى لا يضيع الطلب
  try {
    await sendTemplate(process.env.OWNER_NUMBER, process.env.WA_TEMPLATE_OWNER, [
      param(orderId, 20),
      param(name, 80),
      param('+' + customerNumber, 20),
      param(area, 120),
      param(map || 'لم يُحدد', 120),
      param(address || '-', 300),
      param(itemsText, 300),
      param(total, 20),
      param(notes || '-', 300)
    ]);
  } catch (err) {
    console.error('owner notification failed', err.message, JSON.stringify(err.details || {}));
    return res.status(502).json({ ok: false, error: 'owner_send_failed' });
  }

  // 2) تأكيد للزبونة — إذا فشل، الطلب وصل لصاحبة المشروع على أي حال
  let customerNotified = true;
  try {
    await sendTemplate(customerNumber, process.env.WA_TEMPLATE_CUSTOMER, [
      param(name, 80),
      param(orderId, 20),
      param(total, 20)
    ]);
  } catch (err) {
    customerNotified = false;
    console.error('customer confirmation failed', err.message, JSON.stringify(err.details || {}));
  }

  return res.status(200).json({ ok: true, orderId, total, customerNotified });
};
