/* ============================================================
   ELYSIUM COMMUNITIES — WIN AN APARTMENT (v2)
   JS: Animations · Navbar · Gallery · Counter · Form
   ============================================================ */
'use strict';

/* ── 1. NAVBAR — elevation on scroll ── */
(function () {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('elevated', window.scrollY > 10);
  }, { passive: true });
})();

/* ── MOBILE MENU ── */
(function () {
  const button = document.querySelector('.nav-hamburger');
  const menu = document.getElementById('mobileMenu');
  if (!button || !menu) return;

  function setOpen(open) {
    menu.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.setAttribute('aria-hidden', String(!open));
  }

  button.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });

  menu.addEventListener('click', event => event.stopPropagation());
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setOpen(false));
  });
  document.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setOpen(false);
  });
})();

/* ── 2. INTERSECTION OBSERVER — scroll reveals ── */
(function () {
  const els = document.querySelectorAll('[data-animate]');
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(() => el.classList.add('visible'), delay);
      io.unobserve(el);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  els.forEach(el => io.observe(el));
})();

/* ── 3. PILLAR CARDS — stagger ── */
(function () {
  const items = document.querySelectorAll('.pillar');
  items.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(28px)';
    el.style.transition = `opacity 0.7s ease ${i * 0.1}s, transform 0.7s ease ${i * 0.1}s`;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      io.disconnect();
    }, { threshold: 0.15 });
    io.observe(el);
  });
})();

/* ── 4. PRIZE LIST ITEMS — stagger ── */
(function () {
  const items = document.querySelectorAll('.prize-list li');
  items.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-16px)';
    el.style.transition = `opacity 0.6s ease ${i * 0.08}s, transform 0.6s ease ${i * 0.08}s`;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
      io.disconnect();
    }, { threshold: 0.1 });
    io.observe(el);
  });
})();

/* ── 5. HOW STEPS — stagger ── */
(function () {
  const items = document.querySelectorAll('.how-step');
  items.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(32px)';
    el.style.transition = `opacity 0.7s ease ${i * 0.14}s, transform 0.7s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.14}s`;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      io.disconnect();
    }, { threshold: 0.1 });
    io.observe(el);
  });
})();

/* ── 6. PRIZE COUNTER ── */
(function () {
  const el = document.getElementById('prizeCounter');
  if (!el) return;
  let triggered = false;
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || triggered) return;
    triggered = true;
    const start = performance.now();
    const dur = 1600;
    const target = 36;
    function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = '$' + Math.round(ease * target) + 'K';
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = '$36K';
    }
    requestAnimationFrame(tick);
    io.disconnect();
  }, { threshold: 0.5 });
  io.observe(el);
})();

/* ── 7. GALLERY — drag to scroll ── */
(function () {
  const gallery = document.getElementById('lifeGallery');
  if (!gallery) return;

  let isDown = false, startX = 0, scrollLeft = 0;

  gallery.addEventListener('mousedown', e => {
    isDown = true;
    gallery.style.cursor = 'grabbing';
    startX = e.pageX - gallery.offsetLeft;
    scrollLeft = gallery.scrollLeft;
  });
  document.addEventListener('mouseup', () => {
    isDown = false;
    gallery.style.cursor = '';
  });
  gallery.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - gallery.offsetLeft;
    gallery.scrollLeft = scrollLeft - (x - startX) * 1.2;
  });

  // Auto-scroll hint
  let autoScrolled = false;
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || autoScrolled) return;
    autoScrolled = true;
    setTimeout(() => {
      gallery.scrollTo({ left: 120, behavior: 'smooth' });
      setTimeout(() => gallery.scrollTo({ left: 0, behavior: 'smooth' }), 900);
    }, 600);
    io.disconnect();
  }, { threshold: 0.4 });
  io.observe(gallery);
})();

/* ── 8. PARALLAX — manifesto ── */
(function () {
  const img = document.querySelector('.manifesto-bg-img');
  if (!img) return;
  function update() {
    const sec = img.closest('.manifesto');
    const rect = sec.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const pct = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
    img.style.transform = `scale(1.12) translateY(${(pct - 0.5) * 50}px)`;
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
})();

/* ── 9. SMOOTH ANCHOR SCROLL ── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10) || 68;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navH, behavior: 'smooth' });
  });
});

/* ── 10. FORM — validation + submit ── */
(function () {
  const form = document.getElementById('entryForm');
  const successMsg = document.getElementById('successMsg');
  const btn = document.getElementById('submitBtn');
  if (!form) return;

  /* Real-time */
  form.querySelectorAll('input[required], textarea[required]').forEach(field => {
    field.addEventListener('blur', () => validateField(field));
    field.addEventListener('input', () => {
      field.classList.remove('invalid');
      if (field.value.trim()) field.classList.add('ok');
    });
  });

  function validateField(f) {
    f.classList.remove('invalid', 'ok');
    const val = f.value.trim();
    if (f.required && !val) { f.classList.add('invalid'); return false; }
    if (f.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      f.classList.add('invalid'); return false;
    }
    if (val) f.classList.add('ok');
    return true;
  }

  function validateAll() {
    let ok = true;
    form.querySelectorAll('[required]').forEach(f => {
      if (f.type === 'checkbox') {
        if (!f.checked) { f.closest('.fg-check').querySelector('.check-box').style.borderColor = '#ef4444'; ok = false; }
        else f.closest('.fg-check').querySelector('.check-box').style.borderColor = '';
      } else {
        if (!validateField(f)) ok = false;
      }
    });
    return ok;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateAll()) return;

    btn.disabled = true;
    btn.querySelector('.btn-txt').textContent = 'Submitting…';

    /* Simulate async */
    await new Promise(r => setTimeout(r, 1100));

    form.style.transition = 'opacity 0.35s, transform 0.35s';
    form.style.opacity = '0';
    form.style.transform = 'translateY(-10px)';
    await new Promise(r => setTimeout(r, 350));
    form.style.display = 'none';
    successMsg.style.display = 'block';
    successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
})();

/* ── 11. CURSOR GLOW (desktop) ── */
(function () {
  if (window.matchMedia('(hover: none)').matches) return;
  const glow = document.createElement('div');
  Object.assign(glow.style, {
    position: 'fixed', width: '350px', height: '350px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,0,0,0.035) 0%, transparent 70%)',
    pointerEvents: 'none', zIndex: '9999',
    transform: 'translate(-50%,-50%)',
    left: '-500px', top: '-500px',
    transition: 'left 0.9s cubic-bezier(0.25,0.46,0.45,0.94), top 0.9s cubic-bezier(0.25,0.46,0.45,0.94)',
    willChange: 'left, top',
  });
  document.body.appendChild(glow);
  document.addEventListener('mousemove', e => {
    glow.style.left = e.clientX + 'px';
    glow.style.top = e.clientY + 'px';
  }, { passive: true });
})();

/* ── 12. GALLERY IMAGES — subtle zoom on hover (handled by CSS) ── */
