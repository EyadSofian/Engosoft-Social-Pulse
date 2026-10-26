import { lockedLogoSvg, logoHref, minimumBadgeDiameter, pickVariantForFlatBackground, whiteBadgeSvg, type LogoHrefs, type LogoVariant } from '../brand/approved';
import { getLogoVariant, logoContainer } from '../../../server/creative-intelligence/brand/registry';

/** Editable vector layouts for platform posts. Brand artwork stays an immutable image layer. */
export const POST_SIZES = [
  { id: 'square', label: 'Square feed · 1:1', width: 1080, height: 1080, channels: ['facebook', 'instagram', 'linkedin'] },
  { id: 'portrait', label: 'Portrait feed · 4:5', width: 1080, height: 1350, channels: ['facebook', 'instagram', 'linkedin'] },
  { id: 'story', label: 'Story / Reel / Status · 9:16', width: 1080, height: 1920, channels: ['facebook', 'instagram', 'whatsapp', 'tiktok', 'snapchat'] },
  { id: 'facebook-wide', label: 'Facebook landscape', width: 1200, height: 630, channels: ['facebook'] },
  { id: 'linkedin-wide', label: 'LinkedIn landscape', width: 1200, height: 627, channels: ['linkedin'] },
  { id: 'video-wide', label: 'Video cover · 16:9', width: 1920, height: 1080, channels: ['facebook', 'linkedin', 'website'] },
] as const;

export type PostSizeId = (typeof POST_SIZES)[number]['id'];
export type PostLayout = 'split' | 'cover' | 'card' | 'stack' | 'diagonal' | 'ticket' | 'frame' | 'ring' | 'editorial' | 'grid' | 'timeline' | 'spotlight' | 'ribbon' | 'proof' | 'minimal';
export interface PostTemplate { id: string; name: string; family: string; layout: PostLayout; bg: string; ink: string; accent: string; }

export const POST_TEMPLATES: PostTemplate[] = [
  { id: 'course-launch', name: 'Course launch', family: 'course-offer', layout: 'split', bg: '#0046ff', ink: '#ffffff', accent: '#ff6600' },
  { id: 'course-hero', name: 'Course hero', family: 'course-offer', layout: 'cover', bg: '#0034bb', ink: '#ffffff', accent: '#ff6600' },
  { id: 'course-compact', name: 'Course compact', family: 'course-offer', layout: 'ticket', bg: '#f2f6ff', ink: '#071b53', accent: '#ff6600' },
  { id: 'webinar', name: 'Webinar invite', family: 'webinar', layout: 'card', bg: '#091c57', ink: '#ffffff', accent: '#ff6600' },
  { id: 'monthly-calendar', name: 'Monthly schedule', family: 'monthly-schedule', layout: 'grid', bg: '#eff4ff', ink: '#071b53', accent: '#0046ff' },
  { id: 'certification', name: 'Certification track', family: 'certification', layout: 'ring', bg: '#0046ff', ink: '#ffffff', accent: '#ff6600' },
  { id: 'achievement', name: 'Instructor spotlight', family: 'team-spotlight', layout: 'spotlight', bg: '#09215f', ink: '#ffffff', accent: '#ff6600' },
  { id: 'occasion', name: 'Occasion', family: 'occasion', layout: 'minimal', bg: '#f4f7ff', ink: '#09215f', accent: '#ff6600' },
  { id: 'ask-majed', name: 'Ask Majed', family: 'ask-majed', layout: 'frame', bg: '#0046ff', ink: '#ffffff', accent: '#ff6600' },
  { id: 'educational-carousel', name: 'Learning carousel', family: 'carousel', layout: 'stack', bg: '#081a50', ink: '#ffffff', accent: '#ff6600' },
  { id: 'career-question', name: 'Career question', family: 'insight', layout: 'editorial', bg: '#f2f6ff', ink: '#071b53', accent: '#0046ff' },
  { id: 'video-hook', name: 'Video hook', family: 'video-hook', layout: 'ribbon', bg: '#081a50', ink: '#ffffff', accent: '#ff6600' },
  { id: 'before-after', name: 'Before / after', family: 'carousel', layout: 'diagonal', bg: '#0046ff', ink: '#ffffff', accent: '#ff6600' },
  { id: 'social-proof', name: 'Social proof', family: 'insight', layout: 'proof', bg: '#eaf0ff', ink: '#071b53', accent: '#ff6600' },
  { id: 'event-reminder', name: 'Event reminder', family: 'webinar', layout: 'timeline', bg: '#09215f', ink: '#ffffff', accent: '#ff6600' },
];

