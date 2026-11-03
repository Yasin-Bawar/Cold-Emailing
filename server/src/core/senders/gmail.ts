import nodemailer from 'nodemailer';
import { env } from '../env.ts';
import { unsubscribeHeaders, type OutMessage, type Sender } from './types.ts';

// Gmail through SMTP with an App Password (Google Account > Security > 2-Step Verification > App passwords).
export const gmailSender = (email: string, appPassword: string): Sender => {
  const host = env.smtpHostOverride || 'smtp.gmail.com';
  const t = nodemailer.createTransport({
    host,
    port: env.smtpHostOverride ? Number(process.env.SMTP_PORT_OVERRIDE || 2525) : 465,
    secure: !env.smtpHostOverride,
    auth: { user: email, pass: appPassword.replace(/\s+/g, '') },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });
  return {
    async send(m: OutMessage) {
      const info = await t.sendMail({
        from: { name: m.fromName, address: m.from },
        to: m.to,
        subject: m.subject,
        html: m.html ?? undefined,
        text: m.text,
        replyTo: m.replyTo || undefined,
        messageId: m.messageId,
        inReplyTo: m.inReplyTo || undefined,
        references: m.references || undefined,
        headers: unsubscribeHeaders(m),
        attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, cid: a.cid })),
      });
      return { providerId: String(info.messageId || m.messageId), messageId: m.messageId };
    },
    async verify() {
      await t.verify();
      return `Signed in to ${host} as ${email}`;
    },
    close() { t.close(); },
  };
};
