'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = '/library';
    } else {
      setError(true);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-950 relative overflow-hidden">
      {/* Soft stage-light glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(251,191,36,0.08), transparent 70%)' }}
      />

      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-8 w-[22rem]">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-amber-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </span>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">Setlist Builder</h1>
        </div>
        <p className="text-sm text-zinc-500 mb-6">Enter password to continue</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(false); }}
            className="w-full"
            autoFocus
          />
          {error && <p className="text-red-400 text-xs">Incorrect password</p>}
          <button type="submit" className="w-full btn-primary py-2.5">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
