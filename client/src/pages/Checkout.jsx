import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LuCircleCheck, LuCircleX, LuLock, LuShieldCheck } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { CoverArt } from '../components/Brand.jsx';
import { Loader, ErrorState, Alert } from '../components/States.jsx';
import { Modal } from '../components/Modal.jsx';
import { formatPrice } from '../utils/format.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the payment window. Please check your connection.'));
    document.body.appendChild(s);
    return null;
  });
}

/**
 * Checkout flow
 *  1. POST /payments/checkout → server creates Order + provider order (price from DB)
 *  2. Provider UI (Razorpay modal / Stripe redirect / dev mock)
 *  3. POST /payments/verify → server verifies signature with the provider
 *  4. Server enrolls the learner → we redirect to the course
 * The browser never decides that a payment succeeded.
 */
export default function Checkout() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch(`/courses/${slug}`);
  const [phase, setPhase] = useState('idle'); // idle | creating | paying | verifying | failed
  const [message, setMessage] = useState(params.get('cancelled') ? 'Payment was cancelled. You have not been charged.' : '');
  const [mock, setMock] = useState(null);
  const orderRef = useRef(null);
  useSeo({ title: 'Checkout', noindex: true });

  useEffect(() => () => { orderRef.current = null; }, []);

  if (loading && !data) return <Loader page />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  const { course, access } = data;
  if (access.isEnrolled) return <Navigate to={`/learn/${course.slug}`} replace />;
  if (!course.price) return <Navigate to={`/courses/${course.slug}`} replace />;

  const verify = async (orderId, payload) => {
    setPhase('verifying');
    try {
      const { data: res } = await api.post('/payments/verify', { orderId, payload });
      if (res.status === 'paid') navigate(`/checkout/success?course=${course.slug}`, { replace: true });
      else { setPhase('failed'); setMessage('Payment is still processing. We will enroll you automatically once it is confirmed.'); }
    } catch (e) {
      setPhase('failed');
      setMessage(e.message || 'Payment verification failed. If money was deducted it will be refunded automatically.');
    }
  };

  const fail = async (orderId, reason) => {
    setPhase('failed');
    setMessage(reason || 'Payment was not completed.');
    try { await api.post('/payments/fail', { orderId, reason }); } catch { /* best effort */ }
  };

  const pay = async () => {
    setMessage('');
    setPhase('creating');
    let order;
    try {
      ({ data: order } = await api.post('/payments/checkout', { courseId: course._id }));
      orderRef.current = order;
    } catch (e) {
      setPhase('failed');
      setMessage(e.message);
      return;
    }
    setPhase('paying');

    if (order.provider === 'razorpay') {
      try {
        await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      } catch (e) {
        await fail(order.orderId, e.message);
        return;
      }
      const rzp = new window.Razorpay({
        key: order.keyId, // public key only
        order_id: order.razorpayOrderId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        prefill: order.prefill,
        theme: { color: '#033333' },
        handler: (resp) => verify(order.orderId, resp),
        modal: { ondismiss: () => fail(order.orderId, 'Payment window closed') },
      });
      rzp.on('payment.failed', (resp) => fail(order.orderId, resp.error?.description));
      rzp.open();
    } else if (order.provider === 'stripe') {
      window.location.assign(order.checkoutUrl); // verified on /checkout/return
    } else if (order.provider === 'mock') {
      setMock(order);
    }
  };

  const busy = ['creating', 'paying', 'verifying'].includes(phase) && !mock;

  return (
    <section className="section-sm">
      <div className="container checkout-grid">
        <div>
          <div className="eyebrow">Secure checkout</div>
          <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Complete your enrollment</h1>
          <p className="lead">You're enrolling as <strong>{user?.email}</strong>. Access begins as soon as your payment is confirmed.</p>
          {message && <div style={{ margin: '20px 0' }}><Alert type={phase === 'failed' ? 'error' : 'info'}>{message}</Alert></div>}
          <div className="card card-pad" style={{ marginTop: 24 }}>
            <h3>Payment</h3>
            <p className="muted">Pay securely with UPI, cards, net banking or wallets. Card details are handled by our payment partner — they never touch our servers.</p>
            <button type="button" className="btn btn-gold btn-block" onClick={pay} disabled={busy} aria-busy={busy} style={{ marginTop: 8 }}>
              {busy ? <span className="spinner" aria-hidden /> : <LuLock />}
              {phase === 'verifying' ? 'Verifying Payment…' : `Pay ${formatPrice(course.price, course.currency)}`}
            </button>
            <div className="secure-note"><LuShieldCheck aria-hidden /> Payments are verified on our server before access is granted.</div>
          </div>
        </div>
        <aside className="card" aria-label="Order summary">
          <div className="cover">{course.coverImage ? <img src={course.coverImage} alt="" /> : <CoverArt seed={course.slug} label={course.category?.name} />}</div>
          <div className="card-pad">
            <h3 style={{ marginBottom: 4 }}>{course.title}</h3>
            <p className="muted small">{course.lessonCount} lessons · lifetime access</p>
            <div className="summary-row"><span>Program price</span><span>{formatPrice(course.compareAtPrice > course.price ? course.compareAtPrice : course.price, course.currency)}</span></div>
            {course.compareAtPrice > course.price && <div className="summary-row"><span>Discount</span><span>−{formatPrice(course.compareAtPrice - course.price, course.currency)}</span></div>}
            <div className="summary-row total"><span>Total</span><span>{formatPrice(course.price, course.currency)}</span></div>
            <p className="small muted" style={{ marginTop: 12 }}>See our <Link to="/refund-policy">refund policy</Link>.</p>
          </div>
        </aside>
      </div>

      <Modal
        open={!!mock}
        onClose={() => { fail(mock.orderId, 'Cancelled'); setMock(null); }}
        title="Test payment"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { fail(mock.orderId, 'Simulated failure'); setMock(null); }}><LuCircleX /> Simulate Failure</button>
            <button type="button" className="btn btn-sm" onClick={() => { const o = mock; setMock(null); verify(o.orderId, { mockToken: o.mockToken }); }}><LuCircleCheck /> Simulate Success</button>
          </>
        }
      >
        <p style={{ margin: 0 }}>Development mode — <code>PAYMENT_PROVIDER=mock</code>. The server still verifies a signed token before enrolling. Configure Razorpay or Stripe keys for real payments.</p>
      </Modal>
    </section>
  );
}

