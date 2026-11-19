// Sound effects through WebAudio: CC0 samples from Kenney.nl (kenney.nl, public domain) for play and the safe
// opening, with short synthesised stand-ins until a sample has decoded (and for plain UI buttons). The AudioContext is created lazily because browsers block audio until a user gesture.
import tickUrl from '../assets/sfx/tick.mp3';
import lockUrl from '../assets/sfx/lock.mp3';
import ledUrl from '../assets/sfx/led.mp3';
import rumbleUrl from '../assets/sfx/rumble.mp3';
import boltUrl from '../assets/sfx/bolt.mp3';
import doorUrl from '../assets/sfx/door.mp3';
import slamUrl from '../assets/sfx/slam.mp3';
import coinsUrl from '../assets/sfx/coins.mp3';
import fanfareUrl from '../assets/sfx/fanfare.mp3';
import typeUrl from '../assets/sfx/type.mp3';
import rollUrl from '../assets/sfx/roll.mp3';
import padUrl from '../assets/sfx/pad.mp3';
import toggleUrl from '../assets/sfx/toggle.mp3';
import missUrl from '../assets/sfx/miss.mp3';
import errorUrl from '../assets/sfx/error.mp3';
import recordUrl from '../assets/sfx/record.mp3';

const SAMPLES = { tick: tickUrl, lock: lockUrl, led: ledUrl, rumble: rumbleUrl, bolt: boltUrl, door: doorUrl, slam: slamUrl, coins: coinsUrl, fanfare: fanfareUrl,
  type: typeUrl, roll: rollUrl, pad: padUrl, toggle: toggleUrl, miss: missUrl, error: errorUrl, record: recordUrl };
const semitones = n => 2 ** (n / 12);

export function createSfx(isMuted) {
  let ac, noiseBuf;
  const bufs = {};

  // Decoded once the context exists; a sample that is not ready yet is simply skipped.
  function loadSamples() {
    for (const [name, url] of Object.entries(SAMPLES)) {
      fetch(url)
        .then(r => r.arrayBuffer())
        .then(b => ac.decodeAudioData(b))
        .then(buf => { bufs[name] = buf; })
        .catch(err => console.warn('Sound failed to load:', name, err));
    }
  }

  /** `loopFor` loops the sample for that many seconds while it swells: the rumble. */
  function sample(name, { delay = 0, rate = 1, gain = 1, loopFor = 0 } = {}) {
    const buf = bufs[name];
    if (!buf) return false;
    const at = ac.currentTime + delay;
    const src = ac.createBufferSource();
    const g = ac.createGain();
    src.buffer = buf;
    src.playbackRate.value = rate;
    if (loopFor) {
      src.loop = true;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + loopFor * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, at + loopFor + 0.15);
      src.start(at);
      src.stop(at + loopFor + 0.2);
    } else {
      g.gain.value = gain;
      src.start(at);
    }
    src.connect(g).connect(ac.destination);
    return true;
  }

  function ctx() {
    if (isMuted()) return null;
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        noiseBuf = ac.createBuffer(1, ac.sampleRate / 2, ac.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        loadSamples();
      } catch {
        return null;
      }
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function envelope(node, at, gain, dur) {
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    node.connect(g).connect(ac.destination);
  }

  function noise(at, dur, freq, q, gain, type = 'bandpass') {
    const src = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    src.buffer = noiseBuf;
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    src.connect(filter);
    envelope(filter, at, gain, dur);
    src.start(at);
    src.stop(at + dur);
  }

  function tone(at, from, to, dur, gain, type = 'sine') {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + dur);
    envelope(osc, at, gain, dur);
    osc.start(at);
    osc.stop(at + dur);
  }

  // Each effect is a no-op while muted or when WebAudio is unavailable.
  const play = fn => (...args) => { if (ctx()) fn(ac.currentTime, ...args); };

  return {
    key: play(t => noise(t, 0.03, 5000, 2, 0.07)),
    click: play(t => { if (!sample('led', { gain: 0.7 })) { noise(t, 0.05, 3200, 7, 0.6); tone(t, 2600, 1700, 0.07, 0.1, 'triangle'); } }),
    // play: the sample once decoded, the synthesised sound until then
    type: play(t => { if (!sample('type', { gain: 0.6 })) noise(t, 0.03, 5000, 2, 0.07); }),
    roll: play(t => { if (!sample('roll', { gain: 0.6 })) noise(t, 0.03, 5000, 2, 0.07); }),
    pad: play(t => { if (!sample('pad', { gain: 0.7 })) noise(t, 0.03, 5000, 2, 0.07); }),
    toggle: play(t => { if (!sample('toggle', { gain: 0.7 })) noise(t, 0.03, 5000, 2, 0.07); }),
    miss: play(t => { if (!sample('miss')) { noise(t, 0.2, 260, 1, 0.5, 'lowpass'); tone(t, 110, 55, 0.22, 0.35); } }),
    error: play(t => { if (!sample('error', { gain: 0.8 })) { noise(t, 0.2, 260, 1, 0.5, 'lowpass'); tone(t, 110, 55, 0.22, 0.35); } }),
    record: play(t => { if (!sample('record', { gain: 0.8 })) { tone(t, 880, 880, 0.3, 0.12, 'triangle'); tone(t + 0.11, 1320, 1320, 0.45, 0.12, 'triangle'); } }),
    // the wheel's 1.1 s turn: a ratchet that slows as it settles
    wheel: play(() => { for (let x = 0; x < 1.1; x += 0.04 + x * 0.06) sample('tick', { delay: x, gain: 0.45 }); }),
    // the safe opening
    tick: play(() => sample('tick', { gain: 0.5 })),
    lock: play((_, i) => sample('lock', { rate: semitones(i * 2), gain: 0.8 })), // each reel a whole tone higher
    rumble: play((_, ms, amp) => sample('rumble', { loopFor: ms / 1000, gain: Math.min(1, 0.15 * amp), rate: 0.9 })),
    bolt: play((_, i) => sample('bolt', { delay: i * 0.05, gain: 0.7 })),
    door: play(() => sample('door', { gain: 0.8 })),
    slam: play(() => sample('slam')),
    coins: play(() => sample('coins', { gain: 0.8 })),
    fanfare: play((_, rank) => sample('fanfare', { rate: semitones((3 - rank) * 2), gain: 0.7 })), // richer, higher
  };
}
