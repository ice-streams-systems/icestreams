/* ═══════════════════════════════════════
   ICE STREAMS SYSTEMS — script.js
═══════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Stream canvas ── */
  const canvas  = document.getElementById('stream-canvas');
  const ctx     = canvas.getContext('2d');
  let cols, drops;

  const CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ▸▹◈◉─│┼╋';
  const COLOR = '#A8D8EA';

  function initCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const fontSize = 13;
    cols  = Math.floor(canvas.width / fontSize);
    drops = Array(cols).fill(0).map(() => Math.random() * -canvas.height);
  }

  let glitchColumn = -1;
  let glitchTimer  = 0;

  function drawStream() {
    ctx.fillStyle = 'rgba(8,8,8,0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '13px JetBrains Mono, monospace';
    const fontSize = 13;

    // Trigger glitch ~every 100 frames: one column flashes spice orange
    glitchTimer++;
    if (glitchTimer > 100 && Math.random() > 0.5) {
      glitchColumn = Math.floor(Math.random() * cols);
      glitchTimer = 0;
    }

    drops.forEach((y, i) => {
      const char = CHARS[Math.floor(Math.random() * CHARS.length)];
      if (i === glitchColumn) {
        ctx.fillStyle = '#FF8C00';
        ctx.globalAlpha = Math.random() * 0.5 + 0.3;
      } else {
        ctx.fillStyle = COLOR;
        ctx.globalAlpha = Math.random() * 0.4 + 0.1;
      }
      ctx.fillText(char, i * fontSize, y);
      ctx.globalAlpha = 1;
      if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i] += fontSize;
    });

    // Fade glitch column back out
    if (glitchTimer > 8) glitchColumn = -1;

    // Draw faint crosshair marks at canvas corners — tactical detail
    drawCrosshairs();
  }

  function drawCrosshairs() {
    const size = 12;
    const off  = 40;
    ctx.strokeStyle = 'rgba(46,134,171,0.35)';
    ctx.lineWidth = 1;
    const corners = [
      [off, off],
      [canvas.width - off, off],
      [off, canvas.height - off],
      [canvas.width - off, canvas.height - off]
    ];
    corners.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(x - size, y);
      ctx.lineTo(x + size, y);
      ctx.moveTo(x, y - size);
      ctx.lineTo(x, y + size);
      ctx.stroke();
    });
  }

  initCanvas();
  setInterval(drawStream, 60);
  window.addEventListener('resize', () => { initCanvas(); measureLayout(); });

  /* ── Dynamic layout measurement ──
     On mobile, header is height:auto so fixed top/bottom offsets need
     to be measured from the real DOM, not a CSS variable guess. */
  function measureLayout() {
    const header = document.getElementById('site-header');
    const footer = document.getElementById('site-footer');
    if (!header || !footer) return;
    const hh = header.getBoundingClientRect().height;
    const fh = footer.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--header-h', hh + 'px');
    document.documentElement.style.setProperty('--footer-h', fh + 'px');
    document.documentElement.style.setProperty('--mobile-header-h', hh + 'px');
    document.documentElement.style.setProperty('--mobile-footer-h', fh + 'px');
  }

  // Measure on load, after fonts settle
  measureLayout();
  setTimeout(measureLayout, 400);

  /* ── Navigation ── */
  const sections  = document.querySelectorAll('.section');
  const navLinks  = document.querySelectorAll('.nav-link');
  const statusTxt = document.getElementById('status-text');

  const statusMap = {
    hero:     'OPERATIONAL',
    about:    'PROFILE: LOADED',
    services: 'CAPABILITIES: ACTIVE',
    works:    'SKILL SETS: LOADED',
    contact:  'AWAITING TRANSMISSION',
  };

  /* ── Typing effect on status text ── */
  let statusTimeout;
  function typeStatus(text) {
    clearTimeout(statusTimeout);
    const el = statusTxt;
    el.textContent = '';
    let i = 0;
    function type() {
      if (i < text.length) {
        el.textContent += text[i++];
        statusTimeout = setTimeout(type, 38);
      }
    }
    type();
  }

  function showSection(id) {
    sections.forEach(s => {
      s.classList.remove('active');
      s.setAttribute('aria-hidden', 'true');
    });
    navLinks.forEach(l => l.classList.remove('active'));

    const target = document.getElementById(id);
    if (target) {
      target.classList.add('active');
      target.setAttribute('aria-hidden', 'false');
    }

    const activeLink = document.querySelector(`.nav-link[data-section="${id}"]`);
    if (activeLink) activeLink.classList.add('active');

    typeStatus(statusMap[id] || 'OPERATIONAL');
  }

  // Nav links
  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showSection(link.dataset.section);
    });
  });

  // Wordmark → home (click + keyboard for role=button)
  const navHome = document.getElementById('nav-home');
  navHome.addEventListener('click', () => showSection('hero'));
  navHome.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSection('hero'); }
  });

  // CTA button
  document.querySelector('.cta-btn').addEventListener('click', function() {
    showSection(this.dataset.section);
  });

  // Init
  showSection('hero');

  /* ── Form submission ── */
  const form = document.getElementById('contact-form');
  const statusEl = document.getElementById('form-status');

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = this.querySelector('.submit-btn');

    // Lock UI
    btn.disabled = true;
    btn.textContent = 'TRANSMITTING...';
    btn.style.borderColor = 'var(--ice)';
    statusEl.textContent = '';
    statusEl.className = 'form-status';

    // Gather payload
    const payload = {
      name:  this.elements['name'].value,
      org:   this.elements['org'].value,
      email: this.elements['email'].value,
      type:  this.elements['type'].value,
      brief: this.elements['brief'].value,
      hp:    this.elements['hp'].value,
    };

    try {
      const res = await fetch(window.ISS_FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        btn.textContent = 'TRANSMISSION SENT';
        btn.style.borderColor = 'var(--signal)';
        btn.style.color = 'var(--signal)';
        statusEl.textContent = 'Signal received. We will respond within 24–48 hours.';
        statusEl.className = 'form-status success';
        form.reset();
      } else {
        throw new Error(data.error || 'UNKNOWN');
      }
    } catch (err) {
      console.error('Form error:', err);
      btn.textContent = 'TRANSMISSION FAILED';
      btn.style.borderColor = 'var(--spice)';
      btn.style.color = 'var(--spice)';
      statusEl.textContent = 'Signal lost. Please try again or email contact@icestreams.io directly.';
      statusEl.className = 'form-status error';
    }

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'TRANSMIT REQUEST';
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 5000);
  });


});
