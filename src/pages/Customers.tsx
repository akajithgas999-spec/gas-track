import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil, Search, Phone, MapPin, Wallet, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const OVERDUE_DAYS = 30;

export default function Customers() {
  const [items, setItems] = useState<any[]>([]);
  const [overdueByCustomer, setOverdueByCustomer] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", gst_number: "", address: "", notes: "" });

  // Deposit dialog
  const [depOpen, setDepOpen] = useState(false);
  const [depCustomer, setDepCustomer] = useState<any | null>(null);
  const [depForm, setDepForm] = useState({ type: "collected", amount: "0", occurred_at: new Date().toISOString().slice(0, 10), notes: "" });
  const [depHistory, setDepHistory] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase.from("customers").select("*").order("customer_number");
    setItems(data ?? []);
    // overdue cylinders per customer
    const cutoff = new Date(Date.now() - OVERDUE_DAYS * 86400000).toISOString();
    const { data: cyls } = await supabase
      .from("cylinders")
      .select("current_customer_id, issued_at")
      .eq("status", "issued")
      .lt("issued_at", cutoff);
    const map: Record<string, number> = {};
    (cyls ?? []).forEach((c: any) => {
      if (c.current_customer_id) map[c.current_customer_id] = (map[c.current_customer_id] ?? 0) + 1;
    });
    setOverdueByCustomer(map);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEdit(null); setForm({ name: "", phone: "", email: "", gst_number: "", address: "", notes: "" }); setOpen(true); };
  const openEdit = (c: any) => { setEdit(c); setForm({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", gst_number: c.gst_number ?? "", address: c.address ?? "", notes: c.notes ?? "" }); setOpen(true); };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      gst_number: form.gst_number.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { error } = edit
      ? await supabase.from("customers").update(payload).eq("id", edit.id)
      : await supabase.from("customers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setOpen(false);
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete customer?")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const openDeposit = async (c: any) => {
    setDepCustomer(c);
    setDepForm({ type: "collected", amount: "0", occurred_at: new Date().toISOString().slice(0, 10), notes: "" });
    setDepOpen(true);
    const { data } = await supabase
      .from("customer_deposits")
      .select("*")
      .eq("customer_id", c.id)
      .order("occurred_at", { ascending: false })
      .limit(20);
    setDepHistory(data ?? []);
  };

  const saveDeposit = async () => {
    const amt = Number(depForm.amount);
    if (!amt) return toast.error("Amount required");
    const { error } = await supabase.from("customer_deposits").insert({
      customer_id: depCustomer.id,
      type: depForm.type as any,
      amount: amt,
      occurred_at: new Date(depForm.occurred_at).toISOString(),
      notes: depForm.notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Deposit recorded — notification queued");
    // Fire WhatsApp notification (no-op if Twilio not yet connected)
    supabase.functions.invoke("notify-deposit-change", {
      body: { customer_id: depCustomer.id, type: depForm.type, amount: amt },
    }).catch(() => {});
    setDepOpen(false);
    load();
  };

  const filtered = items.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return [c.name, c.phone, c.email, c.customer_number, c.gst_number].filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, customer #, phone, GST..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-full sm:w-auto sm:ml-auto">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Add customer</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{edit ? "Edit" : "New"} customer</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91..." /></div>
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <div><Label>GST number</Label><Input value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} placeholder="22AAAAA0000A1Z5" /></div>
                <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <Button onClick={save} className="w-full">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => {
          const overdue = overdueByCustomer[c.id] ?? 0;
          return (
            <Card key={c.id} className={`p-5 bg-card border ${overdue > 0 ? "border-destructive/60 ring-1 ring-destructive/30" : "border-border/60"} hover:border-primary/40 transition-colors`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-primary">{c.customer_number}</div>
                  <div className="text-lg font-bold">{c.name}</div>
                  {c.gst_number && <div className="text-[11px] font-mono text-muted-foreground">GSTIN {c.gst_number}</div>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openDeposit(c)} title="Deposit"><Wallet className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {c.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /><span className="font-mono">{c.phone}</span></div>}
                {c.address && <div className="flex items-start gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5 mt-0.5" /><span>{c.address}</span></div>}
              </div>
              <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Deposit balance</span>
                <span className={`font-mono font-bold ${Number(c.deposit_balance) > 0 ? "text-success" : "text-muted-foreground"}`}>₹{Number(c.deposit_balance ?? 0).toLocaleString()}</span>
              </div>
              {overdue > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-destructive text-xs font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {overdue} cylinder{overdue > 1 ? "s" : ""} overdue ({OVERDUE_DAYS}+ days)
                </div>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && <p className="col-span-full text-center text-muted-foreground py-12">No customers yet.</p>}
      </div>

      {/* Deposit dialog */}
      <Dialog open={depOpen} onOpenChange={setDepOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Deposit — {depCustomer?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded bg-secondary/50">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Current balance</span>
              <span className="font-mono font-bold text-lg">₹{Number(depCustomer?.deposit_balance ?? 0).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label>
                <Select value={depForm.type} onValueChange={(v) => setDepForm({ ...depForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="collected">Collected (billing)</SelectItem>
                    <SelectItem value="refunded">Refunded (return)</SelectItem>
                    <SelectItem value="adjusted">Adjusted (signed ±)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Date</Label><Input type="date" value={depForm.occurred_at} onChange={(e) => setDepForm({ ...depForm, occurred_at: e.target.value })} /></div>
            </div>
            <div><Label>Amount (₹)</Label><Input type="number" value={depForm.amount} onChange={(e) => setDepForm({ ...depForm, amount: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={depForm.notes} onChange={(e) => setDepForm({ ...depForm, notes: e.target.value })} /></div>
            <Button onClick={saveDeposit} className="w-full">Record deposit</Button>

            {depHistory.length > 0 && (
              <div className="pt-3 border-t border-border/40">
                <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Recent history</div>
                <div className="space-y-1 max-h-48 overflow-auto">
                  {depHistory.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                      <span className="font-mono text-muted-foreground">{new Date(h.occurred_at).toLocaleDateString()}</span>
                      <span className={`uppercase font-semibold ${h.type === "collected" ? "text-success" : h.type === "refunded" ? "text-warning" : "text-primary"}`}>{h.type}</span>
                      <span className="font-mono">₹{Number(h.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
