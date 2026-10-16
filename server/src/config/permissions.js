/**
 * Role-based access control.
 *
 * Roles are stored on the User document (`user.role`). Each role maps to a set
 * of granular permissions. Individual users may also receive extra permissions
 * (`user.extraPermissions`) — e.g. a manager who should also see orders —
 * without inventing a new role. This keeps RBAC in one place and avoids
 * separate Role/Permission collections that would have to be kept in sync.
 */

let verificationRequired = () => false;
/** Wired up by env.js to avoid a circular import. */
export function setVerificationPolicy(fn) {
  verificationRequired = fn;
}

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager', // Content & Live Manager
  TRAINER: 'trainer',
  LEARNER: 'learner',
});

export const PERMISSIONS = Object.freeze({
  // users
  USERS_READ: 'users:read',
  USERS_MANAGE: 'users:manage',
  // courses
  COURSES_MANAGE_ALL: 'courses:manage_all', // full edit on any course
  COURSES_MANAGE_OWN: 'courses:manage_own', // trainer — only assigned courses
  COURSES_PRESENTATION: 'courses:presentation', // marketing fields only
  CATEGORIES_MANAGE: 'categories:manage',
  // live
  LIVE_MANAGE_ALL: 'live:manage_all',
  LIVE_MANAGE_OWN: 'live:manage_own',
  // commerce
  PAYMENTS_READ: 'payments:read',
  PAYMENTS_REFUND: 'payments:refund',
  ENROLLMENTS_MANAGE: 'enrollments:manage',
  // content
  CONTENT_MANAGE: 'content:manage', // articles, faqs, testimonials, announcements, homepage
  TRAINERS_MANAGE: 'trainers:manage',
  SETTINGS_MANAGE: 'settings:manage', // general site settings (admin)
  MESSAGES_READ: 'messages:read',
  UPLOADS_CREATE: 'uploads:create',
  NOTIFY_BROADCAST: 'notifications:broadcast',
  // approval workflow — operational: NOT implied by the admin wildcard
  TRAINERS_REVIEW: 'trainers:review',
  COURSES_REVIEW: 'courses:review',
  AUDIT_READ: 'audit:read',
});

const P = PERMISSIONS;

/**
 * Operational approvals are done by managers. Admins have oversight/audit
 * visibility and only get these when explicitly granted via extraPermissions.
 */
const EXPLICIT_ONLY = new Set([P.TRAINERS_REVIEW, P.COURSES_REVIEW]);

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: ['*'],
  [ROLES.MANAGER]: [
    P.COURSES_PRESENTATION,
    P.LIVE_MANAGE_ALL,
    P.CONTENT_MANAGE,
    P.MESSAGES_READ,
    P.UPLOADS_CREATE,
    P.NOTIFY_BROADCAST,
    P.TRAINERS_REVIEW,
    P.COURSES_REVIEW,
    P.AUDIT_READ,
  ],
  [ROLES.TRAINER]: [P.COURSES_MANAGE_OWN, P.LIVE_MANAGE_OWN, P.UPLOADS_CREATE],
  [ROLES.LEARNER]: [],
});

/**
 * A trainer account only becomes a working trainer once its application is
 * APPROVED (and the email is verified when verification is enforced). Accounts
 * created by an admin carry no `trainerStatus` and are trusted.
 */
export function isTrainerActive(user, { requireVerified = false } = {}) {
  if (!user || user.role !== ROLES.TRAINER) return true;
  if (user.trainerStatus && user.trainerStatus !== 'APPROVED') return false;
  if (requireVerified && user.trainerStatus && !user.emailVerified) return false;
  return true;
}

export function permissionsFor(user) {
  if (!user) return [];
  if (user.role === ROLES.TRAINER && !isTrainerActive(user, { requireVerified: verificationRequired() })) return [];
  const base = ROLE_PERMISSIONS[user.role] || [];
  return [...new Set([...base, ...(user.extraPermissions || [])])];
}

export function can(user, permission) {
  const perms = permissionsFor(user);
  return perms.includes(permission) || (perms.includes('*') && !EXPLICIT_ONLY.has(permission));
}
