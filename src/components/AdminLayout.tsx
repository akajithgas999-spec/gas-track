import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Cylinder,
  Tag,
  Users,
  ArrowLeftRight,
  Receipt,
  ShoppingCart,
  BarChart3,
  Search,
  LogOut,
  Flame,
  History,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/cylinders", label: "Cylinders", icon: Cylinder },
  { to: "/types", label: "Cylinder Types", icon: Tag },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/invoices", label: "Sales / Invoices", icon: Receipt },
  { to: "/purchases", label: "Purchases", icon: ShoppingCart },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/customer-history", label: "Customer History", icon: History },
  { to: "/export", label: "Export Data", icon: Download },
];

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const nav2 = useNavigate();
  const loc = useLocation();
  const current = nav.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)));

  return (
    <div className="min-h-screen flex w-full bg-background">
      <aside className="hidden lg:flex w-64 border-r border-sidebar-border bg-sidebar flex-col">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
            <Flame className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight">CylinderOps</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Admin Panel</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_hsl(var(--primary))]"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 mb-2">
            <div className="text-xs text-muted-foreground">Signed in as</div>
            <div className="text-sm font-medium truncate">{user?.email}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => {
              await signOut();
              nav2("/auth");
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border">
          <div className="h-16 flex items-center px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden h-9 w-9 rounded-lg flex items-center justify-center mr-3" style={{ background: "var(--gradient-primary)" }}>
              <Flame className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">{current?.label ?? "Admin"}</h1>
              <div className="lg:hidden text-[10px] uppercase tracking-widest text-muted-foreground">CylinderOps</div>
            </div>
            <div className="ml-auto hidden sm:block text-xs text-muted-foreground font-mono">
              {new Date().toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-2 lg:hidden"
              aria-label="Sign out"
              onClick={async () => {
                await signOut();
                nav2("/auth");
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <nav className="lg:hidden flex gap-2 overflow-x-auto px-4 pb-3 [-webkit-overflow-scrolling:touch]">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border/70 bg-secondary/30 text-muted-foreground"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
