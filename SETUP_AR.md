# SHEROKEY — تعليمات التشغيل

## 🎯 المشكلة والحل

### المشكلة السابقة:
عند تحميل الملفات، لم يظهر أي محتوى لأن التطبيق كان يحاول الاتصال بـ backend غير موجود.

### الحل:
تم تعديل `SERVER_MODE` ليعمل في وضعين:
1. **بدون backend** (sandbox mode): يستخدم بيانات تجريبية من seed data
2. **مع backend** (server mode): يستخدم بيانات من PostgreSQL

## 🚀 التشغيل السريع

### الطريقة 1: وضع التطوير (مع بيانات تجريبية)

```bash
# تثبيت الحزم
npm install

# تشغيل السيرفر
npm run dev

# افتح المتصفح على:
http://localhost:5173
```

**النتيجة:** سترى 8 منتجات تجريبية، 5 فئات، ويمكنك تسجيل الدخول بحسابات تجريبية.

### الطريقة 2: وضع الإنتاج (مع backend)

```bash
# 1. إعداد PostgreSQL
createdb sherokey
psql sherokey -f migrations/0000_init.sql
psql sherokey -f migrations/0001_broadcast_notifications.sql

# 2. إنشاء ملف .env
cp .env.example .env
# عدّل DATABASE_URL والبيانات الأخرى

# 3. إنشاء حساب OWNER
npx tsx server/scripts.ts owner your-email@domain.com 'YourPassword123!'

# 4. بناء التطبيق
npm run build

# 5. تشغيل السيرفر
node --env-file=.env --import=tsx server/entry.ts

# 6. افتح المتصفح على:
http://localhost:8080
```

## 🔑 الحسابات التجريبية (للتطوير فقط)

| الدور | البريد | كلمة المرور |
|-------|--------|-------------|
| OWNER | owner@sherokey.com | Owner@2024 |
| ADMIN | admin@sherokey.com | Admin@2024 |
| SUPPORT | support@sherokey.com | Support@2024 |
| CUSTOMER | demo@sherokey.com | Demo@2024 |

## 📦 الملفات المُنتجة

بعد `npm run build`، ستجد:
- `dist/index.html` — الصفحة الرئيسية
- `dist/assets/` — ملفات JavaScript و CSS
- `dist/robots.txt` — لمحركات البحث
- `dist/sitemap.xml` — خريطة الموقع

## 🌐 النشر

### الخيار 1: Vercel
```bash
vercel deploy
```

### الخيار 2: Netlify
```bash
netlify deploy --prod
```

### الخيار 3: سيرفر خاص
```bash
npm run build
# ارفع مجلد dist/ إلى السيرفر
# شغّل backend بشكل منفصل
```

## ⚙️ المتغيرات البيئية

انظر `.env.example` لجميع المتغيرات المطلوبة.

### المتغيرات الأساسية:
- `DATABASE_URL` — اتصال PostgreSQL
- `AUTH_SECRET` — مفتاح تشفير الجلسات
- `RESEND_API_KEY` — مفتاح إرسال البريد
- `STRIPE_SECRET_KEY` — مفتاح Stripe
- `PAYPAL_CLIENT_ID` — معرف PayPal

## 🧪 الاختبار

```bash
# فحص الأنواع
npm run typecheck

# تشغيل الاختبارات
npm test

# بناء الإنتاج
npm run build
```

## 📝 ملاحظات مهمة

1. **في وضع التطوير:** التطبيق يستخدم بيانات تجريبية من localStorage
2. **في وضع الإنتاج بدون VITE_API_URL:** التطبيق يستخدم sandbox mode
3. **في وضع الإنتاج مع VITE_API_URL:** التطبيق يتصل بالـ backend الحقيقي
4. **بيانات الدفع:** Stripe/PayPal/MIR تحتاج credentials حقيقية للعمل
5. **البريد الإلكتروني:** يحتاج RESEND_API_KEY أو SMTP credentials

## 🆘 الدعم

- البريد: support@sherokey.com
- Telegram: @arius801
