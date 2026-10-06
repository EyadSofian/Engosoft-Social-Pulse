# تسليم Engosoft Social Pulse

آخر تحقق: 6 أكتوبر 2026، بتوقيت القاهرة. المشروع مستقل عن Engosoft Insights Hub.

## الروابط والمكان

| المورد | المكان |
| --- | --- |
| الكود المحلي | `/Users/eyad/Mac_Transfer_Work_Files_2026-08-02/2026-10-04__Engosoft_Social_Media_Dashboard` |
| GitHub الخاص | https://github.com/EyadSofian/Engosoft-Social-Pulse |
| التطبيق | https://web-production-d07de.up.railway.app |
| صفحة تفاصيل البوستات | https://web-production-d07de.up.railway.app/#/content |
| صفحة حالة الربط | https://web-production-d07de.up.railway.app/#/connections |
| قالب الكاليندر | https://web-production-d07de.up.railway.app/calendar-template.xlsx |
| Railway | مشروع `Engosoft-Social-Pulse`، خدمة `web`، بيئة `production` |
| التخزين | SQLite على volume دائم، `/data/social-pulse.sqlite` |

النسخة المنشورة من commit `c48caa6`، ونشر Railway `0946f04b-a6bc-4dc0-a4cb-47956efb6ca4` بحالة `SUCCESS`. التحديثات رُفعت إلى GitHub ونُشرت باستخدام Railway CLI؛ لا تعتمد على `git push` وحده لنشر تغيير جديد.

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
- توكن TikTok OAuth محفوظ مشفرًا في SQLite على volume، وتجديده التلقائي مفعّل.

الكاليندر ما زال فارغًا لأن الفريق لم يرفع خطة نشر. التطبيق يرصد ويخطط وينبّه؛ لا ينشر المحتوى تلقائيًا. **الداشبورد والـAPI بلا تسجيل دخول** تنفيذًا لطلب إزالة كلمة المرور؛ أي شخص لديه الرابط يستطيع قراءة البيانات وتعديل الكاليندر والتنبيهات وبدء المزامنة.

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
railway up --detach
```

`npm test`: 11 اختبارًا ناجحًا. `npm run build`: ناجح. تم التحقق من `/api/health`، و`/api/dashboard`، وشاشة الربط، وجدول المحتوى، ونافذة تفاصيل فيديو حقيقي من الحساب الرسمي. تحقق من حالة نشر Railway وعداد البوستات بعد أي تحديث.

## متابعات لازمة

1. إكمال أرشيف TikTok عبر المزامنة التلقائية، ومراقبة رسالة حد الطلبات. أحدث فيديو محفوظ من 6 أكتوبر 2026، وأقدم فيديو محفوظ حاليًا من 3 أغسطس 2026.
2. إنتاج ورفع فيديو مراجعة TikTok Sandbox للحصول على اعتماد التطبيق خارج حسابات التجربة.
3. تفعيل صلاحية Public Profile API وملف Engosoft على Snapchat، ثم إضافة بيانات OAuth اللازمة.
4. تحديد GA4 property ومنح `analytics.readonly` وربط OAuth.
5. رفع خطة الفريق من قالب الكاليندر لبدء تنبيهات النشر الفعلية.

## ملاحظة أمنية سابقة

ظهر توكن Meta قديم في خرج أداة خلال مراجعة سابقة لإعدادات Railway. لم يُرفع إلى GitHub؛ يُنصح بتدويره في Meta وتحديثه في Insights Hub وSocial Pulse. جرى تدوير رمز دخول اللوحة ومفتاح تشفير التوكنات اللذين ظهرا حينها، قبل إزالة تسجيل الدخول من اللوحة.
