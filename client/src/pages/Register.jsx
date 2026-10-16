import { useSearchParams } from 'react-router-dom';
import { useSeo } from '../hooks/useSeo.js';
import { useFetch } from '../hooks/useFetch.js';
import { AuthShell } from './Auth.jsx';
import { EnrollForm } from '../training/EnrollForm.jsx';

/** Learner registration. Trainer accounts are created by administrators only. */
export function Register() {
  useSeo({ title: 'Create Account', noindex: true });
  const [params] = useSearchParams();
  const { data } = useFetch('/packages');
  return (
    <AuthShell quote="“The journey of a thousand miles begins with a single breath.”">
      <div className="auth-form" style={{ maxWidth: 560 }}>
        <div className="eyebrow">Begin your journey</div>
        <h1>Join as a learner</h1>
        <p className="lead">Create your account, pick a plan and book live sessions with a trainer.</p>
        <EnrollForm packages={data?.packages || []} preselect={params.get('plan') || ''} id="register-form" heading="Your details" />
      </div>
    </AuthShell>
  );
}

export const LearnerRegister = Register;
