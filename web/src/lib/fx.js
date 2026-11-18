// Gold coin and spark burst for the win. Skipped entirely under prefers-reduced-motion.

const COLORS = ['#fff6cf', '#f2d58a', '#e0ac3e', '#b07a1e', '#ffcf7a'];
const COUNT = 160;
const GRAVITY = 0.32;

export function burst(canvas, origin) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  const dpr = devicePixelRatio || 1;
  const W = innerWidth;
  const H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const particles = Array.from({ length: COUNT }, (_, i) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
    const speed = 5 + Math.random() * 12;
    return {
      x: origin.x, y: origin.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 5,
      rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.35,
      color: COLORS[i % COLORS.length],
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
