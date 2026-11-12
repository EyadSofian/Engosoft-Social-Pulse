import type { Post } from '../../types';

/** A post's picture, ready to be written into a file. */
export interface PostPicture {
  /** For the PDF: a data URL, so the printed page never waits on the network. */
  dataUrl: string;
  /** For Excel: a smaller JPEG, so a long period still gives a light workbook. */
  small: { data: Uint8Array; width: number; height: number };
  width: number;
  height: number;
}

const CONCURRENCY = 6;
const SMALL = 220;

const pictureUrl = (post: Post) => `/api/analytics/thumbnail/${encodeURIComponent(post.platform)}/${encodeURIComponent(post.externalId)}`;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function shrink(bitmap: ImageBitmap): Promise<PostPicture['small'] | undefined> {
  const scale = Math.min(1, SMALL / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  return blob ? { data: new Uint8Array(await blob.arrayBuffer()), width, height } : undefined;
}

async function loadOne(post: Post, signal?: AbortSignal): Promise<PostPicture | undefined> {
  try {
    const response = await fetch(pictureUrl(post), { signal });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const small = await shrink(bitmap);
      if (!small) return undefined;
      return { dataUrl: await readAsDataUrl(blob), small, width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  } catch {
    return undefined;
  }
}

/**
 * Fetches the picture of every post that has one, a few at a time. A picture the platform
 * no longer serves (old links expire) is simply missing; the report shows the platform's
 * mark in its place.
 */
export async function loadPictures(posts: Post[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<Map<string, PostPicture>> {
  const queue = posts.filter((post) => post.thumbnail);
  const pictures = new Map<string, PostPicture>();
  let next = 0;
  let done = 0;
  onProgress?.(0, queue.length);
  const worker = async () => {
    while (next < queue.length && !signal?.aborted) {
      const post = queue[next++];
      const picture = await loadOne(post, signal);
      if (picture) pictures.set(post.key, picture);
      onProgress?.(++done, queue.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return pictures;
}
