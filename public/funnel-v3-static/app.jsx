// ============================================================================
// ELYSIUM OPTIONS — main app shell + step routing + global state
// ============================================================================
const { useState, useEffect, useMemo, useCallback, useRef } = React;

const SAVE_FORM_V3_ENDPOINT = '/api/payment/save-form-v3';
const REFERRALS_ENDPOINT = '/api/referrals';
const X_CONVERSIONS_ENDPOINT = '/api/x-conversions';
const CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuZWx5c2l1bWNvbW11bml0aWVzLmNvbSQ';
const X_EVENT_IDS = {
  step0_complete: 'tw-rcajc-rdcm5',
  step1_complete: 'tw-rcajc-rdcm8',
  step2_complete: 'tw-rcajc-rdcm9',
  step3_complete: 'tw-rcajc-rdcma',
};

(function captureXClickId() {
  const params = new URLSearchParams(window.location.search);
  const twclid = params.get('twclid');
  if (twclid) localStorage.setItem('elysium_twclid', twclid);
})();

(function captureReferralParams() {
  const params = new URLSearchParams(window.location.search);
  const referredBy = params.get('referredBy') || params.get('userId');
  const referralId = params.get('referralId') || params.get('uniqueId') || params.get('ref');

  if (!referredBy || !referralId) return;

  localStorage.setItem('elysium_referred_by', referredBy);
  localStorage.setItem('elysium_referral_id', referralId);

  const trackedKey = `elysium_referral_opened_${referralId}`;
  if (localStorage.getItem(trackedKey) === 'true') return;

  fetch(`${REFERRALS_ENDPOINT}?action=track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      referrerId: referredBy,
      referralId,
      status: 'opened',
      source: 'funnel-v3',
      eventSourceUrl: window.location.href,
    }),
  })
    .then(() => localStorage.setItem(trackedKey, 'true'))
    .catch((error) => console.warn('Referral open tracking failed:', error));
})();

function getReferralPayload() {
  const referredBy = localStorage.getItem('elysium_referred_by') || '';
  const referralId = localStorage.getItem('elysium_referral_id') || '';
  return referredBy && referralId ? { referredBy, referralId } : {};
}

function topNavProps() {
  return {
    target: '_top',
    rel: 'noopener noreferrer',
  };
}

const FUNNEL_V3_LABELS = {
  unit: {
    studio: 'Studio',
    studioLoft: 'Studio Loft',
    '1br': '1 Bedroom',
    '2br': '2 Bedroom',
  },
  view: {
    river: 'River-facing',
    nature: 'Nature-facing',
  },
  dining: {
    standard: 'Standard',
    expanded: 'Expanded',
  },
  tesla: {
    '4h': '4 hours/day',
    '10h': '10 hours/day',
    '20h': '20 hours/day',
  },
  membership: {
    standard: 'Standard Membership',
    access: 'Access Ownership',
    traditional: 'Traditional Ownership',
  },
  application: {
    standard: 'Standard Application',
    early: 'Early Application',
  },
};

async function postSaveFormV3(payload) {
  const response = await fetch(SAVE_FORM_V3_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || data.details || 'Unable to save your information. Please try again.');
  }
  return data;
}

function createConversionId(eventName) {
  const randomId = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `funnel-v3-${eventName}-${randomId}`;
}

async function trackXConversion(eventName, data = {}) {
  const eventId = X_EVENT_IDS[eventName];
  if (!eventId) return;

  const trackedKey = `elysium_x_tracked_${eventName}`;
  if (localStorage.getItem(trackedKey) === 'true') return;

  const conversionId = createConversionId(eventName);
  const email = data.email || localStorage.getItem('elysium_email') || '';
  const twclid = localStorage.getItem('elysium_twclid') || '';

  try {
    if (typeof window.twq === 'function') {
      window.twq('event', eventId, {
        conversion_id: conversionId,
      });
    }

    await fetch(X_CONVERSIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName,
        conversionId,
        email,
        phone: data.phone || '',
        twclid,
        eventSourceUrl: window.location.href,
      }),
    });

    localStorage.setItem(trackedKey, 'true');
  } catch (error) {
    console.warn(`X conversion tracking failed for ${eventName}:`, error);
  }
}

function storeV3Response(data) {
  if (!data) return;
  if (data.userId) localStorage.setItem('elysium_clerk_user_id', data.userId);
  if (data.entryKey) localStorage.setItem('elysium_entry_key', data.entryKey);
  if (data.signInToken) localStorage.setItem('elysium_sign_in_token', data.signInToken);
  if (data.waitlistPosition) localStorage.setItem('elysium_waitlist_position', String(data.waitlistPosition));
}

async function waitForClerkGlobal() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (window.Clerk) return window.Clerk;
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new Error('Clerk did not initialize');
}

function loadClerkScript() {
  if (window.Clerk) return Promise.resolve(window.Clerk);

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-clerk-js="true"]');

    if (existingScript) {
      existingScript.setAttribute('data-clerk-publishable-key', CLERK_PUBLISHABLE_KEY);

      if (existingScript.dataset.loaded === 'true') {
        waitForClerkGlobal().then(resolve).catch(reject);
        return;
      }

      existingScript.addEventListener('load', () => {
        existingScript.dataset.loaded = 'true';
        waitForClerkGlobal().then(resolve).catch(reject);
      });
      existingScript.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.dataset.clerkJs = 'true';
    script.setAttribute('data-clerk-publishable-key', CLERK_PUBLISHABLE_KEY);
    script.onload = () => {
      script.dataset.loaded = 'true';
      waitForClerkGlobal().then(resolve).catch(reject);
    };
    script.onerror = () => reject(new Error('Unable to load Clerk.js'));
    document.head.appendChild(script);
  });
}

async function waitForClerkClient() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (window.Clerk?.client) return window.Clerk;
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new Error('Clerk client was not ready');
}

async function activateClerkSession(signInToken) {
  if (!signInToken) return false;

  try {
    const Clerk = await loadClerkScript();

    if (!Clerk) {
      throw new Error('Clerk did not initialize');
    }

    await Clerk.load(CLERK_PUBLISHABLE_KEY);
    await waitForClerkClient();

    const signIn = await Clerk.client.signIn.create({
      strategy: 'ticket',
      ticket: signInToken,
    });

    if (signIn.status !== 'complete') {
      throw new Error(`Clerk sign-in status: ${signIn.status}`);
    }

    await Clerk.setActive({
      session: signIn.createdSessionId,
    });

    localStorage.setItem('elysium_clerk_session_active', 'true');
    localStorage.setItem('elysium_clerk_session_id', signIn.createdSessionId || '');
    return true;
  } catch (error) {
    localStorage.removeItem('elysium_clerk_session_active');
    localStorage.removeItem('elysium_clerk_session_id');
    console.warn('V3 Clerk session activation failed:', error);
    return false;
  }
}

async function saveFunnelV3Email(email) {
  const data = await postSaveFormV3({
    action: 'emailOnly',
    useremail: email,
    email,
    ...getReferralPayload(),
  });
  storeV3Response(data);
  activateClerkSession(data.signInToken).catch((error) => {
    console.warn('V3 Clerk background activation failed:', error);
  });
  await trackXConversion('step0_complete', { email });
  return data;
}

window.trackXConversion = trackXConversion;

function buildUnitPayload(cfg) {
  return JSON.stringify([
    {
      id: cfg.unit,
      text: FUNNEL_V3_LABELS.unit[cfg.unit] || cfg.unit,
      selected: 'selected',
    },
  ]);
}

function buildFunnelV3Payload(cfg, itk, pricing) {
  const email = localStorage.getItem('elysium_email') || '';
  const selectedApplication = cfg.application === 'early' ? '99' : 'standard';

  return {
    clerkUserId: localStorage.getItem('elysium_clerk_user_id') || undefined,
    name: itk.name,
    useremail: email,
    mobile: '',
    income: itk.income,
    why: itk.fit,
    selectedCity: itk.austin || '',
    topCity: itk.topCity || '',
    moveTimeline: itk.moveIn,
    interestedIn: itk.interests || [],
    communityKind: itk.community || [],
    community: itk.community || [],
    priceperfoot: buildUnitPayload(cfg),
    unit: FUNNEL_V3_LABELS.view[cfg.view] || cfg.view || '',
    occupants: cfg.occupants,
    founderBacker: cfg.founderBacker,
    earlyInterest: cfg.earlyInterest,
    teslaoptions: FUNNEL_V3_LABELS.tesla[cfg.tesla] || cfg.tesla,
    chooseterm: FUNNEL_V3_LABELS.membership[cfg.membership] || cfg.membership,
    selectapplication: selectedApplication,
    applicationType: FUNNEL_V3_LABELS.application[cfg.application] || cfg.application,
    diningpackage: FUNNEL_V3_LABELS.dining[cfg.dining] || cfg.dining,
    priceperfootDisplay: pricing.ready ? window.ElysiumPricing.fmtSmart(pricing.monthlyPerPerson) : '',
    monthlyHousehold: pricing.monthlyHousehold || 0,
    monthlyPerPerson: pricing.monthlyPerPerson || 0,
    monthlyCredits: pricing.rebate || 0,
    effectiveMonthly: pricing.effectiveMonthly || 0,
    annualRenewal: pricing.annualRenewal || 599,
    ...getReferralPayload(),
  };
}

window.saveFunnelV3Email = saveFunnelV3Email;

function getStep1ValidationErrors(cfg) {
  const errors = {};
  if (!cfg.unit) errors.unit = 'Please select a unit type.';
  if (!cfg.dining) errors.dining = 'Please select a dining package.';
  if (!cfg.tesla) errors.tesla = 'Please select a Tesla access option.';
  if (!cfg.membership) errors.membership = 'Please select a membership type.';
  if (!cfg.application) errors.application = 'Please select an application type.';
  return errors;
}

function getStep2ValidationErrors(itk) {
  const errors = {};
  if (!(itk.name || '').trim()) errors.name = 'Please enter your full name.';
  if (!itk.income) errors.income = 'Please select one of these options.';
  if (!(itk.fit || '').trim()) errors.fit = 'Please answer this question.';
  if (!itk.moveIn) errors.moveIn = 'Please select one of these options.';
  if (!(itk.interests || []).length) errors.interests = 'Please select at least one option.';
  return errors;
}

function scrollToFirstValidationError(errors) {
  const firstKey = Object.keys(errors)[0];
  if (!firstKey) return;

  setTimeout(() => {
    const el = document.querySelector(`[data-field="${firstKey}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('validation-shake');
    void el.offsetWidth;
    el.classList.add('validation-shake');

    const focusable = el.querySelector('input, textarea, button, [tabindex]:not([tabindex="-1"])');
    if (focusable) {
      setTimeout(() => focusable.focus({ preventScroll: true }), 350);
    }
  }, 60);
}

function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}

