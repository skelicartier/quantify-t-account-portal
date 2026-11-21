"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { AccountApiAdminUserFilters } from "@/lib/admin/account-api";
import { ADMIN_PAGINATION_BOUNDS } from "@/lib/search-params";

/** How long typing must pause before the directory is searched. */
export const SEARCH_TYPING_DELAY_MS = 350;

export function usersHref(filters: AccountApiAdminUserFilters, limit?: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.access) params.set("access", filters.access);
  if (limit && limit !== ADMIN_PAGINATION_BOUNDS.defaultLimit) params.set("limit", String(limit));
  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

type UsersDirectoryProps = {
  filters: AccountApiAdminUserFilters;
  limit: number;
  /** The server-rendered directory table; dimmed while a new search is in flight. */
  children: ReactNode;
};

function accessFilter(value: string): AccountApiAdminUserFilters["access"] {
  return value === "pending" || value === "approved" || value === "declined" ? value : undefined;
}

/**
 * The search box and the two filters. Typing searches after a short pause and the page
 * stays put: the router swaps in the new results underneath a progress bar instead of
 * reloading, so focus and the typed text survive.
 */
export function UsersDirectory({ filters, limit, children }: UsersDirectoryProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q ?? "");
  const [status, setStatus] = useState<string>(filters.status ?? "");
  const [access, setAccess] = useState<string>(filters.access ?? "");
  // A link elsewhere on the page ("Review applications") changes the applied filter
  // without touching this control, so the control follows the filter when it moves.
  const appliedAccess = filters.access ?? "";
  const [seenAccess, setSeenAccess] = useState(appliedAccess);
  if (seenAccess !== appliedAccess) {
    setSeenAccess(appliedAccess);
    setAccess(appliedAccess);
  }
  const appliedQuery = filters.q ?? "";

  const search = useCallback(
    (nextQuery: string, nextStatus: string, nextAccess: string, mode: "push" | "replace") => {
      const application = accessFilter(nextAccess);
      const href = usersHref(
        {
          ...(nextQuery ? { q: nextQuery } : {}),
          ...(nextStatus === "active" || nextStatus === "inactive" ? { status: nextStatus } : {}),
          ...(application ? { access: application } : {}),
        },
        limit,
      );
      startTransition(() => {
        if (mode === "push") router.push(href);
        else router.replace(href);
      });
    },
    [limit, router],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === appliedQuery) return undefined;
    const id = window.setTimeout(
      () => search(trimmed, status, access, "replace"),
      SEARCH_TYPING_DELAY_MS,
    );
    return () => window.clearTimeout(id);
  }, [access, appliedQuery, query, search, status]);

  const filtered = Boolean(
    query.trim() || status || access || filters.q || filters.status || filters.access,
  );

  return (
    <div className="directory">
      <form
        className="filter-bar"
        role="search"
        aria-busy={isPending}
        onSubmit={(event) => {
          event.preventDefault();
          search(query.trim(), status, access, "push");
        }}
      >
        <Field id="admin-users-q" label="Search">
          <Input
            id="admin-users-q"
            name="q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Email, name or account ID"
            maxLength={120}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field id="admin-users-status" label="Status">
          <Select
            id="admin-users-status"
            name="status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              search(query.trim(), event.target.value, access, "push");
            }}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field id="admin-users-access" label="Application">
          <Select
            id="admin-users-access"
            name="access"
            value={access}
            onChange={(event) => {
              setAccess(event.target.value);
              search(query.trim(), status, event.target.value, "push");
            }}
          >
            <option value="">All</option>
            <option value="pending">Awaiting review</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
          </Select>
        </Field>
        <div className="inline-actions">
          <Button type="submit" variant="primary">
            <Search size={14} aria-hidden="true" />
            Apply
          </Button>
          {filtered && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setStatus("");
                setAccess("");
                search("", "", "", "push");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </form>
      <div className="search-progress" hidden={!isPending} role="status" aria-live="polite">
        <span className="sr-only">Searching accounts…</span>
      </div>
      <div className={isPending ? "is-pending" : undefined} aria-busy={isPending}>
        {children}
      </div>
    </div>
  );
}
