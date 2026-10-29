import type { VideoFacts } from '../../domain/reels';

const once = (video: HTMLVideoElement, event: string) => new Promise<void>((resolve, reject) => {
  const done = () => { video.removeEventListener(event, done); video.removeEventListener('error', fail); resolve(); };
  const fail = () => { video.removeEventListener(event, done); video.removeEventListener('error', fail); reject(new Error('The browser could not read this video. Export it as a standard MP4 (H.264).')); };
  video.addEventListener(event, done);
  video.addEventListener('error', fail);
});

/** Duration and size as the browser reads them; the server checks the MP4 again on upload. */
export async function readVideo(file: File): Promise<{ facts: VideoFacts; url: string }> {
  const url = URL.createObjectURL(file);
  const video = Object.assign(document.createElement('video'), { preload: 'metadata', muted: true, src: url });
  await once(video, 'loadedmetadata');
  return { url, facts: { duration: video.duration, width: video.videoWidth, height: video.videoHeight, bytes: file.size } };
}

/** Evenly spaced stills from the video, at most 1080 px wide, to pick the cover from. */
export async function videoFrames(url: string, count = 6): Promise<string[]> {
  const video = Object.assign(document.createElement('video'), { preload: 'auto', muted: true, playsInline: true, src: url });
  await once(video, 'loadeddata');
  const scale = Math.min(1, 1080 / video.videoWidth);
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(video.videoWidth * scale), height: Math.round(video.videoHeight * scale) });
  const context = canvas.getContext('2d');
  if (!context) return [];
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    // Skip the very first and last moments, which are often black or a fade.
    video.currentTime = Math.min(video.duration - 0.1, (video.duration * (i + 0.5)) / count);
    await once(video, 'seeked');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL('image/jpeg', 0.9));
  }
  return frames;
}
