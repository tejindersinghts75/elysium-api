// ============================================================================
// STEP 2 — About you (intake form)
// ============================================================================

function Step2({ cfg, updateConfig, itk, updateIntake, pricing, validationErrors = {}, onOpenTiers, onBack }) {
  const ValidationError = window.ValidationError;

  const UNIT_IMG = {
    studio: 'assets/unit-studio.jpg',
    studioLoft: 'assets/unit-studio-loft.jpg',
    '1br': 'assets/unit-1br.jpg',
    '2br': 'assets/unit-2br.jpg',
  };
  const NATURE_UNIT_IMG = {
    studio: 'assets/unit-studio-nature.jpg',
    '1br': 'assets/unit-1br-nature.jpg',
  };
  const getPreviewImage = (unit, view) => {
    if (view === 'nature' && NATURE_UNIT_IMG[unit]) return NATURE_UNIT_IMG[unit];
    return UNIT_IMG[unit];
  };
  const UNIT_LABELS = window.ElysiumPricing.UNIT_LABELS;

  const toggleArr = (key, val) => {
    const arr = itk[key] || [];
    const next = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
    // "All of the above" / "Not sure" should be exclusive for interests
    if (key === 'interests') {
      if (val === 'all' || val === 'unsure') {
        updateIntake({ [key]: arr.includes(val) ? [] : [val] });
        return;
      }
      // remove exclusives if other selected
      updateIntake({ [key]: next.filter(x => x !== 'all' && x !== 'unsure') });
      return;
    }
    updateIntake({ [key]: next });
  };

  return (
    <div className="step-page fade-up">

      <div className="step-header" style={{ marginBottom: 24 }}>
        <span className="eyebrow">Step 2 of 3 · About you</span>
        <h1 style={{ fontSize: 38, fontFamily: 'var(--heading-font)', fontWeight: 400, letterSpacing: '-.02em', margin: '8px 0 8px', lineHeight: 1.05 }}>Tell us about yourself.</h1>
        <p style={{ color: 'var(--muted)', maxWidth: 480, margin: 0 }}>
          A few quick questions so we can match you with the right community and the right timeline.
        </p>
      </div>

      {/* Mini summary of selections */}
      <div className="summary-mini">
        <img src={getPreviewImage(cfg.unit, cfg.view)} alt="" />
        <div className="meta">
          <b>{UNIT_LABELS[cfg.unit]} · {cfg.view === 'river' ? 'River view' : 'Nature view'}</b>
          <span>
            {cfg.membership === 'standard' && 'Standard Membership'}
            {cfg.membership === 'access' && 'Access Ownership'}
            {cfg.membership === 'traditional' && 'Traditional Ownership'}
            {' · '}
            {cfg.application === 'early' ? 'Early Application' : 'Standard Application'}
          </span>
        </div>
        <button
          onClick={onBack}
          style={{
            marginLeft: 'auto', background: 'transparent', border: '1px solid var(--rule)',
            padding: '8px 16px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
            fontFamily: 'var(--body-font)', color: 'var(--muted)'
          }}>
          Edit
        </button>
      </div>

      {/* ---- Basics ---- */}
      <div className="step-card">
        <h2>Basics</h2>
        <p className="lede">Your contact details and current situation.</p>

        <div className="form-row" data-field="name">
          <label>Full name</label>
          <input type="text" placeholder="Jordan Park" value={itk.name} onChange={e => updateIntake({ name: e.target.value })} />
          <ValidationError message={validationErrors.name} />
        </div>

        <div className="form-row" data-field="income">
          <label>Annual household income</label>
          <div className="multi-chips">
            {[
              { id: 'under75', t: 'Under $75k' },
              { id: '75-150', t: '$75k – $150k' },
              { id: '150-300', t: '$150k – $300k' },
              { id: '300plus', t: '$300k+' },
              { id: 'prefer-not', t: 'Prefer not to say' },
            ].map(o => (
              <button key={o.id}
                className={`chip ${itk.income === o.id ? 'selected' : ''}`}
                onClick={() => updateIntake({ income: o.id })}>
                <CheckIcon />
                {o.t}
              </button>
            ))}
          </div>
          <ValidationError message={validationErrors.income} />
        </div>
      </div>

      {/* ---- Your story ---- */}
      <div className="step-card">
        <h2>Your story</h2>
        <p className="lede">A short paragraph — what makes Elysium right for you?</p>

        <div className="form-row" data-field="fit">
          <label>Why do you think you'd be an awesome fit at Elysium?</label>
          <div className="help">A few sentences. What you'd contribute, what excites you, who you are.</div>
          <textarea
            placeholder="I'm drawn to communities that..."
            value={itk.fit}
            maxLength={1200}
            onChange={e => updateIntake({ fit: e.target.value })}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', marginTop: 2 }}>
            {(itk.fit || '').length} / 1200
          </div>
          <ValidationError message={validationErrors.fit} />
        </div>
      </div>

      {/* ---- Location ---- */}
      <div className="step-card">
        <h2>Location preference</h2>
        <p className="lede">Elysium One opens in Austin, TX. Future communities — your call.</p>

        <div className="form-row">
          <label>Are you willing to move to Austin, TX for Elysium One?</label>
          <div className="multi-chips">
            {[
              { id: 'yes', t: 'Yes, ready to move' },
              { id: 'maybe', t: 'Maybe, depending on timing' },
              { id: 'no', t: 'No — waiting for another city' },
            ].map(o => (
              <button key={o.id}
                className={`chip ${itk.austin === o.id ? 'selected' : ''}`}
                onClick={() => updateIntake({ austin: o.id })}>
                <CheckIcon />
                {o.t}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <label>What city would be your top pick for a future Elysium?</label>
          <input type="text" placeholder="e.g. Lisbon, Boulder, Kyoto, Mexico City…"
            value={itk.topCity} onChange={e => updateIntake({ topCity: e.target.value })} />
        </div>
      </div>

      {/* ---- Timeline ---- */}
      <div className="step-card">
        <h2>Timeline</h2>
        <p className="lede">When are you looking to move in?</p>

        <div className="form-row" data-field="moveIn">
          <div className="multi-chips">
            {[
              { id: 'asap', t: 'As soon as possible' },

              { id: '3-5y', t: '3–5 years' },
              { id: '5plus', t: '5+ years' },
              { id: 'flexible', t: 'Flexible / no rush' },
            ].map(o => (
              <button key={o.id}
                className={`chip ${itk.moveIn === o.id ? 'selected' : ''}`}
                onClick={() => updateIntake({ moveIn: o.id })}>
                <CheckIcon />
                {o.t}
              </button>
            ))}
          </div>
          <ValidationError message={validationErrors.moveIn} />
        </div>
      </div>

      {/* ---- Interest in ---- */}
      <div className="step-card">
        <h2>What you're interested in
          <button className="info-tip" onClick={onOpenTiers} title="Learn about the three tiers" style={{ verticalAlign: 'super', fontSize: 11 }}>i</button>
        </h2>
        <p className="lede">Pick all that apply. Tap the "i" for a deeper breakdown of each tier.</p>

        <div className="form-row" data-field="interests">
          <div className="multi-chips">
            {[
              { id: 'standard', t: 'Standard Membership' },
              { id: 'access', t: 'Access Ownership' },
              { id: 'traditional', t: 'Traditional Ownership' },
              { id: 'all', t: 'All of the above' },
              { id: 'unsure', t: 'Not sure right now' },
            ].map(o => (
              <button key={o.id}
                className={`chip ${(itk.interests || []).includes(o.id) ? 'selected' : ''}`}
                onClick={() => toggleArr('interests', o.id)}>
                <CheckIcon />
                {o.t}
              </button>
            ))}
          </div>
          <ValidationError message={validationErrors.interests} />
        </div>
      </div>

      {/* ---- Community vibe ---- */}
      <div className="step-card">
        <h2>What kind of community do you want?</h2>
        <p className="lede">Pick all that resonate — your answer helps shape who lives where.</p>

        <div className="form-row">
          <div className="multi-chips">
            {[
              { id: 'active', t: 'Active — participation, events, sports, festivals' },
              { id: 'pro', t: 'Professional — co-working, founders, builders' },
              { id: 'resort', t: 'Resort — buffets, pools, retailtainment' },
              { id: 'retirement', t: 'Quieter — slower pace, simpler routine' },
              { id: 'innovation', t: 'Innovation Hub' },
              { id: 'family', t: 'Family Focused' },
              { id: 'faith', t: 'Faith Friendly' },
            ].map(o => (
              <button key={o.id}
                className={`chip ${(itk.community || []).includes(o.id) ? 'selected' : ''}`}
                onClick={() => toggleArr('community', o.id)}>
                <CheckIcon />
                {o.t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: 60 }}></div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="check" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 6.5L4.5 9L10 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

window.Step2 = Step2;
window.CheckIcon = CheckIcon;
