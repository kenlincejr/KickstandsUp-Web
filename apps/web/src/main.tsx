import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/app';
import { AuthProvider } from './features/auth/auth-context';
import { CapabilityProvider } from './features/capability-context';
import './styles.css';

const root = document.getElementById('root');

if (!root) throw new Error('KSU web root was not found.');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CapabilityProvider>
          <App />
        </CapabilityProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
