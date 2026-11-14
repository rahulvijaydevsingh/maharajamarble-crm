import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EncryptedFileAuthStore } from "../../services/wa-gateway/src/adapters/encryptedFileAuthStore";
import { computeAdaptivePollIntervalMs } from "../../services/wa-gateway/src/runtime/doorbellClient";
import { mapDisconnectCodeToDirective } from "../../services/wa-gateway/src/runtime/sessionRuntime";
import { computeComposingDelayMs, computeNextSendGapMs } from "../../services/wa-gateway/src/runtime/queueRunner";
import type { Logger } from "../../services/wa-gateway/src/ports/index";

const noopLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

describe("Slice 1A Gateway Worker Runtime Unit Suite", () => {
  it("encrypts, persists, and decrypts session credentials & keys atomically with AES-256-GCM", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wa-auth-test-"));
    try {
      const key32 = crypto.randomBytes(32);
      const store = new EncryptedFileAuthStore(tmpDir, key32, noopLogger);

      await store.acquireProcessLock(process.pid);
      await store.saveSessionCredentials("main", { me: { id: "919876543210@s.whatsapp.net" } });
      const loadedCreds = await store.loadSessionCredentials("main");
      expect(loadedCreds).toEqual({ me: { id: "919876543210@s.whatsapp.net" } });

      await store.saveKey("main", "pre-key", "1", { pub: "abc", priv: "def" });
      expect(await store.loadKey("main", "pre-key", "1")).toEqual({ pub: "abc", priv: "def" });

      // Corrupted key file is treated as missing key, never crashing
      const badKeyPath = path.join(tmpDir, "auth", "main", "keys", "pre-key-corrupt.enc");
      await fs.writeFile(badKeyPath, Buffer.from("short"));
      expect(await store.loadKey("main", "pre-key", "corrupt")).toBeNull();

      await store.wipeSession("main");
      expect(await store.loadSessionCredentials("main")).toBeNull();
      await store.releaseProcessLock();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("maps disconnect codes (401, 515, 440, 403, 500) to the exact v2 Spec directives", () => {
    expect(mapDisconnectCodeToDirective(401, 0)).toEqual({ action: "wipe_and_logged_out" });
    expect(mapDisconnectCodeToDirective(515, 0)).toEqual({ action: "recreate_immediately" });
    expect(mapDisconnectCodeToDirective(440, 0).action).toBe("pause_safety");
    expect(mapDisconnectCodeToDirective(403, 0).action).toBe("pause_safety");
    expect(mapDisconnectCodeToDirective(500, 0).action).toBe("quarantine_and_error");

    const backoff = mapDisconnectCodeToDirective(428, 2, () => 0.5);
    expect(backoff).toEqual({ action: "reconnect_backoff", delayMs: 10_000 });
  });

  it("paces 10,000 normal gaps strictly within 15 to 35s with a mean within 1s of 25s", () => {
    let sumSec = 0;
    for (let i = 0; i < 10_000; i++) {
      const { gapMs, resetBurst } = computeNextSendGapMs(
        { paceMinSeconds: 15, paceMaxSeconds: 35 },
        1,
      );
      expect(resetBurst).toBe(false);
      expect(gapMs).toBeGreaterThanOrEqual(15_000);
      expect(gapMs).toBeLessThanOrEqual(35_000);
      sumSec += gapMs / 1000;
    }
    const meanSec = sumSec / 10_000;
    expect(Math.abs(meanSec - 25)).toBeLessThanOrEqual(1);
  });

  it("computes adaptive polling intervals and composing delays accurately", () => {
    expect(
      computeAdaptivePollIntervalMs({
        doorbellHealthy: true,
        isPairingOrSending: true,
        hasActiveOrWantedSessions: true,
      }),
    ).toBe(10_000);
    expect(
      computeAdaptivePollIntervalMs({
        doorbellHealthy: true,
        isPairingOrSending: false,
        hasActiveOrWantedSessions: true,
      }),
    ).toBe(60_000);
    expect(
      computeAdaptivePollIntervalMs({
        doorbellHealthy: false,
        isPairingOrSending: false,
        hasActiveOrWantedSessions: true,
      }),
    ).toBe(30_000);
    expect(
      computeAdaptivePollIntervalMs({
        doorbellHealthy: true,
        isPairingOrSending: false,
        hasActiveOrWantedSessions: false,
      }),
    ).toBe(120_000);

    expect(computeComposingDelayMs(20)).toBeGreaterThanOrEqual(2_000);
    expect(computeComposingDelayMs(500)).toBeLessThanOrEqual(6_000);
  });
});