function ValidationError({ message }) {
  if (!message) return null;
  return (
    <div className="validation-error" role="alert">
      {message}
    </div>
  );
}

window.ValidationError = ValidationError;

function App() {
  // Tweaks (apply CSS vars from window.TWEAKS)
  const [tweaks, setTweaks] = useTweaks(window.TWEAKS);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', tweaks.accent);
    root.style.setProperty('--bg', tweaks.bg);
    root.style.setProperty('--card', tweaks.card);
    root.style.setProperty('--ink', tweaks.ink);
    root.style.setProperty('--muted', tweaks.muted);
    root.style.setProperty('--rule', tweaks.rule);
    root.style.setProperty('--selected-bg', tweaks.ink);
    root.style.setProperty('--heading-font', `'${tweaks.headingFont}', 'Cormorant Garamond', Georgia, serif`);
    root.style.setProperty('--body-font', `'${tweaks.bodyFont}', system-ui, sans-serif`);
    document.body.classList.toggle('density-compact', tweaks.density === 'compact');
  }, [tweaks]);

  // ============ MAIN STATE ============
  // Persisted across reloads
  const [step, setStep] = useState(() => {
    const s = parseInt(localStorage.getItem('elysium_step') || '1', 10);
    return Math.min(4, Math.max(1, s));
  });

  const [config, setConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem('elysium_config') || '{}'); }
    catch { return {}; }
  });
  const [intake, setIntake] = useState(() => {
    try { return JSON.parse(localStorage.getItem('elysium_intake') || '{}'); }
    catch { return {}; }
  });

  // No preselected options — user must pick each one.
  // Non-choice defaults (occupants counter, boolean toggles) stay sensible.
  const cfg = {
    unit: undefined,
    view: undefined,
    dining: undefined,
    tesla: undefined,
    occupants: 1,
    membership: undefined,
    application: undefined,
    founderBacker: false,
    earlyInterest: false,
    ...config,
  };

  const itk = {
    name: '',
    income: '',
    fit: '',
    austin: '',
    topCity: '',
    moveIn: '',
    interests: [],
    community: [],
    ...intake,
  };

  const updateConfig = useCallback((patch) => {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem('elysium_config', JSON.stringify(next));
      return next;
    });
  }, []);

  const updateIntake = useCallback((patch) => {
    setIntake(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem('elysium_intake', JSON.stringify(next));
      return next;
    });
  }, []);

  // Persist step
  useEffect(() => {
    localStorage.setItem('elysium_step', String(step));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // Compute pricing
  const pricing = useMemo(() => window.ElysiumPricing.calculate({
    unit: cfg.unit,
    tesla: cfg.tesla,
    dining: cfg.dining,
    occupants: cfg.occupants,
    membership: cfg.membership,
    founderBacker: cfg.founderBacker,
  }), [cfg.unit, cfg.tesla, cfg.dining, cfg.occupants, cfg.membership, cfg.founderBacker]);

  // ============ MODAL / OVERLAY STATE ============
  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [stripeOpen, setStripeOpen] = useState(false);
  const [stripeProcessing, setStripeProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  const handleContinue = async () => {
    if (step === 1) {
      const errors = getStep1ValidationErrors(cfg);
      if (hasErrors(errors)) {
        setValidationErrors(errors);
        scrollToFirstValidationError(errors);
        return;
      }
      setValidationErrors({});
      await trackXConversion('step1_complete');
      setStep(2);
    }
    else if (step === 2) {
      const errors = getStep2ValidationErrors(itk);
      if (hasErrors(errors)) {
        setValidationErrors(errors);
        scrollToFirstValidationError(errors);
        return;
      }
      setValidationErrors({});
      setSaving(true);
      try {
        const data = await postSaveFormV3(buildFunnelV3Payload(cfg, itk, pricing));
        storeV3Response(data);
        await trackXConversion('step2_complete');

        // step 2 → reserve. Early Application opens the real Stripe payment panel.
        if (cfg.application === 'early') {
          setStripeOpen(true);
        } else {
          setStep(4);
        }
      } catch (error) {
        alert(error.message || 'Unable to save your information. Please try again.');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleStripeConfirm = () => {
    setStripeProcessing(true);
    setStripeProcessing(false);
    setStripeOpen(false);
    setStep(4);
  };

  const handleReset = () => {
    if (!window.confirm('Start over? This will clear your selections and take you back to the beginning.')) return;
    ['elysium_config', 'elysium_intake', 'elysium_step', 'elysium_email', 'elysium_referral_code', 'elysium_position', 'elysium_waitlist_position'].forEach(k => localStorage.removeItem(k));
    // Full reload so the email gate re-triggers cleanly
    location.reload();
  };

  // ============ CTA LABEL + VALIDATION ============
  // Step 1: user must pick unit, dining, tesla, membership, application.
  //   (view + occupants + founderBacker are optional / have defaults)
  const step1Valid = !!(cfg.unit && cfg.dining && cfg.tesla && cfg.membership && cfg.application);
  const step2Valid = !!(itk.name && itk.fit && itk.income && itk.moveIn && (itk.interests && itk.interests.length));
  const activeValidationErrors = step === 1
    ? Object.fromEntries(Object.entries(validationErrors).filter(([key]) => getStep1ValidationErrors(cfg)[key]))
    : step === 2
      ? Object.fromEntries(Object.entries(validationErrors).filter(([key]) => getStep2ValidationErrors(itk)[key]))
      : {};

  let ctaLabel = 'Continue';
  if (step === 1) {
    ctaLabel = 'Continue';
  } else if (step === 2) {
    ctaLabel = cfg.application === 'early' ? 'Reserve · $99' : 'Reserve spot';
  }
  if (saving) ctaLabel = 'Saving...';

  // ============ RENDER ============
  return (
    <>
      <Nav step={step} setStep={setStep} onReset={handleReset} />

      {step === 1 && (
        <div className="page" key="step1">
          <Step1 cfg={cfg} updateConfig={updateConfig} pricing={pricing} validationErrors={activeValidationErrors} onOpenTiers={() => setTierModalOpen(true)} />
        </div>
      )}

      {step === 2 && tweaks.step2Layout === 'inline' && (
        <div className="page" key="step2-inline">
          <Step2Inline
            cfg={cfg} updateConfig={updateConfig}
            itk={itk} updateIntake={updateIntake}
            validationErrors={activeValidationErrors}
            onOpenTiers={() => setTierModalOpen(true)}
            onBack={() => setStep(1)}
          />
        </div>
      )}

      {step === 2 && tweaks.step2Layout !== 'inline' && (
        <div className="page" key="step2-page">
          <Step2
            cfg={cfg} updateConfig={updateConfig}
            itk={itk} updateIntake={updateIntake}
            pricing={pricing}
            validationErrors={activeValidationErrors}
            onOpenTiers={() => setTierModalOpen(true)}
            onBack={() => setStep(1)}
          />
        </div>
      )}

      {step === 4 && (
        <React.Fragment key="step4">
          <Step4 cfg={cfg} itk={itk} />
        </React.Fragment>
      )}

      {step < 4 && (
        <StickyBar
          step={step}
          pricing={pricing}
          cfg={cfg}
          ctaLabel={ctaLabel}
          ctaDisabled={saving}
          onCta={handleContinue}
        />
      )}

      <TierModal open={tierModalOpen} onClose={() => setTierModalOpen(false)} />

      <StripePanel
        open={stripeOpen}
        amount={window.TWEAKS.earlyPrice || 99}
        processing={stripeProcessing}
        onClose={() => !stripeProcessing && setStripeOpen(false)}
        onConfirm={handleStripeConfirm}
        clerkUserId={localStorage.getItem('elysium_clerk_user_id') || ''}
      />

      <TweaksConfig tweaks={tweaks} setTweak={setTweaks} />
    </>
  );
}

// ============ NAV ============
function Nav({ step, setStep, onReset }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const userStep = step === 4 ? 3 : step;

  return (
    <nav className="navbar" id="navbar">
      <div className="nav-inner">
        <button
          className="nav-hamburger"
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobileMenu"
          onClick={() => setMenuOpen(open => !open)}>
          <span></span><span></span><span></span>
        </button>

        <a href="https://www.elysiumcommunities.com" className="nav-logo" aria-label="Elysium home" {...topNavProps()}>
          ELYSIUM
        </a>

        <div className="nav-links">
          <a href="https://www.elysiumcommunities.com/location" className="nav-link" {...topNavProps()}>Locations</a>
          <a href="https://www.elysiumcommunities.com/about-us" className="nav-link" {...topNavProps()}>About Us</a>
          <a href="https://www.elysiumcommunities.com/faq" className="nav-link" {...topNavProps()}>FAQ</a>
        </div>

        <div className="nav-status">
          <div className="progress" aria-label={`step ${userStep} of 3`}>
            {[1,2,3].map(n => (
              <div key={n} className={`dot ${userStep === n ? 'current' : (userStep > n ? 'done' : '')}`}></div>
            ))}
          </div>
          <span className="step">
            {step === 1 && '01 / 03'}
            {step === 2 && '02 / 03'}
            {step === 4 && 'Reserved'}
          </span>
        </div>

        <div className="nav-actions">
          {step > 1 && step < 4 && (
            <button
              className="nav-back"
              onClick={() => setStep(Math.max(1, step - 1))}>
              Back
            </button>
          )}
          <button className="nav-cta" onClick={onReset}>
            Start Over
          </button>
        </div>
      </div>
      <div className={`mobile-menu ${menuOpen ? 'is-open' : ''}`} id="mobileMenu" aria-hidden={String(!menuOpen)}>
        <div className="mobile-menu-links">
          <a href="https://www.elysiumcommunities.com" {...topNavProps()}>Home</a>
          <a href="https://www.elysiumcommunities.com/location" {...topNavProps()}>Locations</a>
          <a href="https://www.elysiumcommunities.com/blog" {...topNavProps()}>Blogs</a>
          <a href="https://www.elysiumcommunities.com/about-us" {...topNavProps()}>About</a>
          <a href="https://www.elysiumcommunities.com/login" {...topNavProps()}>Login</a>
          <a href="https://www.elysiumcommunities.com/dining" {...topNavProps()}>Dining</a>
          <a href="https://www.elysiumcommunities.com/wellness" {...topNavProps()}>Wellness</a>
          <a href="https://www.elysiumcommunities.com/amenities" {...topNavProps()}>Amenities</a>
          <a href="https://www.elysiumcommunities.com/floorplans" {...topNavProps()}>Floorplans</a>
          <a href="https://www.elysiumcommunities.com/family-life" {...topNavProps()}>Family Life</a>
          <a href="https://www.elysiumcommunities.com/agriculture" {...topNavProps()}>Agriculture</a>
          <a href="https://www.elysiumcommunities.com/robotics-ai" {...topNavProps()}>AI &amp; Robotics</a>
          <a href="https://www.elysiumcommunities.com/solar-powered" {...topNavProps()}>Solar Powered</a>
          <a href="https://www.elysiumcommunities.com/tomorrow-initiative" {...topNavProps()}>Tomorrow Initiative</a>
          <a href="https://www.elysiumcommunities.com/faq" {...topNavProps()}>Frequently Asked Questions</a>
        </div>
      </div>
    </nav>
  );
}

// Render
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
