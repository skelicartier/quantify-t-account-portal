import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { heartbeatAccountApiSession } from "@/lib/account/session-lifecycle";
import { getCurrentAssurance } from "@/lib/dal/assurance-guard";
import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  ADMIN_ENTRY_CAPABILITY,
  AUDIT_EVENTS_CAPABILITY,
  CONFIGURATION_CAPABILITY,
  CREDENTIAL_STATUS_CAPABILITY,
  SECRETS_READ_CAPABILITY,
  SECRETS_WRITE_CAPABILITY,
  fetchAccountApiAdminSecrets,
  fetchAccountApiAdminReports,
  fetchAccountApiAdminNotificationEmailQueue,
  fetchAccountApiAdminNotifications,
  fetchAccountApiAdminAuditEvents,
  fetchAccountApiAdminConfiguration,
  fetchAccountApiAdminCredentialStatus,
  fetchAccountApiAdminMetrics,
  fetchAccountApiAdminReleaseStatus,
  fetchAccountApiAdminSubscriptions,
  fetchAccountApiAdminUser,
  fetchAccountApiAdminUsers,
  fetchAccountApiAdminUserEntitlements,
  fetchAccountApiAdminUserUsage,
  fetchAccountApiMe as fetchAccountApiMeUncached,
  fetchAccountApiRoleReport,
  ENTITLEMENT_CHANGED_EVENT,
  NOTIFICATIONS_CAPABILITY,
  RELEASE_STATUS_CAPABILITY,
  ROLE_REPORT_CAPABILITY,
  SUBSCRIPTION_CHANGED_EVENT,
  SUBSCRIPTION_WRITE_CAPABILITY,
  type AccountApiAdminConfiguration,
  type AccountApiAdminCredentialStatus,
  type AccountApiAdminNotificationEmailQueue,
  type AccountApiAdminNotifications,
  type AccountApiAdminAuditEvents,
  type AccountApiAdminAuditFilters,
  type AccountApiAdminMetrics,
  type AccountApiAdminReports,
  type AccountApiAdminReleaseStatus,
  type AccountApiAdminSubscriptions,
  type AccountApiAdminUserDetail,
  type AccountApiAdminUserFilters,
  type AccountApiAdminUsers,
  type AccountApiAdminUserEntitlements,
  type AccountApiAdminUserUsage,
  type AccountApiAdminSecrets,
  type AccountApiMe,
  type AccountApiRoleReport,
} from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";
import { createServerAzureClient } from "@/lib/supabase/server";

// One `/me` per request: the console shell asks "may this person see Admin?" and every
// admin page asks "who is this?"; both answers come from the same call.
const fetchAccountApiMe = cache(fetchAccountApiMeUncached);

/** Which parts of the dashboard could not be loaded; the page renders around them. */
export type AdminDashboardDegradation = "metrics" | "role-report";

export type AdminDashboardAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      metrics: AccountApiAdminMetrics | null;
      roleReport: AccountApiRoleReport | null;
      degraded: AdminDashboardDegradation[];
    }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe };

export type AdminEntry = { me: AccountApiMe; canEnterAdmin: boolean };

export type AdminRoleReportAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      roleReport: AccountApiRoleReport;
      includeMatches: boolean;
    }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe }
  | {
      status: "capability-required";
      me: AccountApiMe;
      assurance: AssuranceState;
      capability: typeof ROLE_REPORT_CAPABILITY;
    };

export type AdminUsersAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      /** `null` when the directory read failed; the page shows an inline retry state. */
      users: AccountApiAdminUsers | null;
      /** `null` when the metrics read failed; the KPI strip and charts are simply absent. */
      metrics: AccountApiAdminMetrics | null;
      filters: AccountApiAdminUserFilters;
      limit: number;
      offset: number;
    }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe };

