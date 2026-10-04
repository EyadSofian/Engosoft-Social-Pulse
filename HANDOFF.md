# تسليم Engosoft Social Pulse

تاريخ التسليم: 4 أكتوبر 2026. هذا مشروع مستقل عن Engosoft Insights Hub؛ استُخدم Insights Hub فقط لفحص طريقة الربط ومتغيرات الإنتاج.

## أماكن المشروع

| المورد | المكان |
| --- | --- |
| الكود | مستودع GitHub خاص: https://github.com/EyadSofian/Engosoft-Social-Pulse |
| التطبيق | https://web-production-d07de.up.railway.app |
| قالب الكاليندر | https://web-production-d07de.up.railway.app/calendar-template.xlsx |
| Railway | مشروع `Engosoft-Social-Pulse`، خدمة `web`، بيئة `production` |
| قاعدة البيانات | SQLite على volume دائم `/data`؛ المسار `/data/social-pulse.sqlite` |

المستودع على GitHub **خاص**. نُشر الإصدار الأول من المصدر المحلي باستخدام Railway CLI. ربط Railway بمصدر GitHub للتنزيل التلقائي فشل برسالة `User does not have access to the repo`؛ يحتاج مالك GitHub منح Railway GitHub App صلاحية هذا المستودع الخاص من إعدادات GitHub App، ثم إعادة ربط المصدر من Railway. الدفع إلى GitHub وحده لا ينشر تحديثًا جديدًا حاليًا.

## حالة المنصات في الإنتاج

| المنصة | الحالة يوم التسليم | المطلوب للوصول للبيانات الكاملة |
| --- | --- | --- |
| Facebook | **متصل**؛ جُلب 150 بوست حقيقي من صفحات Meta | صلاحيات Meta إضافية لبعض likes/comments/insights. الحقول غير المتاحة تظهر `—`. |
| Instagram | الموصل موجود وفُحص؛ **لم يصل لمنشورات** الحسابات المرئية بالتوكن الحالي | ربط حساب Instagram Professional بصفحة Facebook ومنح توكن Meta صلاحيات قراءة media/insights المناسبة، ثم إعادة المزامنة. |
| TikTok | الموصل جاهز؛ **لم يتصل ببيانات الفيديو** | OAuth user token من TikTok Display API بصلاحية `video.list`، مع refresh token وبيانات التطبيق للتجديد. توكن TikTok الموجود في Insights Hub خاص بـMarketing Ads ولا يحقق هذا الغرض. |
| Snapchat | الموصل جاهز؛ **لم يتصل ببيانات Public Profile** | `SNAP_PROFILE_ID` وتوكن Public Profile API بصلاحية `snapchat-profile-api`، وبيانات OAuth للتجديد. لم تظهر متغيرات Snapchat هذه في خدمة Insights Hub على Railway. |
| Website / GA4 | الموصل جاهز؛ **لم يتصل بالموقع** | GA4 property ID وOAuth refresh token بصلاحية `analytics.readonly`. متغيرات Insights Hub الحالية لـGoogle Ads، ولا تكفي لـGA4. |
| X | مؤجل حسب طلبك | حساب وصلاحيات X عند إضافتها لاحقًا. |

لا تُعرض أرقام تجريبية على أنها بيانات حقيقية. حالة كل موصل ورسالة الخطأ/الصلاحيات تظهر في تبويب **الربط والمنصات**.

## ما تم إنجازه

- واجهة عربية تشمل نظرة عامة، أداء البوستات، مقارنة شهرية، كاليندر، تنبيهات، وتبويب الربط.
- قالب XLSX بورقتَي `Calendar` و`Guide`، مع استيراد XLSX/CSV ومنع تكرار الصفوف.
- مطابقة دقيقة للبوست المجدول مع المنشور المرصود عبر ID أو الرابط، مع تأكيد يدوي قبل اعتباره منشورًا.
- تذكير قبل الموعد بساعة، وتنبيه بعد الموعد و15 دقيقة إذا لم يُؤكد النشر. إن تعطّل المصدر يظهر طلب مراجعة يدوي بدل الجزم بعدم النشر.
- تنبيهات داخل التطبيق، وتنبيهات المتصفح عند فتحه وإعطاء الإذن. إرسال Telegram اختياري إذا ضُبط بوت وChat ID.
- مزامنة عند بدء السيرفر وكل 30 دقيقة، مع زر تحديث يدوي. بيانات الخطة والبوستات والتوكنات المجددة مشفرة في SQLite على volume.
- رمز دخول يحمي `/api/*` باستثناء `/api/health`. الواجهة تحفظه في `sessionStorage` لجلسة المتصفح فقط.

