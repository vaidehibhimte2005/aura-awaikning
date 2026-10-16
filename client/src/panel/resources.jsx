/**
 * Field + column definitions shared by every panel (admin / manager / trainer).
 * Roles see the same screens with fewer fields where the API would ignore them.
 */
import { Link } from 'react-router-dom';
import { LuExternalLink, LuListTree } from 'react-icons/lu';
import { formatDate, formatDateTime, formatPrice, LEVEL_LABEL, sessionState, titleCase } from '../utils/format.js';
import { SessionStateBadge } from '../components/LiveSessionCard.jsx';
import { CourseWorkflowActions } from './CourseWorkflowActions.jsx';

const yes = (v) => (v ? <span className="badge badge-success">Yes</span> : <span className="badge badge-muted">No</span>);
export const statusBadge = (raw) => {
  const s = String(raw || '').toLowerCase();
  const map = { pending_approval: 'badge-warning', under_review: 'badge-gold', approved: 'badge-success', needs_revision: 'badge-warning', needs_information: 'badge-warning', rejected: 'badge-danger', published: 'badge-success', draft: 'badge-warning', archived: 'badge-muted', paid: 'badge-success', failed: 'badge-danger', refunded: 'badge-muted', pending: 'badge-warning', created: 'badge-muted', active: 'badge-success', completed: 'badge-gold', revoked: 'badge-danger', new: 'badge-gold', read: 'badge-muted', replied: 'badge-success', approved: 'badge-success', rejected: 'badge-danger' };
  return <span className={`badge ${map[s] || ''}`}>{titleCase(s || '—')}</span>;
};

const LEVELS = Object.entries(LEVEL_LABEL).map(([value, label]) => ({ value, label }));
const trainerOptions = { endpoint: '/trainers', params: { all: 'true' }, labelKey: 'displayName' };
const categoryOptions = { endpoint: '/categories' };
const courseOptions = { endpoint: '/courses', params: { scope: 'manage' }, labelKey: 'title' };

