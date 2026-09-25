import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import type { LlmKeyStatus, UserProfile } from "@study-platform/shared";
import { HttpError, NotFoundError, UserError } from "../errors.js";

type Credential = {
  ciphertext: string; nonce: string; auth_tag: string; encryption_version: number;
  last_four: string; updated_at: string;
};

export class Accounts {
  private readonly key: Buffer;
  constructor(private readonly db: Database.Database, encryptionKey: string) {
    if (!/^[a-f\d]{64}$/i.test(encryptionKey)) throw new Error("LLM_KEY_ENCRYPTION_SECRET must be 32 bytes encoded as 64 hexadecimal characters.");
    this.key = Buffer.from(encryptionKey, "hex");
  }

  keyStatus(userId: string): LlmKeyStatus {
    const row = this.db.prepare("SELECT last_four, updated_at FROM user_llm_credentials WHERE user_id = ?").get(userId) as Pick<Credential, "last_four" | "updated_at"> | undefined;
    return { configured: Boolean(row), lastFour: row?.last_four ?? null, updatedAt: row ? `${row.updated_at.replace(" ", "T")}Z` : null };
  }

  profile(userId: string): UserProfile {
    const user = this.db.prepare('SELECT id, email FROM "user" WHERE id = ?').get(userId) as Pick<UserProfile, "id" | "email"> | undefined;
    if (!user) throw new NotFoundError("User not found.");
    return { ...user, llmKey: this.keyStatus(userId) };
  }

  saveKey(userId: string, value: unknown): void {
    if (typeof value !== "string" || value.trim().length < 10 || value.trim().length > 1024 || /\s/.test(value.trim())) throw new UserError("Enter a valid OpenAI API key.");
    const key = value.trim();
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(`${userId}:openai:1`));
    const ciphertext = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
    this.db.prepare(`INSERT INTO user_llm_credentials (user_id, provider, ciphertext, nonce, auth_tag, encryption_version, last_four)
      VALUES (?, 'openai', ?, ?, ?, 1, ?)
      ON CONFLICT(user_id) DO UPDATE SET ciphertext=excluded.ciphertext, nonce=excluded.nonce,
      auth_tag=excluded.auth_tag, encryption_version=excluded.encryption_version, last_four=excluded.last_four, updated_at=datetime('now')`)
      .run(userId, ciphertext.toString("base64"), nonce.toString("base64"), cipher.getAuthTag().toString("base64"), key.slice(-4));
  }

  removeKey(userId: string): void { this.db.prepare("DELETE FROM user_llm_credentials WHERE user_id = ?").run(userId); }

  decryptKey(userId: string): string {
    const row = this.db.prepare("SELECT * FROM user_llm_credentials WHERE user_id = ?").get(userId) as Credential | undefined;
    if (!row) throw new HttpError(403, "OWNER_KEY_MISSING", "The room owner needs to add an OpenAI key in their profile.");
    try {
      if (row.encryption_version !== 1) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(row.nonce, "base64"));
      decipher.setAAD(Buffer.from(`${userId}:openai:1`));
      decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final()]).toString("utf8");
    } catch {
      throw new HttpError(503, "OWNER_KEY_UNAVAILABLE", "The saved OpenAI key cannot be read. Please ask the room owner to replace it.");
    }
  }
}