التطبيق **يرصد ويخطط وينبّه**؛ لا ينشر البوستات تلقائيًا على المنصات. التقويم يبدأ فارغًا حتى يرفع الفريق الخطة.

## متغيرات Railway

ضُبطت في خدمة `web` على بيئة `production`: `META_ACCESS_TOKEN`, `META_API_VERSION`, `TOKEN_ENCRYPTION_KEY`, `DASHBOARD_ADMIN_SECRET`, `HOST=0.0.0.0`, `DATA_FILE=/data/social-pulse.sqlite`, `BUSINESS_TIME_ZONE=Africa/Cairo`, `ALERT_GRACE_MINUTES=15`. توكن Meta وإصدار API مطابقان لخدمة Insights Hub المرجعية.

المتغيرات المطلوبة عند إكمال الربط:

| منصة | أسماء المتغيرات |
| --- | --- |
| Meta | `META_PAGE_IDS` اختياريًا لتقييد الصفحات؛ صلاحيات التوكن هي الأهم |
| TikTok | `TIKTOK_DISPLAY_ACCESS_TOKEN`, `TIKTOK_DISPLAY_REFRESH_TOKEN`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| Snapchat | `SNAP_PROFILE_ACCESS_TOKEN`, `SNAP_PROFILE_REFRESH_TOKEN`, `SNAP_PROFILE_ID`, `SNAP_CLIENT_ID`, `SNAP_CLIENT_SECRET` |
| GA4 | `GA4_PROPERTY_ID`, `GOOGLE_ANALYTICS_CLIENT_ID`, `GOOGLE_ANALYTICS_CLIENT_SECRET`, `GOOGLE_ANALYTICS_REFRESH_TOKEN` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |

لا تضف أسرارًا إلى GitHub أو ملف التقويم. ملف `.env.production.local` محلي وخارج Git؛ يحتوي رمز دخول الإنتاج. يمكن لمالك المشروع قراءته محليًا أو من متغير Railway `DASHBOARD_ADMIN_SECRET`. لا ترسل الرمز في الشات أو تضعه في توثيق الفريق.

## تشغيل وتحديث

من مجلد المشروع:

```bash
npm install
npm test
npm run build
git push origin main
railway up --service web --environment production --detach
```

رابط الصحة `/api/health` يرجع `200`، والواجهة ترجع `200`، و`/api/dashboard` يرجع `401` بلا رمز و`200` معه. تأكد بعد كل نشر أن تبويب الربط يعرض آخر مزامنة وأن الكاليندر لم يفقد بياناته. احتفظ بنسخ احتياطية من SQLite والـvolume قبل أي تغيير كبير في التخزين. شغّل نسخة واحدة فقط من الخدمة ما دام التخزين SQLite محليًا.

## فحص التسليم

`npm test`: 8 اختبارات ناجحة. `npm run build`: ناجح. `npm audit`: بلا ثغرات معلنة وقت الفحص. deployment الإنتاج `SUCCESS`. فُحصت الصفحة العامة وقالب XLSX ونقاط الـAPI الموثّقة، وفُحص وجود ملفات SQLite على volume `/data`.

## تنبيه أمني

ظهر توكن Meta الحالي في خرج أداة داخل جلسة العمل أثناء مراجعة إعدادات Railway. لم يُرفع إلى GitHub، لكن يُنصح بتدويره من Meta ثم تحديث `META_ACCESS_TOKEN` في **Insights Hub** و**Social Pulse** معًا. جرى تدوير رمز دخول لوحة Social Pulse ومفتاح تشفير التوكنات بعد ظهور قيمتيهما في الخرج؛ القيم الظاهرة سابقًا لم تعد صالحة.
