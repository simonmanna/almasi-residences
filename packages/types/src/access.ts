/**
 * Users, roles and permissions — the vocabulary the API enforces and the admin
 * explains.
 *
 * Roles live in the database (so a business can add "Senior agent" without a
 * deploy); what a permission *means* lives here, next to the code that checks
 * it. A role holds a set of grants; each grant is a permission plus, for the
 * permissions that read or change people's records, how far it reaches (its
 * data scope). A user's effective access is their role's grants with their
 * individual overrides applied on top.
 *
 * The API resolves this on every request (AdminGuard). The admin reads the same
 * resolution only to decide what to show — never as the control.
 */
import { PERMISSION_LABEL, PERMISSIONS, type Permission } from './admin.js';

// ─── Data scopes ─────────────────────────────────────────────────────────

/** Ordered narrowest → widest; a wider scope includes everything a narrower one does. */
export const PERMISSION_SCOPES = ['NONE', 'OWN', 'ASSIGNED', 'TEAM', 'DEPARTMENT', 'ALL'] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export const SCOPE_LABEL: Record<PermissionScope, string> = {
  NONE: 'None',
  OWN: 'Own',
  ASSIGNED: 'Assigned',
  TEAM: 'Team',
  DEPARTMENT: 'Department',
  ALL: 'All',
};

export const SCOPE_DESCRIPTION: Record<PermissionScope, string> = {
  NONE: 'No access.',
  OWN: 'Only records they created or that are assigned to them.',
  ASSIGNED: 'Records assigned to them, plus unassigned ones waiting to be picked up.',
  TEAM: 'Their own and unassigned records, and those of the people in their team.',
  DEPARTMENT: 'Their own and unassigned records, and those of everyone in their department.',
  ALL: 'Every record.',
};

export const scopeRank = (s: PermissionScope | null | undefined): number => (s ? PERMISSION_SCOPES.indexOf(s) : 0);
export const widerScope = (a: PermissionScope, b: PermissionScope): PermissionScope => (scopeRank(a) >= scopeRank(b) ? a : b);

// ─── The catalog ─────────────────────────────────────────────────────────

export const PERMISSION_GROUPS = [
  { key: 'crm', label: 'CRM', description: 'Leads, contacts, activities, tasks and viewings.' },
  { key: 'pipeline', label: 'Pipeline', description: 'Pipeline stages, lead scoring and assignment rules.' },
  { key: 'deals', label: 'Deals', description: 'Negotiations, agreed prices and closing sales.' },
  { key: 'reservations', label: 'Reservations', description: 'Holding residences for buyers.' },
  { key: 'finance', label: 'Finance', description: 'Deposits, reservation amounts and payment plans.' },
  { key: 'properties', label: 'Property', description: 'The property, floors, types, rooms, parking and amenities.' },
  { key: 'residences', label: 'Residences', description: 'Residences, their availability and prices.' },
  { key: 'residents', label: 'Residents', description: 'People living in the building.' },
  { key: 'marketing', label: 'Marketing', description: 'Campaigns and lead sources.' },
  { key: 'website', label: 'Website & media', description: 'Images, galleries, page content and publishing.' },
  { key: 'reports', label: 'Reports', description: 'Sales, demand and CRM reports.' },
  { key: 'users', label: 'Users & access', description: 'Accounts, roles and permissions.' },
  { key: 'settings', label: 'Settings', description: 'Platform configuration.' },
  { key: 'audit', label: 'Audit log', description: 'The record of every consequential change.' },
] as const;
export type PermissionGroupKey = (typeof PERMISSION_GROUPS)[number]['key'];

export interface PermissionDef {
  key: Permission;
  group: PermissionGroupKey;
  /** Short, business-readable: "View leads". */
  label: string;
  /** One sentence a manager can act on. */
  description: string;
  /**
   * For permissions over people's records: the scopes it may take. Absent means
   * an action permission — simply allowed or not.
   */
  scopes?: readonly PermissionScope[];
  /** Worth a second look before granting: exports, deletions, money, access control. */
  sensitive?: boolean;
}

const RECORD_SCOPES = ['OWN', 'ASSIGNED', 'TEAM', 'DEPARTMENT', 'ALL'] as const satisfies readonly PermissionScope[];

