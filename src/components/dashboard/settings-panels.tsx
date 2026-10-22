'use client';

import { useState, useEffect } from 'react';
import { CreditCard, ScrollText, Check, Mail, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

const PLANS = [
  { key: 'foundry_solo_monthly', name: 'Solo', blurb: '1 seat · 2,500 accounts · 1,500 sends a month' },
  { key: 'foundry_agency_monthly', name: 'Agency', blurb: '5 seats · 25,000 accounts · custom templates · API' },
  { key: 'foundry_scale_monthly', name: 'Scale', blurb: '25 seats · everything, at volume' },
];

export function SettingsPanels({ canWrite, canBill, canAudit }: {
  canWrite: boolean; canBill: boolean; canAudit: boolean;
}) {
  return (
    <div className="space-y-6">
      <Mailboxes canWrite={canWrite} />
      <SendingLimits canWrite={canWrite} />
      {canBill && <Billing />}
      {canAudit && <AuditLog />}
    </div>
  );
}

function SendingLimits({ canWrite }: { canWrite: boolean }) {
  const settings = trpc.admin.settings.useQuery();
  const usage = trpc.admin.usage.useQuery();
  const utils = trpc.useUtils();
  const update = trpc.admin.updateSettings.useMutation({ onSuccess: () => utils.admin.settings.invalidate() });
  const [draft, setDraft] = useState<Record<string, number> | null>(null);

  if (!settings.data) return null;
  const s = settings.data;

  return (
    <section className="card p-4">
      <h2 className="text-[13px] font-medium mb-1">Sending limits</h2>
      <p className="text-[11px] text-muted mb-4">
        Hard ceilings enforced by the send gate, on top of any per-campaign caps.
        {usage.data && (
          <> You&apos;ve sent <span className="num">{usage.data.usage.sends}</span> of{' '}
          <span className="num">{usage.data.limits.sendsPerMonth}</span> this month on the{' '}
          {usage.data.planName} plan.</>
        )}
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        {([
          { key: 'dailySendCap', label: 'Per day' },
          { key: 'hourlySendCap', label: 'Per hour' },
          { key: 'minMinutesBetweenSends', label: 'Minutes between' },
        ] as const).map((field) => (
          <div key={field.key}>
            <label className="eyebrow block mb-1.5">{field.label}</label>
            <input type="number" min={0} className="input num" disabled={!canWrite}
                   value={draft?.[field.key] ?? s[field.key]}
                   onChange={(e) => setDraft({ ...draft, [field.key]: Number(e.target.value) })} />
          </div>
        ))}
      </div>
      {canWrite && draft && (
        <button type="button" className="btn-primary h-8 text-micro mt-3" disabled={update.isPending}
                onClick={() => { update.mutate(draft as never); setDraft(null); }}>
          Save limits
        </button>
      )}
    </section>
  );
}

function Billing() {
  const usage = trpc.admin.usage.useQuery();
  const checkout = trpc.admin.checkout.useMutation({
    onSuccess: (r) => { if (r.url) window.location.href = r.url; },
  });
  const portal = trpc.admin.billingPortal.useMutation({
    onSuccess: (r) => { if (r.url) window.location.href = r.url; },
  });

  if (!usage.data) return null;
  const u = usage.data;

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <CreditCard className="size-3.5 text-muted" strokeWidth={1.75} />
        <h2 className="text-[13px] font-medium flex-1">Plan and billing</h2>
        <span className={cn('text-[11px] px-2 h-[20px] inline-flex items-center rounded-full',
          u.trialExpired ? 'bg-blocked/10 text-blocked' : 'bg-accent-soft text-accent')}>
          {u.planName}
        </span>
      </div>

      {u.trialExpired && (
        <p className="text-[11px] text-blocked mb-3">
          Your trial has ended. Your data is safe and readable — choose a plan to resume sending.
        </p>
      )}

      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 my-3">
        {([
          ['Team members', u.usage.seats, u.limits.seats],
          ['Accounts', u.usage.leads, u.limits.leads],
          ['Research runs this month', u.usage.research, u.limits.researchRunsPerMonth],
          ['Emails this month', u.usage.sends, u.limits.sendsPerMonth],
        ] as const).map(([label, used, cap]) => (
          <li key={label} className="flex justify-between text-[11px]">
            <span className="text-muted">{label}</span>
            <span className={cn('num', used / cap > 0.9 && 'text-held')}>
              {used.toLocaleString('en-CA')} / {cap.toLocaleString('en-CA')}
            </span>
          </li>
        ))}
      </ul>

      <div className="grid sm:grid-cols-3 gap-2 mt-4">
        {PLANS.map((plan) => (
          <button key={plan.key} type="button"
                  className="text-left rounded-md border border-hairline p-3 hover:border-accent transition-colors"
                  disabled={checkout.isPending}
                  onClick={() => checkout.mutate({ priceLookupKey: plan.key, seats: u.usage.seats })}>
            <p className="text-micro font-medium flex items-center gap-1.5">
              {plan.name}
              {u.planName === plan.name && <Check className="size-3 text-cleared" />}
            </p>
            <p className="text-[10px] text-muted mt-1 leading-tight">{plan.blurb}</p>
          </button>
        ))}
      </div>

      <button type="button" className="btn-ghost h-8 text-micro mt-3" disabled={portal.isPending}
              onClick={() => portal.mutate()}>
        Manage payment method and invoices
      </button>

      {checkout.error && <p className="text-[11px] text-blocked mt-2">{checkout.error.message}</p>}
    </section>
  );
}

