import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Cylinder, Users, Receipt, AlertCircle, TrendingUp, Package, AlertTriangle } from "lucide-react";

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
  const [s, setS] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [overdueList, setOverdueList] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const cutoff = new Date(Date.now() - OVERDUE_DAYS * 86400000).toISOString();
      const [cyl, cust, inv, txn, overdue] = await Promise.all([
        supabase.from("cylinders").select("status"),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("invoices").select("total, amount, status, paid_at"),
        supabase
          .from("transactions")
          .select("*, cylinders(serial_number), customers(name), cylinder_types(name,code)")
          .order("occurred_at", { ascending: false })
          .limit(8),
        supabase
          .from("cylinders")
          .select("id, serial_number, issued_at, customers:current_customer_id(name, phone, customer_number)")
          .eq("status", "issued")
          .lt("issued_at", cutoff)
          .order("issued_at"),
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
        pendingInvoices: invs.filter((i) => i.status === "pending").length,
        pendingAmount: invs.filter((i) => i.status === "pending").reduce((a, b) => a + Number(b.total ?? b.amount), 0),
        monthRevenue: invs
          .filter((i) => i.status === "paid" && i.paid_at && new Date(i.paid_at) >= monthStart)
          .reduce((a, b) => a + Number(b.total ?? b.amount), 0),
        overdueCount: (overdue.data ?? []).length,
      });
      setRecent(txn.data ?? []);
      setOverdueList(overdue.data ?? []);
    })();
  }, []);

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
