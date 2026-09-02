import React, { useState, useEffect, useMemo } from "react";
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

function safeSlice10(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val.slice(0, 10);
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  } catch (e) {
    return "";
  }
}

function getCylMeta(c: any) {
  if (!c) {
    return {
      supplier_name: "—",
      batch_number: "—",
      manufacture_year: "—",
      is_damaged: false,
      damage_notes: "",
      sold_at: null,
      sold_to_customer_id: null,
      sold_to_name: "—",
      sold_price: 0,
      sold_notes: "",
      clean_notes: "",
      meta: {},
    };
  }

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

  const rawPurchasedAt = c.purchased_at ?? meta.purchased_at ?? c.created_at ?? null;
  const purDate = safeSlice10(rawPurchasedAt);
  const purYear = purDate ? purDate.slice(0, 4) : "—";

  return {
    supplier_name: c.supplier_name ?? meta.supplier_name ?? "—",
    batch_number: c.batch_number ?? meta.batch_number ?? "—",
    manufacture_year: c.manufacture_year ?? meta.manufacture_year ?? purYear,
    is_damaged: Boolean(c.is_damaged ?? meta.is_damaged ?? (c.status === "damaged" || c.status === "maintenance")),
    damage_notes: c.damage_notes ?? meta.damage_notes ?? "",
    sold_at: c.sold_at ?? meta.sold_at ?? null,
    sold_to_customer_id: c.sold_to_customer_id ?? meta.sold_to_customer_id ?? null,
    sold_to_name: c.sold_to_name ?? meta.sold_to_name ?? (c.customers?.name || "—"),
    sold_price: c.sold_price ?? meta.sold_price ?? 0,
    sold_notes: c.sold_notes ?? meta.sold_notes ?? "",
    clean_notes: cleanNotes,
    purchased_at: rawPurchasedAt,
    purchased_date_str: purDate,
    meta,
  };
}

function buildNotesWithMeta(cleanNotes: string, meta: any) {
  const jsonStr = `__CYL_META__:${JSON.stringify(meta)}__END_CYL_META__`;
  return cleanNotes ? `${cleanNotes}\n${jsonStr}` : jsonStr;
}

function formatDateDisplay(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const cleanStr = String(dateStr).slice(0, 10);
  const parts = cleanStr.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    const [yyyy, mm, dd] = parts;
    return `${dd}/${mm}/${yyyy}`;
  }
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? cleanStr : d.toLocaleDateString("en-IN");
  } catch (e) {
    return cleanStr;
  }
}

