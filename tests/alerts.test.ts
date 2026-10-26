import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('missed alert is immediate, deduplicated, and reset when publication state changes',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'social-pulse-alert-'));
 const oldFile=process.env.DATA_FILE,oldBot=process.env.TELEGRAM_BOT_TOKEN,oldChat=process.env.TELEGRAM_CHAT_ID;
 process.env.DATA_FILE=join(directory,'data.sqlite');delete process.env.TELEGRAM_BOT_TOKEN;delete process.env.TELEGRAM_CHAT_ID;
 try{
  const { newPlan }=await import('../server/domain.js');
  const { savePlan,getAlerts,db }=await import('../server/store.js');
  const { checkAlerts }=await import('../server/alerts.js');
  await (await import('../server/db.js')).initDb();
  const now=new Date('2026-10-04T10:30:00.000Z');
  const plan=await savePlan(newPlan({platform:'facebook',title:'Alert fixture',scheduledAt:'2026-10-04T10:00:00.000Z'}));
  assert.equal(await checkAlerts(now),1);
  assert.equal(await checkAlerts(now),0);
  assert.equal((await getAlerts()).filter(a=>!a.dismissedAt).length,1);
  await savePlan({...plan,status:'published',externalId:'published-1',updatedAt:now.toISOString()});
  await checkAlerts(now);
  assert.equal((await getAlerts()).filter(a=>!a.dismissedAt).length,0);
  await savePlan({...plan,status:'scheduled',externalId:'',updatedAt:now.toISOString()});
  assert.equal(await checkAlerts(now),1);
  await db.close();
 }finally{
  if(oldFile===undefined)delete process.env.DATA_FILE;else process.env.DATA_FILE=oldFile;
  if(oldBot===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=oldBot;
  if(oldChat===undefined)delete process.env.TELEGRAM_CHAT_ID;else process.env.TELEGRAM_CHAT_ID=oldChat;
  rmSync(directory,{recursive:true,force:true});
 }
});
