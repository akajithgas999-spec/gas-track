import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus, CheckCircle2, Clock, X, Trash2, Printer,
  ArrowDownToLine, ArrowUpFromLine, Package, Check, ChevronsUpDown,
  AlertCircle, Banknote, MessageSquare, Send, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── SMS helpers ──────────────────────────────────────────────────
function buildSmsMessage(inv: any, company: string): string {
  const name = inv.customers?.name ?? "Customer";
  const invNo = inv.invoice_number ?? "";
  const total = Number(inv.total ?? inv.amount ?? 0);
  const balance = Number(inv.balance_amount ?? total);
  const date = inv.billing_date ? new Date(inv.billing_date).toLocaleDateString("en-IN") : "";
  return `Dear ${name}, your invoice ${invNo} dated ${date} from ${company} has a balance of Rs.${balance.toLocaleString()} pending. Please clear at your earliest. Thank you.`;
}

function smsLink(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, "");
  return `sms:${clean}?body=${encodeURIComponent(message)}`;
}
// ─────────────────────────────────────────────────────────────────

type PaymentStatus = "paid" | "partial" | "unpaid";

type LineItem = {
  type_id: string;
  description: string;
  hsn_code: string;
  quantity: number;
  rate: string;
  cgst_rate: string;
  sgst_rate: string;
  issued_numbers: string;
  returned_numbers: string;
};

function parseCylNums(raw: string): number[] {
  return raw.split(/[,\s]+/).map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n >= 1 && n <= 2000);
}

const PAY_STATUS_STYLES: Record<PaymentStatus, { bg: string; text: string; icon: any; label: string }> = {
  paid:    { bg: "bg-emerald-500/15", text: "text-emerald-400", icon: CheckCircle2, label: "Paid" },
  partial: { bg: "bg-amber-500/15",   text: "text-amber-400",   icon: Clock,        label: "Half Paid" },
  unpaid:  { bg: "bg-rose-500/15",    text: "text-rose-400",    icon: AlertCircle,  label: "Unpaid" },
};

