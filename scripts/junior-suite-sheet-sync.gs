/**
 * Firebase Realtime Database -> Google Sheets sync for Junior Suite leads.
 *
 * Required Script Properties:
 * - FIREBASE_DB_URL
 * - FIREBASE_CLIENT_EMAIL
 * - FIREBASE_PRIVATE_KEY
 */

const JUNIOR_SUITE_SHEET_NAME = "Junior Suite Leads";
const JUNIOR_SUITE_NODE = "/juniorSuiteLeads.json";
const JUNIOR_SUITE_TRIGGER_FUNCTION = "syncJuniorSuiteLeadsAutomatically";

const JUNIOR_SUITE_HEADERS = [
  "Raw ID",
  "First Name",
  "Last Name",
  "Full Name",
  "Email",
  "Phone",
  "Move Timeline",
  "Why Elysium",
  "Consent",
  "Source",
  "Submitted At"
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Junior Suite Sync")
    .addItem("Sync now", "syncJuniorSuiteLeadsFromMenu")
    .addSeparator()
    .addItem("Enable auto-sync (every 5 min)", "enableJuniorSuiteAutoSync")
    .addItem("Disable auto-sync", "disableJuniorSuiteAutoSync")
    .addToUi();
}

function syncJuniorSuiteLeadsFromMenu() {
  const spreadsheet = getJuniorSuiteSpreadsheet_();
  spreadsheet.toast("Sync started...", "Junior Suite", 5);

  try {
    const count = syncJuniorSuiteLeads();
    spreadsheet.toast(
      count + " lead" + (count === 1 ? "" : "s") + " synced.",
      "Junior Suite",
      5
    );
  } catch (error) {
    SpreadsheetApp.getUi().alert("Junior Suite sync failed: " + error.message);
    throw error;
  }
}

function syncJuniorSuiteLeadsAutomatically() {
  try {
    syncJuniorSuiteLeads();
  } catch (error) {
    console.error("Junior Suite automatic sync failed: " + error.message);
    throw error;
  }
}

function syncJuniorSuiteLeads() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = getJuniorSuiteSpreadsheet_();
    const sheet = getOrCreateJuniorSuiteSheet_(spreadsheet);
    const databaseUrl = getRequiredScriptProperty_("FIREBASE_DB_URL").replace(/\/$/, "");
    const token = getJuniorSuiteAccessToken_();
    const response = UrlFetchApp.fetch(databaseUrl + JUNIOR_SUITE_NODE, {
      method: "get",
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      throw new Error(
        "Firebase returned HTTP " + response.getResponseCode() + ": " + response.getContentText()
      );
    }

    const data = JSON.parse(response.getContentText()) || {};
    const rows = Object.keys(data)
      .map(function(id) {
        return buildJuniorSuiteRow_(id, data[id]);
      })
      .filter(Boolean)
      .sort(function(a, b) {
        return b.createdAt - a.createdAt;
      })
      .map(function(item) {
        return item.row;
      });

    sheet.clearContents();
    sheet.getRange(1, 1, 1, JUNIOR_SUITE_HEADERS.length).setValues([JUNIOR_SUITE_HEADERS]);

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, JUNIOR_SUITE_HEADERS.length).setValues(rows);
      sheet.getRange(2, 11, rows.length, 1).setNumberFormat("dd MMM yyyy hh:mm:ss AM/PM");
    }

    formatJuniorSuiteSheet_(sheet, rows.length);
    SpreadsheetApp.flush();
    return rows.length;
  } finally {
    lock.releaseLock();
  }
}

function buildJuniorSuiteRow_(id, entry) {
  if (!entry || typeof entry !== "object") return null;

  const createdAt = Number(entry.createdAt) || Date.parse(entry.createdAtIso || "") || 0;
  return {
    createdAt: createdAt,
    row: [
      "'" + String(id),
      safeJuniorSuiteCell_(entry.firstName),
      safeJuniorSuiteCell_(entry.lastName),
      safeJuniorSuiteCell_(entry.fullName),
      safeJuniorSuiteCell_(entry.email),
      safeJuniorSuiteCell_(entry.phone),
      formatJuniorSuiteTimeline_(entry.timeline),
      safeJuniorSuiteCell_(entry.why),
      entry.consent === true ? "Yes" : "No",
      safeJuniorSuiteCell_(entry.source),
      createdAt ? new Date(createdAt) : ""
    ]
  };
}

