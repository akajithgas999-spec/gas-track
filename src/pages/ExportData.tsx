import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Download, FileSpreadsheet, Users, Package, Receipt,
  ShoppingCart, Cylinder, BarChart3, CheckCircle2, Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

type ExportRange = "all" | "day" | "month" | "year";

const SECTIONS = [
  { key: "customers",    label: "Customers",         icon: Users },
  { key: "cylinders",    label: "Cylinders",          icon: Cylinder },
  { key: "invoices",     label: "Sales / Invoices",   icon: Receipt },
  { key: "purchases",    label: "Purchases",          icon: ShoppingCart },
  { key: "suppliers",    label: "Suppliers",          icon: Package },
  { key: "transactions", label: "Transactions",       icon: BarChart3 },
];

export default function ExportData() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [range, setRange] = useState<ExportRange>("all");
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Build a date filter for each table based on range
  const getDateBounds = (): { from: string; to: string } | null => {
    if (range === "all") return null;
    if (range === "day") return { from: dateFrom + "T00:00:00", to: dateFrom + "T23:59:59" };
    if (range === "month") {
      const [y, m] = month.split("-");
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      return { from: `${month}-01T00:00:00`, to: `${month}-${String(lastDay).padStart(2, "0")}T23:59:59` };
    }
    if (range === "year") {
      return { from: `${year}-01-01T00:00:00`, to: `${year}-12-31T23:59:59` };
    }
    return null;
  };

  const fetchWithDate = async (table: string, dateCol: string, bounds: { from: string; to: string } | null) => {
    let q = (supabase.from(table) as any).select("*");
    if (bounds) {
      q = q.gte(dateCol, bounds.from).lte(dateCol, bounds.to);
    }
    const { data, error } = await q.order(dateCol, { ascending: false });
    if (error) { console.error(table, error); return []; }
    return data ?? [];
  };

  const exportAll = async () => {
    setLoading(true);
    setDone(false);
    const bounds = getDateBounds();

    try {
      // Fetch all tables in parallel
      const [
        customers, cylinders, cylinder_types,
        invoices, invoice_items,
        purchases, purchase_items,
        suppliers, transactions, deposits,
      ] = await Promise.all([
        fetchWithDate("customers", "created_at", bounds),
        fetchWithDate("cylinders", "created_at", bounds),
        (supabase.from("cylinder_types") as any).select("*").then((r: any) => r.data ?? []),
        fetchWithDate("invoices", "billing_date", bounds),
        fetchWithDate("invoice_items", "created_at", bounds),
        fetchWithDate("purchases", "bill_date", bounds),
        fetchWithDate("purchase_items", "created_at", bounds),
        (supabase.from("suppliers") as any).select("*").then((r: any) => r.data ?? []),
        fetchWithDate("transactions", "occurred_at", bounds),
        fetchWithDate("customer_deposits", "occurred_at", bounds),
      ]);

      const newCounts = {
        customers: customers.length,
        cylinders: cylinders.length,
        invoices: invoices.length,
        purchases: purchases.length,
        suppliers: suppliers.length,
        transactions: transactions.length,
      };
      setCounts(newCounts);

      const wb = XLSX.utils.book_new();

      // ── Sheet 1: SUMMARY ──
      const rangeLbl = range === "all" ? "All Time"
        : range === "day" ? `Day: ${dateFrom}`
        : range === "month" ? `Month: ${month}`
        : `Year: ${year}`;

      const summaryData = [
        ["GAS TRACK — Export Summary"],
        ["Generated", new Date().toLocaleString("en-IN")],
        ["Period", rangeLbl],
        [],
        ["Table", "Records"],
        ["Customers", customers.length],
        ["Cylinders", cylinders.length],
        ["Cylinder Types", cylinder_types.length],
        ["Invoices", invoices.length],
        ["Invoice Items", invoice_items.length],
        ["Purchases", purchases.length],
        ["Purchase Items", purchase_items.length],
        ["Suppliers", suppliers.length],
        ["Transactions", transactions.length],
        ["Customer Deposits", deposits.length],
        [],
        ["Financial Summary"],
        ["Total Invoice Value (₹)", invoices.reduce((a: number, r: any) => a + Number(r.total ?? 0), 0)],
        ["Total Paid (₹)", invoices.filter((r: any) => r.status === "paid").reduce((a: number, r: any) => a + Number(r.total ?? 0), 0)],
        ["Total Pending (₹)", invoices.filter((r: any) => r.status === "pending").reduce((a: number, r: any) => a + Number(r.total ?? 0), 0)],
        ["Total Purchase Value (₹)", purchases.reduce((a: number, r: any) => a + Number(r.total ?? 0), 0)],
      ];
      const ws0 = XLSX.utils.aoa_to_sheet(summaryData);
      ws0["!cols"] = [{ wch: 30 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, ws0, "Summary");

      // ── Sheet 2: CUSTOMERS ──
      if (customers.length > 0) {
        const rows = customers.map((r: any) => ({
          "Customer #": r.customer_number,
          "Name": r.name,
          "Phone": r.phone ?? "",
          "Email": r.email ?? "",
          "GSTIN": r.gst_number ?? "",
          "Address": r.address ?? "",
          "Deposit Balance (₹)": Number(r.deposit_balance ?? 0),
          "Notes": r.notes ?? "",
          "Created": r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, "Customers");
      }

      // ── Sheet 3: INVOICES ──
      if (invoices.length > 0) {
        const rows = invoices.map((r: any) => ({
          "Invoice #": r.invoice_number,
          "Date": r.billing_date,
          "Return Date": r.return_date ?? "",
          "Customer ID": r.customer_id,
          "GSTIN": r.gst_number ?? "",
          "Taxable (₹)": Number(r.taxable_amount ?? 0),
          "Discount (₹)": Number(r.discount ?? 0),
          "CGST %": Number(r.cgst_rate ?? 0),
          "CGST (₹)": Number(r.cgst_amount ?? 0),
          "SGST %": Number(r.sgst_rate ?? 0),
          "SGST (₹)": Number(r.sgst_amount ?? 0),
          "Total (₹)": Number(r.total ?? 0),
          "Status": r.status,
          "Issued Cylinders": (r.issued_cylinder_numbers ?? []).map((n: number) => `#${n}`).join(", "),
          "Returned Cylinders": (r.returned_cylinder_numbers ?? []).map((n: number) => `#${n}`).join(", "),
          "Notes": r.notes ?? "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 36 }, { wch: 18 },
          { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 12 },
          { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, "Invoices");
      }

      // ── Sheet 4: INVOICES by Month ──
      if (invoices.length > 0) {
        type MonthEntry = { month: string; count: number; total: number; paid: number; pending: number };
        const byMonth: Record<string, MonthEntry> = {};
        for (const r of invoices) {
          const m = (r.billing_date ?? "").slice(0, 7);
          if (!byMonth[m]) byMonth[m] = { month: m, count: 0, total: 0, paid: 0, pending: 0 };
          byMonth[m].count++;
          byMonth[m].total += Number(r.total ?? 0);
          if (r.status === "paid") byMonth[m].paid += Number(r.total ?? 0);
          if (r.status === "pending") byMonth[m].pending += Number(r.total ?? 0);
        }
        const monthRows = Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month)).map((m) => ({
          "Month": m.month,
          "Invoices": m.count,
          "Total (₹)": m.total,
          "Paid (₹)": m.paid,
          "Pending (₹)": m.pending,
        }));
        const ws = XLSX.utils.json_to_sheet(monthRows);
        ws["!cols"] = [{ wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, "Invoices by Month");
      }

      // ── Sheet 5: PURCHASES ──
      if (purchases.length > 0) {
        const rows = purchases.map((r: any) => ({
          "Purchase #": r.purchase_number,
          "Bill Date": r.bill_date,
          "Bill #": r.bill_number ?? "",
          "Challan #": r.challan_number ?? "",
          "Supplier ID": r.supplier_id ?? "",
          "GSTIN": r.gst_number ?? "",
          "Taxable (₹)": Number(r.taxable_amount ?? 0),
          "CGST (₹)": Number(r.cgst_amount ?? 0),
          "SGST (₹)": Number(r.sgst_amount ?? 0),
          "Total (₹)": Number(r.total ?? 0),
          "Notes": r.notes ?? "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 36 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, "Purchases");
      }

      // ── Sheet 6: CYLINDERS ──
      if (cylinders.length > 0) {
        const rows = cylinders.map((r: any) => ({
          "Cylinder #": r.cylinder_number ?? "",
          "Serial": r.serial_number,
          "Type ID": r.type_id,
          "Status": r.status,
          "Fill Status": r.fill_status ?? "filled",
          "Customer ID": r.current_customer_id ?? "",
          "Notes": r.notes ?? "",
          "Issued At": r.issued_at ? new Date(r.issued_at).toLocaleDateString("en-IN") : "",
          "Created": r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 36 }, { wch: 12 }, { wch: 12 }, { wch: 36 }, { wch: 20 }, { wch: 12 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, "Cylinders");
      }

      // ── Sheet 7: SUPPLIERS ──
      if (suppliers.length > 0) {
        const rows = suppliers.map((r: any) => ({
          "Name": r.name,
          "Phone": r.phone ?? "",
          "Email": r.email ?? "",
          "GSTIN": r.gst_number ?? "",
          "Address": r.address ?? "",
          "Notes": r.notes ?? "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 28 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
      }

      // ── Sheet 8: TRANSACTIONS ──
      if (transactions.length > 0) {
        const rows = transactions.map((r: any) => ({
          "Type": r.txn_type,
          "Date": r.occurred_at ? new Date(r.occurred_at).toLocaleDateString("en-IN") : "",
          "Cylinder ID": r.cylinder_id,
          "Customer ID": r.customer_id ?? "",
          "Type ID": r.type_id,
          "Amount (₹)": Number(r.amount ?? 0),
          "Notes": r.notes ?? "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 36 }, { wch: 36 }, { wch: 36 }, { wch: 12 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, "Transactions");
      }

      // ── Sheet 9: DEPOSITS ──
      if (deposits.length > 0) {
        const rows = deposits.map((r: any) => ({
          "Date": r.occurred_at ? new Date(r.occurred_at).toLocaleDateString("en-IN") : "",
          "Customer ID": r.customer_id,
          "Type": r.type,
          "Amount (₹)": Number(r.amount ?? 0),
          "Notes": r.notes ?? "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 12 }, { wch: 36 }, { wch: 12 }, { wch: 14 }, { wch: 24 }];
        XLSX.utils.book_append_sheet(wb, ws, "Deposits");
      }

      // ── Sheet 10: Daily Sales (invoices grouped by day) ──
      if (invoices.length > 0) {
        type DayEntry = { day: string; count: number; total: number };
        const byDay: Record<string, DayEntry> = {};
        for (const r of invoices) {
          const d = r.billing_date ?? "";
          if (!byDay[d]) byDay[d] = { day: d, count: 0, total: 0 };
          byDay[d].count++;
          byDay[d].total += Number(r.total ?? 0);
        }
        const dayRows = Object.values(byDay).sort((a, b) => b.day.localeCompare(a.day)).map((d) => ({
          "Date": d.day,
          "Invoices": d.count,
          "Total (₹)": d.total,
        }));
        const ws = XLSX.utils.json_to_sheet(dayRows);
        ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, "Daily Sales");
      }

      // Write the file
      const label = range === "all" ? "all-time"
        : range === "day" ? dateFrom
        : range === "month" ? month
        : year;
      XLSX.writeFile(wb, `gas-track-export-${label}.xlsx`);
      setDone(true);
      toast.success("Export downloaded successfully!");
    } catch (err: any) {
      toast.error("Export failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-1 pb-2">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-3" style={{ background: "var(--gradient-primary)" }}>
          <FileSpreadsheet className="h-7 w-7 text-primary-foreground" />
        </div>
        <h2 className="text-2xl font-bold">Export All Data</h2>
        <p className="text-sm text-muted-foreground">Download your complete Supabase database as an Excel file for offline use</p>
      </div>

      {/* Range selector */}
      <Card className="bg-card border-border/60 p-5 space-y-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Select Date Range</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(["all", "day", "month", "year"] as ExportRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                range === r
                  ? "bg-primary text-primary-foreground border-primary shadow-[0_0_12px_hsl(var(--primary)/0.4)]"
                  : "border-border/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {r === "all" ? "All Time" : r === "day" ? "Single Day" : r === "month" ? "Month" : "Year"}
            </button>
          ))}
        </div>

        {/* Date inputs */}
        {range === "day" && (
          <div>
            <Label className="text-xs text-muted-foreground">Select Date</Label>
            <Input type="date" className="mt-1 max-w-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
        )}
        {range === "month" && (
          <div>
            <Label className="text-xs text-muted-foreground">Select Month</Label>
            <Input type="month" className="mt-1 max-w-xs" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        )}
        {range === "year" && (
          <div>
            <Label className="text-xs text-muted-foreground">Select Year</Label>
            <Input type="number" className="mt-1 max-w-xs font-mono" value={year} onChange={(e) => setYear(e.target.value)} min="2020" max="2099" />
          </div>
        )}
      </Card>

      {/* What will be exported */}
      <Card className="bg-card border-border/60 p-5 space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Sheets Included in Export</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { label: "Summary", sub: "Overview & financials" },
            { label: "Customers", sub: counts.customers ? `${counts.customers} records` : "All customers" },
            { label: "Invoices", sub: counts.invoices ? `${counts.invoices} records` : "All invoices" },
            { label: "Invoices by Month", sub: "Monthly breakdown" },
            { label: "Daily Sales", sub: "Day-by-day totals" },
            { label: "Purchases", sub: counts.purchases ? `${counts.purchases} records` : "All purchases" },
            { label: "Cylinders", sub: counts.cylinders ? `${counts.cylinders} records` : "All cylinders" },
            { label: "Suppliers", sub: counts.suppliers ? `${counts.suppliers} records` : "All suppliers" },
            { label: "Transactions", sub: "Issue/return log" },
            { label: "Deposits", sub: "Customer deposits" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30 border border-border/40">
              <div className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
              <div>
                <div className="text-xs font-semibold">{s.label}</div>
                <div className="text-[10px] text-muted-foreground">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Export button */}
      <Button
        onClick={exportAll}
        disabled={loading}
        className="w-full h-14 text-base font-bold gap-3 shadow-[0_0_24px_hsl(var(--primary)/0.3)] hover:shadow-[0_0_32px_hsl(var(--primary)/0.5)] transition-all"
      >
        {loading ? (
          <><Loader2 className="h-5 w-5 animate-spin" /> Exporting…</>
        ) : done ? (
          <><CheckCircle2 className="h-5 w-5" /> Export Complete — Download Again</>
        ) : (
          <><Download className="h-5 w-5" /> Export to Excel (.xlsx)</>
        )}
      </Button>

      {done && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-center text-sm text-success font-semibold">
          ✓ File downloaded to your computer. Open it in Excel, Google Sheets, or any spreadsheet app.
        </div>
      )}
    </div>
  );
}
