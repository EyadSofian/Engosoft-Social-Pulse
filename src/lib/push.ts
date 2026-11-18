/**
 * Phone notifications in the browser. On iPhone, Safari only allows them for the app added to the home screen
 * (iOS 16.4 or newer); Android and desktop browsers allow them in a normal tab too.
 */
import { api } from './api';

export type PushTopic = 'work' | 'daily' | 'best' | 'alerts' | 'tips' | 'ideas';
export type PushPrefs = Record<PushTopic, boolean>;

/** What the person can do now on this device. */
export type PushState =
  | 'unsupported' // old browser or old iOS
  | 'install-first' // iPhone/iPad in Safari: add to the home screen, then open from there
  | 'denied' // blocked in the phone's settings
  | 'off' // can be turned on with one tap
  | 'on'; // this device receives them

export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let registration: Promise<ServiceWorkerRegistration | null> | null = null;
/** Registers the worker once; it only handles notifications, nothing is cached. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  registration ??= navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
  return registration;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? 'install-first' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registerServiceWorker();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

const keyBytes = (base64url: string) => {
  const raw = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Asks for permission (must follow a tap) and registers this device with the server. */
export async function turnOnPush(): Promise<PushState> {
  if (!supported()) return pushState();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registerServiceWorker();
  if (!reg) throw new Error('تعذّر تشغيل خدمة الإشعارات على الجهاز ده.');
  await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>('/api/push/key');
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another server key cannot receive our messages.
  const current = sub?.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
  const wanted = keyBytes(publicKey);
  if (sub && current && (current.length !== wanted.length || current.some((b, i) => b !== wanted[i]))) { await sub.unsubscribe(); sub = null; }
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
  } catch {
    throw new Error(isIos() ? 'الآيفون رفض الاشتراك. اتأكد إنك فاتح «مبدع» من الشاشة الرئيسية، وجرّب تاني.' : 'المتصفح رفض الاشتراك في الإشعارات. جرّب من Chrome أو Safari، أو من التطبيق اللي على الشاشة الرئيسية.');
  }
  await api('/api/push/subscribe', { body: { subscription: sub.toJSON() } });
  return 'on';
}

export async function turnOffPush(): Promise<PushState> {
  const reg = await registerServiceWorker();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('/api/push/unsubscribe', { body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
  return pushState();
}

/** Keeps the server's copy in step after sign-in on a device that already allowed notifications. */
export async function resyncPush() {
  try {
    if (!supported() || Notification.permission !== 'granted') return;
    const reg = await registerServiceWorker();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await api('/api/push/subscribe', { body: { subscription: sub.toJSON() } });
  } catch { /* offline: next start */ }
}

export const getPushStatus = () => api<{ prefs: PushPrefs; devices: { endpoint: string; device: string; createdAt: string; lastOkAt: string | null }[] }>('/api/push/status');
export const savePushPrefs = (prefs: PushPrefs) => api<{ prefs: PushPrefs }>('/api/push/prefs', { method: 'PUT', body: prefs });
export const sendTestPush = () => api<{ sent: number }>('/api/push/test', { body: {} });
