export class ProviderError extends Error {
 constructor(public status:number,public code:string,public retryable=false,public retryAfter=0) { super(`Provider request failed (HTTP ${status}, ${code.replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,80)}).`); }
}
export async function request<T=Record<string,any>>(url:string, init:RequestInit={}, read=false):Promise<T> {
 for(let attempt=0;;attempt++) {
  let response:Response;
  try { response=await fetch(url,{...init,signal:AbortSignal.timeout(30_000),redirect:'error'}); }
  catch { if(read && attempt<2) { await new Promise(r=>setTimeout(r,300*2**attempt));continue; } throw new ProviderError(0,'transport_error',read); }
  const body=await response.json().catch(()=>({})) as Record<string,any>;
  const raw=body.error, code=String(raw?.code || raw?.errors?.[0]?.reason || body.error_code || (typeof raw==='string'?raw:'') || 'request_failed');
  const failed=!response.ok || (raw && code!=='ok') || body.request_status==='ERROR';
  if(!failed)return body as T;
  const retryable=response.status===429 || response.status>=500 || ['4','17','32','613','rate_limit_exceeded'].includes(code);
  const retryAfter=Math.min(60,Math.max(0,Number(response.headers.get('retry-after'))||0));
  if(read && retryable && attempt<2 && retryAfter<=2) { await new Promise(r=>setTimeout(r,Math.max(retryAfter*1000,300*2**attempt)));continue; }
  throw new ProviderError(response.status,code,retryable,retryAfter);
 }
}
export const headers = (token:string) => ({Authorization:`Bearer ${token}`});
export const postJSON = <T=Record<string,any>>(url:string,token:string,body:unknown) => request<T>(url,{method:'POST',headers:{...headers(token),'Content-Type':'application/json'},body:JSON.stringify(body)});