function AuditLog() {
  const log = trpc.admin.auditLog.useQuery({ limit: 25 });

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <ScrollText className="size-3.5 text-muted" strokeWidth={1.75} />
        <h2 className="text-[13px] font-medium">Audit log</h2>
      </div>
      <p className="text-[11px] text-muted mb-3">
        Every approval, send, deletion, and settings change. Append-only — entries
        cannot be edited or removed by anyone, including owners.
      </p>

      <ul className="divide-y divide-hairline">
        {log.data?.items.map((entry) => (
          <li key={entry.id} className="py-2 flex items-baseline gap-3">
            <span className="num text-[11px] text-muted w-28 shrink-0">
              {new Date(entry.createdAt).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="num text-[11px] flex-1 truncate">{entry.action}</span>
            <span className="text-[11px] text-muted truncate max-w-[140px]">
              {entry.user ? [entry.user.firstName, entry.user.lastName].filter(Boolean).join(' ') || entry.user.email : 'system'}
            </span>
          </li>
        ))}
      </ul>
      {log.data?.items.length === 0 && <p className="text-[11px] text-muted py-3">Nothing logged yet.</p>}
    </section>
  );
}

/**
 * Sending mailboxes. Domain authentication is read from the sending provider;
 * a campaign can't be activated on a mailbox whose domain fails SPF or DKIM.
 */
