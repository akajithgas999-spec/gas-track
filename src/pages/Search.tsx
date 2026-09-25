import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search as SearchIcon, 
  User, 
  Cylinder as CylIcon, 
  Phone, 
  Mail, 
  MapPin, 
  Wallet, 
  Calendar, 
  FileText, 
  Hash, 
  Tag, 
  Clock, 
  FileSpreadsheet,
  PackageCheck
} from "lucide-react";

export default function Search() {
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [cylinders, setCylinders] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Selected Customer Detail Modal state
  const [selectedCust, setSelectedCust] = useState<any | null>(null);
  const [custLoading, setCustLoading] = useState(false);
  const [custCylinders, setCustCylinders] = useState<any[]>([]);
  const [custDeposits, setCustDeposits] = useState<any[]>([]);
  const [custInvoices, setCustInvoices] = useState<any[]>([]);

  // Selected Cylinder Detail Modal state
  const [selectedCyl, setSelectedCyl] = useState<any | null>(null);
  const [cylLoading, setCylLoading] = useState(false);
  const [cylHistory, setCylHistory] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("cylinder_types")
      .select("id, name, code")
      .order("name")
      .then(({ data }) => setTypes(data ?? []));
  }, []);

  useEffect(() => {
    if (!q.trim()) { setCustomers([]); setCylinders([]); return; }
    const t = setTimeout(async () => {
      const term = q.trim();
      const like = `%${term}%`;
      const [{ data: cu }, { data: cy }] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, phone, email, address, notes, customer_number, gst_number, deposit_balance, created_at")
          .or(`name.ilike.${like},customer_number.ilike.${like},phone.ilike.${like},gst_number.ilike.${like},email.ilike.${like}`)
          .limit(50),
        supabase
          .from("cylinders")
          .select("id, serial_number, cylinder_number, status, fill_status, type_id, issued_at, created_at, cylinder_types(name,code), customers:current_customer_id(id, name, customer_number, phone)")
          .ilike("serial_number", like)
          .limit(50),
      ]);
      setCustomers(cu ?? []);
      setCylinders(cy ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const openCustomerDetails = async (c: any) => {
    setSelectedCust(c);
    setCustLoading(true);
    const [cylRes, depRes, invRes] = await Promise.all([
      supabase
        .from("cylinders")
        .select("id, serial_number, cylinder_number, status, fill_status, issued_at, cylinder_types(name, code)")
        .eq("current_customer_id", c.id),
      supabase
        .from("customer_deposits")
        .select("*")
        .eq("customer_id", c.id)
        .order("occurred_at", { ascending: false })
        .limit(20),
      supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, payment_status, created_at")
        .eq("customer_id", c.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setCustCylinders(cylRes.data ?? []);
    setCustDeposits(depRes.data ?? []);
    setCustInvoices(invRes.data ?? []);
    setCustLoading(false);
  };

  const openCylinderDetails = async (c: any) => {
    setSelectedCyl(c);
    setCylLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("id, txn_type, amount, notes, occurred_at, customers(name, customer_number), cylinder_types(code, name)")
      .eq("cylinder_id", c.id)
      .order("occurred_at", { ascending: false })
      .limit(20);
    setCylHistory(data ?? []);
    setCylLoading(false);
  };

  const filteredCylinders = cylinders.filter((c) => typeFilter === "all" || c.type_id === typeFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 max-w-3xl">
        <div className="relative flex-1">
          <SearchIcon className="h-4 w-4 absolute left-3 top-3.5 text-muted-foreground" />
          <Input 
            autoFocus 
            className="pl-9 h-11 text-base" 
            placeholder="Search customer name, customer #, phone, GST, or cylinder serial..." 
            value={q} 
            onChange={(e) => setQ(e.target.value)} 
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[200px] h-11"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.code} — {t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CUSTOMERS LIST */}
        <Card className="p-5 bg-card border-border/60">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Customers ({customers.length})
          </h3>
          <div className="space-y-2">
            {customers.map((c) => (
              <div 
                key={c.id} 
                onClick={() => openCustomerDetails(c)}
                className="p-3 rounded border border-border/40 hover:border-primary/50 hover:bg-secondary/40 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono font-bold text-primary">{c.customer_number}</div>
                    <div className="font-semibold">{c.name}</div>
                    {c.phone && <div className="text-xs font-mono text-muted-foreground flex items-center gap-1.5 mt-0.5"><Phone className="h-3 w-3" />{c.phone}</div>}
                  </div>
                  <div className="text-right">
                    {c.gst_number && <div className="text-[10px] font-mono text-muted-foreground">GSTIN {c.gst_number}</div>}
                    <div className="font-mono text-sm font-bold text-foreground">₹{Number(c.deposit_balance ?? 0).toLocaleString()}</div>
                    {c.created_at && (
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {q && customers.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No matching customers found</p>}
          </div>
        </Card>

        {/* CYLINDERS LIST */}
        <Card className="p-5 bg-card border-border/60">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <CylIcon className="h-4 w-4 text-primary" />
            Cylinders ({filteredCylinders.length})
          </h3>
          <div className="space-y-2">
            {filteredCylinders.map((c) => (
              <div 
                key={c.id} 
                onClick={() => openCylinderDetails(c)}
                className="p-3 rounded border border-border/40 hover:border-primary/50 hover:bg-secondary/40 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono font-semibold text-primary">{c.serial_number}</div>
                    <div className="text-xs text-muted-foreground">{c.cylinder_types?.code} · {c.cylinder_types?.name}</div>
                  </div>
                  <div className="text-right">
                    <div className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      c.status === "in_stock" ? "bg-success/15 text-success" :
                      c.status === "issued" ? "bg-warning/15 text-warning" :
                      "bg-destructive/15 text-destructive"
                    }`}>{c.status}</div>
                    {c.customers?.name && (
                      <div className="text-xs mt-1">
                        {c.customers.name} <span className="font-mono text-[10px] text-muted-foreground">{c.customers.customer_number}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {q && filteredCylinders.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No matching cylinders found</p>}
          </div>
        </Card>
      </div>

      {/* FULL CUSTOMER DETAILS DIALOG */}
      <Dialog open={!!selectedCust} onOpenChange={(open) => !open && setSelectedCust(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <User className="h-5 w-5 text-primary" />
              {selectedCust?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedCust && (
            <div className="space-y-5">
              {/* Header Badge Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded bg-secondary/50 border border-border/40">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Customer #</div>
                  <div className="font-mono font-bold text-primary text-sm mt-0.5">{selectedCust.customer_number}</div>
                </div>
                <div className="p-2.5 rounded bg-secondary/50 border border-border/40">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Deposit Balance</div>
                  <div className="font-mono font-bold text-sm text-success mt-0.5">₹{Number(selectedCust.deposit_balance ?? 0).toLocaleString()}</div>
                </div>
                <div className="p-2.5 rounded bg-secondary/50 border border-border/40">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">GST Number</div>
                  <div className="font-mono text-xs mt-0.5 truncate">{selectedCust.gst_number || "N/A"}</div>
                </div>
                <div className="p-2.5 rounded bg-secondary/50 border border-border/40">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Joining Date</div>
                  <div className="text-xs mt-0.5 font-medium">
                    {selectedCust.created_at ? new Date(selectedCust.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "N/A"}
                  </div>
                </div>
              </div>

              {/* Contact & Address Details */}
              <div className="space-y-2 text-sm border-t border-border/40 pt-3">
                {selectedCust.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 text-primary/70 shrink-0" />
                    <span className="font-mono font-medium text-foreground">{selectedCust.phone}</span>
                  </div>
                )}
                {selectedCust.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 text-primary/70 shrink-0" />
                    <span className="text-foreground">{selectedCust.email}</span>
                  </div>
                )}
                {selectedCust.address && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 text-primary/70 shrink-0 mt-0.5" />
                    <span className="text-foreground">{selectedCust.address}</span>
                  </div>
                )}
                {selectedCust.notes && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <FileText className="h-4 w-4 text-primary/70 shrink-0 mt-0.5" />
                    <span className="text-foreground italic">{selectedCust.notes}</span>
                  </div>
                )}
              </div>

              {/* Tabs Section for Sub-details */}
              <Tabs defaultValue="cylinders" className="w-full pt-2">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="cylinders" className="text-xs">
                    <CylIcon className="h-3.5 w-3.5 mr-1.5" />
                    Cylinders ({custCylinders.length})
                  </TabsTrigger>
                  <TabsTrigger value="deposits" className="text-xs">
                    <Wallet className="h-3.5 w-3.5 mr-1.5" />
                    Deposits ({custDeposits.length})
                  </TabsTrigger>
                  <TabsTrigger value="invoices" className="text-xs">
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                    Invoices ({custInvoices.length})
                  </TabsTrigger>
                </TabsList>

                {/* Cylinders Tab */}
                <TabsContent value="cylinders" className="mt-3 space-y-2">
                  {custLoading ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">Loading cylinders...</p>
                  ) : custCylinders.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No cylinders currently issued to this customer.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {custCylinders.map((cyl) => (
                        <div key={cyl.id} className="flex items-center justify-between p-2.5 rounded bg-secondary/30 border border-border/40 text-xs">
                          <div>
                            <div className="font-mono font-bold text-primary">{cyl.serial_number}</div>
                            <div className="text-[11px] text-muted-foreground">{cyl.cylinder_types?.code} · {cyl.cylinder_types?.name}</div>
                          </div>
                          <div className="text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${cyl.fill_status === "filled" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                              {cyl.fill_status || "filled"}
                            </span>
                            {cyl.issued_at && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Issued {new Date(cyl.issued_at).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Deposits Tab */}
                <TabsContent value="deposits" className="mt-3 space-y-2">
                  {custLoading ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">Loading deposits...</p>
                  ) : custDeposits.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No deposit history recorded.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {custDeposits.map((dep) => (
                        <div key={dep.id} className="flex items-center justify-between p-2.5 rounded bg-secondary/30 border border-border/40 text-xs">
                          <div>
                            <span className={`uppercase font-bold tracking-wider text-[10px] ${dep.type === "collected" ? "text-success" : dep.type === "refunded" ? "text-warning" : "text-primary"}`}>
                              {dep.type}
                            </span>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{dep.notes || "No notes"}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold">₹{Number(dep.amount).toLocaleString()}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {new Date(dep.occurred_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Invoices Tab */}
                <TabsContent value="invoices" className="mt-3 space-y-2">
                  {custLoading ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">Loading invoices...</p>
                  ) : custInvoices.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No invoices found for this customer.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {custInvoices.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between p-2.5 rounded bg-secondary/30 border border-border/40 text-xs">
                          <div>
                            <div className="font-mono font-bold text-primary">{inv.invoice_number}</div>
                            <div className="text-[10px] text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold">₹{Number(inv.total_amount).toLocaleString()}</div>
                            <span className={`uppercase text-[9px] font-bold px-1.5 py-0.5 rounded ${inv.payment_status === "paid" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                              {inv.payment_status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* FULL CYLINDER DETAILS DIALOG */}
      <Dialog open={!!selectedCyl} onOpenChange={(open) => !open && setSelectedCyl(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <CylIcon className="h-5 w-5 text-primary" />
              Cylinder {selectedCyl?.serial_number}
            </DialogTitle>
          </DialogHeader>

          {selectedCyl && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded bg-secondary/50 border border-border/40">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Type</div>
                  <div className="font-semibold text-xs mt-0.5">{selectedCyl.cylinder_types?.code} — {selectedCyl.cylinder_types?.name}</div>
                </div>
                <div className="p-2.5 rounded bg-secondary/50 border border-border/40">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Status</div>
                  <div className={`font-bold text-xs uppercase mt-0.5 ${
                    selectedCyl.status === "in_stock" ? "text-success" :
                    selectedCyl.status === "issued" ? "text-warning" : "text-destructive"
                  }`}>
                    {selectedCyl.status}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-secondary/50 border border-border/40">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Fill Status</div>
                  <div className="font-bold text-xs uppercase mt-0.5">{selectedCyl.fill_status || "filled"}</div>
                </div>
              </div>

              {selectedCyl.customers && (
                <div className="p-3 rounded bg-primary/5 border border-primary/20 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-primary">Currently Issued To</div>
                  <div className="font-semibold text-sm">{selectedCyl.customers.name} <span className="font-mono text-xs text-muted-foreground">({selectedCyl.customers.customer_number})</span></div>
                  {selectedCyl.customers.phone && <div className="text-xs font-mono text-muted-foreground">{selectedCyl.customers.phone}</div>}
                  {selectedCyl.issued_at && <div className="text-[11px] text-muted-foreground">Issued on: {new Date(selectedCyl.issued_at).toLocaleString()}</div>}
                </div>
              )}

              {/* Transaction Log */}
              <div className="pt-2 border-t border-border/40">
                <h4 className="text-xs uppercase font-bold tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  Transaction History ({cylHistory.length})
                </h4>
                {cylLoading ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Loading transaction history...</p>
                ) : cylHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No transaction history for this cylinder.</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {cylHistory.map((h) => (
                      <div key={h.id} className="flex items-center justify-between p-2 rounded bg-secondary/30 text-xs border border-border/30">
                        <div>
                          <span className={`uppercase font-bold tracking-wider text-[10px] ${h.txn_type === "issue" ? "text-warning" : "text-success"}`}>
                            {h.txn_type}
                          </span>
                          {h.customers?.name && <div className="text-[11px] font-medium">{h.customers.name}</div>}
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-mono text-muted-foreground">{new Date(h.occurred_at).toLocaleDateString()}</div>
                          {h.notes && <div className="text-[10px] text-muted-foreground italic truncate max-w-[150px]">{h.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
