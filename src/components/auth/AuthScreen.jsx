import { useState } from 'react';
import { SignIn, SignUp } from '@clerk/react';
import './AuthScreen.css';

export function AuthScreen() {
  const [mode, setMode] = useState('login');
  const isRegistering = mode === 'register';
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

        {isRegistering ? <SignUp routing="hash" /> : <SignIn routing="hash" />}

        <p className="auth-card__switch">
          {isRegistering ? 'Already have an account?' : 'New to Chatbot?'}{' '}
          <button
            type="button"
            onClick={() => setMode(isRegistering ? 'login' : 'register')}
          >
            {isRegistering ? 'Sign in' : 'Create account'}
          </button>
        </p>
      </section>
    </main>
  );
}

export default AuthScreen;
