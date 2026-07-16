const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>KSU rider connection</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top, #35200e, #100d0a 55%); color: #f8f4ed; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(580px, calc(100% - 48px)); padding: 72px 0; }
      .eyebrow { color: #f7a728; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
      h1 { font-size: clamp(2.5rem, 9vw, 4.5rem); letter-spacing: -.05em; line-height: .95; margin: 20px 0; }
      p { color: #d4cbc0; font-size: 1.1rem; line-height: 1.7; max-width: 510px; }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">Kickstands Up</div>
      <h1>A rider wants to connect.</h1>
      <p>Install or open KSU to send a trusted-rider request. KSU never shares location automatically.</p>
    </main>
  </body>
</html>`;

export function onRequestGet() {
  return new Response(page, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'",
      "Content-Type": "text/html; charset=UTF-8",
      "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
