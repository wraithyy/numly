// Friends: nickname, mutual friend requests (via a personal ?f= link) and live results,
// all over one WebSocket with automatic reconnects. The server is the source of truth.
import { cleanName, isPub, publicId } from '../../../shared/friends.js';
import { load, store } from './storage.js';
import { player, sfx } from './app.svelte.js';

const MAX_BACKOFF_MS = 15000;

// Someone's friend link: remember it until we have a nickname and a connection, then send the request.
const params = new URLSearchParams(location.search);
if (isPub(params.get('f'))) store('numly-invite', { pub: params.get('f'), name: cleanName(params.get('n') || '') });
if (params.has('f')) history.replaceState(null, '', location.pathname);

export const friends = $state({
  name: cleanName(load('numly-name', '')),
  myPub: null,
  rows: [],
  incoming: [],
  outgoing: [],
  changed: new Set(), // pubs whose result changed with the last update (flash animation)
  week: null, // this week's friends board { week, mods, rows }
  rev: 0, // bumps on every update so the list re-renders and the flash replays
  status: 'off', // on | connecting | off
  notice: null, // { key, vars, ok }
  open: false, // the dialog should open (friend link arrived)
});

let padUsed = () => false;
let ws = null;
let backoff = 1000;
let retry = null;

function send(msg) {
  if (ws?.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
}

function sendPendingInvite() {
  const invite = load('numly-invite', null);
  if (!invite || !friends.name || !friends.myPub) return;
  if (invite.pub === friends.myPub) {
    friends.notice = { key: 'ownLink' };
    store('numly-invite', null);
  } else if (send({ type: 'request', to: invite.pub })) {
    store('numly-invite', null);
  }
}

function onState(msg) {
  const before = new Map(friends.rows.map(p => [p.pub, p]));
  // A request we sent was just accepted: they moved from "waiting" to our friends.
  const accepted = friends.outgoing.find(o => msg.rows.some(r => r.pub === o.pub));
  if (accepted) friends.notice = { key: 'becameFriends', vars: { name: accepted.name || '?' }, ok: true };
  friends.changed = new Set(
    before.size
      ? msg.rows.filter(p => { const prev = before.get(p.pub); return !prev || prev.tries !== p.tries || prev.solved !== p.solved; }).map(p => p.pub)
      : [],
  );
  friends.rows = msg.rows;
  friends.rev++;
  friends.incoming = msg.incoming;
  friends.outgoing = msg.outgoing;
  friends.week = msg.week ?? null;
}

function onAck(msg) {
  const key = { sent: 'requestSent', accepted: 'becameFriends', friends: 'becameFriends', self: 'ownLink' }[msg.result] ?? 'requestFailed';
  friends.notice = { key, vars: { name: msg.name || '?' }, ok: msg.result !== 'self' && key !== 'requestFailed' };
}

function connect() {
  disconnect();
  if (!friends.name) return;
  friends.status = 'connecting';
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${proto}://${location.host}/api/friends`);
  ws = socket;
  socket.onopen = () => {
    backoff = 1000;
    friends.status = 'on';
    send({ type: 'hello', player, name: friends.name, pad: padUsed() });
    sendPendingInvite();
  };
  socket.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') onState(msg);
    else if (msg.type === 'ack') onAck(msg);
  };
  socket.onclose = () => {
    if (ws !== socket) return; // replaced or closed on purpose
    ws = null;
    friends.status = 'off';
    if (navigator.onLine) scheduleRetry();
  };
}

function disconnect() {
  clearTimeout(retry);
  if (ws) {
    const old = ws;
    ws = null;
    old.close();
  }
}

function scheduleRetry() {
  clearTimeout(retry);
  retry = setTimeout(connect, backoff);
  backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
}

/** Starts the connection. `deps.padUsed` reports whether today's notepad was used. */
export function startFriends(deps) {
  padUsed = deps.padUsed;
  addEventListener('online', () => { if (!ws) connect(); });
  addEventListener('offline', () => (friends.status = 'off'));
  // Phones suspend background tabs; reconnect as soon as the game is visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !ws && navigator.onLine) connect();
  });
  publicId(player).then(pub => {
    friends.myPub = pub;
    sendPendingInvite();
    // Arriving through a friend link: show what happens with it right away.
    if (load('numly-invite', null) || friends.notice) friends.open = true;
  });
  connect();
}

export function setName(raw) {
  const next = cleanName(raw);
  if (!next) return false;
  friends.name = next;
  store('numly-name', next);
  sfx.key();
  if (send({ type: 'hello', player, name: next, pad: padUsed() })) sendPendingInvite();
  else connect();
  return true;
}

export const accept = pub => { sfx.key(); send({ type: 'accept', from: pub }); };
export const reject = pub => { sfx.key(); send({ type: 'reject', from: pub }); };
export const cancel = pub => { sfx.key(); send({ type: 'cancel', to: pub }); };
export const unfriend = pub => send({ type: 'unfriend', pub });

/** Fields the guess request needs so the server counts the try. */
export const guessInfo = () => ({ player, name: friends.name || undefined });
/** Notepad was just switched on; tell friends now (a closed socket reports it with the next hello). */
export const markPad = () => send({ type: 'pad' });

export const friendLink = () => `${location.origin}/?f=${friends.myPub}&n=${encodeURIComponent(friends.name)}`;