export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  // CRM
  { key: 'enquiry.view', group: 'crm', label: 'View leads', description: 'Open leads with their activities, tasks, viewings and deals.', scopes: RECORD_SCOPES },
  { key: 'enquiry.edit', group: 'crm', label: 'Create & edit leads', description: 'Add leads, log activities, manage tasks and viewings, move leads through the pipeline.', scopes: RECORD_SCOPES },
  { key: 'enquiry.assign', group: 'crm', label: 'Assign & reassign leads', description: 'Give leads, tasks and deals to other people.' },
  { key: 'enquiry.merge', group: 'crm', label: 'Merge duplicate leads', description: 'Combine two leads for the same person into one.' },
  { key: 'enquiry.archive', group: 'crm', label: 'Archive leads', description: 'Remove leads from the pipeline and restore them. Leads are never erased.', sensitive: true },
  { key: 'enquiry.export', group: 'crm', label: 'Export leads', description: 'Download every lead with contact details as a spreadsheet.', sensitive: true },
  { key: 'buyer.view', group: 'crm', label: 'View contacts', description: 'See buyers and their contact details.' },
  { key: 'buyer.edit', group: 'crm', label: 'Edit contacts', description: 'Add and edit buyers, and link them to residences.' },
  { key: 'crm.documents', group: 'crm', label: 'Lead documents', description: 'Upload, read and download documents attached to leads and deals.' },
  // Pipeline
  { key: 'crm.configure', group: 'pipeline', label: 'Configure the pipeline', description: 'Create, rename, reorder and switch off stages; set scoring and assignment rules.' },
  // Deals
  { key: 'deal.edit', group: 'deals', label: 'Create & work deals', description: 'Open deals on residences and move them to contract.', scopes: RECORD_SCOPES },
  { key: 'deal.price', group: 'deals', label: 'Approve prices & discounts', description: 'Agree a price or discount below list, and approve requests from others.', sensitive: true },
  { key: 'deal.close', group: 'deals', label: 'Close deals', description: 'Mark deals sold, and approve requests to close them.', sensitive: true },
  // Reservations
  { key: 'reservation.edit', group: 'reservations', label: 'Approve & manage reservations', description: 'Hold, extend, release and convert reservations, and approve requests to reserve.', sensitive: true },
  // Finance
  { key: 'finance.view', group: 'finance', label: 'View financial details', description: 'See deposits, reservation amounts and discount totals.', sensitive: true },
  { key: 'payment-plan.view', group: 'finance', label: 'View payment plans', description: 'See payment plans and their milestones.' },
  { key: 'payment-plan.edit', group: 'finance', label: 'Manage payment plans', description: 'Create and change payment plans.' },
  // Property
  { key: 'property.view', group: 'properties', label: 'View the property', description: 'See the property overview and dashboard.' },
  { key: 'property.edit', group: 'properties', label: 'Edit the property', description: 'Change the property details, contact information and location.' },
  { key: 'floor.view', group: 'properties', label: 'View floors', description: 'See floors and their plans.' },
  { key: 'floor.edit', group: 'properties', label: 'Manage floors', description: 'Create, edit and delete floors.' },
  { key: 'typology.view', group: 'properties', label: 'View residence types', description: 'See residence types and features.' },
  { key: 'typology.edit', group: 'properties', label: 'Manage residence types', description: 'Create and change residence types and features.' },
  { key: 'room.edit', group: 'properties', label: 'Manage rooms', description: 'Edit the rooms and spaces inside residences.' },
  { key: 'parking.view', group: 'properties', label: 'View parking', description: 'See parking spaces.' },
  { key: 'parking.edit', group: 'properties', label: 'Manage parking', description: 'Create, assign and release parking spaces.' },
  { key: 'amenity.edit', group: 'properties', label: 'Manage amenities', description: 'Edit the amenities shown to buyers.' },
  // Residences
  { key: 'residence.view', group: 'residences', label: 'View residences', description: 'See residences, their availability and list prices.' },
  { key: 'residence.edit', group: 'residences', label: 'Create & edit residences', description: 'Add residences and change their details.' },
  { key: 'residence.status', group: 'residences', label: 'Change availability', description: 'Mark residences available, reserved, sold or unavailable.' },
  { key: 'residence.price', group: 'residences', label: 'Change list prices', description: 'Set list prices, promotions and discounts on residences.', sensitive: true },
  { key: 'residence.notes', group: 'residences', label: 'Read private notes', description: 'See the internal notes kept on residences.' },
  { key: 'residence.delete', group: 'residences', label: 'Archive residences', description: 'Archive and delete residences.', sensitive: true },
  { key: 'residence.reverse-sale', group: 'residences', label: 'Undo a sale', description: 'Return a sold or occupied residence to open.', sensitive: true },
  { key: 'residence.export', group: 'residences', label: 'Export residences', description: 'Download every residence with prices as a spreadsheet.', sensitive: true },
  // Residents
  { key: 'resident.view', group: 'residents', label: 'View residents', description: 'See residents and their contact details.' },
  { key: 'resident.edit', group: 'residents', label: 'Manage residents', description: 'Add, edit and archive residents.' },
  // Marketing
  { key: 'campaign.edit', group: 'marketing', label: 'Manage campaigns', description: 'Create and edit campaigns and lead sources.' },
  // Website & media
  { key: 'media.view', group: 'website', label: 'View media', description: 'See the media library.' },
  { key: 'media.edit', group: 'website', label: 'Manage media', description: 'Upload, edit and remove images, videos and plans.' },
  { key: 'gallery.view', group: 'website', label: 'View galleries', description: 'See galleries.' },
  { key: 'gallery.edit', group: 'website', label: 'Manage galleries', description: 'Create and arrange galleries.' },
  { key: 'content.view', group: 'website', label: 'View website content', description: 'See page content, FAQs and progress updates.' },
  { key: 'content.edit', group: 'website', label: 'Edit website content', description: 'Change page content and FAQs as drafts.' },
  { key: 'content.publish', group: 'website', label: 'Publish website content', description: 'Put content live, take it down and archive it.', sensitive: true },
  // Reports
  { key: 'reports.view', group: 'reports', label: 'View reports', description: 'See sales, demand, CRM and website reports.' },
  // Users & access
  { key: 'user.view', group: 'users', label: 'View users', description: 'See who has an account, their role and activity.' },
  { key: 'user.create', group: 'users', label: 'Add users', description: 'Invite people to the admin.', sensitive: true },
  { key: 'user.edit', group: 'users', label: 'Edit users', description: 'Change profiles, reset passwords and two-factor, sign people out.', sensitive: true },
  { key: 'user.deactivate', group: 'users', label: 'Deactivate users', description: 'Suspend or deactivate accounts and reassign their work.', sensitive: true },
  { key: 'user.assign-role', group: 'users', label: 'Assign roles', description: 'Change someone’s role — never to one with more access than their own.', sensitive: true },
  { key: 'role.manage', group: 'users', label: 'Manage roles & permissions', description: 'Create and edit roles and give individual permission overrides.', sensitive: true },
  // Settings
  { key: 'settings.edit', group: 'settings', label: 'Edit settings', description: 'Change platform-wide settings.', sensitive: true },
  // Audit
  { key: 'audit.view', group: 'audit', label: 'View the audit log', description: 'Read who changed what, and when.' },
  { key: 'audit.export', group: 'audit', label: 'Export the audit log', description: 'Download the audit log as a spreadsheet.', sensitive: true },
];

