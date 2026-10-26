import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { POST_TEMPLATES, SAMPLE_IMAGE_BY_TEMPLATE, renderPosterSvg } from '../src/features/post-design/templates';
import logos from '../brand/logos.json';

const destination = new URL('../public/post-templates/', import.meta.url);
mkdirSync(destination, { recursive: true });
// Exact approved SVGs, inlined so each exported template is self-contained.
const approvedLogos = Object.fromEntries(logos.variants.map((variant) => [variant.id, `data:image/svg+xml;base64,${readFileSync(new URL(`../${variant.assetPath}`, import.meta.url)).toString('base64')}`]));
const samples: Record<string, string> = {
  'course-offer': 'ابدأ رحلة تعلم جديدة مع Engosoft',
  webinar: 'لقاء مباشر مع خبراء المجال',
  'monthly-schedule': 'جدول دورات هذا الشهر',
  certification: 'خطوتك القادمة نحو الشهادة',
  'team-spotlight': 'نحتفل بإنجازات الفريق',
  occasion: 'كل عام وأنتم بخير',
  'ask-majed': 'اسأل ماجد عن أصعب سؤال',
  carousel: 'من التعلّم إلى التطبيق',
  insight: 'هل أنت جاهز لفرصتك التالية؟',
  'video-hook': 'مهارة واحدة تغير مستقبلك',
};
const csv = ['id,name,design_family,svg_file,source_note'];
const input = ['template_id,platform,size,content_title,eyebrow,post_message,detail,call_to_action,ai_image_subject'];
const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
for (const template of POST_TEMPLATES) {
  const imagePath = SAMPLE_IMAGE_BY_TEMPLATE[template.id];
  const imageDataUrl = imagePath ? `data:image/jpeg;base64,${readFileSync(new URL(`../public${imagePath}`, import.meta.url)).toString('base64')}` : undefined;
  const svg = renderPosterSvg(template, 'square', { title: samples[template.family] ?? template.name, eyebrow: 'تعليم هندسي', body: 'تعلّم بمهارة، وطبّق بثقة.', cta: 'اعرف المزيد', imageDataUrl }, approvedLogos);
  writeFileSync(new URL(`${template.id}.svg`, destination), svg);
  csv.push(`${template.id},${template.name},${template.family},/post-templates/${template.id}.svg,"New editable layout inspired by Engosoft brand and post families; not a copy of an individual Facebook creative"`);
  input.push([template.id, 'instagram', 'portrait', samples[template.family] ?? template.name, 'تعليم هندسي', 'تعلّم بمهارة، وطبّق بثقة.', '', 'اعرف المزيد', ''].map(cell).join(','));
}
writeFileSync(new URL('../public/data/post-design-templates.csv', import.meta.url), csv.join('\n') + '\n');
writeFileSync(new URL('../public/data/post-design-input-template.csv', import.meta.url), input.join('\n') + '\n');
console.log(`${POST_TEMPLATES.length} SVG templates built`);
