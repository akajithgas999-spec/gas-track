import { NavLink, Outlet, useLocation, useNavigate } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
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
  Building2,
  ChevronsUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const { company, companies, setCompanyId } = useCompany();
  const nav2 = useNavigate();
  const loc = useLocation();
  const current = nav.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)));

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 border-r border-sidebar-border bg-sidebar flex-col">
        {/* App Title Header */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shadow-md" style={{ background: "var(--gradient-primary)" }}>
            <Flame className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight">CylinderOps</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Admin Panel</div>
          </div>
        </div>

        {/* Company Switcher Widget in Sidebar */}
        <div className="p-3 border-b border-sidebar-border/60 bg-sidebar-accent/30">
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1.5 px-1 flex items-center justify-between">
            <span>Select Company</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono">{company.code}</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between h-11 px-3 bg-card/80 border-border/80 hover:bg-card hover:border-primary/50 transition-all text-left shadow-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-foreground truncate leading-tight">{company.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{company.tagline}</span>
                  </div>
                </div>
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 p-1 bg-card border-border shadow-xl">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Switch Active Company
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {companies.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => setCompanyId(c.id)}
                  className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer text-xs font-medium transition-colors ${
                    c.id === company.id ? "bg-primary/15 text-primary font-bold" : "hover:bg-muted"
                  }`}
                >
                  <div className={`h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold ${c.badgeColor}`}>
                    {c.code.slice(0, 2)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{c.name}</span>
                    <span className="text-[9px] text-muted-foreground truncate">{c.tagline}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Navigation Links */}
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

        {/* Sidebar Footer User Section */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 mb-2 bg-sidebar-accent/20 rounded-md">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Signed in as</div>
            <div className="text-xs font-medium truncate text-foreground">{user?.email}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
            onClick={async () => {
              await signOut();
              nav2("/auth");
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="h-16 flex items-center px-4 sm:px-6 lg:px-8 gap-3">
            <div className="lg:hidden h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
              <Flame className="h-5 w-5 text-primary-foreground" />
            </div>

            <div className="min-w-0 flex-1 flex items-center gap-3">
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">{current?.label ?? "Admin"}</h1>
                <div className="lg:hidden text-[10px] uppercase tracking-widest text-muted-foreground">CylinderOps</div>
              </div>

              {/* Company Switcher Pill Badge in Header */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all text-xs font-bold shrink-0">
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[140px] sm:max-w-[200px]">{company.name}</span>
                    <ChevronsUpDown className="h-3 w-3 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 p-1 bg-card border-border shadow-xl">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Switch Active Company
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {companies.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => setCompanyId(c.id)}
                      className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer text-xs font-medium ${
                        c.id === company.id ? "bg-primary/15 text-primary font-bold" : "hover:bg-muted"
                      }`}
                    >
                      <div className={`h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold ${c.badgeColor}`}>
                        {c.code.slice(0, 2)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{c.name}</span>
                        <span className="text-[9px] text-muted-foreground truncate">{c.tagline}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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

          {/* Mobile Nav Links */}
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