export const PERMISSION_DEF: Record<Permission, PermissionDef> = Object.fromEntries(PERMISSION_CATALOG.map((d) => [d.key, d])) as Record<Permission, PermissionDef>;

export const isScoped = (p: Permission): boolean => Boolean(PERMISSION_DEF[p]?.scopes);
export const isPermission = (p: string): p is Permission => (PERMISSIONS as readonly string[]).includes(p);

/** The scopes a permission may be given, NONE first. */
export function scopesFor(p: Permission): readonly PermissionScope[] {
  return PERMISSION_DEF[p]?.scopes ? ['NONE', ...PERMISSION_DEF[p].scopes!] : ['NONE', 'ALL'];
}

/** A grant stored for an action permission is always ALL; a scoped one is clamped to what it allows. */
export function normaliseScope(p: Permission, scope: PermissionScope): PermissionScope {
  if (scope === 'NONE') return 'NONE';
  const allowed = PERMISSION_DEF[p]?.scopes;
  if (!allowed) return 'ALL';
  return allowed.includes(scope) ? scope : 'ALL';
}

// ─── Grants and resolution ───────────────────────────────────────────────

/** Permission → scope. A permission that is absent is not granted. */
export type Grants = Partial<Record<Permission, PermissionScope>>;

export interface OverrideGrant {
  permission: string;
  scope: PermissionScope;
  expiresAt?: Date | string | null;
}

/** Anything the API or the admin can ask "may they…?" of. */
export type AccessSubject = { grants: Grants } | null | undefined;

export function scopeOf(subject: AccessSubject, p: Permission): PermissionScope {
  return subject?.grants[p] ?? 'NONE';
}

/**
 * Whether a subject holds a permission — at least at `min` scope. Signature
 * kept from the static role table this replaced: `can(actor, 'deal.close')`.
 */
export function can(subject: AccessSubject, p: Permission, min: PermissionScope = 'OWN'): boolean {
  const s = scopeOf(subject, p);
  return s !== 'NONE' && scopeRank(s) >= scopeRank(min);
}

