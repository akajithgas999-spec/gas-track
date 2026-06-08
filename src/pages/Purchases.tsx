import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Truck, Eye, Flame, Circle } from "lucide-react";
import { toast } from "sonner";

type Line = {
  cylinder_number: string; // 1-2000
  serial_number: string;
  type_id: string;
  hsn_code: string;
  quantity: number;
  rate: number;
  fill_status: "filled" | "empty";
};

export default function Purchases() {
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);

  const [supplier, setSupplier] = useState({ name: "", phone: "", gst_number: "", address: "" });
  const [form, setForm] = useState({
    supplier_id: "",
    bill_number: "",
    bill_date: new Date().toISOString().slice(0, 10),
    challan_number: "",
    challan_date: "",
    gst_number: "",
    discount: "0",
    cgst_rate: "9",
    sgst_rate: "9",
    notes: "",
  });
  const [lines, setLines] = useState<Line[]>([]);

  const load = async () => {
    const { data } = await (supabase
      .from("purchases") as any)
      .select("*, suppliers(name, gst_number), purchase_items(serial_number, cylinder_number, fill_status)")
      .order("bill_date", { ascending: false });
    setItems(data ?? []);
  };

  useEffect(() => {
    load();
    supabase.from("suppliers").select("*").order("name").then(({ data }) => setSuppliers(data ?? []));
    supabase.from("cylinder_types").select("*").then(({ data }) => setTypes(data ?? []));
  }, []);

  useEffect(() => {
    const s = suppliers.find((x) => x.id === form.supplier_id);
    if (s) setForm((f) => ({ ...f, gst_number: s.gst_number ?? "" }));
  }, [form.supplier_id, suppliers]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + Number(l.quantity || 0) * Number(l.rate || 0), 0);
    const discount = Number(form.discount) || 0;
    const taxable = Math.max(0, subtotal - discount);
    const cgst = (taxable * (Number(form.cgst_rate) || 0)) / 100;
    const sgst = (taxable * (Number(form.sgst_rate) || 0)) / 100;
    const gross = taxable + cgst + sgst;
    const total = Math.round(gross);
    const roundoff = +(total - gross).toFixed(2);
    return { subtotal, discount, taxable, cgst, sgst, total, roundoff };
  }, [lines, form]);

  const resetForm = () => {
    setForm({
      supplier_id: "", bill_number: "",
      bill_date: new Date().toISOString().slice(0, 10),
      challan_number: "", challan_date: "", gst_number: "",
      discount: "0", cgst_rate: "9", sgst_rate: "9", notes: "",
    });
    setLines([]);
  };

  const addLine = () => setLines([...lines, {
    cylinder_number: "", serial_number: "", type_id: "", hsn_code: "",
    quantity: 1, rate: 0, fill_status: "filled",
  }]);

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((curr) => curr.map((l, i) => {
      if (i !== idx) return l;
      const merged = { ...l, ...patch };
      if (patch.type_id) {
        const t = types.find((x) => x.id === patch.type_id);
        if (t) {
          if (!merged.hsn_code) merged.hsn_code = t.hsn_code ?? "";
          if (!merged.rate) merged.rate = Number(t.price) || 0;
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
    }).select().single();
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

    const payload = {
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
      notes: form.notes.trim() || null,
    };
    const { data: pur, error } = await supabase.from("purchases").insert(payload).select().single();
    if (error || !pur) return toast.error(error?.message ?? "Failed");

    const cgstRate = Number(form.cgst_rate) || 0;
    const sgstRate = Number(form.sgst_rate) || 0;
    const itemRows = [];

    for (const l of lines) {
      const cylNum = l.cylinder_number.trim() ? parseInt(l.cylinder_number.trim(), 10) : null;
      const serialNum = l.serial_number.trim() || (cylNum ? `CYL-${String(cylNum).padStart(4, "0")}` : "");

      let cylinderId: string | null = null;
      // Try to find by cylinder_number first, then by serial
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

      const taxable = Number(l.quantity) * Number(l.rate);
      const cg = (taxable * cgstRate) / 100;
      const sg = (taxable * sgstRate) / 100;
      itemRows.push({
        purchase_id: pur.id,
        cylinder_id: cylinderId,
        type_id: l.type_id,
        serial_number: serialNum,
        cylinder_number: cylNum,
        hsn_code: l.hsn_code || null,
        quantity: l.quantity,
        rate: l.rate,
        taxable,
        cgst_amount: cg,
        sgst_amount: sg,
        total: taxable + cg + sg,
        fill_status: l.fill_status,
      });
    }
    if (itemRows.length) await supabase.from("purchase_items").insert(itemRows);

    toast.success(`Purchase recorded — ${itemRows.length} cylinder(s) added to stock`);
    setOpen(false);
    resetForm();
    load();
  };

  const viewDetails = async (p: any) => {
    const { data } = await (supabase.from("purchase_items") as any).select("*").eq("purchase_id", p.id);
    setViewing({ ...p, items: data ?? [] });
  };

  const totalSpend = items.reduce((a, b) => a + Number(b.total), 0);

  // Fill status counts across all purchases
  const filledCount = items.reduce((a, p) => a + (p.purchase_items ?? []).filter((i: any) => i.fill_status === "filled").length, 0);
  const emptyCount = items.reduce((a, p) => a + (p.purchase_items ?? []).filter((i: any) => i.fill_status === "empty").length, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-5 bg-card border-border/60"><div className="text-xs uppercase tracking-widest text-muted-foreground">Total Spend</div><div className="text-2xl font-bold mt-2 font-mono">₹{totalSpend.toLocaleString()}</div></Card>
        <Card className="p-5 bg-card border-border/60"><div className="text-xs uppercase tracking-widest text-muted-foreground">Purchase Bills</div><div className="text-2xl font-bold mt-2 font-mono">{items.length}</div></Card>
        <Card className="p-5 bg-card border-border/60">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Filled Cylinders</div>
          <div className="text-2xl font-bold mt-2 font-mono text-success flex items-center gap-2"><Flame className="h-5 w-5" />{filledCount}</div>
        </Card>
        <Card className="p-5 bg-card border-border/60">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Empty Cylinders</div>
          <div className="text-2xl font-bold mt-2 font-mono text-muted-foreground flex items-center gap-2"><Circle className="h-5 w-5" />{emptyCount}</div>
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
                    <Label>Cylinders (number + fill status)</Label>
                    <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3 w-3 mr-1" />Add cylinder</Button>
                  </div>
                  <div className="space-y-2">
                    {lines.map((l, i) => (
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 rounded border border-border/40 bg-secondary/30">
                        {/* Cylinder Number */}
                        <div className="sm:col-span-2">
                          <Label className="text-[10px]">Cyl # (1–2000)</Label>
                          <Input
                            type="number" min={1} max={2000}
                            value={l.cylinder_number}
                            onChange={(e) => updateLine(i, { cylinder_number: e.target.value })}
                            placeholder="e.g. 42"
                            className="font-mono"
                          />
                        </div>
                        {/* Serial number */}
                        <div className="sm:col-span-2">
                          <Label className="text-[10px]">Serial # (opt.)</Label>
                          <Input value={l.serial_number} onChange={(e) => updateLine(i, { serial_number: e.target.value })} placeholder="CYL-..." />
                        </div>
                        {/* Type */}
                        <div className="sm:col-span-2">
                          <Label className="text-[10px]">Type</Label>
                          <Select value={l.type_id} onValueChange={(v) => updateLine(i, { type_id: v })}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.code} — {t.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        {/* HSN */}
                        <div className="sm:col-span-1"><Label className="text-[10px]">HSN</Label><Input value={l.hsn_code} onChange={(e) => updateLine(i, { hsn_code: e.target.value })} /></div>
                        {/* Qty */}
                        <div className="sm:col-span-1"><Label className="text-[10px]">Qty</Label><Input type="number" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} /></div>
                        {/* Rate */}
                        <div className="sm:col-span-1"><Label className="text-[10px]">Rate ₹</Label><Input type="number" value={l.rate} onChange={(e) => updateLine(i, { rate: Number(e.target.value) })} /></div>
                        {/* Fill status toggle */}
                        <div className="sm:col-span-2">
                          <Label className="text-[10px]">Fill Status</Label>
                          <div className="flex rounded-md border border-border/60 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => updateLine(i, { fill_status: "filled" })}
                              className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-bold transition-colors ${
                                l.fill_status === "filled"
                                  ? "bg-success text-success-foreground"
                                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                              }`}
                            >
                              <Flame className="h-3 w-3" /> Filled
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLine(i, { fill_status: "empty" })}
                              className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-bold transition-colors ${
                                l.fill_status === "empty"
                                  ? "bg-muted text-foreground"
                                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                              }`}
                            >
                              <Circle className="h-3 w-3" /> Empty
                            </button>
                          </div>
                        </div>
                        {/* Remove */}
                        <div className="sm:col-span-1"><Button variant="ghost" size="icon" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                      </div>
                    ))}
                    {lines.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No cylinders. Click "Add cylinder".</p>}
                  </div>

                  {/* Fill status summary */}
                  {lines.length > 0 && (
                    <div className="mt-2 flex gap-4 text-xs font-semibold">
                      <span className="text-success"><Flame className="h-3 w-3 inline mr-1" />Filled: {lines.filter((l) => l.fill_status === "filled").length}</span>
                      <span className="text-muted-foreground"><Circle className="h-3 w-3 inline mr-1" />Empty: {lines.filter((l) => l.fill_status === "empty").length}</span>
                    </div>
                  )}
                </div>

                <div className="p-4 rounded bg-secondary/50 space-y-1 font-mono text-sm">
                  <Row k="Subtotal" v={totals.subtotal} />
                  <Row k="Discount" v={-totals.discount} />
                  <Row k="Taxable" v={totals.taxable} bold />
                  <Row k={`CGST @ ${form.cgst_rate}%`} v={totals.cgst} />
                  <Row k={`SGST @ ${form.sgst_rate}%`} v={totals.sgst} />
                  <Row k="Round off" v={totals.roundoff} />
                  <div className="border-t border-border/60 mt-2 pt-2"><Row k="TOTAL" v={totals.total} bold big /></div>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <Button onClick={save} className="w-full">Save purchase</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Purchase list table */}
      <Card className="bg-card border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Purchase #</th>
                <th className="text-left px-4 py-3">Bill / Challan</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Supplier</th>
                <th className="text-left px-4 py-3">Cylinder #s</th>
                <th className="text-right px-4 py-3">Filled</th>
                <th className="text-right px-4 py-3">Empty</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const pItems: any[] = p.purchase_items ?? [];
                const filled = pItems.filter((it) => it.fill_status === "filled").length;
                const empty = pItems.filter((it) => it.fill_status === "empty").length;
                const cylNums = pItems.map((it: any) => it.cylinder_number).filter(Boolean).sort((a: number, b: number) => a - b);
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
                    <td className="px-4 py-3 text-right font-mono">
                      {filled > 0 ? <span className="text-success font-bold">{filled}</span> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {empty > 0 ? <span className="text-muted-foreground font-bold">{empty}</span> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">₹{Number(p.total).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => viewDetails(p)}><Eye className="h-3 w-3" /></Button></td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No purchases yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Purchase detail dialog */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewing && (
            <div className="space-y-3">
              <DialogHeader>
                <DialogTitle>{viewing.purchase_number}</DialogTitle>
              </DialogHeader>
              <div className="text-xs space-y-1">
                <div><b>Supplier:</b> {viewing.suppliers?.name}</div>
                <div><b>Bill:</b> {viewing.bill_number ?? "—"} · {new Date(viewing.bill_date).toLocaleDateString()}</div>
                {viewing.challan_number && <div><b>Challan:</b> {viewing.challan_number}{viewing.challan_date ? ` · ${new Date(viewing.challan_date).toLocaleDateString()}` : ""}</div>}
              </div>

              {/* Fill status summary */}
              <div className="flex gap-4">
                <span className="text-xs font-semibold text-success">
                  <Flame className="h-3 w-3 inline mr-1" />
                  Filled: {(viewing.items ?? []).filter((it: any) => it.fill_status === "filled").length}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  <Circle className="h-3 w-3 inline mr-1" />
                  Empty: {(viewing.items ?? []).filter((it: any) => it.fill_status === "empty").length}
                </span>
              </div>

              <div className="border-t border-border/40 pt-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Cylinders</div>
                <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left py-1">Cyl #</th>
                      <th className="text-left py-1">Serial</th>
                      <th className="text-left py-1">HSN</th>
                      <th className="text-left py-1">Fill</th>
                      <th className="text-right py-1">Qty</th>
                      <th className="text-right py-1">Rate</th>
                      <th className="text-right py-1">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewing.items ?? []).map((it: any) => (
                      <tr key={it.id} className="border-t border-border/30">
                        <td className="py-1 font-mono font-bold">{it.cylinder_number ? `#${it.cylinder_number}` : "—"}</td>
                        <td className="py-1 font-mono">{it.serial_number}</td>
                        <td className="py-1 font-mono">{it.hsn_code ?? "—"}</td>
                        <td className="py-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${it.fill_status === "filled" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                            {it.fill_status === "filled" ? "● Filled" : "○ Empty"}
                          </span>
                        </td>
                        <td className="py-1 text-right font-mono">{it.quantity}</td>
                        <td className="py-1 text-right font-mono">₹{Number(it.rate).toLocaleString()}</td>
                        <td className="py-1 text-right font-mono">₹{Number(it.total).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
              <div className="p-3 rounded bg-secondary/50 space-y-1 font-mono text-sm">
                <Row k="Taxable" v={Number(viewing.taxable_amount)} />
                <Row k={`CGST @ ${viewing.cgst_rate}%`} v={Number(viewing.cgst_amount)} />
                <Row k={`SGST @ ${viewing.sgst_rate}%`} v={Number(viewing.sgst_amount)} />
                <Row k="Round off" v={Number(viewing.roundoff)} />
                <div className="border-t border-border/60 mt-2 pt-2"><Row k="TOTAL" v={Number(viewing.total)} bold big /></div>
              </div>
            </div>
          )}
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
