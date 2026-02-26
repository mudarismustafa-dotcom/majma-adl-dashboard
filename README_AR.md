# مجمع العدل السكني — نسخة Online (Cloudflare Pages + D1)

## الفكرة
- الواجهة (HTML/CSS/JS) مثل ما هي
- تخزين البيانات صار Online داخل Cloudflare D1
- تسجيل دخول متعدد المستخدمين (افتراضي: admin / @1000@)
- التطبيق يبقى يشتغل Offline كـ fallback إذا انقطع النت

## خطوات التشغيل على Cloudflare (مرة واحدة)
1) Cloudflare Dashboard → Workers & Pages → D1
2) Create database باسم: majma_adl_db
3) انسخ database_id وضعه داخل wrangler.toml (اختياري) أو اربطه من إعدادات Pages

4) Pages → مشروعك → Settings → Functions → D1 bindings
   - Variable name: DB
   - Database: majma_adl_db

5) Deploy جديد للمشروع.

## API
- POST /api/auth/login  (username, password) → token
- GET  /api/db          → JSON DB
- PUT  /api/db          → حفظ JSON DB
- GET/POST/DELETE /api/users (Admin فقط)

> ملاحظة أمنية: هذا نظام بسيط وعملي لمشروع داخلي.