/** Original generated sample photography. Production copy and image remain replaceable. */
export const SAMPLE_IMAGE_BY_TEMPLATE: Record<string, string> = {
  'course-launch': '/post-assets/architecture.jpg',
  'course-hero': '/post-assets/automotive.jpg',
  'course-compact': '/post-assets/architecture.jpg',
  webinar: '/post-assets/instructor.jpg',
  'monthly-calendar': '/post-assets/cad-drawing.jpg',
  certification: '/post-assets/instructor.jpg',
  achievement: '/post-assets/instructor.jpg',
  occasion: '/post-assets/green-campaign.jpg',
  'ask-majed': '/post-assets/instructor.jpg',
  'educational-carousel': '/post-assets/cad-drawing.jpg',
  'career-question': '/post-assets/green-campaign.jpg',
  'video-hook': '/post-assets/automotive.jpg',
  'before-after': '/post-assets/automotive.jpg',
  'social-proof': '/post-assets/architecture.jpg',
  'event-reminder': '/post-assets/instructor.jpg',
};

export interface PosterData {
  title: string;
  eyebrow: string;
  body: string;
  cta: string;
  detail?: string;
  imageDataUrl?: string;
}

export function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function lines(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const output: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && `${current} ${word}`.length > maxChars) { output.push(current); current = word; }
    else current = current ? `${current} ${word}` : word;
  }
  if (current) output.push(current);
  if (output.length > maxLines) output[maxLines - 1] = `${output.slice(maxLines - 1).join(' ').slice(0, maxChars - 1)}…`;
  return output.slice(0, maxLines);
}

function textLines(value: string, x: number, y: number, size: number, width: number, maxLines: number, color: string, weight = 700): string {
  const rows = lines(value, Math.max(10, Math.floor(width / (size * 0.72))), maxLines);
  return rows.map((row, index) => {
    const rtl = /[\u0600-\u06ff]/.test(row);
    const left = x - width;
    return `<text x="${rtl ? x : left}" y="${y + index * size * 1.38}" direction="${rtl ? 'rtl' : 'ltr'}" text-anchor="start" fill="${color}" font-family="${rtl ? 'Almarai' : "'Plus Jakarta Sans'"},sans-serif" font-size="${size}" font-weight="${weight}">${xml(row)}</text>`;
  }).join('');
}

/** Layouts whose artwork reaches the top-left logo corner, per format. Kept in sync by a pixel test. */
const PHOTO_UNDER_LOGO: Record<'feed' | 'story', ReadonlySet<PostLayout>> = {
  feed: new Set<PostLayout>(['split', 'cover', 'card', 'ring', 'spotlight', 'editorial', 'ribbon', 'diagonal', 'timeline', 'frame']),
  story: new Set<PostLayout>(['split', 'cover', 'editorial']),
};
export function photoCoversLogoCorner(layout: PostLayout, sizeId: PostSizeId): boolean {
  const size = POST_SIZES.find((entry) => entry.id === sizeId) ?? POST_SIZES[0];
  const h = 1080 * size.height / size.width;
  if (h < 760) return true;
  return PHOTO_UNDER_LOGO[h > 1500 ? 'story' : 'feed'].has(layout);
}

