import { ApiError } from '../../lib/api';

const ATTEMPTS = 5;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new ApiError(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`, response.status, body);
  return body as T;
}

/**
 * Uploads a video in pieces (see server/social/video-upload.ts). Each piece is a short request, so a slow
 * connection never hits a request time limit, and a dropped piece is sent again instead of the whole video.
 */
export async function uploadVideo(contentId: string, file: File, onProgress?: (fraction: number) => void) {
  const base = `/api/social/content/${encodeURIComponent(contentId)}/video/uploads`;
  const { uploadId, chunkBytes } = await call<{ uploadId: string; chunkBytes: number }>(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bytes: file.size }) });
  try {
    for (let offset = 0; offset < file.size;) {
      const end = Math.min(file.size, offset + chunkBytes);
      for (let attempt = 1; ; attempt++) {
        try {
          const { received } = await call<{ received: number }>(`${base}/${uploadId}?offset=${offset}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file.slice(offset, end) });
          offset = received;
          break;
        } catch (error) {
          // The server answered with a refusal: sending the same piece again will not help.
          if (error instanceof ApiError && error.status !== 409 && error.status < 500) throw error;
          if (attempt >= ATTEMPTS) throw new Error('انقطع الاتصال أثناء رفع الفيديو أكثر من مرة. تأكد من الإنترنت وحاول تاني.');
          await wait(1000 * attempt);
        }
      }
      onProgress?.(offset / file.size);
    }
    return await call<{ id: string; url: string }>(`${base}/${uploadId}/finish`, { method: 'POST' });
  } catch (error) {
    void fetch(`${base}/${uploadId}`, { method: 'DELETE' }).catch(() => {});
    throw error;
  }
}
