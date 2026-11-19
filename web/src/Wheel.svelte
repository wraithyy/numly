<script>
  // The submit control: a brass combination dial. The dial turns by `angle`; `misses` counts
  // guesses with no hit, and each new one makes the dial catch and judder at the end of its turn.
  let { angle, misses = 0, disabled = false, label } = $props();

  let svg;
  let seen = misses;
  $effect(() => {
    if (misses === seen) return;
    seen = misses;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    svg.animate(
      [{ transform: 'rotate(0)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(-2deg)' }, { transform: 'rotate(0)' }],
      { duration: 260, delay: 380, easing: 'ease-out' },
    );
  });

  const TICKS = Array.from({ length: 60 }, (_, i) => i * 6);
</script>

<button class="wheel" type="submit" aria-label={label} {disabled}>
  <svg viewBox="0 0 96 96" aria-hidden="true" bind:this={svg}>
    <defs>
      <linearGradient id="wheel-bezel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f6dd92" /><stop offset=".35" stop-color="#c9983a" /><stop offset=".7" stop-color="#6e4f16" /><stop offset="1" stop-color="#d9ae52" />
      </linearGradient>
      <radialGradient id="wheel-face" cx=".35" cy=".3" r=".85">
        <stop offset="0" stop-color="#ecca76" /><stop offset=".55" stop-color="#a87b28" /><stop offset="1" stop-color="#5a4112" />
      </radialGradient>
      <linearGradient id="wheel-arm" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#6e4f16" /><stop offset=".45" stop-color="#f6dd92" /><stop offset="1" stop-color="#a87b28" />
      </linearGradient>
      <radialGradient id="wheel-knob" cx=".38" cy=".32" r=".7">
        <stop offset="0" stop-color="#fff4c8" /><stop offset=".45" stop-color="#e0b656" /><stop offset="1" stop-color="#7f5c1c" />
      </radialGradient>
    </defs>
    <circle class="seat" cx="48" cy="48" r="47.5" />
    <g class="dial" style:transform="rotate({angle}deg)">
      <circle cx="48" cy="48" r="44" fill="url(#wheel-bezel)" />
      <!-- knurled edge -->
      {#each TICKS as a (a)}
        <line x1="48" y1="4.5" x2="48" y2="9" transform="rotate({a} 48 48)" class:odd={a % 12} />
      {/each}
      <circle cx="48" cy="48" r="37" fill="url(#wheel-face)" stroke="#2a1d06" stroke-opacity=".6" />
      <!-- five notches, one per tumbler: a hit turns the dial one notch further -->
      {#each [0, 72, 144, 216, 288] as a (a)}
        <rect x="47" y="12.5" width="2" height="5" rx="1" class="notch" transform="rotate({a} 48 48)" />
      {/each}
      {#each [0, 120, 240] as a (a)}
        <g transform="rotate({a} 48 48)">
          <rect x="43.5" y="17" width="9" height="28" rx="4.5" fill="url(#wheel-arm)" stroke="#3a2a0a" stroke-opacity=".5" />
          <circle cx="48" cy="18" r="6.5" fill="url(#wheel-knob)" stroke="#3a2a0a" stroke-opacity=".5" />
        </g>
      {/each}
      <circle cx="48" cy="48" r="12" fill="url(#wheel-knob)" stroke="#3a2a0a" stroke-opacity=".55" />
      <rect x="42" y="47" width="12" height="2" rx="1" fill="#3a2a0a" opacity=".7" />
    </g>
    <!-- the light stays put while the dial turns under it -->
    <path class="shine" d="M14 36 A36 36 0 0 1 36 13" />
  </svg>
</button>
