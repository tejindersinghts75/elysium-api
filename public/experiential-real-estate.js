/* ============================================================
   ELYSIUM — JUNIOR SUITE SALES PAGE
   JS: Navbar · Animations · Gallery · Parallax · FAQ · Form
   ============================================================ */
'use strict';

/* ── 1. NAVBAR ── */
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

/* ── 3. BENEFITS CAROUSEL ── */
(function () {
  const carousel = document.querySelector('.pillars');
  if (!carousel) return;

  const benefits = [
    {
      title: 'Complimentary Dining',
      body: 'Two organic meals a day, grown on site. Seasonal harvests, morning markets, zero food miles.',
    },
    {
      title: 'Community Teslas',
      body: "Free yourself from car payments forever. Share a Tesla whenever you need it, wherever you're going.",
    },
    {
      title: 'Quests & Credits',
      body: 'Show up, join community quests, and earn credits toward fees and living expenses every month. Living pays dividends here.',
    },
    {
      title: 'Walkable Community',
      body: 'Daily eateries, co-working spaces, and 100+ acres of indoor & outdoor wellness.',
    },
    {
      title: 'Human First',
      body: 'Built on human connection. Workshops, events, and festivals that bring people together.',
    },
  ];

  carousel.classList.add('benefits-carousel');
  carousel.innerHTML = `
    <div class="benefits-toolbar">
      <span class="benefits-label">Included at Elysium</span>
      <div class="benefits-controls">
        <button class="benefits-arrow benefits-prev" type="button" aria-label="Show previous benefit">&#8592;</button>
        <button class="benefits-arrow benefits-next" type="button" aria-label="Show next benefit">&#8594;</button>
      </div>
    </div>
    <div class="benefits-viewport">
      <div class="benefits-track" aria-live="polite"></div>
    </div>
  `;

  const track = carousel.querySelector('.benefits-track');
  const viewport = carousel.querySelector('.benefits-viewport');
  const previous = carousel.querySelector('.benefits-prev');
  const next = carousel.querySelector('.benefits-next');
  const gap = 14;
  let start = 0;
  let position = 0;
  let visibleCount = 3;
  let cardWidth = 0;
  let changing = false;

  function getVisibleCount() {
    if (window.innerWidth <= 640) return 1;
    if (window.innerWidth <= 1024) return 2;
    return 3;
  }

  function createCard(benefit, index) {
    const card = document.createElement('article');
    card.className = 'benefit-card';

    const number = document.createElement('span');
    number.className = 'benefit-number';
    number.textContent = `${String(index + 1).padStart(2, '0')} / ${String(benefits.length).padStart(2, '0')}`;

    const title = document.createElement('h3');
    title.textContent = benefit.title;

    const body = document.createElement('p');
    body.textContent = benefit.body;

    card.append(number, title, body);
    return card;
  }

  function setPosition(animate) {
    track.classList.toggle('is-resetting', !animate);
    track.style.transform = `translate3d(${-position * (cardWidth + gap)}px, 0, 0)`;
    if (!animate) {
      void track.offsetWidth;
      track.classList.remove('is-resetting');
    }
  }

  function render() {
    changing = false;
    visibleCount = getVisibleCount();
    cardWidth = (viewport.clientWidth - gap * (visibleCount - 1)) / visibleCount;
    track.replaceChildren();
    const leading = benefits.slice(-visibleCount);
    const trailing = benefits.slice(0, visibleCount);
    [...leading, ...benefits, ...trailing].forEach(benefit => {
      const index = benefits.indexOf(benefit);
      const card = createCard(benefit, index);
      card.style.width = `${cardWidth}px`;
      track.append(card);
    });
    position = visibleCount + start;
    setPosition(false);
  }

  function finishMove() {
    if (position < visibleCount || position >= visibleCount + benefits.length) {
      position = visibleCount + start;
      setPosition(false);
    }
    changing = false;
  }

  function move(direction) {
    if (changing) return;
    changing = true;
    start = (start + direction + benefits.length) % benefits.length;
    position += direction;
    setPosition(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finishMove();
  }

  track.addEventListener('transitionend', event => {
    if (event.target === track && event.propertyName === 'transform' && changing) finishMove();
  });
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  let resizeTimer;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(render, 120);
  });
  render();
})();

/* ── VIDEO — load YouTube only after intent ── */
(function () {
  const trigger = document.querySelector('.video-lite[data-youtube-src]');
  if (!trigger) return;

  trigger.addEventListener('click', () => {
    const src = trigger.getAttribute('data-youtube-src');
    if (!src) return;

    const iframe = document.createElement('iframe');
    iframe.width = '560';
    iframe.height = '315';
    iframe.src = src;
    iframe.title = 'YouTube video player';
    iframe.frameBorder = '0';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';

    trigger.replaceWith(iframe);
  }, { once: true });
})();

/* ── 4. STAGGER — Value list items ── */
(function () {
  document.querySelectorAll('.value-list li').forEach((el, i) => {
    el.style.cssText = `opacity:0; transform:translateX(-16px); transition:opacity 0.6s ease ${i*0.08}s, transform 0.6s ease ${i*0.08}s`;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      el.style.opacity = '1'; el.style.transform = 'translateX(0)';
      io.disconnect();
    }, { threshold: 0.1 });
    io.observe(el);
  });
})();

