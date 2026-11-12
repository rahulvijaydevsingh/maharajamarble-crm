import type { Logger, SessionRegistry } from "../../src/ports/index";
import { formatPhoneToJid } from "./jid-utils";

export interface InteractiveButtonPayload {
  id: string;
  displayText: string;
}

export interface SendButtonsInput {
  sessionKey: string;
  recipient: string;
  text: string;
  footer?: string;
  buttons: InteractiveButtonPayload[];
}

/**
 * Vendored WA-AKG interactive message sender (Sec 9.2).
 * Guarded by interactiveEnabled flag (defaults to false in Phase 1).
 */
export class WaInteractiveService {
  constructor(
    private readonly sessions: SessionRegistry,
    private readonly logger: Logger,
    private isInteractiveEnabled: () => boolean,
  ) {}

  async sendButtons(input: SendButtonsInput): Promise<{ providerMessageId: string }> {
    if (!this.isInteractiveEnabled()) {
      throw new Error("INTERACTIVE_DISABLED: Interactive messages are disabled by policy flag");
    }

    const sock = this.sessions.getSocket(input.sessionKey);
    if (!sock || !this.sessions.isConnected(input.sessionKey)) {
      throw new Error("SESSION_NOT_CONNECTED: Socket is not connected");
    }

    const jid = formatPhoneToJid(input.recipient);
    const result = await sock.sendMessage(jid, {
      text: input.text,
      footer: input.footer ?? "",
      buttons: input.buttons.map((b) => ({
        buttonId: b.id,
        buttonText: { displayText: b.displayText },
        type: 1,
      })),
    });

    const msgId = result?.key?.id;
    if (!msgId) {
      this.logger.warn("Interactive message returned no message id", { sessionKey: input.sessionKey });
      throw new Error("OUTCOME_UNKNOWN: Socket returned no message id");
    }

    return { providerMessageId: msgId };
  }
}
