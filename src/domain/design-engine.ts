/** Design-engine settings and theme names, shared by the server (planning) and the Create page (advanced options). */

export const THEME_IDS = [
  'corporate-premium', 'editorial-modern', 'minimal-professional', 'industrial-cinematic', 'technical-engineering', 'luxury-dark',
  'photographic-storytelling', 'bold-commercial', 'architectural-clean', 'human-centered', 'futuristic-ai', 'scientific-technical',
  'saudi-premium', 'high-energy-promotion', 'experimental-editorial', 'clean-educational',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** `risk` groups themes in the picker: proven professional looks first, bolder ones under "explore". */
export const THEME_META: Record<ThemeId, { en: string; ar: string; risk: 'safe' | 'balanced' | 'experimental' }> = {
  'corporate-premium': { en: 'Corporate Premium', ar: 'مؤسسي فاخر', risk: 'safe' },
  'editorial-modern': { en: 'Editorial Modern', ar: 'تحريري حديث', risk: 'balanced' },
  'minimal-professional': { en: 'Minimal Professional', ar: 'بسيط احترافي', risk: 'safe' },
  'industrial-cinematic': { en: 'Industrial Cinematic', ar: 'صناعي سينمائي', risk: 'balanced' },
  'technical-engineering': { en: 'Technical Engineering', ar: 'هندسي تقني', risk: 'safe' },
  'luxury-dark': { en: 'Luxury Dark', ar: 'داكن فاخر', risk: 'balanced' },
  'photographic-storytelling': { en: 'Photographic Storytelling', ar: 'قصة فوتوغرافية', risk: 'balanced' },
  'bold-commercial': { en: 'Bold Commercial', ar: 'تجاري جريء', risk: 'balanced' },
  'architectural-clean': { en: 'Architectural Clean', ar: 'معماري نظيف', risk: 'safe' },
  'human-centered': { en: 'Human Centered', ar: 'إنساني', risk: 'safe' },
  'futuristic-ai': { en: 'Futuristic AI', ar: 'مستقبلي ذكي', risk: 'balanced' },
  'scientific-technical': { en: 'Scientific Technical', ar: 'علمي دقيق', risk: 'safe' },
  'saudi-premium': { en: 'Saudi Premium', ar: 'سعودي فاخر', risk: 'safe' },
  'high-energy-promotion': { en: 'High Energy Promotion', ar: 'عرض حماسي', risk: 'balanced' },
  'experimental-editorial': { en: 'Experimental Editorial', ar: 'تحريري تجريبي', risk: 'experimental' },
  'clean-educational': { en: 'Clean Educational', ar: 'تعليمي واضح', risk: 'safe' },
};

/** The few controls advanced users get; everything else is decided by the design skills. */
export interface EngineSettings {
  theme: ThemeId | 'auto';
  creativity: 'safe' | 'balanced' | 'experimental';
  imageStyle: 'auto' | 'photo' | 'graphic';
  detail: 'auto' | 'minimal' | 'detailed';
  referenceStrength: 'loose' | 'balanced' | 'strong';
}
export const DEFAULT_ENGINE_SETTINGS: EngineSettings = { theme: 'auto', creativity: 'balanced', imageStyle: 'auto', detail: 'auto', referenceStrength: 'balanced' };
