import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false, // REQUIRED for file upload
  },
};

export default async function handler(req, res) {

  // Allow CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const form = formidable({ multiples: false });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    // -----------------------------
    // 1️⃣ Prepare Airtable fields
    // -----------------------------
    const airtableFields = {};

    for (const key in fields) {
      airtableFields[key] = Array.isArray(fields[key])
        ? fields[key][0]
        : fields[key];
    }

    airtableFields.submitted_at = new Date().toISOString();

    // -----------------------------
    // 2️⃣ Create Airtable record
    // -----------------------------
    const recordRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE}/${process.env.AIRTABLE_TABLE}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: airtableFields }),
      }
    );

    const recordData = await recordRes.json();

    if (!recordRes.ok) {
      console.error(recordData);
      return res.status(400).json(recordData);
    }

    const recordId = recordData.id;

    // -----------------------------
    // 3️⃣ Upload PDF to Airtable attachment
    // -----------------------------
    if (files.resume) {
      const file = Array.isArray(files.resume)
        ? files.resume[0]
        : files.resume;

      const buffer = fs.readFileSync(file.filepath);

      await fetch(
        `https://content.airtable.com/v0/${process.env.AIRTABLE_BASE}/${recordId}/resume/uploadAttachment`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
            "Content-Type": file.mimetype || "application/pdf",
          },
          body: buffer,
        }
      );
    }

    // -----------------------------
    // 4️⃣ Success response
    // -----------------------------
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: err.message });
  }
}
