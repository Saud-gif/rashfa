/**
 * رشفة — حفظ الطلبات في Google Sheet
 *
 * طريقة التركيب (مرة وحدة فقط):
 * 1. افتحي Google Sheet جديد وسمّيه "طلبات رشفة"
 * 2. من القائمة: Extensions (الإضافات) ← Apps Script
 * 3. احذفي الكود الموجود والصقي هذا الملف كامل، ثم احفظي
 * 4. اضغطي Deploy (نشر) ← New deployment (نشر جديد)
 *    - Select type: Web app
 *    - Execute as: Me (أنا)
 *    - Who has access: Anyone (أي شخص)
 * 5. اضغطي Deploy، وافقي على الصلاحيات، وانسخي رابط Web app
 * 6. الصقي الرابط في assets/order.js مكان ORDER_ENDPOINT = ''
 *
 * كل طلب جديد يظهر كسطر في الشيت، وعمود "الحالة" تقدرين تغيّرينه بنفسك
 * (قيد الانتظار ← تم التأكيد ← تم التوصيل).
 */
var HEADERS = ['التاريخ', 'رقم الطلب', 'الاسم', 'الهاتف', 'المنطقة', 'الموقع (خريطة)', 'العنوان', 'الطلبات', 'المجموع (ر.ع)', 'ملاحظات', 'الحالة'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#3E0F1C').setFontColor('#FAF4E9');
      sheet.setFrozenRows(1);
      sheet.setRightToLeft(true);
    }
    var p = e.parameter;
    sheet.appendRow([
      new Date(), p.orderId, p.name, "'" + p.phone, p.area, p.map, p.address,
      p.items, Number(p.total), p.notes, 'قيد الانتظار'
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
