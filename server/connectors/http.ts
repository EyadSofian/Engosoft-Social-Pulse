export const numberOrNull=(value:unknown):number|null=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
export const text=(value:unknown):string=>typeof value==='string'?value:'';
export { request as json } from '../social/http.js';
export function bearer(token:string):HeadersInit {return {Authorization:`Bearer ${token}`};}
