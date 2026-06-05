/**
 * Envelope encryption for tenant secrets.
 *
 * Algorithm: AES-256-GCM with a 96-bit random IV per seal.
 * KEK: base64-encoded 32-byte value from env.TENANT_SECRETS_KEY.
 * The SecretBlob is safe to store in Postgres TEXT columns (all base64).
 *
 * Server-only (no `import "server-only"` needed here — it carries no
 * Next.js guard, just pure Node crypto; callers that are server-only
 * already declare it).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/env";

/** Persisted form of an encrypted secret (all strings are base64). */
export type SecretBlob = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

/** Minimal interface for swapping the crypto backend (e.g., KMS). */
export interface SecretStore {
  seal(plaintext: string): SecretBlob;
  open(blob: SecretBlob): string;
}

/** AES-256-GCM envelope implementation. Default export instance. */
export class EnvelopeAesSecretStore implements SecretStore {
  /** Lazily decoded KEK; validated on first use. */
  private kek: Buffer | null = null;

  private getKek(): Buffer {
    if (this.kek) return this.kek;
    const raw = serverEnv.TENANT_SECRETS_KEY;
    if (!raw) {
      throw new Error(
        "EnvelopeAesSecretStore: TENANT_SECRETS_KEY is not set. " +
        "Set it to a base64-encoded 32-byte key."
      );
    }
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) {
      throw new Error(
        `EnvelopeAesSecretStore: TENANT_SECRETS_KEY must decode to exactly 32 bytes ` +
        `(got ${buf.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
      );
    }
    this.kek = buf;
    return buf;
  }

  seal(plaintext: string): SecretBlob {
    const kek = this.getKek();
    const iv = randomBytes(12); // 96-bit IV for GCM
    const cipher = createCipheriv("aes-256-gcm", kek, iv);
    const enc = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    return {
      ciphertext: enc.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion: 1,
    };
  }

  open(blob: SecretBlob): string {
    const kek = this.getKek();
    const iv = Buffer.from(blob.iv, "base64");
    const ciphertext = Buffer.from(blob.ciphertext, "base64");
    const authTag = Buffer.from(blob.authTag, "base64");
    const decipher = createDecipheriv("aes-256-gcm", kek, iv);
    decipher.setAuthTag(authTag);
    try {
      const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return dec.toString("utf8");
    } catch (err) {
      throw new Error(
        "EnvelopeAesSecretStore: decryption failed — data may be tampered.",
        { cause: err }
      );
    }
  }
}

/** Singleton instance used by tenantSecrets.ts and the seal script. */
const secretStore: SecretStore = new EnvelopeAesSecretStore();
export { secretStore };
export default secretStore;
