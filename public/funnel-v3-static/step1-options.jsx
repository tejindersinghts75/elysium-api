// ============================================================================
// STEP 1 — Living preferences (unit, view, dining, tesla, membership, application)
// ============================================================================

function Step1({ cfg, updateConfig, pricing, validationErrors = {}, onOpenTiers }) {
  const InfoTip = window.InfoTip;
  const ValidationError = window.ValidationError;
  const [transparencyOpen, setTransparencyOpen] = React.useState(false);
  const transparencyRef = React.useRef(null);

  // When expanding, smoothly scroll so the section header sits ~110px below
  // the top of the viewport — the user can read top-to-bottom without scrolling.
  // We delay slightly so React commits the open state + the height animation begins.
  const toggleTransparency = React.useCallback(() => {
    setTransparencyOpen(prev => {
      const next = !prev;
      if (next && transparencyRef.current) {
        setTimeout(() => {
          const el = transparencyRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const targetY = window.scrollY + rect.top - 100;
          window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
        }, 60);
      }
      return next;
    });
  }, []);

  const UNIT_IMG = {
    studio: 'assets/unit-studio.jpg',
    studioLoft: 'assets/unit-studio-loft.jpg',
    '1br': 'assets/unit-1br.jpg',
    '2br': 'assets/unit-2br.jpg',
  };
  const DEFAULT_PREVIEW_IMG = '/free-year1-hero.webp';
  const VIEW_IMG = {
    studioNature: 'assets/unit-studio-nature.jpg',
    oneBedroomNature: 'assets/unit-1br-nature.jpg',
    nature: 'assets/natureview.webp',
  };
  const getPreviewImage = (unit, view) => {
    if (view === 'nature') {
      if (unit === 'studio') return VIEW_IMG.studioNature;
      if (unit === '1br') return VIEW_IMG.oneBedroomNature;
      return VIEW_IMG.nature;
    }
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

  return (
    <div className="grid">
      {/* ============ HERO ============ */}
      <div className={`hero ${cfg.unit ? 'has-unit' : 'is-empty'}`}>
          <div className="hero-img-stack">
            <img
              src={DEFAULT_PREVIEW_IMG}
              alt="Elysium balcony overlooking the river community"
              className={!cfg.unit ? 'active' : ''}
              loading={!cfg.unit ? 'eager' : 'lazy'}
            />
            {Object.entries(UNIT_IMG).map(([k, src]) => (
              <img
                key={k}
                src={src}
                alt={`${k} interior`}
                className={cfg.view !== 'nature' && cfg.unit === k ? 'active' : ''}
                loading={cfg.unit === k ? 'eager' : 'lazy'}
              />
            ))}
            <img
              src={VIEW_IMG.studioNature}
              alt="Studio nature-facing interior view"
              className={activePreviewImage === VIEW_IMG.studioNature ? 'active' : ''}
              loading={activePreviewImage === VIEW_IMG.studioNature ? 'eager' : 'lazy'}
            />
            <img
              src={VIEW_IMG.oneBedroomNature}
              alt="One bedroom nature-facing interior view"
              className={activePreviewImage === VIEW_IMG.oneBedroomNature ? 'active' : ''}
              loading={activePreviewImage === VIEW_IMG.oneBedroomNature ? 'eager' : 'lazy'}
            />
            <img
              src={VIEW_IMG.nature}
              alt="Nature-facing interior view"
              className={activePreviewImage === VIEW_IMG.nature ? 'active' : ''}
              loading={activePreviewImage === VIEW_IMG.nature ? 'eager' : 'lazy'}
            />
          </div>
          {!cfg.unit && (
            <div className="hero-empty">
              <div className="hero-empty-eyebrow">SELECT A UNIT</div>
              <div className="hero-empty-title">Preview your home</div>
              <div className="hero-empty-sub">Choose a Studio, Studio Loft, 1 BR, or 2 BR to see the interior.</div>
            </div>
          )}
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
          <span className="eyebrow">Elysium One · Estimated 2030</span>
          <h1><span style={{ fontFamily: '"Instrument Serif"' }}>Design your home at Elysium.</span></h1>
          <p>
            Select your unit preferences. Options may change, subject to availability.
            Current estimated move-in for Early Applications is <b>55 months</b>. Standard Applications waitlist between <b>72–90 months</b>.
          </p>
        </div>

        {/* ---- Unit ---- */}
        <div className="section" data-field="unit">
          <div className="section-head">
            <h2>Unit type</h2>
            <span className="hint">Same price for all views</span>
          </div>
          <div className="pill-row unit-grid">
            {[
              { id: 'studio',     t: 'Studio',      sub: '450 sq/ft' },
              { id: 'studioLoft', t: 'Studio Loft', sub: '500 sq/ft' },
              { id: '1br',        t: '1 Bedroom',   sub: '750 sq/ft' },
              { id: '2br',        t: '2 Bedroom',   sub: '1,000 sq/ft' },
            ].map(o => (
              <button key={o.id}
                className={`pill ${cfg.unit === o.id ? 'selected' : ''}`}
                onClick={() => updateConfig({ unit: o.id })}>
                <span className="t">{o.t}</span>
                <span className="sub">{o.sub}</span>
              </button>
            ))}
          </div>
          <ValidationError message={validationErrors.unit} />
        </div>

        {/* ---- View ---- */}
        <div className="section" data-field="dining">
          <div className="section-head">
            <h2>View</h2>
          </div>
          <div className="pill-row">
            {[
              { id: 'river',  t: 'River-facing',  sub: 'Lantern-lit waterway' },
              { id: 'nature', t: 'Nature-facing', sub: '100+ acres of forest' },
            ].map(o => (
              <button key={o.id}
                className={`pill ${cfg.view === o.id ? 'selected' : ''}`}
                onClick={() => updateConfig({ view: o.id })}>
                <span className="t">{o.t}</span>
                <span className="sub">{o.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ---- Dining ---- */}
        <div className="section">
          <div className="section-head">
            <h2>
              Dining package
              <InfoTip label="About dining packages">
                <p><b>Standard (included)</b></p>
                <p>Enjoy two complimentary meals daily, made in-house with organic, sustainably produced ingredients. Rotating Indian, Thai, and Vietnamese menus plus salads, soups, pizza, fresh breads, and pasta. Includes options like tilapia, shrimp, berries, herbs, and juice bars.</p>
                <p style={{ marginTop: 10 }}><b>Expanded (premium)</b></p>
                <p>Everything in Standard, plus French, Italian, and American staples — select meats and cuts, cheeses, deli options, and premium burgers.</p>
                <p>Expanded selections are billed per consumption at a discounted rate. To purchase, simply maintain a balance of Tokens in your Elysium app.</p>
              </InfoTip>
            </h2>
            <span className="hint">Two complimentary meals daily</span>
          </div>
          <div className="pill-row">
            {[
              { id: 'standard', t: 'Standard',  sub: 'Included' },
              { id: 'expanded', t: 'Expanded',  sub: 'Premium · per use' },
            ].map(o => (
              <button key={o.id}
                className={`pill ${cfg.dining === o.id ? 'selected' : ''}`}
                onClick={() => updateConfig({ dining: o.id })}>
                <span className="t">{o.t}</span>
                <span className="sub">{o.sub}</span>
              </button>
            ))}
          </div>
          <ValidationError message={validationErrors.dining} />
        </div>

        {/* ---- Tesla ---- */}
        <div className="section" data-field="tesla">
          <div className="section-head">
            <h2>Tesla access</h2>
            <span className="hint">Above-limit subject to extra fees</span>
          </div>
          <div className="pill-row">
            {[
              { id: '4h',  t: '4h / day',  sub: 'Included' },
              { id: '10h', t: '10h / day', sub: '+$199/mo' },
              { id: '20h', t: '20h / day', sub: '+$399/mo' },
            ].map(o => (
              <button key={o.id}
                className={`pill ${cfg.tesla === o.id ? 'selected' : ''}`}
                onClick={() => updateConfig({ tesla: o.id })}>
                <span className="t">{o.t}</span>
                <span className="sub">{o.sub}</span>
              </button>
            ))}
          </div>
          <ValidationError message={validationErrors.tesla} />
        </div>

        {/* ---- Membership ---- */}
        <div className="section" data-field="membership">
          <div className="section-head">
            <h2>Membership <button className="info-tip" onClick={onOpenTiers} title="Learn about tiers">i</button></h2>
            <span className="hint">Per household</span>
          </div>
          <div className="card-row">
            <div
              role="button" tabIndex={0}
              className={`card-opt ${cfg.membership === 'standard' ? 'selected' : ''}`}
              onClick={() => updateConfig({ membership: 'standard' })}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && updateConfig({ membership: 'standard' })}>
              <div className="left">
                <b>Standard Membership</b>
                <span className="desc">Monthly fee. Includes dining, Tesla access, wellness amenities, and schooling.</span>
              </div>
              <div className="right">
                {cfg.unit
                  ? window.ElysiumPricing.fmt(window.ElysiumPricing.UNIT_FEES[cfg.unit])
                  : <span style={{ opacity: .5, fontWeight: 500 }}>Pick unit</span>}
                <small>/ MO HOUSEHOLD</small>
              </div>
            </div>

            <div
              role="button" tabIndex={0}
              className={`card-opt ${cfg.membership === 'access' ? 'selected' : ''}`}
              onClick={() => updateConfig({ membership: 'access' })}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && updateConfig({ membership: 'access' })}>
              <div className="left">
                <b>
                  Access Ownership
                  <InfoTip label="About Access Ownership">
                    <p>Access Ownership is still in beta and open only to Founding Backers. To learn more about becoming a Founding Backer, please continue to the video on the next page.</p>
                  </InfoTip>
                </b>
                <span className="desc">Tokenized access. Household fee waived. Per-person dues only. One-time token purchase required.</span>
              </div>
              <div className="right">
                $0
                <small>/ MO HOUSEHOLD</small>
              </div>
            </div>

            <div
              role="button" tabIndex={0}
              className={`card-opt ${cfg.membership === 'traditional' ? 'selected' : ''}`}
              onClick={() => updateConfig({ membership: 'traditional' })}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && updateConfig({ membership: 'traditional' })}>
              <div className="left">
                <b>Traditional Ownership</b>
                <span className="desc">Conventional homeownership. No per-person dues. Perks (meals, Tesla) work differently.</span>
              </div>
              <div className="right">
                $599
                <small>/ MO HOUSEHOLD</small>
              </div>
            </div>
          </div>
          <ValidationError message={validationErrors.membership} />
        </div>

        {/* ---- Occupants ---- */}
        {cfg.membership && cfg.membership !== 'traditional' && (
          <div className="section">
            <div className="section-head">
              <h2>Occupants</h2>
              <span className="hint">$499/mo per person</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="meta">How many people will live here?</div>
              <div className="stepper">
                <button onClick={() => updateConfig({ occupants: Math.max(1, cfg.occupants - 1) })} disabled={cfg.occupants <= 1}>−</button>
                <div className="v">{cfg.occupants}</div>
                <button onClick={() => updateConfig({ occupants: Math.min(4, cfg.occupants + 1) })} disabled={cfg.occupants >= 4}>+</button>
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--rule-soft)', marginTop: 14, paddingTop: 14 }}>
              <div className="toggle-row" style={{ borderTop: 'none', padding: 0 }}>
                <div className="lbl">
                  <b>
                    I'm interested in learning about becoming a Founder Backer
                    <InfoTip label="About Founder Backers">
                      <p><b>What is a Founder Backer?</b></p>
                      <p>Founder Backers receive exclusive lifetime perks that include waiver of the first per-person monthly due (forever for Standard Memberships, and for a limited time for Access Owners), as well as enhanced rebates, benefits and credits from community participation and events.</p>
                      <p style={{ marginTop: 8 }}><b>Fine print</b></p>
                      <p>Founder Backer slots are subject to availability and available only for a limited time. Pledge amount is equal to one month of standard membership and is fully refundable within 90 days.</p>
                    </InfoTip>
                  </b>
                  <>
  <span>
    Pre-construction pledge — waives $499 for first person {cfg.membership === 'standard' ? 'for life' : '(limited time)'}. Check here to get an email invitation to learn more.
  </span>

  <span
    style={{
      display: 'block',
      marginTop: 6,
      fontSize: '14px',
      color: 'var(--text-secondary)',
    }}
  >
    Check here to get an email invitation to learn more.
  </span>
</>
                </div>
                <button className={`toggle ${cfg.founderBacker ? 'on' : ''}`} onClick={() => updateConfig({ founderBacker: !cfg.founderBacker })}></button>
              </div>
            </div>
          </div>
        )}

        {/* ---- Application ---- */}
        <div className="section" data-field="application">
          <div className="section-head">
            <h2>Application type</h2>
          </div>
          <div className="card-row">
            <div
              role="button" tabIndex={0}
              className={`card-opt ${cfg.application === 'standard' ? 'selected' : ''}`}
              onClick={() => updateConfig({ application: 'standard' })}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && updateConfig({ application: 'standard' })}>
              <div className="left">
                <b>Standard Application</b>
                <span className="desc">Free. Waitlist between 72–90 months.</span>
              </div>
              <div className="right">
                Free
                <small>NO CHARGE</small>
              </div>
            </div>

            <div
              role="button" tabIndex={0}
              className={`card-opt ${cfg.application === 'early' ? 'selected' : ''}`}
              onClick={() => updateConfig({ application: 'early' })}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && updateConfig({ application: 'early' })}>
              <div className="left">
                <b>Early Application</b>
                <span className="desc">Priority placement. Current estimated move-in: 55 months.</span>
              </div>
              <div className="right">
                ${window.TWEAKS.earlyPrice || 99}
                <small>ONE-TIME</small>
              </div>
            </div>
          </div>
          <ValidationError message={validationErrors.application} />

          <div style={{ marginTop: 12 }}>
            <div className="toggle-row">
              <div className="lbl">
                <b>I'm interested in priority placement</b>
                <span>Get matched with Early Application opportunities.</span>
              </div>
              <button
                className={`toggle ${cfg.earlyInterest ? 'on' : ''}`}
                onClick={() => updateConfig({ earlyInterest: !cfg.earlyInterest })}>
              </button>
            </div>
          </div>
        </div>

        {/* ---- Transparency ---- */}
        <div className={`transparency ${transparencyOpen ? 'open' : ''}`} ref={transparencyRef}>
          <button className="transparency-head" onClick={toggleTransparency}>
            <div className="ttl">
              <b>Everything you need to know</b>
              <span>How it works — costs, timelines, ownership in plain language.</span>
            </div>
            <span className="chev">▾</span>
          </button>
          <div className="transparency-body">
            <div className="transparency-inner">
              <div>
                <h4>What you'll actually pay each month</h4>
                <p>Standard Members pay a monthly household fee (based on unit) plus $499 per person. Access Owners purchase a full access token up front and skip the household fee (but still pay per person). Traditional Owners finance a conventional property and pay only a $599/mo household fee (no per-person). Traditional Ownership does not include some complimentary benefits like meals and Tesla, but has access at discounted pricing.</p>
              </div>
              <div>
                <h4>The annual renewal</h4>
                <p>All membership tiers include a $599/year renewal. It's not on this page's monthly total — we'll surface it before you ever pay anything.</p>
              </div>
              <div>
                <h4>The 10% rebate</h4>
                <p>On-time payments earn you back 10% in community credits. You can spend those on dining upgrades, guest stays, premium experiences, or apply them to next month's fees.</p>
              </div>
              <div>
                <h4>Earning credits through community</h4>
                <p>Volunteer at the greenhouse, host an event, lead a workshop — optional activities reduce your monthly fees further. Most casual members can offset 5–10% of their dues.</p>
              </div>
              <div>
                <h4>Why two waitlists?</h4>
                <p>Early Applications ($99, refundable if construction is delayed past 2030) get the first units. Standard is free and patient. Same membership terms — just different timelines.</p>
              </div>
              <div>
                <h4>This page doesn't charge you</h4>
                <p>You're only previewing pricing. The $99 (if you choose Early) is the only charge on this flow, and it happens at the very end, in a Stripe-secured panel.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

window.Step1 = Step1;
