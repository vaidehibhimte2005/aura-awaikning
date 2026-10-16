import { Link } from 'react-router-dom';
import {
  LuArrowRight, LuCalendarCheck, LuClock, LuHeartPulse, LuShieldCheck, LuSparkles, LuUserCheck, LuVideo, LuWallet,
} from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { AuraRings } from '../components/Brand.jsx';
import { SectionHeading } from '../components/SectionHeading.jsx';
import { ErrorState } from '../components/States.jsx';
import { TrainerCard } from '../components/TrainerCard.jsx';
import { EnrollForm } from '../training/EnrollForm.jsx';
import { PlanCard } from '../training/shared.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_HOME } from '../context/AuthContext.jsx';
import { formatPrice } from '../utils/format.js';

const BENEFITS = [
  { icon: LuHeartPulse, title: 'Calmer mind, steadier body', body: 'Guided breathwork, mindfulness and movement that fit into a real schedule.' },
  { icon: LuUserCheck, title: 'A real teacher, one to one', body: 'Every session is live with an experienced trainer — not a recording.' },
  { icon: LuCalendarCheck, title: 'Train when it suits you', body: 'Skip a day, double up later. Only completed sessions use your package.' },
  { icon: LuWallet, title: 'Fair, transparent pricing', body: 'See the original price, the discount and your savings before you pay.' },
];

const FEATURES = [
  { icon: LuVideo, title: 'Live trainer-led sessions', body: 'Pick a trainer and a time from their published availability. Your booking is confirmed instantly.' },
  { icon: LuClock, title: 'Flexible training days', body: 'A booking alone costs nothing. A training day is used only when a session actually takes place.' },
  { icon: LuShieldCheck, title: 'Verified payments', body: 'Access starts only after the payment is verified on our servers.' },
  { icon: LuSparkles, title: 'Reminders that help', body: 'Session and package-expiry reminders, with one-click renewal.' },
];

const STEPS = [
  { title: 'Create your account', body: 'Register in a minute with your email and mobile number.' },
  { title: 'Choose a plan', body: 'Daily, weekly or monthly — longer plans save more.' },
  { title: 'Book a live session', body: 'Browse trainers and reserve any open time slot.' },
  { title: 'Train and track', body: 'Join your session, then watch your days, history and renewals in one place.' },
];

