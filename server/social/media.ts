import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { db, defineSchema } from '../db.js';
import { mediaDir } from '../paths.js';
import type { StoredContent } from '../workspace.js';
import type { Media, PublishInput, SocialProvider } from './types.js';

defineSchema(`CREATE TABLE IF NOT EXISTS social_media (id TEXT PRIMARY KEY,content_id TEXT NOT NULL,path TEXT NOT NULL,metadata_json TEXT NOT NULL,created_at TEXT NOT NULL);`);
export interface PreparedMedia extends Media { file:string; id:string }
/** Inspect MP4 box metadata on the server. Other video containers are refused. */
export function inspectMP4(b:Buffer) {
 let duration=0,width=0,height=0;
 function boxes(start:number,end:number) {
  for(let at=start;at+8<=end;) {
   let size=b.readUInt32BE(at),head=8;const type=b.toString('ascii',at+4,at+8);
   if(size===1){if(at+16>end)return;size=Number(b.readBigUInt64BE(at+8));head=16;}
   if(size===0)size=end-at;if(size<head||at+size>end)return;
   const p=at+head;
   if(type==='moov'||type==='trak'||type==='mdia')boxes(p,at+size);
   if(type==='mvhd'&&p+32<at+size) {const v=b[p],scale=b.readUInt32BE(p+(v===1?20:12));const ticks=v===1?Number(b.readBigUInt64BE(p+24)):b.readUInt32BE(p+16);if(scale)duration=ticks/scale;}
   if(type==='tkhd'&&size>=84) {width=Math.max(width,b.readUInt32BE(at+size-8)/65536);height=Math.max(height,b.readUInt32BE(at+size-4)/65536);}
   at+=size;
  }
 }
 if(b.length<16||b.toString('ascii',4,8)!=='ftyp')throw new Error('Only MP4 videos are supported.');boxes(0,b.length);
 if(!duration||!width||!height)throw new Error('Video duration and dimensions could not be verified. Use a standard MP4 export.');
 return {duration,width:Math.round(width),height:Math.round(height)};
}
export async function attachVideo(contentId:string,b:Buffer) {
 if(!b.length||b.length>200*1024*1024)throw new Error('Video must be between 1 byte and 200 MB.');
 const dimensions=inspectMP4(b);const id=randomUUID(),file=mediaDir('social',`${id}.mp4`);
 await mkdir(mediaDir('social'),{recursive:true});await writeFile(file,b,{flag:'wx'});
 const m:Media={url:`/api/social/assets/${id}`,type:'video',mimeType:'video/mp4',bytes:b.length,...dimensions};
 await db.run('INSERT INTO social_media(id,content_id,path,metadata_json,created_at) VALUES(?,?,?,?,?)',[id,contentId,file,JSON.stringify(m),new Date().toISOString()]);return {id,...m};
}
export async function contentMedia(contentId:string) {return (await db.all<{id:string;metadata_json:string}>('SELECT id,metadata_json FROM social_media WHERE content_id=?',[contentId])).map(r=>({id:r.id,...JSON.parse(r.metadata_json) as Media}));}
export async function resolveMedia(item:StoredContent,urls:string[]):Promise<PreparedMedia[]> {
 const result:PreparedMedia[]=[];
 for(const url of urls) {
  const asset=/^\/api\/social\/assets\/([0-9a-f-]{36})$/.exec(url);
  if(asset) {
   const row=await db.get<{path:string;metadata_json:string}>('SELECT path,metadata_json FROM social_media WHERE id=? AND content_id=?',[asset[1],item.id]);
   if(!row)throw new Error('Media must be attached to this content before approval.');
   result.push({...JSON.parse(row.metadata_json),file:row.path,id:asset[1]});continue;
  }
  const approved=[item.creative?.imageUrl,item.creative?.storyUrl,item.creative?.landscapeUrl].filter(Boolean);
  const match=/^\/api\/creatives\/([\w-]+)\/([\w.-]+)$/.exec(url);
  const other=/^\/api\/(studio|uploads)\/([0-9a-f-]{36}\.png)$/.exec(url);
  if(!approved.includes(url)||(!match&&!other)||match?.[2].includes('..'))throw new Error('Choose approved media attached to this content.');
  const original=await readFile(match?mediaDir('creatives',match[1],match[2]):mediaDir(other![1],other![2]));
  const {data,info}=await sharp(original).rotate().jpeg({quality:94}).toBuffer({resolveWithObject:true});
  const id=randomUUID(),file=mediaDir('social',`${id}.jpg`);await mkdir(mediaDir('social'),{recursive:true});await writeFile(file,data,{flag:'wx'});
  const m:Media={url:`/api/social/assets/${id}`,type:'image',mimeType:'image/jpeg',bytes:data.length,width:info.width,height:info.height};
  await db.run('INSERT INTO social_media(id,content_id,path,metadata_json,created_at) VALUES(?,?,?,?,?)',[id,item.id,file,JSON.stringify(m),new Date().toISOString()]);result.push({...m,file,id});
 }
 return result;
}
const signature=(id:string,exp:string)=>createHmac('sha256',Buffer.from(process.env.TOKEN_ENCRYPTION_KEY||'','base64')).update(`social-media:${id}:${exp}`).digest('base64url');
export function publicMediaUrl(id:string) {const exp=String(Date.now()+24*3600_000);return `${process.env.APP_URL}/api/social/media/${id}?expires=${exp}&signature=${signature(id,exp)}`;}
export function validMediaSignature(id:string,exp:string,sig:string) {return /^\d+$/.test(exp)&&Number(exp)>Date.now()&&Number(exp)<=Date.now()+24*3600_000&&signature(id,exp)===sig;}
export function validateMedia(provider:SocialProvider,input:PublishInput,media:Media[],caption:string) {
 if(input.kind==='text') {if(provider!=='facebook'||media.length||!caption.trim())throw new Error('Text publishing requires a Facebook caption and no media.');return;}
 if(!media.length||input.kind!=='carousel'&&media.length!==1)throw new Error('Select one media item, or use a carousel.');
 if(input.kind==='image'&&media.some(m=>m.type!=='image')||input.kind==='video'&&media.some(m=>m.type!=='video'))throw new Error('Media does not match the selected content type.');
 if(provider==='instagram'&&caption.length>2200)throw new Error('Instagram captions are limited to 2,200 characters.');
 if(input.kind==='carousel'&&(media.length<2||media.length>(provider==='tiktok'?35:20)))throw new Error('Invalid carousel length.');
 for(const m of media) {
  if(!m.bytes||!m.width||!m.height)throw new Error('Media size and dimensions must be verified.');
  if(m.type==='image'&&(m.bytes>8*1024*1024||m.mimeType!=='image/jpeg'))throw new Error('Images must be JPEG and at most 8 MB.');
  if(provider==='instagram'&&m.type==='image'&&(m.width<320||m.width>1440||m.width/m.height<0.8||m.width/m.height>1.91))throw new Error('Instagram images need width 320–1440 and aspect ratio 4:5–1.91:1.');
  if(m.type==='video'&&(!m.duration||m.duration<=0||m.mimeType!=='video/mp4'))throw new Error('Use a verified MP4 video.');
  if(provider==='tiktok'&&((m.duration||0)>600||Math.min(m.width,m.height)<360))throw new Error('TikTok media exceeds the supported limits.');
  if(provider==='instagram'&&m.type==='video'&&((m.duration||0)>900||(m.duration||0)<3))throw new Error('Instagram video duration must be 3–900 seconds.');
  if(provider==='snapchat'&&(m.width<540||m.height<960||m.type==='video'&&((m.duration||0)<5||(m.duration||0)>60)))throw new Error('Snapchat requires at least 540×960; video duration 5–60 seconds.');
 }
 if(provider==='youtube'&&(!input.privacy||!['private','unlisted','public'].includes(input.privacy)||!input.categoryId||typeof input.madeForKids!=='boolean'))throw new Error('Choose YouTube privacy, category and audience.');
}
