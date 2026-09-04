/* ─────────────────────────────────────────────
   Audio Augment — Landing Page Scripts
   Binary rain · Waveform path · Hero wave · Scroll animations
───────────────────────────────────────────── */

'use strict';

/* ══════════════════════════════════════════
   1. BINARY RAIN (background canvas)
══════════════════════════════════════════ */
(function initBinaryRain() {
  const canvas = document.getElementById('binary-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const FONT_SIZE = 13;
  const CHARS = '01';
  const COLOR_BASE  = 'rgba(199,93,58,';   // accent
  const COLOR_ALT   = 'rgba(120,50,20,';   // dimmer
  let columns = [];
  let W, H;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    const count = Math.floor(W / FONT_SIZE);
    columns = Array.from({ length: count }, (_, i) => ({
      y: Math.random() * -H,
      speed: 0.5 + Math.random() * 1.2,
      opacity: 0.3 + Math.random() * 0.5,
      bright: Math.random() < 0.15,   // occasional bright column
    }));
  }

  function draw() {
    // semi-transparent overlay — creates fade trail
    ctx.fillStyle = 'rgba(13,10,9,0.18)';
    ctx.fillRect(0, 0, W, H);

    ctx.font = `${FONT_SIZE}px "IBM Plex Mono", monospace`;

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const ch = CHARS[Math.random() < 0.5 ? 0 : 1];
      const x  = i * FONT_SIZE;
      const y  = col.y;

      const color = col.bright ? COLOR_BASE : COLOR_ALT;
      ctx.fillStyle = color + col.opacity + ')';
      ctx.fillText(ch, x, y);

      col.y += col.speed;

      // reset when off screen, randomise restart
      if (col.y > H + FONT_SIZE) {
        col.y = -FONT_SIZE * (1 + Math.random() * 20);
        col.speed   = 0.5 + Math.random() * 1.2;
        col.opacity = 0.3 + Math.random() * 0.5;
        col.bright  = Math.random() < 0.15;
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(draw);
})();


/* ══════════════════════════════════════════
   2. HERO WAVEFORM VISUALISER (canvas)
   Animates a synthetic audio waveform
══════════════════════════════════════════ */
(function initHeroWave() {
  const canvas = document.getElementById('hero-wave-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Multiple oscillator layers for realism
  const layers = [
    { amp: 28, freq: 2.1,   phase: 0,    speed: 0.018, color: 'rgba(199,93,58,0.7)',  width: 2 },
    { amp: 18, freq: 4.3,   phase: 1.1,  speed: 0.03,  color: 'rgba(199,93,58,0.4)',  width: 1.5 },
    { amp: 10, freq: 7.7,   phase: 2.4,  speed: 0.05,  color: 'rgba(232,120,79,0.25)', width: 1 },
    { amp: 6,  freq: 13.0,  phase: 0.6,  speed: 0.08,  color: 'rgba(199,93,58,0.15)', width: 1 },
  ];

  // Occasional pulse bursts to mimic speech
  let pulseTimer = 0;
  let pulseActive = false;
  let pulseDecay = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  function draw(ts) {
    const W = canvas.getBoundingClientRect().width;
    const H = canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, W, H);

    // Pulse logic
    pulseTimer++;
    if (!pulseActive && pulseTimer > 80 + Math.random() * 120) {
      pulseActive = true;
      pulseDecay  = 1;
      pulseTimer  = 0;
    }
    if (pulseActive) {
      pulseDecay -= 0.018;
      if (pulseDecay <= 0) { pulseActive = false; pulseDecay = 0; }
    }
    const pMult = 1 + pulseDecay * 1.6;

    for (const layer of layers) {
      layer.phase += layer.speed;
      ctx.beginPath();
      ctx.lineWidth = layer.width;
      ctx.strokeStyle = layer.color;

      const pts = 200;
      for (let i = 0; i <= pts; i++) {
        const x  = (i / pts) * W;
        const t  = (i / pts) * Math.PI * 2;
        const y  = H / 2
          + Math.sin(t * layer.freq + layer.phase) * layer.amp * pMult
          + Math.sin(t * layer.freq * 1.7 + layer.phase * 0.8) * (layer.amp * 0.3) * pMult;

        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Centre baseline
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(199,93,58,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(draw);
})();


/* ══════════════════════════════════════════
   3. WAVEFORM PATHWAY (bottom SVG)
   Draws a smooth animated path across the page bottom
══════════════════════════════════════════ */
(function initWaveformPath() {
  const path      = document.getElementById('waveform-path');
  const pathGlow  = document.getElementById('waveform-path-glow');
  if (!path) return;

  let offset = 0;
  const W = 1440;
  const MID = 60;
  const SEGS = 28;

  // Stable random amplitudes per segment
  const amps = Array.from({ length: SEGS + 2 }, () => 8 + Math.random() * 38);

  function buildD(phase) {
    let d = `M 0 ${MID}`;
    for (let i = 0; i <= SEGS; i++) {
      const x0 = (i / SEGS) * W;
      const x1 = ((i + 0.5) / SEGS) * W;
      const x2 = ((i + 1) / SEGS) * W;
      const amp = amps[i] * Math.sin(i * 0.6 + phase);
      const amp2 = amps[i + 1] * Math.sin((i + 1) * 0.6 + phase);
      d += ` C ${x1} ${MID + amp}, ${x1} ${MID + amp2}, ${x2} ${MID + amp2}`;
    }
    return d;
  }

  function animate() {
    offset += 0.006;
    const d = buildD(offset);
    path.setAttribute('d', d);
    pathGlow.setAttribute('d', d);
    requestAnimationFrame(animate);
  }

  animate();
})();


/* ══════════════════════════════════════════
   4. SCROLL FADE-IN (Intersection Observer)
══════════════════════════════════════════ */
(function initFadeIn() {
  // Trigger hero elements immediately
  document.querySelectorAll('.hero .fade-in').forEach(el => {
    // small stagger via existing delay classes already in CSS
    setTimeout(() => el.classList.add('visible'), 100);
  });

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.fade-in:not(.hero .fade-in)').forEach(el => observer.observe(el));
})();


/* ══════════════════════════════════════════
   5. NAV scroll opacity
══════════════════════════════════════════ */
(function initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  function onScroll() {
    if (window.scrollY > 30) {
      nav.style.background = 'rgba(13,10,9,0.88)';
      nav.style.backdropFilter = 'blur(20px)';
    } else {
      nav.style.background = 'rgba(13,10,9,0.55)';
      nav.style.backdropFilter = 'blur(12px)';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();


/* ══════════════════════════════════════════
   6. BINARY TEXT — swap characters on hover
   Cards & binary-text elements cycle chars
══════════════════════════════════════════ */
(function initBinaryTextHover() {
  const CHARS = '01 ';
  let interval = null;

  document.querySelectorAll('.section-label, .card-num, .arch-label').forEach(el => {
    const original = el.textContent;
    el.addEventListener('mouseenter', () => {
      let step = 0;
      clearInterval(interval);
      interval = setInterval(() => {
        if (step >= original.length * 2) {
          el.textContent = original;
          clearInterval(interval);
          return;
        }
        el.textContent = original
          .split('')
          .map((c, i) => {
            if (c === ' ' || c === '/') return c;
            return i < step / 2
              ? original[i]
              : CHARS[Math.floor(Math.random() * 3)];
          })
          .join('');
        step++;
      }, 40);
    });
    el.addEventListener('mouseleave', () => {
      clearInterval(interval);
      el.textContent = original;
    });
  });
})();
