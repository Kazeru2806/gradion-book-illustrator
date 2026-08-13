import { useState } from 'react';
import { api } from '../api.js';

export default function AuthForm({ onSignIn }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Both name and email are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.signIn(email.trim(), name.trim());
      onSignIn(data.user, data.projects ?? []);
    } catch (err) {
      setError(err.message || 'Sign-in failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page page--narrow" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh', margin: '0 auto' }}>
      <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📖</div>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.375rem' }}>Book Illustrator</h1>
        <p style={{ fontSize: '0.9375rem' }}>Turn your story into an illustrated book with AI</p>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '1.25rem', fontSize: '1.125rem' }}>Sign in to continue</h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="field">
            <label htmlFor="auth-name">Your name</label>
            <input
              id="auth-name"
              className="input"
              type="text"
              placeholder="Ada Lovelace"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              className="input"
              type="email"
              placeholder="ada@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {error && (
            <div className="error-banner">
              <p>{error}</p>
            </div>
          )}

          <button
            id="btn-signin"
            type="submit"
            className="btn btn--primary btn--lg btn--full"
            disabled={loading}
          >
            {loading ? <><span className="spinner spinner--sm" />Signing in…</> : 'Continue →'}
          </button>
        </form>
      </div>

      <p className="text-muted mt-2" style={{ textAlign: 'center', fontSize: '0.8rem' }}>
        No password needed — we identify you by email.
      </p>
    </div>
  );
}