const live = (o: OverrideGrant, now: Date) => !o.expiresAt || new Date(o.expiresAt) > now;

/** Role grants with the user's live overrides applied. An override replaces the role's scope outright, up or down. */
export function effectiveGrants(role: Grants, overrides: readonly OverrideGrant[] = [], now = new Date()): Grants {
  const out: Grants = { ...role };
  for (const o of overrides) {
    if (!isPermission(o.permission) || !live(o, now)) continue;
    const scope = normaliseScope(o.permission, o.scope);
    if (scope === 'NONE') delete out[o.permission];
    else out[o.permission] = scope;
  }
  return out;
}

export interface AccessLine {
  permission: Permission;
  group: PermissionGroupKey;
  label: string;
  description: string;
  scoped: boolean;
  role: PermissionScope;
  override: PermissionScope | null;
  overrideExpiresAt: string | null;
  effective: PermissionScope;
  /** Where the effective value comes from, for the "why can they do this?" question. */
  source: 'role' | 'override' | 'none';
}

/** Every permission, with the role's value, any override, and the result. */
export function explainAccess(role: Grants, overrides: readonly OverrideGrant[] = [], now = new Date()): AccessLine[] {
  const eff = effectiveGrants(role, overrides, now);
  return PERMISSION_CATALOG.map((d) => {
    const o = overrides.find((x) => x.permission === d.key && live(x, now));
    const effective = eff[d.key] ?? 'NONE';
    return {
      permission: d.key,
      group: d.group,
      label: d.label,
      description: d.description,
      scoped: Boolean(d.scopes),
      role: role[d.key] ?? 'NONE',
      override: o ? normaliseScope(d.key, o.scope) : null,
      overrideExpiresAt: o?.expiresAt ? new Date(o.expiresAt).toISOString() : null,
      effective,
      source: o ? 'override' : effective === 'NONE' ? 'none' : 'role',
    };
  });
}

/**
 * The grants in `wanted` that go beyond what `holder` has — what someone would
 * be handing out that they do not hold themselves. Empty means no escalation.
 */
export function exceeding(wanted: Grants, holder: Grants): Permission[] {
  return (Object.keys(wanted) as Permission[]).filter((p) => scopeRank(wanted[p]) > scopeRank(holder[p]));
}

export const permissionName = (p: Permission): string => PERMISSION_DEF[p]?.label ?? PERMISSION_LABEL[p] ?? p;

// ─── Default roles ───────────────────────────────────────────────────────

export interface DefaultRole {
  key: string;
  name: string;
  description: string;
  grants: Grants;
}

const all = (...ps: Permission[]): Grants => Object.fromEntries(ps.map((p) => [p, 'ALL'])) as Grants;

const BROWSE: Permission[] = ['property.view', 'floor.view', 'residence.view', 'typology.view', 'parking.view', 'payment-plan.view', 'media.view', 'gallery.view', 'content.view'];

/**
 * Written to the database once per role (Role.seededAt) and then owned by the
 * business: editing a role in the admin is never undone by a deploy. Keys of
 * the roles that existed before roles moved to the database are kept, so
 * existing accounts keep exactly the access they had.
 */
