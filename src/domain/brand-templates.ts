/**
 * Engosoft brand templates: the post designs of the November 2026 brand pack (brand/guidelines-2026-11/posts),
 * turned into templates the system lays out itself at every publishing size. Each template declares the inputs
 * it needs; the Create page asks for exactly those, AI can write the text inputs, and photo inputs are uploaded
 * (an instructor's own photo) or, where the template allows it, drawn by AI without any text.
 *
 * Pure data (no DOM, no Node), shared by the browser renderer and the server's AI copy and photo routes.
 */

export type BrandSurface = 'light' | 'blue';
export type BrandInputType = 'text' | 'multiline' | 'photo';
/**
 * What a photo input shows, which decides how AI may help: `person` is a real, named person (an instructor, a
 * speaker): AI never invents it, it has to be uploaded. `model` is an unnamed person and `scene` a place or object:
 * AI can draw them when nothing is uploaded. `artwork` is a campaign file (a stamp, a hashtag): shown whole, never
 * drawn by AI. `cutout` photos look best with a transparent background.
 */
export type BrandPhotoKind = 'person' | 'model' | 'scene' | 'artwork';

export interface BrandInput {
  key: string;
  type: BrandInputType;
  label: { ar: string; en: string };
  /** One line under the field: what goes there. */
  hint?: { ar: string; en: string };
  required?: boolean;
  /** Text inputs: AI may write it from the request. Facts (names, dates, prices, places) are never written by AI. */
  ai?: boolean;
  /** A fact: only the person or the course data may fill it. */
  fact?: boolean;
  maxChars?: number;
  photo?: { kind: BrandPhotoKind; cutout?: boolean; aspect: number };
  sample: { ar: string; en: string };
  /**
   * Artwork that is part of the design (a campaign stamp or hashtag): where it sits in the template's reference
   * image, as fractions from the top-left, and the words it shows. When AI redraws the design, the file is placed
   * there exactly instead of being redrawn.
   */
  place?: { x: number; y: number; width: number; height: number };
  says?: string;
}

export interface BrandTemplate {
  id: string;
  name: { ar: string; en: string };
  description: { ar: string; en: string };
  /** The kind of post, matching the SVG template kinds so both appear under the same filters. */
  kind: 'course' | 'event' | 'graduation' | 'announcement' | 'general';
  /** The brand-pack posts this template follows (light and blue versions). */
  references: Partial<Record<BrandSurface, string>>;
  surfaces: BrandSurface[];
  inputs: BrandInput[];
  /** Words the AI copywriter gets about the template's tone and structure. */
  brief: string;
}

const REF = (n: string) => `/brand-references/post-${n}.jpg`;
const t = (ar: string, en: string) => ({ ar, en });

