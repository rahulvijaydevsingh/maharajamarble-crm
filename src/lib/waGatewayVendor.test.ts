import { describe, expect, it } from "vitest";
import { InMemoryAntispamState } from "../../services/wa-gateway/vendor/wa-akg/antispam";
import { matchAutoReplyRule } from "../../services/wa-gateway/vendor/wa-akg/autoreply";
import { WaChatService } from "../../services/wa-gateway/vendor/wa-akg/chat.service";
import { WaInteractiveService } from "../../services/wa-gateway/vendor/wa-akg/interactive";
import {
  extractPhoneE164FromJid,
  formatPhoneToJid,
  isGroupJid,
  isLidJid,
} from "../../services/wa-gateway/vendor/wa-akg/jid-utils";
import type {
  ContactJidStore,
  Logger,
  MessageLog,
  SessionRegistry,
  WaSocketLike,
} from "../../services/wa-gateway/src/ports/index";

describe("Spike S1: Vendored WA-AKG modules behind ports", () => {
  it("formats Indian mobile numbers to JIDs and extracts E.164 cleanly", () => {
    expect(formatPhoneToJid("+91 98765 43210")).toBe("919876543210@s.whatsapp.net");
    expect(extractPhoneE164FromJid("919876543210:12@s.whatsapp.net")).toBe("919876543210");
    expect(extractPhoneE164FromJid("12036304@g.us")).toBeNull();
    expect(isGroupJid("12036304@g.us")).toBe(true);
    expect(isLidJid("99887766@lid")).toBe(true);
  });

  it("enforces local 10s interval and 200/day antispam safety ceiling", () => {
    const antispam = new InMemoryAntispamState({ minIntervalMs: 10_000, dailyCeiling: 2 });
    const t0 = 1_700_000_000_000;

    expect(antispam.canSendNow("main", t0).allowed).toBe(true);
    antispam.recordSend("main", t0);

    const tooSoon = antispam.canSendNow("main", t0 + 4_000);
    expect(tooSoon.allowed).toBe(false);
    expect(tooSoon.reason).toBe("LOCAL_MIN_INTERVAL_WAIT");

    expect(antispam.canSendNow("main", t0 + 11_000).allowed).toBe(true);
    antispam.recordSend("main", t0 + 11_000);

    const ceiling = antispam.canSendNow("main", t0 + 25_000);
    expect(ceiling.allowed).toBe(false);
    expect(ceiling.reason).toBe("LOCAL_DAILY_CEILING_REACHED");
  });

  it("matches keyword auto-reply rules by priority", () => {
    const matched = matchAutoReplyRule("Please share Showroom Location", [
      { id: "r2", matchType: "contains", keywords: ["location", "address"], replyKind: "location", priority: 10 },
      { id: "r1", matchType: "exact", keywords: ["hi"], replyKind: "text", priority: 1 },
    ]);
    expect(matched?.id).toBe("r2");
  });

  it("sends text, PDF document, and native location pin through fake Baileys socket", async () => {
    const sentPayloads: Array<{ jid: string; content: Record<string, unknown> }> = [];
    const fakeSocket: WaSocketLike = {
      async sendMessage(jid, content) {
        sentPayloads.push({ jid, content });
        return { key: { id: `wamid-${sentPayloads.length}` } };
      },
      async onWhatsApp(jid) {
        return [{ jid, exists: true }];
      },
    };

    const sessions: SessionRegistry = {
      getSocket: () => fakeSocket,
      isConnected: () => true,
    };

    const resolvedMap = new Map<string, string>();
    const contacts: ContactJidStore = {
      getResolvedJid: (p) => resolvedMap.get(p) ?? null,
      setResolvedJid: (p, j) => resolvedMap.set(p, j),
    };

    const antispam = new InMemoryAntispamState({ minIntervalMs: 0, dailyCeiling: 200 });
    const logs: string[] = [];
    const messageLog: MessageLog = {
      recordLocalSendAttempt: (e) => logs.push(e.providerMessageId ?? ""),
    };
    const clock = { nowMs: () => Date.now(), setServerOffsetMs: () => {} };
    const logger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

    const chat = new WaChatService(sessions, contacts, antispam, messageLog, clock, logger);

    const textRes = await chat.sendText({
      sessionKey: "main",
      queueId: "q1",
      attemptId: "a1",
      recipient: "+91 98765 43210",
      text: "Namaste Rajesh Ji",
    });
    expect(textRes.providerMessageId).toBe("wamid-1");

    const pdfRes = await chat.sendMedia({
      sessionKey: "main",
      queueId: "q2",
      attemptId: "a2",
      recipient: "9876543210",
      buffer: Buffer.from("%PDF-1.4"),
      mime: "application/pdf",
      filename: "Quotation-MM-101.pdf",
      caption: "Please find your quotation attached.",
    });
    expect(pdfRes.providerMessageId).toBe("wamid-2");
    expect(sentPayloads[1].content.fileName).toBe("Quotation-MM-101.pdf");

    const locRes = await chat.sendLocation({
      sessionKey: "main",
      queueId: "q3",
      attemptId: "a3",
      recipient: "9876543210",
      lat: 30.7046,
      lng: 76.7179,
      name: "Maharaja Marble Showroom",
      address: "Mohali, Punjab",
    });
    expect(locRes.providerMessageId).toBe("wamid-3");
    expect(logs).toEqual(["wamid-1", "wamid-2", "wamid-3"]);

    const interactive = new WaInteractiveService(sessions, logger, () => false);
    await expect(
      interactive.sendButtons({
        sessionKey: "main",
        recipient: "9876543210",
        text: "Choose",
        buttons: [{ id: "1", displayText: "Yes" }],
      }),
    ).rejects.toThrow("INTERACTIVE_DISABLED");
  });
});
