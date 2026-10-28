import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { AuthShell } from '@/components/auth/auth-shell';
import { clerkAppearance } from '@/components/auth/clerk-appearance';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn fallbackRedirectUrl="/workspace" appearance={clerkAppearance} />
    </AuthShell>
  );
}
