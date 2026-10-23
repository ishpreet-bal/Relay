/**
 * Sender identification for commercial email. Canada's anti-spam law (CASL)
 * requires every commercial electronic message to name who sent it and on
 * whose behalf, give a valid mailing address, and give a way to reach the
 * sender. This builds that line for the email footer; the send gate refuses
 * to send for a client that has no mailing address.
 */

export interface SenderIdentityInput {
  clientName: string;
  mailingAddress: string;
  /** The workspace's brand, when it sends on the client's behalf. */
  senderBrand: string | null;
  contactEmail: string;
  website: string | null;
}

export function senderIdentification(p: SenderIdentityInput) {
  const brand = p.senderBrand?.trim();
  const who = brand && brand.toLowerCase() !== p.clientName.trim().toLowerCase()
    ? `Sent by ${brand} on behalf of ${p.clientName.trim()}`
    : p.clientName.trim();
  const site = p.website?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') || null;
  return [who, p.mailingAddress.trim(), site, p.contactEmail.trim()].filter(Boolean).join(' · ');
}

export const SENDER_IDENTIFICATION_PLACEHOLDER = '{{sender_identification}}';
