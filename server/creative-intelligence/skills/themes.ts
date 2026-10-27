/**
 * Professional visual themes. A theme is a whole visual language — composition, photography, lighting,
 * typography, spacing, graphics, texture, image treatment, density and mood — not a colour palette.
 * The theme director picks one per direction; the design stage and the prompt compiler read its rules.
 */
import { THEME_IDS, type ThemeId } from '../../../src/domain/design-engine.js';
export { THEME_IDS, type ThemeId };

export interface ThemeDefinition {
  id: ThemeId;
  label: { en: string; ar: string };
  /** When this theme is the right answer. */
  fitsWhen: string;
  composition: { preferred: string; depth: 'flat' | 'moderate' | 'strong'; imageDominance: 'low' | 'medium' | 'high' };
  photography: string;
  lighting: string;
  typography: { scale: 'restrained' | 'balanced' | 'strong' | 'monumental'; density: 'low' | 'medium' | 'high'; treatment: string };
  spacing: string;
  graphics: string;
  texture: string;
  imageTreatment: string;
  density: 'airy' | 'balanced' | 'rich';
  mood: string;
  avoid: string[];
  /** Experimental themes are offered only when creativity allows it. */
  risk: 'safe' | 'balanced' | 'experimental';
}

const t = (d: ThemeDefinition) => d;
export const THEMES: Record<ThemeId, ThemeDefinition> = {
  'corporate-premium': t({ id: 'corporate-premium', label: { en: 'Corporate Premium', ar: 'مؤسسي فاخر' }, fitsWhen: 'flagship courses, certifications, corporate audiences who buy credibility',
    composition: { preferred: 'calm asymmetry with one dominant subject and a disciplined text column', depth: 'moderate', imageDominance: 'medium' },
    photography: 'polished commercial portraiture or premium interiors, natural skin, tailored wardrobe', lighting: 'soft key with gentle falloff, subtle rim, clean highlights',
    typography: { scale: 'strong', density: 'medium', treatment: 'confident bold headline, refined supporting line, generous leading' }, spacing: 'wide margins, clear groups, nothing touching the edges',
    graphics: 'one thin rule or a restrained shape; brand colour as accent', texture: 'clean, very fine grain', imageTreatment: 'full-bleed or large framed photograph, gently graded', density: 'balanced', mood: 'assured, credible, aspirational',
    avoid: ['generic blue gradients', 'glass cards', 'stock-photo handshake clichés', 'busy icon rows'], risk: 'safe' }),
  'editorial-modern': t({ id: 'editorial-modern', label: { en: 'Editorial Modern', ar: 'تحريري حديث' }, fitsWhen: 'thought leadership, webinars, content that should feel like a magazine cover',
    composition: { preferred: 'magazine grid with strong typographic block and a cropped image panel; deliberate edge tension', depth: 'moderate', imageDominance: 'medium' },
    photography: 'editorial portraits or details with intentional crops', lighting: 'directional soft light, slightly moody', typography: { scale: 'monumental', density: 'low', treatment: 'oversized headline as the main graphic, tight but readable leading, a small kicker line' },
    spacing: 'asymmetric margins, large negative space opposite the type', graphics: 'grid lines or column rules used sparingly', texture: 'paper-like or fine film grain', imageTreatment: 'cropped panel, duotone or muted grade allowed', density: 'airy', mood: 'smart, current, editorial',
    avoid: ['centred template stacks', 'pill buttons everywhere', 'random tech lines'], risk: 'balanced' }),
  'minimal-professional': t({ id: 'minimal-professional', label: { en: 'Minimal Professional', ar: 'بسيط احترافي' }, fitsWhen: 'announcements, reminders, premium simplicity',
    composition: { preferred: 'one idea, one element, extreme negative space', depth: 'flat', imageDominance: 'low' }, photography: 'a single object or detail, or none', lighting: 'even, soft, shadow only where it adds form',
    typography: { scale: 'strong', density: 'low', treatment: 'one strong line, a quiet supporting line' }, spacing: 'very generous, the emptiness is the design', graphics: 'none or a single precise mark', texture: 'none to fine grain',
    imageTreatment: 'small isolated subject', density: 'airy', mood: 'calm, confident, precise', avoid: ['filling space because it exists', 'decorative clutter', 'gradients'], risk: 'safe' }),
  'industrial-cinematic': t({ id: 'industrial-cinematic', label: { en: 'Industrial Cinematic', ar: 'صناعي سينمائي' }, fitsWhen: 'facility management, engineering operations, MEP, maintenance, automotive',
    composition: { preferred: 'asymmetrical, wide environment, subject placed with depth, headline set into calm sky or wall', depth: 'strong', imageDominance: 'high' },
    photography: 'cinematic industrial environments: plants, control rooms, facilities, real materials', lighting: 'directional cinematic key, subtle rim, practical lights, light haze for depth',
    typography: { scale: 'strong', density: 'medium', treatment: 'bold condensed feel, high contrast against the scene' }, spacing: 'controlled; text grouped in one calm area of the image', graphics: 'almost none; the photograph carries it',
    texture: 'filmic grain, real surfaces', imageTreatment: 'full-bleed scene with a cinematic grade', density: 'balanced', mood: 'serious, capable, large-scale', avoid: ['generic gradients', 'glass cards', 'random tech lines', 'template-like composition'], risk: 'balanced' }),
  'technical-engineering': t({ id: 'technical-engineering', label: { en: 'Technical Engineering', ar: 'هندسي تقني' }, fitsWhen: 'software courses (BIM, Revit, ETABS), technical tutorials, engineering carousels',
    composition: { preferred: 'structured grid, drawing or model as hero, annotations aligned to the grid', depth: 'moderate', imageDominance: 'medium' }, photography: 'CAD/BIM models, drawings, precise renders, hands at work',
    lighting: 'clean studio or screen-lit', typography: { scale: 'balanced', density: 'medium', treatment: 'clear hierarchy, small technical labels' }, spacing: 'modular, consistent gutters',
    graphics: 'blueprint lines, dimension marks, grids — purposeful, not decorative', texture: 'paper or blueprint subtly', imageTreatment: 'framed technical visual', density: 'balanced', mood: 'precise, knowledgeable',
    avoid: ['fake UI screens', 'meaningless HUD lines', 'unreadable tiny labels'], risk: 'safe' }),
  'luxury-dark': t({ id: 'luxury-dark', label: { en: 'Luxury Dark', ar: 'داكن فاخر' }, fitsWhen: 'executive programs, premium certifications, evening webinars',
    composition: { preferred: 'low-key image with one lit subject, text in deep negative space', depth: 'strong', imageDominance: 'high' }, photography: 'low-key portraits or objects, rich blacks',
    lighting: 'single dramatic key, deep shadows, subtle warm or blue rim', typography: { scale: 'strong', density: 'low', treatment: 'elegant, high contrast, refined spacing' }, spacing: 'generous, lots of dark space',
    graphics: 'one thin metallic or brand-coloured line', texture: 'velvet blacks, fine grain', imageTreatment: 'deep grade, crushed but detailed shadows', density: 'airy', mood: 'exclusive, serious',
    avoid: ['neon glow', 'muddy greys', 'busy backgrounds'], risk: 'balanced' }),
  'photographic-storytelling': t({ id: 'photographic-storytelling', label: { en: 'Photographic Storytelling', ar: 'قصة فوتوغرافية' }, fitsWhen: 'graduate stories, career change, outcomes',
    composition: { preferred: 'a candid moment as the image, text placed where the story breathes', depth: 'strong', imageDominance: 'high' }, photography: 'documentary-feeling moments, real places, natural expressions',
    lighting: 'natural or practical light that matches the moment', typography: { scale: 'balanced', density: 'low', treatment: 'quiet, lets the image speak' }, spacing: 'text tucked into negative space of the photo',
    graphics: 'none', texture: 'natural photographic grain', imageTreatment: 'full-bleed photograph, natural grade', density: 'airy', mood: 'human, honest, emotional', avoid: ['posed stock smiles', 'overlays on faces'], risk: 'balanced' }),
  'bold-commercial': t({ id: 'bold-commercial', label: { en: 'Bold Commercial', ar: 'تجاري جريء' }, fitsWhen: 'promotions, last seats, launches that need instant attention',
    composition: { preferred: 'strong diagonal or scale contrast, huge headline, cut-out subject breaking a shape', depth: 'moderate', imageDominance: 'medium' }, photography: 'crisp cut-out subjects, energetic poses',
    lighting: 'bright, punchy, clean shadows', typography: { scale: 'monumental', density: 'medium', treatment: 'heavy weight, tight grouping, one emphasised word' }, spacing: 'tight groups, strong contrast between full and empty',
    graphics: 'bold shapes in brand orange or blue, used once', texture: 'clean', imageTreatment: 'cut-out integrated with shadows', density: 'rich', mood: 'urgent, confident',
    avoid: ['multiple competing badges', 'cheap starbursts', 'repeated pill buttons'], risk: 'balanced' }),
  'architectural-clean': t({ id: 'architectural-clean', label: { en: 'Architectural Clean', ar: 'معماري نظيف' }, fitsWhen: 'interior design, architecture, construction management',
    composition: { preferred: 'architectural lines lead to the headline; symmetry or one-point perspective', depth: 'strong', imageDominance: 'high' }, photography: 'architecture and interiors, strong lines, real materials',
    lighting: 'daylight or soft architectural lighting', typography: { scale: 'balanced', density: 'low', treatment: 'refined, aligned to architectural lines' }, spacing: 'aligned to the building geometry',
    graphics: 'none or a thin frame', texture: 'stone, wood, concrete, glass', imageTreatment: 'full-bleed, corrected verticals', density: 'airy', mood: 'refined, structured', avoid: ['tilted verticals', 'cluttered furniture'], risk: 'safe' }),
  'human-centered': t({ id: 'human-centered', label: { en: 'Human Centered', ar: 'إنساني' }, fitsWhen: 'instructor authority, learner outcomes, employee achievements',
    composition: { preferred: 'one person as the focal point; eye line and gesture lead to the headline', depth: 'moderate', imageDominance: 'high' }, photography: 'authentic professionals, believable faces and hands',
    lighting: 'flattering soft key, catchlights in the eyes', typography: { scale: 'balanced', density: 'medium', treatment: 'warm and clear' }, spacing: 'breathing room around the face',
    graphics: 'minimal', texture: 'natural', imageTreatment: 'waist-up or close portrait in context', density: 'balanced', mood: 'trustworthy, warm', avoid: ['plastic AI faces', 'text over faces'], risk: 'safe' }),
  'futuristic-ai': t({ id: 'futuristic-ai', label: { en: 'Futuristic AI', ar: 'مستقبلي ذكي' }, fitsWhen: 'AI tools, Ask Majd, digital transformation',
    composition: { preferred: 'one luminous object or interface idea floating in depth, generous space', depth: 'strong', imageDominance: 'medium' }, photography: 'premium 3D or product-style renders, not sci-fi',
    lighting: 'soft volumetric blue with one warm accent', typography: { scale: 'strong', density: 'low', treatment: 'clean, modern, spacious' }, spacing: 'very open', graphics: 'subtle light trails at most',
    texture: 'smooth with fine grain', imageTreatment: 'rendered hero object', density: 'airy', mood: 'intelligent, calm, forward', avoid: ['AI brain clichés', 'cyberpunk', 'neon overload', 'HUD clutter', 'robots'], risk: 'balanced' }),
  'scientific-technical': t({ id: 'scientific-technical', label: { en: 'Scientific Technical', ar: 'علمي دقيق' }, fitsWhen: 'data, research, laboratory, quality and safety topics',
    composition: { preferred: 'clean specimen-like hero, data elements aligned on a grid', depth: 'moderate', imageDominance: 'medium' }, photography: 'macro details, instruments, clean lab or field',
    lighting: 'clean, even, controlled reflections', typography: { scale: 'balanced', density: 'medium', treatment: 'precise, numerals given care' }, spacing: 'strict grid', graphics: 'thin measurement or chart lines with meaning',
    texture: 'clean', imageTreatment: 'isolated or framed detail', density: 'balanced', mood: 'rigorous, trustworthy', avoid: ['fake charts', 'decorative numbers'], risk: 'safe' }),
  'saudi-premium': t({ id: 'saudi-premium', label: { en: 'Saudi Premium', ar: 'سعودي فاخر' }, fitsWhen: 'Saudi national occasions, Vision 2030 topics, KSA-specific campaigns — only when culturally relevant',
    composition: { preferred: 'landmark or heritage-inspired architecture with dignified negative space', depth: 'strong', imageDominance: 'high' }, photography: 'Saudi architecture, desert light, modern Riyadh',
    lighting: 'golden or clean daylight', typography: { scale: 'strong', density: 'low', treatment: 'dignified Arabic headline' }, spacing: 'generous', graphics: 'subtle geometric pattern, Saudi green as accent when appropriate',
    texture: 'stone, sand, fine grain', imageTreatment: 'full-bleed', density: 'airy', mood: 'proud, premium', avoid: ['flag clichés pasted on', 'misused national symbols'], risk: 'safe' }),
  'high-energy-promotion': t({ id: 'high-energy-promotion', label: { en: 'High Energy Promotion', ar: 'عرض حماسي' }, fitsWhen: 'discounts, deadlines, limited seats',
    composition: { preferred: 'dynamic diagonal, the offer as the focal point, subject supports it', depth: 'moderate', imageDominance: 'medium' }, photography: 'expressive cut-outs or bold product shots',
    lighting: 'bright high-key', typography: { scale: 'monumental', density: 'medium', treatment: 'heavy, the key number or word dominant' }, spacing: 'tight but organised',
    graphics: 'one strong shape language in brand orange', texture: 'clean', imageTreatment: 'cut-out', density: 'rich', mood: 'energetic, urgent', avoid: ['five badges at once', 'cheap price tags', 'starbursts'], risk: 'balanced' }),
  'experimental-editorial': t({ id: 'experimental-editorial', label: { en: 'Experimental Editorial', ar: 'تحريري تجريبي' }, fitsWhen: 'when the user wants something unusual and memorable',
    composition: { preferred: 'unexpected crops, type interacting with the image, bold scale shifts', depth: 'moderate', imageDominance: 'medium' }, photography: 'conceptual photography or collage-like compositing',
    lighting: 'graphic, intentional', typography: { scale: 'monumental', density: 'low', treatment: 'type as image, overlapping layers with clear readability' }, spacing: 'intentional tension',
    graphics: 'conceptual, one idea', texture: 'print, risograph or film', imageTreatment: 'conceptual composite', density: 'balanced', mood: 'surprising, smart', avoid: ['chaos', 'illegible type'], risk: 'experimental' }),
  'clean-educational': t({ id: 'clean-educational', label: { en: 'Clean Educational', ar: 'تعليمي واضح' }, fitsWhen: 'tips, explanations, carousels, schedules',
    composition: { preferred: 'clear reading order, one illustration or photo, information in tidy groups', depth: 'flat', imageDominance: 'low' }, photography: 'simple, explanatory visuals',
    lighting: 'bright and even', typography: { scale: 'balanced', density: 'high', treatment: 'very readable, clear steps' }, spacing: 'consistent rhythm between groups', graphics: 'simple icons or numbering with meaning',
    texture: 'clean', imageTreatment: 'framed or isolated', density: 'rich', mood: 'helpful, clear', avoid: ['decorative icons with no meaning', 'walls of text'], risk: 'safe' }),
};

export const themeSummary = (theme: ThemeDefinition) =>
  `${theme.id}: ${theme.fitsWhen}. Composition: ${theme.composition.preferred} (depth ${theme.composition.depth}, image dominance ${theme.composition.imageDominance}). Mood: ${theme.mood}.`;
