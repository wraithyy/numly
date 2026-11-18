// Monday reminders for the weekly game. Needs the service worker (production builds only) and,
// on iOS, the installed app. The language lives in a cache the service worker can read.
import { ui } from './app.svelte.js';

export const push = $state({ ready: false, on: false, denied: false, busy: false });

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const registration = () => navigator.serviceWorker.getRegistration();
const api = body => fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function saveLang(lang) {
  if (!('caches' in window)) return;
  try {
    await (await caches.open('numly-prefs')).put('/lang', new Response(lang));
  } catch (err) {
    console.error('Saving the language for reminders failed:', err);
  }
}

let serverKey = null;

export async function initPush() {
  if (!supported() || !(await registration())) return;
  try {
    const res = await fetch('/api/push');
    if (!res.ok) return; // reminders not configured on this server
    serverKey = (await res.json()).key;
  } catch {
    return; // offline: no toggle until the next visit
  }
  const sub = await (await registration()).pushManager.getSubscription();
  Object.assign(push, { ready: true, on: Boolean(sub), denied: Notification.permission === 'denied' });
}

// While reminders are on, the service worker follows every language switch.
$effect.root(() => {
  $effect(() => {
    if (push.on) saveLang(ui.lang);
  });
});

export async function togglePush() {
  if (push.busy) return;
  push.busy = true;
  try {
    const reg = await registration();
    const current = await reg.pushManager.getSubscription();
    if (current) {
      await api({ action: 'unsubscribe', endpoint: current.endpoint });
      await current.unsubscribe();
      push.on = false;
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      push.denied = Notification.permission === 'denied';
      return;
    }
    const applicationServerKey = Uint8Array.from(atob(serverKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    const res = await api({ action: 'subscribe', endpoint: sub.endpoint });
    if (!res.ok) {
      await sub.unsubscribe();
      throw new Error(`subscribe failed: HTTP ${res.status}`);
    }
    push.on = true;
  } catch (err) {
    console.error('Reminder toggle failed:', err);
  } finally {
    push.busy = false;
  }
}