/** Where and how renderPosterSvg places the logo; the page's brand checks read the same numbers. */
export function templateLogoPlacement(template: PostTemplate, sizeId: PostSizeId, hasPhoto: boolean): { variant: LogoVariant; x: number; y: number; width: number; badge?: { x: number; y: number; diameter: number } } {
  const size = POST_SIZES.find((entry) => entry.id === sizeId) ?? POST_SIZES[0];
  const h = Math.round(1080 * size.height / size.width);
  const wide = h < 760, story = h > 1500;
  const light = ['split', 'editorial', 'grid', 'stack', 'ticket', 'minimal', 'proof'].includes(template.layout);
  if (hasPhoto && photoCoversLogoCorner(template.layout, sizeId)) {
    const diameter = minimumBadgeDiameter(1080), y = story ? 72 : 54;
    const badge = logoContainer('white-circle');
    const width = badge.symbolWidth(diameter);
    return { variant: badge.symbolVariant, x: Math.round(54 + diameter / 2 - width / 2), y: Math.round(y + diameter / 2 - width / getLogoVariant(badge.symbolVariant).aspectRatio / 2), width, badge: { x: 54, y, diameter } };
  }
  return { variant: pickVariantForFlatBackground(light ? '#f7f9fc' : '#0a245f', wide ? 'symbol' : 'lockup'), x: 58, y: story ? 80 : 54, width: wide ? 64 : 240 };
}

