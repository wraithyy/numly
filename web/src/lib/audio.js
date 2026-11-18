// Synthesised sound effects (WebAudio, no audio files).
// The AudioContext is created lazily because browsers block audio until a user gesture.

export function createSfx(isMuted) {
  let ac, noiseBuf;

  function ctx() {
    if (isMuted()) return null;
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        noiseBuf = ac.createBuffer(1, ac.sampleRate / 2, ac.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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
  const play = fn => () => { if (ctx()) fn(ac.currentTime); };

  return {
    key: play(t => noise(t, 0.03, 5000, 2, 0.07)),
    click: play(t => { noise(t, 0.05, 3200, 7, 0.6); tone(t, 2600, 1700, 0.07, 0.1, 'triangle'); }),
    thud: play(t => { noise(t, 0.2, 260, 1, 0.5, 'lowpass'); tone(t, 110, 55, 0.22, 0.35); }),
    chime: play(t => { tone(t, 880, 880, 0.3, 0.12, 'triangle'); tone(t + 0.11, 1320, 1320, 0.45, 0.12, 'triangle'); }),
    open: play(t => {
      tone(t, 95, 38, 0.55, 0.7);
      noise(t, 0.45, 420, 1, 0.7, 'lowpass');
      noise(t + 0.45, 1.1, 900, 18, 0.25); // hinge creak
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + 1 + i * 0.08, f, f, 0.6, 0.09, 'triangle'));
    }),
  };
}
