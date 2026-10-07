import { useState } from 'react';
import { Button } from '../ui/Button.jsx';
import './AuthScreen.css';

export function AuthScreen({ initialError = null, onSignIn, onSignUp }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegistering = mode === 'register';

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await (isRegistering ? onSignUp : onSignIn)({ email, password });
    } catch (caught) {
      setError(caught.message || 'Could not authenticate. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setError(null);
    setPassword('');
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-card__brand" aria-hidden="true">✦</div>
        <h1 className="auth-card__title" id="auth-title">
          {isRegistering ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="auth-card__description">
          {isRegistering
            ? 'Sign up to keep your conversations synced and private.'
            : 'Sign in to continue to your conversations.'}
        </p>

        {error && <p className="auth-card__error" role="alert">{error}</p>}

        <form className="auth-card__form" onSubmit={handleSubmit}>
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={isRegistering ? 'new-password' : 'current-password'}
            required
            minLength={12}
            maxLength={72}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {isRegistering && (
            <span className="auth-card__hint">Use at least 12 characters.</span>
          )}
          <Button variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : isRegistering ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <p className="auth-card__switch">
          {isRegistering ? 'Already have an account?' : 'New to Chatbot?'}{' '}
          <button
            type="button"
            onClick={() => changeMode(isRegistering ? 'login' : 'register')}
          >
            {isRegistering ? 'Sign in' : 'Create account'}
          </button>
        </p>
      </section>
    </main>
  );
}

export default AuthScreen;
