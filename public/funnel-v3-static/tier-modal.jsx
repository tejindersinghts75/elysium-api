// ============================================================================
// TIER MODAL — the "i" info popup explaining all 3 tiers
// ============================================================================

function TierModal({ open, onClose }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={`modal-bg ${open ? 'open' : ''}`} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Three ways to live at Elysium</h2>
            <p>Flexible options designed to lower cost barriers. Mix and match — or change your mind later.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">

          <div className="tier">
            <h3>1 · Standard Membership</h3>
            <p>
              Household fee plus a per-person fee. For example, $1,925/mo for a studio plus $499/mo per person, with a $599 annual renewal.
              Two people in a studio would be $1,925 + $499 + $499 per month, plus $599/year.
            </p>
            <p style={{ marginTop: 8 }}>
              Includes living space, dining (2 meals/day standard, premium upgrade available), shared Tesla (4h/day per person included), wellness amenities, K-8 schooling, and more.
            </p>
            <p className="meta">
              <b>Rebate:</b> On-time payments earn 10% back in credits — making $1,925 effectively ~$1,735.
              <br/>
              <b>Founder Backers</b> (pre-construction pledge) get the $499 waived for the first household member <b>for life</b>. Limited offer.
              Members can also earn community credits through optional volunteer activities.
            </p>
          </div>

          <div className="tier">
            <h3>2 · Access Ownership (AO)</h3>
            <p>
              A tokenized ownership model — the middle ground between membership and traditional ownership. AO eliminates the household fee entirely
              ($1,925 → $0) and keeps only the per-person fee. You own year-round private access to a living space, governed by a decentralized token contract, and it's fully transferable.
            </p>
            <p className="meta">
              <b>Founder Backers</b> who are also Access Owners get the $499 waived for a limited time only (the lifetime waiver does not apply here).
            </p>
          </div>

          <div className="tier">
            <h3>3 · Traditional Ownership</h3>
            <p>
              Conventional homeownership with no per-person dues — just a $599/mo household fee.
              Complimentary community perks (meals, Tesla, schooling, wellness) work differently for Traditional Owners (e.g., 2 daily meals not included).
            </p>
            <p className="meta">
              Additional guidance will be provided closer to buildout.
              For complete pricing, visit <a href="https://elysiumcommunities.com/pricing" target="_blank" rel="noopener" style={{ color: 'var(--ink)' }}>elysiumcommunities.com/pricing</a>.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}

window.TierModal = TierModal;
