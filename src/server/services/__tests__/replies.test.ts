import { describe, it, expect } from 'vitest';
import { classifyReply, isOptOut, ownText } from '../replies';

describe('reply classification', () => {
  it('recognizes interest', () => {
    expect(classifyReply('Re: freight', 'Sure, send me more information and pricing.')).toBe('POSITIVE');
    expect(classifyReply(null, "Happy to chat. What times work next week?")).toBe('POSITIVE');
  });

  it('recognizes a clear no', () => {
    expect(classifyReply(null, "Thanks, but we're all set with our current carrier.")).toBe('NEGATIVE');
    expect(classifyReply(null, 'Not interested.')).toBe('NEGATIVE');
  });

  it('leaves mixed replies for a human', () => {
    expect(classifyReply(null, 'Not right now, but send me info for next quarter.')).toBe('UNCLASSIFIED');
  });

  it('spots out-of-office before anything else', () => {
    expect(classifyReply('Automatic reply: Out of office', 'I am out of the office until Monday. Please send me info then.')).toBe('OUT_OF_OFFICE');
  });

  it('treats opt-out wording as unsubscribe', () => {
    expect(classifyReply(null, 'Please remove me from your list.')).toBe('UNSUBSCRIBE');
    expect(isOptOut('stop emailing me')).toBe(true);
  });

  it('recognizes a referral', () => {
    expect(classifyReply(null, 'You should talk to Dana, our transportation manager.')).toBe('REFERRAL');
  });

  it('ignores the quoted thread, including our own unsubscribe footer', () => {
    const body = 'Sounds good, call me Thursday.\n\nOn Tue, Sam wrote:\n> Worth a call?\n> Unsubscribe: https://x/u/abc';
    expect(ownText(body)).toBe('Sounds good, call me Thursday.');
    expect(classifyReply(null, body)).toBe('POSITIVE');
    expect(isOptOut(body)).toBe(false);
  });

  it('does not guess on neutral replies', () => {
    expect(classifyReply(null, 'Who is this?')).toBe('UNCLASSIFIED');
  });
});