export default function Invoices() {
  const { company } = useCompany();
  const [items, setItems] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);

  const [form, setForm] = useState({
    customer_id: "",
    gst_number: "",
    billing_date: new Date().toISOString().slice(0, 10),
    return_date: "",
    discount: "0",
    notes: "",
    payment_status: "unpaid" as PaymentStatus,
    amount_paid: "0",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: "Cash",
  });
  const [lines, setLines] = useState<LineItem[]>([]);

  const load = async () => {
    const { data } = await (supabase.from("invoices") as any)
      .select("*, customers(name, phone, customer_number, gst_number, address)")
      .eq("company", company)
      .order("issued_at", { ascending: false });
    setItems(data ?? []);
  };

  useEffect(() => {
    load();
    (supabase.from("customers") as any).select("id, name, customer_number, gst_number, address, phone").eq("company", company).order("customer_number").then(({ data }: any) => setCustomers(data ?? []));
    supabase.from("cylinder_types").select("*").then(({ data }) => setTypes(data ?? []));
  }, [company]);

  useEffect(() => {
    const c = customers.find((x) => x.id === form.customer_id);
    if (c) setForm((f) => ({ ...f, gst_number: c.gst_number ?? "" }));
  }, [form.customer_id, customers]);

  // Auto-set amount_paid when status changes to "paid"
  useEffect(() => {
    if (form.payment_status === "paid") {
      setForm((f) => ({ ...f, amount_paid: String(totals.total) }));
    } else if (form.payment_status === "unpaid") {
      setForm((f) => ({ ...f, amount_paid: "0" }));
    }
  }, [form.payment_status]);

  // Group lines by GST slab and compute per-slab figures
  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + Number(l.quantity || 0) * Number(l.rate || 0), 0);
    const discount = Number(form.discount) || 0;
    const grossAfterDiscount = Math.max(0, subtotal - discount);

    // Build per-slab breakdown
    type SlabEntry = { cgstRate: number; sgstRate: number; gross: number; taxable: number; cgst: number; sgst: number };
    const slabMap: Record<string, SlabEntry> = {};
    const discountRatio = subtotal > 0 ? grossAfterDiscount / subtotal : 1;

    for (const l of lines) {
      const lineGross = Number(l.quantity || 0) * Number(l.rate || 0) * discountRatio;
      const cr = Number(l.cgst_rate) || 0;
      const sr = Number(l.sgst_rate) || 0;
      const key = `${cr}_${sr}`;
      const divisor = 1 + (cr + sr) / 100;
      const taxable = lineGross / divisor;
      const cgst = taxable * cr / 100;
      const sgst = taxable * sr / 100;
      if (!slabMap[key]) slabMap[key] = { cgstRate: cr, sgstRate: sr, gross: 0, taxable: 0, cgst: 0, sgst: 0 };
      slabMap[key].gross   += lineGross;
      slabMap[key].taxable += taxable;
      slabMap[key].cgst    += cgst;
      slabMap[key].sgst    += sgst;
    }

    const slabs = Object.values(slabMap);
    const taxable = slabs.reduce((a, s) => a + s.taxable, 0);
    const cgst    = slabs.reduce((a, s) => a + s.cgst, 0);
    const sgst    = slabs.reduce((a, s) => a + s.sgst, 0);
    const total   = Math.round(grossAfterDiscount);
    const roundoff = +(total - grossAfterDiscount).toFixed(2);

    const paid = form.payment_status === "paid"
      ? total
      : form.payment_status === "partial"
      ? Math.min(total, Math.max(0, Number(form.amount_paid) || 0))
      : 0;
    const balance = Math.max(0, total - paid);

    return { subtotal, discount: discount, taxable, cgst, sgst, total, roundoff, paid, balance, slabs };
  }, [lines, form]);

  const resetForm = () => {
    setForm({
      customer_id: "", gst_number: "",
      billing_date: new Date().toISOString().slice(0, 10),
      return_date: "", discount: "0", notes: "",
      payment_status: "unpaid", amount_paid: "0",
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: "Cash",
    });
    setLines([]);
  };

  const addLine = () => setLines([...lines, { type_id: "", description: "", hsn_code: "", quantity: 1, rate: "", cgst_rate: "9", sgst_rate: "9", issued_numbers: "", returned_numbers: "" }]);

  // GST rate map: type code (uppercase) → [cgst%, sgst%]
  const GST_RATE_MAP: Record<string, [string, string]> = {
    MO2:   ["2.5", "2.5"],
    N2O:   ["2.5", "2.5"],
    CO2:   ["9",   "9"],
    O2:    ["9",   "9"],
    ARGON: ["9",   "9"],
    N2:    ["9",   "9"],
    DA:    ["9",   "9"],
  };

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setLines((curr) => curr.map((l, i) => {
      if (i !== idx) return l;
      const merged = { ...l, ...patch };
      if (patch.type_id) {
        const t = types.find((x) => x.id === patch.type_id);
        if (t) {
          if (!merged.hsn_code) merged.hsn_code = t.hsn_code ?? "";
          if (!merged.rate) merged.rate = String(Number(t.price) || 0);
          if (!merged.description) merged.description = `${t.name} (${t.code})`;
          // Auto-set per-line GST rates from the type code
          const code = (t.code ?? "").trim().toUpperCase();
          const rates = GST_RATE_MAP[code];
          if (rates) { merged.cgst_rate = rates[0]; merged.sgst_rate = rates[1]; }
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

    // Map payment_status to invoice status
    const invoiceStatus = form.payment_status === "paid" ? "paid" : "pending";

    const payload: any = {
      customer_id: form.customer_id,
      gst_number: form.gst_number || null,
      billing_date: form.billing_date,
      return_date: form.return_date || null,
      hsn_code: lines[0]?.hsn_code || null,
      taxable_amount: totals.taxable,
      discount: totals.discount,
      deposit_amount: 0,
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
      status: invoiceStatus,
      paid_at: form.payment_status === "paid" ? new Date().toISOString() : null,
      // Payment tracking
      payment_status: form.payment_status,
      amount_paid: totals.paid,
      balance_amount: totals.balance,
      payment_date: totals.paid > 0 ? form.payment_date : null,
      payment_method: form.payment_method || null,
      company,
    };

    let { data: inv, error } = await (supabase.from("invoices") as any).insert(payload).select().single();

    // If schema cache doesn't have the new payment columns yet, strip them and retry
    if (error && (error.message.includes("schema cache") || error.message.includes("Could not find"))) {
      const missingCol = error.message.match(/'([^']+)' column/)?.[1] ?? "unknown column";
      const fallbackPayload = { ...payload };
      // Remove all payment-tracking columns that may not exist yet
      delete fallbackPayload.payment_status;
      delete fallbackPayload.amount_paid;
      delete fallbackPayload.balance_amount;
      delete fallbackPayload.payment_date;
      delete fallbackPayload.payment_method;
      const retry = await (supabase.from("invoices") as any).insert(fallbackPayload).select().single();
      inv = retry.data;
      error = retry.error;
      if (!error) {
        toast.warning(`Invoice saved, but column '${missingCol}' is missing — run the SQL migration to enable full payment tracking.`);
      }
    }

    if (error || !inv) return toast.error(error?.message ?? "Failed to save invoice");

    const itemRows = lines.map((l) => {
      const gross = Number(l.quantity) * Number(l.rate); // rate is GST-inclusive
      const cr = Number(l.cgst_rate) || 0;
      const sr = Number(l.sgst_rate) || 0;
      const gstDivisor = 1 + (cr + sr) / 100;
      const taxable = gross / gstDivisor;
      const cg = taxable * cr / 100;
      const sg = taxable * sr / 100;
      return { invoice_id: inv.id, cylinder_id: null, type_id: l.type_id || null, description: l.description, hsn_code: l.hsn_code, quantity: l.quantity, rate: l.rate, cgst_rate: cr, sgst_rate: sr, taxable, cgst_amount: cg, sgst_amount: sg, total: gross };
    });
    if (itemRows.length) await supabase.from("invoice_items").insert(itemRows);

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

  const sendSmsReminder = (inv: any) => {
    const phone = inv.customers?.phone;
    if (!phone) return toast.error("No phone number for this customer");
    const msg = buildSmsMessage(inv, company);
    const link = smsLink(phone, msg);
    window.open(link, "_blank");
  };

  const copyAllSms = () => {
    const unpaid = items.filter((i) => i.status !== "paid" && i.customers?.phone);
    if (!unpaid.length) return toast.info("No pending invoices with phone numbers");
    const text = unpaid.map((i) => {
      const msg = buildSmsMessage(i, company);
      return `To: ${i.customers.phone}\n${msg}`;
    }).join("\n\n---\n\n");
    navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${unpaid.length} reminder messages!`));
  };

  const filtered = items.filter((i) => filter === "all" || i.status === filter || i.payment_status === filter);
  const totalPaid = items.filter((i) => i.status === "paid").reduce((a, b) => a + Number(b.total ?? b.amount), 0);
  const totalPending = items.filter((i) => i.status === "pending").reduce((a, b) => a + Number(b.total ?? b.amount), 0);
  const totalBalance = items.reduce((a, b) => a + Number(b.balance_amount ?? 0), 0);

  const selectedCustomer = customers.find((c) => c.id === form.customer_id);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 bg-card border-border/60">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Total Paid</div>
          <div className="text-2xl font-bold mt-2 font-mono text-emerald-400">₹{totalPaid.toLocaleString()}</div>
        </Card>
        <Card className="p-5 bg-card border-border/60">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Pending / Balance</div>
          <div className="text-2xl font-bold mt-2 font-mono text-amber-400">₹{totalBalance > 0 ? totalBalance.toLocaleString() : totalPending.toLocaleString()}</div>
        </Card>
        <Card className="p-5 bg-card border-border/60">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Total Invoices</div>
          <div className="text-2xl font-bold mt-2 font-mono">{items.length}</div>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All invoices</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Half Paid</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        {/* SMS Reminder Button */}
        <Button
          variant="outline"
          onClick={() => setSmsOpen(true)}
          className="gap-2 border-purple-500/40 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300 hover:border-purple-400"
        >
          <MessageSquare className="h-4 w-4" />
          Send Reminders
          {items.filter((i) => i.status !== "paid").length > 0 && (
            <span className="bg-purple-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
              {items.filter((i) => i.status !== "paid").length}
            </span>
          )}
        </Button>
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
                          <Button variant="outline" role="combobox" aria-expanded={customerOpen} className="w-full justify-between font-normal">
                            {form.customer_id
                              ? (() => { const sc = customers.find((c) => c.id === form.customer_id); return sc ? `${sc.customer_number} — ${sc.name}` : "Select customer..."; })()
                              : "Select customer..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search customer..." />
                            <CommandList>
                              <CommandEmpty>No customer found.</CommandEmpty>
                              <CommandGroup>
                                {customers.map((c) => (
                                  <CommandItem key={c.id} value={`${c.customer_number} ${c.name} ${c.phone || ""} ${c.gst_number || ""}`}
                                    onSelect={() => { setForm({ ...form, customer_id: c.id }); setCustomerOpen(false); }}>
                                    <Check className={cn("mr-2 h-4 w-4", form.customer_id === c.id ? "opacity-100" : "opacity-0")} />
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
                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                    <div><Label className="text-xs text-muted-foreground">Billing Date</Label><Input type="date" className="mt-1" value={form.billing_date} onChange={(e) => setForm({ ...form, billing_date: e.target.value })} /></div>
                    <div><Label className="text-xs text-muted-foreground">Return Date</Label><Input type="date" className="mt-1" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} /></div>
                  </div>
                  <div className="text-[10px] text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2">
                    ℹ️ GST rates are set automatically per gas type — MO2 &amp; N2O: 5% · CO2, O2, Argon, N2, DA: 18%
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
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Item #{i + 1}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(i)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                        <div className="sm:col-span-1">
                          <Label className="text-[10px] text-muted-foreground">Cylinder Type *</Label>
                          <Select value={l.type_id} onValueChange={(v) => updateLine(i, { type_id: v })}>
                            <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
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
                            <Input type="number" className="mt-1 h-9 font-mono" value={l.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} />
                          </div>
                        </div>
                        {/* Per-line GST badge */}
                        <div className="flex flex-col justify-end pb-1">
                          <Label className="text-[10px] text-muted-foreground mb-1">GST Slab</Label>
                          <div className="h-9 flex items-center px-2 rounded-md border border-border/60 bg-secondary/40 font-mono font-bold text-xs gap-1">
                            <span>{l.cgst_rate}%</span>
                            <span className="text-muted-foreground">+</span>
                            <span>{l.sgst_rate}%</span>
                            <span className="text-muted-foreground text-[10px] ml-0.5">= {(Number(l.cgst_rate) + Number(l.sgst_rate))}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/30">
                        <div>
                          <Label className="text-[10px] text-emerald-400 flex items-center gap-1 mb-1">
                            <ArrowDownToLine className="h-3 w-3" /> Issued Cylinder Numbers
                          </Label>
                          <Input className="font-mono text-xs h-9" value={l.issued_numbers} onChange={(e) => updateLine(i, { issued_numbers: e.target.value })} placeholder="e.g. 5, 6, 42, 100" />
                          {l.issued_numbers && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {parseCylNums(l.issued_numbers).map((n) => (
                                <span key={n} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400">#{n}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <Label className="text-[10px] text-amber-400 flex items-center gap-1 mb-1">
                            <ArrowUpFromLine className="h-3 w-3" /> Returned Cylinder Numbers
                          </Label>
                          <Input className="font-mono text-xs h-9" value={l.returned_numbers} onChange={(e) => updateLine(i, { returned_numbers: e.target.value })} placeholder="e.g. 3, 4 (empty returned)" />
                          {l.returned_numbers && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {parseCylNums(l.returned_numbers).map((n) => (
                                <span key={n} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400">#{n}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right text-xs text-muted-foreground">
                        Line total: <span className="font-mono font-semibold text-foreground">₹{(Number(l.quantity) * Number(l.rate)).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Cylinder summary */}
                {(allIssued.length > 0 || allReturned.length > 0) && (
                  <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 space-y-1.5">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Cylinder Summary</div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                      <span className="text-emerald-400 font-semibold">↓ Issued ({allIssued.length}): <span className="font-mono">{allIssued.join(", ") || "—"}</span></span>
                      <span className="text-amber-400 font-semibold">↑ Returned ({allReturned.length}): <span className="font-mono">{allReturned.join(", ") || "—"}</span></span>
                      {allIssued.filter((n) => !allReturned.includes(n)).length > 0 && (
                        <span className="text-rose-400 font-semibold">⚠ Outstanding: <span className="font-mono">{allIssued.filter((n) => !allReturned.includes(n)).join(", ")}</span></span>
                      )}
                    </div>
                  </div>
                )}

                {/* ── SECTION 3: Amounts ── */}
                <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 space-y-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Amounts</div>
                  <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
                    <div><Label className="text-xs text-muted-foreground">Discount (₹)</Label><Input type="number" className="mt-1" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></div>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-3 space-y-1.5 font-mono text-sm">
                    <AmtRow k="Gross (GST Incl.)" v={totals.subtotal} />
                    {totals.discount > 0 && <AmtRow k="Discount" v={-totals.discount} />}

                    {/* Per-slab GST breakdown */}
                    {totals.slabs.length > 0 && (
                      <div className="border-t border-border/40 pt-1.5 mt-1 space-y-1">
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">GST Breakup (included in above)</div>
                        {totals.slabs.map((s, idx) => (
                          <div key={idx} className="bg-secondary/60 rounded-md px-2 py-1.5 space-y-0.5">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                              {s.cgstRate + s.sgstRate}% Slab &nbsp;·&nbsp; Taxable: ₹{s.taxable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <AmtRow k={`CGST @ ${s.cgstRate}%`} v={s.cgst} />
                            <AmtRow k={`SGST @ ${s.sgstRate}%`} v={s.sgst} />
                          </div>
                        ))}
                        <div className="flex justify-between text-xs pt-0.5">
                          <span className="text-muted-foreground">Total Tax</span>
                          <span className="font-semibold">₹{(totals.cgst + totals.sgst).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}

                    {totals.roundoff !== 0 && <AmtRow k="Round off" v={totals.roundoff} />}
                    <div className="border-t border-border/60 pt-2 mt-1">
                      <AmtRow k="TOTAL" v={totals.total} bold big />
                    </div>
                  </div>
                </div>

                {/* ── SECTION 4: Payment Status ── */}
                <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 space-y-4">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Payment</div>

                  {/* 3 toggle buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    {(["paid", "partial", "unpaid"] as PaymentStatus[]).map((s) => {
                      const st = PAY_STATUS_STYLES[s];
                      const active = form.payment_status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setForm({ ...form, payment_status: s })}
                          className={cn(
                            "flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 px-2 transition-all duration-200 text-xs font-bold uppercase tracking-wider",
                            active
                              ? `${st.bg} ${st.text} border-current scale-[1.02] shadow-md`
                              : "border-border/40 bg-secondary/20 text-muted-foreground hover:border-border hover:bg-secondary/40"
                          )}
                        >
                          <st.icon className="h-4 w-4" />
                          {st.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Half-paid amount entry */}
                  {form.payment_status === "partial" && (
                    <div className="space-y-3 pt-2 border-t border-border/40">
                      <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                        <Banknote className="h-4 w-4" />
                        Enter partial payment details
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Amount Paid (₹)</Label>
                          <Input
                            type="number"
                            className="mt-1 font-mono border-amber-500/40 focus-visible:ring-amber-500/40"
                            value={form.amount_paid}
                            onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
                            placeholder="0"
                            max={totals.total}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Payment Date</Label>
                          <Input type="date" className="mt-1" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Method</Label>
                          <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Cash">Cash</SelectItem>
                              <SelectItem value="UPI / GPay / PhonePe">UPI / GPay / PhonePe</SelectItem>
                              <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                              <SelectItem value="Cheque">Cheque</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* Balance indicator */}
                      {Number(form.amount_paid) > 0 && (
                        <div className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm font-mono">
                          <span className="text-amber-400 font-semibold">Paid: ₹{totals.paid.toLocaleString()}</span>
                          <span className="text-rose-400 font-semibold">Balance: ₹{totals.balance.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Full paid — show payment date */}
                  {form.payment_status === "paid" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
                      <div>
                        <Label className="text-xs text-muted-foreground">Payment Date</Label>
                        <Input type="date" className="mt-1" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Method</Label>
                        <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Cash">Cash</SelectItem>
                            <SelectItem value="UPI / GPay / PhonePe">UPI / GPay / PhonePe</SelectItem>
                            <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                            <SelectItem value="Cheque">Cheque</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
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
                <th className="text-left px-4 py-3">Issued #</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Paid</th>
                <th className="text-right px-4 py-3">Balance</th>
                <th className="text-left px-4 py-3">Payment</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const issued: number[] = i.issued_cylinder_numbers ?? [];
                const payStatus: PaymentStatus = i.payment_status ?? (i.status === "paid" ? "paid" : "unpaid");
                const st = PAY_STATUS_STYLES[payStatus] ?? PAY_STATUS_STYLES.unpaid;
                const balance = Number(i.balance_amount ?? 0);
                const amtPaid = Number(i.amount_paid ?? (i.status === "paid" ? (i.total ?? i.amount) : 0));
                return (
                  <tr key={i.id} className="border-t border-border/40 hover:bg-secondary/30">
                    <td className="px-4 py-3 font-mono font-semibold text-primary cursor-pointer" onClick={() => setViewing(i)}>{i.invoice_number}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{new Date(i.billing_date ?? i.issued_at).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3">
                      {i.customers?.name}
                      <div className="text-[10px] font-mono text-muted-foreground">{i.customers?.customer_number}</div>
                    </td>
                    <td className="px-4 py-3">
                      {issued.length > 0
                        ? <div className="flex flex-wrap gap-1">{issued.map((n) => <span key={n} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400">#{n}</span>)}</div>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">₹{Number(i.total ?? i.amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-400 font-semibold">
                      {amtPaid > 0 ? `₹${amtPaid.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {balance > 0 ? <span className="text-rose-400">₹{balance.toLocaleString()}</span> : <span className="text-emerald-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider", st.bg, st.text)}>
                        <st.icon className="h-3 w-3" />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(i)}><Printer className="h-3 w-3" /></Button>
                      {i.status !== "paid" && (
                        <Button
                          size="sm" variant="ghost"
                          title={i.customers?.phone ? "Send SMS reminder" : "No phone number"}
                          className={i.customers?.phone ? "text-purple-400 hover:text-purple-300 hover:bg-purple-500/10" : "opacity-30 cursor-not-allowed"}
                          onClick={() => sendSmsReminder(i)}
                        >
                          <MessageSquare className="h-3 w-3" />
                        </Button>
                      )}
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
          {viewing && (() => {
            const vPayStatus: PaymentStatus = viewing.payment_status ?? (viewing.status === "paid" ? "paid" : "unpaid");
            const vSt = PAY_STATUS_STYLES[vPayStatus] ?? PAY_STATUS_STYLES.unpaid;
            return (
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
                        <div className="font-semibold text-emerald-400 mb-1">↓ Issued ({(viewing.issued_cylinder_numbers ?? []).length})</div>
                        <div className="flex flex-wrap gap-1">{(viewing.issued_cylinder_numbers ?? []).map((n: number) => <span key={n} className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold font-mono">#{n}</span>)}</div>
                      </div>
                      <div>
                        <div className="font-semibold text-amber-400 mb-1">↑ Returned ({(viewing.returned_cylinder_numbers ?? []).length})</div>
                        <div className="flex flex-wrap gap-1">{(viewing.returned_cylinder_numbers ?? []).map((n: number) => <span key={n} className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-bold font-mono">#{n}</span>)}</div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-3 rounded-lg bg-secondary/50 space-y-1.5 font-mono text-sm">
                  <AmtRow k="Taxable" v={Number(viewing.taxable_amount)} />
                  {Number(viewing.discount) > 0 && <AmtRow k="Discount" v={-Number(viewing.discount)} />}
                  <AmtRow k={`CGST @ ${viewing.cgst_rate}%`} v={Number(viewing.cgst_amount)} />
                  <AmtRow k={`SGST @ ${viewing.sgst_rate}%`} v={Number(viewing.sgst_amount)} />
                  {Number(viewing.roundoff) !== 0 && <AmtRow k="Round off" v={Number(viewing.roundoff)} />}
                  <div className="border-t border-border/60 pt-2"><AmtRow k="TOTAL" v={Number(viewing.total)} bold big /></div>
                </div>
                {/* Payment status */}
                <div className={cn("rounded-lg border px-4 py-3 flex items-center justify-between", vSt.bg, `border-current`)}>
                  <div className={cn("flex items-center gap-2 font-semibold text-sm", vSt.text)}>
                    <vSt.icon className="h-4 w-4" />
                    {vSt.label}
                    {viewing.payment_date && <span className="font-mono text-xs opacity-70">· {new Date(viewing.payment_date).toLocaleDateString("en-IN")}</span>}
                  </div>
                  {Number(viewing.balance_amount) > 0 && (
                    <span className="text-rose-400 font-mono font-bold text-sm">Balance: ₹{Number(viewing.balance_amount).toLocaleString()}</span>
                  )}
                </div>
                <Button onClick={() => window.print()} variant="outline" className="w-full"><Printer className="h-4 w-4 mr-2" />Print Invoice</Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Bulk SMS Reminder Modal ── */}
      <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-400">
              <MessageSquare className="h-5 w-5" />
              SMS Reminders
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Info banner */}
            <div className="rounded-xl bg-purple-500/10 border border-purple-500/30 px-4 py-3 text-sm text-purple-300 space-y-1">
              <p className="font-semibold">📱 How it works (100% Free)</p>
              <p className="text-xs text-purple-300/70">Tap <strong>Send SMS</strong> on any row — your phone's SMS app will open with the message pre-filled. Just hit send. No internet required, no third-party service, completely free.</p>
            </div>

            {/* Bulk copy */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {items.filter((i) => i.status !== "paid").length} pending invoice(s)
              </span>
              <Button variant="outline" size="sm" onClick={copyAllSms} className="gap-2 text-xs">
                <Copy className="h-3.5 w-3.5" /> Copy All Messages
              </Button>
            </div>

            {/* List */}
            {items.filter((i) => i.status !== "paid").length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">🎉 All invoices are paid!</div>
            ) : (
              <div className="space-y-3">
                {items.filter((i) => i.status !== "paid").map((i) => {
                  const payStatus: PaymentStatus = i.payment_status ?? "unpaid";
                  const st = PAY_STATUS_STYLES[payStatus] ?? PAY_STATUS_STYLES.unpaid;
                  const balance = Number(i.balance_amount ?? i.total ?? i.amount ?? 0);
                  const phone = i.customers?.phone;
                  const msg = buildSmsMessage(i, company);
                  return (
                    <div key={i.id} className="rounded-xl border border-border/50 bg-secondary/20 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-sm">{i.customers?.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{i.invoice_number} · {phone ?? <span className="text-rose-400">No phone</span>}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold", st.bg, st.text)}>
                            <st.icon className="h-2.5 w-2.5" />{st.label}
                          </span>
                          <span className="text-rose-400 font-mono font-bold text-xs">₹{balance.toLocaleString()}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2 leading-relaxed">{msg}</p>
                      <div className="flex gap-2">
                        {phone ? (
                          <a
                            href={smsLink(phone, msg)}
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-purple-500/15 border border-purple-500/40 text-purple-400 text-xs font-bold py-2 hover:bg-purple-500/25 transition-colors"
                          >
                            <Send className="h-3 w-3" /> Send SMS to {phone}
                          </a>
                        ) : (
                          <span className="flex-1 text-center text-xs text-muted-foreground py-2">No phone number saved for this customer</span>
                        )}
                        <Button
                          size="sm" variant="ghost" className="text-xs text-muted-foreground"
                          onClick={() => { navigator.clipboard.writeText(msg); toast.success("Message copied!"); }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
