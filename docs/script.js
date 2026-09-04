/* ─────────────────────────────────────────────
   Audio Augment — Landing Page Scripts
   Binary rain · Scroll animations · Nav · Binary text hover
───────────────────────────────────────────── */

"use strict";

/* ══════════════════════════════════════════
   1. BINARY RAIN (background canvas)
══════════════════════════════════════════ */
(function initBinaryRain() {
  const canvas = document.getElementById("binary-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const FONT_SIZE = 10;
  const CHARS = "01";
  const COLOR_BASE = "rgba(199,93,58,";
  const COLOR_DIM = "rgba(175,109,88,";
  let columns = [];
  let W, H;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    const count = Math.floor(W / FONT_SIZE);
    columns = Array.from({ length: count }, () => ({
      y: Math.random() * -H,
      speed: 1.8 + Math.random() * 1.3,
      opacity: 0.22 + Math.random() * 0.4,
      bright: Math.random() < 0.12,
    }));
  }

  function draw() {
    ctx.fillStyle = "rgba(255,249,243,0.06)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = `${FONT_SIZE}px "IBM Plex Mono", monospace`;

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const ch = CHARS[Math.random() < 0.5 ? 0 : 1];
      const x = i * FONT_SIZE;
      const y = col.y;
      const color = col.bright ? COLOR_BASE : COLOR_DIM;
      ctx.fillStyle = color + col.opacity + ")";
      ctx.fillText(ch, x, y);
      col.y += col.speed;

      if (col.y > H + FONT_SIZE) {
        col.y = -FONT_SIZE * (1 + Math.random() * 20);
        col.speed = 1.8 + Math.random() * 2.4;
        col.opacity = 0.22 + Math.random() * 0.32;
        col.bright = Math.random() < 0.12;
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(draw);
})();

/* ══════════════════════════════════════════
   2. SCROLL FADE-IN (Intersection Observer)
══════════════════════════════════════════ */
(function initFadeIn() {
  document.querySelectorAll(".hero .fade-in").forEach((el) => {
    setTimeout(() => el.classList.add("visible"), 100);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );

  document.querySelectorAll(".fade-in:not(.hero .fade-in)").forEach((el) => observer.observe(el));
})();

/* ══════════════════════════════════════════
   3. NAV scroll style
══════════════════════════════════════════ */
(function initNav() {
  const nav = document.querySelector(".nav");
  if (!nav) return;

  function onScroll() {
    if (window.scrollY > 30) {
      nav.style.background = "rgba(255,249,243,0.95)";
      nav.style.backdropFilter = "blur(20px)";
      nav.style.boxShadow = "0 1px 0 rgba(139,63,35,0.1)";
    } else {
      nav.style.background = "rgba(255,249,243,0.75)";
      nav.style.backdropFilter = "blur(12px)";
      nav.style.boxShadow = "none";
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();

/* ══════════════════════════════════════════
   4. BINARY TEXT SCRAMBLE on hover
══════════════════════════════════════════ */
(function initBinaryTextHover() {
  const CHARS = "01 ";
  let interval = null;

  document.querySelectorAll(".section-label, .card-num, .arch-label").forEach((el) => {
    const original = el.textContent;

    el.addEventListener("mouseenter", () => {
      let step = 0;
      clearInterval(interval);
      interval = setInterval(() => {
        if (step >= original.length * 2) {
          el.textContent = original;
          clearInterval(interval);
          return;
        }
        el.textContent = original
          .split("")
          .map((c, i) => {
            if (c === " " || c === "/") return c;
            return i < step / 2 ? original[i] : CHARS[Math.floor(Math.random() * 3)];
          })
          .join("");
        step++;
      }, 40);
    });

    el.addEventListener("mouseleave", () => {
      clearInterval(interval);
      el.textContent = original;
    });
  });
})();
