import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Trash2, Pencil, Flame, Circle } from "lucide-react";
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
  const [fillFilter, setFillFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState({
    cylinder_number: "",
    serial_number: "",
    type_id: "",
    status: "in_stock",
    fill_status: "filled",
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
    setForm({ cylinder_number: "", serial_number: "", type_id: types[0]?.id ?? "", status: "in_stock", fill_status: "filled", notes: "" });
    setOpen(true);
  };
  const openEdit = (c: any) => {
    setEdit(c);
    setForm({
      cylinder_number: c.cylinder_number ? String(c.cylinder_number) : "",
      serial_number: c.serial_number,
      type_id: c.type_id,
      status: c.status,
      fill_status: c.fill_status ?? "filled",
      notes: c.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.serial_number.trim() && !form.cylinder_number.trim()) return toast.error("Cylinder number or serial required");
    if (!form.type_id) return toast.error("Type required");
    const cylNum = form.cylinder_number.trim() ? parseInt(form.cylinder_number.trim(), 10) : null;
    if (cylNum !== null && (cylNum < 1 || cylNum > 2000)) return toast.error("Cylinder number must be 1–2000");
    const serialNum = form.serial_number.trim().toUpperCase() || (cylNum ? `CYL-${String(cylNum).padStart(4, "0")}` : "");
    const payload: any = {
      serial_number: serialNum,
      cylinder_number: cylNum,
      type_id: form.type_id,
      status: form.status as any,
      fill_status: form.fill_status,
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
    const ff = fillFilter === "all" || (c.fill_status ?? "filled") === fillFilter;
    return ok && sf && ff;
  });

  // Summary counts
  const total2000 = items.length;
  const filled = items.filter((c) => (c.fill_status ?? "filled") === "filled").length;
  const empty = items.filter((c) => c.fill_status === "empty").length;
  const issued = items.filter((c) => c.status === "issued").length;
  const inStock = items.filter((c) => c.status === "in_stock").length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</div>
          <div className="text-2xl font-bold mt-1 font-mono">{total2000}</div>
          <div className="text-[10px] text-muted-foreground">of 2000</div>
        </Card>
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">In Stock</div>
          <div className="text-2xl font-bold mt-1 font-mono text-success">{inStock}</div>
        </Card>
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Issued</div>
          <div className="text-2xl font-bold mt-1 font-mono text-warning">{issued}</div>
        </Card>
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Flame className="h-3 w-3 text-success" />Filled</div>
          <div className="text-2xl font-bold mt-1 font-mono text-success">{filled}</div>
        </Card>
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Circle className="h-3 w-3" />Empty</div>
          <div className="text-2xl font-bold mt-1 font-mono text-muted-foreground">{empty}</div>
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
        <Select value={fillFilter} onValueChange={setFillFilter}>
          <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fills</SelectItem>
            <SelectItem value="filled">Filled</SelectItem>
            <SelectItem value="empty">Empty</SelectItem>
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
                    <Label>Cylinder # (1–2000)</Label>
                    <Input
                      type="number" min={1} max={2000}
                      value={form.cylinder_number}
                      onChange={(e) => setForm({ ...form, cylinder_number: e.target.value })}
                      placeholder="e.g. 42"
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <Label>Serial number</Label>
                    <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} placeholder="CO2-0001 (auto if empty)" />
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
                <div>
                  <Label>Fill Status</Label>
                  <div className="flex rounded-md border border-border/60 overflow-hidden mt-1">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, fill_status: "filled" })}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors ${form.fill_status === "filled" ? "bg-success text-success-foreground" : "bg-secondary/50 text-muted-foreground hover:bg-secondary"}`}
                    >
                      <Flame className="h-4 w-4" /> Filled
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, fill_status: "empty" })}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors ${form.fill_status === "empty" ? "bg-muted text-foreground" : "bg-secondary/50 text-muted-foreground hover:bg-secondary"}`}
                    >
                      <Circle className="h-4 w-4" /> Empty
                    </button>
                  </div>
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
                <th className="text-left px-4 py-3">Fill</th>
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
                  <td className="px-4 py-3">
                    {(c.fill_status ?? "filled") === "filled" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-success/15 text-success border border-success/30">
                        <Flame className="h-3 w-3" /> Filled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                        <Circle className="h-3 w-3" /> Empty
                      </span>
                    )}
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
    </div>
  );
}
