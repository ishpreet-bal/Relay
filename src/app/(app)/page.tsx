import { redirect } from 'next/navigation';

/** The app root is not a destination — the pipeline starts at the overview. */
export default function HomePage() {
  redirect('/dashboard');
}
