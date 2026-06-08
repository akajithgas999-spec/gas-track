import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, Plus, PackagePlus } from "lucide-react";
import { toast } from "sonner";

const TYPE_LABEL: Record<string, string> = { issue: "Issue", return: "Return", incoming: "Incoming Stock" };

export default function Transactions() {
  const [items, setItems] = useState<any[]>([]);
  const [cylinders, setCylinders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    txn_type: "issue",
    cylinder_id: "",
    customer_id: "",
    amount: "0",
    notes: "",
    create_invoice: true,
  });

  const load = async () => {
    const { data } = await supabase
      .from("transactions")
      .select("*, cylinders(serial_number), customers(name), cylinder_types(code,name,price)")
      .order("occurred_at", { ascending: false })
      .limit(200);
    setItems(data ?? []);
  };
  const loadRefs = async () => {
    const [{ data: cyl }, { data: cust }] = await Promise.all([
      supabase.from("cylinders").select("id, serial_number, type_id, status, cylinder_types(code,price)").order("serial_number"),
      supabase.from("customers").select("id, name").order("name"),
    ]);
    setCylinders(cyl ?? []);
    setCustomers(cust ?? []);
  };
  useEffect(() => { load(); loadRefs(); }, []);

  const onPickCylinder = (id: string) => {
    const c = cylinders.find((x) => x.id === id);
    setForm((f) => ({ ...f, cylinder_id: id, amount: c?.cylinder_types?.price ? String(c.cylinder_types.price) : f.amount }));
  };

  const openNew = () => {
    setForm({ txn_type: "issue", cylinder_id: "", customer_id: "", amount: "0", notes: "", create_invoice: true });
    setOpen(true);
  };

  const save = async () => {
    if (!form.cylinder_id) return toast.error("Pick a cylinder");
    if ((form.txn_type === "issue" || form.txn_type === "return") && !form.customer_id)
      return toast.error("Pick a customer");
    const cyl = cylinders.find((c) => c.id === form.cylinder_id);
    if (!cyl) return;

    const txnPayload = {
      txn_type: form.txn_type as any,
      cylinder_id: form.cylinder_id,
      customer_id: form.customer_id || null,
      type_id: cyl.type_id,
      amount: Number(form.amount) || 0,
      notes: form.notes.trim() || null,
    };
    const { data: txn, error } = await supabase.from("transactions").insert(txnPayload).select().single();
    if (error) return toast.error(error.message);

    // Update cylinder status
    const newStatus = form.txn_type === "issue" ? "issued" : form.txn_type === "return" ? "in_stock" : "in_stock";
    const newCustomer = form.txn_type === "issue" ? form.customer_id : null;
    await supabase.from("cylinders").update({ status: newStatus as any, current_customer_id: newCustomer }).eq("id", form.cylinder_id);

    // Optionally create invoice
    if (form.create_invoice && form.txn_type === "issue" && form.customer_id && Number(form.amount) > 0) {
      await supabase.from("invoices").insert({
        customer_id: form.customer_id,
        transaction_id: txn.id,
        amount: Number(form.amount),
        status: "pending",
      });
    }

    toast.success("Transaction recorded");
    setOpen(false);
    load();
    loadRefs();
  };

  const availableCyl = cylinders.filter((c) => {
    if (form.txn_type === "issue") return c.status === "in_stock";
    if (form.txn_type === "return") return c.status === "issued";
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">All cylinder movements logged here.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />New transaction</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record transaction</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Type</Label>
                <Select value={form.txn_type} onValueChange={(v) => setForm({ ...form, txn_type: v, cylinder_id: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="issue">Issue to customer</SelectItem>
                    <SelectItem value="return">Return from customer</SelectItem>
                    <SelectItem value="incoming">Incoming stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Cylinder ({availableCyl.length} available)</Label>
                <Select value={form.cylinder_id} onValueChange={onPickCylinder}>
                  <SelectTrigger><SelectValue placeholder="Select cylinder" /></SelectTrigger>
                  <SelectContent>{availableCyl.map((c) => <SelectItem key={c.id} value={c.id}>{c.serial_number} — {c.cylinder_types?.code}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {form.txn_type !== "incoming" && (
                <div><Label>Customer</Label>
                  <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              {form.txn_type === "issue" && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.create_invoice} onChange={(e) => setForm({ ...form, create_invoice: e.target.checked })} />
                  Auto-generate invoice (pending)
                </label>
              )}
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={save} className="w-full">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Cylinder</th>
                <th className="text-left px-4 py-3">Gas</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-right px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-t border-border/40 hover:bg-secondary/30">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{new Date(t.occurred_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                      t.txn_type === "issue" ? "bg-warning/15 text-warning" : t.txn_type === "return" ? "bg-success/15 text-success" : "bg-primary/15 text-primary"
                    }`}>
                      {t.txn_type === "issue" ? <ArrowUp className="h-3 w-3" /> : t.txn_type === "return" ? <ArrowDown className="h-3 w-3" /> : <PackagePlus className="h-3 w-3" />}
                      {TYPE_LABEL[t.txn_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">{t.cylinders?.serial_number}</td>
                  <td className="px-4 py-3">{t.cylinder_types?.code}</td>
                  <td className="px-4 py-3">{t.customers?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">₹{Number(t.amount).toLocaleString()}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No transactions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
