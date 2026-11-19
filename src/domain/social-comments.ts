export const commentModes = ['manual', 'assist', 'automatic'] as const;
export type CommentMode = (typeof commentModes)[number];
export type CommentPlatform = 'facebook' | 'instagram';
export const isCommentPlatform = (value: string): value is CommentPlatform => value === 'facebook' || value === 'instagram';

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
