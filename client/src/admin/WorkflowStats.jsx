import { Link } from 'react-router-dom';
import { LuBookOpen, LuClipboardCheck, LuFileClock, LuGraduationCap, LuHistory, LuUsers } from 'react-icons/lu';
import { formatDateTime, titleCase } from '../utils/format.js';

/**
 * Real approval-pipeline numbers for the admin and manager dashboards.
 * `base` decides which panel the deep links point to.
 */
export function WorkflowStats({ workflow, base }) {
  if (!workflow) return null;
  const a = workflow.trainerApplications;
  const c = workflow.courses;
  return (
    <>
      <div className="stats">
        <Link to={`/${base}/trainer-applications`} className="stat" style={{ textDecoration: 'none' }}>
          <span className="stat-label">Applications awaiting decision <LuClipboardCheck /></span>
          <span className="stat-value">{a.awaitingDecision}</span>
          <span className="stat-sub">{a.total} total · {a.approved} approved · {a.rejected} rejected</span>
        </Link>
        <Link to={`/${base}/course-approvals`} className="stat" style={{ textDecoration: 'none' }}>
          <span className="stat-label">Courses pending approval <LuFileClock /></span>
          <span className="stat-value">{c.pendingApproval}</span>
          <span className="stat-sub">{c.published} published · {c.rejected} returned</span>
        </Link>
        <div className="stat"><span className="stat-label">Approved trainers <LuGraduationCap /></span><span className="stat-value">{workflow.approvedTrainers}</span></div>
        <div className="stat"><span className="stat-label">Registered learners <LuUsers /></span><span className="stat-value">{workflow.registeredLearners}</span></div>
        <div className="stat"><span className="stat-label">Published courses <LuBookOpen /></span><span className="stat-value">{c.published}</span></div>
      </div>
      <section className="panel-card" style={{ marginBottom: 24 }}>
        <div className="panel-card-head"><h2><LuHistory aria-hidden /> Recent approval activity</h2><Link to={`/${base}/activity`} className="btn btn-text btn-sm">View all</Link></div>
        <div className="panel-card-body">
          {workflow.recentActivity?.length ? workflow.recentActivity.map((l) => (
            <div className="list-row" key={l._id}>
              <div className="grow">
                <strong>{titleCase(l.action.replace('.', ' · '))}</strong>
                <span className="small muted">{l.entityLabel || ''} · {l.actor?.name || 'System'} · {formatDateTime(l.createdAt)}</span>
              </div>
            </div>
          )) : <p className="muted" style={{ margin: 0 }}>No activity yet.</p>}
        </div>
      </section>
    </>
  );
}
