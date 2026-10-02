import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowDown, LuArrowLeft, LuArrowUp, LuEye, LuLock, LuPencil, LuPlus, LuTrash2, LuVideo } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { EmptyState, ErrorState, Loader, Alert } from '../components/States.jsx';
import { FormFields, cleanPayload, initialValues } from './FormBuilder.jsx';
import { lessonFields, statusBadge } from './resources.jsx';
import { formatDuration } from '../utils/format.js';

/**
 * Curriculum editor shared by admins and assigned trainers.
 * The API re-checks course ownership on every request.
 */
export default function CurriculumEditor({ base }) {
  const { courseId } = useParams();
  const toast = useToast();
  const course = useFetch(`/courses/${courseId}`);
  const lessons = useFetch('/lessons', { course: courseId });
  const [editing, setEditing] = useState(null);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [reordering, setReordering] = useState(false);

  const open = (lesson) => {
    setEditing(lesson || 'new');
    setValues(initialValues(lessonFields, lesson));
    setErrors({});
    setFormError('');
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = cleanPayload(lessonFields, values);
      if (editing === 'new') await api.post('/lessons', { ...body, course: courseId });
      else await api.patch(`/lessons/${editing._id}`, body);
      toast.success(editing === 'new' ? 'Lesson created' : 'Lesson saved');
      setEditing(null);
      lessons.reload();
      course.reload();
    } catch (ex) {
      setErrors(ex.fieldErrors || {});
      setFormError(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/lessons/${toDelete._id}`);
      toast.success('Lesson deleted');
      setToDelete(null);
      lessons.reload();
      course.reload();
    } catch (ex) {
      toast.error(ex.message);
    }
  };

  const move = async (index, dir) => {
    const list = [...lessons.data];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    lessons.setData(list);
    setReordering(true);
    try {
      await api.put('/lessons/reorder', { course: courseId, order: list.map((l) => l._id) });
    } catch (ex) {
      toast.error(ex.message);
      lessons.reload();
    } finally {
      setReordering(false);
    }
  };

  if (course.loading && !course.data) return <Loader />;
  if (course.error) return <ErrorState error={course.error} onRetry={course.reload} />;
  const c = course.data.course;

  return (
    <div>
      <Link to={`/${base}/courses`} className="btn btn-text btn-sm"><LuArrowLeft /> All courses</Link>
      <div className="panel-head">
        <div>
          <h1>{c.title}</h1>
          <p>{statusBadge(c.status)} &nbsp; {c.lessonCount} published lessons · {formatDuration(c.durationMinutes)}</p>
        </div>
        <div className="row">
          <Link to={`/learn/${c.slug}`} className="btn btn-outline btn-sm" target="_blank"><LuEye /> Preview as Learner</Link>
          <button type="button" className="btn" onClick={() => open(null)}><LuPlus /> Add Lesson</button>
        </div>
      </div>

      {lessons.error ? (
        <ErrorState error={lessons.error} onRetry={lessons.reload} />
      ) : lessons.loading && !lessons.data ? (
        <Loader />
      ) : !lessons.data?.length ? (
        <EmptyState icon={LuVideo} title="No lessons yet" message="Add your first lesson with a YouTube video link." action={<button type="button" className="btn btn-sm" onClick={() => open(null)}><LuPlus /> Add Lesson</button>} />
      ) : (
        <div className="table-wrap">
          <table className="table table-responsive">
            <thead>
              <tr><th>#</th><th>Lesson</th><th>Section</th><th>Video</th><th>Duration</th><th>Access</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {lessons.data.map((l, i) => (
                <tr key={l._id} style={{ opacity: l.isPublished ? 1 : 0.6 }}>
                  <td data-label="#">{i + 1}</td>
                  <td data-label="Lesson"><span className="cell-title">{l.title}</span>{!l.isPublished && <span className="badge badge-warning" style={{ marginLeft: 8 }}>Draft</span>}</td>
                  <td data-label="Section">{l.section}</td>
                  <td data-label="Video">{l.youtubeId ? <code>{l.youtubeId}</code> : <span className="badge badge-danger">Missing</span>}</td>
                  <td data-label="Duration">{formatDuration(l.durationMinutes)}</td>
                  <td data-label="Access">{l.isPreview ? <span className="badge badge-gold">Preview</span> : <LuLock aria-label="Enrolled only" />}</td>
                  <td className="actions">
                    <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0 || reordering} aria-label="Move up"><LuArrowUp /></button>
                    <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === lessons.data.length - 1 || reordering} aria-label="Move down"><LuArrowDown /></button>
                    <button type="button" className="icon-btn" onClick={() => open(l)} aria-label="Edit lesson"><LuPencil /></button>
                    <button type="button" className="icon-btn" onClick={() => setToDelete(l)} aria-label="Delete lesson"><LuTrash2 /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing === 'new' ? 'Add Lesson' : 'Edit Lesson'}
        footer={
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" form="lesson-form" className="btn btn-sm" disabled={saving}>{saving && <span className="spinner" aria-hidden />} {editing === 'new' ? 'Create Lesson' : 'Save Changes'}</button>
          </>
        }
      >
        <form id="lesson-form" onSubmit={save} noValidate>
          {formError && <div style={{ marginBottom: 18 }}><Alert>{formError}</Alert></div>}
          <FormFields fields={lessonFields} values={values} onChange={setValues} errors={errors} />
        </form>
      </Modal>
      <ConfirmDialog open={!!toDelete} danger title="Delete lesson?" message={`“${toDelete?.title}” and learners' progress on it will be removed.`} confirmLabel="Delete Lesson" onConfirm={remove} onCancel={() => setToDelete(null)} />
    </div>
  );
}
