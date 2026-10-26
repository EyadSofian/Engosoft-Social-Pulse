import type { Objective } from './brief';
import { retrieveVisualReferences } from './visual-references';

export type DesignFamily = 'course_instructor' | 'webinar' | 'engineering_carousel' | 'student_project' | 'corporate' | 'saudi_campaign' | 'majd_ai' | 'promotion' | 'operational_schedule';
export type Composition = 'full_bleed_editorial' | 'centered_portrait' | 'technical_gallery' | 'typographic_impact' | 'floating_panel' | 'offer_focus';
export type CtaTreatment = 'pill' | 'underline' | 'bottom_banner' | 'text_link' | 'none';
export type ColorMode = 'brand_blue' | 'light_technical' | 'dark_navy' | 'emerald_gold' | 'purple_tech';
export interface CreativeDirection {
  id: string;
  name: string;
  family: DesignFamily;
  composition: Composition;
  imageTreatment: 'full_bleed' | 'framed' | 'portrait' | 'accent';
  headlineHierarchy: 'hero' | 'balanced';
  informationDensity: 'low' | 'medium' | 'high';
  ctaTreatment: CtaTreatment;
  colorMode: ColorMode;
  rationale: string;
  referenceIds: string[];
}
const direction = (id: string, name: string, family: DesignFamily, composition: Composition, imageTreatment: CreativeDirection['imageTreatment'], ctaTreatment: CtaTreatment, colorMode: ColorMode, referenceIds: string[], rationale: string): CreativeDirection => ({
  id, name, family, composition, imageTreatment, headlineHierarchy: composition === 'typographic_impact' || composition === 'offer_focus' ? 'hero' : 'balanced', informationDensity: composition === 'technical_gallery' ? 'high' : 'medium', ctaTreatment, colorMode, referenceIds, rationale,
});
/** Four different editable directions, with deterministic fallback when AI is unavailable. */
export function localDirections(prompt: string, objective: Objective): CreativeDirection[] {
  const matches = retrieveVisualReferences(prompt, objective, 4);
  const refs = matches.map((item) => item.id);
  const detected = (matches.find((item) => item.family in DIRECTION_SAMPLE_IMAGE)?.family ?? 'corporate') as DesignFamily;
  const primary: DesignFamily = objective === 'course_schedule' ? 'operational_schedule' : objective === 'event' ? 'webinar' : objective === 'course_launch' ? 'course_instructor' : detected;
  const cultural = /سعود|رياض|وطني|saudi|riyadh/i.test(prompt);
  const promo = /خصم|عرض|تخفيض|discount|offer/i.test(prompt);
  return [
    direction('editorial', 'Photographic editorial', cultural ? 'saudi_campaign' : primary, 'full_bleed_editorial', 'full_bleed', 'underline', cultural ? 'emerald_gold' : 'brand_blue', refs, 'A photographic story with the headline layered over the scene.'),
    direction('portrait', 'Instructor-led', primary === 'operational_schedule' ? 'course_instructor' : primary, 'centered_portrait', 'portrait', 'pill', 'brand_blue', refs, 'Human-first credibility with a clear course or event hierarchy.'),
    direction('technical', 'Technical evidence', objective === 'course_schedule' ? 'operational_schedule' : 'engineering_carousel', 'technical_gallery', 'framed', 'text_link', 'light_technical', refs, 'The engineering visual is the central evidence; type remains concise.'),
    direction('impact', promo ? 'Offer impact' : 'Typographic impact', promo ? 'promotion' : cultural ? 'saudi_campaign' : 'corporate', promo ? 'offer_focus' : 'typographic_impact', 'accent', promo ? 'bottom_banner' : 'none', cultural ? 'emerald_gold' : 'dark_navy', refs, 'A bold, image-light composition built around one memorable message.'),
  ];
}
export const DIRECTION_SAMPLE_IMAGE: Record<DesignFamily, string> = {
  course_instructor: '/post-assets/instructor.jpg', webinar: '/post-assets/instructor.jpg', engineering_carousel: '/post-assets/cad-drawing.jpg', student_project: '/post-assets/cad-drawing.jpg', corporate: '/post-assets/architecture.jpg', saudi_campaign: '/post-assets/green-campaign.jpg', majd_ai: '/post-assets/architecture.jpg', promotion: '/post-assets/automotive.jpg', operational_schedule: '/post-assets/cad-drawing.jpg',
};
