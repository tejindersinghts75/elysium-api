// ============================================================================
// STICKY BAR — live price summary + primary CTA
// Leads with per-person total + benefits, keeps household total in support.
// ============================================================================

function StickyBar({ step, pricing, cfg, ctaLabel, ctaDisabled, onCta }) {
  const { fmt, fmtSmart } = window.ElysiumPricing;
  const standard = cfg.membership === 'standard';
  const trad = cfg.membership === 'traditional';
  const access = cfg.membership === 'access';
  const ready = pricing.ready;
  const accessBenefits = "Living space, two daily meals, Tesla access, wellness amenities, K–8 schooling, co-working spaces, and free community events.";

  const benefits = trad
    ? "Living space + community access. Meals, Tesla, and schooling priced separately."
    : accessBenefits;

  const emptyBenefit = "Select unit + membership to see your monthly estimate.";
  const earlyFee = window.TWEAKS.earlyPrice || 99;
  const standardApplication = cfg.application === 'standard';

  return (
    <div className="sticky" data-step={step}>
      <div className="sticky-inner">
        <div className="summary">
          {/* PER-PERSON LEAD */}
          <div className="item lead">
            <span className="k">
              {!ready ? 'Estimated monthly' : (trad ? 'Monthly · household' : (standard ? (
                <span className="sticky-standard-label">
                  Per month
                  {!cfg.founderBacker && <span className="sticky-desktop-copy"> (includes $499 per-person due)</span>}
                  {!cfg.founderBacker && <span className="sticky-mobile-copy sticky-k-sub">+$499 per-person</span>}
                </span>
              ) : (
                <span className="sticky-k-stack">
                  <span>Per Month</span>
                  <span className="sticky-k-sub">+$499 per-person</span>
                </span>
              )))}
            </span>
            <span className="v" style={ready ? undefined : { color: 'var(--muted)', fontStyle: 'italic' }}>
              {ready ? fmtSmart(trad ? pricing.monthlyHousehold : pricing.monthlyPerPerson) : '—'}
            </span>
            <span className="sub benefits">
              {ready ? (trad ? benefits : (
                <span className="sticky-benefit-mobile">
                  Includes meals + Tesla
                  <InfoTip label="Access ownership benefits" placement="top">
                    <p>{accessBenefits}</p>
                  </InfoTip>
                </span>
              )) : emptyBenefit}
            </span>
          </div>

          {ready && !trad && (
            <>
              <div className="divider"></div>
              <div className="item sticky-secondary sticky-household">
                <span className="k">Household · {pricing.occupants}p</span>
                <span className="v">{fmtSmart(pricing.monthlyHousehold)}</span>
                <span className="sub">
                  {pricing.rebate > 0
                    ? <>monthly before credits · earn {fmt(pricing.rebate)}/mo in credits</>
                    : 'monthly · per household'}
                </span>
              </div>
            </>
          )}

          {ready && access && (
            <>
              <div className="divider"></div>
              <div className="item sticky-secondary sticky-token">
                <span className="k">+ Token purchase</span>
                <span className="v" style={{ fontSize: 16 }}>TBD</span>
              </div>
            </>
          )}

          {ready && trad && (
            <>
              <div className="divider"></div>
              <div className="item sticky-secondary sticky-property">
                <span className="k">Property Purchase</span>
                <span className="v" style={{ fontSize: 16 }}>Pricing TBD</span>
              </div>
            </>
          )}

          {cfg.application === 'early' && (
            <>
              <div className="divider"></div>
              <div className="item sticky-secondary sticky-fee">
                <span className="k">{step === 2 ? 'Due today' : 'Application fee'}</span>
                <span className="v" style={{ fontSize: 16 }}>${earlyFee}</span>
                <span className="sub">{step === 2 ? 'Early — charged now' : 'Early — one-time'}</span>
              </div>
            </>
          )}
        </div>

        <button className="cta" onClick={onCta} disabled={ctaDisabled}>
          {ctaLabel}
          <svg viewBox="0 0 14 14" fill="none"><path d="M3 7H11M11 7L7 3M11 7L7 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      <div className={`sticky-fine-row ${standardApplication ? 'show-mobile' : ''}`}>
        <div className="sticky-inner sticky-fine-inner">
          <span className="fine">
            {standardApplication ? (
              'Due to high demand, Standard Applications waitlist is currently between 72–90 months'
            ) : (
              <>
                Excludes $599/year membership renewal.
                {access && ' Access Ownership requires a one-time token purchase (amount TBD).'}
                {' '}You will not be charged on this page{cfg.application === 'early' ? ' — only at the final reservation step.' : '.'}
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

window.StickyBar = StickyBar;
