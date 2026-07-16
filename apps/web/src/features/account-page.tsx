import { useCapabilities } from './capability-context';
import { useAuth } from './auth/auth-context';

function accessLabel(tier: string) {
  if (tier === 'premium') return 'Premium';
  if (tier === 'participant') return 'Participant';
  return 'Unavailable';
}

export function AccountPage() {
  const { user, signOut } = useAuth();
  const { loading, snapshot } = useCapabilities();
  const providers = user?.app_metadata.providers;
  const providerLabel = Array.isArray(providers) && providers.length ? providers.join(', ') : user?.app_metadata.provider ?? 'Supabase Auth';

  return <section className="tool-page account-page"><header className="tool-header"><div><p className="kicker">RIDER ACCOUNT</p><h1>Your KSU connection.</h1><p>Identity, access health, and the support details that help us get you rolling again.</p></div></header>
    <div className="account-grid">
      <article><span>IDENTITY</span><h2>{user?.email ?? 'Signed-in rider'}</h2><dl><dt>Sign-in</dt><dd>{providerLabel}</dd><dt>Support ID</dt><dd className="support-id">{user?.id ?? 'Unavailable'}</dd></dl></article>
      <article><span>ACCESS</span><h2>{loading ? 'Checking…' : accessLabel(snapshot.accountTier)}</h2><dl><dt>Projection</dt><dd>{snapshot.projectionState}</dd><dt>Checked</dt><dd>{new Date(snapshot.checkedAt).toLocaleString()}</dd><dt>Rollout</dt><dd>{snapshot.rolloutState}</dd></dl>{snapshot.projectionState !== 'ready' ? <p className="notice">New paid work stays paused until KSU can confirm your access. Saved and published ride details aren't deleted.</p> : null}</article>
      <article><span>HELP</span><h2>Need a hand?</h2><p>Include your Support ID when you contact us. Never send passwords, sign-in codes, or payment details.</p><a className="secondary-button" href="/support/">Open support</a><button className="text-button account-signout" type="button" onClick={() => void signOut()}>Sign out of this browser</button></article>
    </div>
  </section>;
}
