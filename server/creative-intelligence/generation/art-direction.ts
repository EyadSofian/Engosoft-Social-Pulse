/**
 * A library template is a starting point, not a mould. Before the image model draws, an art director reads the
 * template, the post's words and the person's photos, and plans a stronger post for this content in the same brand
 * world: what leads, how the blocks are arranged, the one visual idea, the background and the finishing details.
 * The image model then draws from that plan with the template as its reference, and every word stays exactly as
 * written (checked afterwards like any followed design).
 *
 * One text call (with the template image), no extra image calls.
 */
import { openAIJson } from './provider.js';
import { followDataUrl, type FollowDesign } from './follow-design.js';
import type { CopyBlock } from '../typography-validation/copy-check.js';

export interface ArtDirection {
  /** The idea of this post in one or two sentences. */
  concept: string;
  /** Where each block goes and how big, in reading order; what changed from the template and why. */
  composition: string;
  /** The words or number that lead (the first thing seen) and how they are made to lead. */
  emphasis: string;
  /** The one visual idea tied to the topic (an object, a scene, a 3D element), or how the person's photo is used. */
  visual: string;
  /** The background: colour, light, texture, depth. */
  background: string;
  /** Finishing details that make it premium: accents, shapes, shadows, small touches; and what to keep out. */
  details: string;
}

const schema = {
  type: 'object', additionalProperties: false, required: ['concept', 'composition', 'emphasis', 'visual', 'background', 'details'],
  properties: { concept: { type: 'string' }, composition: { type: 'string' }, emphasis: { type: 'string' }, visual: { type: 'string' }, background: { type: 'string' }, details: { type: 'string' } },
};

export const artDirectionInstructions = () => [
  'You are the senior art director at Engosoft, an engineering and professional training company in Saudi Arabia and Egypt. Your posts look like the work of a top regional agency: bold, clean, modern, premium, never cluttered or cheap.',
  'The person picked one of the company\'s design templates (the attached image) and wrote what the post says. The template is the starting point, not a mould: plan a stronger post for this exact content that still clearly belongs to the same series.',
  'Keep: the brand world of the template (its colours, the feel of its type, its finish), the Engosoft logo in the top-left corner, and every block\'s words exactly as given. Arabic reads right to left.',
  'The top band of the canvas (the top 13% of the height) belongs to the logo: it is placed at its left afterwards, so nothing else goes in that band (no text, no photo, no shapes) and the first line of text starts below it. That band is not a separate strip: the post\'s background runs to the top edge and the logo sits on it, even when the template has a white header strip. Never draw a logo, wordmark or tagline yourself.',
  'Every letter of every block stays fully readable: a person, object or shape may overlap a block\'s panel or the space between lines, never a letter. When the person stands in front of a big headline, the headline goes above or beside their head.',
  'Improve freely: the hierarchy (what is seen first), the arrangement and sizes of the blocks, grouping, white space, a visual idea tied to the topic (for an engineering software course, a refined 3D model, a building section, a clean interface glimpse; never generic stock clichés), depth and light, and small premium details.',
  'When the person gave a photo, it is the hero: plan the layout around it (cut out, framed, overlapping a shape) and never change who is in it. When they gave none, decide whether the post is stronger as a graphic or with an unnamed professional or a place (never a real identifiable person).',
  'Never add words, numbers, prices, dates, names or claims; never drop or reword a block; no fake UI text or extra logos.',
  'Write each field as short, concrete instructions an image model can follow (positions in plain words such as "top right, about a third of the width"), in English.',
].join('\n');

