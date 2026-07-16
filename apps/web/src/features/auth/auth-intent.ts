const fallbackRoute = '/app/rides';
const storageKey = 'ksu.auth.returnTo';

export function safeReturnTo(value: string | null | undefined) {
  if (!value) return fallbackRoute;
  try {
    const url = new URL(value, 'https://rideksu.com');
    if (url.origin !== 'https://rideksu.com' || (url.pathname !== '/app' && !url.pathname.startsWith('/app/'))) return fallbackRoute;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallbackRoute;
  }
}

export function rememberReturnTo(value: string | null | undefined) {
  window.sessionStorage.setItem(storageKey, safeReturnTo(value));
}

export function consumeReturnTo() {
  const value = safeReturnTo(window.sessionStorage.getItem(storageKey));
  window.sessionStorage.removeItem(storageKey);
  return value;
}
