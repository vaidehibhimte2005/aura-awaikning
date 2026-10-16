import { useState } from 'react';
import { LuCircleCheck, LuEyeOff, LuGlobe, LuSend } from 'react-icons/lu';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';

const SUBMITTABLE = ['draft', 'rejected', 'needs_revision'];

/**
 * Row actions for the course lifecycle. The buttons only mirror what the API
 * allows — every transition is re-validated on the server.
 */
export function CourseWorkflowActions({ course, base, reload }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const run = async (path, message) => {
    setBusy(true);
    try {
      await api.post(`/courses/${course._id}/${path}`);
      toast.success(message);
      setConfirm(null);
      reload();
    } catch (e) {
      const problems = e.errors?.problems || e.details?.problems;
      toast.error(problems?.length ? `${e.message}: ${problems.join('; ')}` : e.message);
    } finally {
      setBusy(false);
    }
  };

  if (base === 'manager') return null; // managers review from Course approvals
  const s = course.status;
  const isTrainer = base === 'trainer';
  return (
    <>
      {isTrainer && SUBMITTABLE.includes(s) && (
        <button type="button" className="icon-btn" disabled={busy} title="Submit for approval" aria-label="Submit for approval" onClick={() => setConfirm({ path: 'submit', message: 'Submitted for approval', title: 'Submit for approval?', text: 'A manager will review this course. You will be notified of the decision.' })}><LuSend /></button>
      )}
      {s === 'approved' && (
        <button type="button" className="icon-btn" disabled={busy} title="Publish to marketplace" aria-label="Publish to marketplace" onClick={() => setConfirm({ path: 'publish', message: 'Course published', title: 'Publish this course?', text: 'It will immediately be visible to learners in the marketplace.' })}><LuGlobe /></button>
      )}
      {!isTrainer && s === 'draft' && (
        <button type="button" className="icon-btn" disabled={busy} title="Publish" aria-label="Publish" onClick={() => setConfirm({ path: 'publish', message: 'Course published', title: 'Publish this course?', text: 'It will immediately be visible to learners in the marketplace.' })}><LuCircleCheck /></button>
      )}
      {s === 'published' && (
        <button type="button" className="icon-btn" disabled={busy} title="Unpublish" aria-label="Unpublish" onClick={() => setConfirm({ path: 'unpublish', message: 'Course unpublished', title: 'Unpublish this course?', text: 'It will disappear from the marketplace. Enrolled learners keep their access.' })}><LuEyeOff /></button>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.text}
        confirmLabel="Confirm"
        busy={busy}
        onConfirm={() => run(confirm.path, confirm.message)}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
