import { Fraunces, Geist } from 'next/font/google';
import './auth.css';

// Same type as the public site, so signing in feels like the same company.
// Scoped to this wrapper: the workspace keeps its own fonts.
const sans = Geist({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const serif = Fraunces({ subsets: ['latin'], axes: ['opsz', 'SOFT'], style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${sans.variable} ${serif.variable} font-sans antialiased`}>{children}</div>;
}
