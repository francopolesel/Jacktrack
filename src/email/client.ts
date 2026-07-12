import { Resend } from "resend";

export interface IEmailClient {
  send(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ success: boolean; error?: string }>;
}

/**
 * Resend email adapter.
 * Wraps the Resend SDK behind IEmailClient for testability.
 */
export class ResendClient implements IEmailClient {
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(apiKey: string, fromEmail: string) {
    this.resend = new Resend(apiKey);
    this.fromEmail = fromEmail;
  }

  async send(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Email] Failed to send:", message);
      return { success: false, error: message };
    }
  }
}
