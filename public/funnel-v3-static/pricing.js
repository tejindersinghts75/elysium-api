// ============================================================================
// ELYSIUM PRICING LOGIC
// Single source of truth for the calculator.
// ----------------------------------------------------------------------------
// Standard Membership  = unit_rent + ($499 * occupants) + tesla + dining
//                        (+ $599/yr annual renewal — shown as footnote)
//                        (Founder Backer waives the FIRST person's $499 for life)
//                        (10% rebate is earned back as credits — shown as line)
//
// Access Ownership     = $0 unit + ($499 * occupants) + tesla + dining
//                        (Founder Backer waives the FIRST person's $499, limited time)
//                        (+ one-time TBD token down payment — shown as separate line)
//
// Traditional Ownership = $599/mo household fee, NO per-person dues
//                         (perks like meals work differently)
//                         (+ unit purchase price TBD)
// ============================================================================

window.ElysiumPricing = (function () {
  const UNIT_FEES = {
    studio: 1925,
    studioLoft: 1925,
    "1br": 2530,
    "2br": 3135,
  };

  const TESLA_FEES = {
    "4h": 0,
    "10h": 199,
    "20h": 399,
  };

  const DINING_FEES = {
    standard: 0,
    expanded: 0, // TBD — flag separately for display
  };

  const PER_PERSON = 499;
  const ANNUAL_RENEWAL = 599;
  const TRAD_HOUSEHOLD = 599;
  const REBATE_RATE = 0.10;

  function calculate(s) {
    const {
      unit,
      tesla,
      dining,
      occupants = 1,
      membership,       // standard | access | traditional | undefined
      founderBacker = false,
    } = s;

    // Nothing selected yet — return a zeroed shape so the UI can render blanks
    // instead of a phantom Studio+Standard number.
    const ready = !!(unit && membership);
    if (!ready) {
      return {
        ready: false,
        householdFee: 0, householdAfterRebate: 0, perPersonTotal: 0,
        teslaFee: 0, diningFee: 0, addOns: 0, rebate: 0,
        monthlyHousehold: 0, monthlyPerPerson: 0, effectiveMonthly: 0,
        occupants, annualRenewal: ANNUAL_RENEWAL,
        diningTBD: dining === "expanded",
        ownershipTBD: false,
        lines: {
          unitLabel: unit ? UNIT_LABELS[unit] : null,
          teslaLabel: tesla ? TESLA_LABELS[tesla] : null,
          diningLabel: dining ? DINING_LABELS[dining] : null,
        },
      };
    }

    const unitFee = UNIT_FEES[unit] || 0;
    const teslaFee = tesla ? (TESLA_FEES[tesla] || 0) : 0;
    const diningFee = dining ? (DINING_FEES[dining] || 0) : 0;

    // ---- Household fee (the only thing the 10% rebate applies to) ----
    let householdFee;
    if (membership === "standard") householdFee = unitFee;
    else if (membership === "access") householdFee = 0;
    else householdFee = TRAD_HOUSEHOLD; // traditional

    // Rebate applies ONLY to the household fee and is earned back as credits.
    // It should not reduce the amount due in the monthly estimate.
    const rebate = membership === "traditional" ? 0 : householdFee * REBATE_RATE;
    const householdAfterRebate = householdFee - rebate;

    // ---- Per-person fee (founder backer waives the first person on standard & access) ----
    let perPersonTotal;
    if (membership === "traditional") {
      perPersonTotal = 0;
    } else {
      const billablePeople = founderBacker
        ? Math.max(0, occupants - 1)
        : occupants;
      perPersonTotal = billablePeople * PER_PERSON;
    }

    // ---- Add-ons (tesla / dining) — treated as household-level extras, not per-person ----
    const addOns = teslaFee + diningFee;

    // ---- Totals ----
    const monthlyHousehold = householdFee + perPersonTotal + addOns;
    const effectiveMonthly = householdAfterRebate + perPersonTotal + addOns;
    // Per-person share: divide household total by number of occupants
    const monthlyPerPerson = occupants > 0 ? monthlyHousehold / occupants : monthlyHousehold;

    return {
      ready: true,
      householdFee,             // gross, before rebate
      householdAfterRebate,     // after 10% credit
      perPersonTotal,           // sum of $499/person dues
      teslaFee,
      diningFee,
      addOns,
      rebate,                   // dollars rebated (in credits)
      monthlyHousehold,         // total monthly for entire household
      monthlyPerPerson,         // per-person share
      effectiveMonthly,           // after credits, for supporting copy only
      occupants,
      annualRenewal: ANNUAL_RENEWAL,
      diningTBD: dining === "expanded",
      ownershipTBD: membership === "access" || membership === "traditional",
      lines: {
        unitLabel: UNIT_LABELS[unit],
        teslaLabel: TESLA_LABELS[tesla],
        diningLabel: DINING_LABELS[dining],
      },
    };
  }

  const UNIT_LABELS = {
    studio: "Studio",
    studioLoft: "Studio Loft",
    "1br": "1 Bedroom",
    "2br": "2 Bedroom",
  };
  const TESLA_LABELS = {
    "4h": "4 hours/day",
    "10h": "10 hours/day",
    "20h": "20 hours/day",
  };
  const DINING_LABELS = {
    standard: "Standard (2 meals/day)",
    expanded: "Expanded — Premium",
  };

  function fmt(n) {
    return "$" + Math.round(n).toLocaleString();
  }

  // Format that shows cents only when the number isn't whole
  function fmtSmart(n) {
    const rounded = Math.round(n * 100) / 100;
    const isWhole = rounded === Math.round(rounded);
    return "$" + rounded.toLocaleString(undefined, {
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }

  return {
    calculate,
    fmt,
    fmtSmart,
    UNIT_FEES,
    TESLA_FEES,
    PER_PERSON,
    ANNUAL_RENEWAL,
    UNIT_LABELS,
    TESLA_LABELS,
    DINING_LABELS,
  };
})();
