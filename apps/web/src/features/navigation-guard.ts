// A tiny unsaved-work registry so the AppShell's nav links can confirm before
// discarding a dirty editor (§7.7). The app uses the declarative router, which
// has no useBlocker; pages with unsaved state register a message here and the
// shell asks before navigating away. beforeunload covers the tab itself.
let guardMessage: string | null = null;

export function setNavigationGuard(message: string | null) {
  guardMessage = message;
}

/** True when navigation may proceed (no guard, or the rider confirmed). */
export function confirmNavigation(): boolean {
  return !guardMessage || window.confirm(guardMessage);
}
