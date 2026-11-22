export const commentModes = ['manual', 'assist', 'automatic'] as const;
export type CommentMode = (typeof commentModes)[number];
export const commentPlatforms = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube'] as const;
export type CommentPlatform = (typeof commentPlatforms)[number];
export type MetaCommentPlatform = 'facebook' | 'instagram';
export const isCommentPlatform = (value: string): value is CommentPlatform => (commentPlatforms as readonly string[]).includes(value);
export const isMetaCommentPlatform = (value: string): value is MetaCommentPlatform => value === 'facebook' || value === 'instagram';
/** Platforms whose comment permission is granted through this app's own OAuth consent. */
export const hasCommentOAuth = (value: string) => isMetaCommentPlatform(value) || value === 'youtube';
/** How an account becomes ready for comments: a Meta grant, a YouTube consent, or a Zernio connection with the Inbox add-on. */
export type CommentSetup = 'meta' | 'youtube' | 'zernio_linkedin' | 'zernio_tiktok';

export interface CommentFaq {
  question: string;
  answer: string;
}

export interface CommentPolicy {
  mode: CommentMode;
  faqs: CommentFaq[];
}

export interface CommentSettings {
  policy: CommentPolicy | null;
  accountPolicy: CommentPolicy;
  canManage: boolean;
  canReply: boolean;
  authorized: boolean;
  aiReady: boolean;
  webhookConfigured: boolean;
  setup: CommentSetup;
}

export interface PublicSocialComment {
  id: string;
  reference: string;
  text: string;
  author: string;
  createdAt: string;
  own: boolean;
  canReply: boolean;
  replyCount: number | null;
  review: boolean;
  delivery: { state: 'sending' | 'sent' | 'uncertain' | 'failed'; message: string; remoteId: string | null; automatic: boolean } | null;
}

export interface CommentPage {
  comments: PublicSocialComment[];
  next: string | null;
}
