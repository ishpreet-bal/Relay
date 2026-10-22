import { describe, it, expect } from 'vitest';
import { assertPublicUrl, isPrivateAddress } from '../net-guard';

describe('isPrivateAddress', () => {
  it('flags loopback, private, link-local and metadata ranges', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '93.184.216.34', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe('assertPublicUrl', () => {
  it('refuses internal targets before any request', async () => {
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/private/);
    await expect(assertPublicUrl('http://localhost:3000')).rejects.toThrow();
    await expect(assertPublicUrl('http://app.internal/')).rejects.toThrow(/Local/);
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(/http/);
    await expect(assertPublicUrl('https://example.com:8443/')).rejects.toThrow(/port/);
    await expect(assertPublicUrl('https://user:pw@example.com/')).rejects.toThrow(/Credentials/);
    await expect(assertPublicUrl('http://[::1]/')).rejects.toThrow(/private/);
  });

  it('accepts a public IP literal', async () => {
    await expect(assertPublicUrl('https://8.8.8.8/')).resolves.toBeInstanceOf(URL);
  });
});
