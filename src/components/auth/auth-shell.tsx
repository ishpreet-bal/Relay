import Link from 'next/link';
import { ArrowLeft, ArrowRight, ClipboardList, Inbox, Radar } from 'lucide-react';
import { Wordmark } from '@/components/site/brand';
import { BRAND } from '@/site/config';

// What the workspace holds. Descriptions only: no numbers, nothing invented.
const FEATURES = [
  { icon: Radar, title: 'Leads', text: 'Found, researched and qualified, with sources.' },
  { icon: Inbox, title: 'Inquiries', text: 'Website messages, ready to answer.' },
  { icon: ClipboardList, title: 'Delivery', text: 'Projects, applications and billing.' },
];

/**
 * The frame around Clerk's sign-in and sign-up forms: a midnight brand
 * panel on large screens, and the form on warm paper. On phones only the
 * form shows, under the wordmark.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] bg-site-paper text-site-night">
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-site-night text-site-paper p-12 xl:p-16">
        <div className="absolute inset-0 auth-grid pointer-events-none" aria-hidden="true" />
        <div className="absolute -top-44 -left-36 size-[560px] rounded-full bg-site-signal/30 blur-[120px] pointer-events-none auth-drift" aria-hidden="true" />
        <div className="absolute -bottom-52 -right-32 size-[460px] rounded-full bg-site-coral/15 blur-[110px] pointer-events-none auth-drift-slow" aria-hidden="true" />

        <Link href="/" className="relative self-start rounded-lg auth-rise focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-spark" aria-label={`${BRAND.name} home`}>
          <Wordmark />
        </Link>

        <div className="relative max-w-md">
          <p className="auth-rise font-mono text-[0.72rem] uppercase tracking-[0.14em] text-site-spark" style={{ '--d': '80ms' } as React.CSSProperties}>
            The {BRAND.name} workspace
          </p>
          <p className="auth-rise mt-5 text-[clamp(2.4rem,3.6vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-balance" style={{ '--d': '160ms' } as React.CSSProperties}>
            Your business.{' '}
            <span className="font-serif italic font-normal tracking-[-0.03em] text-site-spark" style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 100" }}>Running smarter.</span>
          </p>

          <ol className="relative mt-12">
            <span className="absolute left-[19px] top-6 bottom-6 w-px auth-thread" aria-hidden="true" />
            {FEATURES.map((f, i) => (
              <li key={f.title} className="auth-rise relative flex items-start gap-4 py-3" style={{ '--d': `${280 + i * 110}ms` } as React.CSSProperties}>
                <span className="relative grid size-10 shrink-0 place-items-center rounded-xl border border-site-seam bg-site-deep text-site-spark">
                  <f.icon className="size-[18px]" aria-hidden="true" />
                </span>
                <span className="pt-0.5">
                  <span className="block text-[0.98rem] font-medium">{f.title}</span>
                  <span className="block text-[0.9rem] leading-snug text-site-haze">{f.text}</span>
                </span>
              </li>
            ))}
          </ol>

          <p className="auth-rise mt-8 inline-flex items-center gap-2.5 rounded-full border border-site-seam bg-site-deep/70 py-1.5 pl-3 pr-4 text-[0.85rem] text-site-haze" style={{ '--d': '640ms' } as React.CSSProperties}>
            <span className="size-1.5 rounded-full bg-site-tide auth-pulse" aria-hidden="true" />
            Nothing goes out without your approval.
          </p>
        </div>

        <p className="relative flex flex-wrap gap-x-6 gap-y-2 text-[0.8rem] text-site-haze">
          <span>© {new Date().getFullYear()} {BRAND.name}</span>
          <Link href="/privacy" className="transition-colors hover:text-site-paper">Privacy</Link>
          <Link href="/contact" className="transition-colors hover:text-site-paper">Contact</Link>
        </p>
      </aside>

      <main className="relative flex min-h-dvh flex-col px-4 py-5 sm:px-10 sm:py-7">
        <div className="absolute inset-x-0 top-0 h-[520px] auth-grid-light pointer-events-none" aria-hidden="true" />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[360px] w-[620px] max-w-full rounded-full bg-site-signal/10 blur-[100px] pointer-events-none" aria-hidden="true" />

        <header className="relative flex items-center justify-between gap-4">
          <Link href="/" className="lg:hidden rounded-lg" aria-label={`${BRAND.name} home`}><Wordmark /></Link>
          <Link href="/" className="group ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.85rem] text-site-fog transition-colors hover:bg-site-chalk hover:text-site-night">
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
            Back to website
          </Link>
        </header>

        <div className="relative flex flex-1 items-center justify-center py-10">
          <div className="auth-rise w-full max-w-[420px]" style={{ '--d': '120ms' } as React.CSSProperties}>
            {children}
            <p className="mt-6 text-center text-[0.88rem] text-site-fog">
              Not a client yet?{' '}
              <Link href="/contact" className="group inline-flex items-center gap-1 font-medium text-site-night underline decoration-site-rule underline-offset-4 transition-colors hover:decoration-site-signal">
                Book a free consultation
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </p>
          </div>
        </div>

        <p className="relative flex justify-center gap-x-5 text-[0.78rem] text-site-fog lg:hidden">
          <Link href="/privacy" className="hover:text-site-night">Privacy</Link>
          <Link href="/about" className="hover:text-site-night">About</Link>
          <Link href="/contact" className="hover:text-site-night">Contact</Link>
        </p>
      </main>
    </div>
  );
}
