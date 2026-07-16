import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/auth-context';

export function AppShell() {
  const { signOut, user } = useAuth();

  return (
    <div className="app-frame">
      <aside className="rail">
        <NavLink className="wordmark" to="/">KSU</NavLink>
        <nav aria-label="Workspace">
          <NavLink to="/app/routes">My routes</NavLink>
          <NavLink to="/app/planner">Plan a route</NavLink>
          <NavLink to="/app/clubs">Club command</NavLink>
          <NavLink to="/app/account">Account</NavLink>
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
