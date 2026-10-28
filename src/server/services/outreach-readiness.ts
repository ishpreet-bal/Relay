/** Fail closed on missing prerequisites. A verified address is not a permission to email. */
export function outreachContactBlock(contact: {
  organizationId: string; clientId: string; accountId: string; emailVerification: string; emailVerifiedAt: Date | null;
  consentBasis: string; consentNote: string | null;
}, message: { organizationId: string; clientId: string; accountId: string | null }, now: Date): { code: 'CONTACT_SCOPE' | 'EMAIL_UNVERIFIED' | 'CONSENT_REQUIRED'; reason: string } | null {
  if (contact.organizationId !== message.organizationId || contact.clientId !== message.clientId || contact.accountId !== message.accountId) return { code: 'CONTACT_SCOPE', reason: 'Contact does not belong to this message’s account and client' };
  if (contact.emailVerification !== 'VALID' || !contact.emailVerifiedAt || contact.emailVerifiedAt > now || now.getTime() - contact.emailVerifiedAt.getTime() > 30 * 86400_000) return { code: 'EMAIL_UNVERIFIED', reason: 'Verify this email address within the last 30 days before sending' };
  if (contact.consentBasis === 'UNKNOWN' || !contact.consentNote?.trim()) return { code: 'CONSENT_REQUIRED', reason: 'Record and review the applicable outreach basis and supporting evidence before sending' };
  return null;
}
