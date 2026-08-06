import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  loginAsDemo: () => void;
}

const DEMO_USER: User = {
  id: "demo-admin-id",
  app_metadata: { provider: "email" },
  user_metadata: { name: "Demo Admin" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
  email: "admin@demo.com",
};

const DEMO_SESSION: Session = {
  access_token: "demo-access-token",
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "demo-refresh-token",
  user: DEMO_USER,
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkDemoAuth = () => {
    if (localStorage.getItem("demo_auth") === "true") {
      setSession(DEMO_SESSION);
      setUser(DEMO_USER);
      setIsAdmin(true);
      setLoading(false);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (checkDemoAuth()) return;

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (localStorage.getItem("demo_auth") === "true") return;
      setSession(s);
      setUser(s?.user ?? null);
      setIsAdmin(!!s?.user);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (localStorage.getItem("demo_auth") === "true") return;
      setSession(s);
      setUser(s?.user ?? null);
      setIsAdmin(!!s?.user);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const loginAsDemo = () => {
    localStorage.setItem("demo_auth", "true");
    setSession(DEMO_SESSION);
    setUser(DEMO_USER);
    setIsAdmin(true);
    setLoading(false);
  };

  const signOut = async () => {
    localStorage.removeItem("demo_auth");
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // Ignore if supabase is not reachable
    }
  };

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        isAdmin,
        loading,
        signOut,
        loginAsDemo,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
