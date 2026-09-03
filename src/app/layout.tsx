import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/shell/theme-provider';
import { TRPCProvider } from '@/lib/trpc/client';
import './globals.css';

const display = Archivo({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });
const body = Inter({ subsets: ['latin'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: { default: 'Foundry', template: '%s · Foundry' },
  description: 'Research-first outbound for AI automation agencies.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <body>
          <ThemeProvider>
            <TRPCProvider>{children}</TRPCProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
