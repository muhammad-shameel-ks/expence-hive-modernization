import type { EmailProvider, MagicLinkEmail } from "./ports";

export class RecordingEmailProvider implements EmailProvider {
  readonly sent: MagicLinkEmail[] = [];

  async sendMagicLink(email: MagicLinkEmail): Promise<void> {
    this.sent.push(email);
  }
}