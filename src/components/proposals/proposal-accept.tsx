'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

/**
 * Acceptance is a typed name plus a timestamp and IP. That is enough to show
 * intent and move a deal forward, and it is deliberately labelled as what it
 * is — the copy does not call it a signature, because it is not a qualified
 * electronic signature and implying otherwise would be the wrong promise to
 * make on a page a prospect is trusting.
 */
export function ProposalAccept({ token, accent, agency }: { token: string; accent: string; agency: string }) {
  const [name, setName] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async () => {
    setState('sending');
    const res = await fetch(`/api/proposals/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, signatureName: name.trim() }),
    });
    if (res.ok) { setState('done'); return; }
    setMessage(await res.text());
    setState('error');
  };

  if (state === 'done') {
    return (
      <div className="card p-5 flex items-start gap-3">
        <CheckCircle2 className="size-5 shrink-0 mt-0.5" style={{ color: accent }} />
        <div>
          <h2 className="font-medium mb-1">Accepted — thank you</h2>
          <p className="text-sm text-muted">{agency} has been notified and will be in touch to schedule discovery.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h2 className="font-medium mb-1">Ready to go ahead?</h2>
      <p className="text-micro text-muted mb-4">
        Type your name to accept this proposal. We&apos;ll record the date and time.
        A countersigned agreement follows before any work begins.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="input flex-1 min-w-[200px]" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Your full name" aria-label="Your full name"
        />
        <button type="button" className="btn-primary" style={{ background: accent }}
                disabled={name.trim().length < 2 || state === 'sending'} onClick={submit}>
          {state === 'sending' ? 'Recording…' : 'Accept proposal'}
        </button>
      </div>
      {state === 'error' && <p className="text-micro text-blocked mt-2">{message}</p>}
    </div>
  );
}