export const BRAND_TEMPLATES: BrandTemplate[] = [
  {
    id: 'brand-headline',
    name: t('عنوان كبير', 'Big headline'),
    description: t('عنوان ضخم في النص السفلي، سطر صغير فوقه وفقرة قصيرة. للإعلانات والرسائل العامة.', 'A giant headline in the lower half with a small eyebrow and a short paragraph. For announcements and general messages.'),
    kind: 'general',
    references: { light: REF('01'), blue: REF('02') },
    surfaces: ['light', 'blue'],
    brief: 'Typographic post: one giant headline of two to four short words, a small eyebrow line above the paragraph, and a two-to-three line paragraph.',
    inputs: [
      { key: 'eyebrow', type: 'text', label: t('سطر صغير فوق النص', 'Eyebrow'), ai: true, maxChars: 40, sample: t('دورات معتمدة', 'Your Design Here') },
      { key: 'body', type: 'multiline', label: t('فقرة قصيرة', 'Short paragraph'), ai: true, maxChars: 180, sample: t('برامج تدريبية عملية يقدمها خبراء في مجالاتهم، تؤهلك لسوق العمل بشهادات معتمدة.', 'This document is dedicated exclusively to the brand’s logo variations and usage guidelines.') },
      { key: 'headline', type: 'text', label: t('العنوان الكبير', 'Headline'), ai: true, required: true, maxChars: 28, sample: t('ابدأ مسارك المهني', 'Social Media Post') },
    ],
  },
  {
    id: 'brand-instructor',
    name: t('ويبينار أو دورة بمحاضر', 'Webinar or course with instructor'),
    description: t('اسم الفعالية كبير، صورة المحاضر في إطار مموج، اسمه وخبرته، والموعد والمكان.', 'The event name large, the instructor’s photo in a wavy frame, their name and credential, the date and place.'),
    kind: 'event',
    references: { light: REF('03'), blue: REF('04') },
    surfaces: ['light', 'blue'],
    brief: 'Event or course with a named instructor: a short big title (the event type or course name), a short tag in tracked capitals, the instructor\'s name and credential, a details line with date, time and place, and one or two lines of description.',
    inputs: [
      { key: 'title', type: 'text', label: t('اسم الفعالية أو الدورة', 'Event or course name'), ai: true, required: true, maxChars: 24, sample: t('ويبينار', 'webinar') },
      { key: 'tag', type: 'text', label: t('كلمة مميزة تحت الاسم', 'Tag under the name'), hint: t('مثل: مجاناً، أونلاين، حضوري', 'e.g. FREE, ONLINE'), ai: true, maxChars: 14, sample: t('مجاناً', 'FREE') },
      { key: 'instructorPhoto', type: 'photo', label: t('صورة المحاضر', 'Instructor photo'), hint: t('ارفع صورة المحاضر الحقيقية', 'Upload the instructor’s real photo'), required: true, photo: { kind: 'person', aspect: 0.95 }, sample: t('/post-assets/instructor.jpg', '/post-assets/instructor.jpg') },
      { key: 'instructorName', type: 'text', label: t('اسم المحاضر', 'Instructor name'), required: true, fact: true, maxChars: 40, sample: t('د. محمد جمال', 'Dr. Mohamed Gamal') },
      { key: 'credential', type: 'text', label: t('خبرة المحاضر', 'Instructor credential'), hint: t('سطر واحد على الشريط البرتقالي', 'One line on the orange bar'), fact: true, maxChars: 48, sample: t('خبرة أكثر من 15 سنة في إدارة المرافق', 'Over 15 years of experience in CFM') },
      { key: 'date', type: 'text', label: t('التاريخ', 'Date'), fact: true, maxChars: 32, sample: t('الثلاثاء 24 نوفمبر', 'Tuesday, 24 November') },
      { key: 'time', type: 'text', label: t('الوقت', 'Time'), fact: true, maxChars: 24, sample: t('8 مساءً بتوقيت السعودية', '8 PM KSA') },
      { key: 'place', type: 'text', label: t('المكان أو المنصة', 'Place or platform'), fact: true, maxChars: 32, sample: t('أونلاين على Zoom', 'Online on Zoom') },
      { key: 'body', type: 'multiline', label: t('وصف قصير', 'Short description'), ai: true, maxChars: 110, sample: t('جلسة عملية عن أساسيات إدارة المرافق ومسار شهادة CFM.', 'This document is dedicated exclusively to the brand. This document is dedicated exclusively.') },
    ],
  },
  {
    id: 'brand-photo-card',
    name: t('كارت صورة', 'Photo card'),
    description: t('صورة كبيرة بحواف ناعمة، عنوان أبيض فوقها، شريط ملون وفقرة. للقيم والإنجازات والأخبار.', 'A large rounded photo with a white headline, a colour label bar and a paragraph. For values, achievements and news.'),
    kind: 'announcement',
    references: { light: REF('05'), blue: REF('06') },
    surfaces: ['light'],
    brief: 'Photo card: a short white headline of one to three words (set in capitals in English), a short label in a colour bar, and a two-to-three line paragraph over the photo.',
    inputs: [
      { key: 'photo', type: 'photo', label: t('الصورة', 'Photo'), hint: t('ارفع صورة، أو سيبها والذكاء الاصطناعي يرسم واحدة', 'Upload one, or leave it and AI draws one'), required: true, photo: { kind: 'scene', aspect: 0.74 }, sample: t('/post-assets/architecture.jpg', '/post-assets/architecture.jpg') },
      { key: 'headline', type: 'text', label: t('العنوان', 'Headline'), ai: true, required: true, maxChars: 26, sample: t('قيمنا', 'Core Values') },
      { key: 'label', type: 'text', label: t('الشريط الملون', 'Label bar'), ai: true, maxChars: 34, sample: t('ما يحرك الشركة', 'What drives the company') },
      { key: 'body', type: 'multiline', label: t('فقرة قصيرة', 'Short paragraph'), ai: true, maxChars: 150, sample: t('نؤمن بأن التدريب العملي هو الطريق الأقصر إلى النجاح المهني، ونبني برامجنا على هذا الأساس.', 'This document is dedicated exclusively to the brand, dedicated exclusively to the brand. This document is dedicated exclusively.') },
      { key: 'labelColor', type: 'text', label: t('لون الشريط', 'Label colour'), maxChars: 8, sample: t('blue', 'blue') },
    ],
  },
  {
    id: 'brand-cutout',
    name: t('شخص أمام العنوان', 'Person over headline'),
    description: t('عنوان ضخم وصورة شخص مفرغة تقف أمامه. للحملات والتسجيل.', 'A huge headline with a cut-out person standing in front of it. For campaigns and enrolment.'),
    kind: 'course',
    references: { light: REF('07') },
    surfaces: ['light'],
    brief: 'Campaign poster: a huge two-line headline, line 1 one or two words, line 2 two or three words; a person stands in front of it.',
    inputs: [
      { key: 'line1', type: 'text', label: t('السطر الأول من العنوان', 'Headline line 1'), ai: true, required: true, maxChars: 14, sample: t('سجّل الآن', 'Creative') },
      { key: 'line2', type: 'text', label: t('السطر الثاني', 'Headline line 2'), ai: true, maxChars: 22, sample: t('وابدأ مسارك', 'Social Media') },
      { key: 'person', type: 'photo', label: t('صورة الشخص', 'Person photo'), hint: t('الأفضل PNG بخلفية شفافة؛ أو سيبها والذكاء الاصطناعي يرسم متدرب', 'Best as a PNG with a transparent background; or leave it and AI draws a trainee'), required: true, photo: { kind: 'model', cutout: true, aspect: 0.72 }, sample: t('/post-assets/instructor.jpg', '/post-assets/instructor.jpg') },
    ],
  },
  {
    id: 'brand-offer',
    name: t('عرض وخصم', 'Offer and discount'),
    description: t('عنوان، صورة في إطار مموج فوق موجة برتقالية، ختم الخصم، والسعر.', 'A headline, a photo in a wavy frame over an orange wave, the discount badge and the price.'),
    kind: 'announcement',
    references: { blue: REF('08') },
    surfaces: ['blue'],
    brief: 'Offer post: a two-line headline, a discount badge with a short word and the value, a price line when given, and one or two lines of description.',
    inputs: [
      { key: 'headline', type: 'text', label: t('العنوان', 'Headline'), ai: true, required: true, maxChars: 34, sample: t('عرض الجمعة البيضاء', 'Creative Social Media') },
      { key: 'photo', type: 'photo', label: t('الصورة', 'Photo'), hint: t('ارفع صورة، أو سيبها والذكاء الاصطناعي يرسم متدرب', 'Upload one, or leave it and AI draws a trainee'), required: true, photo: { kind: 'model', aspect: 1.05 }, sample: t('/post-assets/instructor.jpg', '/post-assets/instructor.jpg') },
      { key: 'badgeLabel', type: 'text', label: t('كلمة الختم', 'Badge word'), ai: true, maxChars: 10, sample: t('خصم', 'Discount') },
      { key: 'badgeValue', type: 'text', label: t('قيمة الخصم', 'Discount value'), required: true, fact: true, maxChars: 6, sample: t('%50', '%50') },
      { key: 'price', type: 'text', label: t('السعر', 'Price'), hint: t('مثل: 2500 ريال بدل 5000', 'e.g. SAR 2,500 instead of 5,000'), fact: true, maxChars: 36, sample: t('', '') },
      { key: 'body', type: 'multiline', label: t('وصف قصير', 'Short description'), ai: true, maxChars: 140, sample: t('خصم 50% على دورات إدارة المشروعات لفترة محدودة. المقاعد محدودة.', 'This document is dedicated exclusively to the brand, to the brand’s logo. This document is dedicated.') },
    ],
  },
  {
    id: 'brand-campaign-offer',
    name: t('عرض حملة بالسعر', 'Campaign offer with price'),
    description: t('شعار الحملة في النص، عنوان بكلمة ملونة، شريط الدورة، والسعر الجديد بدل القديم على تذكرة. نفس شكل «عرض الخمسين خمسين» لأي دورة.', 'The campaign stamp in the middle, a headline with a coloured phrase, the course tape and the new price instead of the old one on a ticket. The «50/50 offer» look for any course.'),
    kind: 'course',
    references: { blue: REF('campaign-5050') },
    surfaces: ['blue'],
    brief: 'Campaign course offer in Egyptian/Gulf marketing Arabic: a punchy headline of 3–5 words with a 1–2 word phrase to colour green, a tape line naming the course ("جهّز نفسك لشهادة PMP"), one supporting line about the career benefit. Prices come from the person, never from you.',
    inputs: [
      { key: 'stamp', type: 'photo', label: t('شعار الحملة', 'Campaign stamp'), hint: t('PNG بخلفية شفافة. سيبه زي ما هو لنفس الحملة', 'A PNG with a transparent background. Keep it for the same campaign'), photo: { kind: 'artwork', aspect: 1 }, sample: t('/brand-references/campaign-5050-stamp.png', '/brand-references/campaign-5050-stamp.png'), place: { x: 0.365, y: 0.13, width: 0.27, height: 0.215 }, says: 'عرض الخمسين خمسين %50 خصم %50 كاش باك' },
      { key: 'headline', type: 'text', label: t('العنوان', 'Headline'), ai: true, required: true, maxChars: 44, sample: t('مشاريع أكبر.. ومسؤوليات أعلى!', 'Bigger projects, bigger roles!') },
      { key: 'highlight', type: 'text', label: t('الكلمة الملونة في العنوان', 'Coloured phrase'), hint: t('جزء من العنوان يتلوّن أخضر', 'Part of the headline, set in green'), ai: true, maxChars: 20, sample: t('مشاريع أكبر..', 'Bigger projects,') },
      { key: 'tape', type: 'text', label: t('شريط الدورة', 'Course tape'), ai: true, required: true, maxChars: 40, sample: t('جهّز نفسك لشهادة PMP', 'Get ready for PMP') },
      { key: 'subline', type: 'text', label: t('السطر اللي تحت الشريط', 'Line under the tape'), hint: t('سطر أو سطرين', 'One or two lines'), ai: true, maxChars: 90, sample: t('واستثمر في خطوتك المهنية الجاية', 'and invest in your next career step') },
      { key: 'price', type: 'text', label: t('السعر الجديد', 'New price'), required: true, fact: true, maxChars: 8, sample: t('700', '700') },
      { key: 'currency', type: 'text', label: t('العملة', 'Currency'), maxChars: 8, sample: t('ر.س', 'SAR') },
      { key: 'instead', type: 'text', label: t('كلمة «بدل»', 'Word for «instead of»'), maxChars: 10, sample: t('بـــدل', 'instead of') },
      { key: 'oldPrice', type: 'text', label: t('السعر القديم', 'Old price'), fact: true, maxChars: 10, sample: t('1,400', '1,400') },
      { key: 'hashtag', type: 'photo', label: t('هاشتاج الحملة', 'Campaign hashtag'), hint: t('PNG بخلفية شفافة (اختياري)', 'A PNG with a transparent background (optional)'), photo: { kind: 'artwork', aspect: 2.6 }, sample: t('/brand-references/campaign-5050-hashtag.png', '/brand-references/campaign-5050-hashtag.png'), place: { x: 0.7, y: 0.895, width: 0.27, height: 0.09 }, says: '#جمعة_تغير_مسارك' },
    ],
  },
  {
    id: 'brand-carousel',
    name: t('شريحة كاروسيل', 'Carousel slide'),
    description: t('رقم الشريحة كبير في الركن، عنوان، وبيانات التواصل. الشرائح بتبدّل بين الفاتح والأزرق.', 'The slide number large in the corner, a headline and the contact block. Slides alternate light and blue.'),
    kind: 'general',
    references: { light: REF('09'), blue: REF('10') },
    surfaces: ['light', 'blue'],
    brief: 'Carousel slide: a headline of two to four words set on up to three lines.',
    inputs: [
      { key: 'headline', type: 'text', label: t('العنوان', 'Headline'), ai: true, required: true, maxChars: 34, sample: t('خطوات الحصول على الشهادة', 'Social Media Carousel') },
      { key: 'slide', type: 'text', label: t('رقم الشريحة', 'Slide number'), required: true, maxChars: 2, sample: t('01', '01') },
      { key: 'contact', type: 'multiline', label: t('بيانات التواصل', 'Contact block'), maxChars: 160, sample: t('الموقع:\nwww.engosoft.com\nرقم التواصل:\n+966 9200 16295', 'Website:\nwww.engosoft.com\nContact Number\n+966 9200 16295\nEngineering Training\n& Professional Development') },
    ],
  },
];

export const brandTemplate = (id?: string | null) => BRAND_TEMPLATES.find((template) => template.id === id);
export const isRtlText = (text: string) => /[؀-ۿ]/.test(text);

/** The sample values of a template in one language, so a template never opens empty. */
export const brandSamples = (template: BrandTemplate, language: 'ar' | 'en'): Record<string, string> =>
  Object.fromEntries(template.inputs.map((input) => [input.key, input.sample[language]]));

/** Inputs still missing before the design can be made (required and empty). */
export const missingInputs = (template: BrandTemplate, values: Record<string, string>) =>
  template.inputs.filter((input) => input.required && !values[input.key]?.trim());

/** Photo inputs AI may draw when nothing is uploaded: never a real, named person. */
export const aiDrawable = (input: BrandInput) => input.type === 'photo' && (input.photo?.kind === 'model' || input.photo?.kind === 'scene');

/** The fixed contact line of every brand post. */
export const BRAND_CONTACT = { website: 'www.engosoft.com', phone: '+966 9200 16295', tagline: 'Engineering Training & Professional Development' } as const;
