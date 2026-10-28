import { describe, expect, it } from 'vitest';
import { guideForPath, guideStorageKey, toolsFor } from '../guide';
describe('role-scoped onboarding', () => {
  it('keeps callers focused on call work without admin or sending tools', () => {
    const tools = toolsFor('CALLER').map(t => t.href);
    expect(tools).toContain('/call-history');
    expect(tools).toContain('/contacts');
    expect(tools).not.toContain('/email-history');
    expect(tools).not.toContain('/connectors');
    expect(tools).not.toContain('/billing');
  });
  it('keeps client help within their portal, including nested application help', () => {
    expect(toolsFor('CLIENT_MEMBER').every(t => t.href.startsWith('/portal'))).toBe(true);
    expect(guideForPath('CLIENT_MEMBER', '/portal/apps/example')?.label).toBe('Applications');
    expect(guideForPath('CLIENT_MEMBER', '/connectors')).toBeUndefined();
  });
  it('does not confuse the contacts list with a company account', () => {
    expect(guideForPath('OPERATOR', '/accounts/example')?.label).toBe('Accounts');
    expect(guideForPath('OPERATOR', '/contacts/example')?.label).toBe('Contacts');
  });
  it('remembers a tour separately for each organization, user and role', () => {
    expect(new Set([guideStorageKey('org1', 'user1', 'CALLER'), guideStorageKey('org2', 'user1', 'CALLER'), guideStorageKey('org1', 'user2', 'CALLER'), guideStorageKey('org1', 'user1', 'OPERATOR')]).size).toBe(4);
  });
});
