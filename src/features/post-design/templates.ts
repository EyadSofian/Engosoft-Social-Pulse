/** Editable vector layouts for platform posts. All words stay vector text in exported SVG. */
export const POST_SIZES = [
  { id: 'square', label: 'Square feed · 1:1', width: 1080, height: 1080, channels: ['facebook', 'instagram', 'linkedin'] },
  { id: 'portrait', label: 'Portrait feed · 4:5', width: 1080, height: 1350, channels: ['facebook', 'instagram', 'linkedin'] },
  { id: 'story', label: 'Story / Reel · 9:16', width: 1080, height: 1920, channels: ['facebook', 'instagram', 'tiktok', 'snapchat'] },
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
  { id: 'achievement', name: 'Achievement', family: 'team-spotlight', layout: 'spotlight', bg: '#09215f', ink: '#ffffff', accent: '#ff6600' },
  { id: 'occasion', name: 'Occasion', family: 'occasion', layout: 'minimal', bg: '#f4f7ff', ink: '#09215f', accent: '#ff6600' },
  { id: 'ask-majed', name: 'Ask Majed', family: 'ask-majed', layout: 'frame', bg: '#0046ff', ink: '#ffffff', accent: '#ff6600' },
  { id: 'educational-carousel', name: 'Learning carousel', family: 'carousel', layout: 'stack', bg: '#081a50', ink: '#ffffff', accent: '#ff6600' },
  { id: 'career-question', name: 'Career question', family: 'insight', layout: 'editorial', bg: '#f2f6ff', ink: '#071b53', accent: '#0046ff' },
  { id: 'video-hook', name: 'Video hook', family: 'video-hook', layout: 'ribbon', bg: '#081a50', ink: '#ffffff', accent: '#ff6600' },
  { id: 'before-after', name: 'Before / after', family: 'carousel', layout: 'diagonal', bg: '#0046ff', ink: '#ffffff', accent: '#ff6600' },
  { id: 'social-proof', name: 'Social proof', family: 'insight', layout: 'proof', bg: '#eaf0ff', ink: '#071b53', accent: '#ff6600' },
  { id: 'event-reminder', name: 'Event reminder', family: 'webinar', layout: 'timeline', bg: '#09215f', ink: '#ffffff', accent: '#ff6600' },
];

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
  const rows = lines(value, Math.max(11, Math.floor(width / (size * 0.55))), maxLines);
  return rows.map((row, index) => {
    const rtl = /[\u0600-\u06ff]/.test(row);
    const left = x - width;
    return `<text x="${rtl ? x : left}" y="${y + index * size * 1.38}" direction="${rtl ? 'rtl' : 'ltr'}" text-anchor="start" fill="${color}" font-family="Almarai, Arial, sans-serif" font-size="${size}" font-weight="${weight}">${xml(row)}</text>`;
  }).join('');
}