function Mailboxes({ canWrite }: { canWrite: boolean }) {
  const mailboxes = trpc.mailboxes.list.useQuery();
  const utils = trpc.useUtils();
  const refresh = () => { utils.mailboxes.list.invalidate(); utils.campaigns.mailboxes.invalidate(); };
  const create = trpc.mailboxes.create.useMutation({ onSuccess: () => { refresh(); setDraft({ fromName: '', fromEmail: '', replyToEmail: '', dailyCap: 50 }); } });
  const update = trpc.mailboxes.update.useMutation({ onSuccess: refresh });
  const check = trpc.mailboxes.checkDomain.useMutation({ onSuccess: refresh });
  const gmailAvailable = trpc.mailboxes.gmailAvailable.useQuery();
  const disconnect = trpc.mailboxes.disconnectGmail.useMutation({ onSuccess: refresh });
  const [draft, setDraft] = useState({ fromName: '', fromEmail: '', replyToEmail: '', dailyCap: 50 });
  const error = create.error ?? update.error ?? check.error ?? disconnect.error;
  // Where Google's consent screen sends the user back (read after mount, so server and client render alike).
  const [gmailOutcome, setGmailOutcome] = useState<string | null>(null);
  useEffect(() => setGmailOutcome(new URLSearchParams(window.location.search).get('gmail')), []);

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Mail className="size-3.5 text-muted" strokeWidth={1.75} />
        <h2 className="text-[13px] font-medium">Sending mailboxes</h2>
      </div>
      <p className="text-[11px] text-muted mb-4">
        The address campaigns send from. Its domain must pass SPF and DKIM before a campaign using it can be activated: checked
        with your email provider, or from DNS for a mailbox that sends through Gmail.
      </p>
      <ul className="divide-y divide-hairline border border-hairline rounded-card mb-4">
        {mailboxes.data?.map((m) => (
          <li key={m.id} className={cn('p-3 flex flex-wrap items-center gap-2 text-micro', !m.isActive && 'opacity-60')}>
            <span className="flex-1 min-w-[180px]">
              <span className="font-medium">{m.fromName}</span> <span className="text-muted">&lt;{m.fromEmail}&gt;</span>
              <span className="block text-[11px] text-muted">
                {m.dailyCap}/day{m.replyToEmail && ` · replies to ${m.replyToEmail}`}
                {m.gmailConnected ? ` · sends through Gmail as ${m.oauthEmail}` : m.provider === 'RESEND' ? ' · sends through the email provider' : ''}
              </span>
              {m.oauthError && <span className="block text-[11px] text-blocked">Gmail: {m.oauthError}</span>}
            </span>
            <span className={cn('text-[11px]', m.spfVerified && m.dkimVerified ? 'text-cleared' : 'text-held')}>
              {m.spfVerified && m.dkimVerified ? 'SPF and DKIM verified' : 'Domain not verified'}
            </span>
            {canWrite && (
              <>
                <button type="button" className="btn-ghost h-7 text-[11px]" disabled={check.isPending} onClick={() => check.mutate({ id: m.id })}>
                  <RefreshCw className={cn('size-3', check.isPending && check.variables?.id === m.id && 'animate-spin')} /> Check domain
                </button>
                <button type="button" className="btn-ghost h-7 text-[11px]" disabled={update.isPending} onClick={() => update.mutate({ id: m.id, data: { isActive: !m.isActive } })}>
                  {m.isActive ? 'Turn off' : 'Turn on'}
                </button>
                {gmailAvailable.data && (m.gmailConnected ? (
                  <button type="button" className="btn-ghost h-7 text-[11px]" disabled={disconnect.isPending}
                          onClick={() => { if (confirm(`Disconnect Gmail for ${m.fromEmail}? Relay's access is revoked at Google and the mailbox is turned off.`)) disconnect.mutate({ id: m.id }); }}>
                    Disconnect Gmail
                  </button>
                ) : (
                  <a className="btn-ghost h-7 text-[11px]" href={`/api/oauth/google/start?mailboxId=${m.id}`}>{m.oauthError ? 'Reconnect Gmail' : 'Send with Gmail'}</a>
                ))}
              </>
            )}
          </li>
        ))}
        {mailboxes.data?.length === 0 && <li className="p-3 text-micro text-muted">No mailboxes yet.</li>}
      </ul>
      {check.data && <p className={cn('text-[11px] mb-3', check.data.spf && check.data.dkim ? 'text-cleared' : 'text-held')}>{check.data.detail}</p>}
      {gmailOutcome && <p className={cn('text-[11px] mb-3', gmailOutcome === 'connected' ? 'text-cleared' : 'text-held')}>{gmailOutcome === 'connected' ? 'Gmail connected. Domain authentication was checked from DNS.' : `Gmail: ${gmailOutcome}`}</p>}
      {gmailAvailable.data === false && canWrite && <p className="text-[11px] text-muted mb-3">To send from a Gmail or Google Workspace inbox, set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (OAuth web client, redirect URI …/api/oauth/google/callback).</p>}
      {canWrite && (
        <form className="grid sm:grid-cols-[1fr_1fr_1fr_80px_auto] gap-2 items-end" onSubmit={(e) => { e.preventDefault(); create.mutate(draft); }}>
          <label className="text-[11px]"><span className="eyebrow block mb-1">From name</span><input required className="input" value={draft.fromName} onChange={(e) => setDraft({ ...draft, fromName: e.target.value })} /></label>
          <label className="text-[11px]"><span className="eyebrow block mb-1">From email</span><input required type="email" className="input" value={draft.fromEmail} onChange={(e) => setDraft({ ...draft, fromEmail: e.target.value })} /></label>
          <label className="text-[11px]"><span className="eyebrow block mb-1">Reply-to (optional)</span><input type="email" className="input" value={draft.replyToEmail} onChange={(e) => setDraft({ ...draft, replyToEmail: e.target.value })} /></label>
          <label className="text-[11px]"><span className="eyebrow block mb-1">Per day</span><input type="number" min={1} max={500} className="input num" value={draft.dailyCap} onChange={(e) => setDraft({ ...draft, dailyCap: Number(e.target.value) })} /></label>
          <button type="submit" className="btn-primary h-9 text-micro" disabled={create.isPending}>Add</button>
        </form>
      )}
      {error && <p className="text-[11px] text-blocked mt-2">{error.message}</p>}
    </section>
  );
}
