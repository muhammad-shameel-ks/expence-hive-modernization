import nodemailer from "nodemailer";
import type { EmailProvider, MagicLinkEmail } from "./ports";

export class MailpitEmailProvider implements EmailProvider {
  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "127.0.0.1",
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
  });

  async sendMagicLink({ to, url }: MagicLinkEmail): Promise<void> {
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM ?? "ExpenseHive <expensehive@localhost>",
      to,
      subject: "Your ExpenseHive sign-in link",
      text: [
        "Sign in to ExpenseHive:",
        "",
        url,
        "",
        "This link expires in 15 minutes and works once.",
        "If you did not request it, you can ignore this email.",
      ].join("\n"),
    });
  }
}