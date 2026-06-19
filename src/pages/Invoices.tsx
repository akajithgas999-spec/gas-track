import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, CheckCircle2, Clock, X, Trash2, Printer, ArrowDownToLine, ArrowUpFromLine, Package, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type LineItem = {
  type_id: string;
  description: string;
  hsn_code: string;
  quantity: number;
  rate: number;
  issued_numbers: string;
  returned_numbers: string;
};

function parseCylNums(raw: string): number[] {
  return raw.split(/[,\s]+/).map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n >= 1 && n <= 2000);
}

export default function Invoices() {
  const [items, setItems] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);

  const [form, setForm] = useState({
    customer_id: "",
    gst_number: "",
    billing_date: new Date().toISOString().slice(0, 10),
    return_date: "",
    deposit_amount: "0",
    discount: "0",
    cgst_rate: "9",
    sgst_rate: "9",
    notes: "",
  });
  const [lines, setLines] = useState<LineItem[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("invoices")
      .select("*, customers(name, phone, customer_number, gst_number, address)")
      .order("issued_at", { ascending: false });
    setItems(data ?? []);
  };

  useEffect(() => {
    load();
    supabase.from("customers").select("id, name, customer_number, gst_number, address, phone").order("customer_number").then(({ data }) => setCustomers(data ?? []));
    supabase.from("cylinder_types").select("*").then(({ data }) => setTypes(data ?? []));
  }, []);

  useEffect(() => {
    const c = customers.find((x) => x.id === form.customer_id);
    if (c) setForm((f) => ({ ...f, gst_number: c.gst_number ?? "" }));
  }, [form.customer_id, customers]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + Number(l.quantity || 0) * Number(l.rate || 0), 0);
    const discount = Number(form.discount) || 0;
    const taxable = Math.max(0, subtotal - discount);
    const cgst = (taxable * (Number(form.cgst_rate) || 0)) / 100;
    const sgst = (taxable * (Number(form.sgst_rate) || 0)) / 100;
    const deposit = Number(form.deposit_amount) || 0;
    const gross = taxable + cgst + sgst + deposit;
    const total = Math.round(gross);
    const roundoff = +(total - gross).toFixed(2);
    return { subtotal, discount, taxable, cgst, sgst, deposit, total, roundoff };
  }, [lines, form]);

  const resetForm = () => {
    setForm({ customer_id: "", gst_number: "", billing_date: new Date().toISOString().slice(0, 10), return_date: "", deposit_amount: "0", discount: "0", cgst_rate: "9", sgst_rate: "9", notes: "" });
    setLines([]);
  };

  const addLine = () => setLines([...lines, { type_id: "", description: "", hsn_code: "", quantity: 1, rate: 0, issued_numbers: "", returned_numbers: "" }]);

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setLines((curr) => curr.map((l, i) => {
      if (i !== idx) return l;
      const merged = { ...l, ...patch };
      if (patch.type_id) {
        const t = types.find((x) => x.id === patch.type_id);
        if (t) {
          if (!merged.hsn_code) merged.hsn_code = t.hsn_code ?? "";
          if (!merged.rate) merged.rate = Number(t.price) || 0;
          if (!merged.description) merged.description = `${t.name} (${t.code})`;
        }
      }
      return merged;
    }));
  };
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));

  const allIssued = lines.flatMap((l) => parseCylNums(l.issued_numbers));
  const allReturned = lines.flatMap((l) => parseCylNums(l.returned_numbers));

  const save = async () => {
    if (!form.customer_id) return toast.error("Select a customer");
    if (lines.length === 0) return toast.error("Add at least one line item");

    const payload: any = {
      customer_id: form.customer_id,
      gst_number: form.gst_number || null,
      billing_date: form.billing_date,
      return_date: form.return_date || null,
      hsn_code: lines[0]?.hsn_code || null,
      taxable_amount: totals.taxable,
      discount: totals.discount,
      deposit_amount: totals.deposit,
      cgst_rate: Number(form.cgst_rate) || 0,
      cgst_amount: totals.cgst,
      sgst_rate: Number(form.sgst_rate) || 0,
      sgst_amount: totals.sgst,
      roundoff: totals.roundoff,
      total: totals.total,
      amount: totals.total,
      notes: form.notes.trim() || null,
      cylinder_ids: [],
      issued_cylinder_numbers: allIssued,
      returned_cylinder_numbers: allReturned,
    };

    const { data: inv, error } = await (supabase.from("invoices") as any).insert(payload).select().single();
    if (error || !inv) return toast.error(error?.message ?? "Failed to save invoice");

    const itemRows = lines.map((l) => {
      const taxable = Number(l.quantity) * Number(l.rate);
      const cg = (taxable * (Number(form.cgst_rate) || 0)) / 100;
      const sg = (taxable * (Number(form.sgst_rate) || 0)) / 100;
      return { invoice_id: inv.id, cylinder_id: null, type_id: l.type_id || null, description: l.description, hsn_code: l.hsn_code, quantity: l.quantity, rate: l.rate, taxable, cgst_amount: cg, sgst_amount: sg, total: taxable + cg + sg };
    });
    if (itemRows.length) await supabase.from("invoice_items").insert(itemRows);

    if (totals.deposit > 0) {
      await supabase.from("customer_deposits").insert({ customer_id: form.customer_id, type: "collected", amount: totals.deposit, occurred_at: new Date(form.billing_date).toISOString(), notes: `Invoice ${inv.invoice_number}` });
      supabase.functions.invoke("notify-deposit-change", { body: { customer_id: form.customer_id, type: "collected", amount: totals.deposit } }).catch(() => {});
    }

    toast.success("Invoice created ✓");
    setOpen(false);
    resetForm();
    load();
  };

  const setStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "paid") patch.paid_at = new Date().toISOString();
    else patch.paid_at = null;
    await supabase.from("invoices").update(patch).eq("id", id);
    load();
  };

  const filtered = items.filter((i) => filter === "all" || i.status === filter);
  const pending = items.filter((i) => i.status === "pending").reduce((a, b) => a + Number(b.total ?? b.amount), 0);
  const paid = items.filter((i) => i.status === "paid").reduce((a, b) => a + Number(b.total ?? b.amount), 0);

  const selectedCustomer = customers.find((c) => c.id === form.customer_id);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 bg-card border-border/60"><div className="text-xs uppercase tracking-widest text-muted-foreground">Total Paid</div><div className="text-2xl font-bold mt-2 font-mono text-success">₹{paid.toLocaleString()}</div></Card>
        <Card className="p-5 bg-card border-border/60"><div className="text-xs uppercase tracking-widest text-muted-foreground">Pending</div><div className="text-2xl font-bold mt-2 font-mono text-warning">₹{pending.toLocaleString()}</div></Card>
        <Card className="p-5 bg-card border-border/60"><div className="text-xs uppercase tracking-widest text-muted-foreground">Total Invoices</div><div className="text-2xl font-bold mt-2 font-mono">{items.length}</div></Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All invoices</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <div className="w-full sm:w-auto sm:ml-auto">
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setOpen(true); }} className="w-full sm:w-auto gap-2">
                <Plus className="h-4 w-4" /> New GST Invoice
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">New GST Invoice</DialogTitle>
              </DialogHeader>

              <div className="space-y-6 pt-2">

                {/* ── SECTION 1: Customer & Dates ── */}
                <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 space-y-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Customer Details</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col">
                      <Label className="text-xs text-muted-foreground mb-1">Customer *</Label>
                      <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={customerOpen}
                            className="w-full justify-between font-normal"
                          >
                            {form.customer_id
                              ? (() => {
                                  const sc = customers.find((c) => c.id === form.customer_id);
                                  return sc ? `${sc.customer_number} — ${sc.name}` : "Select customer...";
                                })()
                              : "Select customer..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search customer (name, phone, GSTIN)..." />
                            <CommandList>
                              <CommandEmpty>No customer found.</CommandEmpty>
                              <CommandGroup>
                                {customers.map((c) => (
                                  <CommandItem
                                    key={c.id}
                                    value={`${c.customer_number} ${c.name} ${c.phone || ""} ${c.gst_number || ""}`}
                                    onSelect={() => {
                                      setForm({ ...form, customer_id: c.id });
                                      setCustomerOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        form.customer_id === c.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {c.customer_number} — {c.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="flex flex-col">
                      <Label className="text-xs text-muted-foreground mb-1">GSTIN</Label>
                      <Input value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} placeholder="Auto-filled from customer" />
                    </div>
                  </div>
                  {selectedCustomer && (
                    <div className="text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2">
                      📍 {selectedCustomer.address || "No address"} · 📞 {selectedCustomer.phone || "No phone"}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div><Label className="text-xs text-muted-foreground">Billing Date</Label><Input type="date" className="mt-1" value={form.billing_date} onChange={(e) => setForm({ ...form, billing_date: e.target.value })} /></div>
                    <div><Label className="text-xs text-muted-foreground">Return Date</Label><Input type="date" className="mt-1" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} /></div>
                    <div><Label className="text-xs text-muted-foreground">CGST %</Label><Input type="number" className="mt-1" value={form.cgst_rate} onChange={(e) => setForm({ ...form, cgst_rate: e.target.value })} /></div>
                    <div><Label className="text-xs text-muted-foreground">SGST %</Label><Input type="number" className="mt-1" value={form.sgst_rate} onChange={(e) => setForm({ ...form, sgst_rate: e.target.value })} /></div>
                  </div>
                </div>

                {/* ── SECTION 2: Line Items ── */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Items & Cylinder Tracking</div>
                    <Button size="sm" variant="outline" onClick={addLine} className="gap-1.5 h-8">
                      <Plus className="h-3 w-3" /> Add Item
                    </Button>
                  </div>

                  {lines.length === 0 && (
                    <div className="rounded-xl border-2 border-dashed border-border/40 py-10 text-center">
                      <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No items yet. Click "Add Item" to start.</p>
                    </div>
                  )}

                  {lines.map((l, i) => (
                    <div key={i} className="rounded-xl border border-border/50 bg-secondary/15 p-4 space-y-3">
                      {/* Line header */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Item #{i + 1}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(i)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>

                      {/* Row 1: Type + Description + HSN + Qty + Rate */}
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                        <div className="sm:col-span-1">
                          <Label className="text-[10px] text-muted-foreground">Cylinder Type *</Label>
                          <Select value={l.type_id} onValueChange={(v) => updateLine(i, { type_id: v })}>
                            <SelectTrigger className="mt-1 h-9">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {types.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  <span className="font-mono font-bold">{t.code}</span>
                                  <span className="text-muted-foreground ml-1">— {t.name}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-[10px] text-muted-foreground">Description</Label>
                          <Input className="mt-1 h-9" value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Auto-filled from type" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">HSN Code</Label>
                          <Input className="mt-1 h-9 font-mono" value={l.hsn_code} onChange={(e) => updateLine(i, { hsn_code: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Qty</Label>
                            <Input type="number" className="mt-1 h-9 font-mono" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} min={1} />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Rate ₹</Label>
                            <Input type="number" className="mt-1 h-9 font-mono" value={l.rate} onChange={(e) => updateLine(i, { rate: Number(e.target.value) })} />
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Cylinder numbers */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/30">
                        <div>
                          <Label className="text-[10px] text-success flex items-center gap-1 mb-1">
                            <ArrowDownToLine className="h-3 w-3" /> Issued Cylinder Numbers
                          </Label>
                          <Input
                            className="font-mono text-xs h-9"
                            value={l.issued_numbers}
                            onChange={(e) => updateLine(i, { issued_numbers: e.target.value })}
                            placeholder="e.g. 5, 6, 42, 100"
                          />
                          {l.issued_numbers && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {parseCylNums(l.issued_numbers).map((n) => (
                                <span key={n} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-success/15 text-success">#{n}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <Label className="text-[10px] text-warning flex items-center gap-1 mb-1">
                            <ArrowUpFromLine className="h-3 w-3" /> Returned Cylinder Numbers
                          </Label>
                          <Input
                            className="font-mono text-xs h-9"
                            value={l.returned_numbers}
                            onChange={(e) => updateLine(i, { returned_numbers: e.target.value })}
                            placeholder="e.g. 3, 4 (empty returned)"
                          />
                          {l.returned_numbers && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {parseCylNums(l.returned_numbers).map((n) => (
                                <span key={n} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-warning/15 text-warning">#{n}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Subtotal for this line */}
                      <div className="text-right text-xs text-muted-foreground">
                        Line total: <span className="font-mono font-semibold text-foreground">₹{(Number(l.quantity) * Number(l.rate)).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Outstanding summary */}
                {(allIssued.length > 0 || allReturned.length > 0) && (
                  <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 space-y-1.5">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Cylinder Summary</div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                      <span className="text-success font-semibold">↓ Issued ({allIssued.length}): <span className="font-mono">{allIssued.join(", ") || "—"}</span></span>
                      <span className="text-warning font-semibold">↑ Returned ({allReturned.length}): <span className="font-mono">{allReturned.join(", ") || "—"}</span></span>
                      {allIssued.filter((n) => !allReturned.includes(n)).length > 0 && (
                        <span className="text-destructive font-semibold">⚠ Outstanding: <span className="font-mono">{allIssued.filter((n) => !allReturned.includes(n)).join(", ")}</span></span>
                      )}
                    </div>
                  </div>
                )}

                {/* ── SECTION 3: Amounts ── */}
                <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 space-y-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Amounts</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><Label className="text-xs text-muted-foreground">Discount (₹)</Label><Input type="number" className="mt-1" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></div>
                    <div><Label className="text-xs text-muted-foreground">Deposit (₹)</Label><Input type="number" className="mt-1" value={form.deposit_amount} onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })} /></div>
                  </div>
                  {/* Totals */}
                  <div className="rounded-lg bg-secondary/40 p-3 space-y-1.5 font-mono text-sm">
                    <AmtRow k="Subtotal" v={totals.subtotal} />
                    {totals.discount > 0 && <AmtRow k="Discount" v={-totals.discount} />}
                    <AmtRow k="Taxable" v={totals.taxable} bold />
                    <AmtRow k={`CGST @ ${form.cgst_rate}%`} v={totals.cgst} />
                    <AmtRow k={`SGST @ ${form.sgst_rate}%`} v={totals.sgst} />
                    {totals.deposit > 0 && <AmtRow k="Deposit" v={totals.deposit} />}
                    {totals.roundoff !== 0 && <AmtRow k="Round off" v={totals.roundoff} />}
                    <div className="border-t border-border/60 pt-2 mt-1">
                      <AmtRow k="TOTAL" v={totals.total} bold big />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                  <Textarea className="mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>

                <Button onClick={save} className="w-full h-11 text-base font-semibold">
                  Create Invoice
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Invoice table */}
      <Card className="bg-card border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Invoice #</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">GSTIN</th>
                <th className="text-left px-4 py-3">Issued #</th>
                <th className="text-left px-4 py-3">Returned #</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const issued: number[] = i.issued_cylinder_numbers ?? [];
                const returned: number[] = i.returned_cylinder_numbers ?? [];
                return (
                  <tr key={i.id} className="border-t border-border/40 hover:bg-secondary/30">
                    <td className="px-4 py-3 font-mono font-semibold text-primary cursor-pointer" onClick={() => setViewing(i)}>{i.invoice_number}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{new Date(i.billing_date ?? i.issued_at).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3">{i.customers?.name}<div className="text-[10px] font-mono text-muted-foreground">{i.customers?.customer_number}</div></td>
                    <td className="px-4 py-3 font-mono text-xs">{i.gst_number ?? "—"}</td>
                    <td className="px-4 py-3">
                      {issued.length > 0 ? <div className="flex flex-wrap gap-1">{issued.map((n) => <span key={n} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-success/15 text-success">#{n}</span>)}</div> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {returned.length > 0 ? <div className="flex flex-wrap gap-1">{returned.map((n) => <span key={n} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-warning/15 text-warning">#{n}</span>)}</div> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">₹{Number(i.total ?? i.amount).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${i.status === "paid" ? "bg-success/15 text-success" : i.status === "pending" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
                        {i.status === "paid" ? <CheckCircle2 className="h-3 w-3" /> : i.status === "pending" ? <Clock className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {i.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(i)}><Printer className="h-3 w-3" /></Button>
                      {i.status !== "paid" && <Button size="sm" variant="ghost" onClick={() => setStatus(i.id, "paid")}>Mark paid</Button>}
                      {i.status === "paid" && <Button size="sm" variant="ghost" onClick={() => setStatus(i.id, "pending")}>Undo</Button>}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No invoices found.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Print view dialog */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewing && (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b border-border/60 pb-3">
                <div><h2 className="text-xl font-bold">TAX INVOICE</h2><p className="text-xs font-mono text-muted-foreground">{viewing.invoice_number}</p></div>
                <div className="text-right text-xs">
                  <div>Date: {new Date(viewing.billing_date ?? viewing.issued_at).toLocaleDateString("en-IN")}</div>
                  {viewing.return_date && <div>Return: {new Date(viewing.return_date).toLocaleDateString("en-IN")}</div>}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Bill to</div>
                <div className="font-semibold">{viewing.customers?.name} ({viewing.customers?.customer_number})</div>
                {viewing.customers?.address && <div className="text-xs text-muted-foreground">{viewing.customers.address}</div>}
                {viewing.gst_number && <div className="text-xs font-mono">GSTIN: {viewing.gst_number}</div>}
              </div>
              {((viewing.issued_cylinder_numbers ?? []).length > 0 || (viewing.returned_cylinder_numbers ?? []).length > 0) && (
                <div className="p-3 rounded-lg border border-border/40 bg-secondary/20 space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Cylinder Details</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-success mb-1">↓ Issued ({(viewing.issued_cylinder_numbers ?? []).length})</div>
                      <div className="flex flex-wrap gap-1">{(viewing.issued_cylinder_numbers ?? []).map((n: number) => <span key={n} className="px-1.5 py-0.5 rounded bg-success/15 text-success text-[10px] font-bold font-mono">#{n}</span>)}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-warning mb-1">↑ Returned ({(viewing.returned_cylinder_numbers ?? []).length})</div>
                      <div className="flex flex-wrap gap-1">{(viewing.returned_cylinder_numbers ?? []).map((n: number) => <span key={n} className="px-1.5 py-0.5 rounded bg-warning/15 text-warning text-[10px] font-bold font-mono">#{n}</span>)}</div>
                    </div>
                  </div>
                  {(() => {
                    const out = (viewing.issued_cylinder_numbers ?? []).filter((n: number) => !(viewing.returned_cylinder_numbers ?? []).includes(n));
                    return out.length > 0 ? <div className="text-xs text-destructive font-semibold">⚠ Outstanding: <span className="font-mono">{out.map((n: number) => `#${n}`).join(", ")}</span></div> : null;
                  })()}
                </div>
              )}
              <div className="p-3 rounded-lg bg-secondary/50 space-y-1.5 font-mono text-sm">
                <AmtRow k="Taxable" v={Number(viewing.taxable_amount)} />
                <AmtRow k="Discount" v={-Number(viewing.discount)} />
                <AmtRow k={`CGST @ ${viewing.cgst_rate}%`} v={Number(viewing.cgst_amount)} />
                <AmtRow k={`SGST @ ${viewing.sgst_rate}%`} v={Number(viewing.sgst_amount)} />
                <AmtRow k="Deposit" v={Number(viewing.deposit_amount)} />
                <AmtRow k="Round off" v={Number(viewing.roundoff)} />
                <div className="border-t border-border/60 pt-2"><AmtRow k="TOTAL" v={Number(viewing.total)} bold big /></div>
              </div>
              <Button onClick={() => window.print()} variant="outline" className="w-full"><Printer className="h-4 w-4 mr-2" />Print Invoice</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AmtRow({ k, v, bold, big }: { k: string; v: number; bold?: boolean; big?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""} ${big ? "text-base" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{k}</span>
      <span>₹{v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  );
}
