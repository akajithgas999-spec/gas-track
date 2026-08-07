import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Reports() {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [sales, setSales] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [deadCylinders, setDeadCylinders] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const loadTypes = async () => {
    const { data } = await supabase.from("cylinder_types").select("id, name, code").order("name");
    setTypes(data ?? []);
  };

  useEffect(() => {
    loadTypes();
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: p }, { data: d }] = await Promise.all([
        supabase
          .from("invoices")
          .select("invoice_number, billing_date, total, taxable_amount, cgst_amount, sgst_amount, status, customers(name, customer_number), invoice_items(type_id, taxable, cgst_amount, sgst_amount, total)")
          .gte("billing_date", from)
          .lte("billing_date", to)
          .order("billing_date", { ascending: false }),
        supabase
          .from("purchases")
          .select("purchase_number, bill_number, bill_date, total, taxable_amount, cgst_amount, sgst_amount, suppliers(name), purchase_items(type_id, taxable, cgst_amount, sgst_amount, total)")
          .gte("bill_date", from)
          .lte("bill_date", to)
          .order("bill_date", { ascending: false }),
        supabase
          .from("cylinders")
          .select("id, serial_number, status, type_id, issued_at, cylinder_types(code,name), customers:current_customer_id(name, customer_number, phone)")
          .in("status", ["maintenance", "retired"]),
      ]);
      setSales(s ?? []);
      setPurchases(p ?? []);
      setDeadCylinders(d ?? []);
    })();
  }, [from, to]);

  const filteredSales = sales.map((s) => {
    if (typeFilter === "all") return s;
    const matchingItems = (s.invoice_items ?? []).filter((item: any) => item.type_id === typeFilter);
    if (matchingItems.length === 0) return null;
    return {
      ...s,
      taxable_amount: matchingItems.reduce((sum: number, item: any) => sum + Number(item.taxable ?? 0), 0),
      cgst_amount: matchingItems.reduce((sum: number, item: any) => sum + Number(item.cgst_amount ?? 0), 0),
      sgst_amount: matchingItems.reduce((sum: number, item: any) => sum + Number(item.sgst_amount ?? 0), 0),
      total: matchingItems.reduce((sum: number, item: any) => sum + Number(item.total ?? 0), 0),
    };
  }).filter(Boolean) as any[];

  const filteredPurchases = purchases.map((p) => {
    if (typeFilter === "all") return p;
    const matchingItems = (p.purchase_items ?? []).filter((item: any) => item.type_id === typeFilter);
    if (matchingItems.length === 0) return null;
    return {
      ...p,
      taxable_amount: matchingItems.reduce((sum: number, item: any) => sum + Number(item.taxable ?? 0), 0),
      cgst_amount: matchingItems.reduce((sum: number, item: any) => sum + Number(item.cgst_amount ?? 0), 0),
      sgst_amount: matchingItems.reduce((sum: number, item: any) => sum + Number(item.sgst_amount ?? 0), 0),
      total: matchingItems.reduce((sum: number, item: any) => sum + Number(item.total ?? 0), 0),
      purchase_items: matchingItems,
    };
  }).filter(Boolean) as any[];

  const filteredDead = deadCylinders.filter(
    (d) => typeFilter === "all" || d.type_id === typeFilter
  );

  const salesTotals = filteredSales.reduce((a, x) => ({
    taxable: a.taxable + Number(x.taxable_amount ?? 0),
    cgst: a.cgst + Number(x.cgst_amount ?? 0),
    sgst: a.sgst + Number(x.sgst_amount ?? 0),
    total: a.total + Number(x.total ?? 0),
  }), { taxable: 0, cgst: 0, sgst: 0, total: 0 });

  const purchaseTotals = filteredPurchases.reduce((a, x) => ({
    taxable: a.taxable + Number(x.taxable_amount ?? 0),
    cgst: a.cgst + Number(x.cgst_amount ?? 0),
    sgst: a.sgst + Number(x.sgst_amount ?? 0),
    total: a.total + Number(x.total ?? 0),
  }), { taxable: 0, cgst: 0, sgst: 0, total: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="w-full sm:w-[220px]">
          <Label className="text-xs">Cylinder Type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-10"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.code} — {t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="sales">Sales report</TabsTrigger>
          <TabsTrigger value="purchase">Purchase report</TabsTrigger>
          <TabsTrigger value="pl">P&amp;L summary</TabsTrigger>
          <TabsTrigger value="dead">Dead cylinders</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4 mt-4">
          <SummaryRow t={salesTotals} label="Sales" tone="success" />
          <Card className="bg-card border-border/60 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left px-4 py-3">Invoice #</th><th className="text-left px-4 py-3">Date</th><th className="text-left px-4 py-3">Customer</th><th className="text-right px-4 py-3">Taxable</th><th className="text-right px-4 py-3">CGST</th><th className="text-right px-4 py-3">SGST</th><th className="text-right px-4 py-3">Total</th><th className="text-left px-4 py-3">Status</th></tr>
              </thead>
              <tbody>
                {filteredSales.map((s) => (
                  <tr key={s.invoice_number} className="border-t border-border/40">
                    <td className="px-4 py-3 font-mono font-semibold text-primary">{s.invoice_number}</td>
                    <td className="px-4 py-3 font-mono text-xs">{new Date(s.billing_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{s.customers?.name}</td>
                    <td className="px-4 py-3 text-right font-mono">₹{Number(s.taxable_amount ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono">₹{Number(s.cgst_amount ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono">₹{Number(s.sgst_amount ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">₹{Number(s.total ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs uppercase">{s.status}</td>
                  </tr>
                ))}
                {filteredSales.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No sales in range.</td></tr>}
              </tbody>
            </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="purchase" className="space-y-4 mt-4">
          <SummaryRow t={purchaseTotals} label="Purchase" tone="warning" />
          <Card className="bg-card border-border/60 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left px-4 py-3">Purchase #</th><th className="text-left px-4 py-3">Bill #</th><th className="text-left px-4 py-3">Date</th><th className="text-left px-4 py-3">Supplier</th><th className="text-right px-4 py-3">Cyl</th><th className="text-right px-4 py-3">Taxable</th><th className="text-right px-4 py-3">CGST</th><th className="text-right px-4 py-3">SGST</th><th className="text-right px-4 py-3">Total</th></tr>
              </thead>
              <tbody>
                {filteredPurchases.map((p) => (
                  <tr key={p.purchase_number} className="border-t border-border/40">
                    <td className="px-4 py-3 font-mono font-semibold text-primary">{p.purchase_number}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.bill_number ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{new Date(p.bill_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{p.suppliers?.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{(p.purchase_items ?? []).length}</td>
                    <td className="px-4 py-3 text-right font-mono">₹{Number(p.taxable_amount ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono">₹{Number(p.cgst_amount ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono">₹{Number(p.sgst_amount ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">₹{Number(p.total ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
                {filteredPurchases.length === 0 && <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No purchases in range.</td></tr>}
              </tbody>
            </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="pl" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 bg-card border-border/60"><div className="text-xs uppercase tracking-widest text-muted-foreground">Sales total</div><div className="text-2xl font-bold mt-2 font-mono text-success">₹{salesTotals.total.toLocaleString()}</div></Card>
            <Card className="p-5 bg-card border-border/60"><div className="text-xs uppercase tracking-widest text-muted-foreground">Purchase total</div><div className="text-2xl font-bold mt-2 font-mono text-warning">₹{purchaseTotals.total.toLocaleString()}</div></Card>
            <Card className="p-5 bg-card border-border/60"><div className="text-xs uppercase tracking-widest text-muted-foreground">Net</div><div className={`text-2xl font-bold mt-2 font-mono ${salesTotals.total - purchaseTotals.total >= 0 ? "text-success" : "text-destructive"}`}>₹{(salesTotals.total - purchaseTotals.total).toLocaleString()}</div></Card>
          </div>
          <Card className="p-5 bg-card border-border/60">
            <h4 className="font-semibold mb-3">GST output vs input</h4>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-xs uppercase"><tr><th className="text-left py-1">Tax</th><th className="text-right">Output (sales)</th><th className="text-right">Input (purchase)</th><th className="text-right">Net payable</th></tr></thead>
              <tbody className="font-mono">
                <tr className="border-t border-border/40"><td className="py-2">CGST</td><td className="text-right">₹{salesTotals.cgst.toFixed(2)}</td><td className="text-right">₹{purchaseTotals.cgst.toFixed(2)}</td><td className="text-right font-bold">₹{(salesTotals.cgst - purchaseTotals.cgst).toFixed(2)}</td></tr>
                <tr className="border-t border-border/40"><td className="py-2">SGST</td><td className="text-right">₹{salesTotals.sgst.toFixed(2)}</td><td className="text-right">₹{purchaseTotals.sgst.toFixed(2)}</td><td className="text-right font-bold">₹{(salesTotals.sgst - purchaseTotals.sgst).toFixed(2)}</td></tr>
              </tbody>
            </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="dead" className="space-y-4 mt-4">
          <Card className="bg-card border-border/60 overflow-hidden">
            <div className="p-4 border-b border-border/40">
              <h4 className="font-semibold">Dead cylinders (damaged / lost)</h4>
              <p className="text-xs text-muted-foreground">Last known customer shown for each.</p>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left px-4 py-3">Serial #</th><th className="text-left px-4 py-3">Type</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Last customer</th><th className="text-left px-4 py-3">Phone</th><th className="text-left px-4 py-3">Issued</th></tr>
              </thead>
              <tbody>
                {filteredDead.map((d) => (
                  <tr key={d.id} className="border-t border-border/40">
                    <td className="px-4 py-3 font-mono font-semibold text-primary">{d.serial_number}</td>
                    <td className="px-4 py-3">{d.cylinder_types?.code} — {d.cylinder_types?.name}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-destructive/15 text-destructive">{d.status}</span></td>
                    <td className="px-4 py-3">{d.customers?.name ?? "—"} <span className="font-mono text-[10px] text-muted-foreground">{d.customers?.customer_number ?? ""}</span></td>
                    <td className="px-4 py-3 font-mono text-xs">{d.customers?.phone ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{d.issued_at ? new Date(d.issued_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
                {filteredDead.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No dead cylinders.</td></tr>}
              </tbody>
            </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryRow({ t, label, tone }: { t: any; label: string; tone: "success" | "warning" }) {
  const color = tone === "success" ? "text-success" : "text-warning";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <Card className="p-4 bg-card border-border/60"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label} taxable</div><div className={`text-xl font-bold font-mono mt-1`}>₹{t.taxable.toLocaleString()}</div></Card>
      <Card className="p-4 bg-card border-border/60"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">CGST</div><div className="text-xl font-bold font-mono mt-1">₹{t.cgst.toLocaleString()}</div></Card>
      <Card className="p-4 bg-card border-border/60"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">SGST</div><div className="text-xl font-bold font-mono mt-1">₹{t.sgst.toLocaleString()}</div></Card>
      <Card className="p-4 bg-card border-border/60"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label} total</div><div className={`text-xl font-bold font-mono mt-1 ${color}`}>₹{t.total.toLocaleString()}</div></Card>
    </div>
  );
}