/** Stripe redirects here; we verify the session server-side. */
export function CheckoutReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ phase: 'verifying', message: '' });
  useSeo({ title: 'Confirming payment', noindex: true });

  useEffect(() => {
    const orderId = params.get('order');
    if (!orderId) { setState({ phase: 'failed', message: 'Missing order reference.' }); return; }
    let tries = 0;
    const attempt = async () => {
      try {
        const { data } = await api.post('/payments/verify', { orderId, payload: { sessionId: params.get('session_id') } });
        if (data.status === 'paid') {
          const { data: order } = await api.get(`/orders/${orderId}`);
          navigate(order.kind === 'package' ? '/dashboard/plans?paid=1' : `/checkout/success?course=${order.course?.slug || ''}`, { replace: true });
        } else if (tries++ < 5) setTimeout(attempt, 2000);
        else setState({ phase: 'pending', message: 'Your payment is processing. You will be enrolled automatically once it is confirmed.' });
      } catch (e) {
        setState({ phase: 'failed', message: e.message });
      }
    };
    attempt();
  }, [params, navigate]);

  return (
    <section className="section"><div className="container container-narrow center">
      {state.phase === 'verifying' ? <Loader label="Confirming your payment…" /> : <><Alert type={state.phase === 'pending' ? 'info' : 'error'}>{state.message}</Alert><Link to="/dashboard/payments" className="btn" style={{ marginTop: 20 }}>View Payments</Link></>}
    </div></section>
  );
}

export function CheckoutSuccess() {
  const [params] = useSearchParams();
  useSeo({ title: 'Welcome', noindex: true });
  const slug = params.get('course');
  return (
    <section className="section">
      <div className="container container-narrow center">
        <div className="state-icon" style={{ margin: '0 auto 18px', width: 72, height: 72 }}><LuCircleCheck size={32} /></div>
        <div className="eyebrow" style={{ justifyContent: 'center' }}>Payment confirmed</div>
        <h1>Welcome to your program.</h1>
        <p className="lead" style={{ margin: '0 auto 32px' }}>A receipt is in your dashboard. Take a breath — your journey begins now.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {slug && <Link to={`/learn/${slug}`} className="btn">Start Learning</Link>}
          <Link to="/dashboard" className="btn btn-outline">Go to Dashboard</Link>
        </div>
      </div>
    </section>
  );
}
