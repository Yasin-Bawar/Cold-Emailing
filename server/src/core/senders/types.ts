export type Attachment = { filename: string; content: Buffer; contentType: string; cid?: string };

export type OutMessage = {
  from: string; // address
  fromName: string;
  to: string;
  subject: string;
  html: string | null;
  text: string;
  replyTo?: string | null;
  messageId: string; // "<...@...>"
  inReplyTo?: string | null;
  references?: string | null;
  unsubscribeUrl: string;
  attachments: Attachment[];
};

export type SendResult = { providerId: string; messageId: string };

export interface Sender {
  send(m: OutMessage): Promise<SendResult>;
  verify(): Promise<string>; // human-readable "ok" detail, throws on failure
  close?(): void;
}

export const unsubscribeHeaders = (m: OutMessage) => ({
  'List-Unsubscribe': `<${m.unsubscribeUrl}>, <mailto:${m.replyTo || m.from}?subject=unsubscribe>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
});

// Errors that mean the account itself is broken (bad password, revoked key) rather than one bad recipient.
export const isAccountError = (e: unknown) =>
  /invalid login|username and password not accepted|application-specific password|auth|535|534|401|403|api key|restricted|daily user sending limit|quota/i.test(String((e as Error)?.message ?? e));