export type AdminUserDetailAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      detail: AccountApiAdminUserDetail;
      /** `null` when the usage read failed; the subscription card says so and stays. */
      usage: AccountApiAdminUserUsage | null;
    }
  | { status: "not-found"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe };

export type AdminAuditEventsAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      auditEvents: AccountApiAdminAuditEvents;
      filters: AccountApiAdminAuditFilters;
      limit: number;
      offset: number;
    }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe }
  | {
      status: "capability-required";
      me: AccountApiMe;
      assurance: AssuranceState;
      capability: typeof AUDIT_EVENTS_CAPABILITY;
    };

export type AdminReportsAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      reports: AccountApiAdminReports;
    }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe }
  | {
      status: "capability-required";
      me: AccountApiMe;
      assurance: AssuranceState;
      capability: typeof AUDIT_EVENTS_CAPABILITY;
    };

export type AdminNotificationsAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      notifications: AccountApiAdminNotifications;
      evaluatedAt: number;
    }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe }
  | {
      status: "capability-required";
      me: AccountApiMe;
      assurance: AssuranceState;
      capability: typeof NOTIFICATIONS_CAPABILITY;
    };

export type AdminEmailAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      queue: AccountApiAdminNotificationEmailQueue;
    }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe }
  | {
      status: "capability-required";
      me: AccountApiMe;
      assurance: AssuranceState;
      capability: typeof NOTIFICATIONS_CAPABILITY;
    };

export type AdminConfigurationAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      configuration: AccountApiAdminConfiguration;
    }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe }
  | {
      status: "capability-required";
      me: AccountApiMe;
      assurance: AssuranceState;
      capability: typeof CONFIGURATION_CAPABILITY;
    };

export type AdminCredentialStatusAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      credentialStatus: AccountApiAdminCredentialStatus;
    }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe }
  | {
      status: "capability-required";
      me: AccountApiMe;
      assurance: AssuranceState;
      capability: typeof CREDENTIAL_STATUS_CAPABILITY;
    };

/**
 * The managed credential inventory.
 *
 * `unavailable` is an arm of its own rather than a thrown error because the two bad
 * outcomes read identically once they reach a table: a page that renders twenty-one
 * "not configured" rows during a storage problem says "someone deleted every key", which
 * is the single worst thing this page could say at 2am. The arm exists so the page can
 * say "this could not be read" instead — and so that it renders no table at all.
 */
export type AdminSecretsAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      secrets: AccountApiAdminSecrets;
      /** Whether this person may change a credential, as opposed to only look at one. */
      canWrite: boolean;
    }
  | { status: "unavailable"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe }
  | {
      status: "capability-required";
      me: AccountApiMe;
      assurance: AssuranceState;
      capability: typeof SECRETS_READ_CAPABILITY;
    };

export type AdminReleaseStatusAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      releaseStatus: AccountApiAdminReleaseStatus;
    }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe }
  | {
      status: "capability-required";
      me: AccountApiMe;
      assurance: AssuranceState;
      capability: typeof RELEASE_STATUS_CAPABILITY;
    };

/** Which parts of the subscriptions page could not be loaded; the page renders around them. */
export type AdminSubscriptionsDegradation = "distribution" | "accounts" | "usage" | "changes";

/** One sampled account and the counters behind it, for the allowance scan. */
export type AdminSubscriptionAccount = {
  user: AccountApiAdminUsers["users"][number]["user"];
  /**
   * The account's own resolved entitlements: what it has spent and the limit it is
   * measured against, both as the server resolved them. Reading usage alone left the page
   * comparing against the plan template, so a comped account with a raised override read
   * as "over allowance" when it was well inside its own.
   */
  entitlements: AccountApiAdminUserEntitlements | null;
};

export type AdminSubscriptionsAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      /** `null` when the distribution read failed; the rest of the page still renders. */
      subscriptions: AccountApiAdminSubscriptions | null;
      accounts: AdminSubscriptionAccount[];
      /** How many accounts the allowance scan could cover, and its ceiling. */
      scanLimit: number;
      changes: AccountApiAdminAuditEvents["events"];
      canReadChanges: boolean;
      degraded: AdminSubscriptionsDegradation[];
    }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe };

