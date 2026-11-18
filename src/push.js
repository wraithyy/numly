// Web Push without a payload: the service worker shows a fixed, translated message, so only the
// VAPID signature (RFC 8292) is needed and no message encryption (RFC 8291).
const enc = new TextEncoder();

// The server only ever posts to real push services, never to an arbitrary URL a client sends.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/];
export const isPushEndpoint = url => {
  if (typeof url !== 'string' || url.length > 1024) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && PUSH_HOSTS.some(host => host.test(u.hostname));
  } catch {
    return false;
  }
};

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

/** The application server key a browser subscribes with: the uncompressed P-256 point. */
export const publicKeyOf = jwk => b64url(Uint8Array.from([4, ...unb64url(jwk.x), ...unb64url(jwk.y)]));

/** `Authorization: vapid t=<JWT>, k=<public key>` for one push service. */
export async function vapidAuth(endpoint, jwk, subject, now = Date.now()) {
  const part = obj => b64url(enc.encode(JSON.stringify(obj)));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject };
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part(claims)}`;
  const { kty, crv, x, y, d } = jwk;
  const key = await crypto.subtle.importKey('jwk', { kty, crv, x, y, d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto signs in the raw r||s form that JWS expects.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64url(sig)}, k=${publicKeyOf(jwk)}`;
}

/** Sends an empty push; returns the push service's status (404/410: the subscription is gone). */
export async function sendPush(endpoint, jwk, subject, fetchFn = fetch) {
  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: { TTL: String(24 * 3600), Urgency: 'normal', Authorization: await vapidAuth(endpoint, jwk, subject) },
  });
  return res.status;
}