function MyCylindersContent() {
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

  // Calendar Date Filter state
  const [dateRangeType, setDateRangeType] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Visual Real Calendar View Month state
  const [calViewYear, setCalViewYear] = useState(new Date().getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(new Date().getMonth());
  const [calTab, setCalTab] = useState<"calendar" | "presets" | "batches">("calendar");

  // Clicked Purchase Date Details Modal state
  const [viewDateModalDate, setViewDateModalDate] = useState<string | null>(null);

  // Multi-Date Selection Filter state
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [multiDateModalOpen, setMultiDateModalOpen] = useState(false);

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [sellModalCyl, setSellModalCyl] = useState<any | null>(null);
  const [damageModalCyl, setDamageModalCyl] = useState<any | null>(null);
  const [editModalCyl, setEditModalCyl] = useState<any | null>(null);

  // New Purchase / Multi-Batch Form State
  const [addFormHeader, setAddFormHeader] = useState({
    purchased_at: new Date().toISOString().slice(0, 10),
    supplier_name: "",
    batch_number: "",
    manufacture_year: String(new Date().getFullYear()),
  });

  const [batchRows, setBatchRows] = useState<Array<{ id: string; type_id: string; cylinder_numbers: string }>>([
    { id: "batch-1", type_id: "", cylinder_numbers: "" },
  ]);

  const addBatchRow = () => {
    setBatchRows((prev) => [
      ...prev,
      { id: `batch-${Date.now()}-${prev.length + 1}`, type_id: "", cylinder_numbers: "" },
    ]);
  };

  const removeBatchRow = (id: string) => {
    if (batchRows.length <= 1) return;
    setBatchRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateBatchRow = (id: string, updates: Partial<{ type_id: string; cylinder_numbers: string }>) => {
    setBatchRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

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
    try {
      setLoading(true);
      const [cylRes, typeRes, custRes] = await Promise.all([
        (supabase.from("cylinders") as any)
          .select("*, cylinder_types(code, name, price)")
          .order("created_at", { ascending: false }),
        supabase.from("cylinder_types").select("*").order("name"),
        supabase.from("customers").select("*").order("name"),
      ]);

      if (cylRes.error) {
        console.error("Cylinders fetch error:", cylRes.error);
      }

      const custMap = new Map((custRes.data ?? []).map((c: any) => [c.id, c]));
      const processedCyls = (cylRes.data ?? []).map((c: any) => ({
        ...c,
        customers: c.customers || (c.current_customer_id ? custMap.get(c.current_customer_id) : null),
      }));

      setCylinders(processedCyls);
      setTypes(typeRes.data ?? []);
      setCustomers(custRes.data ?? []);
    } catch (err: any) {
      console.error("Load data crash:", err);
      toast.error("Failed to load cylinders: " + (err?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [company]);

  // ── SAVE MULTI-BATCH NEW CYLINDERS ──
  const handleAddBatchCylinders = async () => {
    const validRows = batchRows.filter((r) => r.type_id && r.cylinder_numbers.trim());
    if (validRows.length === 0) {
      return toast.error("Please select a gas type and enter cylinder numbers for at least one batch");
    }

    let createdCount = 0;

    for (const r of validRows) {
      const parsedNums = parseBatchCylinderNumbers(r.cylinder_numbers);
      for (const rawNum of parsedNums) {
        const isPure = /^\d+$/.test(rawNum);
        const cylNum = isPure ? parseInt(rawNum, 10) : null;
        const serialNum = isPure ? `CYL-${rawNum.padStart(4, "0")}` : rawNum.toUpperCase();

        const meta = {
          supplier_name: addFormHeader.supplier_name.trim() || "—",
          batch_number: addFormHeader.batch_number.trim() || "—",
          manufacture_year: addFormHeader.manufacture_year.trim() || String(new Date().getFullYear()),
          is_damaged: false,
          damage_notes: "",
        };
        const formattedNotes = buildNotesWithMeta("", meta);

        const payload: any = {
          serial_number: serialNum,
          cylinder_number: cylNum,
          type_id: r.type_id,
          status: "in_stock",
          fill_status: "filled",
          purchased_at: new Date(addFormHeader.purchased_at).toISOString(),
          supplier_name: addFormHeader.supplier_name.trim() || null,
          batch_number: addFormHeader.batch_number.trim() || null,
          manufacture_year: parseInt(addFormHeader.manufacture_year, 10) || new Date().getFullYear(),
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
    }

    toast.success(`Successfully registered ${createdCount} cylinder(s) across ${validRows.length} gas type batch(es)! 🎉`);
    setAddModalOpen(false);
    setAddFormHeader({
      purchased_at: new Date().toISOString().slice(0, 10),
      supplier_name: "",
      batch_number: "",
      manufacture_year: String(new Date().getFullYear()),
    });
    setBatchRows([{ id: "batch-1", type_id: "", cylinder_numbers: "" }]);
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

    // Purchased Date Filter
    const cylDate = m.purchased_date_str;
    let matchesDate = true;

    if (selectedDates.length > 0) {
      matchesDate = selectedDates.includes(cylDate);
    } else {
      if (fromDate && cylDate) matchesDate = cylDate >= fromDate;
      if (toDate && cylDate && matchesDate) matchesDate = cylDate <= toDate;
    }

    return matchesSearch && matchesStatus && matchesType && matchesFill && matchesDate;
  });

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <Database className="h-10 w-10 text-primary animate-bounce" />
        <div className="text-sm font-extrabold text-foreground">Loading Cylinder Inventory...</div>
        <div className="text-xs text-muted-foreground">Fetching records and database assets</div>
      </div>
    );
  }

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

      {/* ── SEARCH & FILTERS BAR WITH REAL CALENDAR ── */}
      <Card className="bg-card border-border/60 p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
          {/* Search bar */}
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Cylinder #, Serial, Customer, Supplier, Bill #..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Gas Type Filter */}
          <div className="sm:col-span-1">
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

          {/* Real Calendar Trigger Button */}
          <div className="sm:col-span-1">
            <Button
              type="button"
              variant={selectedDates.length > 0 || fromDate || toDate ? "default" : "outline"}
              onClick={() => setMultiDateModalOpen(true)}
              className="w-full h-9 text-xs font-bold gap-2"
            >
              <Calendar className="h-4 w-4 shrink-0" />
              {selectedDates.length > 0
                ? `📅 ${selectedDates.length} Date(s) Selected`
                : fromDate || toDate
                ? `📅 Range Active`
                : "🗓️ Calendar Date Filter"}
            </Button>
          </div>
        </div>

        {/* Selected Dates Active Banner */}
        {selectedDates.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-border/40">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground font-medium">Showing {filteredCylinders.length} cylinders for {selectedDates.length} selected date(s):</span>
              {selectedDates.map((d) => (
                <span
                  key={d}
                  className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-primary/15 text-primary border border-primary/30 flex items-center gap-1"
                >
                  📅 {formatDateDisplay(d)}
                  <button
                    type="button"
                    onClick={() => setSelectedDates((prev) => prev.filter((item) => item !== d))}
                    className="hover:text-rose-400 font-bold ml-1 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 font-bold"
              onClick={() => setSelectedDates([])}
            >
              Clear Date Selection ✕
            </Button>
          </div>
        )}

        {selectedDates.length === 0 && (fromDate || toDate) && (
          <div className="flex items-center justify-between text-xs pt-2 border-t border-border/40 text-muted-foreground">
            <span>
              Showing cylinders purchased from <strong className="text-primary font-mono">{fromDate || "beginning"}</strong> to <strong className="text-primary font-mono">{toDate || "today"}</strong>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 font-bold"
              onClick={() => {
                setDateRangeType("all");
                setFromDate("");
                setToDate("");
              }}
            >
              Clear Date Filter ✕
            </Button>
          </div>
        )}
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
                <th className="text-left px-4 py-3">Bill Number</th>
                <th className="text-left px-4 py-3">Year</th>
                <th className="text-left px-4 py-3">Location / Holder</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-xs">
              {filteredCylinders.map((c) => {
                const m = getCylMeta(c);
                const isSold = c.status === "retired" || m.sold_at != null;
                const isDamaged = m.is_damaged || c.status === "damaged" || c.status === "maintenance";
                const purDateStr = formatDateDisplay(c.purchased_at);

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
                    <td className="px-4 py-3 font-mono">
                      {m.purchased_at ? (
                        <button
                          type="button"
                          onClick={() => setViewDateModalDate(m.purchased_date_str)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/50 transition-all cursor-pointer group"
                          title="Click to view all cylinders purchased on this date"
                        >
                          <Calendar className="h-3 w-3 text-primary group-hover:scale-110 transition-transform" />
                          {formatDateDisplay(m.purchased_at)}
                        </button>
                      ) : (
                        <span className="text-muted-foreground italic">—</span>
                      )}
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

      {/* ── MODAL: ADD CYLINDERS / BATCH PURCHASE (MULTI-TYPE SUPPORT) ── */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary pr-6">
              <Plus className="h-5 w-5 shrink-0" /> Add Cylinders / Batch Purchase
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Bill / Purchase Metadata */}
            <div className="p-3 rounded-lg border border-border/60 bg-secondary/30 space-y-3">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                📄 Purchase Bill Information
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Purchased Date *</Label>
                  <Input
                    type="date"
                    className="mt-1 h-9 text-xs"
                    value={addFormHeader.purchased_at}
                    onChange={(e) => setAddFormHeader({ ...addFormHeader, purchased_at: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Mfg / Purchase Year</Label>
                  <Input
                    type="number"
                    className="mt-1 h-9 font-mono text-xs"
                    value={addFormHeader.manufacture_year}
                    onChange={(e) => setAddFormHeader({ ...addFormHeader, manufacture_year: e.target.value })}
                    placeholder="e.g. 2025"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Supplier / Vendor Company</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    value={addFormHeader.supplier_name}
                    onChange={(e) => setAddFormHeader({ ...addFormHeader, supplier_name: e.target.value })}
                    placeholder="e.g. Surya Oxygen"
                  />
                </div>
                <div>
                  <Label className="text-xs">Bill Number</Label>
                  <Input
                    className="mt-1 h-9 font-mono text-xs"
                    value={addFormHeader.batch_number}
                    onChange={(e) => setAddFormHeader({ ...addFormHeader, batch_number: e.target.value })}
                    placeholder="e.g. BILL-1029"
                  />
                </div>
              </div>
            </div>

            {/* Dynamic Gas Type Batch Rows */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-foreground">
                <span className="flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-primary" /> Gas Type Batches ({batchRows.length})
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">Add multiple gas types in 1 bill</span>
              </div>

              {batchRows.map((r, idx) => {
                const parsedCount = parseBatchCylinderNumbers(r.cylinder_numbers).length;
                const selType = types.find((t) => t.id === r.type_id);
                return (
                  <div
                    key={r.id}
                    className="p-3.5 rounded-lg border-l-4 border-l-primary border border-border/70 bg-card/60 space-y-3 shadow-xs relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-primary" />
                        Batch #{idx + 1} {selType ? `(${selType.code})` : ""}
                      </span>
                      {batchRows.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeBatchRow(r.id)}
                          className="h-6 px-2 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 font-semibold"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove Batch
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs font-semibold">Gas / Cylinder Type *</Label>
                        <Select value={r.type_id} onValueChange={(v) => updateBatchRow(r.id, { type_id: v })}>
                          <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            {types.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.code} — {t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs font-bold text-emerald-400">Cylinder Numbers / Ranges *</Label>
                        <Textarea
                          value={r.cylinder_numbers}
                          onChange={(e) => updateBatchRow(r.id, { cylinder_numbers: e.target.value })}
                          onKeyDown={(e) => handleSpaceAutoComma(e, r.cylinder_numbers, (v) => updateBatchRow(r.id, { cylinder_numbers: v }))}
                          placeholder="e.g. 201-220, A101-A120"
                          rows={2}
                          className="font-mono text-xs mt-1"
                        />
                      </div>
                    </div>

                    {parsedCount > 0 && (
                      <div className="text-[10px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 w-fit">
                        ✅ {parsedCount} cylinder(s) parsed for this type
                      </div>
                    )}
                  </div>
                );
              })}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addBatchRow}
                className="w-full h-9 text-xs font-bold gap-1.5 border-dashed border-primary/50 hover:bg-primary/10 text-primary transition-all"
              >
                <Plus className="h-4 w-4" /> Add Another Gas Type Batch
              </Button>
            </div>

            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <span>💡 Type cylinder numbers and press</span>
              <kbd className="px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[9px] border border-border">Spacebar</kbd>
              <span>to insert comma automatically!</span>
            </div>

            <Button onClick={handleAddBatchCylinders} className="w-full h-10 font-bold text-xs uppercase tracking-wider gap-2">
              <Package className="h-4 w-4" /> Save All Batches to Inventory
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
                  <Label className="text-xs">Bill Number</Label>
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

      {/* ── MODAL: PURCHASE DATE BATCH DETAILS REPORT ── */}
      <Dialog open={!!viewDateModalDate} onOpenChange={(v) => !v && setViewDateModalDate(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary pr-6">
              <Calendar className="h-5 w-5 shrink-0" />
              Purchase Batch Report — {viewDateModalDate ? formatDateDisplay(viewDateModalDate) : ""}
            </DialogTitle>
          </DialogHeader>

          {viewDateModalDate && (() => {
            const dateCyls = cylinders.filter(
              (c) => (safeSlice10(c.purchased_at) || safeSlice10(c.created_at)) === viewDateModalDate
            );

            // Compute type breakdown
            const typeCounts: Record<string, number> = {};
            dateCyls.forEach((c) => {
              const code = c.cylinder_types?.code || "Unknown";
              typeCounts[code] = (typeCounts[code] || 0) + 1;
            });

            const uniqueSuppliers = Array.from(new Set(dateCyls.map((c) => getCylMeta(c).supplier_name).filter((s) => s !== "—")));
            const uniqueBills = Array.from(new Set(dateCyls.map((c) => getCylMeta(c).batch_number).filter((b) => b !== "—")));

            return (
              <div className="space-y-4 pt-1">
                {/* Stats Header */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-0.5">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Total Purchased</div>
                    <div className="text-xl font-black font-mono text-primary">{dateCyls.length} Cylinders</div>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50 border border-border/60 space-y-0.5">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Supplier / Vendor</div>
                    <div className="text-sm font-bold text-foreground truncate">
                      {uniqueSuppliers.length > 0 ? uniqueSuppliers.join(", ") : "—"}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50 border border-border/60 space-y-0.5">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Bill Number(s)</div>
                    <div className="text-sm font-bold font-mono text-foreground truncate">
                      {uniqueBills.length > 0 ? uniqueBills.join(", ") : "—"}
                    </div>
                  </div>
                </div>

                {/* Gas Type Breakdown */}
                <div className="p-3 rounded-lg border border-border/60 bg-secondary/20 space-y-2">
                  <div className="text-xs font-bold text-foreground">🧪 Gas Types Breakdown:</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(typeCounts).map(([code, cnt]) => (
                      <span key={code} className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-primary/15 text-primary border border-primary/30">
                        {code}: {cnt} cylinder(s)
                      </span>
                    ))}
                  </div>
                </div>

                {/* Cylinders List Table */}
                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/70 text-[10px] uppercase font-bold text-muted-foreground border-b border-border/60 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2">Cylinder #</th>
                          <th className="text-left px-3 py-2">Serial #</th>
                          <th className="text-left px-3 py-2">Gas Type</th>
                          <th className="text-left px-3 py-2">Bill Number</th>
                          <th className="text-left px-3 py-2">Location / Holder</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 font-mono">
                        {dateCyls.map((c) => {
                          const m = getCylMeta(c);
                          const isSold = c.status === "retired" || m.sold_at != null;
                          const isDamaged = m.is_damaged || c.status === "damaged" || c.status === "maintenance";
                          return (
                            <tr key={c.id} className="hover:bg-secondary/30">
                              <td className="px-3 py-2 font-bold text-primary">#{c.cylinder_number ?? c.serial_number}</td>
                              <td className="px-3 py-2 text-muted-foreground">{c.serial_number}</td>
                              <td className="px-3 py-2 font-bold">{c.cylinder_types?.code ?? "—"}</td>
                              <td className="px-3 py-2">{m.batch_number}</td>
                              <td className="px-3 py-2 font-sans">
                                {isSold ? (
                                  <span className="text-purple-400 font-bold">💰 Sold ({m.sold_to_name})</span>
                                ) : isDamaged ? (
                                  <span className="text-rose-400 font-bold">⚠️ Damaged</span>
                                ) : c.customers ? (
                                  <span className="text-amber-400 font-medium">👤 {c.customers.name}</span>
                                ) : (
                                  <span className="text-emerald-400 font-medium">📦 Warehouse</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <Button
                  onClick={() => {
                    setSelectedDates([viewDateModalDate]);
                    setViewDateModalDate(null);
                  }}
                  className="w-full h-9 font-bold text-xs gap-1.5"
                >
                  <Filter className="h-4 w-4" /> Filter Inventory Table by This Date Only ({dateCyls.length} cylinders)
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── MODAL: REAL INTERACTIVE MONTHLY CALENDAR CONTAINER ── */}
      <Dialog open={multiDateModalOpen} onOpenChange={setMultiDateModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary pr-6">
              <Calendar className="h-5 w-5 shrink-0" /> Interactive Calendar & Date Filters
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* View Mode Tabs */}
            <div className="flex p-1 bg-secondary/50 rounded-lg text-xs font-bold gap-1 border border-border/50">
              <button
                type="button"
                onClick={() => setCalTab("calendar")}
                className={cn(
                  "flex-1 py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  calTab === "calendar" ? "bg-background text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Calendar className="h-3.5 w-3.5" /> Calendar Grid
              </button>
              <button
                type="button"
                onClick={() => setCalTab("presets")}
                className={cn(
                  "flex-1 py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  calTab === "presets" ? "bg-background text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Filter className="h-3.5 w-3.5" /> Presets & Range
              </button>
              <button
                type="button"
                onClick={() => setCalTab("batches")}
                className={cn(
                  "flex-1 py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  calTab === "batches" ? "bg-background text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Package className="h-3.5 w-3.5" /> Batches List
              </button>
            </div>

            {/* TAB 1: REAL VISUAL MONTHLY CALENDAR GRID */}
            {calTab === "calendar" && (() => {
              const monthNames = [
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
              ];
              const firstDayIndex = new Date(calViewYear, calViewMonth, 1).getDay();
              const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();

              const days = [];
              for (let i = 0; i < firstDayIndex; i++) days.push(null);
              for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${calViewYear}-${String(calViewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                days.push({ dayNum: d, dateStr });
              }

              // Mapping purchase dates to count
              const purchaseMap: Record<string, number> = {};
              cylinders.forEach((c) => {
                const d = safeSlice10(c.purchased_at) || safeSlice10(c.created_at);
                if (d) purchaseMap[d] = (purchaseMap[d] || 0) + 1;
              });

              return (
                <div className="space-y-3 p-3 rounded-xl border border-border/70 bg-card/60 shadow-xs">
                  {/* Month Navigation */}
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs font-bold px-2"
                      onClick={() => {
                        if (calViewMonth === 0) {
                          setCalViewMonth(11);
                          setCalViewYear((y) => y - 1);
                        } else setCalViewMonth((m) => m - 1);
                      }}
                    >
                      ← Prev
                    </Button>

                    <div className="text-sm font-extrabold font-mono text-foreground flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-primary" />
                      {monthNames[calViewMonth]} {calViewYear}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs font-bold px-2"
                      onClick={() => {
                        if (calViewMonth === 11) {
                          setCalViewMonth(0);
                          setCalViewYear((y) => y + 1);
                        } else setCalViewMonth((m) => m + 1);
                      }}
                    >
                      Next →
                    </Button>
                  </div>

                  {/* Weekday headers */}
                  <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                  </div>

                  {/* Days grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {days.map((item, idx) => {
                      if (!item) return <div key={`empty-${idx}`} className="h-12 sm:h-14 rounded-lg bg-secondary/10 opacity-30" />;
                      const { dayNum, dateStr } = item;
                      const count = purchaseMap[dateStr] || 0;
                      const isSelected = selectedDates.includes(dateStr);
                      const isToday = dateStr === new Date().toISOString().slice(0, 10);

                      return (
                        <button
                          key={dateStr}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedDates((prev) => prev.filter((d) => d !== dateStr));
                            } else {
                              setSelectedDates((prev) => [...prev, dateStr]);
                            }
                          }}
                          className={cn(
                            "h-12 sm:h-14 p-1 rounded-lg border flex flex-col justify-between text-left transition-all cursor-pointer relative",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary font-bold shadow-md scale-105 z-10"
                              : count > 0
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-400 font-bold hover:bg-amber-500/25"
                              : "bg-secondary/30 border-border/40 text-foreground hover:bg-secondary"
                          )}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className={cn("text-xs font-mono font-bold", isToday && !isSelected && "text-primary underline")}>
                              {dayNum}
                            </span>
                            {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground shrink-0" />}
                          </div>
                          {count > 0 && (
                            <span
                              className={cn(
                                "text-[9px] font-mono px-1 rounded font-extrabold self-start truncate max-w-full",
                                isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-amber-500/20 text-amber-400"
                              )}
                            >
                              📦 {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* TAB 2: PRESETS & RANGE */}
            {calTab === "presets" && (
              <div className="space-y-4 p-3 rounded-xl border border-border/70 bg-card/60">
                <div className="space-y-2">
                  <div className="text-xs font-bold text-foreground">⚡ Quick Presets:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs font-bold justify-start"
                      onClick={() => {
                        setDateRangeType("all");
                        setFromDate("");
                        setToDate("");
                        setSelectedDates([]);
                        setMultiDateModalOpen(false);
                      }}
                    >
                      📅 All Time (Any Date)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs font-bold justify-start"
                      onClick={() => {
                        const today = new Date().toISOString().slice(0, 10);
                        setSelectedDates([today]);
                        setMultiDateModalOpen(false);
                      }}
                    >
                      ⚡ Purchased Today
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs font-bold justify-start"
                      onClick={() => {
                        const today = new Date().toISOString().slice(0, 10);
                        const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
                        setFromDate(firstDay);
                        setToDate(today);
                        setSelectedDates([]);
                        setMultiDateModalOpen(false);
                      }}
                    >
                      📅 Purchased This Month
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs font-bold justify-start"
                      onClick={() => {
                        const today = new Date().toISOString().slice(0, 10);
                        const janFirst = `${new Date().getFullYear()}-01-01`;
                        setFromDate(janFirst);
                        setToDate(today);
                        setSelectedDates([]);
                        setMultiDateModalOpen(false);
                      }}
                    >
                      🗓️ Purchased This Year
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border/40 pt-3">
                  <div className="text-xs font-bold text-foreground">✏️ Date Range (From → To):</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">From Date</Label>
                      <Input
                        type="date"
                        className="mt-1 h-9 text-xs font-mono"
                        value={fromDate}
                        onChange={(e) => {
                          setFromDate(e.target.value);
                          setSelectedDates([]);
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">To Date</Label>
                      <Input
                        type="date"
                        className="mt-1 h-9 text-xs font-mono"
                        value={toDate}
                        onChange={(e) => {
                          setToDate(e.target.value);
                          setSelectedDates([]);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: BATCHES LIST */}
            {calTab === "batches" && (() => {
              const allDatesMap: Record<string, { count: number; suppliers: string[] }> = {};
              cylinders.forEach((c) => {
                const d = safeSlice10(c.purchased_at) || safeSlice10(c.created_at);
                if (!d) return;
                if (!allDatesMap[d]) allDatesMap[d] = { count: 0, suppliers: [] };
                allDatesMap[d].count += 1;
                const supp = getCylMeta(c).supplier_name;
                if (supp !== "—" && !allDatesMap[d].suppliers.includes(supp)) allDatesMap[d].suppliers.push(supp);
              });

              const sortedDates = Object.keys(allDatesMap).sort((a, b) => b.localeCompare(a));

              return (
                <div className="space-y-2.5 p-3 rounded-xl border border-border/70 bg-card/60">
                  <div className="flex items-center justify-between text-xs font-bold text-foreground">
                    <span>Available Purchase Dates ({sortedDates.length})</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedDates(sortedDates)}
                        className="text-[10px] text-primary hover:underline font-bold cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-muted-foreground">•</span>
                      <button
                        type="button"
                        onClick={() => setSelectedDates([])}
                        className="text-[10px] text-rose-400 hover:underline font-bold cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto p-1">
                    {sortedDates.map((d) => {
                      const isSel = selectedDates.includes(d);
                      const info = allDatesMap[d];
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            if (isSel) setSelectedDates((prev) => prev.filter((item) => item !== d));
                            else setSelectedDates((prev) => [...prev, d]);
                          }}
                          className={cn(
                            "p-2.5 rounded-lg border text-left transition-all cursor-pointer space-y-1",
                            isSel
                              ? "bg-primary/15 border-primary text-foreground shadow-xs scale-[1.02]"
                              : "bg-secondary/40 border-border/60 hover:bg-secondary text-muted-foreground"
                          )}
                        >
                          <div className="flex items-center justify-between text-xs font-bold font-mono">
                            <span>📅 {formatDateDisplay(d)}</span>
                            {isSel && <span className="text-primary text-[10px] font-bold">✓ Selected</span>}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex justify-between items-center">
                            <span>📦 {info.count} cylinder(s)</span>
                            {info.suppliers.length > 0 && <span className="truncate max-w-[100px] text-[9px]">{info.suppliers[0]}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Selected Dates Summary Badges */}
            {selectedDates.length > 0 && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-foreground">
                  <span>Selected Dates ({selectedDates.length}):</span>
                  <button
                    type="button"
                    onClick={() => setSelectedDates([])}
                    className="text-[10px] text-rose-400 hover:underline font-bold cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {selectedDates.map((d) => (
                    <span
                      key={d}
                      className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-primary/20 text-primary border border-primary/40 flex items-center gap-1"
                    >
                      📅 {formatDateDisplay(d)}
                      <button
                        type="button"
                        onClick={() => setSelectedDates((prev) => prev.filter((item) => item !== d))}
                        className="hover:text-rose-400 font-bold ml-1 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={() => setMultiDateModalOpen(false)}
              className="w-full h-11 font-bold text-xs uppercase tracking-wider gap-2 text-white bg-primary hover:bg-primary/90 shadow-md"
            >
              APPLY FILTER ({selectedDates.length > 0 ? `${selectedDates.length} DATE(S)` : "ALL DATES"})
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

class CylinderErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Cylinder page error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center max-w-lg mx-auto">
          <AlertTriangle className="h-12 w-12 text-amber-500 animate-bounce" />
          <h2 className="text-lg font-bold text-foreground">Cylinder Inventory Error</h2>
          <p className="text-xs text-muted-foreground font-mono bg-secondary/50 p-3 rounded border border-border/60 text-left w-full overflow-x-auto">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <Button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="font-bold text-xs gap-2 shadow-md"
          >
            🔄 Reload Inventory Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function MyCylinders() {
  return (
    <CylinderErrorBoundary>
      <MyCylindersContent />
    </CylinderErrorBoundary>
  );
}
