import type { Metadata } from 'next';
import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';
import { AuthShell } from '@/components/auth/auth-shell';
import { clerkAppearance } from '@/components/auth/clerk-appearance';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Create your account', robots: { index: false } };

/**
 * Accounts are created from an invitation (the link carries a Clerk ticket).
 * Without one, the first step explains that instead of offering a form.
 * Later steps of an invited sign-up (email code, SSO callback) have their own
 * paths and always render. This is guidance; the rule itself is enforced
 * where a workspace is created (services/workspace-access).
 */
export default async function SignUpPage({ params, searchParams }: { params: Promise<{ 'sign-up'?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ 'sign-up': step }, query] = await Promise.all([params, searchParams]);
  const invited = typeof query.__clerk_ticket === 'string' && query.__clerk_ticket.length > 0;
  const firstStep = !step || step.length === 0;
  if (firstStep && !invited && env().SIGNUP_MODE !== 'open') {
    return (
      <AuthShell>
        <div className="rounded-[1.25rem] border border-site-rule bg-white px-6 py-8 sm:px-9 shadow-[0_40px_80px_-48px_rgba(11,18,32,0.5)]">
          <h1 className="text-[1.45rem] font-semibold tracking-[-0.035em] text-site-night">Accounts are by invitation</h1>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-site-fog">
            If you were invited, use the link in your invitation email. It opens this page with your invitation attached.
          </p>
          <div className="mt-6 grid gap-3">
            <Link href="/contact" className="inline-flex h-11 items-center justify-center rounded-xl bg-site-signal px-5 text-[0.95rem] font-medium text-white transition-colors hover:bg-[#1D43D4]">Book a free consultation</Link>
            <Link href="/sign-in" className="inline-flex h-11 items-center justify-center rounded-xl border border-site-rule px-5 text-[0.95rem] font-medium text-site-night transition-colors hover:bg-site-paper">I already have an account</Link>
          </div>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <SignUp fallbackRedirectUrl="/workspace" appearance={clerkAppearance} />
    </AuthShell>
  );
}
