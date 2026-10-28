'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * One script for the whole site's motion. Elements opt in with data
 * attributes, so pages stay server-rendered:
 *   data-reveal  rises into view when scrolled to (stagger with style --d)
 *   data-spot    a soft light follows the pointer
 *   data-tilt    the card leans toward the pointer
 */
export function MotionRoot() {
  const pathname = usePathname();

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const watch = () => document.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => (reduced ? el.classList.add('is-in') : io.observe(el)));
    watch();
    // Client components mount content after the first pass; pick those up too.
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [pathname]);

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-spot],[data-tilt]') ?? null;
      if (last && last !== el) reset(last);
      last = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', `${x * 100}%`);
      el.style.setProperty('--my', `${y * 100}%`);
      if (!reduced && el.hasAttribute('data-tilt')) {
        const strength = Number(el.dataset.tilt) || 5;
        el.style.setProperty('--rx', `${(0.5 - y) * strength}deg`);
        el.style.setProperty('--ry', `${(x - 0.5) * strength}deg`);
      }
    };
    const reset = (el: HTMLElement) => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); };
    const onLeave = () => { if (last) reset(last); last = null; };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => { window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave); };
  }, []);

  // data-rise: the element leans back and stands up as it scrolls into place.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>('[data-rise]').forEach((el) => {
        const top = el.getBoundingClientRect().top;
        const t = Math.min(1, Math.max(0, (vh - top) / (vh * 0.7)));
        el.style.setProperty('--rise', `${(1 - t) * 16}deg`);
        el.style.setProperty('--rise-scale', `${0.94 + t * 0.06}`);
      });
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [pathname]);

  return null;
}

/** A card with a front and a back. Click (or Enter/Space) turns it over. */
export function FlipCard({ front, back, label, className = '', height = 'h-[440px]' }: {
  front: React.ReactNode; back: React.ReactNode; label: string; className?: string; height?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={`s-flip ${height} ${flipped ? 'is-flipped' : ''} ${className}`}>
      <div className="s-flip-inner">
        <div className="s-face s-face-front" aria-hidden={flipped} inert={flipped || undefined}>
          {front}
          <button type="button" onClick={() => setFlipped(true)} aria-label={`${label}: see what’s included`} className="absolute inset-0 z-10 cursor-pointer rounded-[28px]" />
        </div>
        <div className="s-face s-face-back" aria-hidden={!flipped} inert={!flipped || undefined}>
          {back}
          <button type="button" onClick={() => setFlipped(false)} className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full border border-current/20 text-[0.9rem] opacity-70 hover:opacity-100 transition-opacity" aria-label={`${label}: turn back`}>↺</button>
        </div>
      </div>
    </div>
  );
}

/**
 * A sentence whose words light up, one by one, as it scrolls through the
 * middle of the screen.
 */
export function ScrollWords({ text, className = '', accentFrom }: { text: string; className?: string; accentFrom?: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(' ');
  const [lit, setLit] = useState(words.length);

  // Before paint, so the sentence never flashes fully lit.
  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the sentence enters the lower part of the screen, 1 by the time it reaches the upper third.
      const progress = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.55 + r.height * 0.4)));
      setLit(Math.round(progress * words.length));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [words.length]);

  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <span key={i} className={`s-lit-word ${i < lit ? 'is-lit' : ''} ${accentFrom != null && i >= accentFrom ? 's-em' : ''}`}>{w}{i < words.length - 1 ? ' ' : ''}</span>
      ))}
    </p>
  );
}
