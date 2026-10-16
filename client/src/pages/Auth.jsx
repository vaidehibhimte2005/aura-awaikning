import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { LuArrowRight, LuEye, LuEyeOff } from 'react-icons/lu';
import { ROLE_HOME, useAuth } from '../context/AuthContext.jsx';
import { useSeo } from '../hooks/useSeo.js';
import { AuraRings, Logo } from '../components/Brand.jsx';
import { Alert } from '../components/States.jsx';
import { Field, TextField } from '../components/Form.jsx';

export function AuthShell({ children, quote }) {
  return (
    <div className="auth-page">
      <aside className="auth-art">
        <Logo />
        <blockquote>{quote}</blockquote>
        <p className="small" style={{ position: 'relative', margin: 0 }}>One account for every device — your progress travels with you.</p>
        <AuraRings className="rings" rings={6} />
      </aside>
      <div className="auth-form-wrap">{children}</div>
    </div>
  );
}

export function PasswordInput({ value, onChange, autoComplete, ...a11y }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input className="input" type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} required style={{ paddingRight: 48 }} {...a11y} />
      <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 4, top: 4 }}>
        {show ? <LuEyeOff /> : <LuEye />}
      </button>
    </div>
  );
}

const DEMO = import.meta.env.DEV
  ? ['admin@auraawakening.com', 'ananya@auraawakening.com', 'learner@auraawakening.com']
  : [];

export function Login() {
  useSeo({ title: 'Log In', noindex: true });
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.identifier.trim() || !form.password) return setError('Please enter your email or mobile number and your password.');
    setBusy(true);
    try {
      const user = await login(form.identifier.trim(), form.password);
      const from = location.state?.from;
      navigate(from || ROLE_HOME[user.role] || '/dashboard', { replace: true });
    } catch (ex) {
      setError(ex.message);
    } finally {
      setBusy(false);
    }
    return null;
  };

  return (
    <AuthShell quote="“Wherever you are, that is the starting point.”">
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="eyebrow">Welcome back</div>
        <h1>Log in</h1>
        <p className="lead">Continue your practice where you left off.</p>
        {error && <div style={{ marginBottom: 18 }}><Alert>{error}</Alert></div>}
        <TextField label="Email or mobile number" autoComplete="username" required value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
        <Field label="Password" required>
          {(a11y) => <PasswordInput {...a11y} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <div style={{ textAlign: 'right', marginTop: 6 }}><Link to="/forgot-password" className="small">Forgot your password?</Link></div>
        <button type="submit" className="btn btn-block" style={{ marginTop: 20 }} disabled={busy} aria-busy={busy}>
          {busy && <span className="spinner" aria-hidden />} Log In <LuArrowRight />
        </button>
        <p className="auth-foot">New to Aura Awakening? <Link to="/register" state={location.state}>Create an account</Link></p>
        {!!DEMO.length && (
          <div className="demo-logins">
            Demo accounts (password <code>ChangeMe@123</code>):<br />
            {DEMO.map((email) => (
              <button key={email} type="button" onClick={() => setForm({ identifier: email, password: 'ChangeMe@123' })}>{email.split('@')[0]}</button>
            ))}
          </div>
        )}
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  useSeo({ title: 'Reset Password', noindex: true });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Please enter a valid email address.');
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setDone(true);
    } catch (ex) {
      setError(ex.message);
    } finally {
      setBusy(false);
    }
    return null;
  };
  return (
    <AuthShell quote="“Every pause is a new beginning.”">
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="eyebrow">Account recovery</div>
        <h1>Forgot password</h1>
        {done ? (
          <Alert type="success">If an account exists for that email, a reset link is on its way. It expires in 30 minutes.</Alert>
        ) : (
          <>
            <p className="lead">Enter your email and we will send you a link to choose a new password.</p>
            {error && <div style={{ marginBottom: 18 }}><Alert>{error}</Alert></div>}
            <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" className="btn btn-block" style={{ marginTop: 26 }} disabled={busy} aria-busy={busy}>
              {busy && <span className="spinner" aria-hidden />} Send Reset Link
            </button>
          </>
        )}
        <p className="auth-foot"><Link to="/login">Back to log in</Link></p>
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
  useSeo({ title: 'Choose a New Password', noindex: true });
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const errs = {};
    if (form.password.length < 8) errs.password = 'At least 8 characters';
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) errs.password = 'Include at least one letter and one number';
    if (form.confirmPassword !== form.password) errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    if (Object.keys(errs).length) return null;
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, ...form });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (ex) {
      setError(ex.message);
    } finally {
      setBusy(false);
    }
    return null;
  };
  return (
    <AuthShell quote="“Begin again, as often as you need.”">
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="eyebrow">Account recovery</div>
        <h1>Choose a new password</h1>
        {!token && <Alert>This reset link is incomplete. Please request a new one.</Alert>}
        {done && <Alert type="success">Password updated. Taking you to log in…</Alert>}
        {error && <div style={{ marginBottom: 18 }}><Alert>{error}</Alert></div>}
        {!done && !!token && (
          <>
            <Field label="New password" required hint="At least 8 characters, with a letter and a number" error={errors.password}>
              {(a11y) => <PasswordInput {...a11y} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
            </Field>
            <Field label="Confirm password" required error={errors.confirmPassword}>
              {(a11y) => <PasswordInput {...a11y} autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />}
            </Field>
            <button type="submit" className="btn btn-block" style={{ marginTop: 26 }} disabled={busy} aria-busy={busy}>
              {busy && <span className="spinner" aria-hidden />} Update Password
            </button>
          </>
        )}
        <p className="auth-foot"><Link to="/login">Back to log in</Link></p>
      </form>
    </AuthShell>
  );
}

export function VerifyEmail() {
  useSeo({ title: 'Verify Email', noindex: true });
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState(token ? 'working' : 'error');
  const [message, setMessage] = useState(token ? '' : 'This verification link is incomplete.');
  const [role, setRole] = useState('learner');
  useEffect(() => {
    if (!token) return;
    api.post('/auth/verify-email', { token })
      .then(({ data }) => { setRole(data.role); setState('ok'); })
      .catch((ex) => { setMessage(ex.message); setState('error'); });
  }, [token]);
  return (
    <AuthShell quote="“Welcome. You are exactly where you need to be.”">
      <div className="auth-form">
        <div className="eyebrow">Email verification</div>
        <h1>{state === 'ok' ? 'You are verified' : state === 'working' ? 'Verifying…' : 'Verification failed'}</h1>
        {state === 'working' && <p className="lead">One moment please.</p>}
        {state === 'ok' && (
          <>
            <Alert type="success">Your email address is confirmed.</Alert>
            <p className="lead" style={{ marginTop: 16 }}>
              {role === 'trainer' ? 'Your trainer application is now with our team for review.' : 'You can now log in and start learning.'}
            </p>
          </>
        )}
        {state === 'error' && <Alert>{message}</Alert>}
        <p className="auth-foot"><Link to="/login">Go to log in</Link></p>
      </div>
    </AuthShell>
  );
}
