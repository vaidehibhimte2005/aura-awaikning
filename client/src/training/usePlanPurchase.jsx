import { useState } from 'react';
import { LuCircleCheck, LuCircleX } from 'react-icons/lu';
import { api } from '../services/api.js';
import { Modal } from '../components/Modal.jsx';

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
 * Package purchase flow — the browser never decides a payment succeeded:
 *   1. POST /subscriptions/checkout  → server prices the plan and creates the order
 *   2. provider UI (Razorpay modal / Stripe redirect / labelled dev-mock)
 *   3. POST /payments/verify         → server verifies the signature with the provider
 *   4. the server activates the package; we only refresh what it now reports
 */
export function usePlanPurchase({ onPaid, onError } = {}) {
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [mock, setMock] = useState(null);

  const fail = async (orderId, reason) => {
    setBusy(false);
    setPhase('idle');
    onError?.(reason || 'Payment was not completed. You have not been charged.');
    try { await api.post('/payments/fail', { orderId, reason }); } catch { /* best effort */ }
  };

  const verify = async (orderId, payload) => {
    setBusy(true);
    setPhase('verifying');
    try {
      const { data } = await api.post('/payments/verify', { orderId, payload });
      setBusy(false);
      setPhase('idle');
      if (data.status === 'paid') onPaid?.();
      else onError?.('Your payment is still processing. Your package will activate automatically once it is confirmed.');
    } catch (e) {
      setBusy(false);
      setPhase('idle');
      onError?.(e.message || 'Payment verification failed. If money was deducted, it will be refunded.');
    }
  };

  const buy = async (pkg, mode) => {
    setBusy(true);
    setPhase('creating');
    let order;
    try {
      ({ data: order } = await api.post('/subscriptions/checkout', { packageId: pkg._id, mode }));
    } catch (e) {
      setBusy(false);
      setPhase('idle');
      onError?.(e.message);
      return;
    }
    if (order.provider === 'razorpay') {
      try {
        await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      } catch (e) {
        await fail(order.orderId, e.message);
        return;
      }
      const rzp = new window.Razorpay({
        key: order.keyId,
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
      window.location.assign(order.checkoutUrl);
    } else if (order.provider === 'mock') {
      setBusy(false);
      setMock(order);
    }
  };

  const modal = (
    <Modal
      open={!!mock}
      onClose={() => { const o = mock; setMock(null); fail(o.orderId, 'Cancelled'); }}
      title="Test payment (development only)"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { const o = mock; setMock(null); fail(o.orderId, 'Simulated failure'); }}><LuCircleX /> Simulate Failure</button>
          <button type="button" className="btn btn-sm" onClick={() => { const o = mock; setMock(null); verify(o.orderId, { mockToken: o.mockToken }); }}><LuCircleCheck /> Simulate Success</button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}><strong>This is not a real payment.</strong> The server is running with <code>PAYMENT_PROVIDER=mock</code>, which exists only for development. It still verifies a signed token before activating anything.</p>
      {mock && <p style={{ marginBottom: 0 }} className="small muted">{mock.package?.name} · {mock.currency} {mock.amount}</p>}
    </Modal>
  );

  return { buy, busy, phase, modal };
}
