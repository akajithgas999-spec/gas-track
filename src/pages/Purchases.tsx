import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Truck, Eye, Flame, Circle, CheckCircle2, AlertCircle, Clock, Calendar, CreditCard, DollarSign, ArrowRight, Zap, Layers } from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/hooks/useCompany";

type Line = {
  cylinder_number: string;
  serial_number: string;
  type_id: string;
  hsn_code: string;
  rate: string;
  fill_status: "filled" | "empty";
};

type PaymentStatus = "paid" | "partial" | "unpaid";

export type PaymentInstallment = {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  method: string;
  notes?: string;
};

function parseBatchCylinderNumbers(input: string): number[] {
  const result: Set<number> = new Set();
  const parts = input.split(/[,;\n\s]+/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const rangeMatch = trimmed.match(/^(\d+)\s*(?:-|to|\.\.)\s*(\d+)$/i);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let n = min; n <= max; n++) {
          result.add(n);
        }
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num > 0) {
        result.add(num);
      }
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

function getPaymentHistory(p: any): { 
  payments: PaymentInstallment[]; 
  paid: number; 
  balance: number; 
  status: PaymentStatus; 
  firstPayDate: string | null;
  lastPayDate: string | null;
} {
  let payments: PaymentInstallment[] = [];

  if (p.payments && Array.isArray(p.payments) && p.payments.length > 0) {
    payments = p.payments;
  } else if (p.notes && typeof p.notes === "string" && p.notes.includes("__PAYMENTS__:")) {
    try {
      const jsonStr = p.notes.split("__PAYMENTS__:")[1].split("__END_PAYMENTS__")[0];
      payments = JSON.parse(jsonStr);
    } catch (e) {}
  } else {
    const legacyPaid = p.amount_paid !== undefined && p.amount_paid !== null ? Number(p.amount_paid) : (p.payment_status === "unpaid" ? 0 : Number(p.total));
    if (legacyPaid > 0) {
      payments = [{
        id: "p-legacy-1",
        date: p.payment_date || p.bill_date || new Date().toISOString().slice(0, 10),
        amount: legacyPaid,
        method: "Initial Payment",
      }];
    }
  }

  const total = Number(p.total || 0);
  const paid = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const balance = Math.max(0, total - paid);
  const status: PaymentStatus = balance <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";

  const firstPayDate = payments.length > 0 ? payments[0].date : (p.payment_date || null);
  const lastPayDate = payments.length > 0 ? payments[payments.length - 1].date : (p.payment_date || null);

  return { payments, paid, balance, status, firstPayDate, lastPayDate };
}

