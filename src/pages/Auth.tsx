import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Flame, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);

  // Already logged in — go to dashboard
  if (!loading && user) return <Navigate to="/" replace />;

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return toast.error("Enter email and password");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        if (error.message.toLowerCase().includes("invalid login credentials")) {
          toast.error("Wrong email or password. Please try again.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Welcome back, Admin!");
      nav("/");
    } catch (err: any) {
      toast.error(err.message ?? "Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background px-4">
      {/* Background glow */}
      <div className="absolute inset-0 industrial-grid opacity-20 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-primary/8 rounded-full blur-[160px] pointer-events-none" />

      <div className="relative w-full max-w-sm z-10 space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-primary via-orange-500 to-amber-400 flex items-center justify-center shadow-2xl shadow-primary/30 ring-1 ring-white/10">
            <Flame className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              AjithGas
            </h1>
            <p className="text-xs text-muted-foreground font-medium mt-1 uppercase tracking-widest">
              Gas Cylinder Distribution
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-card/80 backdrop-blur-xl border border-border/60 rounded-2xl shadow-2xl p-8 space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-foreground">Admin Sign In</h2>
            <p className="text-xs text-muted-foreground">Enter your credentials to access the dashboard</p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  className="pl-9 h-11 bg-background/60 border-border/80 focus-visible:ring-primary focus-visible:border-primary text-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pl-9 pr-10 h-11 bg-background/60 border-border/80 focus-visible:ring-primary focus-visible:border-primary text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="w-full h-11 text-sm font-bold uppercase tracking-wider shadow-lg shadow-primary/25 bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 text-white transition-all duration-200 active:scale-[0.98] mt-2"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In to Dashboard
            </Button>
          </form>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/40 font-semibold tracking-widest uppercase">
          Secured Portal · AjithGas © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
