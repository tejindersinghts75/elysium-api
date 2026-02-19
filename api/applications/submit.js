import formidable from "formidable";
import fs from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";

export const config = {
  api: { bodyParser: false },
};

export const maxDuration = 60;

/* ================= FIREBASE ADMIN INIT ================= */

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // important
});

const db = getDatabase(app);
const bucket = getStorage(app).bucket();

/* ================= HANDLER ================= */

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  try {
    /* ========= PARSE FORM ========= */

    const form = formidable({
      multiples: false,
      maxFileSize: 10 * 1024 * 1024,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);

    const data = {};
    Object.keys(fields).forEach((key) => {
      data[key] = Array.isArray(fields[key])
        ? fields[key][0]
        : fields[key];
    });

    /* ========= UPLOAD PDF ========= */

    let resumeUrl = null;

    if (files.resume) {
      const file = Array.isArray(files.resume)
        ? files.resume[0]
        : files.resume;

      const filePath = file.filepath;
      const fileName = `resumes/${Date.now()}-${file.originalFilename}`;

      // upload to firebase storage
      await bucket.upload(filePath, {
        destination: fileName,
        metadata: {
          contentType: file.mimetype,
        },
      });

      // make public (simple access)
      await bucket.file(fileName).makePublic();

      resumeUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

      // cleanup temp file
      fs.unlinkSync(filePath);
    }

    /* ========= SAVE TO REALTIME DB ========= */

    const applicationData = {
      ...data,
      resumeUrl,
      createdAt: Date.now(),
    };

    const newRef = db.ref("applications").push();
    await newRef.set(applicationData);

    /* ========= RESPONSE ========= */

    return res.status(200).json({
      success: true,
      id: newRef.key,
      resumeUrl,
      message: "Application saved",
    });

  } catch (error) {
    console.error("UPLOAD ERROR:", error);

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large" });
    }

    return res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
}
