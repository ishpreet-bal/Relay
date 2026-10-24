import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';

export default function SignInPage() {
  return (
    <main className="min-h-screen grid place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <p className="eyebrow mb-3">Relay</p>
        <h1 className="text-2xl font-semibold mb-6">Sign in to your workspace</h1>
        <SignIn fallbackRedirectUrl="/workspace" appearance={{ elements: { rootBox: 'w-full', card: 'shadow-card border border-hairline' } }} />
        <p className="mt-6 flex gap-4 text-micro text-muted"><Link href="/about">About Relay</Link><Link href="/privacy">Privacy policy</Link></p>
      </div>
    </main>
  );
}