const FAQS = [
  { q: 'What counts as a “training day”?', a: 'A training day is used only when you complete a session that meets our attendance policy — both you and the trainer attend. Booking a slot, or a calendar day passing, does not use one. If your trainer doesn’t show up, your day is kept.' },
  { q: 'Do I have to train every day?', a: 'No. Train on the days that suit you. If you complete sessions on Monday and Thursday, you have used two training days — not four. Your package still has a calendar expiry date, so plan to use your days before then.' },
  { q: 'How does booking work?', a: 'Trainers publish the times they are available. You pick a time and it is confirmed immediately — there is no approval step. You can cancel or reschedule up to the cut-off time before the session.' },
  { q: 'How are prices and discounts calculated?', a: 'Plans are priced from a per-day rate. Weekly and monthly plans include a discount, and the original price, discount and your savings are shown before you pay.' },
  { q: 'How do I pay, and when does my package start?', a: 'You pay securely online. Your package activates only after the payment has been verified by our server, and its validity starts at that moment.' },
  { q: 'Can I renew or upgrade?', a: 'Yes. When you are nearly out of days or close to expiry you can renew (the new package starts when the current one ends), or upgrade to a larger plan at any time. You’ll also get reminders before your package expires.' },
  { q: 'Who are the trainers?', a: 'Experienced guides who are personally registered by our team. Trainers cannot sign themselves up.' },
];

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  useSeo({ title: null, description: 'Live one-to-one wellness and awareness training with experienced trainers. Flexible daily, weekly and monthly plans — pay only for the days you train.' });
  const plans = useFetch('/packages');
  const trainers = useFetch('/trainers', { limit: 4 });
  const pkgs = plans.data?.packages || [];
  const cheapest = pkgs.length ? Math.min(...pkgs.map((p) => p.price.amount / p.price.trainingDays)) : null;
  const cur = plans.data?.config?.currency || 'INR';

  return (
    <>
      {/* ───── Hero ───── */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-grid">
          <div>
            <div className="eyebrow">Aura Awakening</div>
            <h1 id="hero-title">Awaken the awareness <em>within you.</em></h1>
            <p className="lead">Live, one-to-one training with experienced trainers — on your schedule. Choose a daily, weekly or monthly plan and book the times that suit you.</p>
            <div className="hero-actions">
              {isAuthenticated ? (
                <Link to={ROLE_HOME[user.role] || '/dashboard'} className="btn btn-gold">Go to my dashboard</Link>
              ) : (
                <a href="#enroll" className="btn btn-gold">Enroll now</a>
              )}
              <a href="#plans" className="btn btn-ghost-light">See plans &amp; pricing</a>
            </div>
            <div className="hero-meta">
              {cheapest !== null && <div><strong>{formatPrice(Math.round(cheapest), cur)}</strong><span>From, per training day</span></div>}
              <div><strong>1 : 1</strong><span>Live sessions</span></div>
              <div><strong>Instant</strong><span>Booking confirmation</span></div>
            </div>
          </div>
          <div className="hero-visual"><AuraRings animated rings={6} /></div>
        </div>
      </section>

      {/* ───── About ───── */}
      <section className="section section-white" id="about" aria-labelledby="about-title">
        <div className="container split">
          <div>
            <div className="eyebrow">About Aura Awakening</div>
            <h2 id="about-title">A sanctuary for the inner journey</h2>
            <p className="lead">Aura Awakening brings experienced guides to you through live video sessions. Each trainer works with you personally — on breath, attention, stress and energy — at a pace that respects your life.</p>
            <p>No fixed class timetable, no pre-recorded lectures. You choose the trainer, you choose the time, and you only use a training day when a session truly happens.</p>
            <a href="#how-it-works" className="link-arrow" style={{ marginTop: 12 }}>See how it works <LuArrowRight size={14} /></a>
          </div>
          <figure className="quote-panel" style={{ margin: 0 }}>
            <p>“Awareness is not something you achieve. It is what remains when you stop running from the present.”</p>
            <cite>The Aura Awakening way</cite>
            <AuraRings className="ornament" rings={4} />
          </figure>
        </div>
      </section>

      {/* ───── Benefits ───── */}
      <section className="section section-cream" id="benefits" aria-labelledby="benefits-title">
        <div className="container">
          <SectionHeading center eyebrow="Benefits" title="Why learners choose us" lead="Personal attention, flexible days and no surprises." id="benefits-title" />
          <div className="grid grid-4">
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <div className="feature" key={title}>
                <span className="feature-icon" aria-hidden><Icon /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── Features / live training ───── */}
      <section className="section section-dark on-dark" id="features" aria-labelledby="features-title">
        <div className="container">
          <SectionHeading eyebrow="Trainer-led live training" title="Real people. Real time. Your schedule." lead="Every session is a live video session with a trainer who has published that time just for bookings." id="features-title" />
          <div className="grid grid-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div className="feature" key={title}>
                <span className="feature-icon" aria-hidden><Icon /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── How it works ───── */}
      <section className="section section-white" id="how-it-works" aria-labelledby="how-title">
        <div className="container">
          <SectionHeading center eyebrow="How it works" title="From sign-up to session in four steps" id="how-title" />
          <ol className="steps" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {STEPS.map((s) => (
              <li className="step" key={s.title}><h3>{s.title}</h3><p>{s.body}</p></li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───── Trainers ───── */}
      {!!trainers.data?.length && (
        <section className="section section-cream" id="trainers" aria-labelledby="trainers-title">
          <div className="container">
            <SectionHeading center eyebrow="Your guides" title="Meet some of our trainers" id="trainers-title" />
            <div className="grid grid-4">{trainers.data.map((t) => <TrainerCard key={t._id} trainer={t} />)}</div>
            <div className="center" style={{ marginTop: 36 }}><Link to="/trainers" className="btn btn-outline">Meet all trainers</Link></div>
          </div>
        </section>
      )}

      {/* ───── Plans ───── */}
      <section className="section section-white" id="plans" aria-labelledby="plans-title">
        <div className="container">
          <SectionHeading center eyebrow="Plans & pricing" title="Pay for the days you train" lead="Longer plans cost less per day. Prices below are live — what you see is what you pay." id="plans-title" />
          {plans.error ? <ErrorState error={plans.error} onRetry={plans.reload} /> : plans.loading && !plans.data ? (
            <div className="plan-grid" aria-hidden>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 360, borderRadius: 10 }} />)}</div>
          ) : (
            <div className="plan-grid">
              {pkgs.map((p) => (
                <PlanCard key={p._id} pkg={p}>
                  <Link to={isAuthenticated ? `/dashboard/plans${user.role === 'learner' ? `?plan=${p._id}` : ''}` : `/register?plan=${p._id}`} className={`btn ${p.isFeatured ? 'btn-gold' : ''}`}>
                    {isAuthenticated && user.role !== 'learner' ? 'View plan' : `Choose ${p.name}`}
                  </Link>
                </PlanCard>
              ))}
            </div>
          )}
          <p className="price-note">Only completed sessions use a training day. Your package also has a calendar expiry date. <a href="#faq">Read the details</a>.</p>
        </div>
      </section>

      {/* ───── FAQ ───── */}
      <section className="section section-cream" id="faq" aria-labelledby="faq-title">
        <div className="container container-narrow">
          <SectionHeading center eyebrow="FAQ" title="Questions, answered" id="faq-title" />
          <div>
            {FAQS.map((f) => (
              <details className="faq-item" key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
          <div className="center" style={{ marginTop: 32 }}>
            <p className="muted">Still unsure? <Link to="/contact">Talk to us</Link>.</p>
          </div>
        </div>
      </section>

      {/* ───── Enrollment (always after the plans & information) ───── */}
      <section className="section section-dark cta-band" id="enroll" aria-labelledby="enroll-title">
        <AuraRings className="bg-rings" rings={7} />
        <div className="container enroll-wrap" style={{ position: 'relative' }}>
          <div>
            <div className="eyebrow">Enroll today</div>
            <h2 id="enroll-title">Begin your journey inward.</h2>
            <p className="lead" style={{ color: 'rgba(255,255,255,0.75)' }}>Create your learner account in a minute, choose a plan and book your first live session.</p>
            <div className="trust-row">
              <span><LuShieldCheck aria-hidden /> Payments verified on our servers</span>
              <span><LuCalendarCheck aria-hidden /> Instant booking confirmation</span>
              <span><LuUserCheck aria-hidden /> Experienced trainers</span>
            </div>
          </div>
          {isAuthenticated ? (
            <div className="enroll-form">
              <h3>You’re already signed in</h3>
              <p>Continue to your dashboard to choose a plan or book a session.</p>
              <Link to={ROLE_HOME[user.role] || '/dashboard'} className="btn btn-gold btn-block">Go to my dashboard</Link>
            </div>
          ) : (
            <EnrollForm packages={pkgs} />
          )}
        </div>
      </section>
    </>
  );
}
