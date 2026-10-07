import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App.jsx'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    {publishableKey ? (
      <ClerkProvider publishableKey={publishableKey}>
        <App />
      </ClerkProvider>
    ) : (
      <main className="app-loading" role="alert">
        Configure VITE_CLERK_PUBLISHABLE_KEY in .env to enable sign in.
      </main>
    )}
  </StrictMode>,
)