// ─── Courses ──────────────────────────────────────────────
export function courseFields(role) {
  const all = [
    { name: 'title', label: 'Course title', required: true, section: 'Basics' },
    { name: 'shortDescription', label: 'Short description', type: 'textarea', hint: 'Shown on course cards (max 300 characters)', section: 'Basics' },
    { name: 'category', label: 'Category', type: 'select', optionsFrom: categoryOptions, half: true, section: 'Basics', roles: ['admin', 'trainer'] },
    { name: 'level', label: 'Level', type: 'select', options: LEVELS, default: 'all', placeholder: false, half: true, section: 'Basics', roles: ['admin', 'trainer'] },
    { name: 'language', label: 'Language', default: 'English', half: true, section: 'Basics', roles: ['admin', 'trainer'] },
    { name: 'description', label: 'Full description', type: 'markdown', hint: 'Supports **bold**, *italic*, ## headings and - lists', section: 'Content' },
    { name: 'coverImage', label: 'Cover image', type: 'image', folder: 'courses', section: 'Content' },
    { name: 'previewVideo.youtubeUrl', label: 'Preview video (YouTube)', type: 'youtube', section: 'Content' },
    { name: 'outcomes', label: 'What learners will gain', type: 'list', addLabel: 'Add Outcome', section: 'Content' },
    { name: 'requirements', label: 'Requirements', type: 'list', addLabel: 'Add Requirement', section: 'Content' },
    { name: 'tags', label: 'Tags', type: 'list', addLabel: 'Add Tag', section: 'Content' },
    { name: 'targetAudience', label: 'Target audience', type: 'textarea', section: 'Content', roles: ['admin', 'trainer'] },
    { name: 'refundPolicy', label: 'Refund policy information', type: 'textarea', section: 'Pricing & trainers', roles: ['admin', 'trainer'] },
    { name: 'price', label: 'Selling price in INR (0 = free)', type: 'number', min: 0, default: 0, half: true, section: 'Pricing & trainers', roles: ['admin', 'trainer'] },
    { name: 'compareAtPrice', label: 'Original price (optional, shown struck through)', type: 'number', min: 0, half: true, section: 'Pricing & trainers', roles: ['admin', 'trainer'] },
    { name: 'currency', label: 'Currency', type: 'select', options: [{ value: 'INR', label: 'INR (₹)' }, { value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' }, { value: 'GBP', label: 'GBP (£)' }], default: 'INR', placeholder: false, half: true, section: 'Pricing & trainers', roles: ['admin'] },
    { name: 'trainers', label: 'Assigned trainers', type: 'multiselect', optionsFrom: trainerOptions, section: 'Pricing & trainers', roles: ['admin'] },
    { name: 'isFeatured', label: 'Feature on homepage', type: 'checkbox', section: 'Visibility', roles: ['admin', 'manager'] },
    { name: 'certificateEnabled', label: 'Issue certificate on completion', type: 'checkbox', default: true, section: 'Visibility', roles: ['admin'] },
    { name: 'seo.metaTitle', label: 'SEO title', half: true, section: 'SEO' },
    { name: 'seo.metaDescription', label: 'SEO description', half: true, section: 'SEO' },
  ];
  // Managers edit presentation only; the API enforces the same rule.
  const managerHidden = ['title'];
  return all.filter((f) => (!f.roles || f.roles.includes(role)) && !(role === 'manager' && managerHidden.includes(f.name)));
}

export function courseColumns(base) {
  return [
    {
      key: 'title',
      label: 'Course',
      render: (c) => (
        <div>
          <div className="cell-title">{c.title}</div>
          <div className="cell-sub">{c.category?.name || 'Uncategorised'} · {LEVEL_LABEL[c.level]}</div>
        </div>
      ),
    },
    { key: 'status', label: 'Status', render: (c) => <div>{statusBadge(c.status)}{c.reviewNote && ['rejected', 'needs_revision'].includes(c.status) && <div className="cell-sub">{c.reviewNote}</div>}</div> },
    { key: 'price', label: 'Price', render: (c) => formatPrice(c.price, c.currency) },
    { key: 'lessonCount', label: 'Lessons', render: (c) => c.lessonCount || 0 },
    { key: 'enrollmentCount', label: 'Learners', render: (c) => c.enrollmentCount || 0 },
    { key: 'trainers', label: 'Trainers', render: (c) => c.trainers?.map((t) => t.displayName).join(', ') || '—' },
  ].filter((c) => !(base === 'manager' && c.key === 'price'));
}

export const courseRowActions = (base) => (c, ctx = {}) => (
  <>
    <CourseWorkflowActions course={c} base={base} reload={ctx.reload || (() => {})} />
    {base !== 'manager' && (
      <Link to={`/${base}/courses/${c._id}/curriculum`} className="icon-btn" title="Curriculum" aria-label="Manage curriculum"><LuListTree /></Link>
    )}
    <Link to={`/courses/${c.slug}`} className="icon-btn" title="View" aria-label="View course page" target="_blank"><LuExternalLink /></Link>
  </>
);

// ─── Lessons ──────────────────────────────────────────────
export const lessonFields = [
  { name: 'title', label: 'Lesson title', required: true },
  { name: 'section', label: 'Section', default: 'Lessons', hint: 'Lessons with the same section are grouped in the curriculum', half: true },
  { name: 'durationMinutes', label: 'Duration (minutes)', type: 'number', min: 0, half: true },
  { name: 'youtubeUrl', label: 'YouTube video', type: 'youtube' },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'notes', label: 'Learner notes', type: 'markdown' },
  { name: 'resources', label: 'Resources & attachments', type: 'resources' },
  { name: 'isPreview', label: 'Free preview (visible before enrollment)', type: 'checkbox' },
  { name: 'isPublished', label: 'Published', type: 'checkbox', default: true },
];

// ─── Live sessions & events ───────────────────────────────
export function sessionFields(role, kind = 'session') {
  return [
    { name: 'title', label: 'Title', required: true, section: 'Details' },
    { name: 'kind', label: 'Type', type: 'select', options: [{ value: 'session', label: 'Live session' }, { value: 'event', label: 'Event' }], default: kind, placeholder: false, half: true, section: 'Details' },
    { name: 'trainer', label: 'Trainer', type: 'select', optionsFrom: trainerOptions, half: true, section: 'Details', roles: ['admin', 'manager'] },
    { name: 'startAt', label: 'Starts', type: 'datetime', required: true, half: true, section: 'Details' },
    { name: 'endAt', label: 'Ends', type: 'datetime', required: true, half: true, section: 'Details' },
    { name: 'description', label: 'Description', type: 'markdown', section: 'Details' },
    { name: 'youtubeUrl', label: 'YouTube Live URL', type: 'youtube', hint: 'Paste the live stream or premiere link', section: 'Streaming' },
    { name: 'recordingUrl', label: 'Recording URL (after the session)', type: 'youtube', section: 'Streaming' },
    { name: 'liveStatus', label: 'Live status', type: 'select', options: [{ value: 'auto', label: 'Automatic (by schedule)' }, { value: 'live', label: 'Force LIVE now' }, { value: 'ended', label: 'Mark as ended' }], default: 'auto', placeholder: false, half: true, section: 'Streaming' },
    { name: 'thumbnail', label: 'Thumbnail', type: 'image', folder: 'sessions', section: 'Streaming' },
    { name: 'mode', label: 'Mode', type: 'select', options: [{ value: 'online', label: 'Online' }, { value: 'in_person', label: 'In person' }, { value: 'hybrid', label: 'Hybrid' }], default: 'online', placeholder: false, half: true, section: 'Access' },
    { name: 'venue', label: 'Venue', half: true, section: 'Access', showIf: (v) => v.mode !== 'online' },
    { name: 'accessLevel', label: 'Who can watch', type: 'select', options: [{ value: 'public', label: 'Everyone' }, { value: 'registered', label: 'Logged-in users' }, { value: 'enrolled', label: 'Learners enrolled in a course' }], default: 'public', placeholder: false, half: true, section: 'Access' },
    { name: 'course', label: 'Linked course', type: 'select', optionsFrom: courseOptions, half: true, section: 'Access', showIf: (v) => v.accessLevel === 'enrolled' },
    { name: 'capacity', label: 'Capacity (optional)', type: 'number', min: 0, half: true, section: 'Access' },
    { name: 'requiresRegistration', label: 'Requires registration', type: 'checkbox', section: 'Access' },
    { name: 'isPublished', label: 'Published', type: 'checkbox', section: 'Access', roles: ['admin', 'manager'], hint: 'Trainer-submitted sessions go live for learners once a manager approves them.' },
  ].filter((f) => !f.roles || f.roles.includes(role));
}

export const sessionColumns = [
  { key: 'title', label: 'Session', render: (s) => <div><div className="cell-title">{s.title}</div><div className="cell-sub">{titleCase(s.kind)} · {s.trainer?.displayName || 'No trainer'}</div></div> },
  { key: 'startAt', label: 'When', render: (s) => formatDateTime(s.startAt) },
  { key: 'state', label: 'State', render: (s) => <SessionStateBadge state={sessionState(s)} /> },
  {
    key: 'approvalStatus',
    label: 'Approval',
    render: (s) => (
      <div>
        {statusBadge(s.approvalStatus || 'approved')}
        {s.approvalStatus === 'rejected' && s.rejectionReason && <div className="cell-sub">{s.rejectionReason}</div>}
      </div>
    ),
  },
  { key: 'isPublished', label: 'Visible to learners', render: (s) => yes(s.isPublished) },
  { key: 'registrationCount', label: 'Registered', render: (s) => s.registrationCount ?? '—' },
];

// ─── Content ──────────────────────────────────────────────
export const articleFields = [
  { name: 'title', label: 'Title', required: true },
  { name: 'excerpt', label: 'Excerpt', type: 'textarea' },
  { name: 'body', label: 'Body', type: 'markdown' },
  { name: 'coverImage', label: 'Cover image', type: 'image', folder: 'articles' },
  { name: 'category', label: 'Category', default: 'Awareness', half: true },
  { name: 'readMinutes', label: 'Read time (min)', type: 'number', default: 4, half: true },
  { name: 'authorName', label: 'Author name', half: true },
  { name: 'status', label: 'Status', type: 'select', options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }], default: 'draft', placeholder: false, half: true },
  { name: 'tags', label: 'Tags', type: 'list' },
  { name: 'seo.metaTitle', label: 'SEO title', half: true, section: 'SEO' },
  { name: 'seo.metaDescription', label: 'SEO description', half: true, section: 'SEO' },
];
export const articleColumns = [
  { key: 'title', label: 'Title', render: (a) => <div><div className="cell-title">{a.title}</div><div className="cell-sub">{a.category}</div></div> },
  { key: 'status', label: 'Status', render: (a) => statusBadge(a.status) },
  { key: 'publishedAt', label: 'Published', render: (a) => formatDate(a.publishedAt) || '—' },
];

