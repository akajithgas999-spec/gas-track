import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Flame, Eye, EyeOff, Loader2, ShieldCheck, Smartphone, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);

  // If already logged in, redirect to dashboard
  if (!loading && user) return <Navigate to="/" replace />;

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return toast.error("Enter email and password");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ 
        email: email.trim(), 
        password 
      });
      if (error) {
        if (error.message.toLowerCase().includes("invalid login credentials")) {
          toast.error("Wrong email or password. Please try again.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Signed in successfully!");
      nav("/");
    } catch (err: any) {
      toast.error(err.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return toast.error("Enter email and password");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    try {
      // Sign up the new user
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        toast.error(error.message);
        return;
      }

      // Check if session is already active (auto-confirmed trigger)
      if (data.session) {
        toast.success("Admin account created and logged in!");
        nav("/");
        return;
      }

      // Fallback: Attempt to sign in immediately in case trigger confirmed but session isn't in signup response
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (!signInError && signInData.session) {
        toast.success("Admin account created and logged in!");
        nav("/");
        return;
      }

      // If still not signed in, tell the user to sign in
      toast.success("Account created successfully! Please sign in.");
      setTab("signin");
    } catch (err: any) {
      toast.error(err.message ?? "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background px-4 py-12">
      {/* Background patterns */}
      <div className="absolute inset-0 industrial-grid opacity-30 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative w-full max-w-md z-10 space-y-6">
        {/* App Logo */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-primary to-orange-400 flex items-center justify-center shadow-lg shadow-primary/20 ring-1 ring-white/10">
            <Flame className="h-7 w-7 text-primary-foreground animate-pulse" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              CylinderOps
            </h1>
            <p className="text-sm text-muted-foreground font-medium mt-1">
              Gas Cylinder Distribution Admin
            </p>
          </div>
        </div>

        {/* Auth Panel Card */}
        <Card className="border-border/60 shadow-xl bg-card/85 backdrop-blur-md">
          {/* Custom Navigation Tabs */}
          <div className="flex border-b border-border/40">
            <button
              type="button"
              onClick={() => setTab("signin")}
              className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                tab === "signin"
                  ? "text-primary border-primary bg-primary/5"
                  : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/30"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setTab("signup")}
              className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                tab === "signup"
                  ? "text-primary border-primary bg-primary/5"
                  : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/30"
              }`}
            >
              Register Admin
            </button>
          </div>

          <CardHeader className="space-y-1.5 pt-6 pb-2">
            <CardTitle className="text-xl font-bold text-center">
              {tab === "signin" ? "Admin Access Only" : "Create Master Admin"}
            </CardTitle>
            <CardDescription className="text-center text-xs text-muted-foreground">
              {tab === "signin"
                ? "Enter your credentials to manage inventory and billing."
                : "Register the primary administrator account for this system."}
            </CardDescription>
          </CardHeader>

          <form onSubmit={tab === "signin" ? handleSignIn : handleSignUp}>
            <CardContent className="space-y-4 pt-4">
              {/* Email */}
              <div className="space-y-2">
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
                    className="pl-9 h-11 bg-background/50 border-border/80 focus-visible:ring-primary focus-visible:border-primary transition-all text-sm"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Password
                  </Label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={tab === "signin" ? "current-password" : "new-password"}
                    className="pl-9 pr-10 h-11 bg-background/50 border-border/80 focus-visible:ring-primary focus-visible:border-primary transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPass ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
                {tab === "signup" && (
                  <p className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">
                    Password must be at least 6 characters.
                  </p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 pb-6">
              <Button
                type="submit"
                disabled={busy}
                className="w-full h-11 text-sm font-bold uppercase tracking-wider shadow-lg shadow-primary/25 bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 text-primary-foreground transition-all duration-300 active:scale-[0.98]"
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tab === "signin" ? "Sign In to Dashboard" : "Create Admin Account"}
              </Button>

              {/* Status information badges */}
              <div className="grid grid-cols-2 gap-2.5 w-full pt-2 border-t border-border/40">
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/40 border border-border/30">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-foreground leading-tight">Persistent</span>
                    <span className="text-[9px] text-muted-foreground truncate">Stays signed in</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/40 border border-border/30">
                  <Smartphone className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-foreground leading-tight">Multi-Device</span>
                    <span className="text-[9px] text-muted-foreground truncate">Login anywhere</span>
                  </div>
                </div>
              </div>
            </CardFooter>
          </form>
        </Card>

        <div className="text-center">
          <p className="text-[10px] text-muted-foreground/50 font-semibold tracking-widest uppercase">
            Secured Portal · CylinderOps © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