/** Builds a self-contained SVG with separate image, editable type and immutable approved logo. */
export function renderPosterSvg(template: PostTemplate, sizeId: PostSizeId, data: PosterData, logoHrefs: LogoHrefs = {}): string {
  const size = POST_SIZES.find((entry) => entry.id === sizeId) ?? POST_SIZES[0];
  const h = Math.round(1080 * size.height / size.width);
  const wide = h < 760;
  const story = h > 1500;
  const photo = data.imageDataUrl?.startsWith('data:image/') ? data.imageDataUrl : '';
  const light = ['split', 'editorial', 'grid', 'stack', 'ticket', 'minimal', 'proof'].includes(template.layout);
  const bg = light ? '#f7f9fc' : '#0a245f';
  const ink = light ? '#102657' : '#ffffff';
  const blue = '#0046ff';
  const orange = '#ff6600';
  // Exact approved file, no plate. On a flat corner the variant follows the fill; where the layout puts a photo
  // under the corner (measured in tests/post-designer.test.ts) the approved white circle badge is used instead.
  const logo = templateLogoPlacement(template, sizeId, Boolean(photo));
  const logoLayer = logo.badge
    ? whiteBadgeSvg(logo.badge.x, logo.badge.y, logo.badge.diameter, logoHrefs)
    : lockedLogoSvg(logo.x, logo.y, logo.width, logo.variant, logoHref(logo.variant, logoHrefs));
  const grid = `<g stroke="#ffffff" stroke-opacity=".14" stroke-width="2"><path d="M0 0V${h}M120 0V${h}M240 0V${h}M360 0V${h}M480 0V${h}M600 0V${h}M720 0V${h}M840 0V${h}M960 0V${h}"/><path d="M0 120H1080M0 240H1080M0 360H1080M0 480H1080M0 600H1080M0 720H1080M0 840H1080M0 960H1080M0 1080H1080M0 1200H1080M0 1320H1080M0 1440H1080M0 1560H1080M0 1680H1080M0 1800H1080"/></g>`;
  let art = '';
  let x = 1000;
  let width = wide ? 520 : 820;
  let titleY = wide ? 230 : story ? 1060 : 330;
  let bodyColor = ink;
  let typeColor = ink;
  let ctaX = wide ? 700 : 690;
  let ctaY = h - (story ? 190 : wide ? 108 : 148);
  let labelY = wide ? 145 : story ? 920 : 226;
  let labelColor = blue;
  let bodyYOverride: number | undefined;
  const photoImage = (px: number, py: number, pw: number, ph: number) => photo ? `<image href="${xml(photo)}" x="${px}" y="${py}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid slice"/>` : '';
  switch (template.layout) {
    case 'cover': {
      art = `<rect width="1080" height="${h}" fill="${blue}"/>${photoImage(0, 0, 1080, h)}<rect x="${wide ? 425 : 485}" y="0" width="${wide ? 655 : 595}" height="${h}" fill="#061c58" fill-opacity="${photo ? '.94' : '.55'}"/><path d="M${wide ? 425 : 485} ${h - 90}H1080" stroke="${orange}" stroke-width="10"/>`;
      width = wide ? 505 : 825; titleY = wide ? 245 : story ? 960 : 425; labelY = wide ? 140 : story ? 850 : 315; ctaX = wide ? 700 : 690;
      break;
    }
    case 'ticket': {
      const cardY = wide ? 135 : story ? 385 : 250;
      const cardH = wide ? 410 : story ? 1160 : h - 335;
      art = `<rect x="52" y="${cardY}" width="976" height="${cardH}" rx="28" fill="#fff" stroke="#d8e2f1" stroke-width="3"/><rect x="52" y="${cardY}" width="${wide ? 370 : 430}" height="${cardH}" rx="28" fill="#0a245f"/>${photoImage(52, cardY, wide ? 370 : 430, cardH)}<path d="M${wide ? 422 : 482} ${cardY + 40}V${cardY + cardH - 40}" stroke="${blue}" stroke-width="4" stroke-dasharray="12 13"/>`;
      width = wide ? 505 : 455; titleY = wide ? 280 : story ? 665 : 425; labelY = wide ? 175 : story ? 565 : 315;
      break;
    }
    case 'card': {
      art = `<rect x="0" y="0" width="${wide ? 410 : 470}" height="${h}" fill="${blue}"/>${photoImage(0, story ? 295 : wide ? 0 : 155, wide ? 410 : 470, story ? 820 : wide ? h : h - 260)}<rect x="${wide ? 410 : 470}" y="0" width="${wide ? 670 : 610}" height="${h}" fill="#09215f"/><path d="M${wide ? 455 : 510} ${h - (wide ? 85 : 185)}H1015" stroke="${orange}" stroke-width="8"/>`;
      width = wide ? 510 : 450; titleY = wide ? 250 : story ? 760 : 405; labelY = wide ? 145 : story ? 650 : 290;
      break;
    }
    case 'spotlight': {
      art = `<rect width="1080" height="${h}" fill="${blue}"/><path d="M0 ${h}L${wide ? 465 : 505} 0H0Z" fill="#0a245f"/>${photoImage(20, story ? 300 : wide ? 35 : 180, wide ? 430 : 480, story ? 820 : wide ? h - 70 : h - 320)}<rect x="${wide ? 430 : 480}" width="8" height="${h}" fill="${orange}"/>`;
      width = wide ? 525 : 450; titleY = wide ? 260 : story ? 800 : 420; labelY = wide ? 155 : story ? 680 : 300;
      break;
    }
    case 'minimal': {
      art = `<rect x="55" y="${wide ? 110 : story ? 380 : 245}" width="${wide ? 370 : 420}" height="${wide ? 420 : story ? 720 : 635}" rx="4" fill="#e9eff9" stroke="#0a245f" stroke-width="8"/>${photoImage(65, wide ? 120 : story ? 390 : 255, wide ? 350 : 400, wide ? 400 : story ? 700 : 615)}<path d="M75 ${h - (wide ? 80 : 120)}H1005" stroke="${blue}" stroke-width="5"/>`;
      width = wide ? 520 : 460; titleY = wide ? 270 : story ? 745 : 435; labelY = wide ? 160 : story ? 635 : 315;
      break;
    }
    case 'frame': {
      art = `<rect width="1080" height="${h}" fill="#0a245f"/>${grid}<rect x="${wide ? 50 : 75}" y="${wide ? 105 : story ? 315 : 215}" width="${wide ? 370 : 420}" height="${wide ? 475 : story ? 795 : 690}" rx="24" fill="none" stroke="#fff" stroke-width="12"/>${photoImage(wide ? 62 : 87, wide ? 117 : story ? 327 : 227, wide ? 346 : 396, wide ? 451 : story ? 771 : 666)}<path d="M${wide ? 50 : 75} ${wide ? 105 : story ? 315 : 215}H${wide ? 250 : 315}" stroke="${orange}" stroke-width="14"/>`;
      width = wide ? 525 : 445; titleY = wide ? 260 : story ? 810 : 420; labelY = wide ? 150 : story ? 700 : 300;
      break;
    }
    case 'ribbon': {
      art = `<rect width="1080" height="${h}" fill="#09215f"/><path d="M0 0H${wide ? 420 : 485}L${wide ? 310 : 375} ${h}H0Z" fill="${blue}"/>${photoImage(0, story ? 310 : wide ? 0 : 180, wide ? 405 : 470, story ? 760 : wide ? h : h - 300)}<path d="M${wide ? 420 : 485} 0L${wide ? 310 : 375} ${h}" stroke="${orange}" stroke-width="12"/>`;
      width = wide ? 515 : 450; titleY = wide ? 260 : story ? 830 : 425; labelY = wide ? 155 : story ? 710 : 305;
      break;
    }
    case 'diagonal': {
      art = `<rect width="1080" height="${h}" fill="${blue}"/><path d="M0 0H${wide ? 465 : 525}L${wide ? 405 : 465} ${h}H0Z" fill="#f7f9fc"/>${photoImage(0, story ? 305 : wide ? 0 : 165, wide ? 435 : 495, story ? 780 : wide ? h : h - 270)}<path d="M${wide ? 465 : 525} 0L${wide ? 405 : 465} ${h}" stroke="${orange}" stroke-width="10"/>`;
      width = wide ? 500 : 420; titleY = wide ? 250 : story ? 810 : 415; labelY = wide ? 145 : story ? 690 : 295;
      break;
    }
    case 'proof': {
      art = `<rect x="55" y="${wide ? 125 : story ? 390 : 250}" width="${wide ? 370 : 430}" height="${wide ? 400 : story ? 760 : 670}" rx="20" fill="#0a245f"/>${photoImage(65, wide ? 135 : story ? 400 : 260, wide ? 350 : 410, wide ? 380 : story ? 740 : 650)}<path d="M${wide ? 55 : 75} ${wide ? 540 : story ? 1170 : 945}H${wide ? 425 : 485}" stroke="${orange}" stroke-width="12"/>`;
      width = wide ? 520 : 445; titleY = wide ? 260 : story ? 780 : 420; labelY = wide ? 150 : story ? 660 : 300;
      break;
    }
    case 'split': {
      if (story) {
        art = `<rect x="0" y="0" width="1080" height="790" fill="${blue}"/>${grid}${photoImage(0, 205, 1080, 570)}<path d="M0 790H1080" stroke="${orange}" stroke-width="18"/>`;
        titleY = 1040; labelY = 920; width = 860;
      } else {
        const pw = wide ? 460 : 445;
        art = `<rect x="0" y="0" width="${pw}" height="${h}" fill="${blue}"/>${grid}${photoImage(0, wide ? 0 : 145, pw, wide ? h : h - 250)}<path d="M${pw} 0V${h}" stroke="${orange}" stroke-width="11"/><path d="M72 ${h - 70}H${pw - 72}" stroke="#ffffff" stroke-opacity=".7" stroke-width="4"/>`;
        width = 470; titleY = wide ? 290 : 390; labelY = wide ? 190 : 275;
      }
      break;
    }
    case 'grid': {
      const imageTop = wide ? 105 : story ? 410 : 330;
      const imageHeight = wide ? 310 : story ? 1100 : h - 560;
      art = `<rect x="0" y="0" width="1080" height="${wide ? 18 : 24}" fill="${blue}"/><rect x="68" y="${imageTop}" width="944" height="${imageHeight}" rx="18" fill="#0a245f"/>${photoImage(78, imageTop + 10, 924, imageHeight - 20)}<path d="M85 ${imageTop + imageHeight + 8}H995" stroke="${orange}" stroke-width="10"/>`;
      width = wide ? 540 : 600; titleY = wide ? 235 : story ? 330 : 250; labelY = wide ? 145 : story ? 215 : 150;
      bodyYOverride = wide ? 455 : story ? 1600 : h - 150;
      ctaY = wide ? 495 : story ? 1785 : h - 80;
      break;
    }
    case 'ring': {
      art = `<rect x="0" y="0" width="${wide ? 435 : 475}" height="${h}" fill="${blue}"/>${grid}${photoImage(0, story ? 290 : 140, wide ? 435 : 475, story ? 700 : h - 270)}<path d="M${wide ? 435 : 475} 0V${h}" stroke="${orange}" stroke-width="12"/>`;
      width = wide ? 520 : 455; titleY = wide ? 260 : story ? 810 : 410; labelY = wide ? 165 : story ? 700 : 290; ctaX = wide ? 700 : 670;
      break;
    }
    case 'stack': {
      const stackTop = story ? 410 : wide ? 120 : 330;
      const stackHeight = story ? 1100 : wide ? 310 : h - 560;
      art = `<rect x="0" y="0" width="${wide ? 38 : 50}" height="${h}" fill="${blue}"/><rect x="${wide ? 58 : 65}" y="${stackTop}" width="${wide ? 470 : 950}" height="${stackHeight}" rx="12" fill="#0a245f"/>${photoImage(wide ? 66 : 73, stackTop + 8, wide ? 454 : 934, stackHeight - 16)}<path d="M${wide ? 70 : 85} ${stackTop + stackHeight + 10}h${wide ? 390 : 910}" stroke="${orange}" stroke-width="12"/>`;
      width = wide ? 470 : 700; titleY = story ? 330 : wide ? 245 : 245; labelY = story ? 215 : wide ? 145 : 145;
      bodyYOverride = wide ? 455 : story ? 1600 : h - 150;
      ctaY = wide ? 495 : story ? 1785 : h - 80;
      break;
    }
    case 'editorial': {
      art = `<rect x="0" y="0" width="${wide ? 30 : 42}" height="${h}" fill="${blue}"/><path d="M85 ${story ? 1180 : wide ? 520 : 800}H995" stroke="${orange}" stroke-width="9"/>${photo ? photoImage(70, story ? 175 : wide ? 130 : 160, wide ? 320 : 365, story ? 560 : wide ? 370 : 465) : `<text x="90" y="${story ? 620 : wide ? 445 : 560}" fill="${blue}" font-family="Arial" font-size="${wide ? 260 : 360}" font-weight="800" opacity=".14">01</text>`}`;
      width = wide ? 620 : 630; titleY = wide ? 260 : story ? 910 : 430; labelY = wide ? 155 : story ? 790 : 300;
      break;
    }
    case 'timeline': {
      art = `<rect x="0" y="0" width="${wide ? 440 : 480}" height="${h}" fill="${blue}"/>${grid}${photoImage(0, story ? 320 : wide ? 0 : 180, wide ? 440 : 480, story ? 670 : wide ? h : h - 310)}<path d="M${wide ? 440 : 480} 0V${h}" stroke="${orange}" stroke-width="11"/><rect x="${wide ? 480 : 520}" y="${story ? 1380 : wide ? 540 : h - 285}" width="${wide ? 520 : 480}" height="7" fill="${orange}"/>`;
      width = wide ? 510 : 450; titleY = wide ? 245 : story ? 850 : 390; labelY = wide ? 155 : story ? 735 : 285;
      break;
    }
    default: break;
  }
  const titleFont = wide ? 55 : story ? 79 : 73;
  const rows = lines(data.title, Math.max(9, Math.floor(width / (titleFont * .72))), wide ? 2 : 4).length;
  const bodyY = bodyYOverride ?? titleY + rows * titleFont * 1.34 + (wide ? 14 : 30);
  const title = textLines(data.title, x, titleY, titleFont, width, wide ? 2 : 4, typeColor, 800);
  const body = data.body ? textLines(data.body, x, bodyY, wide ? 26 : 31, width, wide ? 2 : story ? 4 : 3, bodyColor, 400) : '';
  const detail = data.detail ? textLines(data.detail, x, ctaY - (wide ? 54 : 120), wide ? 23 : 28, width, 2, ink, 700) : '';
  const eyebrow = `<rect x="${x - 140}" y="${labelY - 24}" width="140" height="7" fill="${orange}"/>${textLines(data.eyebrow.slice(0, 28), x, labelY + 25, wide ? 23 : 26, width, 1, light ? '#0046ff' : '#dbe8ff', 700)}`;
  const cta = `<rect x="${ctaX}" y="${ctaY}" width="300" height="68" rx="8" fill="${orange}"/><text x="${ctaX + 150}" y="${ctaY + 43}" fill="#fff" text-anchor="middle" font-family="Almarai,Arial,sans-serif" font-size="27" font-weight="700">${xml(data.cta.slice(0, 27))}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size.width}" height="${size.height}" viewBox="0 0 1080 ${h}" role="img" aria-label="${xml(data.title)}"><rect width="1080" height="${h}" fill="${bg}"/>${art}${logoLayer}${eyebrow}${title}${body}${detail}${cta}</svg>`;
}
