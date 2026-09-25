import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const databasePath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "study-platform.sqlite");
if (fs.existsSync(databasePath)) {
  const db = new Database(databasePath, { readonly: true });
  try {
    const backupPath = `${databasePath}.backup-${Date.now()}`;
    await db.backup(backupPath);
    fs.chmodSync(backupPath, 0o600);
    console.log(`Database backup: ${backupPath}`);
  } finally { db.close(); }
} else {
  console.log("Database does not exist; skipping backup.");
}
