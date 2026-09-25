import { Link } from 'react-router-dom'
import PwaInstall from '../components/PwaInstall'

const FEATURES = [
  { title: 'Freight management', body: 'Post cargo, quote in USD, and dispatch jobs from one operations board.' },
  { title: 'Carrier network', body: 'Cover lanes with carriers, trucks, trailers, and assigned drivers.' },
  { title: 'Live tracking', body: 'See status, trucks, and lanes as freight moves from pickup to delivery.' },
  { title: 'Proof of delivery', body: 'Close trips with a clear timeline and delivery documents.' },
]

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand">
          <span className="brand-mark">MX</span>
          <strong>MizigoX</strong>
        </div>
        <div className="landing-nav-actions">
          <PwaInstall />
          <Link to="/login" className="btn">
            Sign in
          </Link>
        </div>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <p className="page-kicker">East African freight operations</p>
          <h1 id="landing-title">Move cargo. Move business.</h1>
          <p className="landing-lead">
            MizigoX is logistics software for posting cargo, dispatching carriers, tracking trucks, and closing
            deliveries — quoted in USD for East African lanes.
          </p>
          <div className="landing-cta">
            <Link to="/login" className="btn">
              Open MizigoX
            </Link>
            <a className="btn ghost" href="#how-it-works">
              How it works
            </a>
          </div>
        </section>

        <section className="landing-grid" aria-label="Product capabilities">
          {FEATURES.map((item) => (
            <article key={item.title} className="landing-card">
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
        </section>

        <section className="landing-steps" id="how-it-works">
          <h2>How a shipment moves</h2>
          <ol>
            <li>A customer posts cargo, packing point, weight, and loading date.</li>
            <li>Operations quotes in USD and sends the job to carriers.</li>
            <li>A carrier accepts and assigns truck and driver details.</li>
            <li>The driver runs pickup, transit, delivery, and proof of delivery.</li>
          </ol>
        </section>
      </main>

      <footer className="landing-foot">
        <span>MizigoX</span>
        <Link to="/login">Sign in</Link>
      </footer>
    </div>
  )
}
