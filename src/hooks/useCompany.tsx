import { createContext, useContext, useState, ReactNode } from "react";

export type CompanyName = "AjithGas" | "Barani Gas";

const COMPANIES: CompanyName[] = ["AjithGas", "Barani Gas"];

interface CompanyCtx {
  company: CompanyName;
  toggle: () => void;
}

const Ctx = createContext<CompanyCtx>({ company: "AjithGas", toggle: () => {} });

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<CompanyName>(() => {
    return (localStorage.getItem("active_company") as CompanyName) || "AjithGas";
  });

  const toggle = () => {
    const next = COMPANIES[(COMPANIES.indexOf(company) + 1) % COMPANIES.length];
    setCompany(next);
    localStorage.setItem("active_company", next);
  };

  return <Ctx.Provider value={{ company, toggle }}>{children}</Ctx.Provider>;
}

export const useCompany = () => useContext(Ctx);
