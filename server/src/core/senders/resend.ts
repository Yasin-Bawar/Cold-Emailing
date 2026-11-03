import { env } from '../env.ts';
import { unsubscribeHeaders, type OutMessage, type Sender } from './types.ts';

// Resend through its REST API. The from address must be on a domain verified in Resend.
// Set reply_to to a connected Gmail inbox so replies are picked up by the inbox check.
export const resendSender = (apiKey: string): Sender => {
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${env.resendApiBase}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(60_000),
    });
    const body: any = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };
  return {
    async send(m: OutMessage) {
      const headers: Record<string, string> = { ...unsubscribeHeaders(m) };
      if (m.inReplyTo) headers['In-Reply-To'] = m.inReplyTo;
      if (m.references) headers.References = m.references;
      const { status, body } = await call('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: `${m.fromName.replace(/["<>]/g, '')} <${m.from}>`,
          to: [m.to],
          subject: m.subject,
          ...(m.html ? { html: m.html } : {}),
          text: m.text,
          ...(m.replyTo ? { reply_to: m.replyTo } : {}),
          headers,
          attachments: m.attachments.map((a) => ({
            filename: a.filename,
            content: a.content.toString('base64'),
            content_type: a.contentType,
            ...(a.cid ? { content_id: a.cid } : {}),
          })),
        }),
      });
      if (status >= 300 || !body?.id) throw new Error(`Resend ${status}: ${body?.message || body?.name || 'send failed'}`);
      return { providerId: String(body.id), messageId: m.messageId };
    },
    async verify() {
      const { status, body } = await call('/domains');
      if (status === 200) {
        const names = (body?.data || []).map((d: any) => `${d.name} (${d.status})`).join(', ');
        return names ? `Key works. Domains: ${names}` : 'Key works, but no domain is added in Resend yet.';
      }
      // A sending-only key can't list domains, but it is valid.
      if (status === 401 && /restricted/i.test(`${body?.name} ${body?.message}`)) return 'Key works (sending-only key).';
      throw new Error(`Resend ${status}: ${body?.message || 'key rejected'}`);
    },
  };
};
