import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { BrevoClient } from '@getbrevo/brevo';

const existingApp = getApps().find(app => app.name === 'junior-suite');
const firebaseApp = existingApp || initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.FIREBASE_URL,
}, 'junior-suite');

const db = getDatabase(firebaseApp);
const validTimelines = new Set(['', 'asap', '2030', 'flexible']);
const validSources = new Set(['jr-suite', 'experiential-real-estate']);

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function addJuniorSuiteLeadToBrevo(lead) {
  if (!process.env.BREVO_API_KEY) {
    console.warn('Junior Suite Brevo sync skipped: BREVO_API_KEY is not configured.');
    return { skipped: true, reason: 'missing_api_key' };
  }

  const listId = Number(process.env.BREVO_JUNIOR_SUITE_LIST_ID || '');
  const listIds = Number.isInteger(listId) && listId > 0 ? [listId] : undefined;
  const client = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });

  const contactResponse = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: lead.email,
      attributes: {
        FIRSTNAME: lead.firstName,
        LASTNAME: lead.lastName,
        PHONE: lead.phone,
        LEAD_SOURCE: lead.source,
        UNIT_TYPE: 'Junior Suite',
        MOVE_TIMELINE: lead.timeline,
        JR_SUITE_WHY: lead.why,
        JR_SUITE_RESERVED_AT: lead.createdAtIso,
      },
      ...(listIds ? { listIds } : {}),
      updateEnabled: true,
    }),
  });

  if (!contactResponse.ok) {
    const message = await contactResponse.text();
    throw new Error(`Brevo contact sync failed (${contactResponse.status}): ${message}`);
  }

  await client.event.createEvent({
    event_name: 'junior_suite_reserved',
    identifiers: {
      email_id: lead.email,
    },
    contact_properties: {
      FIRSTNAME: lead.firstName,
      LASTNAME: lead.lastName,
      LEAD_SOURCE: lead.source,
      UNIT_TYPE: 'Junior Suite',
      MOVE_TIMELINE: lead.timeline,
    },
    event_properties: {
      firebase_lead_id: lead.id,
      reserved_at: lead.createdAtIso,
    },
  });

  return { success: true, listIds: listIds || [] };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const firstName = clean(body.firstName, 80);
    const lastName = clean(body.lastName, 80);
    const email = clean(body.email, 254).toLowerCase();
    const phone = clean(body.phone, 40);
    const timeline = clean(body.timeline, 20);
    const why = clean(body.why, 1500);
    const requestedSource = clean(body.source, 80);
    const source = validSources.has(requestedSource) ? requestedSource : 'jr-suite';

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (body.consent !== true) {
      return res.status(400).json({ error: 'Please accept the privacy policy and terms of use.' });
    }
    if (!validTimelines.has(timeline)) {
      return res.status(400).json({ error: 'Please select a valid timeframe.' });
    }

    const leadRef = db.ref('juniorSuiteLeads').push();
    const createdAt = Date.now();
    const createdAtIso = new Date(createdAt).toISOString();
    const lead = {
      id: leadRef.key,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email,
      phone,
      timeline,
      why,
      consent: true,
      source,
      createdAt,
      createdAtIso,
    };

    await leadRef.set(lead);

    try {
      const brevo = await addJuniorSuiteLeadToBrevo(lead);
      await leadRef.child('integrations/brevo').set({
        ...brevo,
        syncedAt: Date.now(),
        syncedAtIso: new Date().toISOString(),
      });
    } catch (brevoError) {
      console.error('Junior Suite Brevo sync failed:', brevoError.message || brevoError);
      await leadRef.child('integrations/brevo').set({
        success: false,
        error: brevoError.message || 'Unknown Brevo error',
        failedAt: Date.now(),
        failedAtIso: new Date().toISOString(),
      });
    }

    return res.status(201).json({ success: true, id: leadRef.key });
  } catch (error) {
    console.error('Junior Suite form submission failed:', error);
    return res.status(500).json({ error: 'Unable to save your reservation right now. Please try again.' });
  }
}
