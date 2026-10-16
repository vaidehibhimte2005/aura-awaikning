import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuArrowRight, LuMailCheck } from 'react-icons/lu';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { Alert } from '../components/States.jsx';
import { Field, TextField } from '../components/Form.jsx';
import { PasswordInput } from '../pages/Auth.jsx';
import { formatPrice } from '../utils/format.js';

const MOBILE_RX = /^\+?\d{7,15}$/;
const EMAIL_RX = /^\S+@\S+\.\S+$/;
const cleanPhone = (v) => v.replace(/[\s\-().]/g, '');

function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Please enter your name';
  if (!EMAIL_RX.test(f.email.trim())) e.email = 'Please enter a valid email';
  if (!MOBILE_RX.test(cleanPhone(f.phone))) e.phone = 'Please enter a valid mobile number';
  if (f.password.length < 8) e.password = 'At least 8 characters';
  else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'Include a letter and a number';
  if (f.confirmPassword !== f.password) e.confirmPassword = 'Passwords do not match';
  if (!f.accept) e.accept = 'Please accept the Terms and Privacy Policy to continue';
  return e;
}

/**
 * Learner enrollment: creates the account (role is fixed server-side), signs in, then hands off to the
 * plan checkout. Used at the bottom of the landing page (with plan choice) and on /register.
 */
export function EnrollForm({ packages = [], preselect = '', id = 'enroll-form', heading = 'Create your learner account' }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '', accept: false, plan: preselect });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inbox, setInbox] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const v = validate(f);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const res = await register({
        name: f.name.trim(), email: f.email.trim(), phone: cleanPhone(f.phone), password: f.password, confirmPassword: f.confirmPassword,
        acceptTerms: true, acceptPrivacy: true,
      });
      if (res.verificationRequired) { setInbox(res.email); return; }
      navigate(f.plan ? `/dashboard/plans?plan=${f.plan}` : '/dashboard/plans', { replace: true });
    } catch (ex) {
      setErrors(ex.fieldErrors || {});
      setFormError(ex.message);
    } finally { setBusy(false); }
  };

  if (inbox) {
    return (
      <div className="enroll-form" id={id}>
        <h3><LuMailCheck aria-hidden style={{ verticalAlign: '-4px' }} /> Check your inbox</h3>
        <Alert type="success">We sent a verification link to <strong>{inbox}</strong>. Open it to activate your account, then <Link to="/login">log in</Link> to choose your plan.</Alert>
        <button type="button" className="btn btn-text btn-sm" style={{ marginTop: 12 }} onClick={() => api.post('/auth/resend-verification', { email: inbox }).catch(() => {})}>Resend the email</button>
      </div>
    );
  }

  return (
    <form className="enroll-form" id={id} onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{heading}</h3>
      {formError && <div style={{ marginBottom: 16 }}><Alert>{formError}</Alert></div>}
      <TextField label="Full name" autoComplete="name" required value={f.name} onChange={set('name')} error={errors.name} />
      <div className="form-row" style={{ marginTop: 14 }}>
        <TextField label="Email" type="email" autoComplete="email" required value={f.email} onChange={set('email')} error={errors.email} />
        <TextField label="Mobile number" type="tel" autoComplete="tel" required value={f.phone} onChange={set('phone')} error={errors.phone} placeholder="+91 98765 43210" />
      </div>
      <div className="form-row" style={{ marginTop: 14 }}>
        <Field label="Password" required hint="8+ characters, a letter and a number" error={errors.password}>
          {(a11y) => <PasswordInput {...a11y} autoComplete="new-password" value={f.password} onChange={set('password')} />}
        </Field>
        <Field label="Confirm password" required error={errors.confirmPassword}>
          {(a11y) => <PasswordInput {...a11y} autoComplete="new-password" value={f.confirmPassword} onChange={set('confirmPassword')} />}
        </Field>
      </div>
      {packages.length > 0 && (
        <fieldset style={{ border: 0, padding: 0, margin: '18px 0 0' }}>
          <legend className="label">Your plan (you can change it at checkout)</legend>
          <div className="plan-radio">
            <label><input type="radio" name={`${id}-plan`} value="" checked={f.plan === ''} onChange={set('plan')} /><span className="grow">Decide later<small>Create my account first</small></span></label>
            {packages.map((p) => (
              <label key={p._id}>
                <input type="radio" name={`${id}-plan`} value={p._id} checked={f.plan === p._id} onChange={set('plan')} />
                <span className="grow">{p.name}<small>{p.price.trainingDays} training day{p.price.trainingDays === 1 ? '' : 's'}{p.price.discount > 0 ? ` · save ${formatPrice(p.price.savings, p.price.currency)}` : ''}</small></span>
                <strong>{formatPrice(p.price.amount, p.price.currency)}</strong>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div style={{ marginTop: 16 }}>
        <label className="checkbox">
          <input type="checkbox" checked={f.accept} onChange={(e) => setF({ ...f, accept: e.target.checked })} aria-invalid={errors.accept ? 'true' : undefined} />
          <span>I agree to the <Link to="/terms" target="_blank">Terms</Link> and <Link to="/privacy-policy" target="_blank">Privacy Policy</Link>.</span>
        </label>
        {errors.accept && <span className="error-text">{errors.accept}</span>}
      </div>
      <button type="submit" className="btn btn-gold btn-block" style={{ marginTop: 20 }} disabled={busy} aria-busy={busy}>
        {busy && <span className="spinner" aria-hidden />} {f.plan ? 'Create account & continue to payment' : 'Create account'} <LuArrowRight />
      </button>
      <p className="small muted" style={{ marginBottom: 0 }}>Already enrolled? <Link to="/login">Log in</Link>. Trainer accounts are created by our team.</p>
    </form>
  );
}
