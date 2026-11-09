import sharp from 'sharp';

export type ImageProfile = 'original' | 'instagram' | 'thumbnail';
const MAX_BYTES = 8 * 1024 * 1024;

/** Encode from the source once; never discard resolution just to share Instagram's limits. */
export async function preparePublishingImage(buffer: Buffer, profile: ImageProfile = 'original') {
  const metadata = await sharp(buffer, { limitInputPixels: 80_000_000 }).metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1 || !metadata.width || !metadata.height)
    throw new Error('استخدم صورة JPEG أو PNG أو WebP ثابتة.');
  const swapped = [5, 6, 7, 8].includes(metadata.orientation || 1);
  const sourceWidth = swapped ? metadata.height : metadata.width;
  const sourceHeight = swapped ? metadata.width : metadata.height;
  const ratio = sourceWidth / sourceHeight;
  const padding = profile === 'instagram' && (ratio < 0.8 || ratio > 1.91);
  // LinkedIn's pixel limit is below 36,152,320; stay within that and the attachment decoder's cap.
  const scale = Math.min(1, Math.sqrt(36_000_000 / (sourceWidth * sourceHeight)),
    profile === 'instagram' ? 1440 / sourceWidth : 1,
    profile === 'thumbnail' ? Math.min(1440 / sourceWidth, 2560 / sourceHeight) : 1);
  let width = Math.max(1, Math.floor(sourceWidth * scale));
  let height = Math.max(1, Math.round(sourceHeight * scale));
  if (profile === 'instagram' && !padding) height = Math.max(Math.ceil(width / 1.91), Math.min(height, Math.floor(width / 0.8)));
  // Safe JPEGs already ready for the target are stored byte-for-byte, including originals and prepared variants.
  if (!padding && scale === 1 && metadata.format === 'jpeg' && (!metadata.orientation || metadata.orientation === 1)
    && metadata.space === 'srgb' && !metadata.icc && buffer.length <= MAX_BYTES) return buffer;

  for (let sizeAttempt = 0; sizeAttempt < 12; sizeAttempt++) {
    for (const quality of [98, 96, 94, 92]) {
      let image = sharp(buffer, { limitInputPixels: 80_000_000 }).rotate().flatten({ background: '#ffffff' }).toColourspace('srgb');
      image = padding
        ? image.resize({ width: Math.min(1440, width), height: Math.round(Math.min(1440, width) * 1.25), fit: 'contain', background: '#ffffff' })
        : image.resize({ width, height, fit: 'fill', withoutEnlargement: true });
      const result = await image.jpeg({ quality, chromaSubsampling: '4:4:4', progressive: true }).toBuffer();
      if (result.length <= MAX_BYTES) return result;
    }
    // Only exceptionally large/noisy artwork needs fewer pixels; always resample from the original.
    width = Math.max(1, Math.floor(width * 0.85));
    height = Math.max(1, Math.round(width / ratio));
    if (profile === 'instagram' && !padding) height = Math.max(Math.ceil(width / 1.91), Math.min(height, Math.floor(width / 0.8)));
  }
  throw new Error('تعذّر تجهيز الصورة ضمن حد 8MB؛ استخدم ملفًا أصغر.');
}
