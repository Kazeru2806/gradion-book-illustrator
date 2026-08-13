import { useState } from 'react';
import { api } from '../api.js';

export default function AuthForm({ onSignIn }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !email.includes('@')) {
      setError('Enter your name and a valid email to continue.');
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
    <div className="center-page">
      <div className="auth-card">
        <div className="logo-row">📖</div>
        <h3 style={{ textAlign: 'center', fontSize: 20 }}>Book Illustration Studio</h3>
        <p className="lede">Enter your details to start or resume an illustration project.</p>

        <form onSubmit={handleSubmit}>
          <div className="gd-field">
            <label htmlFor="f-name">Full name <span className="req">*</span></label>
            <input id="f-name" placeholder="Mira Hassan" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div className="gd-field">
            <label htmlFor="f-email">Email <span className="req">*</span></label>
            <input id="f-email" type="email" placeholder="mira@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="auth-error">{error}</div>
          <button id="btn-signin" type="submit" className="gd-btn gd-btn-primary" disabled={loading}>
            {loading ? <><span className="spinner sm" />Signing in…</> : <>Continue <span className="gd-arrow">→</span></>}
          </button>
        </form>

        <p className="meta" style={{ textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
          No password — using an email that already has projects resumes them exactly where you left off.
        </p>
      </div>
    </div>
  );
}
