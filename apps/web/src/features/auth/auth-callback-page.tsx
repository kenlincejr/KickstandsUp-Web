import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './auth-context';
import { consumeReturnTo } from './auth-intent';

export function AuthCallbackPage() {
  const { loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate(consumeReturnTo(), { replace: true });
  }, [loading, navigate, user]);

  return <main className="centered-page">Finishing secure sign-in…</main>;
}
