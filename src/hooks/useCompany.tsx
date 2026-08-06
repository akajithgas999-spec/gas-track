import { createContext, useContext, useState, ReactNode } from "react";

export interface Company {
  id: string;
  name: string;
  code: string;
  tagline: string;
  badgeColor: string;
}

export const DEFAULT_COMPANIES: Company[] = [
  {
    id: "comp-1",
    name: "CylinderOps Main Depot",
    code: "COP1",
    tagline: "Primary Gas Distribution",
    badgeColor: "bg-gradient-to-r from-orange-500 to-amber-500 text-white",
  },
  {
    id: "comp-2",
    name: "PrimeGas Industrial Co",
    code: "PGAS",
    tagline: "Industrial & Medical Supplies",
    badgeColor: "bg-gradient-to-r from-blue-600 to-cyan-500 text-white",
  },
];

interface CompanyCtx {
  company: Company;
  companies: Company[];
  setCompanyId: (id: string) => void;
}

const Ctx = createContext<CompanyCtx>({
  company: DEFAULT_COMPANIES[0],
  companies: DEFAULT_COMPANIES,
  setCompanyId: () => {},
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyIdState] = useState<string>(() => {
    return localStorage.getItem("active_company_id") || "comp-1";
  });

  const company = DEFAULT_COMPANIES.find((c) => c.id === companyId) || DEFAULT_COMPANIES[0];

  const setCompanyId = (id: string) => {
    localStorage.setItem("active_company_id", id);
    setCompanyIdState(id);
  };

  return (
    <Ctx.Provider
      value={{
        company,
        companies: DEFAULT_COMPANIES,
        setCompanyId,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useCompany = () => useContext(Ctx);
