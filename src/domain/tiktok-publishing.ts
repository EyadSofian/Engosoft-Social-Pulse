/** TikTok photo titles are separate from the full, approved caption. */
export const tiktokPhotoTitle = (title: string) => title.replace(/https?:\/\/\S+|#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 90).trim();
