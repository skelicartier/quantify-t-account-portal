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
  fetchAccountApiAdminReports,
  fetchAccountApiAdminNotificationEmailQueue,
  fetchAccountApiAdminNotifications,
  fetchAccountApiAdminAuditEvents,
  fetchAccountApiAdminConfiguration,
  fetchAccountApiAdminCredentialStatus,
  fetchAccountApiAdminMetrics,
  fetchAccountApiAdminReleaseStatus,
  fetchAccountApiAdminUser,
  fetchAccountApiAdminUsers,
  fetchAccountApiMe,
  fetchAccountApiRoleReport,
  NOTIFICATIONS_CAPABILITY,
  RELEASE_STATUS_CAPABILITY,
  ROLE_REPORT_CAPABILITY,
  type AccountApiAdminConfiguration,
  type AccountApiAdminCredentialStatus,
  type AccountApiAdminNotificationEmailQueue,
  type AccountApiAdminNotifications,
  type AccountApiAdminAuditEvents,
  type AccountApiAdminAuditFilters,
  type AccountApiAdminMetrics,
  type AccountApiAdminReports,
  type AccountApiAdminReleaseStatus,
  type AccountApiAdminUserDetail,
  type AccountApiAdminUsers,
  type AccountApiMe,
  type AccountApiRoleReport,
} from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";
import { createServerAzureClient } from "@/lib/supabase/server";

export type AdminDashboardAccess =
  | {
      status: "authorized";
      me: AccountApiMe;
      assurance: AssuranceState;
      metrics: AccountApiAdminMetrics;
      roleReport: AccountApiRoleReport | null;
    }
  | { status: "mfa-required"; me: AccountApiMe; assurance: AssuranceState }
  | { status: "forbidden"; me: AccountApiMe };

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
      users: AccountApiAdminUsers;
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

export const getAdminDashboardAccess = cache(async (): Promise<AdminDashboardAccess> => {
  const { accessToken, me } = await currentAccountApiIdentity("/admin");

  if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

  const assurance = await getCurrentAssurance();
  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
    return { status: "mfa-required", me, assurance };
  }

  const [metrics, roleReport] = await Promise.all([
    fetchAccountApiAdminMetrics(accessToken),
    canReadRoleReport(me)
      ? fetchAccountApiRoleReport(accessToken, { includeMatches: false })
      : Promise.resolve(null),
  ]);

  return { status: "authorized", me, assurance, metrics, roleReport };
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
  async (limit: number, offset: number): Promise<AdminUsersAccess> => {
    const { accessToken, me } = await currentAccountApiIdentity("/admin/users");

    if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return { status: "mfa-required", me, assurance };
    }

    return {
      status: "authorized",
      me,
      assurance,
      users: await fetchAccountApiAdminUsers(accessToken, { limit, offset }),
      limit,
      offset,
    };
  },
);

export const getAdminUserDetailAccess = cache(
  async (userId: string): Promise<AdminUserDetailAccess> => {
    const { accessToken, me } = await currentAccountApiIdentity("/admin/users");

    if (!hasAdminPortalAccess(me)) return { status: "forbidden", me };

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return { status: "mfa-required", me, assurance };
    }

    try {
      return {
        status: "authorized",
        me,
        assurance,
        detail: await fetchAccountApiAdminUser(accessToken, userId),
      };
    } catch (error) {
      if (isAccountApiNotFound(error)) {
        return { status: "not-found", me, assurance };
      }
      throw error;
    }
  },
);

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
