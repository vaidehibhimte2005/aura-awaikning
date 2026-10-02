import { useParams } from 'react-router-dom';
import { LuPrinter } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { Loader, ErrorState } from '../components/States.jsx';
import { LogoMark } from '../components/Brand.jsx';
import { formatDate } from '../utils/format.js';

/** Public, printable certificate + verification by number. */
export default function CertificateView() {
  const { number } = useParams();
  const { data: c, loading, error, reload } = useFetch(`/certificates/verify/${number}`);
  useSeo({ title: c ? `Certificate — ${c.courseTitle}` : 'Certificate', noindex: true });
  if (loading && !c) return <Loader page />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  return (
    <section className="section-sm">
      <div className="container">
        <div className="row-between no-print" style={{ marginBottom: 24 }}>
          <span className={`badge ${c.status === 'issued' ? 'badge-success' : 'badge-danger'}`}>{c.status === 'issued' ? 'Verified certificate' : 'Revoked'}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}><LuPrinter /> Print / Save PDF</button>
        </div>
        <div className="certificate">
          <LogoMark className="logo-mark" />
          <div className="eyebrow" style={{ margin: '8px 0 0' }}>Aura Awakening</div>
          <h1>Certificate of Completion</h1>
          <p className="muted" style={{ margin: '8px 0' }}>This certifies that</p>
          <div className="name">{c.learnerName}</div>
          <p className="muted" style={{ margin: '12px 0 4px' }}>has completed the program</p>
          <h2 style={{ fontSize: 'clamp(1.4rem, 3vw, 2.2rem)', margin: 0 }}>{c.courseTitle}</h2>
          <div className="meta">
            <div><strong>{formatDate(c.completedAt, { day: 'numeric', month: 'long', year: 'numeric' })}</strong>Completion date</div>
            {c.trainerName && <div><strong>{c.trainerName}</strong>Guide</div>}
            <div><strong>{c.certificateNumber}</strong>Certificate no.</div>
          </div>
        </div>
      </div>
    </section>
  );
}