function formatJuniorSuiteTimeline_(timeline) {
  const labels = {
    asap: "As soon as possible (2030 opening)",
    "2030": "Around 2030",
    flexible: "Flexible / Just exploring"
  };
  return labels[timeline] || safeJuniorSuiteCell_(timeline);
}

function safeJuniorSuiteCell_(value) {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function getOrCreateJuniorSuiteSheet_(spreadsheet) {
  return spreadsheet.getSheetByName(JUNIOR_SUITE_SHEET_NAME) ||
    spreadsheet.insertSheet(JUNIOR_SUITE_SHEET_NAME);
}

function getJuniorSuiteSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty("JUNIOR_SUITE_SPREADSHEET_ID");
  if (savedId) return SpreadsheetApp.openById(savedId);

  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!activeSpreadsheet) {
    throw new Error("Open the destination spreadsheet and run Sync now once before enabling auto-sync.");
  }
  properties.setProperty("JUNIOR_SUITE_SPREADSHEET_ID", activeSpreadsheet.getId());
  return activeSpreadsheet;
}

function formatJuniorSuiteSheet_(sheet, rowCount) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, JUNIOR_SUITE_HEADERS.length)
    .setFontWeight("bold")
    .setBackground("#111111")
    .setFontColor("#ffffff");
  sheet.autoResizeColumns(1, JUNIOR_SUITE_HEADERS.length);
  sheet.setColumnWidth(8, 420);

  if (rowCount > 0) {
    sheet.getRange(2, 1, rowCount, JUNIOR_SUITE_HEADERS.length)
      .setVerticalAlignment("top")
      .setWrap(true);
  }
}

function enableJuniorSuiteAutoSync() {
  getJuniorSuiteSpreadsheet_();
  disableJuniorSuiteAutoSync_();
  ScriptApp.newTrigger(JUNIOR_SUITE_TRIGGER_FUNCTION)
    .timeBased()
    .everyMinutes(5)
    .create();
  getJuniorSuiteSpreadsheet_().toast(
    "Automatic sync enabled every 5 minutes.",
    "Junior Suite",
    5
  );
}

function disableJuniorSuiteAutoSync() {
  const removed = disableJuniorSuiteAutoSync_();
  getJuniorSuiteSpreadsheet_().toast(
    removed ? "Automatic sync disabled." : "No automatic sync trigger was active.",
    "Junior Suite",
    5
  );
}

function disableJuniorSuiteAutoSync_() {
  let removed = false;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === JUNIOR_SUITE_TRIGGER_FUNCTION) {
      ScriptApp.deleteTrigger(trigger);
      removed = true;
    }
  });
  return removed;
}

function getRequiredScriptProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error("Missing Script Property: " + name);
  return value;
}

function getJuniorSuiteAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cachedToken = cache.get("JUNIOR_SUITE_FIREBASE_ACCESS_TOKEN");
  if (cachedToken) return cachedToken;

  const clientEmail = getRequiredScriptProperty_("FIREBASE_CLIENT_EMAIL");
  const privateKey = getRequiredScriptProperty_("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const unsignedJwt =
    Utilities.base64EncodeWebSafe(JSON.stringify(header), Utilities.Charset.UTF_8) +
    "." +
    Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8);
  const signature = Utilities.computeRsaSha256Signature(unsignedJwt, privateKey);
  const signedJwt = unsignedJwt + "." + Utilities.base64EncodeWebSafe(signature);
  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt
    },
    muteHttpExceptions: true
  });
  const tokenData = JSON.parse(response.getContentText());

  if (response.getResponseCode() !== 200 || !tokenData.access_token) {
    throw new Error("Firebase access token failed: " + response.getContentText());
  }

  cache.put("JUNIOR_SUITE_FIREBASE_ACCESS_TOKEN", tokenData.access_token, 3300);
  return tokenData.access_token;
}
