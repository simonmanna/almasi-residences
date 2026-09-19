import type { AccessLine, Grants, PermissionDef, PermissionGroupKey, PermissionScope, UserStatusValue } from '@avida/types';
import { get } from './api';
import { useQuery } from './query';

export interface RoleRef {
  id: string;
  key: string;
  name: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  status: UserStatusValue;
  active: boolean;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  deactivatedAt: string | null;
  lockedUntil: string | null;
  twoFactor: boolean;
  overrides: number;
  roleId: string;
  managerId: string | null;
  role: RoleRef;
  manager: { id: string; name: string } | null;
}

export interface UserPage {
  data: UserRow[];
  meta: { total: number; page: number; pageSize: number; pages: number };
  counts: Partial<Record<UserStatusValue, number>>;
}

export interface Workload {
  leads: number;
  tasks: number;
  deals: number;
  viewings: number;
  reservations: number;
  pendingApprovals: number;
  total: number;
}

export interface UserDetail extends UserRow {
  reports: { id: string; name: string }[];
  workload: Workload;
  allowed: { edit: boolean; assignRole: boolean; deactivate: boolean; overrides: boolean };
}

export interface OverrideRow {
  id: string;
  permission: string;
  label: string;
  scope: PermissionScope;
  reason: string | null;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
  grantedBy: { id: string; name: string } | null;
}

export interface UserAccess {
  role: RoleRef & { description: string | null; active: boolean };
  signInAllowed: boolean;
  lines: AccessLine[];
  overrides: OverrideRow[];
}

export interface RoleRow extends RoleRef {
  description: string | null;
  system: boolean;
  active: boolean;
  position: number;
  updatedAt: string;
  users: number;
  inactiveUsers: number;
  permissions: number;
  updatedBy: { id: string; name: string } | null;
}

export interface RoleDetail extends RoleRef {
  description: string | null;
  system: boolean;
  active: boolean;
  updatedAt: string;
  grants: Grants;
  editable: boolean;
  updatedBy: { id: string; name: string } | null;
  users: { id: string; name: string; email: string; status: UserStatusValue; active: boolean; department: string | null; jobTitle: string | null; lastActiveAt: string | null }[];
}

export interface Catalog {
  groups: readonly { key: PermissionGroupKey; label: string; description: string }[];
  permissions: readonly PermissionDef[];
  scopes: { key: PermissionScope; label: string; description: string }[];
}

export interface Facets {
  departments: { value: string; count: number }[];
  roles: (RoleRef & { description: string | null; active: boolean; system: boolean })[];
  managers: { id: string; name: string }[];
}

export interface AuditRow {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  target: string | null;
  summary: string | null;
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
  actor: { id: string; name: string };
}

/** Static metadata: cached for the session under one key. */
export const useCatalog = () => useQuery('permissions', () => get<Catalog>('/admin/permissions'));
export const useRoles = () => useQuery('roles', () => get<RoleRow[]>('/admin/roles'));
export const useFacets = () => useQuery('users:facets', () => get<Facets>('/admin/users/facets'));

/** "Chrome 131 on Windows" from a user-agent string — enough to recognise a device. */
export function device(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /node|undici|playwright/i.test(ua) ? 'Script' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}
