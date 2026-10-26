# تسليم Engosoft Social Pulse

آخر تحقق: 27 أكتوبر 2026، بتوقيت القاهرة. المشروع مستقل عن Engosoft Insights Hub.

## الروابط والمكان

| المورد | المكان |
| --- | --- |
| الكود المحلي | `/Users/eyad/media genrator /Engosoft-Social-Pulse` |
| GitHub الخاص | https://github.com/EyadSofian/Engosoft-Social-Pulse |
| التطبيق | https://web-production-d07de.up.railway.app |
| صفحة تفاصيل البوستات | https://web-production-d07de.up.railway.app/#/content |
| صفحة حالة الربط | https://web-production-d07de.up.railway.app/#/connections |
| قالب الكاليندر | https://web-production-d07de.up.railway.app/calendar-template.xlsx |
| Railway | مشروع `Engosoft-Social-Pulse`، خدمة `web`، بيئة `production` |
| التخزين | Postgres عبر شبكة Railway الداخلية، وvolume دائم `/data` للصور والملفات ونسخة SQLite القديمة |

النسخة المنشورة من commit `964c8f1`، ونشر Railway `f7b5248c-5e07-43e4-8475-f8281bdae8eb` بحالة `SUCCESS`. خدمة `web` مرتبطة بفرع `main`؛ يطلق `git push` نشرًا جديدًا. قد يطلب Railway موافقة على كوميتات حساب GitHub غير المرتبط بحساب Railway عضو في المشروع.

## حالة البيانات الحقيقية

| المصدر | الحالة المتحققة | حدود القراءة الحالية |
| --- | --- | --- |
| Facebook | متصل؛ 151 بوست محفوظًا من صفحة Engosoft. آخر مزامنة جلبت 150. | المشاهدات والمشاهدون الفريدون متاحون؛ بعض أرقام التفاعل قد لا تمنحها صلاحيات Meta الحالية. |
| Instagram | متصل؛ 301 بوست محفوظًا من Engosoft وEngosoft Saudi Arabia. | صفحات Engosoft Mechanical وEngosoft Careers وكورسات مدني وانشائي لا يظهر لها حساب Instagram Professional مرتبط بالتوكن الحالي. |
| TikTok | **الحساب الرسمي `@engosoft_official` متصل** عبر OAuth بصلاحيتي `user.info.basic` و`video.list`؛ 1,360 فيديو محفوظًا وروابطها جميعًا للحساب الرسمي. | المشاهدات والإعجابات والتعليقات والمشاركات لكل فيديو. الأرشيف الأقدم يُجلب تدريجيًا على دفعات لتجنب حد طلبات TikTok. التطبيق حاليًا في TikTok Sandbox؛ نشر التطبيق للاستخدام العام يحتاج مراجعة TikTok وفيديو توضيحي، ولم يُرفع فيديو المراجعة بعد. |
| Snapchat | غير مُعدّ. | يلزم Public Profile API مع `SNAP_PROFILE_ID` وتوكن بصلاحية `snapchat-profile-api`. الدخول إلى Business Manager وحده لا يتيح للموصل قراءة المحتوى. صفحة Profile Manager أظهرت نقص صلاحية الحساب. |
| الموقع / GA4 | غير مُعدّ. | يلزم GA4 property ID وOAuth refresh token بصلاحية `analytics.readonly`؛ بيانات Google Ads المتاحة لا تكفي. |
| X | مؤجل بطلب المستخدم. | يحتاج حسابه وصلاحياته لاحقًا. |

أحدث فحص إنتاج أظهر 3 مصادر متصلة من 5. عدد بوستات TikTok المحفوظة ارتفع من 960 إلى 1,360 بعد تفعيل جلب الأرشيف على دفعات. المزامنة التلقائية كل 30 دقيقة ستواصل جلب الفيديوهات الأقدم؛ العدد الحالي لا يعني اكتمال أرشيف الحساب. القيم التي لا ترجعها المنصة تظهر `—` في تفاصيل المنشور، من دون اختلاق أصفار.

## ما يعمل في التطبيق

- واجهة عربية: نظرة عامة، أداء كل بوست، تحليلات، كاليندر، تنبيهات، وحالة الربط.
- تفاصيل المنشور تعرض تاريخ النشر، نوعه، رابط المنصة، الأرقام المتاحة، ومعدل التفاعل. يمكن تصدير البوستات إلى CSV.
- قالب XLSX فيه `Calendar` و`Guide`، مع استيراد XLSX/CSV ومنع التكرار.
- مطابقة البوست المجدول مع المنشور الفعلي باستخدام رابط أو ID؛ لا يُعد منشورًا من غير دليل نشر.
- تنبيه قبل الموعد بساعة، وتنبيه تأخر بعد الموعد و15 دقيقة، مع فحص يدوي حين يتعطل المصدر.
- تنبيهات داخل التطبيق، وتنبيهات المتصفح عند فتح التطبيق وإعطاء الإذن. Telegram اختياري إذا ضُبطت بياناته.
- توكن TikTok OAuth محفوظ مشفرًا في Postgres، وتجديده التلقائي مفعّل.

الكاليندر ما زال فارغًا لأن الفريق لم يرفع خطة نشر. التطبيق يرصد ويخطط وينبّه؛ لا ينشر المحتوى تلقائيًا. الداشبورد والـAPI يتطلبان تسجيل دخول؛ حساب المسؤول الأول أُنشئ عند تشغيل النسخة الجديدة.

## متغيرات الإنتاج

