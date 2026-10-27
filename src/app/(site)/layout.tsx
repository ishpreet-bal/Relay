import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import { SiteNav } from '@/components/site/site-nav';
import { SiteFooter } from '@/components/site/site-footer';
import { BRAND, siteUrl } from '@/site/config';
import './site.css';

/*
 * The public website's root layout. It is separate from the app's on
 * purpose: no sign-in scripts, no app providers and no private data, so
 * the pages are static and fast, and nothing here can reach a workspace.
 */

const serif = Fraunces({ subsets: ['latin'], axes: ['opsz', 'SOFT'], style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });
const sans = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${BRAND.name} · Custom automation, customer acquisition and websites, fully managed`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: { type: 'website', siteName: BRAND.name, locale: 'en_CA' },
  twitter: { card: 'summary_large_image' },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = { themeColor: '#F5F1EA', width: 'device-width', initialScale: 1 };

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: BRAND.name,
    description: BRAND.description,
    url: siteUrl(),
    areaServed: { '@type': 'AdministrativeArea', name: 'Ontario, Canada' },
    serviceType: ['Business process automation', 'Custom software development', 'Lead generation', 'Website development'],
  };
  return (
    <html lang="en-CA" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 s-btn-primary">Skip to content</a>
        <SiteNav />
        <main id="main">{children}</main>
        <SiteFooter />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