export default function Purchases() {
  const { company } = useCompany();
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [cylindersCache, setCylindersCache] = useState<Map<number, { serial_number: string; type_id?: string }>>(new Map());
  
  // Dialog States
  const [open, setOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);

  // Batch Add Cylinders Multi-Type State
  type BatchRow = { id: string; input: string; type_id: string; rate: string; fill_status: "filled" | "empty" };
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);

  // New Payment Installment Modal State
  const [payModalItem, setPayModalItem] = useState<any | null>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("UPI / GPay / PhonePe");
  const [payNotes, setPayNotes] = useState("");

  const [supplier, setSupplier] = useState({ name: "", phone: "", gst_number: "", address: "" });
  const [form, setForm] = useState({
    supplier_id: "",
    bill_number: "",
    bill_date: new Date().toISOString().slice(0, 10),
    payment_date: new Date().toISOString().slice(0, 10),
    challan_number: "",
    challan_date: "",
    gst_number: "",
    discount: "0",
    cgst_rate: "9",
    sgst_rate: "9",
    payment_status: "paid" as PaymentStatus,
    amount_paid: "0",
    payment_method: "Cash",
    notes: "",
  });
  const [lines, setLines] = useState<Line[]>([]);

  const load = async () => {
    const { data } = await (supabase.from("purchases") as any)
      .select("*, suppliers(name, gst_number), purchase_items(serial_number, cylinder_number, fill_status)")
      .eq("company", company)
      .order("bill_date", { ascending: false });
    setItems(data ?? []);
  };

  const loadCylindersCache = async () => {
    const { data } = await (supabase.from("cylinders") as any).select("cylinder_number, serial_number, type_id");
    const map = new Map<number, { serial_number: string; type_id?: string }>();
    if (data) {
      for (const c of data) {
        if (c.cylinder_number && c.serial_number) {
          map.set(Number(c.cylinder_number), { serial_number: c.serial_number, type_id: c.type_id });
        }
      }
    }
    setCylindersCache(map);
  };

  useEffect(() => {
    load();
    loadCylindersCache();
    (supabase.from("suppliers") as any).select("*").eq("company", company).order("name").then(({ data }: any) => setSuppliers(data ?? []));
    supabase.from("cylinder_types").select("*").then(({ data }) => setTypes(data ?? []));
  }, [company]);

  useEffect(() => {
    const s = suppliers.find((x) => x.id === form.supplier_id);
    if (s) setForm((f) => ({ ...f, gst_number: s.gst_number ?? "" }));
  }, [form.supplier_id, suppliers]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + Number(l.rate || 0), 0);
    const discount = Number(form.discount) || 0;
    const taxable = Math.max(0, subtotal - discount);
    const cgst = (taxable * (Number(form.cgst_rate) || 0)) / 100;
    const sgst = (taxable * (Number(form.sgst_rate) || 0)) / 100;
    const gross = taxable + cgst + sgst;
    const total = Math.round(gross);
    const roundoff = +(total - gross).toFixed(2);

    let paid = total;
    if (form.payment_status === "unpaid") {
      paid = 0;
    } else if (form.payment_status === "partial") {
      paid = Math.min(total, Math.max(0, Number(form.amount_paid) || 0));
    }
    const balance = Math.max(0, total - paid);

    return { subtotal, discount, taxable, cgst, sgst, total, roundoff, paid, balance };
  }, [lines, form]);

  const resetForm = () => {
    const today = new Date().toISOString().slice(0, 10);
    setForm({
      supplier_id: "", bill_number: "",
      bill_date: today, payment_date: today,
      challan_number: "", challan_date: "", gst_number: "",
      discount: "0", cgst_rate: "9", sgst_rate: "9",
      payment_status: "paid", amount_paid: "0", payment_method: "Cash", notes: "",
    });
    setLines([]);
  };

  const addLine = () => setLines([...lines, {
    cylinder_number: "", serial_number: "", type_id: types[0]?.id ?? "", hsn_code: "",
    rate: "", fill_status: "filled",
  }]);

  const openBatchModal = () => {
    const initialType = types[0]?.id ?? "";
    const selType = types.find((t) => t.id === initialType);
    setBatchRows([
      {
        id: "b-1",
        input: "",
        type_id: initialType,
        rate: selType?.price ? String(selType.price) : "",
        fill_status: "filled",
      },
    ]);
    setBatchOpen(true);
  };

  const addBatchRow = () => {
    const defaultType = types[batchRows.length % types.length]?.id ?? types[0]?.id ?? "";
    const selType = types.find((t) => t.id === defaultType);
    setBatchRows((curr) => [
      ...curr,
      {
        id: `b-${Date.now()}-${curr.length + 1}`,
        input: "",
        type_id: defaultType,
        rate: selType?.price ? String(selType.price) : "",
        fill_status: "filled",
      },
    ]);
  };

  const updateBatchRow = (idx: number, patch: Partial<BatchRow>) => {
    setBatchRows((curr) =>
      curr.map((r, i) => {
        if (i !== idx) return r;
        const merged = { ...r, ...patch };
        if (patch.type_id) {
          const selType = types.find((t) => t.id === patch.type_id);
          if (selType && !merged.rate) {
            merged.rate = String(selType.price || 0);
          }
        }
        return merged;
      })
    );
  };

  const removeBatchRow = (idx: number) => {
    if (batchRows.length > 1) {
      setBatchRows((curr) => curr.filter((_, i) => i !== idx));
    }
  };

  const addBatchCylinders = () => {
    const allNewLines: Line[] = [];
    let totalCount = 0;

    for (let idx = 0; idx < batchRows.length; idx++) {
      const row = batchRows[idx];
      if (!row.type_id) return toast.error(`Select cylinder type for Batch #${idx + 1}`);
      const cylNums = parseBatchCylinderNumbers(row.input);
      if (cylNums.length === 0) {
        if (batchRows.length === 1) return toast.error("Enter valid cylinder numbers or ranges (e.g. 101-130)");
        continue;
      }

      const selType = types.find((t) => t.id === row.type_id);
      const rateToUse = row.rate.trim() || (selType?.price ? String(selType.price) : "0");
      const hsnToUse = selType?.hsn_code ?? "";

      for (const num of cylNums) {
        let serial = "";
        if (cylindersCache.has(num)) {
          serial = cylindersCache.get(num)!.serial_number;
        } else {
          serial = `CYL-${String(num).padStart(4, "0")}`;
        }
        allNewLines.push({
          cylinder_number: String(num),
          serial_number: serial,
          type_id: row.type_id,
          hsn_code: hsnToUse,
          rate: rateToUse,
          fill_status: row.fill_status,
        });
      }
      totalCount += cylNums.length;
    }

    if (allNewLines.length === 0) return toast.error("Enter valid cylinder numbers or ranges (e.g. 101-130)");

    setLines((curr) => [...curr, ...allNewLines]);
    toast.success(`Added ${totalCount} cylinders across ${batchRows.length} gas type(s) to purchase bill ✓`);
    setBatchOpen(false);
  };

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((curr) => curr.map((l, i) => {
      if (i !== idx) return l;
      const merged = { ...l, ...patch };

      if (patch.cylinder_number !== undefined) {
        const cNum = parseInt(patch.cylinder_number.trim(), 10);
        if (!isNaN(cNum) && cylindersCache.has(cNum)) {
          const cached = cylindersCache.get(cNum)!;
          merged.serial_number = cached.serial_number;
          if (!merged.type_id && cached.type_id) {
            merged.type_id = cached.type_id;
          }
        }
      }

      if (patch.type_id) {
        const t = types.find((x) => x.id === patch.type_id);
        if (t) {
          if (!merged.hsn_code) merged.hsn_code = t.hsn_code ?? "";
          if (!merged.rate) merged.rate = String(Number(t.price) || 0);
        }
      }
      return merged;
    }));
  };

  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));

  const saveSupplier = async () => {
    if (!supplier.name.trim()) return toast.error("Name required");
    const { data, error } = await supabase.from("suppliers").insert({
      name: supplier.name.trim(),
      phone: supplier.phone.trim() || null,
      gst_number: supplier.gst_number.trim() || null,
      address: supplier.address.trim() || null,
      company,
    } as any).select().single();
    if (error) return toast.error(error.message);
    setSuppliers([...suppliers, data]);
    setForm({ ...form, supplier_id: data.id });
    setSupplier({ name: "", phone: "", gst_number: "", address: "" });
    setSupplierOpen(false);
    toast.success("Supplier added");
  };

  const save = async () => {
    if (!form.supplier_id) return toast.error("Pick supplier");
    if (lines.length === 0) return toast.error("Add at least one cylinder");
    for (const l of lines) {
      if (!l.type_id) return toast.error("Each line needs a cylinder type");
      if (!l.serial_number.trim() && !l.cylinder_number.trim()) return toast.error("Each line needs a serial number or cylinder number");
    }

    const initialPayments: PaymentInstallment[] = [];
    if (totals.paid > 0) {
      initialPayments.push({
        id: `p-${Date.now()}-1`,
        date: form.payment_date || form.bill_date,
        amount: totals.paid,
        method: form.payment_method || "Cash",
        notes: form.payment_status === "partial" ? "1st Partial Payment" : "Full Payment",
      });
    }

    const cleanNotes = form.notes.trim();
    const paymentsJson = `__PAYMENTS__:${JSON.stringify(initialPayments)}__END_PAYMENTS__`;
    const formattedNotes = cleanNotes ? `${cleanNotes}\n${paymentsJson}` : paymentsJson;

    const payload: any = {
      supplier_id: form.supplier_id,
      bill_number: form.bill_number || null,
      bill_date: form.bill_date,
      challan_number: form.challan_number || null,
      challan_date: form.challan_date || null,
      gst_number: form.gst_number || null,
      taxable_amount: totals.taxable,
      discount: totals.discount,
      cgst_rate: Number(form.cgst_rate) || 0,
      cgst_amount: totals.cgst,
      sgst_rate: Number(form.sgst_rate) || 0,
      sgst_amount: totals.sgst,
      roundoff: totals.roundoff,
      total: totals.total,
      notes: formattedNotes,
      payment_status: totals.balance === 0 ? "paid" : totals.paid > 0 ? "partial" : "unpaid",
      amount_paid: totals.paid,
      balance_amount: totals.balance,
      payment_date: totals.paid > 0 ? (form.payment_date || form.bill_date) : null,
      payments: initialPayments,
      company,
    };

    let { data: pur, error } = await supabase.from("purchases").insert(payload).select().single();
    if (error && error.message.includes("column")) {
      delete payload.payment_status;
      delete payload.amount_paid;
      delete payload.balance_amount;
      delete payload.payment_date;
      delete payload.payments;
      const res = await supabase.from("purchases").insert(payload).select().single();
      pur = res.data;
      error = res.error;
    }

    if (error || !pur) return toast.error(error?.message ?? "Failed to save purchase");

    const cgstRate = Number(form.cgst_rate) || 0;
    const sgstRate = Number(form.sgst_rate) || 0;
    const itemRows = [];
    const newCache = new Map(cylindersCache);

    for (const l of lines) {
      const cylNum = l.cylinder_number.trim() ? parseInt(l.cylinder_number.trim(), 10) : null;
      const serialNum = l.serial_number.trim() || (cylNum ? `CYL-${String(cylNum).padStart(4, "0")}` : "");

      if (cylNum && serialNum) {
        newCache.set(cylNum, { serial_number: serialNum, type_id: l.type_id });
      }

      let cylinderId: string | null = null;
      if (cylNum) {
        const { data: existing } = await (supabase.from("cylinders") as any).select("id").eq("cylinder_number", cylNum).maybeSingle();
        if (existing) {
          cylinderId = existing.id;
          await supabase.from("cylinders").update({
            status: "in_stock",
            current_customer_id: null,
            fill_status: l.fill_status,
          } as any).eq("id", existing.id);
        } else {
          const { data: created } = await supabase.from("cylinders").insert({
            serial_number: serialNum,
            cylinder_number: cylNum,
            type_id: l.type_id,
            status: "in_stock",
            fill_status: l.fill_status,
          } as any).select().single();
          cylinderId = created?.id ?? null;
        }
      } else {
        const { data: existing } = await supabase.from("cylinders").select("id").eq("serial_number", serialNum).maybeSingle();
        if (existing) {
          cylinderId = existing.id;
          await supabase.from("cylinders").update({
            status: "in_stock",
            current_customer_id: null,
            fill_status: l.fill_status,
          } as any).eq("id", existing.id);
        } else {
          const { data: created } = await supabase.from("cylinders").insert({
            serial_number: serialNum,
            type_id: l.type_id,
            status: "in_stock",
            fill_status: l.fill_status,
          } as any).select().single();
          cylinderId = created?.id ?? null;
        }
      }

      const taxable = Number(l.rate);
      const cg = (taxable * cgstRate) / 100;
      const sg = (taxable * sgstRate) / 100;
      itemRows.push({
        purchase_id: pur.id,
        cylinder_id: cylinderId,
        type_id: l.type_id,
        serial_number: serialNum,
        cylinder_number: cylNum,
        hsn_code: l.hsn_code || null,
        quantity: 1,
        rate: l.rate,
        taxable,
        cgst_amount: cg,
        sgst_amount: sg,
        total: taxable + cg + sg,
        fill_status: l.fill_status,
      });
    }

    if (itemRows.length) await supabase.from("purchase_items").insert(itemRows);
    setCylindersCache(newCache);

    toast.success(`Purchase recorded — ${itemRows.length} cylinder(s) added to stock`);
    setOpen(false);
    resetForm();
    load();
  };

  const openPaymentModal = (item: any) => {
    const history = getPaymentHistory(item);
    setPayModalItem(item);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayAmount(String(history.balance));
    setPayMethod("UPI / GPay / PhonePe");
    setPayNotes("2nd Half Payment / Final Settlement");
  };

  const savePaymentInstallment = async () => {
    if (!payModalItem) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return toast.error("Enter valid payment amount");

    const history = getPaymentHistory(payModalItem);
    if (amt > history.balance) {
      return toast.error(`Amount cannot exceed remaining balance of ₹${history.balance.toLocaleString()}`);
    }

    const isFinalHalf = amt >= history.balance;
    const newInstallment: PaymentInstallment = {
      id: `p-${Date.now()}`,
      date: payDate,
      amount: amt,
      method: payMethod,
      notes: payNotes.trim() || (isFinalHalf ? "2nd Half / Final Payment" : "Partial Payment"),
    };

    const updatedPayments = [...history.payments, newInstallment];
    const newPaid = updatedPayments.reduce((s, it) => s + Number(it.amount), 0);
    const totalBill = Number(payModalItem.total || 0);
    const newBalance = Math.max(0, totalBill - newPaid);
    const newStatus: PaymentStatus = newBalance === 0 ? "paid" : "partial";

    const cleanNotes = payModalItem.notes ? payModalItem.notes.split("__PAYMENTS__:")[0].trim() : "";
    const paymentsJson = `__PAYMENTS__:${JSON.stringify(updatedPayments)}__END_PAYMENTS__`;
    const formattedNotes = cleanNotes ? `${cleanNotes}\n${paymentsJson}` : paymentsJson;

    const payload: any = {
      notes: formattedNotes,
      payment_status: newStatus,
      amount_paid: newPaid,
      balance_amount: newBalance,
      payment_date: payDate,
      payments: updatedPayments,
    };

    let { error } = await supabase.from("purchases").update(payload).eq("id", payModalItem.id);
    if (error && error.message.includes("column")) {
      delete payload.payment_status;
      delete payload.amount_paid;
      delete payload.balance_amount;
      delete payload.payment_date;
      delete payload.payments;
      const res = await supabase.from("purchases").update(payload).eq("id", payModalItem.id);
      error = res.error;
    }

    if (error) return toast.error(error.message);

    toast.success(`2nd Half payment of ₹${amt.toLocaleString()} recorded on ${new Date(payDate).toLocaleDateString()}`);
    setPayModalItem(null);
    if (viewing && viewing.id === payModalItem.id) {
      setViewing({ ...viewing, notes: formattedNotes, payments: updatedPayments });
    }
    load();
  };

  const viewDetails = async (p: any) => {
    const { data } = await (supabase.from("purchase_items") as any).select("*").eq("purchase_id", p.id);
    setViewing({ ...p, items: data ?? [] });
  };

  const totalSpend = items.reduce((a, b) => a + Number(b.total), 0);
  const totalPaid = items.reduce((a, b) => a + getPaymentHistory(b).paid, 0);
  const totalBalance = items.reduce((a, b) => a + getPaymentHistory(b).balance, 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-5 bg-card border-border/60">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Total Spend</div>
          <div className="text-2xl font-bold mt-2 font-mono">₹{totalSpend.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{items.length} purchase bills</div>
        </Card>
        <Card className="p-5 bg-card border-border/60">
          <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Amount Paid
          </div>
          <div className="text-2xl font-bold mt-2 font-mono">₹{totalPaid.toLocaleString()}</div>
        </Card>
        <Card className="p-5 bg-card border-border/60">
          <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Balance Due
          </div>
          <div className="text-2xl font-bold mt-2 font-mono">₹{totalBalance.toLocaleString()}</div>
        </Card>
        <Card className="p-5 bg-card border-border/60">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Purchased Cylinders</div>
          <div className="text-2xl font-bold mt-2 font-mono text-primary">
            {items.reduce((a, b) => a + (b.purchase_items ?? []).length, 0)}
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-full sm:w-auto sm:ml-auto flex flex-col sm:flex-row gap-2">
          {/* Add Supplier Dialog */}
          <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
            <DialogTrigger asChild><Button variant="outline" className="w-full sm:w-auto"><Truck className="h-4 w-4 mr-2" />Add supplier</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New supplier</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={supplier.name} onChange={(e) => setSupplier({ ...supplier, name: e.target.value })} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Phone</Label><Input value={supplier.phone} onChange={(e) => setSupplier({ ...supplier, phone: e.target.value })} /></div>
                  <div><Label>GSTIN</Label><Input value={supplier.gst_number} onChange={(e) => setSupplier({ ...supplier, gst_number: e.target.value })} /></div>
                </div>
                <div><Label>Address</Label><Textarea value={supplier.address} onChange={(e) => setSupplier({ ...supplier, address: e.target.value })} /></div>
                <Button onClick={saveSupplier} className="w-full">Save</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* New Purchase Dialog */}
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild><Button onClick={() => { resetForm(); setOpen(true); }} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />New purchase bill</Button></DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New purchase bill / challan</DialogTitle></DialogHeader>
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label>Supplier</Label>
                    <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>GSTIN</Label><Input value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} /></div>
                  <div></div>
                  <div><Label>Bill #</Label><Input value={form.bill_number} onChange={(e) => setForm({ ...form, bill_number: e.target.value })} /></div>
                  <div><Label>Bill date</Label><Input type="date" value={form.bill_date} onChange={(e) => setForm({ ...form, bill_date: e.target.value })} /></div>
                  <div></div>
                  <div><Label>Challan #</Label><Input value={form.challan_number} onChange={(e) => setForm({ ...form, challan_number: e.target.value })} /></div>
                  <div><Label>Challan date</Label><Input type="date" value={form.challan_date} onChange={(e) => setForm({ ...form, challan_date: e.target.value })} /></div>
                  <div></div>
                  <div><Label>CGST %</Label><Input type="number" value={form.cgst_rate} onChange={(e) => setForm({ ...form, cgst_rate: e.target.value })} /></div>
                  <div><Label>SGST %</Label><Input type="number" value={form.sgst_rate} onChange={(e) => setForm({ ...form, sgst_rate: e.target.value })} /></div>
                  <div><Label>Discount (₹)</Label><Input type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></div>
                </div>

                {/* Cylinder lines */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <Label className="text-sm font-bold flex items-center gap-1.5">
                      <span>Cylinders ({lines.length} items in bill)</span>
                    </Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={openBatchModal} className="gap-1.5 border-primary/50 text-primary hover:bg-primary/10 font-bold">
                        <Zap className="h-3.5 w-3.5" /> Batch Add (Ranges / List)
                      </Button>
                      <Button size="sm" variant="outline" onClick={addLine}>
                        <Plus className="h-3 w-3 mr-1" /> Single Cylinder
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {lines.map((l, i) => (
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 rounded-lg border border-border/60 bg-secondary/30">
                        <div className="sm:col-span-3">
                          <Label className="text-[10px]">Cyl #</Label>
                          <Input
                            type="number" min={1}
                            value={l.cylinder_number}
                            onChange={(e) => updateLine(i, { cylinder_number: e.target.value })}
                            placeholder="e.g. 42"
                            className="font-mono"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <Label className="text-[10px]">Serial # (Auto-filled)</Label>
                          <Input value={l.serial_number} onChange={(e) => updateLine(i, { serial_number: e.target.value })} placeholder="CYL-..." />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-[10px]">Type</Label>
                          <Select value={l.type_id} onValueChange={(v) => updateLine(i, { type_id: v })}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.code} — {t.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-1"><Label className="text-[10px]">Rate ₹</Label><Input type="number" value={l.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} /></div>
                        <div className="sm:col-span-2">
                          <Label className="text-[10px]">Fill Status</Label>
                          <div className="flex rounded-md border border-border/60 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => updateLine(i, { fill_status: "filled" })}
                              className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-extrabold transition-all ${
                                l.fill_status === "filled"
                                  ? "bg-foreground text-background shadow-sm ring-1 ring-foreground/60"
                                  : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                              }`}
                            >
                              <Flame className="h-3 w-3" /> Filled
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLine(i, { fill_status: "empty" })}
                              className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-extrabold transition-all ${
                                l.fill_status === "empty"
                                  ? "bg-foreground text-background shadow-sm ring-1 ring-foreground/60"
                                  : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                              }`}
                            >
                              <Circle className="h-3 w-3" /> Empty
                            </button>
                          </div>
                        </div>
                        <div className="sm:col-span-1"><Button variant="ghost" size="icon" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                      </div>
                    ))}
                    {lines.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No cylinders added yet. Click "Add cylinder".</p>}
                  </div>
                </div>

                {/* Initial Payment Setup */}
                <div className="p-4 rounded-lg bg-card border border-border/80 space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Initial Payment Setup</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">Payment Status</Label>
                      <Select
                        value={form.payment_status}
                        onValueChange={(v: PaymentStatus) => {
                          setForm((f) => ({
                            ...f,
                            payment_status: v,
                            amount_paid: v === "paid" ? String(totals.total) : v === "unpaid" ? "0" : f.amount_paid,
                          }));
                        }}
                      >
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paid">Fully Paid</SelectItem>
                          <SelectItem value="partial">Partial Paid (1st Half)</SelectItem>
                          <SelectItem value="unpaid">Unpaid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> 1st Half Paid Date
                      </Label>
                      <Input
                        type="date"
                        disabled={form.payment_status === "unpaid"}
                        value={form.payment_date}
                        onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">1st Half Amount Paid (₹)</Label>
                      <Input
                        type="number"
                        disabled={form.payment_status === "paid" || form.payment_status === "unpaid"}
                        value={form.payment_status === "paid" ? totals.total : form.payment_status === "unpaid" ? 0 : form.amount_paid}
                        onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
                        className="mt-1 font-mono font-bold"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Payment Method</Label>
                      <Select
                        value={form.payment_method}
                        onValueChange={(v) => setForm({ ...form, payment_method: v })}
                      >
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="UPI / GPay / PhonePe">UPI / GPay / PhonePe</SelectItem>
                          <SelectItem value="Bank Transfer / NEFT">Bank Transfer / NEFT</SelectItem>
                          <SelectItem value="Cheque">Cheque</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {form.payment_status === "partial" && (
                    <div className="p-3 rounded-md bg-secondary/40 border border-border/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span className="font-semibold">2nd Half Balance Due: <b>₹{totals.balance.toLocaleString()}</b></span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">Record 2nd Half payment anytime with date selection in the table!</span>
                    </div>
                  )}
                </div>

                {/* Totals Summary */}
                <div className="p-4 rounded-lg bg-secondary/50 space-y-1.5 font-mono text-sm">
                  <Row k="Subtotal" v={totals.subtotal} />
                  <Row k="Discount" v={-totals.discount} />
                  <Row k="Taxable" v={totals.taxable} bold />
                  <Row k={`CGST @ ${form.cgst_rate}%`} v={totals.cgst} />
                  <Row k={`SGST @ ${form.sgst_rate}%`} v={totals.sgst} />
                  <Row k="Round off" v={totals.roundoff} />
                  <div className="border-t border-border/60 mt-2 pt-2">
                    <Row k="TOTAL BILL" v={totals.total} bold big />
                  </div>
                  <div className="flex justify-between text-xs pt-1 font-semibold">
                    <span>1st Half Paid</span>
                    <span>₹{totals.paid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span>2nd Half Remaining</span>
                    <span>₹{totals.balance.toLocaleString()}</span>
                  </div>
                </div>

                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." /></div>
                <Button onClick={save} className="w-full h-11 text-sm font-bold uppercase tracking-wider">Save purchase bill</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Purchase list table with Paid Dates (1st / 2nd Half) */}
      <Card className="bg-card border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Purchase #</th>
                <th className="text-left px-4 py-3">Bill / Challan</th>
                <th className="text-left px-4 py-3">Bill Date</th>
                <th className="text-left px-4 py-3">Supplier</th>
                <th className="text-left px-4 py-3">Cylinder #s</th>
                <th className="text-center px-4 py-3">Payment Status</th>
                <th className="text-center px-4 py-3">Paid Dates (1st & 2nd Half)</th>
                <th className="text-right px-4 py-3">Bill Total</th>
                <th className="text-right px-4 py-3">Total Paid</th>
                <th className="text-right px-4 py-3">Balance</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const pItems: any[] = p.purchase_items ?? [];
                const cylNums = pItems.map((it: any) => it.cylinder_number).filter(Boolean).sort((a: number, b: number) => a - b);
                const history = getPaymentHistory(p);
                const p1 = history.payments[0];
                const p2 = history.payments.length > 1 ? history.payments[1] : null;

                return (
                  <tr key={p.id} className="border-t border-border/40 hover:bg-secondary/30">
                    <td className="px-4 py-3 font-mono font-semibold text-primary">{p.purchase_number}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {p.bill_number ?? "—"}
                      {p.challan_number && <div className="text-muted-foreground">CH: {p.challan_number}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{new Date(p.bill_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{p.suppliers?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {cylNums.slice(0, 5).map((n: number) => (
                          <span key={n} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary">#{n}</span>
                        ))}
                        {cylNums.length > 5 && <span className="text-[10px] text-muted-foreground">+{cylNums.length - 5} more</span>}
                        {cylNums.length === 0 && pItems.length > 0 && <span className="text-xs text-muted-foreground">{pItems.length} cyl(s)</span>}
                        {pItems.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {history.status === "paid" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-foreground/10 text-foreground border border-foreground/20">
                          <CheckCircle2 className="h-3 w-3" /> Fully Paid
                        </span>
                      ) : history.status === "partial" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-foreground/10 text-foreground border border-foreground/20">
                          <Clock className="h-3 w-3" /> Partial Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-foreground/10 text-foreground border border-foreground/20">
                          <AlertCircle className="h-3 w-3" /> Unpaid
                        </span>
                      )}
                    </td>

                    {/* Paid Dates Column with Color-coded 1st Half vs 2nd Half */}
                    <td className="px-4 py-3 text-center font-mono text-xs">
                      {history.payments.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          {/* 1st Payment Date Badge */}
                          {p1 && (
                            <span className="inline-flex items-center gap-1 font-bold text-[10px] bg-foreground/10 text-foreground border border-foreground/20 px-2 py-0.5 rounded-md">
                              <Calendar className="h-2.5 w-2.5" />
                              1st: {new Date(p1.date).toLocaleDateString()} (₹{p1.amount.toLocaleString()})
                            </span>
                          )}

                          {/* 2nd / Final Payment Date Badge */}
                          {p2 ? (
                            <span className="inline-flex items-center gap-1 font-bold text-[10px] bg-foreground/10 text-foreground border border-foreground/20 px-2 py-0.5 rounded-md">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              2nd: {new Date(p2.date).toLocaleDateString()} (₹{p2.amount.toLocaleString()})
                            </span>
                          ) : history.balance > 0 ? (
                            /* Quick Clickable 2nd Half Pay Button directly inside cell */
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPaymentModal(p)}
                              className="h-6 px-2 text-[10px] font-extrabold border-border bg-secondary/60 text-foreground hover:bg-foreground hover:text-background transition-all"
                            >
                              <Plus className="h-2.5 w-2.5 mr-0.5" />
                              Pay 2nd Half (₹{history.balance.toLocaleString()})
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-semibold">₹{Number(p.total).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">₹{history.paid.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {history.balance > 0 ? (
                        <span>₹{history.balance.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">₹0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {history.balance > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPaymentModal(p)}
                            className="h-8 px-2 text-[11px] font-bold border-border text-foreground bg-secondary/60 hover:bg-foreground hover:text-background transition-all"
                          >
                            <Calendar className="h-3 w-3 mr-1" />
                            2nd Half
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => viewDetails(p)}><Eye className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">No purchases recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Record 2nd Half Payment Installment Modal */}
      <Dialog open={!!payModalItem} onOpenChange={(v) => !v && setPayModalItem(null)}>
        <DialogContent className="max-w-md border-border/60">
          {payModalItem && (() => {
            const history = getPaymentHistory(payModalItem);

            return (
              <div className="space-y-4">
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" /> Record 2nd Half Payment
                    </span>
                    <span className="text-xs font-mono text-primary">{payModalItem.purchase_number}</span>
                  </DialogTitle>
                </DialogHeader>

                <div className="p-3.5 rounded-lg bg-secondary/60 space-y-1.5 text-xs font-mono border border-border/60">
                  <div className="flex justify-between"><span>Total Bill Amount:</span><b>₹{Number(payModalItem.total).toLocaleString()}</b></div>
                  <div className="flex justify-between">
                    <span>1st Half Paid ({history.firstPayDate ? new Date(history.firstPayDate).toLocaleDateString() : "Initial"}):</span>
                    <b>₹{history.paid.toLocaleString()}</b>
                  </div>
                  <div className="flex justify-between font-bold border-t border-border/40 pt-1.5 mt-1 text-sm">
                    <span>2nd Half Remaining Balance:</span><b>₹{history.balance.toLocaleString()}</b>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* 2nd Half Payment Date Calendar Picker */}
                  <div>
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      2nd Half Payment Date (Calendar)
                    </Label>
                    <Input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="mt-1 font-mono font-bold"
                    />
                  </div>

                  {/* 2nd Half Payment Amount */}
                  <div>
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5" />
                      2nd Half Payment Amount (₹)
                    </Label>
                    <Input
                      type="number"
                      max={history.balance}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder={`Max ₹${history.balance}`}
                      className="mt-1 font-mono font-bold text-base"
                    />
                  </div>

                  {/* Payment Method */}
                  <div>
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5" />
                      Payment Method
                    </Label>
                    <Select value={payMethod} onValueChange={setPayMethod}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UPI / GPay / PhonePe">UPI / GPay / PhonePe</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Bank Transfer / NEFT">Bank Transfer / NEFT</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Payment Notes */}
                  <div>
                    <Label className="text-xs font-semibold">Notes / Reference</Label>
                    <Input
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      placeholder="e.g. 2nd half payment via GPay"
                      className="mt-1 text-xs"
                    />
                  </div>
                </div>

                <Button onClick={savePaymentInstallment} className="w-full h-11 font-extrabold uppercase tracking-wider">
                  Confirm & Save 2nd Half Payment
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Purchase detail dialog with Color-Coded 1st and 2nd Payment Breakdown */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {viewing && (() => {
            const history = getPaymentHistory(viewing);
            const cleanNotes = viewing.notes ? viewing.notes.split("__PAYMENTS__:")[0].trim() : "";

            return (
              <div className="space-y-5">
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between">
                    <span>{viewing.purchase_number}</span>
                    {history.status === "paid" ? (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-foreground/10 text-foreground border border-foreground/20">Fully Paid</span>
                    ) : history.status === "partial" ? (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-foreground/10 text-foreground border border-foreground/20">Partial Paid</span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-foreground/10 text-foreground border border-foreground/20">Unpaid</span>
                    )}
                  </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-2 text-xs border-b border-border/40 pb-3">
                  <div><b>Supplier:</b> {viewing.suppliers?.name}</div>
                  <div><b>Bill Date:</b> {new Date(viewing.bill_date).toLocaleDateString()}</div>
                  <div><b>Bill #:</b> {viewing.bill_number ?? "—"}</div>
                  <div><b>Challan #:</b> {viewing.challan_number ?? "—"}</div>
                </div>

                {/* Color-Coded 1st & 2nd Payment Installments Breakdown */}
                <div className="p-4 rounded-lg bg-card border border-border/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      Payment History & Dates ({history.payments.length} entries)
                    </Label>
                    {history.balance > 0 && (
                      <Button
                        size="sm"
                        onClick={() => openPaymentModal(viewing)}
                        className="h-7 px-3 text-xs font-extrabold"
                      >
                        + Pay 2nd Half (₹{history.balance.toLocaleString()})
                      </Button>
                    )}
                  </div>

                  {history.payments.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center">No payments recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {history.payments.map((p, idx) => {
                        const isSecondHalf = idx >= 1;
                        return (
                          <div
                            key={p.id || idx}
                            className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/30 text-xs transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full flex items-center justify-center font-extrabold text-xs shrink-0 bg-foreground/10 text-foreground">
                                {isSecondHalf ? "2nd" : "1st"}
                              </div>
                              <div>
                                <div className="font-bold flex items-center gap-2">
                                  <span className="font-mono">{new Date(p.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-background/60">{p.method}</span>
                                </div>
                                {p.notes && <div className="text-[11px] opacity-80 mt-0.5">{p.notes}</div>}
                              </div>
                            </div>
                            <div className="font-mono font-extrabold text-sm">
                              +₹{Number(p.amount).toLocaleString()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Cylinder items */}
                <div className="border-t border-border/40 pt-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Purchased Cylinders</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground border-b border-border/30">
                        <tr>
                          <th className="text-left py-1.5">Cyl #</th>
                          <th className="text-left py-1.5">Serial</th>
                          <th className="text-left py-1.5">Fill Status</th>
                          <th className="text-right py-1.5">Rate</th>
                          <th className="text-right py-1.5">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(viewing.items ?? []).map((it: any) => (
                          <tr key={it.id} className="border-t border-border/30">
                            <td className="py-2 font-mono font-bold text-primary">{it.cylinder_number ? `#${it.cylinder_number}` : "—"}</td>
                            <td className="py-2 font-mono text-muted-foreground">{it.serial_number}</td>
                            <td className="py-2">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-foreground/10 text-foreground border border-foreground/15">
                                {it.fill_status === "filled" ? "Filled" : "Empty"}
                              </span>
                            </td>
                            <td className="py-2 text-right font-mono">₹{Number(it.rate).toLocaleString()}</td>
                            <td className="py-2 text-right font-mono font-bold">₹{Number(it.total).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="p-4 rounded-lg bg-secondary/50 space-y-1.5 font-mono text-sm">
                  <Row k="Taxable Amount" v={Number(viewing.taxable_amount)} />
                  <Row k={`CGST @ ${viewing.cgst_rate}%`} v={Number(viewing.cgst_amount)} />
                  <Row k={`SGST @ ${viewing.sgst_rate}%`} v={Number(viewing.sgst_amount)} />
                  <Row k="Round off" v={Number(viewing.roundoff)} />
                  <div className="border-t border-border/60 mt-2 pt-2"><Row k="TOTAL BILL" v={Number(viewing.total)} bold big /></div>
                  <div className="flex justify-between text-xs pt-1 font-bold">
                    <span>Total Paid So Far</span>
                    <span>₹{history.paid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold">
                    <span>Balance Remaining</span>
                    <span>₹{history.balance.toLocaleString()}</span>
                  </div>
                </div>

                {cleanNotes && (
                  <div className="text-xs bg-muted/40 p-3 rounded-md border border-border/40">
                    <span className="font-bold">Notes: </span> {cleanNotes}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Batch Add Cylinders Dialog */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary text-lg">
              <Zap className="h-5 w-5" /> Batch Add Cylinders (Multi-Type Purchase)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="rounded-xl bg-secondary/30 p-3 border border-border/50 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">⚡ Multi-Type Batch Entry:</p>
              <p>You can add different cylinder types in one purchase bill (e.g., 10 N2O, 15 CO2, 25 MO2). Enter ranges for each type below or click <strong>+ Add Another Type Batch</strong>.</p>
            </div>

            <div className="space-y-4">
              {batchRows.map((row, idx) => {
                const parsed = parseBatchCylinderNumbers(row.input);
                return (
                  <div key={row.id || idx} className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3.5 relative">
                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <span className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5" /> Batch Row #{idx + 1}
                        {parsed.length > 0 && (
                          <span className="bg-emerald-500/15 text-emerald-400 font-mono font-extrabold text-[10px] px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                            {parsed.length} cylinders
                          </span>
                        )}
                      </span>
                      {batchRows.length > 1 && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeBatchRow(idx)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Row
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs font-semibold">Gas / Cylinder Type *</Label>
                        <Select
                          value={row.type_id}
                          onValueChange={(v) => updateBatchRow(idx, { type_id: v })}
                        >
                          <SelectTrigger className="mt-1 h-9.5 text-xs font-medium"><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            {types.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                <span className="font-bold font-mono">{t.code}</span>
                                <span className="text-muted-foreground ml-1 font-normal">— {t.name}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs font-semibold">Rate per Cylinder (₹)</Label>
                        <Input
                          type="number"
                          value={row.rate}
                          onChange={(e) => updateBatchRow(idx, { rate: e.target.value })}
                          placeholder="1200"
                          className="mt-1 h-9.5 font-mono text-xs"
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-semibold mb-1 block">Fill Status</Label>
                        <div className="flex h-9.5 rounded-md border border-border/60 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => updateBatchRow(idx, { fill_status: "filled" })}
                            className={`flex-1 flex items-center justify-center gap-1 text-xs font-bold transition-all ${
                              row.fill_status === "filled"
                                ? "bg-foreground text-background shadow-sm"
                                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                            }`}
                          >
                            <Flame className="h-3.5 w-3.5" /> Filled
                          </button>
                          <button
                            type="button"
                            onClick={() => updateBatchRow(idx, { fill_status: "empty" })}
                            className={`flex-1 flex items-center justify-center gap-1 text-xs font-bold transition-all ${
                              row.fill_status === "empty"
                                ? "bg-foreground text-background shadow-sm"
                                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                            }`}
                          >
                            <Circle className="h-3.5 w-3.5" /> Empty
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Cylinder Numbers / Ranges *</Label>
                      <Textarea
                        value={row.input}
                        onChange={(e) => updateBatchRow(idx, { input: e.target.value })}
                        placeholder="e.g. 101-110 or 101, 102, 103"
                        rows={2}
                        className="font-mono text-xs mt-1"
                      />
                    </div>

                    {row.input.trim() && (
                      <div className="text-[11px] font-mono font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-1.5 rounded-md flex items-center gap-1.5">
                        {parsed.length === 0 ? (
                          <span className="text-rose-400">⚠️ Enter numbers like 101-110 or 101, 102</span>
                        ) : (
                          <span>
                            ✅ <strong>{parsed.length} cylinders parsed:</strong>{" "}
                            {parsed.length > 8
                              ? `${parsed.slice(0, 5).map((n) => `#${n}`).join(", ")} ... ${parsed.slice(-2).map((n) => `#${n}`).join(", ")}`
                              : parsed.map((n) => `#${n}`).join(", ")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button variant="outline" size="sm" onClick={addBatchRow} className="gap-1.5 text-xs font-semibold">
                <Plus className="h-3.5 w-3.5" /> + Add Another Gas Type Batch
              </Button>
              {(() => {
                const grandTotal = batchRows.reduce(
                  (sum, r) => sum + parseBatchCylinderNumbers(r.input).length,
                  0
                );
                return (
                  <span className="text-xs font-mono font-bold text-primary">
                    Total: {grandTotal} cylinders in this batch
                  </span>
                );
              })()}
            </div>

            <Button onClick={addBatchCylinders} className="w-full h-11 text-sm font-bold uppercase tracking-wider gap-2">
              <Zap className="h-4 w-4" /> Add All Multi-Type Batches to Purchase Bill
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v, bold, big }: { k: string; v: number; bold?: boolean; big?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""} ${big ? "text-base" : ""}`}>
      <span>{k}</span>
      <span>₹{v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  );
}