/**
 * Whether this session may enter the console's administrative area.
 *
 * The capability behind it is `account:read-any` — entering the admin area and reading
 * another account are the same permission, not two. Pages that read other accounts need
 * no second check, and pages that *write* add their own capability on top.
 */
export function hasAdminPortalAccess(me: AccountApiMe): boolean {
  return me.capabilities.includes(ADMIN_ENTRY_CAPABILITY);
}

export function canReadRoleReport(me: AccountApiMe): boolean {
  return me.capabilities.includes(ROLE_REPORT_CAPABILITY);
}

export function canReadAuditEvents(me: AccountApiMe): boolean {
  return me.capabilities.includes(AUDIT_EVENTS_CAPABILITY);
}

export function canManageNotifications(me: AccountApiMe): boolean {
  return me.capabilities.includes(NOTIFICATIONS_CAPABILITY);
}

export function canReadConfiguration(me: AccountApiMe): boolean {
  return me.capabilities.includes(CONFIGURATION_CAPABILITY);
}

export function canReadCredentialStatus(me: AccountApiMe): boolean {
  return me.capabilities.includes(CREDENTIAL_STATUS_CAPABILITY);
}

export function canManageSubscriptions(me: AccountApiMe): boolean {
  return me.capabilities.includes(SUBSCRIPTION_WRITE_CAPABILITY);
}

export function canReadManagedSecrets(me: AccountApiMe): boolean {
  return me.capabilities.includes(SECRETS_READ_CAPABILITY);
}

export function canWriteManagedSecrets(me: AccountApiMe): boolean {
  return me.capabilities.includes(SECRETS_WRITE_CAPABILITY);
}

export function canReadReleaseStatus(me: AccountApiMe): boolean {
  return me.capabilities.includes(RELEASE_STATUS_CAPABILITY);
}

export function hasPrivilegedRole(me: AccountApiMe): boolean {
  return ["owner", "admin", "support"].includes(me.role.effective);
}

export function hasSatisfiedPrivilegedAssurance(assurance: AssuranceState): boolean {
  if (!assurance.levelReadable || !assurance.factorsReadable) return false;
  if (assurance.requiredLevel === "aal1") {
    return assurance.currentLevel === "aal1" || assurance.currentLevel === "aal2";
  }
  return assurance.requiredLevel === "aal2" && assurance.currentLevel === "aal2";
}

function isAccountApiNotFound(error: unknown): boolean {
  return (
    (error instanceof AccountApiRequestError && error.status === 404) ||
    (typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error as { status?: unknown }).status === 404)
  );
}

function loginDestination(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

async function currentAccessToken(nextPath = "/admin"): Promise<string> {
  let token: string | null;
  try {
    const azure = await createServerAzureClient({ cookieWriteMode: "best-effort" });
    token = azure.getAccessToken()?.trim() || null;
  } catch {
    throw new AccountApiUnavailableError();
  }
  if (!token) redirect(loginDestination(nextPath));
  return token;
}

async function currentAccountApiIdentity(nextPath: string): Promise<{
  accessToken: string;
  me: AccountApiMe;
}> {
  const accessToken = await currentAccessToken(nextPath);
  try {
    const me = await fetchAccountApiMe(accessToken);
    await heartbeatAccountApiSession(accessToken);
    return { accessToken, me };
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 401) {
      redirect(loginDestination(nextPath));
    }
    throw error;
  }
}

/**
 * The signed-in caller for the desktop handoff page. A signed-out visitor is sent to
 * sign in and comes back to the same handoff afterwards.
 */
export async function getDesktopConnectIdentity(nextPath: string): Promise<{
  accessToken: string;
  me: AccountApiMe;
}> {
  return currentAccountApiIdentity(nextPath);
}