/* ── 5. STAGGER — How steps ── */
(function () {
  document.querySelectorAll('.how-step').forEach((el, i) => {
    el.style.cssText = `opacity:0; transform:translateY(32px); transition:opacity 0.7s ease ${i*0.14}s, transform 0.7s cubic-bezier(0.34,1.56,0.64,1) ${i*0.14}s`;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      el.style.opacity = '1'; el.style.transform = 'translateY(0)';
      io.disconnect();
    }, { threshold: 0.1 });
    io.observe(el);
  });
})();

/* ── 6. FAQ ACCORDION ── */
(function () {
  const items = document.querySelectorAll('.faq-item');
  items.forEach(item => {
    const btn = item.querySelector('.faq-q');
    const panel = item.querySelector('.faq-a');
    if (!btn || !panel) return;

    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';

      // Close all
      items.forEach(other => {
        const ob = other.querySelector('.faq-q');
        const op = other.querySelector('.faq-a');
        if (ob && op) {
          ob.setAttribute('aria-expanded', 'false');
          op.hidden = true;
        }
      });

      // Toggle current
      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
        panel.hidden = false;
        // Smooth scroll into view if needed
        setTimeout(() => {
          const rect = panel.getBoundingClientRect();
          if (rect.bottom > window.innerHeight) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 50);
      }
    });
  });
})();

/* ── 7. GALLERY — drag to scroll + auto-hint ── */
(function () {
  const gallery = document.getElementById('lifeGallery');
  if (!gallery) return;

  let isDown = false, startX = 0, sl = 0;
  gallery.addEventListener('mousedown', e => {
    isDown = true; startX = e.pageX - gallery.offsetLeft; sl = gallery.scrollLeft;
  });
  document.addEventListener('mouseup', () => { isDown = false; });
  gallery.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    gallery.scrollLeft = sl - (e.pageX - gallery.offsetLeft - startX) * 1.2;
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce), (hover: none)').matches) return;

  let hinted = false;
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || hinted) return;
    hinted = true;
    setTimeout(() => {
      gallery.scrollTo({ left: 100, behavior: 'smooth' });
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
  if (window.matchMedia('(prefers-reduced-motion: reduce), (hover: none)').matches) return;

  let ticking = false;

  function update() {
    ticking = false;
    const sec = img.closest('.manifesto');
    const rect = sec.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const pct = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
    img.style.transform = `scale(1.12) translateY(${(pct - 0.5) * 50}px)`;
  }

  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  update();
})();

/* ── 9. SMOOTH ANCHOR SCROLL ── */
(function () {
  const joinButtons = [
    document.getElementById('clickherefaqform-remove'),
    ...document.querySelectorAll('.js-join-waitlist'),
  ].filter(Boolean);

  joinButtons.forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const waitlistUrl = 'https://join.elysiumcommunities.com/join-waitlist';

      if (window.location.href !== waitlistUrl) {
        window.location.assign(waitlistUrl);
        return;
      }

      window.location.assign(waitlistUrl);
    });
  });
})();

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
  const form = document.getElementById('reserveForm');
  const successMsg = document.getElementById('successMsg');
  const btn = document.getElementById('submitBtn');
  if (!form) return;

  const errorMsg = document.createElement('p');
  errorMsg.className = 'form-error';
  errorMsg.setAttribute('role', 'alert');
  errorMsg.hidden = true;
  btn.insertAdjacentElement('afterend', errorMsg);

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
        const cb = f.closest('.fg-check')?.querySelector('.check-box');
        if (!f.checked) { if (cb) cb.style.borderColor = '#ef4444'; ok = false; }
        else if (cb) cb.style.borderColor = '';
      } else {
        if (!validateField(f)) ok = false;
      }
    });
    return ok;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateAll()) return;

    errorMsg.hidden = true;
    btn.disabled = true;
    btn.querySelector('.btn-txt').textContent = 'Submitting…';

    try {
      const response = await fetch('/api/junior-suite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.elements.firstName.value,
          lastName: form.elements.lastName.value,
          email: form.elements.email.value,
          phone: form.elements.phone.value,
          timeline: form.elements.timeline.value,
          why: form.elements.why.value,
          consent: form.elements.consent.checked,
          source: 'experiential-real-estate',
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to submit your reservation.');

      form.style.transition = 'opacity 0.35s, transform 0.35s';
      form.style.opacity = '0';
      form.style.transform = 'translateY(-10px)';
      await new Promise(resolve => setTimeout(resolve, 350));
      form.style.display = 'none';
      successMsg.style.display = 'block';
      successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      errorMsg.textContent = error.message || 'Unable to submit your reservation. Please try again.';
      errorMsg.hidden = false;
      btn.disabled = false;
      btn.querySelector('.btn-txt').textContent = 'Join Waitlist';
    }
  });
})();

/* ── 11. FAQ items — stagger entrance ── */
(function () {
  document.querySelectorAll('.faq-item').forEach((el, i) => {
    el.style.cssText = `opacity:0; transform:translateY(20px); transition:opacity 0.6s ease ${(i%5)*0.07}s, transform 0.6s ease ${(i%5)*0.07}s`;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      el.style.opacity = '1'; el.style.transform = 'translateY(0)';
      io.disconnect();
    }, { threshold: 0.05 });
    io.observe(el);
  });
})();
