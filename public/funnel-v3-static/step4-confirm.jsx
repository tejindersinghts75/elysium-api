// ============================================================================
// STEP 4 — Reservation confirmed
// Layout:
//   • Top: alert banner ("Wait before you close…")
//   • Center: one referral card (invite → free months)
//   • Bottom: sticky waitlist-confirmation bar (position + waitlist type)
// ============================================================================

function Step4({ cfg, itk }) {
  const InfoTip = window.InfoTip;
  const [copied, setCopied] = React.useState(false);
  const [referralLink, setReferralLink] = React.useState('');

  const referralCode = React.useMemo(() => {
    const stored = localStorage.getItem('elysium_referral_code');
    if (stored) return stored;
    const code = (itk.name || 'friend')
      .toLowerCase().replace(/[^a-z]/g,'').slice(0,8)
      + '-' + Math.random().toString(36).slice(2, 7);
    localStorage.setItem('elysium_referral_code', code);
    return code;
  }, [itk.name]);

  React.useEffect(() => {
    const clerkUserId = localStorage.getItem('elysium_clerk_user_id') || '';
    const fallbackLink = clerkUserId
      ? `https://join.elysiumcommunities.com/referralpost?userId=${encodeURIComponent(clerkUserId)}&uniqueId=${encodeURIComponent(referralCode)}`
      : '';

    setReferralLink(fallbackLink);

    if (!clerkUserId) return;

    fetch(`/api/referrals?action=generate-link&clerkUserId=${encodeURIComponent(clerkUserId)}`)
      .then(response => response.json())
      .then(data => {
        if (data?.success && data.referralLink) {
          localStorage.setItem('elysium_referral_code', data.uniqueId || referralCode);
          setReferralLink(data.referralLink);
        }
      })
      .catch(error => console.warn('Referral link generation failed:', error));
  }, [referralCode]);

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const el = document.createElement('textarea');
      el.value = referralLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
    if (typeof window.trackXConversion === 'function') {
      await window.trackXConversion('step3_complete');
    }
  };

  const handleDashboardClick = (event) => {
    event.preventDefault();

    const clerkUserId = localStorage.getItem('elysium_clerk_user_id') || '';
    const dashboardUrl = new URL('https://elysiumcommunities.com/dashboard');

    if (clerkUserId) {
      dashboardUrl.searchParams.set('userId', clerkUserId);
    }

    window.open(dashboardUrl.toString(), '_blank', 'noopener,noreferrer');
  };

  const shareText = encodeURIComponent(
    `Come live at Elysium with me — a 100-acre community with on-site farms, shared Teslas, and zero mortgage debt. If you join with my link, we both get free months of living.`
  );

  // Waitlist position returned by the V3 backend after the full submission is saved.
  const position = React.useMemo(() => {
    const stored = localStorage.getItem('elysium_waitlist_position');
    const parsed = parseInt(stored || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 391;
  }, []);

  return (
    <>
      {/* ============ TOP BANNER ============ */}
      <div className="alert-banner">
        <div className="alert-banner-inner">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 2v6M10 12v.01M10 18a8 8 0 100-16 8 8 0 000 16z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span>
            <b>Wait — before you close this page.</b>
            {' '}Would you like free months of living within Elysium?
          </span>
        </div>
      </div>

      {/* ============ CENTER REFERRAL CARD ============ */}
      <div className="confirm-center">
        <div className="referral-card">
          <span className="eyebrow">Refer & earn</span>
          <h1>
            <span style={{ fontFamily: '"Instrument Serif"' }}>
              Want your best friend to be your neighbor?
            </span>
          </h1>
          <p className="lede">
            Invite friends and family to join the Elysium waitlist. You'll each get
            <b> 1 free month of living</b> — and every additional invite gives you both
            a chance to get up to a <b>full year free</b>.
            <InfoTip label="Referral details">
              <p><b>How it works</b></p>
              <p>When you invite friends who join the waitlist via your link and get approved, you'll earn 1 free month of living. Every additional friend earns you a chance win up to a full year at free maximum.</p>
              <p style={{ marginTop: 8 }}><b>Fine print</b></p>
              <p>Both parties must be approved members to live at Elysium. Free months apply toward the monthly household or per-person fee only, and are subject to availability, community capacity, and Elysium's admission review. Free months don't stack with other credits and can't be redeemed for cash.</p>
            </InfoTip>
          </p>

          <label className="link-label">YOUR REFERRAL LINK</label>
          <div className="link-row">
            <input type="text" readOnly value={referralLink} onFocus={e => e.target.select()} />
            <button className={`link-copy ${copied ? 'copied' : ''}`} onClick={handleCopy}>
              {copied ? (
                <>
                  <CheckIcon2 /> Copied
                </>
              ) : (
                <>
                  <CopyIcon /> Copy link
                </>
              )}
            </button>
          </div>

          <div className="share-row">
            <a className="share-btn" href={`mailto:?subject=${encodeURIComponent('Come live at Elysium with me')}&body=${shareText}%0A%0A${encodeURIComponent(referralLink)}`} target="_blank" rel="noopener">
              <EmailIcon /> Email
            </a>
            <a className="share-btn" href={`sms:?body=${shareText}%20${encodeURIComponent(referralLink)}`}>
              <SmsIcon /> Text
            </a>
            <a className="share-btn" href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(referralLink)}`} target="_blank" rel="noopener">
              <XIcon /> Post
            </a>
            <a className="share-btn" href={`https://wa.me/?text=${shareText}%20${encodeURIComponent(referralLink)}`} target="_blank" rel="noopener">
              <WAIcon /> WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* ============ BOTTOM STICKY: waitlist confirmation ============ */}
      <div className="sticky confirm-sticky">
        <div className="sticky-inner">
          <div className="summary" style={{ gap: 20 }}>
            <div className="confirm-badge" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
                <path d="M5 11L9.5 15.5L17 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div className="item lead confirm-lead" style={{ maxWidth: 340 }}>
              <span className="mobile-confirm-title">Congratulations, you are on the list</span>
              <span className="k">
                {cfg.application === 'early' ? 'Reserved · Early Application' : 'You\'re on the list · Standard Application'}
              </span>
              <span className="v" style={{ fontSize: 20 }}>
                Welcome to Elysium, {(itk.name || '').split(' ')[0] || 'friend'}.
              </span>
              <span className="sub">
                {cfg.application === 'early'
                  ? `$99 reservation confirmed. Receipt sent to your inbox.`
                  : `You'll hear from us as we get closer to construction.`
                }
              </span>
            </div>

            <div className="divider"></div>

            <div className="item">
              <span className="k">Your position</span>
              <span className="v">#{position.toLocaleString()}</span>
              <span className="sub">{cfg.application === 'early' ? 'Early waitlist' : 'Standard waitlist'}</span>
            </div>

            <div className="divider"></div>

            <div className="item">
              <span className="k">Est. move-in</span>
              <span className="v" style={{ fontSize: 18 }}>{cfg.application === 'early' ? '~55 mo' : '72–90 mo'}</span>
              <span className="sub">from approval</span>
            </div>
          </div>

          <a href="https://elysiumcommunities.com/dashboard" target="_blank" rel="noopener noreferrer" onClick={handleDashboardClick} className="cta" style={{ background: 'transparent', color: 'var(--ink)', border: '1px solid var(--rule)' }}>
            Member dashboard
            <svg viewBox="0 0 14 14" fill="none"><path d="M3 7H11M11 7L7 3M11 7L7 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>
      </div>
    </>
  );
}

function CheckIcon2() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6.5L4.5 9L10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect x="2.5" y="4.5" width="7" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 4V3a1.5 1.5 0 011.5-1.5h4A1.5 1.5 0 0112 3v6a1.5 1.5 0 01-1.5 1.5h-1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function EmailIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="3" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2 4l5 4 5-4" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>;
}
function SmsIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4.5A1.5 1.5 0 013.5 3h7A1.5 1.5 0 0112 4.5v4A1.5 1.5 0 0110.5 10H5L2.5 12V4.5z" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>;
}
function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 1200 1227" fill="currentColor" aria-hidden="true">
      <path d="M714.16 519.28L1160.89 0H1055.03L667.14 450.89L357.33 0H0L468.49 681.82L0 1226.37H105.87L515.47 750.21L842.67 1226.37H1200L714.16 519.28ZM569.17 687.83L521.7 619.93L144.01 79.69H306.62L611.41 515.69L658.88 583.59L1055.08 1150.3H892.47L569.17 687.83Z" />
    </svg>
  );
}
function WAIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5.5 5.5c0 2 1 3 3 3" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>;
}

window.Step4 = Step4;
