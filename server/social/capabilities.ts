import type { Availability, Capability, SocialAccount, SocialProvider } from './types.js';
const google='https://www.googleapis.com/auth/';
export const capabilityScopes:Record<SocialProvider,Partial<Record<Capability,string[]>>>={
 facebook:{read_posts:['pages_read_engagement'],read_metrics:['read_insights'],publish_text:['pages_manage_posts'],publish_image:['pages_manage_posts'],publish_video:['pages_manage_posts','publish_video']},
 instagram:{read_posts:['instagram_basic'],read_metrics:['instagram_manage_insights'],publish_image:['instagram_content_publish'],publish_video:['instagram_content_publish'],publish_carousel:['instagram_content_publish']},
 tiktok:{read_posts:['video.list'],read_metrics:['video.list'],publish_video:['video.publish'],publish_image:['video.publish'],publish_carousel:['video.publish'],upload_draft:['video.upload']},
 snapchat:{read_posts:['snapchat-profile-api'],read_metrics:['snapchat-profile-api'],publish_image:['snapchat-profile-api'],publish_video:['snapchat-profile-api']},
 youtube:{read_posts:[google+'youtube.readonly'],read_metrics:[google+'youtube.readonly'],read_analytics:[google+'yt-analytics.readonly'],publish_video:[google+'youtube.upload']},
};
export function capabilities(provider:SocialProvider,account?:SocialAccount):Record<Capability,Availability> {
 const ids:Capability[]=['read_posts','read_metrics','read_analytics','publish_text','publish_image','publish_video','publish_carousel','upload_draft'];
 return Object.fromEntries(ids.map(id=>{
  const scopes=capabilityScopes[provider][id];
  if(!scopes)return [id,'unsupported'];
  if(!account)return [id,'unconfigured'];
  if(account.status!=='connected'||!account.verifiedAt)return [id,'authorization_required'];
  if(!scopes.every(scope=>account.scopes.includes(scope)))return [id,'authorization_required'];
  if(id.startsWith('publish')&&provider==='tiktok'&&process.env.TIKTOK_DIRECT_POST_APPROVED!=='true'&&process.env.TIKTOK_SANDBOX_POSTING!=='true')return [id,'approval_required'];
  return [id,'available'];
 })) as Record<Capability,Availability>;
}
export const requiredCapability=(kind:'text'|'image'|'video'|'carousel',mode:'direct'|'draft'):Capability=>mode==='draft'?'upload_draft':`publish_${kind}`;
