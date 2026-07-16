import { Link } from 'react-router-dom';

export function ShopPage() {
  return (
    <main className="centered-page">
      <section className="auth-card" aria-labelledby="shop-title">
        <p className="eyebrow">KSU SUPPLY</p>
        <h1 id="shop-title">Merch is coming down the road.</h1>
        <p>We’ll put shirts, patches, and other KSU gear here when the first drop is ready. This page is intentionally a placeholder—no checkout or payment flow is enabled yet.</p>
        <Link className="secondary-button" to="/">Back to rideksu.com</Link>
      </section>
    </main>
  );
}
