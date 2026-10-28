'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Wordmark } from './brand';
import { BRAND, NAV } from '@/site/config';
import { SERVICES } from '@/site/content/services';

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className={`sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300 border-b ${scrolled || open ? 'bg-site-paper/85 backdrop-blur-md border-site-rule' : 'bg-transparent border-transparent'}`}>
      <div className="s-container flex h-[72px] items-center justify-between gap-6">
        <Link href="/" className="shrink-0 rounded-md" aria-label={`${BRAND.name}, home`}>
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden lg:flex items-center gap-1">
          {NAV.map((item) => item.href === '/services' ? (
            <div key={item.href} className="relative group">
              <Link href={item.href} aria-current={active(item.href) ? 'page' : undefined} className={`s-navlink px-3.5 py-2 rounded-full text-[0.94rem] transition-colors ${active(item.href) ? 'text-site-night' : 'text-site-fog hover:text-site-night'}`}>
                {item.label}
              </Link>
              <div className="absolute left-1/2 top-full -translate-x-1/2 pt-3 opacity-0 invisible translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0">
                <div className="w-[440px] rounded-2xl border border-site-rule bg-site-chalk p-2 shadow-[0_24px_60px_-24px_rgba(11,18,32,0.35)]">
                  {SERVICES.map((s, i) => (
                    <Link key={s.key} href={s.href} className="flex gap-4 rounded-xl p-3.5 hover:bg-site-sand/60 hover:translate-x-1 transition-all duration-300">
                      <span className="font-mono text-[0.7rem] text-site-signal pt-1">0{i + 1}</span>
                      <span>
                        <span className="block text-[0.95rem] font-medium text-site-night">{s.name}</span>
                        <span className="block text-[0.85rem] text-site-fog leading-snug mt-0.5">{s.choiceDetail}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Link key={item.href} href={item.href} aria-current={active(item.href) ? 'page' : undefined}
              className={`s-navlink px-3.5 py-2 rounded-full text-[0.94rem] transition-colors ${active(item.href) ? 'text-site-night' : 'text-site-fog hover:text-site-night'}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-2">
          <Link href="/workspace" className="px-3.5 py-2 text-[0.94rem] text-site-fog hover:text-site-night transition-colors">Sign in</Link>
          <Link href="/contact" className="s-btn-primary h-10 px-5 text-[0.9rem]">Book a free consultation</Link>
        </div>

        <button type="button" className="lg:hidden -mr-2 grid size-11 place-items-center rounded-full text-site-night" aria-expanded={open} aria-controls="site-menu"
          aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div id="site-menu" className="lg:hidden fixed inset-x-0 top-[72px] bottom-0 overflow-y-auto bg-site-paper border-t border-site-rule s-rise">
          <nav aria-label="Main" className="s-container py-6 flex flex-col">
            <p className="s-eyebrow mb-3">Services</p>
            {SERVICES.map((s) => (
              <Link key={s.key} href={s.href} className="flex items-center justify-between py-3.5 border-b border-site-rule text-[1.05rem]">
                {s.name}<ArrowRight className="size-4 text-site-fog" />
              </Link>
            ))}
            <p className="s-eyebrow mt-8 mb-3">Explore</p>
            {NAV.filter((n) => n.href !== '/services').map((item) => (
              <Link key={item.href} href={item.href} className="flex items-center justify-between py-3.5 border-b border-site-rule text-[1.05rem]">
                {item.label}<ArrowRight className="size-4 text-site-fog" />
              </Link>
            ))}
            <div className="mt-8 grid gap-3">
              <Link href="/contact" className="s-btn-primary">Book a free consultation</Link>
              <Link href="/workspace" className="s-btn-quiet">Sign in</Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
