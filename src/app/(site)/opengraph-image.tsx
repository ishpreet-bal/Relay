import { ImageResponse } from 'next/og';
import { BRAND } from '@/site/config';

export const alt = `${BRAND.name}: custom automation, customer acquisition and websites, fully managed`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The preview card shown when a page is shared. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#0B1220', color: '#F5F1EA', padding: 72,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '56px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="9" fill="#2450F0" /><circle cx="10.5" cy="20.5" r="3.6" fill="#F5F1EA" /><circle cx="21.5" cy="11.5" r="3.6" fill="none" stroke="#F5F1EA" strokeWidth="2.2" /><path d="M13.6 18.2c2.6-1.3 2.1-4.4 4.7-5.6" fill="none" stroke="#F5F1EA" strokeWidth="2.2" strokeLinecap="round" /></svg>
          <span style={{ fontSize: 44, letterSpacing: -1 }}>{BRAND.name}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 88, lineHeight: 1.02, letterSpacing: -3 }}>Your business.</span>
          <span style={{ fontSize: 88, lineHeight: 1.02, letterSpacing: -3, color: '#7C98FF', fontStyle: 'italic' }}>Running smarter.</span>
        </div>
        <span style={{ fontSize: 28, color: '#9AA4B8' }}>Automation · Customer acquisition · Websites. Built and run for you.</span>
      </div>
    ),
    size,
  );
}
