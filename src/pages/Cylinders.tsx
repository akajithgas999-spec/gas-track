import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Search, Trash2, Pencil, Package, TrendingUp, Wrench, ShieldAlert,
  ShoppingCart, CalendarDays, Hash, Tag, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/hooks/useCompany";

const STATUS = ["in_stock", "issued", "maintenance", "retired"] as const;
const STATUS_COLOR: Record<string, string> = {
  in_stock: "bg-success/15 text-success border-success/30",
  issued: "bg-warning/15 text-warning border-warning/30",
  maintenance: "bg-primary/15 text-primary border-primary/30",
  retired: "bg-muted text-muted-foreground border-border",
};

export default function Cylinders() {
  const { company } = useCompany();
  const [items, setItems] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState({
    cylinder_number: "",
    serial_number: "",
    type_id: "",
    status: "in_stock",
    notes: "",
  });

  // New Purchase Entry state
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyForm, setBuyForm] = useState({
    purchase_date: new Date().toISOString().slice(0, 10),
    cylinder_number: "",
    serial_number: "",
    type_id: "",
    notes: "",
  });
  const [purchases, setPurchases] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(true);

  const load = async () => {
    const { data } = await (supabase.from("cylinders") as any)
      .select("*, cylinder_types(name,code), customers(name)")
      .order("cylinder_number", { ascending: true, nullsFirst: false });
    setItems(data ?? []);
  };

  const loadTypes = async () => {
    const { data } = await supabase.from("cylinder_types").select("id, name, code").order("name");
    setTypes(data ?? []);
  };

  const loadPurchases = async () => {
    const { data } = await (supabase.from("cylinders") as any)
      .select("*, cylinder_types(name,code)")
      .not("purchased_at", "is", null)
      .order("purchased_at", { ascending: false })
      .limit(100);
    setPurchases(data ?? []);
  };

  useEffect(() => { load(); loadTypes(); loadPurchases(); }, []);

  const openNew = () => {
    setEdit(null);
    setForm({ cylinder_number: "", serial_number: "", type_id: types[0]?.id ?? "", status: "in_stock", notes: "" });
    setOpen(true);
  };

  const openEdit = (c: any) => {
    setEdit(c);
    setForm({
      cylinder_number: c.cylinder_number ? String(c.cylinder_number) : "",
      serial_number: c.serial_number,
      type_id: c.type_id,
      status: c.status,
      notes: c.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.serial_number.trim() && !form.cylinder_number.trim()) return toast.error("Cylinder number or serial required");
    if (!form.type_id) return toast.error("Type required");
    const cylNum = form.cylinder_number.trim() ? parseInt(form.cylinder_number.trim(), 10) : null;
    if (cylNum !== null && cylNum < 1) return toast.error("Cylinder number must be positive");
    const serialNum = form.serial_number.trim().toUpperCase() || (cylNum ? `CYL-${String(cylNum).padStart(4, "0")}` : "");
    const payload: any = {
      serial_number: serialNum,
      cylinder_number: cylNum,
      type_id: form.type_id,
      status: form.status as any,
      notes: form.notes.trim() || null,
    };
    const { error } = edit
      ? await supabase.from("cylinders").update(payload).eq("id", edit.id)
      : await supabase.from("cylinders").insert(payload);
    if (error) return toast.error(error.message.includes("duplicate") ? "Cylinder number or serial already exists" : error.message);
    toast.success("Saved");
    setOpen(false);
    load();
  };

  const savePurchase = async () => {
    if (!buyForm.cylinder_number.trim() && !buyForm.serial_number.trim())
      return toast.error("Enter cylinder number or serial number");
    if (!buyForm.type_id) return toast.error("Select a cylinder type");
    if (!buyForm.purchase_date) return toast.error("Select a purchase date");
    const cylNum = buyForm.cylinder_number.trim() ? parseInt(buyForm.cylinder_number.trim(), 10) : null;
    if (cylNum !== null && cylNum < 1) return toast.error("Cylinder number must be positive");
    const serialNum =
      buyForm.serial_number.trim().toUpperCase() ||
      (cylNum ? `CYL-${String(cylNum).padStart(4, "0")}` : "");
    const payload: any = {
      serial_number: serialNum,
      cylinder_number: cylNum,
      type_id: buyForm.type_id,
      status: "in_stock",
      notes: buyForm.notes.trim() || null,
      purchased_at: new Date(buyForm.purchase_date).toISOString(),
    };
    const { error } = await (supabase.from("cylinders") as any).insert(payload);
    if (error) {
      return toast.error(
        error.message.includes("purchased_at")
          ? "DB column 'purchased_at' missing — add it via Supabase SQL editor"
          : error.message.includes("duplicate")
          ? "Cylinder number or serial already exists"
          : error.message
      );
    }
    toast.success(`Cylinder #${cylNum ?? serialNum} added to inventory`);
    setBuyOpen(false);
    setBuyForm({
      purchase_date: new Date().toISOString().slice(0, 10),
      cylinder_number: "",
      serial_number: "",
      type_id: "",
      notes: "",
    });
    load();
    loadPurchases();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete cylinder?")) return;
    const { error } = await supabase.from("cylinders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
    loadPurchases();
  };

  const filtered = items.filter((c) => {
    const q = search.toLowerCase();
    const ok =
      !q ||
      (c.cylinder_number && String(c.cylinder_number).includes(q)) ||
      c.serial_number.toLowerCase().includes(q) ||
      c.cylinder_types?.code?.toLowerCase().includes(q) ||
      c.customers?.name?.toLowerCase().includes(q);
    const sf = statusFilter === "all" || c.status === statusFilter;
    const tf = typeFilter === "all" || c.type_id === typeFilter;
    return ok && sf && tf;
  });

  const totalCount = items.length;
  const inStock = items.filter((c) => c.status === "in_stock").length;
  const issued = items.filter((c) => c.status === "issued").length;
  const maintenance = items.filter((c) => c.status === "maintenance").length;
  const retired = items.filter((c) => c.status === "retired").length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total Cylinders</div>
          <div className="text-2xl font-bold mt-1 font-mono">{totalCount}</div>
          <div className="text-[10px] text-muted-foreground">in inventory</div>
        </Card>
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Package className="h-3.5 w-3.5 text-success" />In Stock</div>
          <div className="text-2xl font-bold mt-1 font-mono text-success">{inStock}</div>
        </Card>
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-warning" />Issued</div>
          <div className="text-2xl font-bold mt-1 font-mono text-warning">{issued}</div>
        </Card>
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Wrench className="h-3.5 w-3.5 text-primary" />Maintenance</div>
          <div className="text-2xl font-bold mt-1 font-mono text-primary">{maintenance}</div>
        </Card>
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />Retired</div>
          <div className="text-2xl font-bold mt-1 font-mono text-muted-foreground">{retired}</div>
        </Card>
      </div>

      {/* Filters + Buttons */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-[240px] sm:max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search cylinder #, serial, type, customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.code} — {t.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="w-full sm:w-auto sm:ml-auto flex gap-2">
          {/* New Purchase Button */}
          <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 flex-1 sm:flex-none">
                <ShoppingCart className="h-4 w-4" /> New Purchase
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" /> Record New Cylinder Purchase
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-1">
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                    <CalendarDays className="h-3.5 w-3.5" /> Purchase Date *
                  </Label>
                  <Input
                    type="date"
                    value={buyForm.purchase_date}
                    onChange={(e) => setBuyForm({ ...buyForm, purchase_date: e.target.value })}
                    className="font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                      <Hash className="h-3.5 w-3.5" /> Cylinder # *
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={buyForm.cylinder_number}
                      onChange={(e) => setBuyForm({ ...buyForm, cylinder_number: e.target.value })}
                      placeholder="e.g. 101"
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Serial # (optional)</Label>
                    <Input
                      value={buyForm.serial_number}
                      onChange={(e) => setBuyForm({ ...buyForm, serial_number: e.target.value })}
                      placeholder="CYL-0101"
                      className="font-mono"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                    <Tag className="h-3.5 w-3.5" /> Cylinder Type *
                  </Label>
                  <Select value={buyForm.type_id} onValueChange={(v) => setBuyForm({ ...buyForm, type_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.code} — {t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Notes (optional)</Label>
                  <Textarea
                    value={buyForm.notes}
                    onChange={(e) => setBuyForm({ ...buyForm, notes: e.target.value })}
                    placeholder="Supplier name, batch, remarks..."
                    rows={2}
                  />
                </div>
                <Button onClick={savePurchase} className="w-full h-11 font-bold text-sm uppercase tracking-wider">
                  <ShoppingCart className="h-4 w-4 mr-2" /> Add to Inventory
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Existing New Cylinder Button */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="gap-2 flex-1 sm:flex-none">
                <Plus className="h-4 w-4" /> New cylinder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{edit ? "Edit" : "New"} cylinder</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Cylinder #</Label>
                    <Input type="number" min={1} value={form.cylinder_number} onChange={(e) => setForm({ ...form, cylinder_number: e.target.value })} placeholder="e.g. 42" className="font-mono" />
                  </div>
                  <div>
                    <Label>Serial number</Label>
                    <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} placeholder="CYL-0001 (auto if empty)" />
                  </div>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={form.type_id} onValueChange={(v) => setForm({ ...form, type_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.code} — {t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <Button onClick={save} className="w-full">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Cylinder inventory table */}
      <Card className="bg-card border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Cyl #</th>
                <th className="text-left px-4 py-3">Serial</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Purchased Date</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border/40 hover:bg-secondary/30">
                  <td className="px-4 py-3 font-mono font-bold text-primary">
                    {c.cylinder_number ? `#${c.cylinder_number}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.serial_number}</td>
                  <td className="px-4 py-3">{c.cylinder_types?.code} <span className="text-muted-foreground">— {c.cylinder_types?.name}</span></td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${STATUS_COLOR[c.status]}`}>{c.status.replace("_", " ")}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {c.purchased_at
                      ? <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{new Date(c.purchased_at).toLocaleDateString("en-IN")}</span>
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.customers?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No cylinders found.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Purchase History Panel */}
      <Card className="bg-card border-border/60 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors text-left"
          onClick={() => setShowHistory((v) => !v)}
        >
          <div className="flex items-center gap-2 font-semibold text-sm">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            New Cylinder Purchase History
            <span className="text-[10px] font-mono bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
              {purchases.length} records
            </span>
          </div>
          {showHistory ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showHistory && (
          purchases.length === 0 ? (
            <div className="px-5 pb-8 pt-2 text-center text-muted-foreground text-sm">
              No cylinder purchases recorded yet. Click <b>New Purchase</b> above to add one.
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-border/40">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5">Purchase Date</th>
                    <th className="text-left px-4 py-2.5">Cyl #</th>
                    <th className="text-left px-4 py-2.5">Serial #</th>
                    <th className="text-left px-4 py-2.5">Type</th>
                    <th className="text-left px-4 py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((c) => (
                    <tr key={c.id} className="border-t border-border/30 hover:bg-secondary/20">
                      <td className="px-4 py-3 font-mono text-sm font-semibold">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {new Date(c.purchased_at).toLocaleDateString("en-IN", {
                            day: "2-digit", month: "short", year: "numeric",
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-primary">
                        {c.cylinder_number ? `#${c.cylinder_number}` : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.serial_number}</td>
                      <td className="px-4 py-3 text-xs">
                        {c.cylinder_types ? (
                          <span className="px-2 py-0.5 rounded border border-border/60 bg-secondary/40 font-semibold font-mono text-[10px]">
                            {c.cylinder_types.code} — {c.cylinder_types.name}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{c.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>
    </div>
  );
}