export const faqFields = [
  { name: 'question', label: 'Question', required: true },
  { name: 'answer', label: 'Answer', type: 'textarea', required: true },
  { name: 'category', label: 'Category', default: 'General', half: true },
  { name: 'order', label: 'Order', type: 'number', default: 0, half: true },
  { name: 'isPublished', label: 'Published', type: 'checkbox', default: true },
];
export const faqColumns = [
  { key: 'question', label: 'Question', render: (f) => <span className="cell-title">{f.question}</span> },
  { key: 'category', label: 'Category' },
  { key: 'isPublished', label: 'Published', render: (f) => yes(f.isPublished) },
];

export const testimonialFields = [
  { name: 'name', label: 'Name', required: true, half: true },
  { name: 'role', label: 'Role / location', half: true },
  { name: 'quote', label: 'Quote', type: 'textarea', required: true },
  { name: 'rating', label: 'Rating', type: 'select', options: [5, 4, 3, 2, 1].map((n) => ({ value: n, label: `${n} stars` })), default: 5, placeholder: false, half: true },
  { name: 'order', label: 'Order', type: 'number', default: 0, half: true },
  { name: 'avatar', label: 'Photo', type: 'image', folder: 'testimonials' },
  { name: 'isPublished', label: 'Published', type: 'checkbox', default: true },
];
export const testimonialColumns = [
  { key: 'name', label: 'Name', render: (t) => <div><div className="cell-title">{t.name}</div><div className="cell-sub">{t.role}</div></div> },
  { key: 'quote', label: 'Quote', render: (t) => <span className="cell-sub">{t.quote.slice(0, 80)}…</span> },
  { key: 'isPublished', label: 'Published', render: (t) => yes(t.isPublished) },
];

