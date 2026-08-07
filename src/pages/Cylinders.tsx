import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Trash2, Pencil, Package, TrendingUp, Wrench, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const STATUS = ["in_stock", "issued", "maintenance", "retired"] as const;
const STATUS_COLOR: Record<string, string> = {
  in_stock: "bg-success/15 text-success border-success/30",
  issued: "bg-warning/15 text-warning border-warning/30",
  maintenance: "bg-primary/15 text-primary border-primary/30",
  retired: "bg-muted text-muted-foreground border-border",
};

export default function Cylinders() {
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

  const load = async () => {
    const { data } = await (supabase
      .from("cylinders") as any)
      .select("*, cylinder_types(name,code), customers(name)")
      .order("cylinder_number", { ascending: true, nullsFirst: false });
    setItems(data ?? []);
  };

  const loadTypes = async () => {
    const { data } = await supabase.from("cylinder_types").select("id, name, code").order("name");
    setTypes(data ?? []);
  };
  useEffect(() => { load(); loadTypes(); }, []);

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

  const remove = async (id: string) => {
    if (!confirm("Delete cylinder?")) return;
    const { error } = await supabase.from("cylinders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
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

  // Summary counts
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

      {/* Filters */}
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
        <div className="w-full sm:w-auto sm:ml-auto">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />New cylinder</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{edit ? "Edit" : "New"} cylinder</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Cylinder #</Label>
                    <Input
                      type="number" min={1}
                      value={form.cylinder_number}
                      onChange={(e) => setForm({ ...form, cylinder_number: e.target.value })}
                      placeholder="e.g. 42"
                      className="font-mono"
                    />
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

      {/* Cylinder table */}
      <Card className="bg-card border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Cyl #</th>
                <th className="text-left px-4 py-3">Serial</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Status</th>
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
                  <td className="px-4 py-3 text-muted-foreground">{c.customers?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No cylinders found.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