export const DEFAULT_ROLES: readonly DefaultRole[] = [
  {
    key: 'OWNER',
    name: 'Owner / Director',
    description: 'Full business visibility — CRM, residences, sales, reservations, finance, reports and the audit log — and approves prices, discounts, reservations and sales. No system configuration.',
    grants: {
      ...all(...BROWSE, 'residence.export', 'residence.notes', 'resident.view', 'buyer.view', 'enquiry.export', 'reports.view', 'finance.view', 'audit.view', 'audit.export', 'user.view', 'crm.documents', 'deal.price', 'deal.close', 'reservation.edit'),
      'enquiry.view': 'ALL',
      'deal.edit': 'ALL',
    },
  },
  {
    key: 'SUPER_ADMIN',
    name: 'System Administrator',
    description: 'Users, roles, permissions, security and system configuration. Holds every permission so the platform can always be recovered.',
    grants: all(...PERMISSIONS),
  },
  {
    key: 'SALES_MANAGER',
    name: 'Sales Manager',
    description: 'Runs the sales team: every lead, assignment, the pipeline, viewings, deals, prices and reservations, and the team’s reports.',
    grants: {
      ...all(...BROWSE, 'residence.export', 'residence.status', 'residence.price', 'residence.notes', 'payment-plan.edit', 'parking.edit', 'buyer.view', 'buyer.edit', 'enquiry.export', 'resident.view', 'reservation.edit', 'reports.view', 'enquiry.assign', 'enquiry.merge', 'enquiry.archive', 'deal.price', 'deal.close', 'campaign.edit', 'crm.documents', 'crm.configure', 'finance.view', 'user.view'),
      'enquiry.view': 'ALL',
      'enquiry.edit': 'ALL',
      'deal.edit': 'ALL',
    },
  },
  {
    key: 'SALES_AGENT',
    name: 'Sales Agent',
    description: 'Manages assigned leads, customers, viewings and sales activities. Requests approval for discounts, reservations and closing.',
    grants: {
      ...all(...BROWSE, 'buyer.view', 'buyer.edit', 'crm.documents'),
      'enquiry.view': 'ASSIGNED',
      'enquiry.edit': 'ASSIGNED',
      'deal.edit': 'ASSIGNED',
    },
  },
  {
    key: 'MARKETING',
    name: 'Marketing Manager',
    description: 'Campaigns, lead sources, website leads and marketing reports. No access to negotiations or financial details.',
    grants: { ...all('property.view', 'floor.view', 'residence.view', 'typology.view', 'media.view', 'gallery.view', 'content.view', 'campaign.edit', 'reports.view'), 'enquiry.view': 'ALL' },
  },
  {
    key: 'FINANCE',
    name: 'Finance / Accounts',
    description: 'Deals, approved prices, reservations, deposits, payment plans and financial reports. Does not work leads or configure the property.',
    grants: {
      ...all(...BROWSE, 'residence.export', 'buyer.view', 'finance.view', 'payment-plan.edit', 'reservation.edit', 'deal.price', 'reports.view', 'crm.documents'),
      'enquiry.view': 'ALL',
      'deal.edit': 'ALL',
    },
  },
  {
    key: 'VIEWER',
    name: 'Viewer / Auditor',
    description: 'Read-only: browses the property, reports and the audit log. No contact details, exports or changes.',
    grants: all(...BROWSE, 'reports.view', 'audit.view'),
  },
  {
    key: 'PROPERTY_MANAGER',
    name: 'Property Manager',
    description: 'Property, floors, residences, rooms, parking, amenities and residents.',
    grants: all(...BROWSE, 'residence.export', 'property.edit', 'floor.edit', 'residence.edit', 'residence.delete', 'residence.status', 'residence.notes', 'typology.edit', 'room.edit', 'parking.edit', 'amenity.edit', 'resident.view', 'resident.edit', 'media.edit', 'content.publish', 'audit.view', 'reports.view'),
  },
  {
    key: 'CONTENT_MANAGER',
    name: 'Content Manager',
    description: 'Images, galleries, videos, floor plans, designs and website content.',
    grants: all(...BROWSE, 'media.edit', 'gallery.edit', 'content.edit', 'content.publish', 'amenity.edit'),
  },
];

export const DEFAULT_ROLE = (key: string) => DEFAULT_ROLES.find((r) => r.key === key);

// ─── Users ───────────────────────────────────────────────────────────────

export const USER_STATUSES = ['ACTIVE', 'INVITED', 'SUSPENDED', 'INACTIVE'] as const;
export type UserStatusValue = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABEL: Record<UserStatusValue, string> = {
  ACTIVE: 'Active',
  INVITED: 'Invited',
  SUSPENDED: 'Suspended',
  INACTIVE: 'Inactive',
};

/** Who may sign in. An invited user signs in with their temporary password and becomes active. */
export const canSignIn = (s: UserStatusValue | string) => s === 'ACTIVE' || s === 'INVITED';

export const DEPARTMENTS = ['Sales', 'Marketing', 'Finance', 'Operations', 'Property', 'Management', 'IT'] as const;

// ─── Approvals ───────────────────────────────────────────────────────────

export const APPROVAL_KINDS = ['DISCOUNT', 'PRICE_CHANGE', 'RESERVATION', 'DEAL_CLOSE', 'CANCELLATION'] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const APPROVAL_KIND_LABEL: Record<ApprovalKind, string> = {
  DISCOUNT: 'Discount approval',
  PRICE_CHANGE: 'Price approval',
  RESERVATION: 'Reservation approval',
  DEAL_CLOSE: 'Close deal',
  CANCELLATION: 'Cancellation',
};

/** The permission an approver needs for each kind — the same one that would let them do it directly. */
export const APPROVAL_PERMISSION: Record<ApprovalKind, Permission> = {
  DISCOUNT: 'deal.price',
  PRICE_CHANGE: 'deal.price',
  RESERVATION: 'reservation.edit',
  DEAL_CLOSE: 'deal.close',
  CANCELLATION: 'reservation.edit',
};