function mark(x: number, y: number, scale: number): string {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><rect width="128" height="128" rx="38" fill="#0046ff" stroke="#ffffff" stroke-opacity=".22" stroke-width="2"/><path d="M39 45 65 35M39 69 88 50M39 94 88 75" stroke="#fff" stroke-width="17" stroke-linecap="round"/><circle cx="89" cy="29" r="9" fill="#ff6600"/></g>`;
}

/** Builds a self-contained SVG. GPT images, when present, sit behind editable SVG type. */
export function renderPosterSvg(template: PostTemplate, sizeId: PostSizeId, data: PosterData): string {
  const size = POST_SIZES.find((entry) => entry.id === sizeId) ?? POST_SIZES[0];
  const h = Math.round(1080 * size.height / size.width);
  const wide = h < 760;
  const story = h > 1500;
  const top = wide ? 95 : story ? 310 : 200;
  const font = wide ? 65 : story ? 90 : 82;
  const contentWidth = wide ? 650 : 860;
  const titleY = top + (wide ? 40 : 135);
  const bodyY = titleY + (wide ? 155 : story ? 405 : 310);
  const image = data.imageDataUrl?.startsWith('data:image/') ? data.imageDataUrl : '';
  const photo = image ? `<image href="${xml(image)}" x="0" y="0" width="1080" height="${h}" preserveAspectRatio="xMidYMid slice"/>` : '';
  const photoBox = image ? `<image href="${xml(image)}" x="540" y="${wide ? 0 : 100}" width="540" height="${wide ? h : h - 230}" preserveAspectRatio="xMidYMid slice"/>` : `<g opacity=".17" fill="#fff"><circle cx="990" cy="${Math.round(h / 2)}" r="245"/><circle cx="990" cy="${Math.round(h / 2)}" r="175" fill="${template.bg}"/></g>`;
  let ornament = '';
  switch (template.layout) {
    case 'split': ornament = `<rect x="540" y="0" width="540" height="${h}" fill="#0c2e9c"/>${photoBox}<path d="M510 0 680 0 525 ${h} 355 ${h}Z" fill="${template.bg}"/>`; break;
    case 'cover': ornament = `${photo}<rect width="1080" height="${h}" fill="#071b53" opacity=".70"/><path d="M0 ${h - 165}h1080v165H0Z" fill="${template.accent}"/>`; break;
    case 'card': ornament = `<rect x="40" y="40" width="1000" height="${h - 80}" rx="42" fill="#ffffff" opacity=".08" stroke="#fff" stroke-width="3"/><circle cx="910" cy="170" r="175" fill="${template.accent}" opacity=".35"/>`; break;
    case 'stack': ornament = `<path d="M60 ${h - 160}h940v55H60Z M95 ${h - 95}h870v45H95Z" fill="${template.accent}"/><path d="M690 0h390v${h}H845Z" fill="#ffffff" opacity=".08"/>`; break;
    case 'diagonal': ornament = `<path d="M565 0h515v${h}H350Z" fill="${template.accent}" opacity=".92"/><path d="M740 0h340v${h}H950Z" fill="#071b53" opacity=".28"/>`; break;
    case 'ticket': ornament = `<rect x="44" y="50" width="992" height="${h - 100}" rx="42" fill="#fff"/><path d="M780 50v${h - 100}" stroke="${template.accent}" stroke-width="4" stroke-dasharray="16 18"/><circle cx="780" cy="50" r="26" fill="${template.bg}"/><circle cx="780" cy="${h - 50}" r="26" fill="${template.bg}"/>`; break;
    case 'frame': ornament = `<rect x="46" y="46" width="988" height="${h - 92}" rx="8" fill="none" stroke="#fff" stroke-width="6"/><path d="M0 ${h - 245}h1080" stroke="${template.accent}" stroke-width="22"/>`; break;
    case 'ring': ornament = `<circle cx="920" cy="${Math.round(h / 2)}" r="300" fill="none" stroke="${template.accent}" stroke-width="90" opacity=".92"/><circle cx="920" cy="${Math.round(h / 2)}" r="160" fill="none" stroke="#fff" stroke-width="4" opacity=".5"/>`; break;
    case 'editorial': ornament = `<rect x="0" y="0" width="38" height="${h}" fill="${template.accent}"/><text x="90" y="${h - 80}" fill="${template.accent}" font-family="Arial" font-size="145" font-weight="800" opacity=".14">ENGOSOFT</text>`; break;
    case 'grid': ornament = `<path d="M0 ${h * .3}h1080M0 ${h * .65}h1080M330 0v${h}M710 0v${h}" stroke="${template.accent}" opacity=".17" stroke-width="3"/><rect x="46" y="${h - 175}" width="988" height="120" rx="20" fill="${template.accent}"/>`; break;
    case 'timeline': ornament = `<path d="M165 ${top - 35}v${Math.max(330, h - top - 240)}" stroke="${template.accent}" stroke-width="10"/><circle cx="165" cy="${top}" r="24" fill="${template.accent}"/><circle cx="165" cy="${h - 260}" r="24" fill="${template.accent}"/>`; break;
    case 'spotlight': ornament = `<circle cx="830" cy="${Math.round(h / 2)}" r="350" fill="#0046ff"/><circle cx="830" cy="${Math.round(h / 2)}" r="260" fill="${template.accent}" opacity=".7"/>${photoBox}`; break;
    case 'ribbon': ornament = `${photo}<rect width="1080" height="${h}" fill="#081a50" opacity="${image ? '.58' : '1'}"/><path d="M0 0h1080v130H0Z M0 ${h - 145}h1080v145H0Z" fill="${template.accent}"/>`; break;
    case 'proof': ornament = `<text x="60" y="${h * .72}" fill="${template.accent}" font-size="540" opacity=".15">“</text><rect x="65" y="85" width="950" height="${h - 170}" rx="50" fill="#fff" opacity=".75"/>`; break;
    case 'minimal': ornament = `<circle cx="890" cy="150" r="240" fill="${template.accent}" opacity=".14"/><path d="M70 ${h - 155}h940" stroke="${template.accent}" stroke-width="12"/>`; break;
  }
  const titleX = template.layout === 'split' && wide ? 620 : 1000;
  const titleWidth = template.layout === 'split' && wide ? 540 : contentWidth;
  const actualFont = data.title.length > 90 ? font * .7 : data.title.length > 52 ? font * .82 : font;
  const head = `<rect x="${wide ? 65 : 68}" y="${wide ? 44 : 65}" width="${wide ? 260 : 320}" height="${wide ? 45 : 58}" rx="29" fill="${template.accent}"/><text x="${wide ? 195 : 228}" y="${wide ? 75 : 104}" text-anchor="middle" fill="#fff" font-family="Almarai, Arial" font-size="${wide ? 22 : 28}" font-weight="700">${xml(data.eyebrow.slice(0, 30))}</text>`;
  const footerY = h - (wide ? 48 : story ? 115 : 75);
  const cta = `<rect x="${wide ? 60 : 70}" y="${footerY - 33}" width="${wide ? 260 : 310}" height="58" rx="29" fill="${template.accent}"/><text x="${wide ? 190 : 225}" y="${footerY + 4}" text-anchor="middle" fill="#fff" font-family="Almarai, Arial" font-size="24" font-weight="700">${xml(data.cta.slice(0, 28))}</text>`;
  const body = data.body ? textLines(data.body, 1000, bodyY, wide ? 29 : 34, contentWidth, wide ? 2 : 3, template.ink, 400) : '';
  const detail = data.detail ? textLines(data.detail, 1000, footerY - (wide ? 52 : 80), wide ? 24 : 29, contentWidth, 2, template.ink, 700) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size.width}" height="${size.height}" viewBox="0 0 1080 ${h}" role="img" aria-label="${xml(data.title)}"><rect width="1080" height="${h}" fill="${template.bg}"/>${image ? `<image href="${xml(image)}" x="0" y="0" width="1080" height="${h}" preserveAspectRatio="xMidYMid slice" opacity=".2"/>` : ''}${ornament}${head}${mark(910, wide ? 43 : 58, wide ? .6 : .75)}${textLines(data.title, titleX, titleY, actualFont, titleWidth, wide ? 2 : story ? 4 : 3, template.ink)}${body}${detail}${cta}</svg>`;
}
