import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Download, FileSpreadsheet, Users, Package, Receipt,
  ShoppingCart, Cylinder, BarChart3, CheckCircle2, Loader2, UserCheck,
  ChevronsUpDown, Check, Search,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

  // ── Single customer export state ────────────────────────────────
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [custLoading, setCustLoading] = useState(false);
  const [custDone, setCustDone] = useState(false);

  useEffect(() => {
    (supabase.from("customers") as any)
      .select("id, customer_number, name, phone, email, gst_number, address, deposit_balance, notes, created_at")
      .order("customer_number")
      .then(({ data }: any) => setCustomers(data ?? []));
  }, []);
  // ────────────────────────────────────────────────────────────────

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

      // ── Sheet: Customer Statements (Side-by-Side Table matching Image 2) ──
      if (customers.length > 0) {
        const wsMulti = buildSideBySideMultiCustomerSheet(customers, invoices, transactions, cylinders);
        XLSX.utils.book_append_sheet(wb, wsMulti, "Customer Statements");
      }

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

  const { company } = useCompany();

  // ── Helper to format date into DD/MM/YYYY ─────────────────────────
  const formatDateStr = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "";
    const clean = dateStr.slice(0, 10);
    const parts = clean.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
    }
    return dateStr;
  };

  // ── Extract complete statement rows for a customer ─────────────────
  const getCustomerStatementRows = (
    cust: any,
    allInvoices: any[],
    allTransactions: any[],
    allCylinders: any[]
  ) => {
    const custInvoices = allInvoices.filter((inv) => inv.customer_id === cust.id);
    const custTxns = allTransactions.filter((t) => t.customer_id === cust.id);
    const custCyls = allCylinders.filter((c) => c.current_customer_id === cust.id);

    const rows: { issueDate: string; billNo: string; full: string; empty: string; returnDate: string }[] = [];
    const processedKeys = new Set<string>();

    // 1. Process Invoices
    custInvoices.forEach((inv: any) => {
      const issueDateStr = formatDateStr(inv.billing_date);
      const billNo = inv.invoice_number ?? "";
      const returnDateStr = formatDateStr(inv.return_date);

      const items = inv.invoice_items ?? [];
      const issuedNums: (number | string)[] = inv.issued_cylinder_numbers ?? [];
      const returnedNums: (number | string)[] = inv.returned_cylinder_numbers ?? [];

      let cylIdx = 0;
      const invRows: { full: string; empty: string; returnDate: string }[] = [];

      if (items.length > 0) {
        items.forEach((item: any) => {
          const code = (item.cylinder_types?.code || item.description?.split(" ")[0] || "CYL").trim();
          const qty = Math.max(1, Number(item.quantity) || 1);

          for (let q = 0; q < qty; q++) {
            const issuedNum = issuedNums[cylIdx];
            const returnedNum = returnedNums[cylIdx];
            cylIdx++;

            let fullVal = "";
            let emptyVal = "";

            if (issuedNum !== undefined && issuedNum !== null && String(issuedNum).trim() !== "") {
              const numStr = String(issuedNum).trim();
              if (code.toUpperCase() === "DA" && !numStr.toUpperCase().startsWith("DA")) {
                fullVal = `DA-${numStr}`;
              } else if (numStr.toUpperCase().startsWith("DA") || numStr.includes("-")) {
                fullVal = numStr;
              } else {
                fullVal = `${numStr}-${code}`;
              }
            } else {
              fullVal = `${code}`;
            }

            if (returnedNum !== undefined && returnedNum !== null && String(returnedNum).trim() !== "") {
              const retStr = String(returnedNum).trim();
              if (code.toUpperCase() === "DA" && !retStr.toUpperCase().startsWith("DA")) {
                emptyVal = `DA-${retStr}`;
              } else {
                emptyVal = retStr;
              }
            }

            invRows.push({
              full: fullVal,
              empty: emptyVal,
              returnDate: emptyVal ? (returnDateStr || issueDateStr) : "",
            });
          }
        });
      } else if (issuedNums.length > 0) {
        issuedNums.forEach((issuedNum, idx) => {
          const returnedNum = returnedNums[idx];
          let emptyVal = "";
          if (returnedNum !== undefined && returnedNum !== null && String(returnedNum).trim() !== "") {
            emptyVal = String(returnedNum).trim();
          }
          invRows.push({
            full: String(issuedNum),
            empty: emptyVal,
            returnDate: emptyVal ? (returnDateStr || issueDateStr) : "",
          });
        });
      }

      invRows.forEach((r, idx) => {
        processedKeys.add(`${billNo}_${r.full}`);
        rows.push({
          issueDate: idx === 0 ? issueDateStr : "",
          billNo: idx === 0 ? billNo : "",
          full: r.full,
          empty: r.empty,
          returnDate: r.returnDate,
        });
      });
    });

    // 2. Process Transactions (issues/returns not in invoices)
    custTxns.forEach((t: any) => {
      if (t.txn_type === "issue") {
        const code = t.cylinder_types?.code || "CYL";
        const cylNum = t.cylinders?.cylinder_number || t.cylinders?.serial_number || "";
        const fullVal = cylNum ? (code.toUpperCase() === "DA" ? `DA-${cylNum}` : `${cylNum}-${code}`) : code;
        const key = `txn_${t.id}_${fullVal}`;
        if (!processedKeys.has(key)) {
          processedKeys.add(key);
          const retTxn = custTxns.find((rt) => rt.txn_type === "return" && rt.cylinder_id === t.cylinder_id && rt.occurred_at >= t.occurred_at);
          rows.push({
            issueDate: formatDateStr(t.occurred_at),
            billNo: t.notes ? String(t.notes).slice(0, 10) : "",
            full: fullVal,
            empty: retTxn ? (code.toUpperCase() === "DA" ? `DA-${retTxn.cylinders?.cylinder_number || ''}` : String(retTxn.cylinders?.cylinder_number || '')) : "",
            returnDate: retTxn ? formatDateStr(retTxn.occurred_at) : "",
          });
        }
      }
    });

    // 3. Process current cylinders assigned to customer if missing
    custCyls.forEach((c: any) => {
      const code = c.cylinder_types?.code || "CYL";
      const cylNum = c.cylinder_number || c.serial_number || "";
      const fullVal = cylNum ? (code.toUpperCase() === "DA" ? `DA-${cylNum}` : `${cylNum}-${code}`) : code;
      if (!rows.some((r) => r.full === fullVal)) {
        rows.push({
          issueDate: formatDateStr(c.issued_at || c.updated_at || c.created_at),
          billNo: "",
          full: fullVal,
          empty: "",
          returnDate: "",
        });
      }
    });

    return rows;
  };

  // ── Build Single Customer Statement Sheet ──────────────────────────
  const buildSingleCustomerStatementSheet = (cust: any, invList: any[], txnList: any[], cylList: any[]) => {
    const title = cust.name ? cust.name.toUpperCase() : "CUSTOMER STATEMENT";
    const statementRows = getCustomerStatementRows(cust, invList, txnList, cylList);

    const aoaData: any[][] = [
      [title, "", "", "", ""],
      ["DATE", "BILL NO", "FULL", "EMPTY", "DATE"],
    ];

    if (statementRows.length === 0) {
      aoaData.push(["—", "No entries", "—", "—", "—"]);
    } else {
      statementRows.forEach((r) => {
        aoaData.push([r.issueDate, r.billNo, r.full, r.empty, r.returnDate]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(aoaData);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    ws["!cols"] = [
      { wch: 16 }, // DATE (Issue)
      { wch: 14 }, // BILL NO
      { wch: 18 }, // FULL
      { wch: 18 }, // EMPTY
      { wch: 16 }, // DATE (Return)
    ];
    return ws;
  };

  // ── Build Side-by-Side Multi-Customer Statement Sheet (Image 2 format) ──
  const buildSideBySideMultiCustomerSheet = (custList: any[], invList: any[], txnList: any[], cylList: any[]) => {
    const aoaData: any[][] = [];
    const merges: any[] = [];
    const cols: any[] = [];

    const CHUNK_SIZE = 3; // 3 customers per side-by-side block
    for (let i = 0; i < custList.length; i += CHUNK_SIZE) {
      const chunk = custList.slice(i, i + CHUNK_SIZE);
      const startRowIdx = aoaData.length;

      const titleRow: string[] = [];
      const headerRow: string[] = [];

      chunk.forEach((cust, cIdx) => {
        const colStart = cIdx * 6;
        titleRow[colStart] = cust.name.toUpperCase();
        for (let s = 1; s < 5; s++) titleRow[colStart + s] = "";
        titleRow[colStart + 5] = ""; // spacer

        headerRow[colStart + 0] = "DATE";
        headerRow[colStart + 1] = "BILL NO";
        headerRow[colStart + 2] = "FULL";
        headerRow[colStart + 3] = "EMPTY";
        headerRow[colStart + 4] = "DATE";
        headerRow[colStart + 5] = ""; // spacer

        merges.push({
          s: { r: startRowIdx, c: colStart },
          e: { r: startRowIdx, c: colStart + 4 },
        });
      });

      aoaData.push(titleRow);
      aoaData.push(headerRow);

      const chunkCustomerRows = chunk.map((cust) =>
        getCustomerStatementRows(cust, invList, txnList, cylList)
      );

      const maxRows = Math.max(1, ...chunkCustomerRows.map((r) => r.length));

      for (let rIdx = 0; rIdx < maxRows; rIdx++) {
        const dataRow: string[] = [];
        chunk.forEach((_, cIdx) => {
          const colStart = cIdx * 6;
          const custRow = chunkCustomerRows[cIdx][rIdx];
          if (custRow) {
            dataRow[colStart + 0] = custRow.issueDate;
            dataRow[colStart + 1] = custRow.billNo;
            dataRow[colStart + 2] = custRow.full;
            dataRow[colStart + 3] = custRow.empty;
            dataRow[colStart + 4] = custRow.returnDate;
          } else {
            for (let s = 0; s < 5; s++) dataRow[colStart + s] = "";
          }
          dataRow[colStart + 5] = "";
        });
        aoaData.push(dataRow);
      }

      // Empty row separator
      aoaData.push([]);
    }

    for (let c = 0; c < Math.min(custList.length, 3) * 6; c++) {
      if (c % 6 === 5) cols.push({ wch: 3 });
      else cols.push({ wch: 15 });
    }

    const ws = XLSX.utils.aoa_to_sheet(aoaData);
    ws["!merges"] = merges;
    ws["!cols"] = cols;
    return ws;
  };

  // ── Export single customer ───────────────────────────────────────
  const exportSingleCustomer = async () => {
    if (!selectedCustomerId) return toast.error("Please select a customer");
    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (!cust) return;
    setCustLoading(true); setCustDone(false);
    try {
      const [invoices, transactions, deposits, cylinders] = await Promise.all([
        (supabase.from("invoices") as any)
          .select("*, invoice_items(*, cylinder_types(code, name))")
          .eq("customer_id", selectedCustomerId)
          .order("billing_date", { ascending: true })
          .then((r: any) => r.data ?? []),
        (supabase.from("transactions") as any).select("*").eq("customer_id", selectedCustomerId).order("occurred_at", { ascending: false }).then((r: any) => r.data ?? []),
        (supabase.from("customer_deposits") as any).select("*").eq("customer_id", selectedCustomerId).order("occurred_at", { ascending: false }).then((r: any) => r.data ?? []),
        (supabase.from("cylinders") as any).select("*, cylinder_types(name,code)").eq("current_customer_id", selectedCustomerId).then((r: any) => r.data ?? []),
      ]);

      const wb = XLSX.utils.book_new();

      // Sheet 1 — Cylinder Statement (Matching Exact User Format)
      const wsStatement = buildSingleCustomerStatementSheet(cust, invoices, transactions, cylinders);
      XLSX.utils.book_append_sheet(wb, wsStatement, "Cylinder Statement");

      // Sheet 2 — Customer Profile
      const totalBilled = invoices.reduce((a: number, r: any) => a + Number(r.total ?? 0), 0);
      const totalPaid   = invoices.filter((r: any) => r.status === "paid").reduce((a: number, r: any) => a + Number(r.total ?? 0), 0);
      const totalPending = invoices.filter((r: any) => r.status !== "paid").reduce((a: number, r: any) => a + Number(r.total ?? 0), 0);
      const profileData = [
        ["CUSTOMER EXPORT — Gas Track"],
        ["Generated", new Date().toLocaleString("en-IN")],
        [],
        ["Customer #",     cust.customer_number],
        ["Name",           cust.name],
        ["Phone",          cust.phone ?? "—"],
        ["Email",          cust.email ?? "—"],
        ["GSTIN",          cust.gst_number ?? "—"],
        ["Address",        cust.address ?? "—"],
        ["Deposit Balance",`₹${Number(cust.deposit_balance ?? 0).toLocaleString()}`],
        ["Notes",          cust.notes ?? "—"],
        ["Joined",         cust.created_at ? new Date(cust.created_at).toLocaleDateString("en-IN") : "—"],
        [],
        ["FINANCIAL SUMMARY"],
        ["Total Invoices",  invoices.length],
        ["Total Billed (₹)", totalBilled],
        ["Total Paid (₹)",   totalPaid],
        ["Balance Due (₹)",  totalPending],
        ["Cylinders with customer", cylinders.length],
      ];
      const ws0 = XLSX.utils.aoa_to_sheet(profileData);
      ws0["!cols"] = [{ wch: 24 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws0, "Profile");

      // Sheet 2 — Invoices
      if (invoices.length > 0) {
        const rows = invoices.map((r: any) => ({
          "Invoice #":          r.invoice_number,
          "Date":               r.billing_date,
          "Return Date":        r.return_date ?? "",
          "GSTIN":              r.gst_number ?? "",
          "Taxable (₹)":        Number(r.taxable_amount ?? 0),
          "Discount (₹)":       Number(r.discount ?? 0),
          "CGST (₹)":           Number(r.cgst_amount ?? 0),
          "SGST (₹)":           Number(r.sgst_amount ?? 0),
          "Total (₹)":          Number(r.total ?? 0),
          "Amount Paid (₹)":    Number(r.amount_paid ?? 0),
          "Balance (₹)":        Number(r.balance_amount ?? 0),
          "Payment Status":     r.payment_status ?? r.status,
          "Payment Method":     r.payment_method ?? "",
          "Issued Cylinders":   (r.issued_cylinder_numbers ?? []).map((n: number) => `#${n}`).join(", "),
          "Returned Cylinders": (r.returned_cylinder_numbers ?? []).map((n: number) => `#${n}`).join(", "),
          "Notes":              r.notes ?? "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = Array(rows[0] ? Object.keys(rows[0]).length : 16).fill({ wch: 16 });
        XLSX.utils.book_append_sheet(wb, ws, "Invoices");
      }

      // Sheet 3 — Transactions
      if (transactions.length > 0) {
        const rows = transactions.map((r: any) => ({
          "Date":   r.occurred_at ? new Date(r.occurred_at).toLocaleDateString("en-IN") : "",
          "Type":   r.txn_type,
          "Cylinder ID": r.cylinder_id,
          "Amount (₹)": Number(r.amount ?? 0),
          "Notes": r.notes ?? "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 36 }, { wch: 14 }, { wch: 24 }];
        XLSX.utils.book_append_sheet(wb, ws, "Transactions");
      }

      // Sheet 4 — Deposits
      if (deposits.length > 0) {
        const rows = deposits.map((r: any) => ({
          "Date":   r.occurred_at ? new Date(r.occurred_at).toLocaleDateString("en-IN") : "",
          "Type":   r.type,
          "Amount (₹)": Number(r.amount ?? 0),
          "Notes": r.notes ?? "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 24 }];
        XLSX.utils.book_append_sheet(wb, ws, "Deposits");
      }

      // Sheet 5 — Cylinders with customer
      if (cylinders.length > 0) {
        const rows = cylinders.map((r: any) => ({
          "Cylinder #":  r.cylinder_number ?? "",
          "Serial":      r.serial_number,
          "Type":        r.cylinder_types ? `${r.cylinder_types.code} — ${r.cylinder_types.name}` : "",
          "Status":      r.status,
          "Issued At":   r.issued_at ? new Date(r.issued_at).toLocaleDateString("en-IN") : "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, "Cylinders");
      }

      const safeName = cust.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      XLSX.writeFile(wb, `customer-${cust.customer_number}-${safeName}.xlsx`);
      setCustDone(true);
      toast.success(`Exported ${cust.name}'s data successfully!`);
    } catch (err: any) {
      toast.error("Export failed: " + err.message);
    } finally {
      setCustLoading(false);
    }
  };
  // ────────────────────────────────────────────────────────────────

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

      {/* ── Single Customer Export ───────────────────────────────── */}
      <div className="border-t border-border/40 pt-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-secondary/60 border border-border/60 flex items-center justify-center shrink-0">
            <UserCheck className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <div className="font-bold text-sm">Export Single Customer</div>
            <div className="text-xs text-muted-foreground">Download one customer's profile, invoices, transactions &amp; cylinders</div>
          </div>
        </div>

        <Card className="bg-card border-border/60 p-5 space-y-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Select Customer to Export</div>

          <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={customerOpen}
                className="w-full justify-between font-normal h-11 border-border/60 text-left"
              >
                {selectedCustomerId
                  ? (() => {
                      const sc = customers.find((c) => c.id === selectedCustomerId);
                      return sc ? `${sc.customer_number} — ${sc.name}` : "Search customer...";
                    })()
                  : "Search customer by name, number, phone or GSTIN..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[450px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Type to search customer (name, #, phone, GST)..." />
                <CommandList>
                  <CommandEmpty>No customer found.</CommandEmpty>
                  <CommandGroup>
                    {customers.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.customer_number} ${c.name} ${c.phone || ""} ${c.gst_number || ""}`}
                        onSelect={() => {
                          setSelectedCustomerId(c.id);
                          setCustDone(false);
                          setCustomerOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", selectedCustomerId === c.id ? "opacity-100" : "opacity-0")} />
                        <div className="flex flex-col text-xs">
                          <div>
                            <span className="font-mono text-primary font-bold mr-1">#{c.customer_number}</span>
                            <span className="font-semibold">{c.name}</span>
                          </div>
                          {c.phone && <div className="text-muted-foreground text-[11px]">📞 {c.phone}</div>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Preview of selected customer */}
          {selectedCustomerId && (() => {
            const c = customers.find((x) => x.id === selectedCustomerId);
            if (!c) return null;
            return (
              <div className="rounded-lg bg-secondary/40 border border-border/50 px-4 py-3 space-y-1 text-xs">
                <div className="font-bold text-sm">{c.name} <span className="text-muted-foreground font-normal">#{c.customer_number}</span></div>
                {c.phone    && <div className="text-muted-foreground">📞 {c.phone}</div>}
                {c.address  && <div className="text-muted-foreground">📍 {c.address}</div>}
                {c.gst_number && <div className="text-muted-foreground">🏷 GSTIN: {c.gst_number}</div>}
                <div className="text-muted-foreground">💰 Deposit Balance: ₹{Number(c.deposit_balance ?? 0).toLocaleString()}</div>
                <div className="pt-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">
                  Sheets: Profile · Invoices · Transactions · Deposits · Cylinders
                </div>
              </div>
            );
          })()}

          <Button
            onClick={exportSingleCustomer}
            disabled={custLoading || !selectedCustomerId}
            variant="outline"
            className="w-full h-11 font-bold gap-2"
          >
            {custLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Exporting…</>
            ) : custDone ? (
              <><CheckCircle2 className="h-4 w-4" /> Exported — Download Again</>
            ) : (
              <><Download className="h-4 w-4" /> Export Customer Excel</>
            )}
          </Button>

          {custDone && (
            <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-center text-xs text-success font-semibold">
              ✓ Customer file downloaded successfully!
            </div>
          )}
        </Card>
      </div>
      {/* ─────────────────────────────────────────────────────────── */}
    </div>
  );
}
