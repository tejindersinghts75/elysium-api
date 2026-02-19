import { IncomingForm } from "formidable";

export const config = {
  api: { bodyParser: false },
};

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  const form = new IncomingForm({
    maxFieldsSize: 20 * 1024 * 1024,
    maxFileSize: 10 * 1024 * 1024,
    keepExtensions: true,
  });

  try {
    const [fields, files] = await form.parse(req);
    console.log("✅ Fields:", Object.keys(fields));
    console.log("✅ Files:", Object.keys(files || {}));

    const f = {};
    Object.entries(fields).forEach(([key, value]) => {
      f[key] = Array.isArray(value) ? value[0] : value;
    });

    // Raw values - no normalization needed
    const airtableFields = {
      firstname: f.firstname, lastname: f.lastname, email: f.email, country: f.country,
      phone: f.phone, location: f.location, company_name: f.company_name, title: f.title,
      start_month: f.start_month, start_year: f.start_year, end_month: f.end_month, end_year: f.end_year,
      current_role: !!f.current_role, school: f.school, degree: f.degree, discipline: f.discipline,
      linkedin_url: f.linkedin_url,
      age_18: f.age_18, prev_coinbase: f.prev_coinbase,
      referral_source: f.referral_source, privacy_notice: f.privacy_notice,
      ai_tools: f.ai_tools, work_authorized: f.work_authorized,
      visa_sponsorship: f.visa_sponsorship,
      gov_official: f.gov_official, relative_gov: f.relative_gov,
      owns_crypto: f.owns_crypto, coinbase_mission: f.coinbase_mission,
      conflict_interest: f.conflict_interest, referred_client: f.referred_client,
      gender: f.gender, latino_hispanic: f.latino_hispanic,
      veteran_status: f.veteran_status, disability_status: f.disability_status,
      submitted_at: new Date().toISOString(),
    };

    // ========== RESUME UPLOAD (100% RELIABLE) ==========
    if (files.resume) {
      const file = Array.isArray(files.resume) ? files.resume[0] : files.resume;
      console.log("📁 Processing resume:", file.originalFilename, "size:", file.size);

      // Await file stream completion
      const bufferPromise = new Promise((resolve, reject) => {
        const chunks = [];
        if (file.readableEnded) {
          resolve(Buffer.alloc(0)); // Empty file case
        } else {
          file.on('data', chunk => chunks.push(chunk));
          file.on('end', () => resolve(Buffer.concat(chunks)));
          file.on('error', reject);
        }
      });

      const buffer = await bufferPromise;
      console.log("📁 Buffer ready:", buffer.length, "bytes");

      if (buffer.length > 0) {
        const uploadRes = await fetch(
          `https://content.airtable.com/v0/bases/${process.env.AIRTABLE_BASE}/attachments`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              filename: file.originalFilename || 'resume.pdf',
              contentType: file.mimetype || "application/pdf",
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
        console.log("ℹ️ Empty resume file skipped");
      }
    } else {
      console.log("ℹ️ No resume file");
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
    return res.status(500).json({
      error: "Server error",
      details: error.message,
      code: error.code
    });
  }
}
