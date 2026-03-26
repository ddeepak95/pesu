import admin from "firebase-admin";

let initialized = false;

/**
 * Initialize Firebase Admin SDK (singleton).
 * Mirrors the Python backend pattern in pesu-server/firebase_storage.py.
 * Uses FIREBASE_SERVICE_ACCOUNT_BASE64 and FIREBASE_STORAGE_BUCKET env vars.
 */
function ensureInitialized() {
  if (initialized) return;

  const base64Cred = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const bucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!base64Cred) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable is not set",
    );
  }
  if (!bucket) {
    throw new Error(
      "FIREBASE_STORAGE_BUCKET environment variable is not set",
    );
  }

  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(
      Buffer.from(base64Cred, "base64").toString("utf-8"),
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: bucket,
    });
  }

  initialized = true;
}

export function getStorageBucket() {
  ensureInitialized();
  return admin.storage().bucket();
}
