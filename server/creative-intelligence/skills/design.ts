/** Design-stage skills: the plan a senior design team makes for one direction before any image is generated. */
import { LOGO_CORNERS, LOGO_GUIDANCE, LOGO_MARKS } from '../brand/design-language.js';
import { list, num, obj, oneOf, str, zone, type DesignSkill } from './types.js';

export const layoutDesigner: DesignSkill<'layout-designer'> = {
  id: 'layout-designer', version: 'layout-designer:v1',
  purpose: 'Plans the composition in normalized coordinates (x, y, width, height from 0 to 1, origin top-left).',
  rules: [
    'Think like a poster designer, not a UI designer: grid, alignment, hierarchy, balance (symmetric or asymmetric), scale, proportion, negative space, grouping, rhythm, edge tension, direction of reading and optical balance.',
    'Never use UI spacing habits (12px padding, 16px gaps, 24px radius cards) — posters use a relative system tied to the canvas.',
    'Arabic reads right to left: the eye usually enters top-right. Use the subject’s gaze, gesture and lines to lead to the headline, then to the CTA.',
    'One primary focal point, one or two secondary ones. Do not default to subject-right/text-left; choose the arrangement that serves the idea (centred monument, diagonal, layered depth, top-heavy type, framed panel, full-bleed with inset type…).',
    'Plan the negative space deliberately: for the headline, the logo, the CTA and breathing room. Never fill the canvas because space exists.',
    'Keep headline, subject and CTA inside the central 80% so the design can be recomposed for 9:16 and 1.91:1.',
    'Zones must not overlap unless that overlap is intended (e.g. type layered over a calm part of the image); the logo zone never overlaps faces, headline or CTA.',
  ],
  schema: obj({
    gridType: str('e.g. 6-column, golden-section, centred axis, modular'), balance: oneOf(['asymmetric', 'symmetric', 'diagonal', 'radial', 'layered-depth']),
    primaryFocalPoint: str(), secondaryFocalPoint: str(), visualFlow: str('reading path, e.g. face → headline → facts → CTA'),
    heroSubject: zone(), headlineZone: zone(), supportingCopyZone: zone(), factsZone: zone(), ctaZone: zone(),
    negativeSpaceZones: list(zone()), depthPlan: str('foreground, midground, background roles'), rationale: str(),
  }),
};

export const visualWeightDesigner: DesignSkill<'visual-weight-designer'> = {
  id: 'visual-weight-designer', version: 'visual-weight-designer:v1',
  purpose: 'Maps where attention goes and keeps one clear winner.',
  rules: [
    'Visual weight comes from size, faces, brightness, contrast, saturation, isolation, type size, sharpness, depth, unusual forms and detail. A small face can outweigh a large object.',
    'Aim for 1 primary attention point (weight 0.8–1), 1–2 secondary points (0.5–0.75), everything else supporting (below 0.4). Five equally strong elements is a failed design.',
    'Check the balance of the map against the layout and say what must be toned down if two regions compete.',
  ],
  schema: obj({ regions: list(obj({ region: str('e.g. upper-right'), weight: num('0..1'), source: str() })), balanceCheck: str(), toneDown: list(str()) }),
};

export const spacingDesigner: DesignSkill<'spacing-designer'> = {
  id: 'spacing-designer', version: 'spacing-designer:v1',
  purpose: 'Sets a relative spacing system and the optical corrections the design needs.',
  rules: [
    'Base unit = a fraction of the canvas width (typically 0.015–0.025). Use the scale 1, 2, 3, 4, 6, 8, 12 units for element, group, macro and edge spacing.',
    'Group related items tightly (headline + supporting line), separate groups clearly (copy group vs facts vs CTA). Edge margin at least 4 units.',
    'Optical spacing beats mathematics: Arabic headlines with tall ascenders or descenders, cut-out subjects, round elements and logo artwork padding all need optical adjustment. It must LOOK centred.',
    'Say what each negative space is for (headline, logo, CTA, premium feel, isolation).',
  ],
  schema: obj({ baseUnit: num('fraction of canvas width'), edgeMarginUnits: num(), groupGapUnits: num(), elementGapUnits: num(), opticalCorrections: list(str()), negativeSpacePurpose: str() }),
};

export const typographyDirector: DesignSkill<'typography-director'> = {
  id: 'typography-director', version: 'typography-director:v1',
  purpose: 'Designs typography as a visual system: hierarchy, scale, Arabic line breaks, mixed scripts.',
  rules: [
    'Roles: display, headline, subheadline, body, metadata, badge, cta, caption. Make the size steps meaningful (headline at least ~1.8× the supporting line, facts clearly smaller still). Never 56/52/48.',
    'Break Arabic headlines by meaning, never by available width. No isolated conjunctions (و، أو), short prepositions (في، من، على، إلى) or broken phrases at line ends.',
    'Mixed Arabic + Latin (CFM, PMP, BIM): match visual weight and baseline, keep the acronym legible but not dominant unless it is the hook.',
    'Brand fonts only: Almarai for Arabic, Plus Jakarta Sans for Latin. Weights: headline extra bold, supporting regular or bold, facts regular.',
    'Sizes are cap height as a fraction of canvas width.',
  ],
  schema: obj({
    headlineLines: list(str('the headline split into lines by meaning')),
    scale: obj({ headline: num(), subheadline: num(), facts: num(), cta: num() }),
    alignment: oneOf(['right', 'center', 'left']), emphasis: str('how the emphasised word is treated'), mixedScriptNotes: str(), leading: str(),
  }),
};

