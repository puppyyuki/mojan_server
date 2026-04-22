export type AdminRole = 'ADMIN' | 'GENERAL_STAFF'

export const GENERAL_STAFF_USERNAMES = ['DJ1021', 'DJ1022'] as const

export const GENERAL_STAFF_ALLOWED_PATHS = [
  '/admin/agent-management',
  '/admin/club-management',
  '/admin/user-management',
  '/admin/payment-management',
  '/admin/game-record-management',
  '/admin/card-replenishment',
  '/admin/promotion',
  '/admin/statistics',
  '/admin/announcement-management',
] as const

const GENERAL_STAFF_ALLOWED_PATH_SET = new Set<string>(GENERAL_STAFF_ALLOWED_PATHS)

export function normalizeAdminRole(role: string | null | undefined): AdminRole {
  return role === 'GENERAL_STAFF' ? 'GENERAL_STAFF' : 'ADMIN'
}

export function canAccessAdminPath(role: string | null | undefined, path: string): boolean {
  const normalizedRole = normalizeAdminRole(role)
  if (normalizedRole === 'ADMIN') {
    return true
  }
  return GENERAL_STAFF_ALLOWED_PATH_SET.has(path)
}

export function getDefaultAdminPath(role: string | null | undefined): string {
  const normalizedRole = normalizeAdminRole(role)
  if (normalizedRole === 'GENERAL_STAFF') {
    return GENERAL_STAFF_ALLOWED_PATHS[0]
  }
  return '/admin'
}
