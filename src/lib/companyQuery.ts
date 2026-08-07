// Shared helper: tries a query with company filter; falls back without it if column missing
export async function queryWithCompany(
  baseQuery: any,
  company: string,
  setMigrationNeeded?: (v: boolean) => void
): Promise<any[]> {
  const { data, error } = await baseQuery.eq("company", company);
  if (error && error.message?.includes("column") && error.message?.includes("company")) {
    // Migration not run yet — fall back to unfiltered
    if (setMigrationNeeded) setMigrationNeeded(true);
    const { data: fallback } = await baseQuery;
    return fallback ?? [];
  }
  return data ?? [];
}
