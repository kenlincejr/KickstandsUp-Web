import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './app-shell';
import { ProtectedRoute } from '../features/auth/protected-route';
import { AuthCallbackPage } from '../features/auth/auth-callback-page';
import { SignInPage } from '../features/auth/sign-in-page';
import { ClubConsolePage } from '../features/club-console-page';
import { SiteHomePage } from '../features/site/site-home-page';
import { HowItWorksPage } from '../features/site/how-it-works-page';
import { TheAppPage } from '../features/site/the-app-page';
import { ForClubsPage } from '../features/site/for-clubs-page';
import { FaqPage } from '../features/site/faq-page';
import { RoutePlannerPage } from '../features/route-planner-page';
import { PremiumRoute } from '../features/premium-route';
import { ShopPage } from '../features/shop-page';
import { AccountPage } from '../features/account-page';
import { RouteDetailPage } from '../features/route-detail-page';
import { RouteLibraryPage } from '../features/route-library-page';
import { RideListPage } from '../features/ride-list-page';
import { RideRoutePage } from '../features/ride-route-page';
import { TripAuthoringRoute } from '../features/trip-authoring-route';
import { TripCreatePage } from '../features/trip-create-page';
import { TripEditorPage } from '../features/trip-editor-page';
import { TripListPage } from '../features/trip-list-page';

export function App() {
  return (
    <Routes>
      {/* Public marketing site. The long single-page landing was split: the
          homepage is hero + colophon, and each nav link owns its own page. */}
      <Route path="/" element={<SiteHomePage />} />
      <Route path="/how-it-works" element={<HowItWorksPage />} />
      <Route path="/the-app" element={<TheAppPage />} />
      <Route path="/for-clubs" element={<ForClubsPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/login" element={<Navigate to="/signin" replace />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/signup" element={<SignInPage mode="signup" />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="rides" replace />} />
          <Route path="rides" element={<RideListPage />} />
          <Route path="rides/:rideId/route" element={<RideRoutePage />} />
          <Route path="routes" element={<RouteLibraryPage />} />
          <Route path="routes/:routeId" element={<RouteDetailPage />} />
          <Route element={<PremiumRoute />}>
            <Route path="planner" element={<RoutePlannerPage />} />
          </Route>
          <Route element={<TripAuthoringRoute />}>
            <Route path="trips" element={<TripListPage />} />
            <Route path="trips/new" element={<TripCreatePage />} />
            <Route path="trips/:rideId" element={<TripEditorPage />} />
          </Route>
          <Route path="clubs" element={<ClubConsolePage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