export const announcementFields = [
  { name: 'title', label: 'Title', required: true },
  { name: 'message', label: 'Message', type: 'textarea', required: true },
  { name: 'link', label: 'Link (optional)', placeholder: '/courses/mindful-energy', half: true },
  { name: 'linkLabel', label: 'Link label', half: true },
  { name: 'audience', label: 'Audience', type: 'select', options: [{ value: 'all', label: 'Everyone' }, { value: 'learners', label: 'Learners' }, { value: 'trainers', label: 'Trainers' }], default: 'all', placeholder: false, half: true },
  { name: 'startsAt', label: 'Show from', type: 'datetime', half: true },
  { name: 'endsAt', label: 'Show until', type: 'datetime', half: true },
  { name: 'showAsBanner', label: 'Show as site banner', type: 'checkbox' },
  { name: 'notifyUsers', label: 'Also send as notification (on create)', type: 'checkbox' },
  { name: 'isActive', label: 'Active', type: 'checkbox', default: true },
];
export const announcementColumns = [
  { key: 'title', label: 'Title', render: (a) => <span className="cell-title">{a.title}</span> },
  { key: 'audience', label: 'Audience', render: (a) => titleCase(a.audience) },
  { key: 'showAsBanner', label: 'Banner', render: (a) => yes(a.showAsBanner) },
  { key: 'isActive', label: 'Active', render: (a) => yes(a.isActive) },
];

