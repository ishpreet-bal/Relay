import Link from 'next/link';
import { Wordmark } from './brand';
import { BRAND, siteEmails } from '@/site/config';
import { SERVICES } from '@/site/content/services';

export function SiteFooter() {
  const emails = siteEmails();
  const year = new Date().getFullYear();
  return (
    <footer className="on-dark relative overflow-hidden">
      <div className="absolute inset-0 s-grid-bg opacity-60 pointer-events-none" aria-hidden="true" />
      <div className="s-container relative pt-20 pb-10">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link href="/" className="inline-block rounded-md text-site-paper"><Wordmark /></Link>
            <p className="mt-6 s-h3 max-w-sm text-site-paper">{BRAND.tagline}</p>
            <Link href="/contact" className="s-btn-light mt-8">Book a free consultation</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 lg:col-span-7">
            <FooterColumn title="Services" links={SERVICES.map((s) => ({ href: s.href, label: s.name }))} />
            <FooterColumn title="Explore" links={[
              { href: '/industries', label: 'Industries' },
              { href: '/demos', label: 'Demos' },
              { href: '/how-it-works', label: 'How it works' },
              { href: '/about', label: 'About' },
            ]} />
            <FooterColumn title="Company" links={[
              { href: '/contact', label: 'Contact' },
              { href: '/privacy', label: 'Privacy policy' },
              { href: '/workspace', label: 'Client sign-in' },
            ]} />
          </div>
        </div>
        <p aria-hidden="true" className="mt-16 select-none font-serif leading-[0.8] tracking-[-0.06em] text-[clamp(6rem,24vw,22rem)] bg-gradient-to-b from-white/[0.09] to-white/0 bg-clip-text text-transparent">{BRAND.name}</p>
        <div className="pt-6 border-t border-site-seam flex flex-col sm:flex-row gap-3 sm:items-center justify-between text-[0.82rem] text-site-haze">
          <p>© {year} {BRAND.name}. Serving businesses across {BRAND.region}.</p>
          {emails && (
            <p className="flex flex-wrap gap-x-5 gap-y-1">
              <a className="hover:text-site-paper" href={`mailto:${emails.hello}`}>{emails.hello}</a>
              <a className="hover:text-site-paper" href={`mailto:${emails.support}`}>{emails.support}</a>
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="s-eyebrow mb-4">{title}</p>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.href}><Link href={l.href} className="text-[0.94rem] text-site-paper/85 hover:text-site-paper transition-colors">{l.label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