/**
 * The signed-in caller's Account API identity, for the console shell.
 *
 * Fails closed to `null` on every problem — no token, a 401, an outage — because the
 * shell must still render the account pages; it only decides whether the Admin
 * section is offered. The pages themselves keep their own hard gates.
 */
export const getAdminEntry = cache(async (): Promise<AdminEntry | null> => {
  try {
    const azure = await createServerAzureClient({ cookieWriteMode: "best-effort" });
    const token = azure.getAccessToken()?.trim();
    if (!token) return null;
    const me = await fetchAccountApiMe(token);
    return { me, canEnterAdmin: hasAdminPortalAccess(me) };
  } catch {
    return null;
  }
});

export const getAdminDashboardAccess = cache(async (): Promise<AdminDashboardAccess> => {
  const { accessToken, me } = await currentAccountApiIdentity("/admin");

  if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

  const assurance = await getCurrentAssurance();
  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
    return { status: "mfa-required", me, assurance };
  }

  // Each panel degrades on its own: an aggregate read that times out must not take the
  // operator's identity, capabilities, and navigation down with it.
  const [metricsResult, roleReportResult] = await Promise.allSettled([
    fetchAccountApiAdminMetrics(accessToken),
    canReadRoleReport(me)
      ? fetchAccountApiRoleReport(accessToken, { includeMatches: false })
      : Promise.resolve(null),
  ]);
  const degraded: AdminDashboardDegradation[] = [];
  if (metricsResult.status === "rejected") degraded.push("metrics");
  if (roleReportResult.status === "rejected") degraded.push("role-report");

  return {
    status: "authorized",
    me,
    assurance,
    metrics: metricsResult.status === "fulfilled" ? metricsResult.value : null,
    roleReport: roleReportResult.status === "fulfilled" ? roleReportResult.value : null,
    degraded,
  };
});

export const getAdminRoleReportAccess = cache(
  async (includeMatches: boolean): Promise<AdminRoleReportAccess> => {
    const { accessToken, me } = await currentAccountApiIdentity("/admin/roles");

    if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return { status: "mfa-required", me, assurance };
    }

    if (!canReadRoleReport(me)) {
      return {
        status: "capability-required",
        me,
        assurance,
        capability: ROLE_REPORT_CAPABILITY,
      };
    }

    return {
      status: "authorized",
      me,
      assurance,
      includeMatches,
      roleReport: await fetchAccountApiRoleReport(accessToken, { includeMatches }),
    };
  },
);

export const getAdminUsersAccess = cache(
  async (
    limit: number,
    offset: number,
    filters: AccountApiAdminUserFilters = {},
  ): Promise<AdminUsersAccess> => {
    const { accessToken, me } = await currentAccountApiIdentity("/admin/users");

    if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return { status: "mfa-required", me, assurance };
    }

    // The directory and the KPI strip fail independently; a metrics outage must never
    // hide the accounts and vice versa.
    const [usersResult, metricsResult] = await Promise.allSettled([
      fetchAccountApiAdminUsers(accessToken, { limit, offset, ...filters }),
      fetchAccountApiAdminMetrics(accessToken),
    ]);
    for (const result of [usersResult, metricsResult]) {
      if (
        result.status === "rejected" &&
        result.reason instanceof AccountApiRequestError &&
        result.reason.status === 401
      ) {
        throw result.reason;
      }
    }
    const users = usersResult.status === "fulfilled" ? usersResult.value : null;
    const metrics = metricsResult.status === "fulfilled" ? metricsResult.value : null;

    return { status: "authorized", me, assurance, users, metrics, filters, limit, offset };
  },
);

export type AdminUsersExportAccess =
  | { status: "authorized"; me: AccountApiMe; accessToken: string }
  | { status: "mfa-required"; me: AccountApiMe }
  | { status: "forbidden"; me: AccountApiMe }
  | { status: "unauthenticated" };

