import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../transport';
afterEach(() => vi.unstubAllGlobals());
describe('API transport', () => {
  it('passes structured tRPC responses through, including authorization errors', async () => {
    const response = Response.json({ error: { message: 'UNAUTHORIZED' } }, { status: 401 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    expect(await apiFetch('/api/trpc/session.me')).toBe(response);
  });
  it('turns an HTML login redirect into an actionable error without echoing its body', async () => {
    const response = new Response('<!DOCTYPE html><p>private-token</p>', { headers: { 'content-type': 'text/html' } });
    Object.defineProperty(response, 'redirected', { value: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(apiFetch('/api/trpc/session.me')).rejects.toThrow(/Sign in again/);
  });
  it('identifies a deployment failure before JSON parsing and preserves its HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!DOCTYPE html>private-token', { status: 502, headers: { 'content-type': 'text/html' } })));
    await expect(apiFetch('/api/trpc/session.me')).rejects.toThrow('Relay could not load this request (HTTP 502)');
  });
});
