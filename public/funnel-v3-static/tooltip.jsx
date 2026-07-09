// ============================================================================
// TOOLTIP — small "i" badge that opens an information popover on hover/click.
// - Desktop: hover (with small delay) to open, click to pin.
// - Touch: tap to open, tap outside to close.
// Positions itself smartly above or below depending on viewport room.
// ============================================================================

function InfoTip({ label, children, size = 'sm', placement = 'auto', inline = true }) {
  const [open, setOpen] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0, side: 'bottom' });
  const triggerRef = React.useRef(null);
  const popRef = React.useRef(null);
  const hoverTimer = React.useRef(null);

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current || !popRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const p = popRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 10;

    // Prefer above if there's room, else below
    const spaceBelow = vh - t.bottom;
    const spaceAbove = t.top;
    const side = placement === 'top' || (placement === 'auto' && spaceAbove > p.height + 20 && spaceBelow < p.height + 20)
      ? 'top' : 'bottom';

    let top = side === 'top' ? t.top - p.height - gap : t.bottom + gap;
    // Horizontally center on trigger, clamp to viewport
    let left = t.left + t.width / 2 - p.width / 2;
    left = Math.max(12, Math.min(vw - p.width - 12, left));

    setPos({ top: top + window.scrollY, left: left + window.scrollX, side });
  }, [placement]);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updatePosition]);

  // Outside-click closes pinned tooltips
  React.useEffect(() => {
    if (!pinned) return;
    const onDoc = (e) => {
      if (!popRef.current || !triggerRef.current) return;
      if (popRef.current.contains(e.target) || triggerRef.current.contains(e.target)) return;
      setPinned(false);
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [pinned]);

  const handleEnter = (e) => {
    e.stopPropagation();
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(true), 80);
  };
  const handleLeave = (e) => {
    e.stopPropagation();
    if (pinned) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(false), 120);
  };
  const handleClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (pinned) {
      setPinned(false);
      setOpen(false);
    } else {
      setPinned(true);
      setOpen(true);
    }
  };

  const dotClass = `info-dot ${size === 'lg' ? 'lg' : ''} ${open ? 'active' : ''}`;
  const Wrapper = inline ? 'span' : 'span';

  return (
    <Wrapper className="info-tip-wrap" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        type="button"
        className={dotClass}
        ref={triggerRef}
        onClick={handleClick}
        aria-label={label || 'More information'}
        aria-expanded={open}
      >
        i
      </button>
      {open && ReactDOM.createPortal(
        <div
          ref={popRef}
          className={`info-pop ${pos.side}`}
          style={{ top: pos.top, left: pos.left, opacity: pos.top === 0 ? 0 : 1 }}
          onMouseEnter={() => clearTimeout(hoverTimer.current)}
          onMouseLeave={handleLeave}
          role="tooltip"
        >
          <div className="info-pop-inner">{children}</div>
          <div className="info-pop-arrow"></div>
        </div>,
        document.body
      )}
    </Wrapper>
  );
}

window.InfoTip = InfoTip;
