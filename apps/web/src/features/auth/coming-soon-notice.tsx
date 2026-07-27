import { useEffect, useRef } from 'react';

/**
 * "Not live yet" dialog for the auth pages' store badges. There is no real
 * store URL to send someone to — a Link to /the-app just lands them on
 * another page with the same two badges, which is the loop this replaces.
 *
 * Deliberately a separate component from the marketing site's LaunchNote
 * (features/site/site-chrome.tsx), not a shared one: that modal lives behind
 * `.ksu-site`'s LaunchNoteContext and its `ksu-site-modal` classes only render
 * under the `.ksu-site` scope (enforced by site-content.test.ts), and these
 * dark auth pages are deliberately outside that scope. Same message, told
 * twice on purpose rather than one component reaching across a scope boundary.
 */
export function ComingSoonNotice({ onClose }: { onClose: () => void }) {
  const dismissRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    dismissRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="auth-modal-bg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-coming-soon-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="auth-modal">
        <p className="kicker">Almost ready to roll</p>
        <h2 id="auth-coming-soon-title">Not live in the stores yet.</h2>
        <p>The KSU app is in final testing and lands on the App Store and Google Play shortly. Once it does, download it, sign in, and set up your rider profile — then this same login gets you in here too.</p>
        <button ref={dismissRef} className="primary-button" type="button" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
