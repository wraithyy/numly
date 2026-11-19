// Gold coin and spark burst for the win. Skipped entirely under prefers-reduced-motion.

// One palette per reward tier (see tierOf in shared/logic.js).
export const TIER_COLORS = {
  pink: ['#fff0f4', '#ff9ab8', '#ff5a8a', '#d62f63', '#ffcf7a'],
  gold: ['#fff6cf', '#f2d58a', '#e0ac3e', '#b07a1e', '#ffcf7a'],
  purple: ['#f3e3ff', '#d6a8ff', '#a65cf0', '#7a2fd0', '#ffcf7a'],
  blue: ['#e3f4ff', '#9ad4ff', '#4a9de6', '#2a6cb3', '#ffffff'],
  silver: ['#ffffff', '#e4e9ee', '#b9c2cc', '#8a949f', '#d8dde3'],
};
const COUNT = 160;
const GRAVITY = 0.32;

export function burst(canvas, origin, colors = TIER_COLORS.gold, count = COUNT) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  const dpr = devicePixelRatio || 1;
  const W = innerWidth;
  const H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const particles = Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
    const speed = 5 + Math.random() * 12;
    return {
      x: origin.x, y: origin.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 5,
      rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.35,
      color: colors[i % colors.length],
      spark: i % 3 === 0,
    };
  });

  (function frame() {
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of particles) {
      p.vy += GRAVITY;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      if (p.y > H + 20) continue;
      alive++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.spark) {
        ctx.fillRect(-1, -p.size, 2, p.size * 2);
      } else {
        ctx.scale(Math.abs(Math.cos(p.rot * 2)) + 0.15, 1); // a coin flipping in 3D
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (alive) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, W, H);
  })();
}
