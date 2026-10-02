import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LuArrowRight, LuEye, LuEyeOff } from 'react-icons/lu';
import { ROLE_HOME, useAuth } from '../context/AuthContext.jsx';
import { useSeo } from '../hooks/useSeo.js';
import { AuraRings, Logo } from '../components/Brand.jsx';
import { Alert } from '../components/States.jsx';
import { Field, TextField } from '../components/Form.jsx';

function AuthShell({ children, quote }) {
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

function PasswordInput({ value, onChange, autoComplete, ...a11y }) {
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
  ? ['admin@auraawakening.com', 'manager@auraawakening.com', 'ananya@auraawakening.com', 'learner@auraawakening.com']
  : [];

export function Login() {
  useSeo({ title: 'Log In', noindex: true });
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) return setError('Please enter your email and password.');
    setBusy(true);
    try {
      const user = await login(form.email.trim(), form.password);
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
        <TextField label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field label="Password" required>
          {(a11y) => <PasswordInput {...a11y} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <button type="submit" className="btn btn-block" style={{ marginTop: 26 }} disabled={busy} aria-busy={busy}>
          {busy && <span className="spinner" aria-hidden />} Log In <LuArrowRight />
        </button>
        <p className="auth-foot">New to Aura Awakening? <Link to="/register" state={location.state}>Create an account</Link></p>
        {!!DEMO.length && (
          <div className="demo-logins">
            Demo accounts (password <code>ChangeMe@123</code>):<br />
            {DEMO.map((email) => (
              <button key={email} type="button" onClick={() => setForm({ email, password: 'ChangeMe@123' })}>{email.split('@')[0]}</button>
            ))}
          </div>
        )}
      </form>
    </AuthShell>
  );
}

export function Register() {
  useSeo({ title: 'Create Account', noindex: true });
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Please enter your name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Please enter a valid email';
    if (form.password.length < 8) e.password = 'At least 8 characters';
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = 'Include at least one letter and one number';
    if (form.confirmPassword !== form.password) e.confirmPassword = 'Passwords do not match';
    return e;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await register({ ...form, email: form.email.trim() });
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (ex) {
      setErrors(ex.fieldErrors || {});
      setError(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell quote="“The journey of a thousand miles begins with a single breath.”">
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="eyebrow">Begin your journey</div>
        <h1>Create your account</h1>
        <p className="lead">Free to join. Start with a free program today.</p>
        {error && <div style={{ marginBottom: 18 }}><Alert>{error}</Alert></div>}
        <TextField label="Full name" required autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
        <TextField label="Email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <Field label="Password" required hint="At least 8 characters, with a letter and a number" error={errors.password}>
          {(a11y) => <PasswordInput {...a11y} autoComplete="new-password" value={form.password} onChange={set('password')} />}
        </Field>
        <Field label="Confirm password" required error={errors.confirmPassword}>
          {(a11y) => <PasswordInput {...a11y} autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} />}
        </Field>
        <button type="submit" className="btn btn-block" style={{ marginTop: 26 }} disabled={busy} aria-busy={busy}>
          {busy && <span className="spinner" aria-hidden />} Create Account
        </button>
        <p className="small muted" style={{ marginTop: 14 }}>By creating an account you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy-policy">Privacy Policy</Link>.</p>
        <p className="auth-foot">Already have an account? <Link to="/login" state={location.state}>Log in</Link></p>
      </form>
    </AuthShell>
  );
}
