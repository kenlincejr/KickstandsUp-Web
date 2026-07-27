import { NavLink, Outlet } from 'react-router-dom';
import type { MouseEvent } from 'react';
import { useAuth } from '../features/auth/auth-context';
import { confirmNavigation } from '../features/navigation-guard';

export function AppShell() {
  const { signOut, user } = useAuth();
  // Pages with unsaved work (the trip editor) register a guard; nav links ask
  // before discarding it instead of silently unmounting a dirty itinerary.
  const guardClick = (event: MouseEvent) => { if (!confirmNavigation()) event.preventDefault(); };

  return (
    <div className="app-frame">
      <aside className="rail">
        <NavLink className="wordmark" onClick={guardClick} to="/">KSU</NavLink>
        <nav aria-label="Workspace">
          <NavLink onClick={guardClick} to="/app/rides">My rides</NavLink>
          <NavLink onClick={guardClick} to="/app/routes">My routes</NavLink>
          <NavLink onClick={guardClick} to="/app/planner">Plan a route</NavLink>
          <NavLink onClick={guardClick} to="/app/trips">Plan a trip</NavLink>
          <NavLink onClick={guardClick} to="/app/clubs">Club command</NavLink>
          <NavLink onClick={guardClick} to="/app/account">Account</NavLink>
        </nav>
        <div className="rail-account">
          <span>{user?.email ?? 'Signed in rider'}</span>
          <button className="text-button" type="button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>
      <main className="workspace"><Outlet /></main>
    </div>
  );
}
