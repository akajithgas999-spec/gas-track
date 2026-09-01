import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Cylinder, Users, Receipt, AlertCircle, TrendingUp, Package, AlertTriangle, Search, Clock, ArrowUpFromLine } from "lucide-react";

const OVERDUE_DAYS = 30;

interface Stats {
  total: number;
  inStock: number;
  issued: number;
  customers: number;
  pendingInvoices: number;
  pendingAmount: number;
  monthRevenue: number;
  overdueCount: number;
}

export default function Dashboard() {
  const { company } = useCompany();
  const [s, setS] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [overdueList, setOverdueList] = useState<any[]>([]);
  const [unreturned, setUnreturned] = useState<any[]>([]);
  const [unreturnedSearch, setUnreturnedSearch] = useState("");

  useEffect(() => {
    (async () => {
      const cutoff = new Date(Date.now() - OVERDUE_DAYS * 86400000).toISOString();
      const [cyl, cust, inv, txn, overdue, unret] = await Promise.all([
        supabase.from("cylinders").select("status"),
        (supabase.from("customers") as any).select("id", { count: "exact", head: true }).eq("company", company),
        (supabase.from("invoices") as any).select("total, amount, status, paid_at").eq("company", company),
        (supabase.from("transactions") as any)
          .select("*, cylinders(serial_number), customers(name), cylinder_types(name,code)")
          .eq("company", company)
          .order("occurred_at", { ascending: false })
          .limit(8),
        supabase
          .from("cylinders")
          .select("id, serial_number, issued_at, customers:current_customer_id(name, phone, customer_number)")
          .eq("status", "issued")
          .lt("issued_at", cutoff)
          .order("issued_at"),
        (supabase.from("cylinders") as any)
          .select("id, cylinder_number, serial_number, issued_at, fill_status, cylinder_types(code, name), customers:current_customer_id(id, name, phone, customer_number)")
          .eq("status", "issued")
          .order("issued_at", { ascending: false, nullsFirst: false }),
      ]);
      const cyls = cyl.data ?? [];
      const invs = inv.data ?? [];
      const monthStart = new Date();
      monthStart.setDate(1);
      setS({
        total: cyls.length,
        inStock: cyls.filter((c) => c.status === "in_stock").length,
        issued: cyls.filter((c) => c.status === "issued").length,
        customers: cust.count ?? 0,
        pendingInvoices: invs.filter((i: any) => i.status === "pending").length,
        pendingAmount: invs.filter((i: any) => i.status === "pending").reduce((a: number, b: any) => a + Number(b.total ?? b.amount), 0),
        monthRevenue: invs
          .filter((i: any) => i.status === "paid" && i.paid_at && new Date(i.paid_at) >= monthStart)
          .reduce((a: number, b: any) => a + Number(b.total ?? b.amount), 0),
        overdueCount: (overdue.data ?? []).length,
      });
      setRecent(txn.data ?? []);
      setOverdueList(overdue.data ?? []);
      setUnreturned(unret.data ?? []);
    })();
  }, [company]);

  const cards = [
    { label: "Total Cylinders", value: s?.total ?? 0, icon: Cylinder, accent: "text-primary" },
    { label: "In Stock", value: s?.inStock ?? 0, icon: Package, accent: "text-success" },
    { label: "Issued", value: s?.issued ?? 0, icon: TrendingUp, accent: "text-warning" },
    { label: "Customers", value: s?.customers ?? 0, icon: Users, accent: "text-primary-glow" },
    { label: "Pending Invoices", value: s?.pendingInvoices ?? 0, icon: AlertCircle, accent: "text-destructive" },
    { label: `Overdue ${OVERDUE_DAYS}d+`, value: s?.overdueCount ?? 0, icon: AlertTriangle, accent: "text-destructive" },
    { label: "MTD Revenue", value: `₹${(s?.monthRevenue ?? 0).toLocaleString()}`, icon: Receipt, accent: "text-primary" },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <p className="text-sm text-muted-foreground uppercase tracking-widest mb-2">Operations overview</p>
        <h2 className="text-2xl sm:text-3xl font-bold">Welcome back, operator</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-6 bg-card border-border/60 hover:border-primary/40 transition-colors group">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{c.label}</div>
                <div className="text-2xl sm:text-3xl font-bold mt-2 font-mono">{c.value}</div>
              </div>
              <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <c.icon className={`h-5 w-5 ${c.accent}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {overdueList.length > 0 && (
        <Card className="p-6 bg-destructive/5 border-destructive/40">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Overdue cylinders ({OVERDUE_DAYS}+ days)
          </h3>
          <div className="space-y-1">
            {overdueList.map((c: any) => {
              const days = Math.floor((Date.now() - new Date(c.issued_at).getTime()) / 86400000);
              return (
                <div key={c.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4 py-2 border-b border-destructive/20 last:border-0 text-sm">
                  <div className="font-mono font-semibold text-primary">{c.serial_number}</div>
                  <div className="flex-1">{c.customers?.name ?? "—"} <span className="text-[10px] font-mono text-muted-foreground">{c.customers?.customer_number}</span></div>
                  {c.customers?.phone && <div className="font-mono text-xs text-muted-foreground">{c.customers.phone}</div>}
                  <div className="font-mono text-xs text-destructive font-bold">{days} days</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── NEW SECTION: Unreturned Sales Cylinders (Outstanding with Customers) ── */}
      <Card className="p-6 bg-card border-border/60 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/40 pb-4">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2 text-warning">
              <TrendingUp className="h-5 w-5" />
              Unreturned Sales Cylinders (Out with Customers)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              All cylinders issued during sales that have not been returned to the warehouse yet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-warning/15 text-warning border border-warning/30">
              {unreturned.length} Cylinder(s) Outstanding
            </span>
          </div>
        </div>

        {/* Search filter for unreturned cylinders */}
        {unreturned.length > 0 && (
          <div className="relative max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-xs"
              placeholder="Filter by cylinder #, customer, phone, gas..."
              value={unreturnedSearch}
              onChange={(e) => setUnreturnedSearch(e.target.value)}
            />
          </div>
        )}

        {unreturned.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            🎉 All sold cylinders have been returned! No cylinders currently outstanding.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5">Cylinder #</th>
                  <th className="text-left px-3 py-2.5">Serial</th>
                  <th className="text-left px-3 py-2.5">Gas Type</th>
                  <th className="text-left px-3 py-2.5">Issued Customer</th>
                  <th className="text-left px-3 py-2.5">Phone</th>
                  <th className="text-left px-3 py-2.5">Issued Date</th>
                  <th className="text-left px-3 py-2.5">Days Out</th>
                  <th className="text-left px-3 py-2.5">Fill Status</th>
                </tr>
              </thead>
              <tbody>
                {unreturned
                  .filter((c: any) => {
                    const q = unreturnedSearch.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      (c.cylinder_number && String(c.cylinder_number).includes(q)) ||
                      (c.serial_number && c.serial_number.toLowerCase().includes(q)) ||
                      (c.customers?.name && c.customers.name.toLowerCase().includes(q)) ||
                      (c.customers?.phone && c.customers.phone.includes(q)) ||
                      (c.cylinder_types?.code && c.cylinder_types.code.toLowerCase().includes(q))
                    );
                  })
                  .map((c: any) => {
                    const issuedDate = c.issued_at ? new Date(c.issued_at) : null;
                    const daysOut = issuedDate ? Math.floor((Date.now() - issuedDate.getTime()) / 86400000) : 0;
                    return (
                      <tr key={c.id} className="border-t border-border/30 hover:bg-secondary/20 font-mono text-xs">
                        <td className="px-3 py-3 font-bold text-primary">
                          {c.cylinder_number ? `#${c.cylinder_number}` : "—"}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{c.serial_number}</td>
                        <td className="px-3 py-3 font-semibold font-sans">
                          {c.cylinder_types?.code} <span className="text-muted-foreground font-normal text-[11px]">— {c.cylinder_types?.name}</span>
                        </td>
                        <td className="px-3 py-3 font-sans">
                          <div className="font-semibold text-foreground">{c.customers?.name ?? "—"}</div>
                          <div className="text-[10px] text-muted-foreground">{c.customers?.customer_number}</div>
                        </td>
                        <td className="px-3 py-3 font-sans">
                          {c.customers?.phone ? (
                            <a
                              href={`tel:${c.customers.phone}`}
                              className="text-primary hover:underline font-mono"
                            >
                              📞 {c.customers.phone}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {issuedDate ? issuedDate.toLocaleDateString("en-IN") : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            daysOut >= 30
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                              : daysOut >= 14
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                              : "bg-secondary text-foreground"
                          }`}>
                            {daysOut} day{daysOut === 1 ? "" : "s"} out
                          </span>
                        </td>
                        <td className="px-3 py-3 font-sans">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            c.fill_status === "empty" ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"
                          }`}>
                            {c.fill_status === "empty" ? "⚪ Empty" : "🔥 Filled"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-6 bg-card border-border/60">
        <h3 className="text-lg font-semibold mb-4">Recent activity</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <div key={t.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4 py-3 border-b border-border/40 last:border-0">
                <div
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                    t.txn_type === "issue"
                      ? "bg-warning/15 text-warning"
                      : t.txn_type === "return"
                      ? "bg-success/15 text-success"
                      : "bg-primary/15 text-primary"
                  }`}
                >
                  {t.txn_type}
                </div>
                <div className="font-mono text-sm">{t.cylinders?.serial_number}</div>
                <div className="text-sm text-muted-foreground">{t.cylinder_types?.code}</div>
                <div className="text-sm flex-1">{t.customers?.name ?? "—"}</div>
                <div className="text-sm font-mono">₹{Number(t.amount).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground font-mono">
                  {new Date(t.occurred_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
