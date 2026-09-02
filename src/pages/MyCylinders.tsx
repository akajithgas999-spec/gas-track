import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Database, Plus, Search, Filter, AlertTriangle, DollarSign,
  CheckCircle2, Flame, Circle, Pencil, Trash2, Tag, ArrowUpRight,
  Package, Calendar, Truck, UserCheck, ShieldAlert, ShoppingBag
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Auto-comma spacebar helper
function handleSpaceAutoComma(
  e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  currentValue: string,
  onChange: (val: string) => void
) {
  if (e.key === " ") {
    const target = e.currentTarget;
    const cursorPos = target.selectionStart ?? currentValue.length;
    const textBefore = currentValue.slice(0, cursorPos);
    const textAfter = currentValue.slice(cursorPos);

    if (/[a-zA-Z0-9]$/.test(textBefore)) {
      e.preventDefault();
      const updated = `${textBefore}, ${textAfter}`;
      onChange(updated);
      setTimeout(() => {
        const newPos = cursorPos + 2;
        target.setSelectionRange(newPos, newPos);
      }, 0);
    }
  }
}

// Parse batch cylinder range e.g. 101-110, A101-A120
function parseBatchCylinderNumbers(input: string): string[] {
  const result: Set<string> = new Set();
  const parts = input.split(/[,;\n]+/);

  for (const rawPart of parts) {
    const trimmed = rawPart.trim();
    if (!trimmed) continue;

    const subParts = trimmed.includes("-") || trimmed.toLowerCase().includes("to") || trimmed.includes("..")
      ? [trimmed]
      : trimmed.split(/\s+/);

    for (const part of subParts) {
      const p = part.trim();
      if (!p) continue;

      const prefixRangeMatch = p.match(/^([A-Za-z\-_]*?)(\d+)\s*(?:-|to|\.\.)\s*([A-Za-z\-_]*?)(\d+)$/i);
      if (prefixRangeMatch) {
        const p1 = prefixRangeMatch[1].toUpperCase();
        const num1Str = prefixRangeMatch[2];
        const p2 = prefixRangeMatch[3].toUpperCase();
        const num2Str = prefixRangeMatch[4];
        const prefix = p1 || p2;

        if (!p1 || !p2 || p1 === p2) {
          const start = parseInt(num1Str, 10);
          const end = parseInt(num2Str, 10);
          if (!isNaN(start) && !isNaN(end)) {
            const min = Math.min(start, end);
            const max = Math.max(start, end);
            const padLen = Math.max(num1Str.length, num2Str.length);
            const usePad = (num1Str.startsWith("0") || num2Str.startsWith("0")) && padLen > 1;

            for (let n = min; n <= max; n++) {
              const formattedNum = usePad ? String(n).padStart(padLen, "0") : String(n);
              result.add(`${prefix}${formattedNum}`);
            }
            continue;
          }
        }
      }
      result.add(p.toUpperCase());
    }
  }

  return Array.from(result).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function getCylMeta(c: any) {
  let meta: any = {};
  if (c.notes && typeof c.notes === "string" && c.notes.includes("__CYL_META__:")) {
    try {
      const jsonStr = c.notes.split("__CYL_META__:")[1].split("__END_CYL_META__")[0];
      meta = JSON.parse(jsonStr);
    } catch (e) {}
  }
  const cleanNotes = c.notes && typeof c.notes === "string" && c.notes.includes("__CYL_META__:")
    ? c.notes.split("__CYL_META__:")[0].trim()
    : c.notes ?? "";

  return {
    supplier_name: c.supplier_name ?? meta.supplier_name ?? "—",
    batch_number: c.batch_number ?? meta.batch_number ?? "—",
    manufacture_year: c.manufacture_year ?? meta.manufacture_year ?? (c.purchased_at ? new Date(c.purchased_at).getFullYear() : "—"),
    is_damaged: c.is_damaged ?? meta.is_damaged ?? c.status === "damaged" ?? c.status === "maintenance",
    damage_notes: c.damage_notes ?? meta.damage_notes ?? "",
    sold_at: c.sold_at ?? meta.sold_at ?? null,
    sold_to_customer_id: c.sold_to_customer_id ?? meta.sold_to_customer_id ?? null,
    sold_to_name: c.sold_to_name ?? meta.sold_to_name ?? (c.customers?.name || "—"),
    sold_price: c.sold_price ?? meta.sold_price ?? 0,
    sold_notes: c.sold_notes ?? meta.sold_notes ?? "",
    clean_notes: cleanNotes,
    meta,
  };
}

function buildNotesWithMeta(cleanNotes: string, meta: any) {
  const jsonStr = `__CYL_META__:${JSON.stringify(meta)}__END_CYL_META__`;
  return cleanNotes ? `${cleanNotes}\n${jsonStr}` : jsonStr;
}

export default function MyCylinders() {
  const { company } = useCompany();
  const [cylinders, setCylinders] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [fillFilter, setFillFilter] = useState("all");

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [sellModalCyl, setSellModalCyl] = useState<any | null>(null);
  const [damageModalCyl, setDamageModalCyl] = useState<any | null>(null);
  const [editModalCyl, setEditModalCyl] = useState<any | null>(null);

  // New Purchase / Batch Form State
  const [addForm, setAddForm] = useState({
    purchased_at: new Date().toISOString().slice(0, 10),
    supplier_name: "",
    batch_number: "",
    manufacture_year: String(new Date().getFullYear()),
    type_id: "",
    fill_status: "filled",
    cylinder_numbers: "",
  });

  // Sell Cylinder Form State
  const [sellForm, setSellForm] = useState({
    sold_at: new Date().toISOString().slice(0, 10),
    customer_id: "",
    sold_price: "",
    notes: "",
  });

  // Damage Form State
  const [damageForm, setDamageForm] = useState({
    is_damaged: true,
    damage_notes: "",
  });

  // Edit Form State
  const [editForm, setEditForm] = useState({
    serial_number: "",
    cylinder_number: "",
    type_id: "",
    purchased_at: "",
    supplier_name: "",
    batch_number: "",
    manufacture_year: "",
    fill_status: "filled",
  });

  const loadData = async () => {
    setLoading(true);
    const [cylRes, typeRes, custRes] = await Promise.all([
      (supabase.from("cylinders") as any)
        .select("*, cylinder_types(code, name, price), customers(id, name, phone, customer_number)")
        .order("created_at", { ascending: false }),
      supabase.from("cylinder_types").select("*").order("name"),
      supabase.from("customers").select("*").order("name"),
    ]);

    setCylinders(cylRes.data ?? []);
    setTypes(typeRes.data ?? []);
    setCustomers(custRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [company]);

  // ── SAVE BATCH NEW CYLINDERS ──
  const handleAddBatchCylinders = async () => {
    if (!addForm.type_id) return toast.error("Please select a cylinder/gas type");
    const parsedNums = parseBatchCylinderNumbers(addForm.cylinder_numbers);
    if (parsedNums.length === 0) return toast.error("Please enter at least one cylinder number or range");

    let createdCount = 0;
    for (const rawNum of parsedNums) {
      const isPure = /^\d+$/.test(rawNum);
      const cylNum = isPure ? parseInt(rawNum, 10) : null;
      const serialNum = isPure ? `CYL-${rawNum.padStart(4, "0")}` : rawNum.toUpperCase();

      const meta = {
        supplier_name: addForm.supplier_name.trim() || "—",
        batch_number: addForm.batch_number.trim() || "—",
        manufacture_year: addForm.manufacture_year.trim() || String(new Date().getFullYear()),
        is_damaged: false,
        damage_notes: "",
      };
      const formattedNotes = buildNotesWithMeta("", meta);

      const payload: any = {
        serial_number: serialNum,
        cylinder_number: cylNum,
        type_id: addForm.type_id,
        status: "in_stock",
        fill_status: addForm.fill_status,
        purchased_at: new Date(addForm.purchased_at).toISOString(),
        supplier_name: addForm.supplier_name.trim() || null,
        batch_number: addForm.batch_number.trim() || null,
        manufacture_year: parseInt(addForm.manufacture_year, 10) || new Date().getFullYear(),
        notes: formattedNotes,
        company,
      };

      // Check if existing
      const query = isPure
        ? (supabase.from("cylinders") as any).select("id").eq("cylinder_number", cylNum)
        : (supabase.from("cylinders") as any).select("id").eq("serial_number", serialNum);

      const { data: existing } = await query.maybeSingle();

      if (existing) {
        await (supabase.from("cylinders") as any).update(payload).eq("id", existing.id);
      } else {
        await (supabase.from("cylinders") as any).insert(payload);
      }
      createdCount++;
    }

    toast.success(`Successfully registered ${createdCount} cylinder(s) in My Cylinders! 🎉`);
    setAddModalOpen(false);
    setAddForm({
      purchased_at: new Date().toISOString().slice(0, 10),
      supplier_name: "",
      batch_number: "",
      manufacture_year: String(new Date().getFullYear()),
      type_id: "",
      fill_status: "filled",
      cylinder_numbers: "",
    });
    loadData();
  };

  // ── SELL CYLINDER ASSET ──
  const handleSellCylinder = async () => {
    if (!sellModalCyl) return;
    if (!sellForm.customer_id) return toast.error("Please select a customer");
    const cust = customers.find((c) => c.id === sellForm.customer_id);

    const m = getCylMeta(sellModalCyl);
    const newMeta = {
      ...m.meta,
      sold_at: new Date(sellForm.sold_at).toISOString(),
      sold_to_customer_id: sellForm.customer_id,
      sold_to_name: cust?.name || "—",
      sold_price: Number(sellForm.sold_price) || 0,
      sold_notes: sellForm.notes.trim(),
    };
    const formattedNotes = buildNotesWithMeta(m.clean_notes, newMeta);

    const { error } = await (supabase.from("cylinders") as any)
      .update({
        status: "retired", // or sold status
        current_customer_id: sellForm.customer_id,
        sold_at: new Date(sellForm.sold_at).toISOString(),
        sold_to_customer_id: sellForm.customer_id,
        sold_price: Number(sellForm.sold_price) || 0,
        notes: formattedNotes,
      })
      .eq("id", sellModalCyl.id);

    if (error) return toast.error(error.message);

    toast.success(`Cylinder #${sellModalCyl.cylinder_number ?? sellModalCyl.serial_number} marked as SOLD to ${cust?.name ?? "Customer"}! 💰`);
    setSellModalCyl(null);
    setSellForm({
      sold_at: new Date().toISOString().slice(0, 10),
      customer_id: "",
      sold_price: "",
      notes: "",
    });
    loadData();
  };

  // ── MARK DAMAGED / REPAIRED ──
  const handleToggleDamage = async () => {
    if (!damageModalCyl) return;
    const m = getCylMeta(damageModalCyl);
    const nextDamaged = damageForm.is_damaged;

    const newMeta = {
      ...m.meta,
      is_damaged: nextDamaged,
      damage_notes: damageForm.damage_notes.trim(),
    };
    const formattedNotes = buildNotesWithMeta(m.clean_notes, newMeta);

    const newStatus = nextDamaged ? "maintenance" : (damageModalCyl.current_customer_id ? "issued" : "in_stock");

    const { error } = await (supabase.from("cylinders") as any)
      .update({
        status: newStatus,
        is_damaged: nextDamaged,
        damage_notes: damageForm.damage_notes.trim(),
        notes: formattedNotes,
      })
      .eq("id", damageModalCyl.id);

    if (error) return toast.error(error.message);

    toast.success(nextDamaged ? "Cylinder marked as DAMAGED ⚠️" : "Cylinder restored to IN STOCK / Normal! ✅");
    setDamageModalCyl(null);
    loadData();
  };

  // ── TOGGLE FILL STATUS ──
  const toggleFillStatus = async (cyl: any) => {
    const nextStatus = cyl.fill_status === "empty" ? "filled" : "empty";
    const { error } = await (supabase.from("cylinders") as any)
      .update({ fill_status: nextStatus })
      .eq("id", cyl.id);

    if (error) return toast.error(error.message);
    toast.success(`Fill status updated to ${nextStatus.toUpperCase()}!`);
    loadData();
  };

  // ── EDIT CYLINDER DETAILS ──
  const openEdit = (cyl: any) => {
    const m = getCylMeta(cyl);
    setEditForm({
      serial_number: cyl.serial_number ?? "",
      cylinder_number: String(cyl.cylinder_number ?? ""),
      type_id: cyl.type_id ?? "",
      purchased_at: cyl.purchased_at ? new Date(cyl.purchased_at).toISOString().slice(0, 10) : "",
      supplier_name: m.supplier_name !== "—" ? m.supplier_name : "",
      batch_number: m.batch_number !== "—" ? m.batch_number : "",
      manufacture_year: String(m.manufacture_year !== "—" ? m.manufacture_year : ""),
      fill_status: cyl.fill_status || "filled",
    });
    setEditModalCyl(cyl);
  };

  const handleSaveEdit = async () => {
    if (!editModalCyl) return;
    const isPure = /^\d+$/.test(editForm.cylinder_number.trim());
    const cylNum = isPure ? parseInt(editForm.cylinder_number.trim(), 10) : null;
    const serialNum = editForm.serial_number.trim() || (isPure ? `CYL-${editForm.cylinder_number.trim().padStart(4, "0")}` : editForm.cylinder_number.trim().toUpperCase());

    const m = getCylMeta(editModalCyl);
    const newMeta = {
      ...m.meta,
      supplier_name: editForm.supplier_name.trim() || "—",
      batch_number: editForm.batch_number.trim() || "—",
      manufacture_year: editForm.manufacture_year.trim() || String(new Date().getFullYear()),
    };
    const formattedNotes = buildNotesWithMeta(m.clean_notes, newMeta);

    const { error } = await (supabase.from("cylinders") as any)
      .update({
        serial_number: serialNum,
        cylinder_number: cylNum,
        type_id: editForm.type_id,
        fill_status: editForm.fill_status,
        purchased_at: editForm.purchased_at ? new Date(editForm.purchased_at).toISOString() : null,
        supplier_name: editForm.supplier_name.trim() || null,
        batch_number: editForm.batch_number.trim() || null,
        manufacture_year: parseInt(editForm.manufacture_year, 10) || null,
        notes: formattedNotes,
      })
      .eq("id", editModalCyl.id);

    if (error) return toast.error(error.message);
    toast.success("Cylinder details updated! ✅");
    setEditModalCyl(null);
    loadData();
  };

  // ── FILTERING CYLINDERS ──
  const filteredCylinders = cylinders.filter((c) => {
    const m = getCylMeta(c);
    const cylNumStr = String(c.cylinder_number ?? "").toLowerCase();
    const serialStr = String(c.serial_number ?? "").toLowerCase();
    const custStr = String(c.customers?.name ?? "").toLowerCase();
    const suppStr = String(m.supplier_name).toLowerCase();
    const batchStr = String(m.batch_number).toLowerCase();
    const typeStr = String(c.cylinder_types?.code ?? "").toLowerCase();

    const q = search.toLowerCase().trim();
    const matchesSearch = !q || cylNumStr.includes(q) || serialStr.includes(q) || custStr.includes(q) || suppStr.includes(q) || batchStr.includes(q) || typeStr.includes(q);

    const isSold = c.status === "retired" || m.sold_at != null;
    const isDamaged = m.is_damaged || c.status === "damaged" || c.status === "maintenance";

    let matchesStatus = true;
    if (statusFilter === "in_stock") matchesStatus = c.status === "in_stock" && !isSold && !isDamaged;
    else if (statusFilter === "issued") matchesStatus = c.status === "issued" && !isSold && !isDamaged;
    else if (statusFilter === "damaged") matchesStatus = isDamaged;
    else if (statusFilter === "sold") matchesStatus = isSold;

    let matchesType = typeFilter === "all" || c.type_id === typeFilter;
    let matchesFill = fillFilter === "all" || c.fill_status === fillFilter;

    return matchesSearch && matchesStatus && matchesType && matchesFill;
  });

  // ── STAT COUNTS ──
  const totalCount = cylinders.length;
  const inStockCount = cylinders.filter((c) => c.status === "in_stock" && !getCylMeta(c).is_damaged && c.status !== "retired").length;
  const issuedCount = cylinders.filter((c) => c.status === "issued" && !getCylMeta(c).is_damaged && c.status !== "retired").length;
  const damagedCount = cylinders.filter((c) => getCylMeta(c).is_damaged || c.status === "damaged" || c.status === "maintenance").length;
  const soldCount = cylinders.filter((c) => c.status === "retired" || getCylMeta(c).sold_at != null).length;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
            <Database className="h-7 w-7 text-primary" /> My Cylinders
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Complete cylinder inventory, purchase batches, damage records & asset sales tracking for <span className="font-semibold text-foreground">{company}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setAddModalOpen(true)} className="h-10 px-4 font-bold text-xs gap-2 shadow-md">
            <Plus className="h-4 w-4" /> Add Cylinders / Batch Purchase
          </Button>
        </div>
      </div>

      {/* ── SUMMARY STAT CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="bg-card border-border/60 p-3 space-y-1">
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Total Fleet</span>
            <Package className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono">{totalCount}</div>
          <div className="text-[10px] text-muted-foreground">All registered cylinders</div>
        </Card>

        <Card className="bg-emerald-500/5 border-emerald-500/30 p-3 space-y-1">
          <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center justify-between">
            <span>In Warehouse</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-400">{inStockCount}</div>
          <div className="text-[10px] text-emerald-400/80">Available to sell / issue</div>
        </Card>

        <Card className="bg-blue-500/5 border-blue-500/30 p-3 space-y-1">
          <div className="text-[10px] uppercase font-bold tracking-wider text-blue-400 flex items-center justify-between">
            <span>With Customers</span>
            <Truck className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-blue-400">{issuedCount}</div>
          <div className="text-[10px] text-blue-400/80">Currently out on sale</div>
        </Card>

        <Card className="bg-rose-500/5 border-rose-500/30 p-3 space-y-1">
          <div className="text-[10px] uppercase font-bold tracking-wider text-rose-400 flex items-center justify-between">
            <span>Damaged</span>
            <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-rose-400">{damagedCount}</div>
          <div className="text-[10px] text-rose-400/80">Needs repair / replacement</div>
        </Card>

        <Card className="bg-purple-500/5 border-purple-500/30 p-3 space-y-1 col-span-2 sm:col-span-1">
          <div className="text-[10px] uppercase font-bold tracking-wider text-purple-400 flex items-center justify-between">
            <span>Sold (Assets)</span>
            <ShoppingBag className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-purple-400">{soldCount}</div>
          <div className="text-[10px] text-purple-400/80">Permanently sold cylinders</div>
        </Card>
      </div>

      {/* ── SEARCH & FILTERS BAR ── */}
      <Card className="bg-card border-border/60 p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search bar */}
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Cylinder #, Serial, Customer, Supplier, Batch..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Gas Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All Gas Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">🧪 All Gas Types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.code} — {t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* ── CYLINDERS DATA TABLE ── */}
      <Card className="bg-card border-border/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <tr>
                <th className="text-left px-4 py-3">Cylinder #</th>
                <th className="text-left px-4 py-3">Gas Type</th>
                <th className="text-left px-4 py-3">Purchased Date</th>
                <th className="text-left px-4 py-3">Supplier / Vendor</th>
                <th className="text-left px-4 py-3">Batch # / Bill</th>
                <th className="text-left px-4 py-3">Year</th>
                <th className="text-left px-4 py-3">Fill Status</th>
                <th className="text-left px-4 py-3">Location / Holder</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-xs">
              {filteredCylinders.map((c) => {
                const m = getCylMeta(c);
                const isSold = c.status === "retired" || m.sold_at != null;
                const isDamaged = m.is_damaged || c.status === "damaged" || c.status === "maintenance";
                const purDateStr = c.purchased_at ? new Date(c.purchased_at).toLocaleDateString("en-IN") : "—";
                const isFilled = (c.fill_status || "filled") === "filled";

                return (
                  <tr key={c.id} className="hover:bg-secondary/30 transition-colors">
                    {/* Cylinder # & Serial */}
                    <td className="px-4 py-3 font-mono">
                      <div className="font-bold text-primary text-sm">#{c.cylinder_number ?? c.serial_number}</div>
                      <div className="text-[10px] text-muted-foreground font-normal">{c.serial_number}</div>
                    </td>

                    {/* Gas Type */}
                    <td className="px-4 py-3 font-mono">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                        {c.cylinder_types?.code ?? "—"}
                      </span>
                    </td>

                    {/* Purchased Date */}
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {purDateStr}
                    </td>

                    {/* Supplier / Company */}
                    <td className="px-4 py-3 font-medium">
                      {m.supplier_name !== "—" ? (
                        <span className="text-foreground">{m.supplier_name}</span>
                      ) : (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </td>

                    {/* Batch / Bill # */}
                    <td className="px-4 py-3 font-mono">
                      {m.batch_number !== "—" ? (
                        <span className="bg-secondary px-1.5 py-0.5 rounded text-[10px] border border-border/50">{m.batch_number}</span>
                      ) : (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </td>

                    {/* Year */}
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {m.manufacture_year}
                    </td>

                    {/* Fill Status Toggle */}
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleFillStatus(c)}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold border transition-all flex items-center gap-1 cursor-pointer",
                          isFilled
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                            : "bg-secondary text-muted-foreground border-border/60 hover:bg-secondary/80"
                        )}
                        title="Click to toggle Fill/Empty status"
                      >
                        {isFilled ? <Flame className="h-3 w-3 fill-amber-400 text-amber-400" /> : <Circle className="h-3 w-3" />}
                        {isFilled ? "Filled" : "Empty"}
                      </button>
                    </td>

                    {/* Current Status / Customer / Sold info */}
                    <td className="px-4 py-3">
                      {isSold ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                            <ShoppingBag className="h-3 w-3" /> Sold (Asset Sale)
                          </span>
                          <div className="text-[10px] text-muted-foreground">
                            To: <span className="font-semibold text-foreground">{m.sold_to_name}</span> · ₹{Number(m.sold_price).toLocaleString()}
                          </div>
                        </div>
                      ) : isDamaged ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <ShieldAlert className="h-3 w-3" /> Damaged
                          </span>
                          {m.damage_notes && <div className="text-[10px] text-rose-400/80 truncate max-w-[150px]">{m.damage_notes}</div>}
                        </div>
                      ) : c.status === "issued" ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                            <Truck className="h-3 w-3" /> With Customer
                          </span>
                          <div className="text-[10px] font-semibold text-foreground truncate max-w-[160px]">
                            👤 {c.customers?.name ?? "Customer"}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="h-3 w-3" /> In Warehouse Stock
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right space-x-1">
                      {/* Sell Asset Button */}
                      {!isSold && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Sell Cylinder Asset to Customer"
                          onClick={() => {
                            setSellModalCyl(c);
                            setSellForm({
                              sold_at: new Date().toISOString().slice(0, 10),
                              customer_id: c.current_customer_id || "",
                              sold_price: String(c.cylinder_types?.price || ""),
                              notes: "",
                            });
                          }}
                          className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 h-7 px-2"
                        >
                          <DollarSign className="h-3.5 w-3.5 mr-1" /> Sell
                        </Button>
                      )}

                      {/* Toggle Damage Button */}
                      <Button
                        size="sm"
                        variant="ghost"
                        title={isDamaged ? "Mark Repaired / Restore" : "Mark Damaged"}
                        onClick={() => {
                          setDamageModalCyl(c);
                          setDamageForm({
                            is_damaged: !isDamaged,
                            damage_notes: m.damage_notes,
                          });
                        }}
                        className={isDamaged ? "text-emerald-400 hover:bg-emerald-500/10 h-7 px-1.5" : "text-rose-400 hover:bg-rose-500/10 h-7 px-1.5"}
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                      </Button>

                      {/* Edit Details */}
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Edit Cylinder Info"
                        onClick={() => openEdit(c)}
                        className="h-7 px-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {filteredCylinders.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    No cylinders match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── MODAL: ADD CYLINDERS / BATCH PURCHASE ── */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Plus className="h-5 w-5" /> Add Cylinders / Batch Purchase
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Purchased Date *</Label>
                <Input
                  type="date"
                  className="mt-1 h-9 text-xs"
                  value={addForm.purchased_at}
                  onChange={(e) => setAddForm({ ...addForm, purchased_at: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Mfg / Purchase Year</Label>
                <Input
                  type="number"
                  className="mt-1 h-9 font-mono text-xs"
                  value={addForm.manufacture_year}
                  onChange={(e) => setAddForm({ ...addForm, manufacture_year: e.target.value })}
                  placeholder="e.g. 2025"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Supplier / Vendor Company</Label>
                <Input
                  className="mt-1 h-9 text-xs"
                  value={addForm.supplier_name}
                  onChange={(e) => setAddForm({ ...addForm, supplier_name: e.target.value })}
                  placeholder="e.g. Surya Oxygen"
                />
              </div>
              <div>
                <Label className="text-xs">Batch # / Purchase Bill #</Label>
                <Input
                  className="mt-1 h-9 font-mono text-xs"
                  value={addForm.batch_number}
                  onChange={(e) => setAddForm({ ...addForm, batch_number: e.target.value })}
                  placeholder="e.g. BILL-1029"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Gas / Cylinder Type *</Label>
                <Select value={addForm.type_id} onValueChange={(v) => setAddForm({ ...addForm, type_id: v })}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.code} — {t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Initial Fill Status</Label>
                <Select value={addForm.fill_status} onValueChange={(v) => setAddForm({ ...addForm, fill_status: v })}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="filled">🔥 Filled</SelectItem>
                    <SelectItem value="empty">⚪ Empty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-emerald-400">Cylinder Numbers / Ranges *</Label>
              <Textarea
                value={addForm.cylinder_numbers}
                onChange={(e) => setAddForm({ ...addForm, cylinder_numbers: e.target.value })}
                onKeyDown={(e) => handleSpaceAutoComma(e, addForm.cylinder_numbers, (v) => setAddForm({ ...addForm, cylinder_numbers: v }))}
                placeholder="e.g. 201-220, 301, 302, A101-A120"
                rows={3}
                className="font-mono text-xs mt-1"
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                💡 Type number and press <kbd className="px-1 py-0.5 rounded bg-secondary text-foreground font-mono text-[9px]">Spacebar</kbd> to insert comma automatically!
              </div>
            </div>

            <Button onClick={handleAddBatchCylinders} className="w-full h-10 font-bold text-xs uppercase tracking-wider">
              Save Cylinders to Inventory
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: SELL CYLINDER ASSET ── */}
      <Dialog open={!!sellModalCyl} onOpenChange={(v) => !v && setSellModalCyl(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-400">
              <DollarSign className="h-5 w-5" /> Sell Cylinder Asset to Customer
            </DialogTitle>
          </DialogHeader>

          {sellModalCyl && (
            <div className="space-y-4 pt-1">
              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs text-purple-300 space-y-1">
                <div className="font-bold text-sm text-foreground">
                  Cylinder #{sellModalCyl.cylinder_number ?? sellModalCyl.serial_number}
                </div>
                <div>Gas Type: <span className="font-mono font-bold text-primary">{sellModalCyl.cylinder_types?.code}</span></div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Select Purchasing Customer *</Label>
                <Select value={sellForm.customer_id} onValueChange={(v) => setSellForm({ ...sellForm, customer_id: v })}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((cust) => (
                      <SelectItem key={cust.id} value={cust.id}>{cust.name} ({cust.customer_number})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Sale Date *</Label>
                  <Input
                    type="date"
                    className="mt-1 h-9 text-xs"
                    value={sellForm.sold_at}
                    onChange={(e) => setSellForm({ ...sellForm, sold_at: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Sale Price ₹ *</Label>
                  <Input
                    type="number"
                    className="mt-1 h-9 font-mono text-xs"
                    value={sellForm.sold_price}
                    onChange={(e) => setSellForm({ ...sellForm, sold_price: e.target.value })}
                    placeholder="e.g. 5000"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Sale Notes / Receipt Ref</Label>
                <Input
                  className="mt-1 h-9 text-xs"
                  value={sellForm.notes}
                  onChange={(e) => setSellForm({ ...sellForm, notes: e.target.value })}
                  placeholder="e.g. Asset sale receipt #901"
                />
              </div>

              <Button onClick={handleSellCylinder} className="w-full h-10 font-bold text-xs uppercase tracking-wider bg-purple-600 hover:bg-purple-700 text-white">
                💰 Confirm Cylinder Asset Sale
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── MODAL: MARK DAMAGED / REPAIRED ── */}
      <Dialog open={!!damageModalCyl} onOpenChange={(v) => !v && setDamageModalCyl(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400 pr-6">
              <ShieldAlert className="h-5 w-5 shrink-0" /> Damage Record
            </DialogTitle>
          </DialogHeader>

          {damageModalCyl && (
            <div className="space-y-4 pt-1">
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                <span className="font-bold text-foreground">Cylinder #{damageModalCyl.cylinder_number ?? damageModalCyl.serial_number}</span>
                <span className="ml-1 text-muted-foreground">({damageModalCyl.cylinder_types?.code})</span>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  onClick={() => setDamageForm({ ...damageForm, is_damaged: true })}
                  className={cn("flex-1 h-10 text-xs font-bold gap-2", damageForm.is_damaged ? "bg-rose-600 text-white" : "bg-secondary text-muted-foreground")}
                >
                  <ShieldAlert className="h-4 w-4" /> Mark Damaged
                </Button>
                <Button
                  type="button"
                  onClick={() => setDamageForm({ ...damageForm, is_damaged: false })}
                  className={cn("flex-1 h-10 text-xs font-bold gap-2", !damageForm.is_damaged ? "bg-emerald-600 text-white" : "bg-secondary text-muted-foreground")}
                >
                  <CheckCircle2 className="h-4 w-4" /> Mark Repaired / Normal
                </Button>
              </div>

              {damageForm.is_damaged && (
                <div>
                  <Label className="text-xs">Damage Reason / Notes</Label>
                  <Textarea
                    value={damageForm.damage_notes}
                    onChange={(e) => setDamageForm({ ...damageForm, damage_notes: e.target.value })}
                    placeholder="e.g. Valve leaking, rust damage, dented body"
                    rows={3}
                    className="text-xs mt-1"
                  />
                </div>
              )}

              <Button onClick={handleToggleDamage} className="w-full h-10 font-bold text-xs uppercase tracking-wider">
                Save Condition Record
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── MODAL: EDIT CYLINDER ── */}
      <Dialog open={!!editModalCyl} onOpenChange={(v) => !v && setEditModalCyl(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Pencil className="h-5 w-5" /> Edit Cylinder Information
            </DialogTitle>
          </DialogHeader>

          {editModalCyl && (
            <div className="space-y-3.5 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Cylinder Number</Label>
                  <Input
                    className="mt-1 h-9 font-mono text-xs"
                    value={editForm.cylinder_number}
                    onChange={(e) => setEditForm({ ...editForm, cylinder_number: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Serial Number</Label>
                  <Input
                    className="mt-1 h-9 font-mono text-xs"
                    value={editForm.serial_number}
                    onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Purchased Date</Label>
                  <Input
                    type="date"
                    className="mt-1 h-9 text-xs"
                    value={editForm.purchased_at}
                    onChange={(e) => setEditForm({ ...editForm, purchased_at: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Mfg / Purchase Year</Label>
                  <Input
                    type="number"
                    className="mt-1 h-9 font-mono text-xs"
                    value={editForm.manufacture_year}
                    onChange={(e) => setEditForm({ ...editForm, manufacture_year: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Supplier / Vendor</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    value={editForm.supplier_name}
                    onChange={(e) => setEditForm({ ...editForm, supplier_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Batch # / Bill #</Label>
                  <Input
                    className="mt-1 h-9 font-mono text-xs"
                    value={editForm.batch_number}
                    onChange={(e) => setEditForm({ ...editForm, batch_number: e.target.value })}
                  />
                </div>
              </div>

              <Button onClick={handleSaveEdit} className="w-full h-10 font-bold text-xs uppercase tracking-wider">
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
