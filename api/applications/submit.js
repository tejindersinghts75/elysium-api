import { IncomingForm } from "formidable";

export const config = {
  api: { bodyParser: false },
};

function normalizeSelect(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  if (v === "confirmed") return "Confirmed";
  return value;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  // ✅ Memory chunks (no stream hangs)
  const resumeBufferChunks = [];

  const form = new IncomingForm({
    maxFieldsSize: 20 * 1024 * 1024,
    maxFileSize: 10 * 1024 * 1024,
    keepExtensions: true,
  });

  // ✅ Vercel-optimized: direct memory buffer
  form.fileWriteStreamHandler = () => {
    const Writable = require('stream').Writable;
    return new Writable({
      write(chunk, _, cb) {
        resumeBufferChunks.push(chunk);
        cb();
      },
      destroy() {
        resumeBufferChunks.length = 0;
      }
    });
  };

  try {
    const [fields, files] = await form.parse(req);
    console.log("✅ Fields:", Object.keys(fields));
    console.log("✅ Files:", Object.keys(files || {}));

    const f = {};
    Object.entries(fields).forEach(([key, value]) => {
      f[key] = Array.isArray(value) ? value[0] : value;
    });

    const airtableFields = {
      firstname: f.firstname, lastname: f.lastname, email: f.email, country: f.country,
      phone: f.phone, location: f.location, company_name: f.company_name, title: f.title,
      start_month: f.start_month, start_year: f.start_year, end_month: f.end_month, end_year: f.end_year,
      current_role: !!f.current_role, school: f.school, degree: f.degree, discipline: f.discipline,
      linkedin_url: f.linkedin_url,
      age_18: normalizeSelect(f.age_18), prev_coinbase: normalizeSelect(f.prev_coinbase),
      referral_source: f.referral_source, privacy_notice: normalizeSelect(f.privacy_notice),
      ai_tools: normalizeSelect(f.ai_tools), work_authorized: normalizeSelect(f.work_authorized),
      visa_sponsorship: normalizeSelect(f.visa_sponsorship),
      gov_official: f.gov_official, relative_gov: f.relative_gov,
      owns_crypto: normalizeSelect(f.owns_crypto), coinbase_mission: f.coinbase_mission,
      conflict_interest: normalizeSelect(f.conflict_interest), referred_client: normalizeSelect(f.referred_client),
      gender: f.gender, latino_hispanic: normalizeSelect(f.latino_hispanic),
      veteran_status: f.veteran_status, disability_status: f.disability_status,
      submitted_at: new Date().toISOString(),
    };

    // ========== RESUME UPLOAD ==========
    if (files.resume && resumeBufferChunks.length > 0) {
      const buffer = Buffer.concat(resumeBufferChunks);
      const fileInfo = Array.isArray(files.resume) ? files.resume[0] : files.resume;

      console.log("📁 Buffer:", buffer.length, "bytes");

      const uploadRes = await fetch(
        `https://content.airtable.com/v0/bases/${process.env.AIRTABLE_BASE}/attachments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: fileInfo.originalFilename || 'resume.pdf',
            contentType: fileInfo.mimetype || "application/pdf",
            file: buffer.toString("base64"),
          }),
        }
      );

      const uploadData = await uploadRes.json();
      console.log("📤 Airtable upload:", uploadData);

      if (uploadRes.ok) {
        airtableFields.resume = [{ id: uploadData.id }];
      } else {
        console.error("Resume upload failed:", uploadData);
      }
    } else {
      console.log("ℹ️ No resume");
    }

    // ========== AIRTABLE RECORD ==========
    console.log("🌐 Creating record...");
    const createRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE}/${encodeURIComponent(process.env.AIRTABLE_TABLE)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: [{ fields: airtableFields }] }),
      }
    );

    const result = await createRes.json();
    console.log("✅ Record created:", result);

    if (!createRes.ok) {
      return res.status(400).json({ error: "Airtable failed", details: result });
    }

    return res.status(200).json({
      success: true,
      recordId: result.records[0].id,
      message: "Application submitted successfully!"
    });

  } catch (error) {
    console.error("❌ Error:", error);

    if (error.code === "MAX_FILE_SIZE") {
      return res.status(400).json({ error: "File too large (max 10MB)" });
    }
    if (error.httpCode === 400) {
      return res.status(400).json({ error: "Invalid form data" });
    }

    return res.status(500).json({
      error: "Server error",
      details: error.message,
      code: error.code
    });
  }
}
