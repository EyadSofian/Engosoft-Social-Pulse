export type SocialProvider = 'facebook' | 'instagram' | 'tiktok' | 'snapchat' | 'youtube';
export type Capability = 'read_posts' | 'read_metrics' | 'read_analytics' | 'publish_text' | 'publish_image' | 'publish_video' | 'publish_carousel' | 'upload_draft';
export type Availability = 'available' | 'authorization_required' | 'approval_required' | 'unconfigured' | 'unsupported';
export interface SocialAccount {
 id: string; provider: SocialProvider; externalId: string; name: string; ownerId: string;
 scopes: string[]; metadata: Record<string, unknown>; credentialSource: string;
 status: 'connected' | 'authorization_required' | 'disconnected' | 'sync_failed';
 verifiedAt: string | null; lastSyncAt: string | null; error: string | null;
}
export interface Credential { accessToken: string; refreshToken?: string; expiresAt: number; scopes: string[] }
export interface Media { url: string; type: 'image' | 'video'; mimeType: string; bytes: number; width: number; height: number; duration?: number }
export interface PublishInput {
 contentId: string; accountId: string; kind: 'text' | 'image' | 'video' | 'carousel'; media: Media[];
 mode: 'direct' | 'draft'; privacy?: string; categoryId?: string; tags?: string[]; madeForKids?: boolean;
 disableComment?: boolean; disableDuet?: boolean; disableStitch?: boolean; brandContent?: boolean; brandOrganic?: boolean;
 retry?: boolean; snapTarget?: 'story' | 'spotlight'; locale?: string; consent: true;
 bufferDefaultsConsent?: boolean; isAiGenerated?: boolean;
}
export interface PublishResult { state: 'processing' | 'awaiting_user' | 'published' | 'failed' | 'unknown'; remoteId?: string; externalId?: string; url?: string; error?: string; errorCode?: string; retryable?: boolean; retryAfter?: number; phase?: string }
export interface PublishJob extends PublishResult { id: string; contentId: string; accountId: string; provider: SocialProvider; actorId: string; attempt?: number; createdAt: string; updatedAt: string }
