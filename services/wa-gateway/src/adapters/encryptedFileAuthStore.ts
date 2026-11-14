import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { AuthStateStore, Logger } from "../ports/index";

/**
 * AES-256-GCM encrypted local credential store (ADR-0007 & ADR-0010).
 * Cross-platform safe for both Windows NTFS (handles EPERM/EACCES rename contention)
 * and Linux POSIX (applies mode 0o700 best-effort).
 */
export class EncryptedFileAuthStore implements AuthStateStore {
  private readonly authRootDir: string;
  private readonly lockFilePath: string;

  constructor(
    dataDir: string,
    private readonly encryptionKey32: Buffer,
    private readonly logger: Logger,
  ) {
    if (encryptionKey32.length !== 32) {
      throw new Error("EncryptedFileAuthStore requires a 32-byte key");
    }
    this.authRootDir = path.join(dataDir, "auth");
    this.lockFilePath = path.join(dataDir, "worker.lock");
  }

  async acquireProcessLock(currentPid = process.pid): Promise<void> {
    await fs.mkdir(path.dirname(this.lockFilePath), { recursive: true });
    try {
      await fs.chmod(path.dirname(this.lockFilePath), 0o700);
    } catch {
      // Best-effort on Windows NTFS
    }

    if (fsSync.existsSync(this.lockFilePath)) {
      try {
        const rawPid = (await fs.readFile(this.lockFilePath, "utf8")).trim();
        const existingPid = Number(rawPid);
        if (Number.isInteger(existingPid) && existingPid > 0 && existingPid !== currentPid) {
          let alive = false;
          try {
            process.kill(existingPid, 0);
            alive = true;
          } catch {
            alive = false;
          }
          if (alive) {
            throw new Error(`LOCK_HELD: Another wa-gateway process (PID ${existingPid}) owns ${this.lockFilePath}`);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("LOCK_HELD:")) {
          throw err;
        }
      }
    }

    await this.atomicWriteBuffer(this.lockFilePath, Buffer.from(String(currentPid), "utf8"));
  }

  async releaseProcessLock(): Promise<void> {
    try {
      await fs.unlink(this.lockFilePath);
    } catch {
      // Ignore if already removed
    }
  }

  private sanitizeSegment(seg: string): string {
    return seg.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  private getSessionDir(sessionKey: string): string {
    return path.join(this.authRootDir, this.sanitizeSegment(sessionKey));
  }

  private encryptJson(value: unknown): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey32, iv);
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]);
  }

  private decryptJson<T>(payload: Buffer): T {
    if (payload.length < 28) {
      throw new Error("CORRUPTED_CIPHERTEXT: Payload shorter than IV + AuthTag");
    }
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionKey32, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  }

  private async atomicWriteBuffer(targetPath: string, data: Buffer): Promise<void> {
    const dir = path.dirname(targetPath);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.chmod(dir, 0o700);
    } catch {
      // Windows NTFS ignore
    }

    const tempPath = `${targetPath}.${ crypto.randomBytes(6).toString("hex") }.tmp`;
    const handle = await fs.open(tempPath, "w", 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }

    // Windows NTFS can transiently return EPERM/EACCES when overwriting an existing file
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await fs.rename(tempPath, targetPath);
        return;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
      }
    }

    try {
      await fs.unlink(tempPath);
    } catch {
      // Cleanup temp file
    }
    throw lastErr instanceof Error ? lastErr : new Error("ATOMIC_WRITE_FAILED");
  }

  async loadSessionCredentials(sessionKey: string): Promise<Record<string, unknown> | null> {
    const filePath = path.join(this.getSessionDir(sessionKey), "creds.enc");
    try {
      const buf = await fs.readFile(filePath);
      return this.decryptJson<Record<string, unknown>>(buf);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        return null;
      }
      this.logger.warn("Unreadable creds.enc treated as missing", {
        sessionKey,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async saveSessionCredentials(sessionKey: string, creds: Record<string, unknown>): Promise<void> {
    const filePath = path.join(this.getSessionDir(sessionKey), "creds.enc");
    const encrypted = this.encryptJson(creds);
    await this.atomicWriteBuffer(filePath, encrypted);
  }

  async loadKey(sessionKey: string, category: string, id: string): Promise<unknown | null> {
    const fileName = `${this.sanitizeSegment(category)}-${this.sanitizeSegment(id)}.enc`;
    const filePath = path.join(this.getSessionDir(sessionKey), "keys", fileName);
    try {
      const buf = await fs.readFile(filePath);
      return this.decryptJson(buf);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        return null;
      }
      this.logger.warn("Corrupted key file treated as missing key", {
        sessionKey,
        category,
        id,
      });
      return null;
    }
  }

  async saveKey(
    sessionKey: string,
    category: string,
    id: string,
    value: unknown | null,
  ): Promise<void> {
    const fileName = `${this.sanitizeSegment(category)}-${this.sanitizeSegment(id)}.enc`;
    const filePath = path.join(this.getSessionDir(sessionKey), "keys", fileName);
    if (value === null || value === undefined) {
      try {
        await fs.unlink(filePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
          throw err;
        }
      }
      return;
    }

    const encrypted = this.encryptJson(value);
    await this.atomicWriteBuffer(filePath, encrypted);
  }

  async wipeSession(sessionKey: string): Promise<void> {
    const dir = this.getSessionDir(sessionKey);
    await fs.rm(dir, { recursive: true, force: true });
  }

  async quarantineSession(sessionKey: string): Promise<void> {
    const dir = this.getSessionDir(sessionKey);
    if (!fsSync.existsSync(dir)) return;
    const quarantineDir = `${dir}.quarantine-${Date.now()}`;
    await fs.rename(dir, quarantineDir);
  }
}