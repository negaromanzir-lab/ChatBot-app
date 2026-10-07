import { ChatPage } from './pages/ChatPage.jsx';
import { AuthScreen } from './components/auth/AuthScreen.jsx';
import { useAuth } from './hooks/useAuth.js';

function App() {
  const auth = useAuth();

  if (auth.isLoading) {
    return <main className="app-loading" role="status">Loading your account…</main>;
  }

  if (!auth.user) {
    return (
      <AuthScreen
        initialError={auth.error}
        onSignIn={auth.signIn}
        onSignUp={auth.signUp}
      />
    );
  }

  return <ChatPage user={auth.user} onSignOut={auth.signOut} />;
}

export default App;
