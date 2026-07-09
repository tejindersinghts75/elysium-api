const SHEET_NAME = "Sheet1";
const MAIN_NODE = "/Mainformdata.json";
const USER_NODE = "/users/";

const HEADER = [
  "Raw ID",
  "Name",
  "Email",
  "Mobile",
  "City",
  "Profession",
  "Income",
  "Household",
  "Why",
  "ReferredBy",
  "Ref First Name",
  "Ref Last Name",
  "Ref Email",
  "TimeStamp",
  "Payment Status",
  "Amount",
  "Add on",
  "Choose Term",
  "Dinning Packages",
  "Select Application",
  "Tesla Options",
  "Unit",
  "Founder Backer",
  "Backer Amount",
  "Backer Payment Status",
  "Builder Backer Amount",
  "Installment Amount",
  "Installments Remaining",
  "Total Builder Amount",
  "Top City",
  "Move Timeline",
  "Interested In",
  "Community Kind",
  "View",
  "Occupants",
  "Founder Backer Interest",
  "Early Interest",
  "Funnel Version",
  "Created At",
  "Updated At",
  "Price Per Person",
  "Price Display",
  "Monthly Household",
  "Monthly Per Person",
  "Monthly Credits",
  "Effective Monthly",
  "Annual Renewal",
  "Payment Funnel Version",
  "Submitted At",
  "Stripe Payment Intent ID",
  "Stripe Customer ID",
  "Stripe Processed At"
];

