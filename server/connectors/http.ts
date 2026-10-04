export const numberOrNull=(value:unknown):number|null=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
export const text=(value:unknown):string=>typeof value==='string'?value:'';
export async function json<T=Record<string,unknown>>(url:string, init:RequestInit={}):Promise<T> {
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(15_000)});
  const body=await response.json().catch(()=>({})) as Record<string,unknown>;
  if (!response.ok || body.error && typeof body.error==='object' && 'code' in body.error && (body.error as {code:unknown}).code!=='ok') {
    const code=body.error && typeof body.error==='object' ? String((body.error as Record<string,unknown>).code||'') : '';
    throw new Error(`Provider request failed (${response.status}${code?`, code ${code}`:''}).`);
  }
  return body as T;
}
export function bearer(token:string):HeadersInit {return {Authorization:`Bearer ${token}`};}