export const categoryFields = [
  { name: 'name', label: 'Name', required: true },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'order', label: 'Order', type: 'number', default: 0 },
];
export const categoryColumns = [
  { key: 'name', label: 'Name', render: (c) => <span className="cell-title">{c.name}</span> },
  { key: 'slug', label: 'Slug' },
  { key: 'order', label: 'Order' },
];

// ─── Trainers ─────────────────────────────────────────────
export function trainerFields(isNew) {
  return [
    ...(isNew ? [
      { name: 'email', label: 'Login email', type: 'email', required: true, half: true, section: 'Login', hint: 'Creates a trainer account' },
      { name: 'password', label: 'Temporary password', type: 'password', required: true, half: true, section: 'Login' },
    ] : []),
    { name: 'displayName', label: 'Display name', required: true, half: true, section: 'Profile' },
    { name: 'title', label: 'Title', placeholder: 'Meditation Guide', half: true, section: 'Profile' },
    { name: 'shortBio', label: 'Short bio', type: 'textarea', section: 'Profile' },
    { name: 'bio', label: 'Full bio', type: 'markdown', section: 'Profile' },
    { name: 'photo', label: 'Photo', type: 'image', folder: 'trainers', section: 'Profile' },
    { name: 'specialties', label: 'Specialties', type: 'list', addLabel: 'Add Specialty', section: 'Profile' },
    { name: 'experienceYears', label: 'Years of experience', type: 'number', half: true, section: 'Profile' },
    { name: 'order', label: 'Display order', type: 'number', default: 0, half: true, section: 'Profile' },
    { name: 'socials.website', label: 'Website', half: true, section: 'Links' },
    { name: 'socials.instagram', label: 'Instagram', half: true, section: 'Links' },
    { name: 'socials.youtube', label: 'YouTube', half: true, section: 'Links' },
    { name: 'socials.linkedin', label: 'LinkedIn', half: true, section: 'Links' },
    { name: 'isPublished', label: 'Show on website', type: 'checkbox', default: true, section: 'Links' },
  ];
}
export const trainerColumns = [
  { key: 'displayName', label: 'Trainer', render: (t) => <div><div className="cell-title">{t.displayName}</div><div className="cell-sub">{t.user?.email}</div></div> },
  { key: 'title', label: 'Title' },
  { key: 'isPublished', label: 'Public', render: (t) => yes(t.isPublished) },
];

// ─── Users ────────────────────────────────────────────────
export const ROLE_OPTIONS = [
  { value: 'learner', label: 'Learner' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'manager', label: 'Content & Live Manager' },
  { value: 'admin', label: 'Admin' },
];
// Operational approvals are not implied by the admin role — grant them explicitly.
export const EXTRA_PERMISSION_OPTIONS = [
  { value: 'trainers:review', label: 'Review trainer applications' },
  { value: 'courses:review', label: 'Review & approve courses' },
];
export const userFields = [
  { name: 'name', label: 'Name', required: true, half: true },
  { name: 'email', label: 'Email', type: 'email', required: true, half: true },
  { name: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS, default: 'learner', placeholder: false, half: true },
  { name: 'password', label: 'Password', type: 'password', hint: 'Required for new users. Leave blank to keep the current password.', half: true },
  { name: 'isActive', label: 'Account active', type: 'checkbox', default: true },
  { name: 'extraPermissions', label: 'Extra permissions', type: 'multiselect', options: EXTRA_PERMISSION_OPTIONS, hint: 'Admins can only approve trainers and courses when explicitly granted here.', showIf: (v) => ['admin', 'manager'].includes(v.role) },
];
export const userColumns = [
  { key: 'name', label: 'User', render: (u) => <div><div className="cell-title">{u.name}</div><div className="cell-sub">{u.email}</div></div> },
  { key: 'role', label: 'Role', render: (u) => <span className="badge">{ROLE_OPTIONS.find((r) => r.value === u.role)?.label}</span> },
  { key: 'isActive', label: 'Status', render: (u) => (u.isActive ? <span className="badge badge-success">Active</span> : <span className="badge badge-danger">Disabled</span>) },
  { key: 'createdAt', label: 'Joined', render: (u) => formatDate(u.createdAt) },
];
