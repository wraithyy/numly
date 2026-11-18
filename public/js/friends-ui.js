// Friends dialog: nickname, mutual friend requests (via a personal ?f= link) and live results,
// all over one WebSocket with automatic reconnects. The server is the source of truth.
import { cleanName, isPub, publicId } from './friends.js';
import { load, store } from './storage.js';

const byId = id => document.getElementById(id);
const MAX_BACKOFF_MS = 15000;
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text });

/**
 * @param {object} deps
 * @param {() => Function} deps.t         current translator (changes with the language)
 * @param {string} deps.player            this browser's secret player id
 * @param {() => void} deps.onKey         feedback sound for taps
 * @param {() => boolean} deps.padUsed    whether today's notepad was used
 */
export function createFriends({ t, player, onKey, padUsed }) {
  // Someone's friend link: remember it until we have a nickname and a connection, then send the request.
  const params = new URLSearchParams(location.search);
  if (isPub(params.get('f'))) store('numly-invite', { pub: params.get('f'), name: cleanName(params.get('n') || '') });
  if (params.has('f')) history.replaceState(null, '', location.pathname);

  let name = cleanName(load('numly-name', ''));
  let editing = false;
  let state = { rows: [], incoming: [], outgoing: [] };
  let myPub = null;
  let ws = null;
  let backoff = 1000;
  let retry = null;
  let status = 'off';
  let notice = null;

  const send = msg => {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  };

  function sendPendingInvite() {
    const invite = load('numly-invite', null);
    if (!invite || !name || !myPub) return;
    if (invite.pub === myPub) {
      notice = { key: 'ownLink' };
      store('numly-invite', null);
    } else if (send({ type: 'request', to: invite.pub })) {
      store('numly-invite', null);
    }
  }

  // ------------------------------------------------------------ connection

  function connect() {
    disconnect();
    if (!name) return render();
    setStatus('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${proto}://${location.host}/api/friends`);
    ws = socket;
    socket.onopen = () => {
      backoff = 1000;
      setStatus('on');
      send({ type: 'hello', player, name, pad: padUsed() });
      sendPendingInvite();
    };
    socket.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') {
        const before = new Map(state.rows.map(p => [p.pub, p]));
        // A request we sent was just accepted: they moved from "waiting" to our friends.
        const accepted = state.outgoing.find(o => msg.rows.some(r => r.pub === o.pub));
        if (accepted) notice = { key: 'becameFriends', vars: { name: accepted.name || '?' }, ok: true };
        state = msg;
        render(before);
      } else if (msg.type === 'ack') {
        const key = { sent: 'requestSent', accepted: 'becameFriends', friends: 'becameFriends', self: 'ownLink' }[msg.result] ?? 'requestFailed';
        notice = { key, vars: { name: msg.name || '?' }, ok: msg.result !== 'self' && key !== 'requestFailed' };
        render();
      }
    };
    socket.onclose = () => {
      if (ws !== socket) return; // replaced or closed on purpose
      ws = null;
      setStatus('off');
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

  function setStatus(next) {
    status = next;
    const live = byId('live');
    live.hidden = !name;
    live.className = `live ${next}`;
    live.textContent = t()({ on: 'live', connecting: 'connecting', off: 'offlineTag' }[next]);
  }

  addEventListener('online', () => { if (!ws) connect(); });
  addEventListener('offline', () => setStatus('off'));
  // Phones suspend background tabs; reconnect as soon as the game is visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !ws && navigator.onLine) connect();
  });

  // ------------------------------------------------------------ rendering (DOM nodes only: names come from others)

  function render(before = null) {
    const tr = t();
    const ready = Boolean(name) && !editing;
    byId('nameForm').hidden = ready;
    byId('nameBtn').textContent = tr(editing ? 'saveName' : 'proceed');
    if (!byId('nameInput').value) byId('nameInput').value = name;
    byId('friendsBody').hidden = !ready;
    setStatus(status);

    const note = byId('friendsNote');
    note.textContent = notice ? tr(notice.key, notice.vars) : tr(ready ? 'friendsIntro' : 'nameIntro');
    note.classList.toggle('ok', Boolean(notice?.ok));

    const badge = byId('friendsBadge');
    badge.hidden = !state.incoming.length;
    badge.textContent = String(state.incoming.length);
    if (!ready) return;

    renderRequests(byId('incoming'), state.incoming, true);
    byId('incomingBox').hidden = !state.incoming.length;
    renderRequests(byId('outgoing'), state.outgoing, false);
    byId('outgoingBox').hidden = !state.outgoing.length;
    renderRanks(before);
  }

  function renderRequests(list, people, incoming) {
    const tr = t();
    list.replaceChildren(
      ...people.map(p => {
        const li = el('li', `req${incoming ? ' in' : ''}`, '');
        li.append(el('span', 'who', p.name || '?'));
        const action = (label, cls, msg) => {
          const b = el('button', `btn sm ${cls}`, tr(label));
          b.type = 'button';
          b.onclick = () => { onKey(); send(msg); };
          return b;
        };
        if (incoming) {
          li.append(action('accept', 'gold', { type: 'accept', from: p.pub }), action('reject', '', { type: 'reject', from: p.pub }));
        } else {
          li.append(action('cancel', '', { type: 'cancel', to: p.pub }));
        }
        return li;
      }),
    );
  }

  function renderRanks(before) {
    const tr = t();
    const list = byId('friendRanks');
    list.replaceChildren();
    state.rows.forEach((p, i) => {
      const prev = before?.get(p.pub);
      const changed = before?.size && (!prev || prev.tries !== p.tries || prev.solved !== p.solved);
      const isMe = p.pub === myPub;
      const li = el('li', '', '');
      li.className = ['rank', 'has-x', p.solved && 'solved', isMe && 'me', changed && 'flash'].filter(Boolean).join(' ');

      const who = el('span', 'who', p.name || '?');
      if (isMe) who.append(el('small', '', tr('you')));
      const what = el('span', 'what', p.solved ? tr('solved', { n: p.tries }) : p.tries ? tr('playing', { n: p.tries }) : tr('idle'));
      if (p.pad) what.append(el('span', 'tag', tr('padMark')));

      const x = el('button', 'x', isMe ? '' : '×');
      x.type = 'button';
      x.hidden = isMe;
      x.setAttribute('aria-label', tr('remove', { name: p.name }));
      x.onclick = () => send({ type: 'unfriend', pub: p.pub });

      li.append(el('span', 'pos', p.solved ? String(i + 1) : '–'), who, what, x);
      list.append(li);
    });
    if (state.rows.length < 2) list.append(el('li', 'empty', tr('noFriends')));
  }

  // ------------------------------------------------------------ controls

  byId('nameForm').onsubmit = e => {
    e.preventDefault();
    const next = cleanName(byId('nameInput').value);
    if (!next) {
      byId('nameInput').focus();
      return;
    }
    name = next;
    store('numly-name', name);
    editing = false;
    onKey();
    if (send({ type: 'hello', player, name, pad: padUsed() })) {
      sendPendingInvite();
      render();
    } else {
      connect();
    }
  };

  byId('renameBtn').onclick = () => {
    editing = true;
    notice = null;
    byId('nameInput').value = name;
    render();
    byId('nameInput').focus();
  };

  byId('friendLinkBtn').onclick = async () => {
    const url = `${location.origin}/?f=${myPub}&n=${encodeURIComponent(name)}`;
    const text = t()('friendLinkText');
    try {
      if (navigator.share) await navigator.share({ title: 'Numly', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        byId('friendLinkBtn').textContent = t()('inviteCopied');
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Share failed:', err);
    }
  };

  byId('friendsBtn').onclick = () => {
    notice = null;
    render();
    byId('friends').showModal();
  };

  publicId(player).then(pub => {
    myPub = pub;
    sendPendingInvite();
    render();
    // Arriving through a friend link: show what happens with it right away.
    if (load('numly-invite', null) || notice) byId('friends').showModal();
  });
  connect();

  return {
    render,
    /** Fields the guess request needs so the server counts the try. */
    guessInfo: () => ({ player, name: name || undefined }),
    /** Notepad was just switched on; tell friends now (a closed socket reports it with the next hello). */
    markPad: () => send({ type: 'pad' }),
  };
}
