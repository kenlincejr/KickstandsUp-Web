// The Apple and Google Play brand marks, as inline SVG. Pulled out to their own
// module so the marketing site (features/site, .ksu-site-scoped) and the auth
// pages (dark app shell, unscoped) render the identical glyph instead of two
// copies that could drift. Neither carries a `ksu-*` class — callers apply
// their own sizing className via props.

export function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export function GooglePlayGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true">
      <path fill="#00D0FF" d="M47 24 300 268 47 488c-9-5-15-15-15-27V51c0-12 6-22 15-27z" />
      <path fill="#00F076" d="M47 24c8-4 17-4 25 1l253 145-58 58z" />
      <path fill="#FFC900" d="M383 214l58 33c19 11 19 33 0 44l-58 33-58-58z" />
      <path fill="#FF3A44" d="M47 488l220-236 58 58L72 487c-8 5-17 5-25 1z" />
    </svg>
  );
}