export type AdminRecipientSearchAccess = AdminUsersExportAccess;

/**
 * The recipient picker behind the notification and email composers. It reads the
 * directory, so it needs the same administration and second-factor gates as the
 * directory page, plus the notifications capability the composers themselves require —
 * an administrator who cannot queue email has no reason to search for recipients.
 */
export async function getAdminRecipientSearchAccess(): Promise<AdminRecipientSearchAccess> {
  let identity: Awaited<ReturnType<typeof currentAccountApiIdentity>>;
  try {
    identity = await currentAccountApiIdentity("/admin/email");
  } catch {
    return { status: "unauthenticated" };
  }
  const { accessToken, me } = identity;
  if (!hasAdminPortalAccess(me) || !canManageNotifications(me)) {
    return { status: "forbidden", me };
  }
  const assurance = await getCurrentAssurance();
  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
    return { status: "mfa-required", me };
  }
  return { status: "authorized", me, accessToken };
}

/**
 * The CSV download applies the directory's gates but must not redirect the way pages do
 * — a route handler answers with a status the browser can act on instead.
 */
export async function getAdminUsersExportAccess(): Promise<AdminUsersExportAccess> {
  let identity: Awaited<ReturnType<typeof currentAccountApiIdentity>>;
  try {
    identity = await currentAccountApiIdentity("/admin/users");
  } catch {
    return { status: "unauthenticated" };
  }
  const { accessToken, me } = identity;
  if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };
  const assurance = await getCurrentAssurance();
  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
    return { status: "mfa-required", me };
  }
  return { status: "authorized", me, accessToken };
}

export const getAdminUserDetailAccess = cache(
  async (userId: string): Promise<AdminUserDetailAccess> => {
    const { accessToken, me } = await currentAccountApiIdentity("/admin/users");

    if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return { status: "mfa-required", me, assurance };
    }

    try {
      const detail = await fetchAccountApiAdminUser(accessToken, userId);
      // The account itself must render even when the counters are unreadable: a usage
      // outage is not a reason to hide someone's sessions, role and activity.
      const usage = await fetchAccountApiAdminUserUsage(accessToken, userId).catch(() => null);
      return { status: "authorized", me, assurance, detail, usage };
    } catch (error) {
      if (isAccountApiNotFound(error)) {
        return { status: "not-found", me, assurance };
      }
      throw error;
    }
  },
);

/**
 * Accounts the allowance scan covers. There is no API that answers "who is near their
 * limit" in one call — usage is read one account at a time — so the page samples the
 * most recently updated accounts and says so rather than implying it scanned all of
 * them. Raising this raises the request count on every page view one for one.
 */
const SUBSCRIPTION_SCAN_LIMIT = 24;

