import nodemailer, { type Transporter } from 'nodemailer';
import type { Mailer } from '../application/ports.js';

/**
 * Envia pelo nodemailer (SMTP; no compose, o Mailpit). Falha de SMTP vai para o log e não interrompe o 202.
 */
export class NodemailerMailer implements Mailer {
  constructor(
    private readonly transport: Transporter,
    private readonly from: string,
  ) {}

  static fromDsn(dsn: string, from: string): NodemailerMailer {
    return new NodemailerMailer(nodemailer.createTransport(dsn), from);
  }

  async sendPasswordReset(toEmail: string, toName: string, resetLink: string): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: { name: toName, address: toEmail },
        subject: 'Redefinição de senha - Goomer Menu',
        text:
          `Olá, ${toName}.\n\nPara criar uma nova senha, use o link abaixo (vale 30 minutos e uma única vez):\n\n` +
          `${resetLink}\n\nSe você não pediu a redefinição, ignore este e-mail.\n`,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[mailer] falha ao enviar redefinição de senha para ${toEmail}: ${reason}`);
    }
  }

  close(): void {
    this.transport.close();
  }
}
