import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './app-shell';
import { ProtectedRoute } from '../features/auth/protected-route';
import { AuthCallbackPage } from '../features/auth/auth-callback-page';
import { SignInPage } from '../features/auth/sign-in-page';
import { ClubConsolePage } from '../features/club-console-page';
import { HomePage } from '../features/home-page';
import { RoutePlannerPage } from '../features/route-planner-page';
import { PremiumRoute } from '../features/premium-route';
import { ShopPage } from '../features/shop-page';
import { AccountPage } from '../features/account-page';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/login" element={<Navigate to="/signin" replace />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="account" replace />} />
          <Route element={<PremiumRoute />}>
            <Route path="planner" element={<RoutePlannerPage />} />
          </Route>
          <Route path="clubs" element={<ClubConsolePage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