export const getAdminSubscriptionsAccess = cache(async (): Promise<AdminSubscriptionsAccess> => {
  const { accessToken, me } = await currentAccountApiIdentity("/admin/subscriptions");

  // Admin entry IS `account:read-any` (see ADMIN_ENTRY_CAPABILITY), which is exactly what
  // every read on this page needs. Stated here because the helper's name says "portal
  // access" and reads as a weaker check than it is.
  if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

  const assurance = await getCurrentAssurance();
  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
    return { status: "mfa-required", me, assurance };
  }

  const canReadChanges = canReadAuditEvents(me);
  // The three panels fail independently: a plan distribution that times out must not
  // take the allowance scan or the change log down with it. Both groups are started
  // before either is awaited, so the reads still overlap.
  const corePromise = Promise.allSettled([
    fetchAccountApiAdminSubscriptions(accessToken),
    fetchAccountApiAdminUsers(accessToken, { limit: SUBSCRIPTION_SCAN_LIMIT, offset: 0 }),
  ] as const);
  // The audit search filters on one event type at a time, so a plan change and an
  // override change are two reads merged into one log.
  const changesPromise = Promise.allSettled(
    canReadChanges
      ? [SUBSCRIPTION_CHANGED_EVENT, ENTITLEMENT_CHANGED_EVENT].map((eventType) =>
          fetchAccountApiAdminAuditEvents(accessToken, {
            filters: { event_type: eventType },
            limit: 25,
            offset: 0,
          }),
        )
      : [],
  );
  const [distributionResult, usersResult] = await corePromise;
  const changeResults = await changesPromise;

  const degraded: AdminSubscriptionsDegradation[] = [];
  if (distributionResult.status === "rejected") degraded.push("distribution");
  if (usersResult.status === "rejected") degraded.push("accounts");
  if (changeResults.some((result) => result.status === "rejected")) degraded.push("changes");

  const directory = usersResult.status === "fulfilled" ? usersResult.value : null;
  // One read per account, run together. There is no route that answers "who is near their
  // limit", so the page samples and says so; what it must not do is compare a spend
  // against a limit the account does not actually have.
  const entitlementResults = await Promise.allSettled(
    (directory?.users ?? []).map((entry) =>
      fetchAccountApiAdminUserEntitlements(accessToken, entry.user.user_id),
    ),
  );
  if (entitlementResults.some((result) => result.status === "rejected")) degraded.push("usage");

  const accounts: AdminSubscriptionAccount[] = (directory?.users ?? []).map((entry, index) => {
    const result = entitlementResults[index];
    return {
      user: entry.user,
      entitlements: result?.status === "fulfilled" ? result.value : null,
    };
  });

  const instant = (value: string): number => {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  const changes = changeResults
    .flatMap((result) => (result.status === "fulfilled" ? result.value.events : []))
    .sort((left, right) => instant(right.occurred_at) - instant(left.occurred_at))
    .slice(0, 25);

  return {
    status: "authorized",
    me,
    assurance,
    subscriptions: distributionResult.status === "fulfilled" ? distributionResult.value : null,
    accounts,
    scanLimit: SUBSCRIPTION_SCAN_LIMIT,
    changes,
    canReadChanges,
    degraded,
  };
});

export const getAdminAuditEventsAccess = cache(
  async (
    limit: number,
    offset: number,
    filters: AccountApiAdminAuditFilters,
  ): Promise<AdminAuditEventsAccess> => {
    const { accessToken, me } = await currentAccountApiIdentity("/admin/audit");

    if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return { status: "mfa-required", me, assurance };
    }

    if (!canReadAuditEvents(me)) {
      return {
        status: "capability-required",
        me,
        assurance,
        capability: AUDIT_EVENTS_CAPABILITY,
      };
    }

    return {
      status: "authorized",
      me,
      assurance,
      auditEvents: await fetchAccountApiAdminAuditEvents(accessToken, {
        filters,
        limit,
        offset,
      }),
      filters,
      limit,
      offset,
    };
  },
);

export const getAdminReportsAccess = cache(async (): Promise<AdminReportsAccess> => {
  const { accessToken, me } = await currentAccountApiIdentity("/admin/reports");

  if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

  const assurance = await getCurrentAssurance();
  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
    return { status: "mfa-required", me, assurance };
  }

  if (!canReadAuditEvents(me)) {
    return {
      status: "capability-required",
      me,
      assurance,
      capability: AUDIT_EVENTS_CAPABILITY,
    };
  }

  return {
    status: "authorized",
    me,
    assurance,
    reports: await fetchAccountApiAdminReports(accessToken),
  };
});

export const getAdminNotificationsAccess = cache(async (): Promise<AdminNotificationsAccess> => {
  const { accessToken, me } = await currentAccountApiIdentity("/admin/notifications");

  if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

  const assurance = await getCurrentAssurance();
  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
    return { status: "mfa-required", me, assurance };
  }

  if (!canManageNotifications(me)) {
    return {
      status: "capability-required",
      me,
      assurance,
      capability: NOTIFICATIONS_CAPABILITY,
    };
  }

  return {
    status: "authorized",
    me,
    assurance,
    notifications: await fetchAccountApiAdminNotifications(accessToken),
    evaluatedAt: Date.now(),
  };
});

