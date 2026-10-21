import { describe, it, expect } from 'vitest';
import {
  canonicalDomain, emailDomain, nameSimilarity, normalizeCompanyName, normalizeLocality, normalizeRegion, socialNetworkOf,
} from '../normalize';

describe('normalizeCompanyName', () => {
  it('ignores case, punctuation and legal suffixes', () => {
    expect(normalizeCompanyName('Maple Plastics Inc.')).toBe('maple plastics');
    expect(normalizeCompanyName('MAPLE PLASTICS, INC')).toBe('maple plastics');
    expect(normalizeCompanyName('Maple Plastics Ltd.')).toBe('maple plastics');
    expect(normalizeCompanyName('Maple Plastics Co. Ltd.')).toBe('maple plastics');
  });

  it('reads & as and, folds accents and drops a leading "the"', () => {
    expect(normalizeCompanyName('Smith & Sons')).toBe(normalizeCompanyName('Smith and Sons'));
    expect(normalizeCompanyName('Café Démo Ltée')).toBe('cafe demo');
    expect(normalizeCompanyName('The Brick Works')).toBe('brick works');
  });

  it('never reduces a name to nothing', () => {
    expect(normalizeCompanyName('Company')).toBe('company');
    expect(normalizeCompanyName('The')).toBe('the');
    expect(normalizeCompanyName('')).toBe('');
    expect(normalizeCompanyName(null)).toBe('');
  });
});

describe('canonicalDomain', () => {
  it('reduces a URL to the bare host', () => {
    expect(canonicalDomain('https://www.Maple-Plastics.ca/about')).toBe('maple-plastics.ca');
    expect(canonicalDomain('maple-plastics.ca')).toBe('maple-plastics.ca');
    expect(canonicalDomain('http://m.example.com')).toBe('example.com');
  });

  it('refuses shared platforms, so different businesses never collide on them', () => {
    expect(canonicalDomain('https://www.facebook.com/mapleplastics')).toBeNull();
    expect(canonicalDomain('https://linktr.ee/maple')).toBeNull();
    expect(canonicalDomain('https://maple.wixsite.com/home')).toBeNull();
    expect(canonicalDomain('https://sites.google.com/view/maple')).toBeNull();
    expect(canonicalDomain('https://maple.myshopify.com')).toBeNull();
  });

  it('rejects things that are not domains', () => {
    expect(canonicalDomain('localhost')).toBeNull();
    expect(canonicalDomain('http://192.168.0.1')).toBeNull();
    expect(canonicalDomain('')).toBeNull();
    expect(canonicalDomain(null)).toBeNull();
  });
});

describe('socialNetworkOf', () => {
  it('names the network of a social profile URL', () => {
    expect(socialNetworkOf('https://facebook.com/maple')).toBe('facebook');
    expect(socialNetworkOf('https://www.instagram.com/maple')).toBe('instagram');
    expect(socialNetworkOf('https://x.com/maple')).toBe('x');
    expect(socialNetworkOf('https://maple-plastics.ca')).toBeNull();
  });
});

describe('emailDomain', () => {
  it('returns the company domain of a business email', () => {
    expect(emailDomain('Jordan@Maple-Plastics.ca')).toBe('maple-plastics.ca');
  });

  it('ignores free mailboxes and malformed addresses', () => {
    expect(emailDomain('someone@gmail.com')).toBeNull();
    expect(emailDomain('someone@rogers.com')).toBeNull();
    expect(emailDomain('not-an-email')).toBeNull();
    expect(emailDomain(null)).toBeNull();
  });
});

describe('localities', () => {
  it('compares cities loosely', () => {
    expect(normalizeLocality('City of Mississauga')).toBe('mississauga');
    expect(normalizeLocality('St. Catharines')).toBe(normalizeLocality('St Catharines'));
  });

  it('maps province names to codes', () => {
    expect(normalizeRegion('Ontario')).toBe('on');
    expect(normalizeRegion('ON')).toBe('on');
    expect(normalizeRegion('on.')).toBe('on');
  });
});

describe('nameSimilarity', () => {
  it('is 1 for equal names and 0 for empty ones', () => {
    expect(nameSimilarity('maple plastics', 'maple plastics')).toBe(1);
    expect(nameSimilarity('', 'maple')).toBe(0);
  });

  it('scores typos and extensions high, unrelated names low', () => {
    expect(nameSimilarity('maple plastics', 'maple plastic')).toBeGreaterThan(0.93);
    expect(nameSimilarity('acme machining', 'acme machinig')).toBeGreaterThan(0.93);
    expect(nameSimilarity('maple plastics', 'northern logistics')).toBeLessThan(0.7);
  });
});
