/**
 * Role-based access control.
 *
 * Roles are stored on the User document (`user.role`). Each role maps to a set
 * of granular permissions. Individual users may also receive extra permissions
 * (`user.extraPermissions`) — e.g. a manager who should also see orders —
 * without inventing a new role. This keeps RBAC in one place and avoids
 * separate Role/Permission collections that would have to be kept in sync.
 */

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
});

const P = PERMISSIONS;

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: ['*'],
  [ROLES.MANAGER]: [
    P.COURSES_PRESENTATION,
    P.LIVE_MANAGE_ALL,
    P.CONTENT_MANAGE,
    P.MESSAGES_READ,
    P.UPLOADS_CREATE,
    P.NOTIFY_BROADCAST,
  ],
  [ROLES.TRAINER]: [P.COURSES_MANAGE_OWN, P.LIVE_MANAGE_OWN, P.UPLOADS_CREATE],
  [ROLES.LEARNER]: [],
});

export function permissionsFor(user) {
  if (!user) return [];
  const base = ROLE_PERMISSIONS[user.role] || [];
  return [...new Set([...base, ...(user.extraPermissions || [])])];
}

export function can(user, permission) {
  const perms = permissionsFor(user);
  return perms.includes('*') || perms.includes(permission);
}