export const getAdminEmailAccess = cache(async (): Promise<AdminEmailAccess> => {
  const { accessToken, me } = await currentAccountApiIdentity("/admin/email");

  if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

  const assurance = await getCurrentAssurance();
  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
    return { status: "mfa-required", me, assurance };
  }

  if (!canManageNotifications(me)) {
    return {
      status: "capability-required",
      me,
      assurance,
      capability: NOTIFICATIONS_CAPABILITY,
    };
  }

  return {
    status: "authorized",
    me,
    assurance,
    queue: await fetchAccountApiAdminNotificationEmailQueue(accessToken),
  };
});

export const getAdminConfigurationAccess = cache(async (): Promise<AdminConfigurationAccess> => {
  const { accessToken, me } = await currentAccountApiIdentity("/admin/configuration");

  if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

  const assurance = await getCurrentAssurance();
  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
    return { status: "mfa-required", me, assurance };
  }

  if (!canReadConfiguration(me)) {
    return {
      status: "capability-required",
      me,
      assurance,
      capability: CONFIGURATION_CAPABILITY,
    };
  }

  return {
    status: "authorized",
    me,
    assurance,
    configuration: await fetchAccountApiAdminConfiguration(accessToken),
  };
});

export const getAdminCredentialStatusAccess = cache(
  async (): Promise<AdminCredentialStatusAccess> => {
    const { accessToken, me } = await currentAccountApiIdentity("/admin/credentials");

    if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return { status: "mfa-required", me, assurance };
    }

    if (!canReadCredentialStatus(me)) {
      return {
        status: "capability-required",
        me,
        assurance,
        capability: CREDENTIAL_STATUS_CAPABILITY,
      };
    }

    return {
      status: "authorized",
      me,
      assurance,
      credentialStatus: await fetchAccountApiAdminCredentialStatus(accessToken),
    };
  },
);

export const getAdminSecretsAccess = cache(async (): Promise<AdminSecretsAccess> => {
  const { accessToken, me } = await currentAccountApiIdentity("/admin/secrets");

  if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

  const assurance = await getCurrentAssurance();
  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
    return { status: "mfa-required", me, assurance };
  }

  if (!canReadManagedSecrets(me)) {
    return { status: "capability-required", me, assurance, capability: SECRETS_READ_CAPABILITY };
  }

  try {
    return {
      status: "authorized",
      me,
      assurance,
      secrets: await fetchAccountApiAdminSecrets(accessToken),
      // Read and write are separate permissions, so the page has to render the inventory
      // for someone who may never change it. Every control is built from this, not from
      // the role, so a read-only administrator is never shown a button that would 403.
      canWrite: canWriteManagedSecrets(me),
    };
  } catch (error) {
    // A session that ended is the caller's problem to solve, not a service outage.
    if (error instanceof AccountApiRequestError && error.status === 401) throw error;
    return { status: "unavailable", me, assurance };
  }
});

export const getAdminReleaseStatusAccess = cache(async (): Promise<AdminReleaseStatusAccess> => {
  const { accessToken, me } = await currentAccountApiIdentity("/admin/releases");

  if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

  const assurance = await getCurrentAssurance();
  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
    return { status: "mfa-required", me, assurance };
  }

  if (!canReadReleaseStatus(me)) {
    return {
      status: "capability-required",
      me,
      assurance,
      capability: RELEASE_STATUS_CAPABILITY,
    };
  }

  return {
    status: "authorized",
    me,
    assurance,
    releaseStatus: await fetchAccountApiAdminReleaseStatus(accessToken),
  };
});
