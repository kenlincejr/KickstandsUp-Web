const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>KSU ride invite</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top, #35200e, #100d0a 55%); color: #f8f4ed; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(580px, calc(100% - 48px)); padding: 72px 0; }
      .eyebrow { color: #f7a728; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
      h1 { font-size: clamp(2.5rem, 9vw, 4.5rem); letter-spacing: -.05em; line-height: .95; margin: 20px 0; }
      p { color: #d4cbc0; font-size: 1.1rem; line-height: 1.7; max-width: 510px; }
      .notice { display: inline-block; margin-top: 20px; padding: 10px 14px; border: 1px solid #66584a; border-radius: 999px; color: #f7d18e; }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">Kickstands Up</div>
      <h1>You&rsquo;ve been invited to a KSU ride.</h1>
      <p>Install or open KSU to view the protected invite and choose whether to join.</p>
      <div class="notice">KSU never joins a ride automatically from a link.</div>
    </main>
  </body>
</html>`;

export function onRequestGet() {
  return new Response(page, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=UTF-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
