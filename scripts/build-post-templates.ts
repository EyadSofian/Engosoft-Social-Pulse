import { mkdirSync, writeFileSync } from 'node:fs';
import { POST_TEMPLATES, renderPosterSvg } from '../src/features/post-design/templates';

const destination = new URL('../public/post-templates/', import.meta.url);
mkdirSync(destination, { recursive: true });
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
  const svg = renderPosterSvg(template, 'square', { title: samples[template.family] ?? template.name, eyebrow: 'ENGOSOFT', body: 'تعلّم بمهارة، وطبّق بثقة.', cta: 'اعرف المزيد' });
  writeFileSync(new URL(`${template.id}.svg`, destination), svg);
  csv.push(`${template.id},${template.name},${template.family},/post-templates/${template.id}.svg,"New editable layout inspired by Engosoft brand and post families; not a copy of an individual Facebook creative"`);
  input.push([template.id, 'instagram', 'portrait', samples[template.family] ?? template.name, 'ENGOSOFT', 'تعلّم بمهارة، وطبّق بثقة.', '', 'اعرف المزيد', ''].map(cell).join(','));
}
writeFileSync(new URL('../public/data/post-design-templates.csv', import.meta.url), csv.join('\n') + '\n');
writeFileSync(new URL('../public/data/post-design-input-template.csv', import.meta.url), input.join('\n') + '\n');
console.log(`${POST_TEMPLATES.length} SVG templates built`);
