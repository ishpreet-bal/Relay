import { Resend } from 'resend';
import type { ConnectorDefinition, EmailSendingProvider } from '../types';

let client: Resend | null = null;
function resend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  client ??= new Resend(key);
  return client;
}

/** What one email costs on your Resend plan, if you want it in unit economics. */
function costPerEmail() {
  const v = Number(process.env.RESEND_COST_PER_EMAIL_MILLICENTS ?? 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

const sender: EmailSendingProvider = {
  async send(email) {
    const result = await resend().emails.send({
      from: email.from,
      to: email.to,
      replyTo: email.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
    });
    if (result.error) throw new Error(result.error.message);
    return { providerMessageId: result.data?.id ?? null, costMillicents: costPerEmail() };
  },
};

export const resendConnector: ConnectorDefinition = {
  id: 'resend',
  name: 'Resend',
  capabilities: ['EMAIL_SENDING'],
  description: 'Sends outreach email and reports deliveries, opens, bounces, complaints and replies by webhook.',
  requiredEnv: ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET'],
  implemented: true,
  docsUrl: 'https://resend.com/docs',
  defaultPriority: 10,
  emailSending: sender,
  async healthCheck() {
    try {
      const domains = await resend().domains.list();
      if (domains.error) return { ok: false, detail: domains.error.message };
      return { ok: true, detail: `${domains.data?.data?.length ?? 0} sending domain(s) on the account` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'Request failed' };
    }
  },
};
