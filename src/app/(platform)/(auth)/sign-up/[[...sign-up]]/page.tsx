import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { AuthShell } from '@/components/auth/auth-shell';
import { clerkAppearance } from '@/components/auth/clerk-appearance';

export const metadata: Metadata = { title: 'Create your account', robots: { index: false } };

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp fallbackRedirectUrl="/workspace" appearance={clerkAppearance} />
    </AuthShell>
  );
}
