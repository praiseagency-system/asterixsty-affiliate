/**
 * permissions.ts
 *
 * Single source of truth for:
 *  - All permission strings (PERMISSIONS constant)
 *  - UI grouping (PERMISSION_CATEGORIES)
 *  - Per-role default permission sets (ROLE_PERMISSIONS)
 *  - Human-readable labels (PERMISSION_LABELS)
 *
 * Rule: role is just a PRESET. Any permission can be granted/denied
 * individually via UserPermission rows (stored in DB). The final
 * effective permission set = role defaults ± user overrides.
 */

// ─── All permissions ──────────────────────────────────────────────────────────
export const PERMISSIONS = {
  // Dashboard
  VIEW_DASHBOARD:      "view_dashboard",
  VIEW_FINANCIAL:      "view_financial",
  EXPORT_ANALYTICS:    "export_analytics",

  // Affiliate Management
  VIEW_AFFILIATE:      "view_affiliate",
  CREATE_AFFILIATE:    "create_affiliate",
  EDIT_AFFILIATE:      "edit_affiliate",
  DELETE_AFFILIATE:    "delete_affiliate",

  // Sample Delivery
  VIEW_SAMPLE:         "view_sample",
  CREATE_SAMPLE:       "create_sample",
  EDIT_SAMPLE:         "edit_sample",
  DELETE_SAMPLE:       "delete_sample",

  // Broadcast
  VIEW_BROADCAST:      "view_broadcast",
  CREATE_BROADCAST:    "create_broadcast",
  START_QUEUE:         "start_queue",
  PAUSE_QUEUE:         "pause_queue",
  DELETE_BROADCAST:    "delete_broadcast",

  // Campaign
  VIEW_CAMPAIGN:       "view_campaign",
  CREATE_CAMPAIGN:     "create_campaign",
  EDIT_CAMPAIGN:       "edit_campaign",
  DELETE_CAMPAIGN:     "delete_campaign",
  GENERATE_FORMS:      "generate_forms",

  // Automation / WhatsApp
  MANAGE_WHATSAPP:     "manage_whatsapp",
  ADD_SENDER:          "add_sender",
  REMOVE_SENDER:       "remove_sender",
  RECONNECT_SENDER:    "reconnect_sender",

  // Monitoring
  VIEW_MONITORING:     "view_monitoring",

  // Content Intelligence
  VIEW_CONTENT:        "view_content",

  // Team
  VIEW_TEAM:           "view_team",
  INVITE_MEMBER:       "invite_member",
  REMOVE_MEMBER:       "remove_member",
  EDIT_PERMISSION:     "edit_permission",

  // Settings & System
  EDIT_WORKSPACE:      "edit_workspace",
  BRANDING_SETTINGS:   "branding_settings",
  GOOGLE_INTEGRATION:  "google_integration",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

// ─── Human-readable labels ────────────────────────────────────────────────────
export const PERMISSION_LABELS: Record<Permission, string> = {
  view_dashboard:     "View Dashboard",
  view_financial:     "View Financial Data",
  export_analytics:   "Export Analytics",

  view_affiliate:     "View Affiliates",
  create_affiliate:   "Add Affiliate",
  edit_affiliate:     "Edit Affiliate",
  delete_affiliate:   "Delete Affiliate",

  view_sample:        "View Samples",
  create_sample:      "Create Sample Delivery",
  edit_sample:        "Edit Sample Delivery",
  delete_sample:      "Delete Sample Delivery",

  view_broadcast:     "View Broadcasts",
  create_broadcast:   "Create Broadcast",
  start_queue:        "Start/Resume Queue",
  pause_queue:        "Pause Queue",
  delete_broadcast:   "Delete Broadcast",

  view_campaign:      "View Campaigns",
  create_campaign:    "Create Campaign",
  edit_campaign:      "Edit Campaign",
  delete_campaign:    "Delete Campaign",
  generate_forms:     "Generate Google Forms",

  manage_whatsapp:    "Manage WhatsApp Sessions",
  add_sender:         "Add Sender",
  remove_sender:      "Remove Sender",
  reconnect_sender:   "Reconnect Sender",

  view_monitoring:    "View Monitoring Reports",

  view_content:       "View Content Library",

  view_team:          "View Team Members",
  invite_member:      "Invite Members",
  remove_member:      "Remove Members",
  edit_permission:    "Edit Member Permissions",

  edit_workspace:     "Edit Workspace Settings",
  branding_settings:  "Branding & Appearance",
  google_integration: "Google Integration",
};

// ─── UI grouping for the permissions checklist ────────────────────────────────
export const PERMISSION_CATEGORIES: { label: string; perms: Permission[] }[] = [
  {
    label: "Dashboard",
    perms: [PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.VIEW_FINANCIAL, PERMISSIONS.EXPORT_ANALYTICS],
  },
  {
    label: "Affiliate Management",
    perms: [
      PERMISSIONS.VIEW_AFFILIATE, PERMISSIONS.CREATE_AFFILIATE,
      PERMISSIONS.EDIT_AFFILIATE, PERMISSIONS.DELETE_AFFILIATE,
    ],
  },
  {
    label: "Sample Delivery",
    perms: [
      PERMISSIONS.VIEW_SAMPLE, PERMISSIONS.CREATE_SAMPLE,
      PERMISSIONS.EDIT_SAMPLE, PERMISSIONS.DELETE_SAMPLE,
    ],
  },
  {
    label: "Broadcast",
    perms: [
      PERMISSIONS.VIEW_BROADCAST, PERMISSIONS.CREATE_BROADCAST,
      PERMISSIONS.START_QUEUE,    PERMISSIONS.PAUSE_QUEUE,
      PERMISSIONS.DELETE_BROADCAST,
    ],
  },
  {
    label: "Campaign",
    perms: [
      PERMISSIONS.VIEW_CAMPAIGN, PERMISSIONS.CREATE_CAMPAIGN,
      PERMISSIONS.EDIT_CAMPAIGN, PERMISSIONS.DELETE_CAMPAIGN,
      PERMISSIONS.GENERATE_FORMS,
    ],
  },
  {
    label: "Automation",
    perms: [
      PERMISSIONS.MANAGE_WHATSAPP, PERMISSIONS.ADD_SENDER,
      PERMISSIONS.REMOVE_SENDER,   PERMISSIONS.RECONNECT_SENDER,
    ],
  },
  {
    label: "Monitoring & Content",
    perms: [PERMISSIONS.VIEW_MONITORING, PERMISSIONS.VIEW_CONTENT],
  },
  {
    label: "Team Management",
    perms: [
      PERMISSIONS.VIEW_TEAM,    PERMISSIONS.INVITE_MEMBER,
      PERMISSIONS.REMOVE_MEMBER, PERMISSIONS.EDIT_PERMISSION,
    ],
  },
  {
    label: "Settings & System",
    perms: [
      PERMISSIONS.EDIT_WORKSPACE, PERMISSIONS.BRANDING_SETTINGS,
      PERMISSIONS.GOOGLE_INTEGRATION,
    ],
  },
];

// ─── Role presets ─────────────────────────────────────────────────────────────
// These are defaults; individual users can override via UserPermission rows.
const P = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {

  OWNER: ALL_PERMISSIONS,

  ADMIN: ALL_PERMISSIONS.filter(
    (p) => p !== P.EDIT_PERMISSION, // ADMIN cannot change other admins' permissions
  ),

  OPERATIONS: [
    P.VIEW_DASHBOARD,
    P.VIEW_AFFILIATE,
    P.VIEW_SAMPLE,   P.CREATE_SAMPLE, P.EDIT_SAMPLE, P.DELETE_SAMPLE,
    P.VIEW_BROADCAST, P.CREATE_BROADCAST, P.START_QUEUE, P.PAUSE_QUEUE,
    P.MANAGE_WHATSAPP, P.RECONNECT_SENDER,
    P.VIEW_MONITORING,
  ],

  SPECIALIST: [
    P.VIEW_DASHBOARD,
    P.VIEW_AFFILIATE, P.CREATE_AFFILIATE, P.EDIT_AFFILIATE,
    P.VIEW_SAMPLE, P.CREATE_SAMPLE, P.EDIT_SAMPLE,
    P.VIEW_CAMPAIGN,
    P.VIEW_MONITORING,
    P.VIEW_CONTENT,
  ],

  ANALYST: [
    P.VIEW_DASHBOARD,
    P.VIEW_FINANCIAL,
    P.EXPORT_ANALYTICS,
    P.VIEW_AFFILIATE,
    P.VIEW_CAMPAIGN,
    P.VIEW_MONITORING,
    P.VIEW_CONTENT,
  ],

  VIEWER: [
    P.VIEW_DASHBOARD,
    P.VIEW_AFFILIATE,
    P.VIEW_SAMPLE,
    P.VIEW_CAMPAIGN,
    P.VIEW_MONITORING,
    P.VIEW_CONTENT,
  ],

  CLIENT: [
    P.VIEW_DASHBOARD,
    P.VIEW_CAMPAIGN,
    P.EXPORT_ANALYTICS,
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute the effective permission set: role defaults overridden by DB rows */
export function resolvePermissions(
  role:      string,
  overrides: { permission: string; granted: boolean }[],
): Set<Permission> {
  const result = new Set<Permission>(ROLE_PERMISSIONS[role] ?? []);
  for (const o of overrides) {
    if (o.granted) result.add(o.permission as Permission);
    else           result.delete(o.permission as Permission);
  }
  return result;
}

/** Returns only the override entries that DIFFER from role defaults */
export function diffFromRoleDefaults(
  role:        string,
  desiredSet:  Set<Permission>,
): { permission: Permission; granted: boolean }[] {
  const roleSet = new Set<Permission>(ROLE_PERMISSIONS[role] ?? []);
  const diffs: { permission: Permission; granted: boolean }[] = [];

  for (const perm of ALL_PERMISSIONS) {
    const inRole    = roleSet.has(perm);
    const inDesired = desiredSet.has(perm);
    if (inRole !== inDesired) {
      diffs.push({ permission: perm, granted: inDesired });
    }
  }
  return diffs;
}

export const ALL_ROLES = ["OWNER", "ADMIN", "OPERATIONS", "SPECIALIST", "ANALYST", "VIEWER", "CLIENT"] as const;
export type RoleType = typeof ALL_ROLES[number];

export const ROLE_DESCRIPTIONS: Record<RoleType, string> = {
  OWNER:      "Full access to everything including billing and workspace settings",
  ADMIN:      "Manage data, members, and workspace — excluding permission editing",
  OPERATIONS: "Manage sample deliveries, broadcasts, and WhatsApp automation",
  SPECIALIST: "Manage assigned affiliates and campaign participation",
  ANALYST:    "Read-only analytics, reports, and financial dashboards",
  VIEWER:     "Read-only access to core data",
  CLIENT:     "Brand dashboard and campaign progress visibility only",
};

/**
 * Simple boolean check — use inside API routes or server components.
 * For client-side, prefer usePermission().can() from PermissionContext.
 */
export function hasPermission(userPermissions: string[], key: string): boolean {
  return userPermissions.includes(key);
}

/**
 * Returns a plain Record<string, boolean> for all known permissions,
 * merging role defaults with per-user overrides (granted/denied pairs).
 * Useful when you need a serialisable map (e.g. to pass to a client component).
 */
export function getEffectivePermissions(
  role:      string,
  overrides: { permission: string; granted: boolean }[] = [],
): Record<string, boolean> {
  const set = resolvePermissions(role, overrides);
  const result: Record<string, boolean> = {};
  for (const perm of ALL_PERMISSIONS) {
    result[perm] = set.has(perm);
  }
  return result;
}