export async function planArtDirection(input: { design: FollowDesign; request: string; blocks: CopyBlock[]; photos: string; env: NodeJS.ProcessEnv }): Promise<ArtDirection> {
  const { design, env } = input;
  const given = (design.photos ?? []).map((p) => p.label);
  return openAIJson<ArtDirection>({
    apiKey: env.OPENAI_API_KEY ?? '', model: env.OPENAI_CREATIVE_TEXT_MODEL?.trim() || 'gpt-5.5', reasoning: 'medium',
    schemaName: 'engosoft_art_direction', schema, instructions: artDirectionInstructions(),
    content: [
      { type: 'input_text', text: [
        `Template: ${design.name}.${design.structure ? ` ${design.structure}` : ''}`,
        `What the person asked for: ${input.request}`,
        `The post's blocks, each to appear exactly once with exactly these words: ${input.blocks.filter((b) => b.text).map((b) => `${b.role} (${b.kind}): «${b.text}»`).join('; ')}`,
        given.length ? `Photos the person gave (they are attached after the template): ${given.join(', ')}.` : `No photo was given.${input.photos ? ` The copywriter suggested: ${input.photos}.` : ''}`,
      ].join('\n\n') },
      { type: 'input_image', image_url: followDataUrl(design), detail: 'high' },
    ],
  });
}

const KIND_WORDS: Record<CopyBlock['kind'], string> = { headline: 'headline', line: 'line', price: 'price', label: 'tag', button: 'button', mark: 'series mark' };

/**
 * The image prompt for a template that evolves: Image 1 is the template (the brand world to stay in, not a layout
 * to copy), the next images are the person's photos, and the art direction says what to build.
 */
export function evolveDesignPrompt(input: { blocks: CopyBlock[]; direction: ArtDirection; canvasLabel: string; photoLabels: string[]; photos: string }): string {
  const shown = input.blocks.filter((b) => b.text);
  const lines = shown.map((b, i) => `${i + 1}. ${b.role} (${KIND_WORDS[b.kind]}): «${b.text}»${b.highlight ? ` — colour «${b.highlight}» as the accent` : ''}`);
  const d = input.direction;
  const photos = input.photoLabels.length
    ? `PHOTOS\n${input.photoLabels.map((label, i) => `Image ${i + 2} is the ${label}: use this exact photo as the hero, as planned above. Keep the person exactly as they are (face, features, hair, skin, clothes); you may cut them out, crop, light and place them, never redraw or replace them.`).join('\n')}`
    : input.photos ? `PHOTOS\n${input.photos}. Real, believable people with natural faces and hands; no identifiable public figures.` : '';
  return [
    'A finished, publish-ready social media post for Engosoft, an engineering and professional training company, made by a top creative agency. Crisp, sharp, print-quality finish: clean edges on every letter and shape, no blur, no noise or compression artefacts.',
    `CANVAS\n${input.canvasLabel}`,
    'BRAND WORLD — Image 1',
    'Image 1 is an Engosoft template this post starts from. Stay in its brand world (its colours, the feel of its type, its finish) so the post clearly belongs to the same series, but do not copy its layout: build the stronger post described below. Nothing of Image 1\'s words, numbers or photos is reused.',
    `ART DIRECTION\nIdea: ${d.concept}\nComposition: ${d.composition}\nWhat leads: ${d.emphasis}\nVisual: ${d.visual}\nBackground: ${d.background}\nDetails: ${d.details}`,
    `TEXT — each block once, exactly as written, and no other words\n${lines.join('\n')}`,
    'Arabic reads right to left with every letter correctly joined and spelled exactly as given; Latin words and digits exactly as written. A long line may wrap or take slightly smaller type; never drop, cut or abbreviate a word.',
    photos,
    'Nothing covers any letter: no person, object or shape in front of any word; every block is fully readable.',
    'LOGO\nThe top band of the canvas (the top 13% of the height, full width) is calm background with nothing in it: no text, no photo, no shapes. It is the same background as the rest of the post, running to the top edge: no separate white or coloured header strip, even though Image 1 has one. The Engosoft logo is placed at its left afterwards. Do not draw any logo, wordmark, tagline or watermark anywhere, even though Image 1 shows one.',
    'AVOID\nAny other words or letters; fake UI text; QR codes; clutter; cheap stickers or clip-art; blur or low detail.',
  ].filter(Boolean).join('\n\n');
}
