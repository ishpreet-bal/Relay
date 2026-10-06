import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <main className="min-h-screen grid place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <p className="eyebrow mb-3">Relay</p>
        <h1 className="text-2xl font-semibold mb-6">Create your account</h1>
        <SignUp appearance={{ elements: { rootBox: 'w-full', card: 'shadow-card border border-hairline' } }} />
      </div>
    </main>
  );
}
