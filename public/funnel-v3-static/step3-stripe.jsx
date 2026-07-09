// ============================================================================
// STEP 3 — Real Stripe payment panel for Early Application $99
// ============================================================================

const V3_STRIPE_MODE = 'live';
// Stripe publishable key is resolved from the backend config endpoint for the
// selected mode, so switching this constant is enough to toggle test/live.

function StripePanel({ open, amount, processing, onClose, onConfirm, clerkUserId }) {
  const [stripe, setStripe] = React.useState(null);
  const [elements, setElements] = React.useState(null);
  const [cardElement, setCardElement] = React.useState(null);
  const [clientSecret, setClientSecret] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState('');
  const [mode, setMode] = React.useState('');
  const cardMountRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function setupStripePayment() {
      setLoading(true);
      setError('');
      setClientSecret('');

      try {
        if (!window.Stripe) {
          throw new Error('Stripe.js did not load. Please refresh and try again.');
        }

        if (!clerkUserId) {
          throw new Error('Missing user session. Please restart the form from the email step.');
        }

        const configRes = await fetch(`/api/payment/stripe?config=1&mode=${V3_STRIPE_MODE}`);
        const config = await configRes.json().catch(() => ({}));
        if (!configRes.ok || !config.publishableKey) {
          throw new Error(config.error || 'Stripe publishable key is not configured.');
        }

        const stripeInstance = window.Stripe(config.publishableKey);

        const intentRes = await fetch('/api/payment/stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clerkUserId,
            paymentType: 'deposit',
            stripeMode: V3_STRIPE_MODE,
            addons: [],
            deviceInfo: {
              browser: navigator.userAgent,
              device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
              os: navigator.platform || '',
            },
          }),
        });
        const intent = await intentRes.json().catch(() => ({}));
        if (!intentRes.ok || !intent.clientSecret) {
          throw new Error(intent.error || intent.details || 'Unable to start payment.');
        }

        if (cancelled) return;

        const elementsInstance = stripeInstance.elements();
        const card = elementsInstance.create('card', {
          hidePostalCode: false,
          style: {
            base: {
              color: '#1a1a17',
              fontFamily: 'Manrope, system-ui, sans-serif',
              fontSize: '15px',
              '::placeholder': { color: '#8b887f' },
            },
            invalid: { color: '#9f1d1d' },
          },
        });

        setStripe(stripeInstance);
        setElements(elementsInstance);
        setCardElement(card);
        setClientSecret(intent.clientSecret);
        setMode(config.mode || '');

        setTimeout(() => {
          if (cardMountRef.current) card.mount(cardMountRef.current);
        }, 0);

        card.on('change', (event) => {
          setError(event.error ? event.error.message : '');
        });
      } catch (err) {
        if (!cancelled) setError(err.message || 'Unable to initialize Stripe.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setupStripePayment();

    return () => {
      cancelled = true;
      if (cardElement) cardElement.destroy();
      setCardElement(null);
      setElements(null);
      setStripe(null);
      setClientSecret('');
      setMode('');
    };
  }, [open, clerkUserId]);

  const handlePay = async () => {
    if (!stripe || !elements || !cardElement || !clientSecret) {
      setError('Payment form is not ready yet.');
      return;
    }

    setPaying(true);
    setError('');

    try {
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (result.error) {
        setError(result.error.message || 'Payment failed.');
        return;
      }

      if (result.paymentIntent?.status === 'succeeded') {
        onConfirm(result.paymentIntent);
        return;
      }

      setError(`Payment status: ${result.paymentIntent?.status || 'unknown'}`);
    } catch (err) {
      setError(err.message || 'Payment failed.');
    } finally {
      setPaying(false);
    }
  };

  const busy = processing || loading || paying;

  return (
    <>
      <div className={`stripe-overlay ${open ? 'open' : ''}`} onClick={busy ? undefined : onClose}></div>
      <div className={`stripe-panel ${open ? 'open' : ''}`} role="dialog" aria-modal="true">
        <div className="stripe-head">
          <div>
            <h2>Reserve your spot</h2>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              <LockIcon /> Secured by Stripe{mode ? ` · ${mode.toUpperCase()} mode` : ''}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close" disabled={busy}>✕</button>
        </div>

        <div className="stripe-body">
          <div className="stripe-amount">
            <div>
              <div className="k">Early Application — one-time</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Refundable if construction is delayed past 2030
              </div>
            </div>
            <div className="v">${amount}.00</div>
          </div>

          <div className="stripe-input">
            <label>Card details</label>
            <div ref={cardMountRef} className="stripe-card-element"></div>
          </div>

          {loading && (
            <div className="stripe-message">
              Preparing secure payment...
            </div>
          )}

          {error && (
            <div className="stripe-error" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="stripe-foot">
          <button className="stripe-pay" onClick={handlePay} disabled={busy || !clientSecret || !!error && !cardElement}>
            {busy ? (
              <>
                <span className="spinner"></span>
                <span>{loading ? 'Preparing...' : 'Processing...'}</span>
              </>
            ) : (
              <>
                <LockIcon white />
                <span>Pay ${amount}.00 &nbsp;·&nbsp; Reserve</span>
              </>
            )}
          </button>
          <div className="stripe-secure">
            <LockIcon />
            Your card details are encrypted and processed by Stripe.
          </div>
        </div>
      </div>

      <style>{`
        .stripe-card-element {
          min-height: 48px;
          padding: 15px 14px;
          border: 1px solid var(--pill-border);
          border-radius: 10px;
          background: #fff;
        }
        .stripe-card-element:focus-within {
          border-color: var(--ink);
          box-shadow: 0 0 0 3px rgba(26,26,23,.08);
        }
        .stripe-message,
        .stripe-error {
          font-size: 12.5px;
          line-height: 1.45;
          padding: 11px 13px;
          border-radius: 10px;
        }
        .stripe-message {
          color: var(--muted);
          background: var(--bg);
        }
        .stripe-error {
          color: #8a1f1f;
          background: #fff1f1;
          border: 1px solid #f1c7c7;
        }
        .spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,.3);
          border-top-color: #fff; border-radius: 50%;
          animation: spin .8s linear infinite;
          display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

function LockIcon({ white }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}>
      <path d="M3 5V3.5a3 3 0 016 0V5h.5A1.5 1.5 0 0111 6.5v3A1.5 1.5 0 019.5 11h-7A1.5 1.5 0 011 9.5v-3A1.5 1.5 0 012.5 5H3zm1 0h4V3.5a2 2 0 10-4 0V5z" fill={white ? '#fff' : 'currentColor'} />
    </svg>
  );
}

window.StripePanel = StripePanel;
