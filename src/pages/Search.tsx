import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, User, Cylinder as CylIcon } from "lucide-react";
import { Link } from "react-router-dom";

export default function Search() {
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [cylinders, setCylinders] = useState<any[]>([]);

  useEffect(() => {
    if (!q.trim()) { setCustomers([]); setCylinders([]); return; }
    const t = setTimeout(async () => {
      const term = q.trim();
      const like = `%${term}%`;
      const [{ data: cu }, { data: cy }] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, phone, customer_number, gst_number, deposit_balance")
          .or(`name.ilike.${like},customer_number.ilike.${like},phone.ilike.${like},gst_number.ilike.${like},email.ilike.${like}`)
          .limit(50),
        supabase
          .from("cylinders")
          .select("id, serial_number, status, issued_at, cylinder_types(name,code), customers:current_customer_id(name, customer_number, phone)")
          .ilike("serial_number", like)
          .limit(50),
      ]);
      setCustomers(cu ?? []);
      setCylinders(cy ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-6">
      <div className="relative max-w-2xl">
        <SearchIcon className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
        <Input autoFocus className="pl-9 h-11 text-base" placeholder="Search customer name, customer #, phone, GST, or cylinder serial..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5 bg-card border-border/60">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><User className="h-4 w-4 text-primary" />Customers ({customers.length})</h3>
          <div className="space-y-2">
            {customers.map((c) => (
              <Link key={c.id} to="/customers" className="block p-3 rounded border border-border/40 hover:border-primary/40 hover:bg-secondary/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono text-primary">{c.customer_number}</div>
                    <div className="font-semibold">{c.name}</div>
                    {c.phone && <div className="text-xs font-mono text-muted-foreground">{c.phone}</div>}
                  </div>
                  <div className="text-right">
                    {c.gst_number && <div className="text-[10px] font-mono">{c.gst_number}</div>}
                    <div className="font-mono text-sm">₹{Number(c.deposit_balance ?? 0).toLocaleString()}</div>
                  </div>
                </div>
              </Link>
            ))}
            {q && customers.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No customers</p>}
          </div>
        </Card>

        <Card className="p-5 bg-card border-border/60">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><CylIcon className="h-4 w-4 text-primary" />Cylinders ({cylinders.length})</h3>
          <div className="space-y-2">
            {cylinders.map((c) => (
              <Link key={c.id} to="/cylinders" className="block p-3 rounded border border-border/40 hover:border-primary/40 hover:bg-secondary/30">
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
                    {c.customers?.name && <div className="text-xs mt-1">{c.customers.name} <span className="font-mono text-[10px] text-muted-foreground">{c.customers.customer_number}</span></div>}
                  </div>
                </div>
              </Link>
            ))}
            {q && cylinders.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No cylinders</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
