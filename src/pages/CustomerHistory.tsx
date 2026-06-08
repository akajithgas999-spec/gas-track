import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Download, ChevronDown, ChevronUp,
  ArrowDownToLine, AlertCircle, User,
} from "lucide-react";
import * as XLSX from "xlsx";

type Invoice = {
  id: string;
  invoice_number: string;
  billing_date: string;
  return_date: string | null;
  issued_cylinder_numbers: number[];
  returned_cylinder_numbers: number[];
  total: number;
  status: string;
  customers: {
    name: string;
    customer_number: string;
    phone: string;
    address: string;
    gst_number: string;
  };
};

export default function CustomerHistory() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  // Search & filter
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);

  // Detail dialog — unused but kept for future
  const [detailCustomer, setDetailCustomer] = useState<string | null>(null);
  const NONE = "__all__";

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select(`
        id, invoice_number, billing_date, return_date,
        issued_cylinder_numbers, returned_cylinder_numbers,
        total, amount, status,
        customers(name, customer_number, phone, address, gst_number)
      `)
      .order("billing_date", { ascending: false });
    if (!error) setInvoices((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
    supabase
      .from("customers")
      .select("id, name, customer_number")
      .order("customer_number")
      .then(({ data }) => setCustomers(data ?? []));
  }, []);

  // Filter logic
  const filtered = useMemo(() => {
    const q = searchText.toLowerCase().trim();
    return invoices.filter((inv) => {
    // Customer dropdown filter (stores customer name as value)
    if (selectedCustomer && selectedCustomer !== NONE) {
      if (inv.customers?.name !== selectedCustomer) return false;
    }

      // Date range
      if (dateFrom && inv.billing_date < dateFrom) return false;
      if (dateTo && inv.billing_date > dateTo) return false;

      if (!q) return true;

      // Search: customer name
      if (inv.customers?.name?.toLowerCase().includes(q)) return true;
      // Search: customer number / fill number
      if (inv.customers?.customer_number?.toLowerCase().includes(q)) return true;
      // Search: invoice number
      if (inv.invoice_number?.toLowerCase().includes(q)) return true;
      // Search: date
      if (inv.billing_date?.includes(q)) return true;
      // Search: cylinder number
      const cylNum = parseInt(q, 10);
      if (!isNaN(cylNum)) {
        const issued: number[] = inv.issued_cylinder_numbers ?? [];
        const returned: number[] = inv.returned_cylinder_numbers ?? [];
        if (issued.includes(cylNum) || returned.includes(cylNum)) return true;
      }
      return false;
    });
  }, [invoices, searchText, selectedCustomer, dateFrom, dateTo, customers]);

  // Group by customer for customer-level summary
  const byCustomer = useMemo(() => {
    const map = new Map<string, { customer: any; invoices: Invoice[] }>();
    for (const inv of filtered) {
      const key = inv.customers?.customer_number ?? inv.id;
      if (!map.has(key)) {
        map.set(key, { customer: inv.customers, invoices: [] });
      }
      map.get(key)!.invoices.push(inv);
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.customer?.name ?? "").localeCompare(b.customer?.name ?? "")
    );
  }, [filtered]);

  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  // Outstanding cylinders per customer (issued but never returned across all their invoices)
  const getOutstanding = (invs: Invoice[]) => {
    const allIssued = invs.flatMap((i) => i.issued_cylinder_numbers ?? []);
    const allReturned = invs.flatMap((i) => i.returned_cylinder_numbers ?? []);
    return allIssued.filter((n) => !allReturned.includes(n));
  };

  // Export to Excel
  const exportExcel = () => {
    const rows: any[] = [];
    for (const { customer, invoices: invs } of byCustomer) {
      const outstanding = getOutstanding(invs);
      for (const inv of invs) {
        const issued: number[] = inv.issued_cylinder_numbers ?? [];
        const returned: number[] = inv.returned_cylinder_numbers ?? [];
        rows.push({
          "Customer Name": customer?.name ?? "",
          "Customer #": customer?.customer_number ?? "",
          "Phone": customer?.phone ?? "",
          "Invoice #": inv.invoice_number,
          "Date": inv.billing_date,
          "Return Date": inv.return_date ?? "",
          "Issued Cylinders": issued.map((n) => `#${n}`).join(", "),
          "Issued Count": issued.length,
          "Returned Cylinders": returned.map((n) => `#${n}`).join(", "),
          "Returned Count": returned.length,
          "Outstanding Cylinders": outstanding.map((n) => `#${n}`).join(", "),
          "Outstanding Count": outstanding.length,
          "Amount (₹)": Number(inv.total ?? 0),
          "Status": inv.status,
        });
      }
    }

    if (rows.length === 0) {
      rows.push({
        "Customer Name": "No data found",
        "Customer #": "", "Phone": "", "Invoice #": "", "Date": "",
        "Return Date": "", "Issued Cylinders": "", "Issued Count": 0,
        "Returned Cylinders": "", "Returned Count": 0,
        "Outstanding Cylinders": "", "Outstanding Count": 0,
        "Amount (₹)": 0, "Status": "",
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    // Column widths
    ws["!cols"] = [
      { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
      { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 30 }, { wch: 14 },
      { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer History");

    // Also add a summary sheet
    const summaryRows = byCustomer.map(({ customer, invoices: invs }) => {
      const outstanding = getOutstanding(invs);
      const totalAmount = invs.reduce((a, b) => a + Number(b.total ?? 0), 0);
      return {
        "Customer Name": customer?.name ?? "",
        "Customer #": customer?.customer_number ?? "",
        "Phone": customer?.phone ?? "",
        "Total Invoices": invs.length,
        "Total Cylinders Issued": invs.flatMap((i) => i.issued_cylinder_numbers ?? []).length,
        "Total Cylinders Returned": invs.flatMap((i) => i.returned_cylinder_numbers ?? []).length,
        "Outstanding Cylinders": outstanding.map((n) => `#${n}`).join(", "),
        "Outstanding Count": outstanding.length,
        "Total Amount (₹)": totalAmount,
      };
    });
    const ws2 = XLSX.utils.json_to_sheet(summaryRows);
    ws2["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");

    XLSX.writeFile(wb, `customer-history-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header / Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Customers</div>
          <div className="text-2xl font-bold mt-1 font-mono">{byCustomer.length}</div>
        </Card>
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Invoices</div>
          <div className="text-2xl font-bold mt-1 font-mono">{filtered.length}</div>
        </Card>
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <ArrowDownToLine className="h-3 w-3 text-success" />Total Issued
          </div>
          <div className="text-2xl font-bold mt-1 font-mono text-success">
            {filtered.reduce((a, i) => a + (i.issued_cylinder_numbers ?? []).length, 0)}
          </div>
        </Card>
        <Card className="p-4 bg-card border-border/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-destructive" />Outstanding
          </div>
          <div className="text-2xl font-bold mt-1 font-mono text-destructive">
            {byCustomer.reduce((a, { invoices: invs }) => a + getOutstanding(invs).length, 0)}
          </div>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card className="p-4 bg-card border-border/60">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end">
          <div className="relative w-full sm:flex-1 sm:min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by customer name, fill number, cylinder #, invoice #, date..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="w-full sm:min-w-[200px] sm:w-auto">
            <Label className="text-xs">Customer</Label>
            <Select value={selectedCustomer || NONE} onValueChange={(v) => setSelectedCustomer(v === NONE ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="All customers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All customers</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.customer_number} — {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-[160px]" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-[160px]" />
          </div>
          <Button
            variant="outline"
            onClick={() => { setSearchText(""); setSelectedCustomer(""); setDateFrom(""); setDateTo(""); }}
            className="w-full sm:w-auto text-muted-foreground"
          >
            Clear
          </Button>
          <Button onClick={exportExcel} className="w-full sm:w-auto gap-2 sm:ml-auto">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </Card>

      {/* Results: grouped by customer */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading history…</div>
      ) : byCustomer.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground bg-card border-border/60">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <div>No results found. Try a different search.</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {byCustomer.map(({ customer, invoices: invs }) => {
            const custKey = customer?.customer_number ?? "unknown";
            const isExpanded = expandedCustomer === custKey;
            const outstanding = getOutstanding(invs);
            const totalAmount = invs.reduce((a, b) => a + Number(b.total ?? 0), 0);
            const totalIssued = invs.flatMap((i) => i.issued_cylinder_numbers ?? []).length;
            const totalReturned = invs.flatMap((i) => i.returned_cylinder_numbers ?? []).length;

            return (
              <Card key={custKey} className="bg-card border-border/60 overflow-hidden">
                {/* Customer header row */}
                <div
                  className="flex flex-wrap lg:flex-nowrap items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                  onClick={() => setExpandedCustomer(isExpanded ? null : custKey)}
                >
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{customer?.name ?? "Unknown"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{customer?.customer_number} · {customer?.phone ?? "—"}</div>
                  </div>
                  <div className="grid grid-cols-3 sm:flex gap-3 sm:gap-6 text-center text-xs w-full lg:w-auto">
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Invoices</div>
                      <div className="font-bold font-mono">{invs.length}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Issued</div>
                      <div className="font-bold font-mono text-success">{totalIssued}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Returned</div>
                      <div className="font-bold font-mono text-warning">{totalReturned}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Outstanding</div>
                      <div className={`font-bold font-mono ${outstanding.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {outstanding.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Total</div>
                      <div className="font-bold font-mono">₹{totalAmount.toLocaleString()}</div>
                    </div>
                  </div>
                  {outstanding.length > 0 && (
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {outstanding.slice(0, 5).map((n) => (
                        <span key={n} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-destructive/15 text-destructive">#{n}</span>
                      ))}
                      {outstanding.length > 5 && <span className="text-[10px] text-destructive">+{outstanding.length - 5}</span>}
                    </div>
                  )}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                </div>

                {/* Expanded: invoice history */}
                {isExpanded && (
                  <div className="border-t border-border/40">
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="text-left px-5 py-2">Invoice #</th>
                          <th className="text-left px-5 py-2">Date</th>
                          <th className="text-left px-5 py-2">Return Date</th>
                          <th className="text-left px-5 py-2">Issued Cyl #</th>
                          <th className="text-left px-5 py-2">Returned Cyl #</th>
                          <th className="text-left px-5 py-2">Outstanding</th>
                          <th className="text-right px-5 py-2">Amount</th>
                          <th className="text-left px-5 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invs.map((inv) => {
                          const issued: number[] = inv.issued_cylinder_numbers ?? [];
                          const returned: number[] = inv.returned_cylinder_numbers ?? [];
                          const invOutstanding = issued.filter((n) => !returned.includes(n));
                          return (
                            <tr key={inv.id} className="border-t border-border/30 hover:bg-secondary/20">
                              <td className="px-5 py-3 font-mono font-semibold text-primary text-xs">{inv.invoice_number}</td>
                              <td className="px-5 py-3 font-mono text-xs">{new Date(inv.billing_date).toLocaleDateString("en-IN")}</td>
                              <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                                {inv.return_date ? new Date(inv.return_date).toLocaleDateString("en-IN") : "—"}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {issued.length > 0 ? issued.map((n) => (
                                    <span key={n} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-success/15 text-success">#{n}</span>
                                  )) : <span className="text-muted-foreground text-xs">—</span>}
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {returned.length > 0 ? returned.map((n) => (
                                    <span key={n} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-warning/15 text-warning">#{n}</span>
                                  )) : <span className="text-muted-foreground text-xs">—</span>}
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {invOutstanding.length > 0 ? invOutstanding.map((n) => (
                                    <span key={n} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-destructive/15 text-destructive">#{n}</span>
                                  )) : <span className="text-success text-xs font-semibold">✓ All returned</span>}
                                </div>
                              </td>
                              <td className="px-5 py-3 text-right font-mono font-semibold">₹{Number(inv.total ?? 0).toLocaleString()}</td>
                              <td className="px-5 py-3">
                                <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  inv.status === "paid" ? "bg-success/15 text-success" : inv.status === "pending" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
                                }`}>{inv.status}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>

                    {/* Outstanding summary for this customer */}
                    {outstanding.length > 0 && (
                      <div className="px-5 py-3 border-t border-border/30 bg-destructive/5">
                        <div className="text-xs font-semibold text-destructive flex items-center gap-2">
                          <AlertCircle className="h-3 w-3" />
                          {outstanding.length} cylinder(s) outstanding (not returned):
                          <span className="font-mono">{outstanding.map((n) => `#${n}`).join(", ")}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
