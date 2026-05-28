'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/shared/AuthProvider';

export default function LoginPage() {
  const { login, register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="min-h-screen pt-32 px-6 flex items-start justify-center">
      <form
        className="glass-card rounded-2xl p-8 w-full max-w-md space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            if (mode === 'login') await login(email, password);
            else await register(email, password);
            router.push('/daily-pick');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Auth failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="editorial-heading text-3xl text-center mb-6">
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        </h1>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (8+ characters)"
          className="w-full rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm"
          required
          minLength={8}
        />
        {error && <p className="font-mono text-xs text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-primary py-3 font-mono text-sm text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Start Free Trial'}
        </button>
        <button
          type="button"
          className="w-full font-mono text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Need an account? Register (7-day Pro trial)' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