تأكد وجود أسماء المتغيرات التالية في Railway، من دون إخراج قيمها: `META_ACCESS_TOKEN`, `META_API_VERSION`, `META_APP_ID`, `META_APP_SECRET`, `META_PAGE_IDS`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`, `DATA_FILE`, `HOST`, `BUSINESS_TIME_ZONE`, `ALERT_GRACE_MINUTES`. توكن TikTok للمستخدم يُحفظ مشفرًا في قاعدة البيانات بعد OAuth، وليس مطلوبًا وضعه كنص في GitHub.

المطلوب لإكمال المصدرين المتبقيين:

| المصدر | المتغيرات أو الصلاحيات |
| --- | --- |
| Snapchat | `SNAP_PROFILE_ID`, `SNAP_PROFILE_ACCESS_TOKEN` أو `SNAP_PROFILE_REFRESH_TOKEN`، ومع التجديد `SNAP_CLIENT_ID` و`SNAP_CLIENT_SECRET`؛ مع السماح لتطبيق Public Profile API وصلاحية الحساب على الملف العام. |
| GA4 | `GA4_PROPERTY_ID`, `GOOGLE_ANALYTICS_CLIENT_ID`, `GOOGLE_ANALYTICS_CLIENT_SECRET`, `GOOGLE_ANALYTICS_REFRESH_TOKEN` بصلاحية `analytics.readonly`. |

لا تضع كلمات المرور أو مفاتيح API في المستودع أو ملف الكاليندر.

## التشغيل والتحقق

```bash
npm install
npm test
npm run build
git push origin main
```

`npm test`: 75 اختبارًا ناجحًا. `npm run build`: ناجح. تم التحقق من `/api/health` وOdoo وPostgres بعد النشر. تحقق من حالة نشر Railway وعداد البوستات بعد أي تحديث.

## متابعات لازمة

1. إكمال أرشيف TikTok عبر المزامنة التلقائية، ومراقبة رسالة حد الطلبات. أحدث فيديو محفوظ من 6 أكتوبر 2026، وأقدم فيديو محفوظ حاليًا من 3 أغسطس 2026.
2. إنتاج ورفع فيديو مراجعة TikTok Sandbox للحصول على اعتماد التطبيق خارج حسابات التجربة.
3. تفعيل صلاحية Public Profile API وملف Engosoft على Snapchat، ثم إضافة بيانات OAuth اللازمة.
4. تحديد GA4 property ومنح `analytics.readonly` وربط OAuth.
5. رفع خطة الفريق من قالب الكاليندر لبدء تنبيهات النشر الفعلية.

## ملاحظة أمنية سابقة

ظهر توكن Meta قديم في خرج أداة خلال مراجعة سابقة لإعدادات Railway. لم يُرفع إلى GitHub؛ يُنصح بتدويره في Meta وتحديثه في Insights Hub وSocial Pulse. جرى تدوير رمز دخول اللوحة ومفتاح تشفير التوكنات اللذين ظهرا حينها، قبل إزالة تسجيل الدخول من اللوحة.

## تحديث 2026-10-27: تسجيل الدخول، الاستهلاك، القوالب، الإشعارات

- النشر: خدمة Railway `web` متصلة الآن بفرع GitHub `main`. قد تحتاج كوميتات حساب GitHub غير العضو في مشروع Railway إلى موافقة قبل التنفيذ.
- متغيرات Railway المضافة: `OPENAI_API_KEY`، `OPENAI_IMAGE_MODEL`، `OPENAI_TEXT_MODEL`، `OPENAI_TEMPLATE_MODEL`، متغيرات `ODOO_*`، `APP_URL`، `ADMIN_EMAIL`، `ADMIN_NAME`، `ADMIN_PASSWORD`. كلمة مرور المسؤول الأول محفوظة محليًا في `.env.production.local` (غير مرفوع)، ويُنشأ المسؤول مرة واحدة عند أول تشغيل بلا مستخدمين.
- البريد الإلكتروني للإشعارات يحتاج: `SMTP_HOST`، `SMTP_PORT`، `SMTP_USER`، `SMTP_PASS`، `MAIL_FROM` (مع Gmail: `smtp.gmail.com`، المنفذ 465، وكلمة مرور تطبيقات App Password).
- الصور المولّدة والمرفوعة وطبقات الاستوديو تُحفظ بجوار قاعدة البيانات على الـvolume (`/data`).

## تحديث 2026-10-27: استمرار التوليد، Odoo، وPostgres

- التغييرات رُفعت إلى `main` في commit `f3ef615`. توليد المنشور يطلب اتجاهين/صورتين، وتستمر المهمة عند التنقل بين الصفحات، مع استعادة النتيجة المحفوظة وإشعار عند الاكتمال.
- منتقي Odoo يعرض كتالوج الدورات والمواعيد القادمة ويبحث بالعربية والإنجليزية مع تحمل بعض الأخطاء الإملائية. القراءة المباشرة أرجعت 177 دورة eLearning و119 منتج دورة بعد استبعاد منتجات تسجيل الفعاليات، و110 مواعيد قادمة.
- Postgres في Railway متصل بـ`web` عبر متغير `DATABASE_URL` المرجعي. نُقلت 19 جدولًا من SQLite مع 4,266 منشورًا مرصودًا ومستخدم واحد و7 سجلات استهلاك، مع بقاء ملف SQLite الأصلي على volume. نُشر الكود عبر `railway up --detach`، وسجّل الخادم `Postgres` عند التشغيل.
- قُبلت دعوة GitHub للحساب `engosoftaibot-lgtm`، واتصلت خدمة Railway `web` بفرع `main`. خدمة Railway أنشأت نشرًا من commit `1bb5972` مباشرة عند الربط؛ أي رفع جديد إلى `main` يُنشئ نشرًا تلقائيًا.
- حُذف منفذ TCP العام المؤقت لـPostgres بعد موافقة المستخدم. لم يعد للخدمة TCP proxy، ويظل اتصال `web` بقاعدة البيانات عبر شبكة Railway الداخلية.