export const imageArtDirector: DesignSkill<'image-art-director'> = {
  id: 'image-art-director', version: 'image-art-director:v1',
  purpose: 'Directs the image itself: scene, subject, environment, camera, framing, perspective, depth and realism.',
  rules: [
    'Be specific and useful, not jargon: e.g. "Medium portrait, eye-level camera, subject about 40% of the frame, strong environmental depth, clean negative space on the left, moderate depth of field."',
    'Professional subject placement: "waist-up portrait occupies roughly the right 38% of the composition, eye line slightly above centre, body angled toward the headline" — never just "man on the right".',
    'Unnamed professionals only, believable faces and hands, never a real identifiable person. Environments must be plausible for the course (facility, plant, site, office, studio).',
    'Respect the photo-vs-graphic setting and the theme’s image treatment.',
  ],
  schema: obj({
    scene: str(), subject: str(), subjectPlacement: str(), environment: str(),
    camera: obj({ shot: str(), angle: str(), lens: str(), depthOfField: str() }),
    perspective: str('horizon, vanishing direction'), realism: oneOf(['photographic', '3d-render', 'illustration', 'mixed']),
  }),
};

export const lightingDirector: DesignSkill<'lighting-director'> = {
  id: 'lighting-director', version: 'lighting-director:v1',
  purpose: 'Chooses one lighting world that supports the idea and keeps everything consistent with it.',
  rules: [
    'Choose a setup: studio soft, directional cinematic, natural daylight, hard sunlight, overcast, golden hour, night, industrial, rim-light, practical, volumetric.',
    'Everything lives in the same world: subject key direction, softness, temperature and shadows must agree with the environment. Warm light from the left on the background means warm light from the left on the subject.',
    'State where the key light comes from relative to the headline (light can lead the eye to the type).',
  ],
  schema: obj({ setup: str(), keyDirection: str(), quality: str('soft or hard, falloff'), temperature: str(), rim: str(), atmosphere: str('haze, volumetrics, none'), consistency: str() }),
};

export const colorDirector: DesignSkill<'color-director'> = {
  id: 'color-director', version: 'color-director:v1',
  purpose: 'Gives colour a hierarchy of roles and a harmony that suits the theme.',
  rules: [
    'Roles: dominant, secondary, accent, background, text, highlight — as hex colours.',
    'Do NOT make everything blue. The picture may be photographic, neutral, dark, warm, Saudi green or architectural; Engosoft identity shows through the logo, the type, a small accent or the graphic language. Brand blue #0046FF and orange #FF6600 are accents unless the theme calls for more.',
    'Pick a harmony: monochromatic, analogous, complementary, split-complementary, neutral + accent, warm/cool contrast — and say why.',
    'Text colour must reach strong contrast on its background area.',
  ],
  schema: obj({
    roles: obj({ dominant: str(), secondary: str(), accent: str(), background: str(), text: str(), highlight: str() }),
    harmony: oneOf(['monochromatic', 'analogous', 'complementary', 'split-complementary', 'neutral-accent', 'warm-cool']), brandExpression: str(), why: str(),
  }),
};

export const brandDirector: DesignSkill<'brand-director'> = {
  id: 'brand-director', version: 'brand-director:v1',
  purpose: 'Keeps the post unmistakably Engosoft without forcing it into one template.',
  rules: [
    'Brand consistency comes from official fonts, colours used with intent, the official logo and a confident, professional personality — not from one fixed layout.',
    'Never draw any logo, monogram or the word Engosoft in the image; the official logo file is placed afterwards.',
    'No seals, accreditation badges or certificate marks that imply credentials.',
  ],
  schema: obj({ personality: str(), brandColorUse: str(), checks: list(str()) }),
};

export const logoDirector: DesignSkill<'logo-director'> = {
  id: 'logo-director', version: 'logo-director:v1',
  purpose: 'Plans which official logo treatment the design uses and where, so the image keeps a clean area for it.',
  rules: [
    ...LOGO_GUIDANCE,
    'Prefer a corner that will be quiet, safe and has enough contrast; never over a face, the subject, the headline or the CTA. If none is natural, plan one in the layout’s negative space — never a white box.',
    'Colour (positive or reversed) is chosen later from the measured pixels; you only choose the mark and the corner.',
  ],
  schema: obj({ mark: oneOf(LOGO_MARKS), corner: oneOf(LOGO_CORNERS), reason: str() }),
};

export const photoshopCompositor: DesignSkill<'photoshop-compositor'> = {
  id: 'photoshop-compositor', version: 'photoshop-compositor:v1',
  purpose: 'Plans how the elements of the picture are integrated so it looks photographed and designed, not assembled.',
  rules: [
    'Layer stack: background, environment, midground, subject, foreground, contact shadows, cast shadows, atmosphere, lighting integration, local colour corrections, global grade, typography, brand.',
    'Integration checks: perspective and horizon agree, physical scale is plausible (people, machines, laptops, buildings), key light direction, softness and temperature match, contact shadow under every grounded object, cast shadows follow the light, ambient occlusion at intersections.',
    'Match sharpness to depth, grain and noise across layers, black and white points, saturation and shadow/highlight hue; distant objects lose some contrast and saturation.',
    'No generic drop shadows, no halos, no floating subjects.',
  ],
  schema: obj({ layerStack: list(str()), integration: list(str('concrete integration decisions for this design')), risks: list(str()) }),
};

export const DESIGN_SKILLS = [layoutDesigner, visualWeightDesigner, spacingDesigner, typographyDirector, imageArtDirector, lightingDirector, colorDirector, brandDirector, logoDirector, photoshopCompositor];
