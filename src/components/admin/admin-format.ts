export function formatAdminLabel(value: string): string {
  return value
    .split(/[-_.:\s]+/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatAdminNumber(value: number | null | undefined): string {
  return typeof value === "number" ? new Intl.NumberFormat("en").format(value) : "Not available";
}
