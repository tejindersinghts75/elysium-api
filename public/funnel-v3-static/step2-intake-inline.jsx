// ============================================================================
// STEP 2 — INLINE VARIANT
// Same hero left + slim panel right. Form fits inside the 360px column.
// ============================================================================

function Step2Inline({ cfg, updateConfig, itk, updateIntake, validationErrors = {}, onOpenTiers, onBack }) {
  const CheckIcon = window.CheckIcon;
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
  const UNIT_STATS = {
    studio: { sqft: '450 sq/ft', ceiling: "10' ceiling", extra: 'Studio' },
    studioLoft: { sqft: '500 sq/ft', ceiling: "12' ceiling", extra: 'Loft' },
    '1br': { sqft: '750 sq/ft', ceiling: "10' ceiling", extra: '1 Bedroom' },
    '2br': { sqft: '1,000 sq/ft', ceiling: "10' ceiling", extra: '2 Bedrooms' },
  };
  const stats = cfg.unit ? UNIT_STATS[cfg.unit] : null;
  const activePreviewImage = getPreviewImage(cfg.unit, cfg.view);

  const toggleArr = (key, val) => {
    const arr = itk[key] || [];
    const next = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
    if (key === 'interests') {
      if (val === 'all' || val === 'unsure') {
        updateIntake({ [key]: arr.includes(val) ? [] : [val] });
        return;
      }
      updateIntake({ [key]: next.filter(x => x !== 'all' && x !== 'unsure') });
      return;
    }
    updateIntake({ [key]: next });
  };

  return (
    <div className="grid">
      {/* ============ HERO (same sticky image stack from step 1) ============ */}
      <div className="hero">
        <div className="hero-img-stack">
          {Object.entries(UNIT_IMG).map(([k, src]) => (
            <img
              key={k} src={src} alt={`${k} interior`}
              className={activePreviewImage === src ? 'active' : ''}
            />
          ))}
          <img
            src={NATURE_UNIT_IMG.studio}
            alt="Studio nature-facing interior"
            className={activePreviewImage === NATURE_UNIT_IMG.studio ? 'active' : ''}
          />
          <img
            src={NATURE_UNIT_IMG['1br']}
            alt="One bedroom nature-facing interior"
            className={activePreviewImage === NATURE_UNIT_IMG['1br'] ? 'active' : ''}
          />
        </div>
        {cfg.view && (
          <div className="hero-meta">
            {cfg.view === 'river' ? 'River-facing' : 'Nature-facing'}
          </div>
        )}
        {stats && (
          <div className="hero-stats">
            <div className="s"><b>{stats.sqft}</b><span>Footprint</span></div>
            <div className="s"><b>{stats.ceiling}</b><span>Height</span></div>
            <div className="s"><b>{stats.extra}</b><span>Layout</span></div>
          </div>
        )}
      </div>

      {/* ============ PANEL ============ */}
      <div className="panel">
        <div className="step-header">
          <span className="eyebrow">02 / 03 · About you</span>
          <h1>
            <span style={{ fontFamily: '"Instrument Serif"' }}>Tell us about yourself.</span>
          </h1>
          <p>
            A few quick questions so we can match you with the right community and the right timeline.
          </p>
          <button
            onClick={onBack}
            style={{
              marginTop: 10, background: 'transparent', border: 'none',
              padding: 0, fontSize: 11.5, cursor: 'pointer', color: 'var(--muted)',
              fontFamily: 'var(--body-font)',
            }}>
            ← Edit preferences
          </button>
        </div>

        {/* Basics */}
        <div className="section" data-field="name">
          <div className="section-head">
            <h2>Your name</h2>
          </div>
          <input
            className="inline-input"
            type="text" placeholder="Full name"
            value={itk.name} onChange={e => updateIntake({ name: e.target.value })}
          />
          <ValidationError message={validationErrors.name} />
        </div>

        <div className="section" data-field="income">
          <div className="section-head">
            <h2>Annual household income</h2>
          </div>
          <div className="pill-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'under75', t: 'Under $75k' },
              { id: '75-150', t: '$75k–$150k' },
              { id: '150-300', t: '$150k–$300k' },
              { id: '300plus', t: '$300k+' },
              { id: 'prefer-not', t: 'Prefer not to say' },
            ].map(o => (
              <button key={o.id}
                className={`pill ${itk.income === o.id ? 'selected' : ''}`}
                style={{ flex: '1 1 auto', minWidth: 'fit-content', padding: '7px 12px' }}
                onClick={() => updateIntake({ income: o.id })}>
                <span className="t">{o.t}</span>
              </button>
            ))}
          </div>
          <ValidationError message={validationErrors.income} />
        </div>

        <div className="section" data-field="fit">
          <div className="section-head">
            <h2>Why Elysium for you?</h2>
            <span className="hint">A few sentences</span>
          </div>
          <textarea
            className="inline-input"
            placeholder="I'm drawn to communities that…"
            value={itk.fit} maxLength={1200}
            onChange={e => updateIntake({ fit: e.target.value })}
            style={{ resize: 'vertical', minHeight: 90 }}
          />
          <div style={{ fontSize: 10.5, color: 'var(--muted)', textAlign: 'right', marginTop: 4 }}>
            {(itk.fit || '').length} / 1200
          </div>
          <ValidationError message={validationErrors.fit} />
        </div>

        <div className="section">
          <div className="section-head">
            <h2>Willing to move to Austin?</h2>
            <span className="hint">Elysium One</span>
          </div>
          <div className="pill-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'yes', t: 'Yes' },
              { id: 'maybe', t: 'Maybe' },
              { id: 'no', t: 'No' },
            ].map(o => (
              <button key={o.id}
                className={`pill ${itk.austin === o.id ? 'selected' : ''}`}
                onClick={() => updateIntake({ austin: o.id })}>
                <span className="t">{o.t}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="section-head">
            <h2>Top city pick for a future community</h2>
          </div>
          <div className="city-input-wrap">
            <input
              className="inline-input city-input"
              type="text" placeholder="e.g Austin, Denver, etc"
              value={itk.topCity} onChange={e => updateIntake({ topCity: e.target.value })}
            />
            <span className="city-input-icon" aria-hidden="true">...</span>
          </div>
        </div>

        <div className="section" data-field="moveIn">
          <div className="section-head">
            <h2>Move-in timeline</h2>
          </div>
          <div className="pill-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'asap', t: 'ASAP' },

              { id: '3-5y', t: '3–5y' },
              { id: '5plus', t: '5y+' },
              { id: 'flexible', t: 'Flexible' },
            ].map(o => (
              <button key={o.id}
                className={`pill ${itk.moveIn === o.id ? 'selected' : ''}`}
                onClick={() => updateIntake({ moveIn: o.id })}>
                <span className="t">{o.t}</span>
              </button>
            ))}
          </div>
          <ValidationError message={validationErrors.moveIn} />
        </div>

        <div className="section" data-field="interests">
          <div className="section-head">
            <h2>
              Interested in
              <button className="info-tip" onClick={onOpenTiers} aria-label="Tier info">i</button>
            </h2>
            <span className="hint">Pick all</span>
          </div>
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

        <div className="section">
          <div className="section-head">
            <h2>Community vibe</h2>
            <span className="hint">Pick all that fit</span>
          </div>
          <div className="multi-chips">
            {[
              { id: 'active', t: 'Active community' },
              { id: 'pro', t: 'Professional / builders' },
              { id: 'resort', t: 'Resort lifestyle' },
              { id: 'retirement', t: 'Quieter pace' },
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

        <div style={{ height: 32 }}></div>
      </div>
    </div>
  );
}

window.Step2Inline = Step2Inline;