function syncApplicationsFromMenu() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Sync started...", "Firebase Applications", 5);

  fetchFirebaseData();

  SpreadsheetApp.flush();
  ss.toast("Sync completed successfully.", "Firebase Applications", 5);
}
function fetchFirebaseData() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const token = getAccessToken();
    const dbUrl = PropertiesService.getScriptProperties().getProperty("FIREBASE_DB_URL");
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

    if (!sheet) {
      throw new Error("Sheet not found: " + SHEET_NAME);
    }

    const response = UrlFetchApp.fetch(dbUrl + MAIN_NODE, {
      headers: {
        Authorization: "Bearer " + token
      },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      throw new Error(response.getContentText());
    }

    const data = JSON.parse(response.getContentText());

    // Clear old sheet data completely
    sheet.clearContents();

    // Add fresh header
    sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
    sheet.setFrozenRows(1);

    if (!data) {
      Logger.log("No Firebase data found.");
      return;
    }

    const rows = [];

    Object.keys(data).forEach(rawId => {
      const id = String(rawId).trim();
      const rowData = buildRowData(id, data[rawId], token, dbUrl);

      if (rowData) {
        rows.push(rowData);
      }
    });

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, HEADER.length).setValues(rows);
    }

    Logger.log("✅ Sheet fully replaced with Firebase data.");

  } catch (error) {
    Logger.log("❌ Sync failed: " + error.message);
    SpreadsheetApp.getUi().alert("Sync failed: " + error.message);
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

function buildRowData(id, entry, token, dbUrl) {
  if (!entry) return null;

  const payment = entry.PaymentFormData || {};
  const stripePayment = entry.stripePayment || {};

  const name = safeSheetCell_(entry.name);
  const email = safeSheetCell_(entry.email);
  const mobile = safeSheetCell_(entry.mobile);
  const profession = safeSheetCell_(entry.profession);
  const income = safeSheetCell_(entry.income);
  const household = safeSheetCell_(entry.household);
  const city = safeSheetCell_(entry.selectedCity);
  const why = safeSheetCell_(entry.why);
  const referredBy = safeSheetCell_(entry.referredBy);
  const formUserUid = safeSheetCell_(entry.uid);

  const paymentStatus = safeSheetCell_(stripePayment.paymentStatus);
  const amount = stripePayment.amount || stripePayment.amountPaid || stripePayment.totalAmount || "";
  const addons = stripePayment.addonAmount || "";

  const chooseterms = safeSheetCell_(payment.chooseterm);
  const diningPackage = safeSheetCell_(payment.diningpackage);
  const selectApplication = safeSheetCell_(
    payment.selectapplicaton ||
    payment.selectapplication ||
    entry.selectapplicaton ||
    entry.selectapplication
  );
  const teslaOptions = safeSheetCell_(payment.teslaoptions);
  const founderMember = formatBoolean_(entry.founderBacker || entry.isFounder);

  const backerAmount = entry?.backerPayment?.amount || "";
  const backerPaymentStatus = safeSheetCell_(entry?.backerPayment?.paymentStatus);

  const builderBackerAmount = entry?.builderPlan?.backerAmount || "";
  const installmentAmount = entry?.builderPlan?.installmentAmount || "";
  const installmentsRemaining = entry?.builderPlan?.installmentsRemaining || "";
  const totalBuilderAmount = entry?.builderPlan?.totalBuilderAmount || "";

  let unit = "";
  const unitData = Array.isArray(payment?.priceperfoot) ? payment.priceperfoot : payment?.unit;

  if (Array.isArray(unitData)) {
    const selectedUnit = unitData.find(item => item?.selected === "selected");
    unit = selectedUnit?.text || "";
  }

  const topCity = safeSheetCell_(entry.topCity || payment.topCity);
  const moveTimeline = safeSheetCell_(entry.moveTimeline || payment.moveTimeline);
  const interestedIn = formatList_(entry.interestedIn || payment.interestedIn);
  const communityKind = formatList_(entry.communityKind || payment.communityKind);
  const view = safeSheetCell_(entry.unit || payment.unit);
  const occupants = entry.occupants || payment.occupants || "";
  const founderBackerInterest = formatBoolean_(entry.founderBacker || payment.founderBacker);
  const earlyInterest = formatBoolean_(entry.earlyInterest || payment.earlyInterest);
  const funnelVersion = safeSheetCell_(entry.funnelVersion);
  const createdAt = formatFirebaseDate(entry.createdAt);
  const updatedAt = formatFirebaseDate(entry.updatedAt);
  const pricePerPerson = payment.monthlyPerPerson || "";
  const priceDisplay = safeSheetCell_(payment.priceperfootDisplay);
  const monthlyHousehold = payment.monthlyHousehold || "";
  const monthlyPerPerson = payment.monthlyPerPerson || "";
  const monthlyCredits = payment.monthlyCredits || "";
  const effectiveMonthly = payment.effectiveMonthly || "";
  const annualRenewal = payment.annualRenewal || "";
  const paymentFunnelVersion = safeSheetCell_(payment.funnelVersion);
  const submittedAt = formatFirebaseDate(payment.submittedAt);
  const stripePaymentIntentId = safeSheetCell_(stripePayment.stripePaymentIntentId);
  const stripeCustomerId = safeSheetCell_(entry.stripeCustomerId || stripePayment.customerId);
  const stripeProcessedAt = formatFirebaseDate(stripePayment.processedAt);

  const details = fetchUserDetailsSync(referredBy, formUserUid, token, dbUrl);

  return [
    "'" + id,
    name,
    email,
    mobile,
    city,
    profession,
    income,
    household,
    why,
    referredBy,
    details.refFirst,
    details.refLast,
    details.refEmail,
    details.userSignupTime,
    paymentStatus,
    amount,
    addons,
    chooseterms,
    diningPackage,
    selectApplication,
    teslaOptions,
    unit,
    founderMember,
    backerAmount,
    backerPaymentStatus,
    builderBackerAmount,
    installmentAmount,
    installmentsRemaining,
    totalBuilderAmount,
    topCity,
    moveTimeline,
    interestedIn,
    communityKind,
    view,
    occupants,
    founderBackerInterest,
    earlyInterest,
    funnelVersion,
    createdAt,
    updatedAt,
    pricePerPerson,
    priceDisplay,
    monthlyHousehold,
    monthlyPerPerson,
    monthlyCredits,
    effectiveMonthly,
    annualRenewal,
    paymentFunnelVersion,
    submittedAt,
    stripePaymentIntentId,
    stripeCustomerId,
    stripeProcessedAt
  ];
}

function safeSheetCell_(value) {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function formatList_(value) {
  if (Array.isArray(value)) {
    return value.map(safeSheetCell_).filter(Boolean).join(", ");
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .filter(key => value[key])
      .map(safeSheetCell_)
      .join(", ");
  }

  return safeSheetCell_(value);
}

function formatBoolean_(value) {
  if (value === true || value === "true" || value === 1 || value === "1") return "Yes";
  if (value === false || value === "false" || value === 0 || value === "0") return "No";
  return "";
}

function fetchUserDetailsSync(referredBy, formUserUid, token, dbUrl) {
  let refFirst = "";
  let refLast = "";
  let refEmail = "";
  let userSignupTime = "";

  if (referredBy) {
    try {
      const userRes = UrlFetchApp.fetch(dbUrl + USER_NODE + referredBy + ".json", {
        headers: {
          Authorization: "Bearer " + token
        },
        muteHttpExceptions: true
      });

      const user = JSON.parse(userRes.getContentText());

      if (user) {
        refFirst = user.firstname || "";
        refLast = user.lastname || "";
        refEmail = user.email || "";

        if (user.createdAt) {
          userSignupTime = formatFirebaseDate(user.createdAt);
        }
      }
    } catch (e) {
      Logger.log("Referral fetch failed: " + referredBy);
    }
  }

  if (formUserUid && !userSignupTime) {
    try {
      const userRes = UrlFetchApp.fetch(dbUrl + USER_NODE + formUserUid + ".json", {
        headers: {
          Authorization: "Bearer " + token
        },
        muteHttpExceptions: true
      });

      const user = JSON.parse(userRes.getContentText());

      if (user?.createdAt) {
        userSignupTime = formatFirebaseDate(user.createdAt);
      }
    } catch (e) {
      Logger.log("User timestamp fetch failed: " + formUserUid);
    }
  }

  return {
    refFirst,
    refLast,
    refEmail,
    userSignupTime
  };
}

function formatFirebaseDate(value) {
  try {
    return Utilities.formatDate(
      new Date(value),
      "Asia/Kolkata",
      "dd MMM yyyy hh:mm:ss a"
    );
  } catch (e) {
    return value || "";
  }
}

function getAccessToken() {
  const props = PropertiesService.getScriptProperties();

  const clientEmail = props.getProperty("FIREBASE_CLIENT_EMAIL");
  const privateKey = props.getProperty("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const jwt =
    Utilities.base64EncodeWebSafe(JSON.stringify(header)) +
    "." +
    Utilities.base64EncodeWebSafe(JSON.stringify(payload));

  const signature = Utilities.computeRsaSha256Signature(jwt, privateKey);

  const signedJwt =
    jwt +
    "." +
    Utilities.base64EncodeWebSafe(signature);

  const tokenResponse = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt
    },
    muteHttpExceptions: true
  });

  const tokenData = JSON.parse(tokenResponse.getContentText());

  if (!tokenData.access_token) {
    throw new Error("Firebase access token failed: " + tokenResponse.getContentText());
  }

  return tokenData.access_token;
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu("🔄 Firebase Applications")
    .addItem("Sync Applications", "syncApplicationsFromMenu")
    .addToUi();
}
