import { type SidebarSection } from "./components/Sidebar";

export type BusinessType = "HEALTH" | "BEAUTY" | "RETAIL";

export type ContactLabels = {
  plural: string;
  pluralLower: string;
  singular: string;
  singularCapitalized: string;
  singularLower: string;
};

type SidebarEntry = { key: SidebarSection; label: string };

export type BusinessConfig = {
  label: string;
  short: string;
  contactLabels: ContactLabels;
  sidebarSections: SidebarEntry[];
  register: {
    requiresSpecialty: boolean;
  };
};

const HEALTH_SECTIONS: SidebarEntry[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "risk", label: "Radar crítico" },
  { key: "agenda", label: "Agenda & Turnos" },
  { key: "patients", label: "Pacientes" },
  { key: "history", label: "Historia clínica" },
  { key: "metrics", label: "Métricas" },
  { key: "documents", label: "Documentos" },
  { key: "profile", label: "Mi perfil" },
];

const BEAUTY_SECTIONS: SidebarEntry[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "agenda", label: "Agenda & Turnos" },
  { key: "patients", label: "Clientes" },
  { key: "metrics", label: "Métricas" },
  { key: "documents", label: "Documentos" },
  { key: "profile", label: "Mi perfil" },
];

const RETAIL_SECTIONS: SidebarEntry[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "stock", label: "Stock" },
  { key: "orders", label: "Pedidos" },
  { key: "promotions", label: "Promociones" },
  { key: "debts", label: "Seguimiento de deudas" },
  { key: "patients", label: "Clientes" },
  { key: "metrics", label: "Métricas" },
  { key: "attachments", label: "Comprobantes" },
  { key: "profile", label: "Mi perfil" },
];

const contactLabelsHealth: ContactLabels = {
  plural: "Pacientes",
  pluralLower: "pacientes",
  singular: "paciente",
  singularCapitalized: "Paciente",
  singularLower: "paciente",
};

const contactLabelsClient: ContactLabels = {
  plural: "Clientes",
  pluralLower: "clientes",
  singular: "cliente",
  singularCapitalized: "Cliente",
  singularLower: "cliente",
};

const BUSINESS_CONFIG: Record<BusinessType, BusinessConfig> = {
  HEALTH: {
    label: "Servicios de salud",
    short: "SS",
    contactLabels: contactLabelsHealth,
    sidebarSections: HEALTH_SECTIONS,
    register: {
      requiresSpecialty: true,
    },
  },
  BEAUTY: {
    label: "Servicios de belleza",
    short: "SB",
    contactLabels: contactLabelsClient,
    sidebarSections: BEAUTY_SECTIONS,
    register: {
      requiresSpecialty: false,
    },
  },
  RETAIL: {
    label: "Comercios",
    short: "CM",
    contactLabels: contactLabelsClient,
    sidebarSections: RETAIL_SECTIONS,
    register: {
      requiresSpecialty: false,
    },
  },
};

export function getBusinessConfig(
  type?: BusinessType | null
): BusinessConfig {
  if (type && BUSINESS_CONFIG[type]) {
    return BUSINESS_CONFIG[type];
  }
  return BUSINESS_CONFIG.HEALTH;
}
