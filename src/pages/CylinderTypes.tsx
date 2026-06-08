import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

interface CT {
  id: string;
  name: string;
  code: string;
  price: number;
  deposit: number;
  description: string | null;
}

export default function CylinderTypes() {
  const [items, setItems] = useState<CT[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<CT | null>(null);
  const [form, setForm] = useState({ name: "", code: "", price: "0", deposit: "0", description: "" });

  const load = async () => {
    const { data } = await supabase.from("cylinder_types").select("*").order("name");
    setItems((data as CT[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEdit(null);
    setForm({ name: "", code: "", price: "0", deposit: "0", description: "" });
    setOpen(true);
  };
  const openEdit = (t: CT) => {
    setEdit(t);
    setForm({ name: t.name, code: t.code, price: String(t.price), deposit: String(t.deposit), description: t.description ?? "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return toast.error("Name & code required");
    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      price: Number(form.price),
      deposit: Number(form.deposit),
      description: form.description.trim() || null,
    };
    const { error } = edit
      ? await supabase.from("cylinder_types").update(payload).eq("id", edit.id)
      : await supabase.from("cylinder_types").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this type?")) return;
    const { error } = await supabase.from("cylinder_types").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage gas types and pricing.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add type</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit ? "Edit" : "New"} cylinder type</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CO2" /></div>
                <div><Label>Price (₹)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                <div><Label>Deposit (₹)</Label><Input type="number" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /></div>
              </div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <Button onClick={save} className="w-full">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((t) => (
          <Card key={t.id} className="p-5 bg-card border-border/60 hover:border-primary/40 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-xs font-mono text-primary tracking-widest">{t.code}</div>
                <div className="text-lg font-bold mt-1">{t.name}</div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
            {t.description && <p className="text-sm text-muted-foreground mb-3">{t.description}</p>}
            <div className="flex gap-4 text-sm pt-3 border-t border-border/40">
              <div><span className="text-muted-foreground">Price:</span> <span className="font-mono font-semibold">₹{t.price}</span></div>
              <div><span className="text-muted-foreground">Deposit:</span> <span className="font-mono font-semibold">₹{t.deposit}</span></div>
            </div>
          </Card>
        ))}
        {items.length === 0 && <p className="col-span-full text-center text-muted-foreground py-12">No types yet.</p>}
      </div>
    </div>
  );
}
