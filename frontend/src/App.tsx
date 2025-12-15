// src/App.tsx
import "./index.css";
import Sidebar, { type SidebarSection } from "./components/Sidebar";
import {
  type BusinessType,
  type ContactLabels,
  getBusinessConfig,
} from "./businessConfig";
import Topbar from "./components/Topbar";
import AuthScreen from "./components/AuthScreen";
import whatsappIcon from "./assets/whatsappicon.svg";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { buildApiUrl } from "./config";
import { ClientsHealthView } from "./components/ClientsHealthView";
import { ClientsRetailView } from "./components/ClientsRetailView";
import { ClientsHealthList } from "./components/ClientsHealthList";
import { ClientsRetailList } from "./components/ClientsRetailList";
import VirtualizedList from "./components/VirtualizedList";

type DashboardStats = {
  consultasHoy: number;
  pacientesEnEspera: number;
  ingresosMes: number;
  pacientesRecurrentesPorcentaje: number;
};

type RetailDashboardStats = {
  pedidosHoy: number;
  pedidosConfirmadosHoy: number;
  ingresosHoy: number;
  clientesHoy: number;
};

type Promotion = {
  id: number;
  title: string;
  description?: string | null;
  discountType: "amount" | "percent" | string;
  discountValue: number;
  imageUrl?: string | null;
  productIds: number[];
  productTagLabels: string[];
  durationDays?: number | null;
  untilStockOut: boolean;
  startDate: string;
  endDate?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type RetailMetricsResponse = {
  totals: {
    total: number;
    pending: number;
    confirmed: number;
    cancelled: number;
  };
  revenue: {
    paid: number;
    total: number;
    outstanding: number;
    partialOutstanding: number;
    avgTicketPaid: number;
  };
  clients: {
    unique: number;
  };
  products: {
    best: { name: string; quantity: number; revenue: number } | null;
    worst: { name: string; quantity: number; revenue: number } | null;
  };
  daily: Array<{ date: string; orders: number; paid: number; total: number }>;
  promotions?: {
    appliedOrders: number;
    totalDiscount: number;
    top: { id: number; title: string; uses: number } | null;
  };
};

type AgendaItem = {
  id: number; // 👈 nuevo
  hora: string;
  paciente: string;
  descripcion: string;
  accion: "recordatorio" | "reprogramar" | "ver_estudios" | string;
  status?: string;
  dateTimeISO?: string;
  patientId?: number | null;
  insuranceProvider?: string | null;
  phone?: string | null;
};

type PagosInfo = {
  cobradoHoy: number;
  pendiente: number;
};

type PendingOrderToday = {
  id: number;
  sequenceNumber: number;
  clientName: string;
  status: string;
  createdAt: string;
  totalAmount: number;
};

type DashboardSummary = {
  stats: DashboardStats;
  agendaHoy: AgendaItem[];
  pagos: PagosInfo;
  retailStats?: RetailDashboardStats;
  pendingOrdersToday?: PendingOrderToday[];
};

type DoctorAvailabilityStatus = "available" | "unavailable" | "vacation";

const DEFAULT_AVAILABILITY_STATUS: DoctorAvailabilityStatus = "available";

const normalizeAvailabilityStatusValue = (
  value?: string | null
): DoctorAvailabilityStatus => {
  if (!value) return DEFAULT_AVAILABILITY_STATUS;
  const normalized = value.toLowerCase();
  if (normalized === "unavailable") return "unavailable";
  if (normalized === "vacation") return "vacation";
  return DEFAULT_AVAILABILITY_STATUS;
};

type Doctor = {
  id: number;
  name: string;
  email: string;
  businessType: BusinessType;
  availabilityStatus?: DoctorAvailabilityStatus;
  profileImageUrl?: string | null;
  ticketLogoUrl?: string | null;
};

type PatientTag = {
  id: number;
  label: string;
  severity: "critical" | "high" | "medium" | "info";
  createdAt?: string;
};

type ProductTagItem = {
  id: number;
  label: string;
  severity: PatientTag["severity"];
  createdAt: string;
};

type ProductItem = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  categories: string[];
  price: number;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  tags: ProductTagItem[];
};

type CommerceOrderItem = {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
};

type CommerceProduct = ProductItem;

type CommerceOrder = {
  id: number;
  sequenceNumber: number;
  status: "pending" | "confirmed" | "cancelled";
  totalAmount: number;
  paymentStatus: "unpaid" | "partial" | "paid" | string;
  paidAmount: number;
  customerName: string;
  customerAddress: string | null;
  customerDni: string | null;
  createdAt: string;
  promotions?: Array<{
    id: number;
    title: string;
    discountType: string;
    discountValue: number;
  }>;
  items: CommerceOrderItem[];
  attachments?: Array<{
    id: number;
    url: string;
    filename: string | null;
    mimeType?: string;
    createdAt: string;
  }>;
};

type Patient = {
  id: number;
  fullName: string;
  phone: string | null;
  dni?: string | null;
  birthDate?: string | null;
  address?: string | null;
  occupation?: string | null;
  maritalStatus?: string | null;
  insuranceProvider?: string | null;
  consultReason?: string | null;
  tags: PatientTag[];
  needsDni?: boolean;
  needsName?: boolean;
  needsBirthDate?: boolean;
  needsAddress?: boolean;
  needsInsurance?: boolean;
  needsConsultReason?: boolean;
  isProfileComplete?: boolean;
};

type Consultation = {
  id: number;
  dateTime: string;
  type: string;
  status: string;
  price: number;
  paid: boolean;
  paymentMethod?: string | null;
  chargedAmount?: number | null;
};

type PatientDetail = {
  patient: Patient;
  consultations: Consultation[];
  orders?: CommerceOrder[];
};

type PatientSegmentSummary = {
  label: string;
  severity: PatientTag["severity"];
  count: number;
};

type InboxDocument = {
  id: number;
  patientId: number;
  patientName: string;
  caption?: string | null;
  mediaContentType?: string | null;
  createdAt: string;
};

type InboxAppointment = {
  id: number;
  patientId: number | null;
  patientName: string;
  dateTimeISO: string;
  status: string;
  type: string;
  createdAt: string;
};

type InboxPatient = {
  id: number;
  fullName: string;
  phone?: string | null;
  createdAt?: string | null;
  missingFields: string[];
};

type InboxData = {
  documents: InboxDocument[];
  newAppointments: InboxAppointment[];
  incompletePatients: InboxPatient[];
  newOrders?: Array<{
    id: number;
    sequenceNumber: number;
    customerName: string;
    totalAmount: number;
    createdAt: string;
  }>;
  newClients?: Array<{
    id: number;
    fullName: string;
    phone?: string | null;
    createdAt?: string | null;
  }>;
  overdueOrders?: Array<{
    id: number;
    sequenceNumber: number;
    customerName: string;
    totalAmount: number;
    paidAmount: number;
    createdAt: string;
    paymentStatus: string;
  }>;
};

type InvisibleRiskLevel = "critical" | "high" | "medium";

type InvisibleRiskInsight = {
  id: string;
  patientId: number | null;
  patientName: string;
  score: number;
  level: InvisibleRiskLevel;
  reasons: string[];
};

const buildEmptyInboxData = (): InboxData => ({
  documents: [],
  newAppointments: [],
  incompletePatients: [],
});

const INVISIBLE_RISK_LEVEL_META: Record<
  InvisibleRiskLevel,
  { label: string; badgeClass: string; dotClass: string }
> = {
  critical: {
    label: "Crítico",
    badgeClass:
      "border border-rose-500/50 bg-rose-500/10 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.2)]",
    dotClass: "bg-rose-300",
  },
  high: {
    label: "Alto",
    badgeClass:
      "border border-amber-400/60 bg-amber-500/10 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.18)]",
    dotClass: "bg-amber-300",
  },
  medium: {
    label: "Medio",
    badgeClass:
      "border border-sky-400/50 bg-sky-500/10 text-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.18)]",
    dotClass: "bg-sky-300",
  },
};

const PATIENT_TAG_STYLE_MAP: Record<
  PatientTag["severity"],
  {
    badge: string;
    toggle: string;
  }
> = {
  critical: {
    badge:
      "bg-[#3b111d] text-rose-100 border border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.25)]",
    toggle: "focus:ring-rose-500/40",
  },
  high: {
    badge:
      "bg-[#3b2409] text-amber-100 border border-amber-400/40 shadow-[0_0_8px_rgba(251,191,36,0.25)]",
    toggle: "focus:ring-amber-400/30",
  },
  medium: {
    badge:
      "bg-[#0f2b1f] text-emerald-100 border border-emerald-400/40 shadow-[0_0_8px_rgba(16,185,129,0.25)]",
    toggle: "focus:ring-emerald-400/30",
  },
  info: {
    badge:
      "bg-[#0d213a] text-sky-100 border border-sky-400/40 shadow-[0_0_8px_rgba(56,189,248,0.25)]",
    toggle: "focus:ring-sky-400/30",
  },
};

const PATIENT_TAG_SEVERITY_OPTIONS: Array<{
  value: PatientTag["severity"];
  label: string;
  description: string;
}> = [
  {
    value: "critical",
    label: "Prioridad crítica",
    description: "Riesgos altos, alergias, embarazos de riesgo.",
  },
  {
    value: "high",
    label: "Importante",
    description: "Seguimientos frecuentes, patologías activas.",
  },
  {
    value: "medium",
    label: "Control programado",
    description: "Controles regulares o recordatorios.",
  },
  {
    value: "info",
    label: "Dato informativo",
    description: "Preferencias, contexto general o VIP.",
  },
];

const RETAIL_TAG_SEVERITY_OPTIONS: Array<{
  value: PatientTag["severity"];
  label: string;
  description: string;
}> = [
  {
    value: "critical",
    label: "Muy importante",
    description: "Clientes clave, VIP o con condiciones especiales.",
  },
  {
    value: "high",
    label: "Seguir de cerca",
    description: "Deudores frecuentes o con atención prioritaria.",
  },
  {
    value: "medium",
    label: "Recordatorios",
    description: "Contactar seguido o revisar stock para este cliente.",
  },
  {
    value: "info",
    label: "Dato informativo",
    description: "Preferencias, categorías favoritas o contexto general.",
  },
];

const PRODUCT_CATEGORY_OPTIONS = [
  { key: "beverages", label: "Bebidas" },
  { key: "food", label: "Comidas" },
  { key: "coca_line", label: "Línea Coca" },
  { key: "manaos_line", label: "Línea Manaos" },
  { key: "snacks", label: "Galletitas & Snacks" },
  { key: "bakery", label: "Panificados" },
  { key: "cleaning", label: "Limpieza" },
  { key: "personal_care", label: "Cuidado personal" },
] as const;

const PRODUCT_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  PRODUCT_CATEGORY_OPTIONS.map((option) => [option.key, option.label])
);

const getPatientTagBadgeClass = (severity: string) => {
  const style =
    PATIENT_TAG_STYLE_MAP[severity as keyof typeof PATIENT_TAG_STYLE_MAP];
  return (
    style?.badge ||
    "bg-slate-800 text-slate-100 border border-slate-600/60"
  );
};

type PatientNote = {
  id: number;
  content: string;
  createdAt: string;
};

type PatientDocumentItem = {
  id: number;
  patientId: number;
  patientName: string;
  mediaUrl: string;
  mediaContentType?: string | null;
  caption?: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

type OrderAttachmentItem = {
  id: number;
  orderId: number;
  orderSequenceNumber: number;
  customerName: string;
  clientId?: number | null;
  url: string;
  filename?: string | null;
  mimeType?: string | null;
  createdAt: string;
  orderCreatedAt?: string | null;
};
type CalendarAppointment = {
  id: number;
  dateTime: string;
  type: string;
  status: string;
  source?: string;
  chargedAmount?: number | null;
  price?: number | null;
  paymentMethod?: "cash" | "transfer_card" | null;
  patient: {
    id: number | null;
    fullName: string | null;
    insuranceProvider?: string | null;
  };
};

const CALENDAR_HIDDEN_STATUSES = new Set([
  "cancelled",
  "canceled",
  "cancelled_by_patient",
  "cancelled_by_doctor",
]);

type ChatMessage = {
  id: number;
  from: string;
  to: string;
  direction: "incoming" | "outgoing";
  type: string;
  body: string | null;
  createdAt: string;
};

type AutomationMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
  timestamp: string;
};

type ParsedAutomationDateTime = {
  targetDate?: Date | null;
  targetLabel?: string;
  hasDate: boolean;
  hasTime: boolean;
};

type AutomationRescheduleIntent = {
  appointmentId: number;
  targetDate?: Date | null;
  targetLabel?: string;
  reason?: string;
  slotApplied?: boolean;
  feedbackSent?: boolean;
};

type AutomationAppointmentMatch =
  | {
      source: "agenda";
      patientName: string;
      item: AgendaItem;
    }
  | {
      source: "calendar";
      patientName: string;
      item: CalendarAppointment;
    };

type AutomationHistoryIntent = {
  patientId: number;
  patientName: string;
  action: "download_history";
};

type AutomationAction =
  | {
      type: "navigate";
      target: SectionKey;
      note?: string;
    }
  | {
      type: "send_payment_reminders";
      orderIds: number[];
      note?: string;
    }
  | {
      type: "adjust_stock";
      productId?: number;
      productName?: string;
      delta?: number;
      setQuantity?: number;
      note?: string;
    }
  | {
      type: "increase_prices_percent";
      productIds?: number[];
      percent: number;
      note?: string;
    }
  | {
      type: "broadcast_prompt";
      message: string;
      note?: string;
    }
  | {
      type: "noop";
      note?: string;
    };

type ClinicalHistoryDownloadResult = {
  success: boolean;
  usedFallback: boolean;
  errorMessage?: string | null;
};

type SectionKey =
  | "stock"
  | "dashboard"
  | "risk"
  | "agenda"
  | "orders"
  | "debts"
  | "promotions"
  | "patients"
  | "history"
  | "metrics"
  | "documents"
  | "attachments"
  | "profile";

const AUTH_STORAGE_KEY = "med-assist-auth";
const PROFILE_FORM_STORAGE_KEY = "med-assist-profile-form";
const THEME_STORAGE_KEY = "med-assist-theme";

type ThemeMode = "dark" | "light";

const WEEK_DAYS = [
  { key: "mon", label: "Lunes", short: "Lun" },
  { key: "tue", label: "Martes", short: "Mar" },
  { key: "wed", label: "Miércoles", short: "Mié" },
  { key: "thu", label: "Jueves", short: "Jue" },
  { key: "fri", label: "Viernes", short: "Vie" },
  { key: "sat", label: "Sábado", short: "Sáb" },
  { key: "sun", label: "Domingo", short: "Dom" },
] as const;

const defaultProfileForm = {
  specialty: "",
  clinicName: "",
  clinicAddress: "",
  ticketLogoUrl: "",
  officeDays: "",
  officeDaysSelection: [] as string[],
  officeHours: "",
  worksFullDay: false,
  officeHoursFullDayStart: "",
  officeHoursFullDayEnd: "",
  officeHoursMorningStart: "",
  officeHoursMorningEnd: "",
  officeHoursAfternoonStart: "",
  officeHoursAfternoonEnd: "",
  consultFee: "",
  emergencyFee: "",
  contactPhone: "",
  extraNotes: "",
  slotInterval: "30",
};

type OfficeHoursRanges = Pick<
  typeof defaultProfileForm,
  | "worksFullDay"
  | "officeHoursFullDayStart"
  | "officeHoursFullDayEnd"
  | "officeHoursMorningStart"
  | "officeHoursMorningEnd"
  | "officeHoursAfternoonStart"
  | "officeHoursAfternoonEnd"
>;

const emptyOfficeHoursRanges: OfficeHoursRanges = {
  worksFullDay: false,
  officeHoursFullDayStart: "",
  officeHoursFullDayEnd: "",
  officeHoursMorningStart: "",
  officeHoursMorningEnd: "",
  officeHoursAfternoonStart: "",
  officeHoursAfternoonEnd: "",
};

const normalizeTimeValue = (input?: string | null) => {
  if (!input) return "";
  if (/^\d{1,2}$/.test(input)) {
    return `${input.padStart(2, "0")}:00`;
  }
  if (/^\d{1,2}:\d{1,2}$/.test(input)) {
    const [h, m = "00"] = input.split(":");
    return `${h.padStart(2, "0")}:${m.padStart(2, "0").slice(0, 2)}`;
  }
  return input;
};

const parseOfficeHoursText = (text?: string | null): OfficeHoursRanges => {
  const base: OfficeHoursRanges = { ...emptyOfficeHoursRanges };
  if (!text?.trim()) {
    return base;
  }

  const matches: string[] = [];
  const regex = /\b(\d{1,2})(?::(\d{2}))?\b/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) && matches.length < 4) {
    const hour = match[1]?.padStart(2, "0") ?? "00";
    const minutes = (match[2] ?? "00").padStart(2, "0").slice(0, 2);
    matches.push(normalizeTimeValue(`${hour}:${minutes}`));
  }

  const lowered = text.toLowerCase();
  const hasFullDayKeyword = /(jornada|turno)\s+complet[ao]|corrido|todo el d[ií]a|full\s*day/.test(
    lowered
  );

  base.officeHoursMorningStart = matches[0] ?? "";
  base.officeHoursMorningEnd = matches[1] ?? "";
  base.officeHoursAfternoonStart = matches[2] ?? "";
  base.officeHoursAfternoonEnd = matches[3] ?? "";

  if (hasFullDayKeyword) {
    base.worksFullDay = true;
    base.officeHoursFullDayStart = matches[0] ?? "";
    base.officeHoursFullDayEnd = matches[1] ?? "";
    base.officeHoursAfternoonStart = "";
    base.officeHoursAfternoonEnd = "";
  }

  return base;
};

const buildOfficeHoursSummary = (ranges: OfficeHoursRanges) => {
  const segments: string[] = [];

  const fullDayStart = normalizeTimeValue(ranges.officeHoursFullDayStart);
  const fullDayEnd = normalizeTimeValue(ranges.officeHoursFullDayEnd);
  const morningStart = normalizeTimeValue(ranges.officeHoursMorningStart);
  const morningEnd = normalizeTimeValue(ranges.officeHoursMorningEnd);
  const afternoonStart = normalizeTimeValue(
    ranges.officeHoursAfternoonStart
  );
  const afternoonEnd = normalizeTimeValue(ranges.officeHoursAfternoonEnd);

  if (ranges.worksFullDay && fullDayStart && fullDayEnd) {
    segments.push(`Jornada completa ${fullDayStart} - ${fullDayEnd}`);
    return segments.join(" | ");
  }

  if (morningStart && morningEnd) {
    segments.push(
      `Turno mañana ${morningStart} - ${morningEnd}`
    );
  }

  if (afternoonStart && afternoonEnd) {
    segments.push(
      `Turno tarde ${afternoonStart} - ${afternoonEnd}`
    );
  }

  return segments.join(" | ");
};

const parseOfficeDaysSelection = (text?: string | null) => {
  if (!text?.trim()) return [] as string[];
  const normalized = text.toLowerCase();
  const selected: string[] = [];
  WEEK_DAYS.forEach((day) => {
    if (
      normalized.includes(day.label.toLowerCase()) ||
      normalized.includes(day.short.toLowerCase())
    ) {
      selected.push(day.key);
    }
  });
  return selected;
};

const buildOfficeDaysSummaryFromKeys = (keys: string[]) => {
  if (!keys.length) return "";
  const ordered = WEEK_DAYS.filter((day) => keys.includes(day.key));
  return ordered.map((day) => day.label).join(", ");
};

const MAX_UPLOAD_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];

const getProfileStorageKey = (doctorId?: number | null) =>
  doctorId ? `${PROFILE_FORM_STORAGE_KEY}-${doctorId}` : PROFILE_FORM_STORAGE_KEY;

type WhatsappConnectionStatus = "connected" | "pending" | "disconnected";

type WhatsappConnection = {
  status: WhatsappConnectionStatus;
  businessNumber: string | null;
  connectedAt: string | null;
};

const defaultWhatsappConnection: WhatsappConnection = {
  status: "disconnected",
  businessNumber: null,
  connectedAt: null,
};

const mapWhatsappPayload = (payload: any): WhatsappConnection => ({
  status: (payload?.status as WhatsappConnectionStatus) || "disconnected",
  businessNumber: payload?.businessNumber ?? null,
  connectedAt: payload?.connectedAt ?? null,
});

const prettyWhatsappNumber = (value: string | null) =>
  value ? value.replace(/^whatsapp:/i, "") : "";

const SLOT_INTERVAL_OPTIONS = ["15", "30", "60", "120"];

const START_CALENDAR_HOUR = 8;
const END_CALENDAR_HOUR = 20;
const HOUR_HEIGHT = 60; // px
type AvailableSlotOption = {
  startISO: string;
  humanLabel: string;
};
type MetricsRange = "today" | "week" | "month";
const DASHBOARD_REFRESH_INTERVAL_MS = 60_000;
const PATIENTS_REFRESH_INTERVAL_MS = 60_000;
const CALENDAR_REFRESH_INTERVAL_MS = 60_000;
const DOCUMENTS_REFRESH_INTERVAL_MS = 60_000;
const INBOX_REFRESH_INTERVAL_MS = 60_000;
const METRICS_RANGE_OPTIONS: {
  key: MetricsRange;
  label: string;
  description: string;
}[] = [
  { key: "today", label: "Hoy", description: "Datos del día" },
  { key: "week", label: "Semana", description: "Lunes a domingo" },
  { key: "month", label: "Mes", description: "Mes calendario" },
];

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date: Date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date: Date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getRangeBounds(range: MetricsRange) {
  const now = new Date();
  if (range === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  if (range === "week") {
    const start = startOfWeek(now);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  return { start, end };
}

const SPANISH_WEEKDAY_INDEX: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

const SPANISH_WEEKDAY_LABEL: Record<string, string> = {
  domingo: "domingo",
  lunes: "lunes",
  martes: "martes",
  miercoles: "miércoles",
  miércoles: "miércoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sábado",
  sábado: "sábado",
};

const SPANISH_MONTH_INDEX: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

const RELATIVE_DAY_LABELS: Record<string, string> = {
  hoy: "hoy",
  manana: "mañana",
  "pasado manana": "pasado mañana",
};

const removeDiacritics = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalizeSearchText = (value?: string | null) => {
  if (!value) return "";
  return removeDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const formatAutomationDateTimeLabel = (date: Date) =>
  date.toLocaleString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const parseAutomationDateTime = (
  rawInput: string
): ParsedAutomationDateTime | null => {
  if (!rawInput.trim()) return null;
  const normalized = normalizeSearchText(rawInput);
  if (!normalized) return null;
  const now = new Date();
  let baseDate: { date: Date; label: string } | null = null;

  if (normalized.includes("pasado manana")) {
    baseDate = {
      date: startOfDay(addDays(now, 2)),
      label: RELATIVE_DAY_LABELS["pasado manana"],
    };
  } else if (normalized.includes("manana")) {
    baseDate = {
      date: startOfDay(addDays(now, 1)),
      label: RELATIVE_DAY_LABELS.manana,
    };
  } else if (normalized.includes("hoy")) {
    baseDate = {
      date: startOfDay(now),
      label: RELATIVE_DAY_LABELS.hoy,
    };
  }

  if (!baseDate) {
    const weekdayMatch = normalized.match(
      /\b(domingo|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado)\b/
    );
    if (weekdayMatch) {
      const weekday = weekdayMatch[1];
      const weekdayIndex = SPANISH_WEEKDAY_INDEX[weekday];
      if (typeof weekdayIndex === "number") {
        let diff = (weekdayIndex - now.getDay() + 7) % 7;
        const emphasisRegex = new RegExp(
          `(proximo|proxima|siguiente)\\s+${weekday}`
        );
        const wantsNext = emphasisRegex.test(normalized);
        if (diff === 0 && wantsNext) {
          diff = 7;
        }
        const candidate = startOfDay(addDays(now, diff));
        baseDate = {
          date: candidate,
          label: SPANISH_WEEKDAY_LABEL[weekday] ?? weekday,
        };
      }
    }
  }

  if (!baseDate) {
    const numericMatch = normalized.match(
      /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/
    );
    if (numericMatch) {
      const day = parseInt(numericMatch[1], 10);
      const month = parseInt(numericMatch[2], 10) - 1;
      let year = numericMatch[3]
        ? parseInt(numericMatch[3], 10)
        : now.getFullYear();
      if (year < 100) {
        year += 2000;
      }
      const candidate = startOfDay(new Date(year, month, day));
      if (!numericMatch[3] && candidate < startOfDay(now)) {
        candidate.setFullYear(candidate.getFullYear() + 1);
      }
      baseDate = {
        date: candidate,
        label: candidate.toLocaleDateString("es-AR", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
        }),
      };
    }
  }

  if (!baseDate) {
    const longDateMatch = normalized.match(
      /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{2,4}))?\b/
    );
    if (longDateMatch) {
      const day = parseInt(longDateMatch[1], 10);
      const month = SPANISH_MONTH_INDEX[longDateMatch[2]];
      let year = longDateMatch[3]
        ? parseInt(longDateMatch[3], 10)
        : now.getFullYear();
      if (year < 100) {
        year += 2000;
      }
      if (typeof month === "number") {
        const candidate = startOfDay(new Date(year, month, day));
        if (!longDateMatch[3] && candidate < startOfDay(now)) {
          candidate.setFullYear(candidate.getFullYear() + 1);
        }
        baseDate = {
          date: candidate,
          label: candidate.toLocaleDateString("es-AR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          }),
        };
      }
    }
  }

  const timePatterns = [
    /(?:a\s+las|para\s+las|a\s+la|las)\s+(\d{1,2})(?:[:h\.](\d{2}))?\s*(am|pm)?/,
    /(\d{1,2})(?:[:h\.](\d{2}))?\s*(?:hs|horas|h)\b/,
  ];

  let timeInfo: { hours: number; minutes: number; label: string } | null = null;

  for (const pattern of timePatterns) {
    const match = pattern.exec(normalized);
    if (match) {
      const hourRaw = parseInt(match[1], 10);
      if (Number.isNaN(hourRaw) || hourRaw > 23) continue;
      const minuteRaw = match[2] ? parseInt(match[2], 10) : 0;
      let hours = hourRaw;
      let minutes = Number.isNaN(minuteRaw) ? 0 : minuteRaw;
      const suffix = match[3]?.toLowerCase();
      if (suffix === "pm" && hours < 12) {
        hours += 12;
      }
      if (suffix === "am" && hours === 12) {
        hours = 0;
      }
      if (hours > 23 || minutes > 59) continue;
      const formattedTime = `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")} hs`;
      timeInfo = {
        hours,
        minutes,
        label: `a las ${formattedTime}`,
      };
      break;
    }
  }

  if (!baseDate && !timeInfo) {
    return null;
  }

  const response: ParsedAutomationDateTime = {
    hasDate: Boolean(baseDate),
    hasTime: Boolean(timeInfo),
  };

  if (baseDate && timeInfo) {
    const composed = new Date(baseDate.date);
    composed.setHours(timeInfo.hours, timeInfo.minutes, 0, 0);
    response.targetDate = composed;
    response.targetLabel = formatAutomationDateTimeLabel(composed);
  } else {
    const labelParts: string[] = [];
    if (baseDate?.label) {
      labelParts.push(baseDate.label);
    }
    if (timeInfo?.label) {
      labelParts.push(timeInfo.label);
    }
    response.targetLabel = labelParts.join(" ").trim() || undefined;
  }

  return response;
};

const extractDigits = (value?: string | null) =>
  value ? value.replace(/\D/g, "") : "";

const detectTagSeverityFromText = (text: string): PatientTag["severity"] => {
  const normalized = normalizeSearchText(text);
  if (/crit|urgenc|riesg/.test(normalized)) return "critical";
  if (/alta|importan|prioridad|sensibl/.test(normalized)) return "high";
  if (/control|seguim|medio|program/.test(normalized)) return "medium";
  return "info";
};

const stripTrailingPunctuation = (value: string) =>
  value.replace(/[\s.,;:!¡¿?]+$/g, "").trim();

const extractTagDescriptionFromCommand = (text: string): string | null => {
  const patterns = [
    /que\s+(?:diga|dice|mencione|sea|es)\s+([^.,;]+)/i,
    /que\s+(?:es|sea)\s+([^.,;]+)/i,
    /es\s+([^.,;]+)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const cleaned = stripTrailingPunctuation(match[1]);
      if (cleaned.length > 1) {
        return cleaned;
      }
    }
  }
  return null;
};

function isWithinRange(date: Date, start: Date, end: Date) {
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

const formatDocumentTimestamp = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Fecha desconocida";
  }
  return date.toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const resolveAssetUrl = (value?: string | null) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return buildApiUrl(`${value}`);
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("No pude leer la imagen. Intentá nuevamente."));
      }
    };
    reader.onerror = () =>
      reject(new Error("No pude leer la imagen. Intentá nuevamente."));
    reader.readAsDataURL(file);
  });

const normalizeProductRecord = (product: ProductItem): ProductItem => ({
  ...product,
  imageUrl: resolveAssetUrl(product.imageUrl),
  categories: Array.isArray(product.categories) ? product.categories : [],
  tags: Array.isArray(product.tags) ? product.tags : [],
});

const formatPatientBirthDate = (value?: string | Date | null) => {
  if (!value) return "Pendiente";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Pendiente";
  }
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatFullDateTime = (iso?: string | null) => {
  if (!iso) return "Sin fecha";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  const day = date.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
};

const formatCurrencyARS = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      })
    : "$ 0";

const parseFormInteger = (value: string | number) => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.round(value));
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.,-]/g, "").replace(",", ".");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.round(parsed));
  }
  return null;
};

const createPdfFromText = (text: string) => {
  const sanitizeLine = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[•·]/g, "-")
      .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "");

  const lines = text
    .split(/\r?\n/)
    .flatMap((rawLine) => {
      const line = sanitizeLine(rawLine);
      if (line.length === 0) return [" "];
      const limit = 90;
      const chunks: string[] = [];
      let remaining = line;
      while (remaining.length > limit) {
        let breakIndex = remaining.lastIndexOf(" ", limit);
        if (breakIndex === -1 || breakIndex < limit * 0.6) {
          breakIndex = limit;
        }
        const chunk = remaining.slice(0, breakIndex).trimEnd();
        chunks.push(chunk.length ? chunk : " ");
        remaining = remaining.slice(breakIndex).trimStart();
      }
      if (remaining.length > 0) {
        chunks.push(remaining);
      }
      return chunks.length > 0 ? chunks : [" "];
    });

  const escapePdfText = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const contentStream = [
    "BT",
    "/F1 12 Tf",
    "50 780 Td",
    "14 TL",
    ...lines.flatMap((line) => [`(${escapePdfText(line)}) Tj`, "T*"]),
    "ET",
  ].join("\n");

  const contentLength = contentStream.length;

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdfContent = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((obj) => {
    offsets.push(pdfContent.length);
    pdfContent += obj;
  });

  const xrefStart = pdfContent.length;
  const totalObjects = objects.length + 1;
  const pad = (num: number) => num.toString().padStart(10, "0");
  pdfContent += `xref\n0 ${totalObjects}\n`;
  pdfContent += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdfContent += `${pad(offsets[i])} 00000 n \n`;
  }
  pdfContent += `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdfContent], { type: "application/pdf" });
};

const buildClinicalHistoryNarrative = (
  snapshot: PatientDetail,
  contactLabels: ContactLabels,
  doctorName?: string | null
) => {
  const patient = snapshot.patient;
  const lines: string[] = [];
  const fullName = patient.fullName?.trim() || `${contactLabels.singularCapitalized} sin nombre`;
  const dni = patient.dni?.trim() || "Sin DNI";
  const doctorLine = doctorName?.trim()
    ? `Profesional a cargo: ${doctorName.trim()}`
    : "Profesional a cargo: No especificado";

  lines.push(`Historia clínica de ${fullName} (DNI ${dni})`);
  lines.push(doctorLine);
  lines.push(`Fecha de generación: ${formatFullDateTime(new Date().toISOString())}`);
  lines.push("");

  lines.push("Datos generales:");
  lines.push(`- Fecha de nacimiento: ${formatPatientBirthDate(patient.birthDate)}`);
  lines.push(`- Teléfono: ${patient.phone?.trim() || "Sin teléfono registrado"}`);
  lines.push(`- Dirección: ${patient.address?.trim() || "Pendiente"}`);
  lines.push(`- Cobertura / Obra social: ${patient.insuranceProvider?.trim() || "Pendiente"}`);
  lines.push(`- Ocupación: ${patient.occupation?.trim() || "Pendiente"}`);
  lines.push(`- Estado civil: ${patient.maritalStatus?.trim() || "Pendiente"}`);
  lines.push(`- Motivo principal declarado: ${patient.consultReason?.trim() || "Pendiente"}`);
  lines.push("");

  if (patient.tags && patient.tags.length > 0) {
    lines.push("Datos importantes registrados:");
    patient.tags.forEach((tag) => {
      lines.push(`• ${tag.label}`);
    });
  } else {
    lines.push("Sin datos importantes cargados.");
  }
  lines.push("");

  if (snapshot.consultations.length === 0) {
    lines.push("No hay consultas registradas para este paciente.");
  } else {
    lines.push("Consultas registradas:");
    snapshot.consultations.forEach((consultation, index) => {
      const label = formatFullDateTime(consultation.dateTime);
      lines.push(
        `${index + 1}. ${label} · ${consultation.type?.trim() || "Consulta sin detalle"}`
      );
      lines.push("");
    });
  }

  lines.push(
    "Observación: este documento fue generado automáticamente a partir de los datos cargados en la ficha clínica. Verificá la información antes de compartirla."
  );

  return lines.join("\n");
};

const buildClinicalHistoryDocumentText = (
  snapshot: PatientDetail,
  contactLabels: ContactLabels,
  doctorName: string | null,
  aiNarrative: string,
  generatedAtIso?: string | null
) => {
  const patient = snapshot.patient;
  const lines: string[] = [];
  const fullName =
    patient.fullName?.trim() || `${contactLabels.singularCapitalized} sin nombre`;
  const dni = patient.dni?.trim() || "Sin DNI";
  const generatedLabel = generatedAtIso
    ? formatFullDateTime(generatedAtIso)
    : formatFullDateTime(new Date().toISOString());

  lines.push(`Historia clínica - ${fullName}`);
  lines.push(`Generada: ${generatedLabel}`);
  lines.push("");
  lines.push("Datos personales:");
  lines.push(`Nombre: ${fullName}`);
  lines.push(`DNI: ${dni}`);
  lines.push(`Profesional responsable: ${doctorName?.trim() || "No especificado"}`);
  lines.push(`Fecha de nacimiento: ${formatPatientBirthDate(patient.birthDate)}`);
  lines.push(`Teléfono: ${patient.phone?.trim() || "Sin teléfono registrado"}`);
  lines.push(`Dirección: ${patient.address?.trim() || "Pendiente"}`);
  lines.push(`Obra social / Cobertura: ${patient.insuranceProvider?.trim() || "Pendiente"}`);
  lines.push(`Ocupación: ${patient.occupation?.trim() || "Pendiente"}`);
  lines.push(`Estado civil: ${patient.maritalStatus?.trim() || "Pendiente"}`);
  lines.push(`Motivo principal declarado: ${patient.consultReason?.trim() || "Pendiente"}`);
  lines.push("");

  lines.push("Observaciones importantes:");
  if (patient.tags && patient.tags.length > 0) {
    patient.tags.forEach((tag) => {
      lines.push(`- ${tag.label} (${tag.severity})`);
    });
  } else {
    lines.push("- Sin observaciones cargadas.");
  }
  lines.push("");

  const lastConsult = snapshot.consultations[0] || null;
  lines.push(
    `Condición reciente: ${
      lastConsult
        ? `${formatFullDateTime(lastConsult.dateTime)} · ${
            lastConsult.type?.trim() || "Consulta sin detalle"
          }`
        : "Sin consultas registradas"
    }`
  );
  lines.push("");

  lines.push("Consultas registradas:");
  if (snapshot.consultations.length === 0) {
    lines.push("- No registramos consultas para este paciente.");
  } else {
    snapshot.consultations.slice(0, 20).forEach((consultation, index) => {
      const label = formatFullDateTime(consultation.dateTime);
      lines.push(
        `${index + 1}. ${label} · ${consultation.type?.trim() || "Consulta sin detalle"}`
      );
    });
  }
  if (snapshot.consultations.length > 20) {
    lines.push(`... (${snapshot.consultations.length - 20} consultas adicionales)`);
  }
  lines.push("");

  lines.push("Resumen IA:");
  lines.push(aiNarrative.trim() || "No fue posible generar el resumen automático.");
  lines.push("");
  lines.push(
    "Nota: revisá esta información antes de compartirla, ya que se genera automáticamente a partir de la ficha clínica."
  );

  return lines.join("\n");
};

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);

  const [activeSection, setActiveSection] = useState<SectionKey>("dashboard");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" ? "light" : "dark";
  });

  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);
  const productImageInputRef = useRef<HTMLInputElement | null>(null);
const [profileImageUploading, setProfileImageUploading] = useState(false);
const [profileImageError, setProfileImageError] = useState<string | null>(
  null
);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [profileImageMessage, setProfileImageMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setThemeMode(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const handleToggleTheme = useCallback(() => {
    setThemeMode((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const updateDoctorState = useCallback(
    (updater: (current: Doctor) => Doctor) => {
      setDoctor((prev) => {
        if (!prev) return prev;
        const nextDoctor = updater(prev);
        if (token) {
          localStorage.setItem(
            AUTH_STORAGE_KEY,
            JSON.stringify({ token, doctor: nextDoctor })
          );
        }
        return nextDoctor;
      });
    },
    [token]
  );

  const doctorInitials = useMemo(() => {
    if (!doctor?.name) return "";
    return doctor.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }, [doctor?.name]);

  const doctorAvatarUrl = useMemo(
    () => resolveAssetUrl(doctor?.profileImageUrl ?? null),
    [doctor?.profileImageUrl]
  );

  const doctorTicketLogoUrl = useMemo(
    () => resolveAssetUrl(doctor?.ticketLogoUrl ?? null),
    [doctor?.ticketLogoUrl]
  );

  const isRetailBusiness = (doctor?.businessType ?? "HEALTH") === "RETAIL";


  // Pacientes
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(
    null
  );
  const [patientSearch, setPatientSearch] = useState("");
  const [patientViewId, setPatientViewId] = useState<number | null>(null);
  const [patientViewData, setPatientViewData] = useState<PatientDetail | null>(
    null
  );
  const [patientViewLoading, setPatientViewLoading] = useState(false);
  const [patientViewError, setPatientViewError] = useState<string | null>(null);
  const [patientViewRequestId, setPatientViewRequestId] = useState(0);
const [profileEditorOpen, setProfileEditorOpen] = useState(false);
const [profileSaving, setProfileSaving] = useState(false);
const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
const [profileSaveSuccess, setProfileSaveSuccess] = useState<string | null>(
  null
);
const [patientProfileForm, setPatientProfileForm] = useState({
  fullName: "",
  phone: "",
  dni: "",
  birthDate: "",
  address: "",
  insuranceProvider: "",
  occupation: "",
  maritalStatus: "",
});
const [clinicalHistorySnapshot, setClinicalHistorySnapshot] =
  useState<PatientDetail | null>(null);
const [clinicalHistoryDownloading, setClinicalHistoryDownloading] =
  useState(false);

const handleProfileFieldChange = useCallback(
  (field: keyof typeof patientProfileForm, value: string) => {
    setPatientProfileForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  },
  []
);
  const [patientSummaryModalOpen, setPatientSummaryModalOpen] = useState(false);
  const [patientSummaryLoading, setPatientSummaryLoading] = useState(false);
  const [patientSummary, setPatientSummary] = useState<string | null>(null);
  const [patientSummaryError, setPatientSummaryError] = useState<string | null>(
    null
  );
  const [consultationStatusUpdating, setConsultationStatusUpdating] = useState<
    number | null
  >(null);
  const [consultationStatusMessage, setConsultationStatusMessage] = useState<
    string | null
  >(null);
  const [openConsultations, setOpenConsultations] = useState<
    Record<number, boolean>
  >({});
  const [consultationFormState, setConsultationFormState] = useState<
    Record<
      number,
      { paymentMethod: "cash" | "transfer_card" | ""; chargedAmount: string }
    >
  >({});
  const [patientNotesModalOpen, setPatientNotesModalOpen] = useState(false);
  const [patientNotesLoading, setPatientNotesLoading] = useState(false);
  const [patientNotesError, setPatientNotesError] = useState<string | null>(null);
  const [patientNotes, setPatientNotes] = useState<PatientNote[]>([]);
  const [addNoteModalOpen, setAddNoteModalOpen] = useState(false);
  const [addNoteContent, setAddNoteContent] = useState("");
  const [addNoteLoading, setAddNoteLoading] = useState(false);

  const [addNoteError, setAddNoteError] = useState<string | null>(null);
  const [addNoteSuccess, setAddNoteSuccess] = useState<string | null>(null);
  const [patientSegments, setPatientSegments] = useState<
    PatientSegmentSummary[]
  >([]);
  const [patientSegmentsLoading, setPatientSegmentsLoading] = useState(false);
  const [selectedBroadcastSegments, setSelectedBroadcastSegments] = useState<
    string[]
  >([]);
  const PRODUCT_FORM_INITIAL_STATE = useMemo(
    () => ({
      name: "",
      description: "",
      price: "",
      quantity: "",
      categories: [] as string[],
    }),
    []
  );
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productForm, setProductForm] = useState(() => ({
    ...PRODUCT_FORM_INITIAL_STATE,
  }));
  const [productSaving, setProductSaving] = useState(false);
  const [productSuccess, setProductSuccess] = useState<string | null>(null);
  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [productDeletingId, setProductDeletingId] = useState<number | null>(null);
  const [productTagModalOpen, setProductTagModalOpen] = useState(false);
  const [productTagProductId, setProductTagProductId] = useState<number | null>(
    null
  );
  const [productTagLabel, setProductTagLabel] = useState("");
  const [productTagSeverity, setProductTagSeverity] =
    useState<PatientTag["severity"]>("high");
  const [productTagError, setProductTagError] = useState<string | null>(null);
  const [productTagSaving, setProductTagSaving] = useState(false);
  const [productImageBase64, setProductImageBase64] = useState<string | null>(
    null
  );
  const [productImagePreview, setProductImagePreview] = useState<string | null>(
    null
  );
  const [productCategoryModalOpen, setProductCategoryModalOpen] =
    useState(false);
  const [productCategoryInput, setProductCategoryInput] = useState("");
  const [productCategoryError, setProductCategoryError] = useState<
    string | null
  >(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productEditingId, setProductEditingId] = useState<number | null>(null);
  const [productEditDrafts, setProductEditDrafts] = useState<
    Record<
      number,
      {
        name: string;
        price: string;
        quantity: string;
        description: string;
        categories: string[];
      }
    >
  >({});
  const [productEditSavingId, setProductEditSavingId] = useState<number | null>(
    null
  );
  const [productEditError, setProductEditError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productViewMode, setProductViewMode] = useState<"grid" | "list">("grid");
  const [productMultiSelect, setProductMultiSelect] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(
    () => new Set()
  );
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [productDeleteConfirmId, setProductDeleteConfirmId] = useState<number | null>(
    null
  );
  const [productDeleteError, setProductDeleteError] = useState<string | null>(
    null
  );
  const productPendingDelete = useMemo(() => {
    if (!productDeleteConfirmId) return null;
    return (
      products.find((product) => product.id === productDeleteConfirmId) ?? null
    );
  }, [productDeleteConfirmId, products]);
  const selectedProductForTags = useMemo(() => {
    if (!productTagProductId) return null;
    return (
      products.find((product) => product.id === productTagProductId) ?? null
    );
  }, [productTagProductId, products]);

  const productNameById = useMemo(() => {
    const map = new Map<number, string>();
    products.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [products]);

  const productTagOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (Array.isArray(p.tags)) {
        p.tags.forEach((t) => set.add(t.label));
      }
    });
    return Array.from(set);
  }, [products]);

  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagModalPatientId, setTagModalPatientId] = useState<number | null>(
    null
  );
  const [tagFormLabel, setTagFormLabel] = useState("");
  const [tagFormSeverity, setTagFormSeverity] =
    useState<PatientTag["severity"]>("high");
  const [tagFormError, setTagFormError] = useState<string | null>(null);
  const [tagSaving, setTagSaving] = useState(false);
  const [tagRemovingId, setTagRemovingId] = useState<number | null>(null);
  const [calendarWeekStart, setCalendarWeekStart] = useState<Date>(() =>
    startOfWeek(new Date())
  );
  const [calendarAppointments, setCalendarAppointments] = useState<
    CalendarAppointment[]
  >([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [activeAppointmentDetail, setActiveAppointmentDetail] =
    useState<CalendarAppointment | null>(null);
  const [rescheduleModalAppointment, setRescheduleModalAppointment] =
    useState<CalendarAppointment | null>(null);
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailableSlotOption[]>(
    []
  );
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState<string | null>(
    null
  );
  const [rescheduleSelectedSlot, setRescheduleSelectedSlot] = useState<
    string | null
  >(null);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleSubmitError, setRescheduleSubmitError] = useState<
    string | null
  >(null);

  const resetCreateAppointmentForm = useCallback(() => {
    setCreateAppointmentForm({
      patientId: "",
      patientName: "",
      patientPhone: "",
      date: new Date().toISOString().slice(0, 10),
      time: "09:00",
      type: "",
      price: "",
    });
  }, []);

  const handleOpenCreateAppointmentModal = () => {
    setCreateAppointmentError(null);
    resetCreateAppointmentForm();
    setCreateAppointmentModalOpen(true);
  };

  const handleCloseCreateAppointmentModal = () => {
    setCreateAppointmentModalOpen(false);
    setCreateAppointmentError(null);
    resetCreateAppointmentForm();
  };

  const handleCreateAppointmentFieldChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setCreateAppointmentForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCreateAppointmentSubmit = async () => {
    if (!token) return;
    const {
      patientId,
      patientName,
      patientPhone,
      date,
      time,
      type,
      price,
    } = createAppointmentForm;

    if (!date || !time) {
      setCreateAppointmentError("Seleccioná fecha y hora.");
      return;
    }
    const isoDate = new Date(`${date}T${time}`);
    if (Number.isNaN(isoDate.getTime())) {
      setCreateAppointmentError("La fecha u hora no son válidas.");
      return;
    }

    const payload: Record<string, unknown> = {
      dateTime: isoDate.toISOString(),
      type: type.trim() || "Consulta",
    };

    if (patientId) {
      const numeric = Number(patientId);
      if (Number.isNaN(numeric)) {
        setCreateAppointmentError("Paciente seleccionado inválido.");
        return;
      }
      payload.patientId = numeric;
    } else {
      if (!patientName.trim()) {
        setCreateAppointmentError(
          "Ingresá el nombre del paciente para crear la ficha."
        );
        return;
      }
      payload.patientName = patientName.trim();
      if (patientPhone?.trim()) {
        payload.patientPhone = patientPhone.trim();
      }
    }

    if (price.trim()) {
      const numericPrice = Number(
        price.replace(/[^\d.,]/g, "").replace(",", ".")
      );
      if (Number.isNaN(numericPrice)) {
        setCreateAppointmentError("El precio debe ser un número válido.");
        return;
      }
      payload.price = Math.round(numericPrice);
    }

    setCreateAppointmentLoading(true);
    setCreateAppointmentError(null);
    try {
      const res = await fetch(buildApiUrl("/api/appointments"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "No pudimos crear el turno.");
      }

      await res.json();
      setNotification({
        type: "success",
        message: "Turno creado correctamente.",
      });
      setTimeout(() => setNotification(null), 4000);
      handleCloseCreateAppointmentModal();
      fetchCalendarAppointments({ silent: true });
      fetchPatients({ silent: true });
    } catch (err: any) {
      console.error("Error al crear turno manual:", err);
      setCreateAppointmentError(
        err?.message || "Error desconocido al crear el turno."
      );
    } finally {
      setCreateAppointmentLoading(false);
    }
  };

  const [createAppointmentModalOpen, setCreateAppointmentModalOpen] =
    useState(false);
  const [createAppointmentLoading, setCreateAppointmentLoading] =
    useState(false);
  const [createAppointmentError, setCreateAppointmentError] = useState<
    string | null
  >(null);
  const [createAppointmentForm, setCreateAppointmentForm] = useState(() => ({
    patientId: "",
    patientName: "",
    patientPhone: "",
    date: new Date().toISOString().slice(0, 10),
    time: "09:00",
    type: "",
    price: "",
  }));

  // Chat / mensajes
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [quickChatModalOpen, setQuickChatModalOpen] = useState(false);

// Documentos
  const [, setDocuments] = useState<PatientDocumentItem[]>([]);
  const documentSearch = "";
  const [, setDocumentsLoading] = useState(false);
  const [, setDocumentsError] = useState<string | null>(null);
  const [, setDocumentDownloadId] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<OrderAttachmentItem[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [attachmentSearch, setAttachmentSearch] = useState("");
  const [inboxData, setInboxData] = useState<InboxData>(() =>
    buildEmptyInboxData()
  );
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const notificationsButtonRef = useRef<HTMLButtonElement | null>(null);
  const notificationsPanelRef = useRef<HTMLDivElement | null>(null);
  const [metricsRange, setMetricsRange] = useState<MetricsRange>("month");
  const [metricsSummary, setMetricsSummary] = useState<string | null>(null);
  const [metricsSummaryLoading, setMetricsSummaryLoading] = useState(false);
  const [metricsSummaryModalOpen, setMetricsSummaryModalOpen] = useState(false);
  const [metricsSummaryRangeLabel, setMetricsSummaryRangeLabel] = useState("");
  const [metricsAppointmentsData, setMetricsAppointmentsData] = useState<
    CalendarAppointment[]
  >([]);
  const [metricsAppointmentsLoading, setMetricsAppointmentsLoading] =
    useState(false);
  const [metricsAppointmentsError, setMetricsAppointmentsError] = useState<
    string | null
  >(null);
  const [retailMetrics, setRetailMetrics] = useState<RetailMetricsResponse | null>(null);
  const [retailMetricsLoading, setRetailMetricsLoading] = useState(false);
  const [retailMetricsError, setRetailMetricsError] = useState<string | null>(
    null
  );
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promotionsError, setPromotionsError] = useState<string | null>(null);
  const [promotionForm, setPromotionForm] = useState({
    title: "",
    description: "",
    discountType: "amount" as "amount" | "percent",
    discountValue: "",
    productIds: [] as number[],
    productTagLabels: [] as string[],
    durationDays: "",
    untilStockOut: false,
  });
  const [promotionSendingId, setPromotionSendingId] = useState<number | null>(null);
  const [promotionSendModalId, setPromotionSendModalId] = useState<number | null>(null);
  const [promotionSendMessage, setPromotionSendMessage] = useState("");
  const [promotionImageBase64, setPromotionImageBase64] = useState<string | null>(null);
  const [promotionImagePreview, setPromotionImagePreview] = useState<string | null>(null);

  useEffect(() => {
    setMetricsSummary(null);
    setMetricsSummaryLoading(false);
  }, [metricsRange]);

  const handlePromotionFieldChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const { name, value } = target;
    const checked = (target as HTMLInputElement).checked;
    if (name === "untilStockOut") {
      setPromotionForm((prev) => ({ ...prev, untilStockOut: checked }));
      return;
    }
    setPromotionForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleTogglePromotionProduct = (productId: number) => {
    setPromotionForm((prev) => {
      const exists = prev.productIds.includes(productId);
      return {
        ...prev,
        productIds: exists
          ? prev.productIds.filter((id) => id !== productId)
          : [...prev.productIds, productId],
      };
    });
  };

  const handleTogglePromotionTag = (label: string) => {
    setPromotionForm((prev) => {
      const exists = prev.productTagLabels.includes(label);
      return {
        ...prev,
        productTagLabels: exists
          ? prev.productTagLabels.filter((l) => l !== label)
          : [...prev.productTagLabels, label],
      };
    });
  };

  const handlePromotionImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      setPromotionsError("Formato no soportado. Subí PNG, JPG o WebP.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_IMAGE_SIZE) {
      setPromotionsError("La imagen supera los 2 MB permitidos.");
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setPromotionImageBase64(dataUrl);
      setPromotionImagePreview(dataUrl);
      setPromotionsError(null);
    } catch (err) {
      console.error("Error leyendo imagen de promo:", err);
      setPromotionsError("No pudimos procesar la imagen.");
    } finally {
      event.target.value = "";
    }
  };

  const handleClearPromotionImage = () => {
    setPromotionImageBase64(null);
    setPromotionImagePreview(null);
  };

  const handleCreatePromotion = async () => {
    if (!token) return;
    const title = promotionForm.title.trim();
    const discountValue = parseInt(promotionForm.discountValue || "0", 10);
    if (!title) {
      setPromotionsError("Poné un título para la promo.");
      return;
    }
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      setPromotionsError("El descuento debe ser mayor a 0.");
      return;
    }
    try {
      setPromotionsLoading(true);
      setPromotionsError(null);
      const payload = {
        title,
        description: promotionForm.description?.trim() || null,
        discountType: promotionForm.discountType,
        discountValue,
        productIds: promotionForm.productIds,
        productTagLabels: promotionForm.productTagLabels,
        durationDays: promotionForm.durationDays
          ? Number(promotionForm.durationDays)
          : null,
        untilStockOut: promotionForm.untilStockOut,
        imageBase64: promotionImageBase64,
      };
      const res = await fetch(buildApiUrl("/api/commerce/promotions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "No pudimos crear la promoción.");
      }
      setPromotionForm({
        title: "",
        description: "",
        discountType: "amount",
        discountValue: "",
        productIds: [],
        productTagLabels: [],
        durationDays: "",
        untilStockOut: false,
      });
      setPromotionImageBase64(null);
      setPromotionImagePreview(null);
      await fetchPromotions({ silent: true });
    } catch (err: any) {
      console.error("Error creando promoción:", err);
      setPromotionsError(err?.message || "No pudimos crear la promoción.");
    } finally {
      setPromotionsLoading(false);
    }
  };

  const openPromotionSendModal = (promo: Promotion) => {
    const discountLabel =
      promo.discountType === "percent"
        ? `${promo.discountValue}%`
        : `$${promo.discountValue}`;
    const message = `Promo: ${promo.title} (${discountLabel} off).\n` +
      `${promo.description ? `${promo.description}\n` : ""}` +
      `Aprovechala antes de que se acabe el stock.`;
    setPromotionSendModalId(promo.id);
    setPromotionSendMessage(message);
  };

  const handleSendPromotion = async () => {
    if (!token || !promotionSendModalId) return;
    const text = promotionSendMessage.trim();
    if (!text) {
      setPromotionsError("Escribí el mensaje a enviar.");
      return;
    }
    try {
      setPromotionSendingId(promotionSendModalId);
      setPromotionsError(null);
      const res = await fetch(
        buildApiUrl(`/api/commerce/promotions/${promotionSendModalId}/send`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: text }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "No pudimos enviar la promoción.");
      }
      setPromotionSendModalId(null);
      setPromotionSendMessage("");
      setNotification({
        type: "success",
        message: "Promoción enviada a tus clientes.",
      });
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      console.error("Error enviando promoción:", err);
      setPromotionsError(err?.message || "No pudimos enviar la promoción.");
    } finally {
      setPromotionSendingId(null);
    }
  };

  const handleDeletePromotion = async (promotionId: number) => {
    if (!token) return;
    try {
      setPromotionsLoading(true);
      setPromotionsError(null);
      const res = await fetch(
        buildApiUrl(`/api/commerce/promotions/${promotionId}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "No pudimos eliminar la promoción.");
      }
      await fetchPromotions({ silent: true });
    } catch (err: any) {
      console.error("Error eliminando promoción:", err);
      setPromotionsError(err?.message || "No pudimos eliminar la promoción.");
    } finally {
      setPromotionsLoading(false);
    }
  };
  // Envío de mensaje
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
const [broadcastMessage, setBroadcastMessage] = useState("");
const [broadcastSending, setBroadcastSending] = useState(false);
const [broadcastError, setBroadcastError] = useState<string | null>(null);
const [broadcastSuccess, setBroadcastSuccess] = useState<string | null>(null);
const [broadcastSelectedPromoId, setBroadcastSelectedPromoId] = useState<number | null>(null);

  // Recordatorios de turnos
  const [reminderLoadingId, setReminderLoadingId] = useState<number | null>(
    null
  );
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [reminderSuccess, setReminderSuccess] = useState<string | null>(null);

const [automationAssistantOpen, setAutomationAssistantOpen] = useState(false);
const [automationInput, setAutomationInput] = useState("");
const [automationProcessing, setAutomationProcessing] = useState(false);
const [automationMessages, setAutomationMessages] = useState<
  AutomationMessage[]
  >(() => [
    {
      id: Date.now(),
      role: "assistant",
      text: "Soy tu asistente de automatización retail. Contame en texto libre qué querés y ejecuto las acciones (stock, precios, recordatorios, promos).",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [automationPendingActions, setAutomationPendingActions] = useState<{
    reply: string;
    actions: AutomationAction[];
  } | null>(null);
  const [automationRescheduleIntent, setAutomationRescheduleIntent] = useState<
    AutomationRescheduleIntent | null
  >(null);
  const [automationHistoryIntent, setAutomationHistoryIntent] = useState<
    AutomationHistoryIntent | null
  >(null);

  const automationRetailCommandRef = useRef<
    (raw: string) => Promise<boolean>
  >(async () => false);

  // Formulario de perfil del médico (solo front por ahora)
  const [profileForm, setProfileForm] = useState(defaultProfileForm);
  const [availabilityStatus, setAvailabilityStatus] = useState<
    DoctorAvailabilityStatus
  >(DEFAULT_AVAILABILITY_STATUS);
  const profilePrefilledFromStorage = useRef(false);
  const [whatsappConnection, setWhatsappConnection] = useState(
    defaultWhatsappConnection
  );
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<
    {
      id: string;
      displayPhoneNumber: string;
      status: string;
      assignedDoctorId: number | null;
    }[]
  >([]);
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orderUpdatingId, setOrderUpdatingId] = useState<number | null>(null);
  const [orderDeleteModalId, setOrderDeleteModalId] = useState<number | null>(null);
  const [orderModalId, setOrderModalId] = useState<number | null>(null);
  const [orderModalTab, setOrderModalTab] = useState<"details" | "payments" | "attachments">(
    "details"
  );
  const [orderSearch, setOrderSearch] = useState("");
  const [orderRange, setOrderRange] = useState<"today" | "this_week" | "next_week" | "all">(
    "today"
  );
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<
    "all" | "unpaid" | "partial" | "paid"
  >("all");
  const [orderPaymentStatus, setOrderPaymentStatus] = useState<"unpaid" | "paid" | "partial">(
    "unpaid"
  );
  const [orderPaymentMode, setOrderPaymentMode] = useState<"full" | "custom">("full");
  const [orderPaymentCustom, setOrderPaymentCustom] = useState<number>(0);
  const [orderPaymentDirty, setOrderPaymentDirty] = useState(false);
  const [orderAttachmentUploadingId, setOrderAttachmentUploadingId] = useState<number | null>(null);
  const [orderAttachmentError, setOrderAttachmentError] = useState<string | null>(null);
  const [orderReminderSendingId, setOrderReminderSendingId] = useState<number | null>(null);
  const [orderReminderConfirmId, setOrderReminderConfirmId] = useState<number | null>(null);
  const [orderReminderPendingAmount, setOrderReminderPendingAmount] = useState<number>(0);
  const [debtFilterInput, setDebtFilterInput] = useState<number>(2);
  const [debtFilterDays, setDebtFilterDays] = useState<number>(2);
  const orderPaymentHydrateRef = useRef<{ orderId: number; version: string } | null>(null);
  const printOrderReceipt = useCallback(
    (order: CommerceOrder) => {
      if (typeof window === "undefined" || !order) return;
      const shopName = doctor?.name ? doctor.name : "Comercio";
      const logoUrl =
        doctor?.ticketLogoUrl && doctor.ticketLogoUrl.startsWith("/uploads/")
          ? buildApiUrl(doctor.ticketLogoUrl)
          : doctor?.ticketLogoUrl || null;
      const createdAt = new Date(order.createdAt);
      const dateLabel = createdAt.toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const timeLabel = createdAt.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const itemsHtml = order.items
        .map(
          (item) => `
          <tr>
            <td>${item.productName}</td>
            <td class="num">${item.quantity}</td>
            <td class="num">$${item.unitPrice.toLocaleString("es-AR")}</td>
            <td class="num">$${(item.unitPrice * item.quantity).toLocaleString("es-AR")}</td>
          </tr>`
        )
        .join("");

      const promoSummary =
        order.promotions && order.promotions.length
          ? order.promotions
              .map((p) =>
                p.discountType === "percent"
                  ? `${p.title} (-${p.discountValue}%)`
                  : `${p.title} (-$${p.discountValue.toLocaleString("es-AR")})`
              )
              .join(" • ")
          : "";

      const html = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Boleta pedido #${order.sequenceNumber}</title>
            <style>
              * { box-sizing: border-box; }
              body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
              h1 { margin: 0 0 8px; font-size: 20px; }
              .meta { font-size: 12px; color: #444; margin-bottom: 16px; }
              .section { margin-bottom: 16px; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              th, td { padding: 8px; border-bottom: 1px solid #ddd; font-size: 13px; text-align: left; }
              th { background: #f6f6f6; }
              .num { text-align: right; white-space: nowrap; }
              .total { font-weight: 700; font-size: 14px; }
            </style>
          </head>
          <body>
            <div>
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                ${
                  logoUrl
                    ? `<img src="${logoUrl}" alt="Logo" style="height:48px;max-width:140px;object-fit:contain;" />`
                    : ""
                }
                <h1>${shopName} · Boleta</h1>
              </div>
              <div class="meta">
                Pedido #${order.sequenceNumber} · ${dateLabel} ${timeLabel}<br />
                Estado: ${order.status || "pendiente"}
              </div>
              <div class="section">
                <strong>Cliente:</strong> ${order.customerName || "Cliente WhatsApp"}<br />
                ${order.customerAddress ? `<strong>Dirección:</strong> ${order.customerAddress}<br />` : ""}
                ${order.customerDni ? `<strong>DNI:</strong> ${order.customerDni}` : ""}
              </div>
              <div class="section">
                <strong>Productos</strong>
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th class="num">Cant.</th>
                      <th class="num">Precio</th>
                      <th class="num">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsHtml || "<tr><td colspan='4'>Pedido vacío</td></tr>"}
                  </tbody>
                </table>
              </div>
              ${
                promoSummary
                  ? `<div class="section" style="font-size:12px;color:#2c7a4b;">
                Promociones: ${promoSummary}
              </div>`
                  : ""
              }
              <div class="section total">
                Total: $${order.totalAmount.toLocaleString("es-AR")}
              </div>
            </div>
          </body>
        </html>
      `;

      const printWindow = window.open("", "_blank", "width=720,height=900");
      if (!printWindow) return;
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      setTimeout(() => printWindow.close(), 300);
    },
    [doctor?.name, doctor?.ticketLogoUrl]
  );
  const [connectModalLoading, setConnectModalLoading] = useState(false);
  const [connectModalError, setConnectModalError] = useState<string | null>(
    null
  );
  const [selectedNumberId, setSelectedNumberId] = useState<string | null>(null);

  const businessType = doctor?.businessType ?? null;
  const businessConfig = useMemo(
    () => getBusinessConfig(businessType),
    [businessType]
  );
  const businessInfo = {
    label: businessConfig.label,
    short: businessConfig.short,
  };
  const contactLabels = businessConfig.contactLabels;
  const isMedicalDoctor = businessType === "HEALTH";
  const sidebarSections = businessConfig.sidebarSections;
  const canAccessStock = useMemo(
    () => sidebarSections.some((section) => section.key === "stock"),
    [sidebarSections]
  );

  const patientStats = useMemo(() => {
    const total = patients.length;
    const pendingInsurance = isMedicalDoctor
      ? patients.filter((p) => !(p.insuranceProvider || "").trim()).length
      : 0;
    const pendingReason = isMedicalDoctor
      ? patients.filter((p) => !(p.consultReason || "").trim()).length
      : 0;
    return { total, pendingInsurance, pendingReason };
  }, [patients, isMedicalDoctor]);

  const getSectionLabel = useCallback(
    (key: SectionKey): string =>
      sidebarSections.find((s) => s.key === key)?.label || key,
    [sidebarSections]
  );

  const automationSuggestions = useMemo(() => {
    if (isRetailBusiness) {
      return [
        "Enviá recordatorio a deudores",
        "Subí precios de bebidas 10%",
        "Sumá 5 coca al stock",
        "Abrir promociones",
      ];
    }
    return [
      "Enviá recordatorios segmentados",
      "Mostrame pendientes del día",
      "Abrí la agenda de mañana",
      "Resumime ingresos y consultas",
    ];
  }, [isRetailBusiness]);

const automationAppointmentPool = useMemo(() => {
  const map = new Map<number, CalendarAppointment>();
  calendarAppointments.forEach((appt) => {
    map.set(appt.id, appt);
  });
  metricsAppointmentsData.forEach((appt) => {
    if (!map.has(appt.id)) {
      map.set(appt.id, appt);
    }
  });
  return Array.from(map.values());
}, [calendarAppointments, metricsAppointmentsData]);

  const findPatientByQuery = useCallback(
    (query: string) => {
      if (!query.trim()) return null;
      const dniMatch =
        query.match(/dni\s*(\d{6,})/i) || query.match(/\b(\d{7,8})\b/);
      if (dniMatch) {
        const digits = dniMatch[1];
        const patientByDni = patients.find(
          (p) => extractDigits(p.dni || "") === digits
        );
        if (patientByDni) {
          return patientByDni;
        }
      }
      const normalizedInput = normalizeSearchText(query);
      if (!normalizedInput) return null;
      const queryTokens = normalizedInput.split(" ").filter(Boolean);
      if (queryTokens.length === 0) return null;
      const tokenSet = new Set(queryTokens);
      let bestPatient: Patient | null = null;
      let bestStats = {
        matched: 0,
        completeness: 0,
        totalTokens: 0,
      };
      patients.forEach((patient) => {
        const normalizedName = normalizeSearchText(patient.fullName);
        if (!normalizedName) return;
        const tokens = normalizedName.split(" ").filter(Boolean);
        if (tokens.length === 0) return;
        let matched = 0;
        tokens.forEach((token) => {
          if (tokenSet.has(token)) {
            matched += 1;
          }
        });
        if (matched === 0) return;
        const completeness = matched / tokens.length;
        const shouldReplace =
          !bestPatient ||
          matched > bestStats.matched ||
          (matched === bestStats.matched &&
            completeness > bestStats.completeness) ||
          (matched === bestStats.matched &&
            completeness === bestStats.completeness &&
            tokens.length > bestStats.totalTokens);
        if (shouldReplace) {
          bestPatient = patient;
          bestStats = {
            matched,
            completeness,
            totalTokens: tokens.length,
          };
        }
      });
      return bestPatient;
    },
    [patients]
  );

  const invisibleRiskInsights = useMemo(() => {
    if (patients.length === 0) return [];
    const insights: InvisibleRiskInsight[] = [];
    const agendaPatientIds = new Set<number>();
    (data?.agendaHoy ?? []).forEach((appointment) => {
      if (typeof appointment.patientId === "number") {
        agendaPatientIds.add(appointment.patientId);
      }
    });
    const inboxIncompleteIds = new Set<number>(
      (inboxData?.incompletePatients ?? []).map((patient) => patient.id)
    );

    patients.forEach((patient) => {
      const reasons: string[] = [];
      let score = 0;
      const tags = Array.isArray(patient.tags) ? patient.tags : [];
      const criticalTags = tags.filter((tag) => tag.severity === "critical");
      if (criticalTags.length > 0) {
        reasons.push(
          `Dato crítico: ${criticalTags.map((tag) => tag.label).join(", ")}`
        );
        score += criticalTags.length * 3;
      }
      const highTags = tags.filter((tag) => tag.severity === "high");
      if (highTags.length > 0) {
        reasons.push(
          `Dato sensible: ${highTags.map((tag) => tag.label).join(", ")}`
        );
        score += highTags.length * 2;
      }

      const missingFields: string[] = [];
      if (!(patient.consultReason || "").trim()) {
        missingFields.push("motivo de consulta");
      }
      if (isMedicalDoctor && !(patient.insuranceProvider || "").trim()) {
        missingFields.push("obra social");
      }
      if (!(patient.address || "").trim()) {
        missingFields.push("domicilio");
      }
      if (!patient.birthDate) {
        missingFields.push("fecha de nacimiento");
      }
      if (missingFields.length > 0) {
        reasons.push(`Datos pendientes: ${missingFields.join(", ")}`);
        score += missingFields.length;
      }

      const needsInfoFlags = [
        patient.needsDni,
        patient.needsName,
        patient.needsBirthDate,
        patient.needsAddress,
        patient.needsInsurance,
        patient.needsConsultReason,
      ].some(Boolean);
      if (needsInfoFlags || patient.isProfileComplete === false) {
        reasons.push("Ficha marcada como incompleta");
        score += 2;
      }

      if (inboxIncompleteIds.has(patient.id)) {
        reasons.push("Figura en el Inbox como pendiente");
        score += 2;
      }

      if (agendaPatientIds.has(patient.id) && missingFields.length > 0) {
        reasons.push("Tiene turno hoy sin esos datos clave");
        score += 2;
      }

      if (score >= 3) {
        const level: InvisibleRiskLevel =
          score >= 7 ? "critical" : score >= 5 ? "high" : "medium";
        const uniqueReasons = Array.from(new Set(reasons));
        insights.push({
          id: `risk-${patient.id}`,
          patientId: patient.id,
          patientName: patient.fullName || "Paciente sin nombre",
          score,
          level,
          reasons: uniqueReasons,
        });
      }
    });

    return insights
      .sort((a, b) =>
        b.score === a.score
          ? a.patientName.localeCompare(b.patientName)
          : b.score - a.score
      )
      .slice(0, 4);
  }, [patients, data, inboxData, isMedicalDoctor]);

  const calendarWeekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, idx) =>
      addDays(calendarWeekStart, idx)
    );
  }, [calendarWeekStart]);
  const visibleCalendarAppointments = useMemo(() => {
    return calendarAppointments.filter(
      (appt) => !CALENDAR_HIDDEN_STATUSES.has(appt.status)
    );
  }, [calendarAppointments]);
  const rescheduleSlotsByDay = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
    });
    const groups = new Map<
      string,
      { label: string; slots: AvailableSlotOption[] }
    >();
    rescheduleSlots.forEach((slot) => {
      const date = new Date(slot.startISO);
      if (isNaN(date.getTime())) return;
      const key = date.toISOString().slice(0, 10);
      const labelRaw = formatter.format(date);
      const label =
        labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1).toLowerCase();
      if (!groups.has(key)) {
        groups.set(key, { label, slots: [] });
      }
      groups.get(key)!.slots.push(slot);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, value]) => ({
        label: value.label,
        slots: value.slots.sort(
          (a, b) =>
            new Date(a.startISO).getTime() - new Date(b.startISO).getTime()
        ),
      }));
  }, [rescheduleSlots]);

  const inboxCounts = useMemo(
    () => ({
      documents: inboxData.documents.length,
      newAppointments: inboxData.newAppointments.length,
      incompletePatients: inboxData.incompletePatients.length,
      newOrders: inboxData.newOrders?.length ?? 0,
      newClients: inboxData.newClients?.length ?? 0,
      overdueOrders: 0,
    }),
    [inboxData]
  );

  const inboxTotalCount =
    (isRetailBusiness
      ? inboxCounts.newOrders + inboxCounts.newClients
      : inboxCounts.documents + inboxCounts.newAppointments + inboxCounts.incompletePatients);

  const handleMarkAllNotificationsRead = useCallback(() => {
    if (inboxTotalCount === 0) return;
    setInboxData(buildEmptyInboxData());
  }, [inboxTotalCount]);

  const metricsRangeLabel = useMemo(() => {
    return (
      METRICS_RANGE_OPTIONS.find((opt) => opt.key === metricsRange)?.label ||
      "Este período"
    );
  }, [metricsRange]);

  const metricsAppointments = useMemo(() => {
    const { start, end } = getRangeBounds(metricsRange);
    return metricsAppointmentsData.filter((appt) => {
      const date = new Date(appt.dateTime);
      return isWithinRange(date, start, end);
    });
  }, [metricsAppointmentsData, metricsRange]);

  const metricsStats = useMemo(() => {
    const now = new Date();
    let total = 0;
    let cancelled = 0;
    let completed = 0;
    let upcoming = 0;
    metricsAppointments.forEach((appt) => {
      total += 1;
      const status = (appt.status || "").toLowerCase();
      const date = new Date(appt.dateTime);
      const isCancelled = /cancel/.test(status);
      const isCompleted =
        /complete/.test(status) || /realiz/.test(status) || status === "done";

      if (isCancelled) cancelled += 1;
      else if (isCompleted) completed += 1;

      if (!isCancelled && date > now) {
        upcoming += 1;
      }
    });

    const confirmed = total - cancelled;
    const cancellationRate = total ? (cancelled / total) * 100 : 0;
    const completionRate = total ? (completed / total) * 100 : 0;

    return {
      total,
      cancelled,
      confirmed,
      completionRate,
      cancellationRate,
      upcoming,
    };
  }, [metricsAppointments]);

  const metricsRevenue = useMemo(() => {
    const empty = {
      collected: 0,
      pending: 0,
      avgTicket: 0,
      cashCollected: 0,
      transferCollected: 0,
    };
    if (!metricsAppointments.length) {
      return empty;
    }
    let cashCollected = 0;
    let transferCollected = 0;
    const collected = metricsAppointments.reduce((sum, appt) => {
      const charged = appt.chargedAmount ?? 0;
      if (charged > 0) {
        if (appt.paymentMethod === "cash") {
          cashCollected += charged;
        } else if (appt.paymentMethod === "transfer_card") {
          transferCollected += charged;
        }
      }
      return sum + charged;
    }, 0);
    const pending = metricsAppointments.reduce((sum, appt) => {
      const charged = appt.chargedAmount ?? 0;
      if (charged > 0) return sum;
      return sum + (appt.price ?? 0);
    }, 0);
    const avgTicket =
      metricsStats.confirmed > 0
        ? Math.round(collected / metricsStats.confirmed)
        : 0;
    return {
      collected,
      pending,
      avgTicket,
      cashCollected,
      transferCollected,
    };
  }, [metricsAppointments, metricsStats.confirmed]);

  const topConsultReasons = useMemo(() => {
    if (!metricsAppointments.length) return [];
    const counts = new Map<string, number>();
    metricsAppointments.forEach((appt) => {
      const key = (appt.type || "Consulta general").trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [metricsAppointments]);

  const statusChartData = useMemo(() => {
    return [
      {
        label: "Confirmados",
        value: metricsStats.confirmed,
        color: "bg-emerald-500",
      },
      {
        label: "Cancelados",
        value: metricsStats.cancelled,
        color: "bg-rose-500",
      },
    ];
  }, [metricsStats.confirmed, metricsStats.cancelled]);

  const availabilityOptions: {
    key: DoctorAvailabilityStatus;
    label: string;
    className: string;
  }[] = [
    {
      key: "available",
      label: "Disponible",
      className: "bg-[#0f2b1f] text-emerald-100 border border-emerald-400/70",
    },
    {
      key: "unavailable",
      label: "No disponible",
      className: "bg-[#3c121f] text-rose-100 border border-rose-400/70",
    },
    {
      key: "vacation",
      label: "Vacaciones",
      className: "bg-[#3b2a08] text-amber-100 border border-amber-400/70",
    },
  ];

  const resetWhatsappState = useCallback(() => {
    setWhatsappConnection(defaultWhatsappConnection);
    setWhatsappError(null);
    setWhatsappLoading(false);
  }, []);

  const toggleConsultationCard = useCallback((consultationId: number) => {
    setOpenConsultations((prev) => ({
      ...prev,
      [consultationId]: !prev[consultationId],
    }));
  }, []);

  const fetchWhatsappStatus = useCallback(async () => {
    if (!token) {
      resetWhatsappState();
      return;
    }

    try {
      const res = await fetch(buildApiUrl("/api/me/whatsapp/status"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "No se pudo obtener el estado de WhatsApp.");
      }

      const json = await res.json();
      setWhatsappConnection(mapWhatsappPayload(json));
      setWhatsappError(null);
    } catch (err: any) {
      console.error("Error al obtener estado de WhatsApp:", err);
      setWhatsappConnection(defaultWhatsappConnection);
    }
  }, [token, resetWhatsappState]);

  const loadAvailableNumbers = useCallback(async () => {
    if (!token) return;
    try {
      setConnectModalLoading(true);
      setConnectModalError(null);
      const res = await fetch(buildApiUrl("/api/whatsapp/numbers"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "No pudimos cargar los números.");
      }

      const json = await res.json();
      const availableList = (json.numbers || [])
        .filter((n: any) => n.status === "available")
        .map((n: any) => ({
          id: n.id,
          displayPhoneNumber: n.displayPhoneNumber,
          status: n.status,
          assignedDoctorId: n.assignedDoctorId ?? null,
        }));

      setAvailableNumbers(availableList);
      setSelectedNumberId(availableList[0]?.id ?? null);
    } catch (err: any) {
      console.error("Error al cargar números disponibles:", err);
      setConnectModalError(
        err?.message || "No pudimos cargar los números disponibles."
      );
    } finally {
      setConnectModalLoading(false);
    }
  }, [token]);

  const fetchOrders = useCallback(async () => {
    if (!token || businessType !== "RETAIL") return;
    try {
      setOrdersLoading(true);
      setOrdersError(null);
      const res = await fetch(buildApiUrl("/api/commerce/orders"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "No pudimos cargar los pedidos.");
      }
      const json = await res.json();
      setOrders(Array.isArray(json.orders) ? json.orders : []);
    } catch (err: any) {
      console.error("Error al cargar pedidos:", err);
      setOrdersError(err?.message || "No pudimos cargar los pedidos.");
    } finally {
      setOrdersLoading(false);
    }
  }, [token, businessType]);

  const fetchAttachments = useCallback(
    async (options?: { search?: string }) => {
      if (!token || businessType !== "RETAIL") return;
      try {
        setAttachmentsLoading(true);
        setAttachmentsError(null);
        const params = new URLSearchParams();
        const q = options?.search?.trim();
        if (q) params.set("q", q);
        const res = await fetch(
          buildApiUrl(
            params.toString()
              ? `/api/commerce/attachments?${params.toString()}`
              : "/api/commerce/attachments"
          ),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || "No pudimos cargar los comprobantes.");
        }
        const json = await res.json();
        setAttachments(
          Array.isArray(json.attachments) ? (json.attachments as OrderAttachmentItem[]) : []
        );
      } catch (err: any) {
        console.error("Error al cargar comprobantes:", err);
        setAttachmentsError(err?.message || "No pudimos cargar los comprobantes.");
      } finally {
        setAttachmentsLoading(false);
      }
    },
    [token, businessType]
  );

  const handleUpdateOrderStatus = useCallback(
    async (
      orderId: number,
      status: CommerceOrder["status"],
      orderForPrint?: CommerceOrder | null,
      extra?: {
        paymentStatus?: CommerceOrder["paymentStatus"];
        paidAmount?: number;
        suppressPrint?: boolean;
      }
    ) => {
      if (!token || businessType !== "RETAIL") return;
      try {
        setOrderUpdatingId(orderId);
        setOrdersError(null);
        const wasConfirmed = orderForPrint?.status === "confirmed";
        const res = await fetch(buildApiUrl(`/api/commerce/orders/${orderId}`), {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
            paymentStatus: extra?.paymentStatus,
            paidAmount: extra?.paidAmount,
          }),
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || "No pudimos actualizar el pedido.");
        }
        const json = await res.json();
        const updated = json.order as CommerceOrder;
        if (updated) {
          setOrders((prev) =>
            prev.map((ord) => (ord.id === updated.id ? updated : ord))
          );
          // Al recibir datos nuevos, habilitamos rehidratar estados locales
          orderPaymentHydrateRef.current = null;
          const nowConfirmed =
            updated.status === "confirmed" || status === "confirmed";
          if (nowConfirmed && !wasConfirmed && !extra?.suppressPrint) {
            printOrderReceipt(updated);
          }
        } else {
          await fetchOrders();
          if (
            status === "confirmed" &&
            orderForPrint &&
            !wasConfirmed &&
            !extra?.suppressPrint
          ) {
            printOrderReceipt(orderForPrint);
          }
        }
      } catch (err: any) {
        console.error("Error al actualizar pedido:", err);
        setOrdersError(err?.message || "No pudimos actualizar el pedido.");
      } finally {
        setOrderUpdatingId(null);
      }
    },
    [token, businessType, fetchOrders, printOrderReceipt]
  );

  const handleUploadOrderAttachment = useCallback(
    async (orderId: number, file: File) => {
      if (!token || businessType !== "RETAIL") return;
      setOrderAttachmentError(null);
      setOrderAttachmentUploadingId(orderId);
      const toBase64 = (fileInput: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error || new Error("No se pudo leer el archivo"));
          reader.readAsDataURL(fileInput);
        });
      try {
        const fileBase64 = await toBase64(file);
        const res = await fetch(
          buildApiUrl(`/api/commerce/orders/${orderId}/attachments`),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fileBase64,
              filename: file.name,
            }),
          }
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || "No pudimos subir el comprobante.");
        }
        const json = await res.json();
        const attachment = json.attachment;
        if (attachment) {
          setOrders((prev) =>
            prev.map((ord) =>
              ord.id === orderId
                ? {
                    ...ord,
                    attachments: [
                      ...(ord.attachments || []),
                      {
                        id: attachment.id,
                        url: attachment.url,
                        filename: attachment.filename ?? file.name,
                        mimeType: attachment.mimeType,
                        createdAt: attachment.createdAt,
                      },
                    ],
                  }
                : ord
            )
          );
        }
      } catch (err: any) {
        console.error("Error al subir comprobante:", err);
        setOrderAttachmentError(err?.message || "No pudimos subir el comprobante.");
      } finally {
        setOrderAttachmentUploadingId(null);
      }
    },
    [token, businessType, setOrders]
  );

  const handleSendPaymentReminder = useCallback(
    async (order: CommerceOrder) => {
      if (!token || businessType !== "RETAIL") return;
      try {
        setOrderReminderSendingId(order.id);
        setOrdersError(null);
        const res = await fetch(
          buildApiUrl(`/api/commerce/orders/${order.id}/payment-reminder`),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || "No pudimos enviar el recordatorio.");
        }
        setNotification({
          type: "success",
          message: "Recordatorio enviado al cliente.",
        });
        setTimeout(() => setNotification(null), 3500);
      } catch (err: any) {
        console.error("Error al enviar recordatorio:", err);
        const msg = err?.message || "No pudimos enviar el recordatorio.";
        setOrdersError(msg);
        setNotification({
          type: "error",
          message: msg,
        });
        setTimeout(() => setNotification(null), 4000);
      } finally {
        setOrderReminderSendingId(null);
      }
    },
    [token, businessType]
  );

  const handleDeleteOrder = useCallback(
    async (orderId: number) => {
      if (!token || businessType !== "RETAIL") return;
      try {
        setOrderUpdatingId(orderId);
        setOrdersError(null);
        const res = await fetch(buildApiUrl(`/api/commerce/orders/${orderId}`), {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || "No pudimos eliminar el pedido.");
        }
        setOrders((prev) => prev.filter((ord) => ord.id !== orderId));
        setOrderDeleteModalId(null);
      } catch (err: any) {
        console.error("Error al eliminar pedido:", err);
        setOrdersError(err?.message || "No pudimos eliminar el pedido.");
      } finally {
        setOrderUpdatingId(null);
      }
    },
    [token, businessType]
  );

  useEffect(() => {
    if (!doctor?.id) {
      profilePrefilledFromStorage.current = false;
      setProfileForm(defaultProfileForm);
      return;
    }

    try {
      const stored = localStorage.getItem(
        getProfileStorageKey(doctor.id)
      );

      if (stored) {
        const parsed = JSON.parse(stored);
        const parsedRanges = parseOfficeHoursText(parsed.officeHours);
        const parsedDays = Array.isArray(parsed.officeDaysSelection)
          ? parsed.officeDaysSelection
          : parseOfficeDaysSelection(parsed.officeDays);
        profilePrefilledFromStorage.current = true;
        setProfileForm({
          ...defaultProfileForm,
          ...parsed,
          ...parsedRanges,
          officeDaysSelection: parsedDays,
        });
      } else {
        profilePrefilledFromStorage.current = false;
        setProfileForm(defaultProfileForm);
      }
    } catch (err) {
      console.error("Error leyendo perfil desde localStorage:", err);
      profilePrefilledFromStorage.current = false;
      setProfileForm(defaultProfileForm);
    }
  }, [doctor?.id]);

  useEffect(() => {
    if (!doctor?.id) return;
    try {
      localStorage.setItem(
        getProfileStorageKey(doctor.id),
        JSON.stringify(profileForm)
      );
    } catch (err) {
      console.error("Error guardando perfil en localStorage:", err);
    }
  }, [profileForm, doctor?.id]);

  useEffect(() => {
    if (!token) {
      resetWhatsappState();
      return;
    }
    fetchWhatsappStatus();
  }, [token, fetchWhatsappStatus, resetWhatsappState]);

  useEffect(() => {
    if ((activeSection === "orders" || activeSection === "debts") && businessType === "RETAIL") {
      fetchOrders();
    }
  }, [activeSection, businessType, fetchOrders]);

  useEffect(() => {
    if (activeSection === "attachments" && businessType === "RETAIL") {
      fetchAttachments({ search: attachmentSearch });
    }
  }, [activeSection, businessType, fetchAttachments, attachmentSearch]);

  const filteredOrders = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    const q = orderSearch.trim().toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // domingo

    return orders.filter((order) => {
      const created = new Date(order.createdAt);
      const matchesRange =
        orderRange === "all"
          ? true
          : orderRange === "today"
          ? created >= startOfToday
          : orderRange === "this_week"
          ? created >= startOfWeek && created < new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000)
          : true;

      const matchesPayment =
        orderPaymentFilter === "all"
          ? true
          : order.paymentStatus === orderPaymentFilter;

      const matchesSearch =
        !q ||
        String(order.sequenceNumber).includes(q) ||
        (order.customerName || "").toLowerCase().includes(q) ||
        (order.customerAddress || "").toLowerCase().includes(q);

      return matchesRange && matchesSearch && matchesPayment;
    });
  }, [orders, orderRange, orderSearch, orderPaymentFilter]);

  const debtOrders = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    const threshold = Math.max(0, debtFilterDays || 0);
    const now = Date.now();
    const msPerDay = 1000 * 60 * 60 * 24;
    return orders
      .map((order) => {
        const paid = order.paidAmount ?? 0;
        const total = order.totalAmount ?? 0;
        const outstanding = Math.max(total - paid, 0);
        const ageDays = Math.floor((now - new Date(order.createdAt).getTime()) / msPerDay);
        return { order, outstanding, ageDays };
      })
      .filter(
        (entry) =>
          entry.outstanding > 0 &&
          (entry.order.paymentStatus === "unpaid" || entry.order.paymentStatus === "partial") &&
          entry.ageDays >= threshold
      )
      .sort((a, b) => b.ageDays - a.ageDays);
  }, [orders, debtFilterDays]);

  useEffect(() => {
    if (orderModalId === null) return;
    if (orderUpdatingId === orderModalId) return; // evitar pisar mientras se está guardando
    const ord = orders.find((o) => o.id === orderModalId);
    if (!ord) return;
    const version = `${ord.paymentStatus}|${ord.paidAmount ?? 0}`;
    const prev = orderPaymentHydrateRef.current;
    if (orderPaymentDirty && prev && prev.orderId === ord.id && prev.version === version) {
      return;
    }
    orderPaymentHydrateRef.current = { orderId: ord.id, version };
    const paidAmount = ord.paidAmount ?? 0;
    const status = ord.paymentStatus === "paid" ? "paid" : ord.paymentStatus === "partial" ? "partial" : "unpaid";
    setOrderPaymentStatus(status as "unpaid" | "partial" | "paid");
    if (status === "paid" && paidAmount >= ord.totalAmount) {
      setOrderPaymentMode("full");
    } else {
      setOrderPaymentMode("custom");
    }
    setOrderPaymentCustom(paidAmount || 0);
    setOrderPaymentDirty(false);
  }, [orderModalId, orders, orderUpdatingId]);

  useEffect(() => {
    if (orderModalId !== null) {
      setOrderModalTab("details");
      setOrderAttachmentError(null);
      setOrderAttachmentUploadingId(null);
    }
  }, [orderModalId]);

  const handleOpenConnectModal = () => {
    if (!token) return;
    setShowConnectModal(true);
    setConnectModalError(null);
    setAvailableNumbers([]);
    setSelectedNumberId(null);
    loadAvailableNumbers();
  };

  const handleCloseConnectModal = () => {
    setShowConnectModal(false);
    setConnectModalError(null);
    setAvailableNumbers([]);
    setSelectedNumberId(null);
    setConnectModalLoading(false);
  };

  const handleConfirmConnect = async () => {
    if (!token || !selectedNumberId) return;
    setWhatsappLoading(true);
    setConnectModalError(null);

    try {
      const res = await fetch(buildApiUrl("/api/me/whatsapp/connect"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ whatsappNumberId: selectedNumberId }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.error ||
            "No pudimos conectar ese número. Probá con otro."
        );
      }

      const json = await res.json();
      setWhatsappConnection(mapWhatsappPayload(json));
      setNotification({
        type: "success",
        message: "WhatsApp conectado correctamente ✅",
      });
      setTimeout(() => setNotification(null), 4000);
      handleCloseConnectModal();
    } catch (err: any) {
      console.error("Error al conectar WhatsApp:", err);
      const message =
        err?.message || "No pudimos conectar WhatsApp. Probá de nuevo.";
      setConnectModalError(message);
    } finally {
      setWhatsappLoading(false);
      fetchWhatsappStatus();
    }
  };

  const handleRequestDisconnect = () => {
    setShowDisconnectModal(true);
  };

  const handleCancelDisconnect = () => {
    setShowDisconnectModal(false);
  };

  const handleConfirmDisconnect = () => {
    handleDisconnectWhatsapp();
  };

  // 1) Al montar la app, intentar recuperar sesión desde localStorage
  useEffect(() => {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as { token: string; doctor: Doctor };
      if (parsed.token && parsed.doctor) {
        const normalizedDoctor: Doctor = {
          ...parsed.doctor,
          businessType: parsed.doctor.businessType ?? "HEALTH",
          availabilityStatus: normalizeAvailabilityStatusValue(
            parsed.doctor.availabilityStatus
          ),
        };
        setToken(parsed.token);
        setDoctor(normalizedDoctor);
        setAvailabilityStatus(
          normalizedDoctor.availabilityStatus ?? DEFAULT_AVAILABILITY_STATUS
        );
      }
    } catch (err) {
      console.error("Error parseando auth de localStorage:", err);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setAvailabilityStatus(DEFAULT_AVAILABILITY_STATUS);
    }
  }, []);

  // 2) Cuando tengo token, traigo el dashboard del doctor logueado
  const fetchDashboardSummary = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) return;
      const silent = options?.silent ?? false;
      try {
        if (!silent) setLoadingData(true);
        setDataError(null);

        const response = await fetch(
          buildApiUrl("/api/dashboard-summary/me"),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Error al obtener los datos del dashboard");
        }

        const json: DashboardSummary = await response.json();
        setData(json);
      } catch (err: any) {
        console.error("Error al cargar dashboard:", err);
        setDataError(err.message || "Error desconocido al cargar dashboard");
      } finally {
        if (!silent) {
          setLoadingData(false);
        }
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    fetchDashboardSummary();
    const intervalId = window.setInterval(() => {
      fetchDashboardSummary({ silent: true });
    }, DASHBOARD_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [token, fetchDashboardSummary]);

  useEffect(() => {
    if (!token || !patientViewId) return;
    let cancelled = false;

    async function fetchPatientDetail() {
      try {
        setPatientViewLoading(true);
        setPatientViewError(null);

        const res = await fetch(
          buildApiUrl(`/api/patients/${patientViewId}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(
            errJson?.error || "Error al obtener los datos del paciente"
          );
        }

        const json = (await res.json()) as PatientDetail;
        if (!cancelled) {
          setPatientViewData({
            ...json,
            patient: {
              ...json.patient,
              tags: Array.isArray(json.patient?.tags) ? json.patient.tags : [],
            },
            orders: Array.isArray(json.orders) ? json.orders : [],
          });
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error("Error al cargar detalle de paciente:", err);
        setPatientViewError(
          err?.message || "Error desconocido al cargar el paciente."
        );
      } finally {
        if (!cancelled) {
          setPatientViewLoading(false);
        }
      }
    }

    fetchPatientDetail();
    return () => {
      cancelled = true;
    };
  }, [token, patientViewId, patientViewRequestId]);

  useEffect(() => {
    if (!patientViewData) {
      setProfileSaveSuccess(null);
      return;
    }
    setPatientProfileForm({
      fullName: patientViewData.patient.fullName || "",
      phone: patientViewData.patient.phone || "",
      dni: patientViewData.patient.dni || "",
      birthDate: patientViewData.patient.birthDate
        ? patientViewData.patient.birthDate.slice(0, 10)
        : "",
      address: patientViewData.patient.address || "",
      insuranceProvider: patientViewData.patient.insuranceProvider || "",
      occupation: patientViewData.patient.occupation || "",
      maritalStatus: patientViewData.patient.maritalStatus || "",
    });
  }, [patientViewData]);

  useEffect(() => {
    setPatientSummary(null);
    setPatientSummaryError(null);
    setPatientSummaryModalOpen(false);
    setPatientNotes([]);
    setPatientNotesError(null);
    setPatientNotesModalOpen(false);
    setAddNoteModalOpen(false);
    setAddNoteContent("");
    setAddNoteError(null);
    setAddNoteSuccess(null);
  }, [patientViewId]);

  useEffect(() => {
    if (!patientViewData) {
      setConsultationFormState({});
      setOpenConsultations({});
      return;
    }
    const consultations = Array.isArray(patientViewData.consultations)
      ? patientViewData.consultations
      : [];
    const initialState: Record<
      number,
      { paymentMethod: "cash" | "transfer_card" | ""; chargedAmount: string }
    > = {};
    consultations.forEach((c) => {
      initialState[c.id] = {
        paymentMethod:
          (c.paymentMethod as "cash" | "transfer_card" | "") || "",
        chargedAmount:
          typeof c.chargedAmount === "number"
            ? String(c.chargedAmount)
            : c.price
            ? String(c.price)
            : "",
      };
    });
    setConsultationFormState(initialState);
  }, [patientViewData]);

  useEffect(() => {
    if (!consultationStatusMessage) return;
    const timeout = window.setTimeout(
      () => setConsultationStatusMessage(null),
      4000
    );
    return () => {
      window.clearTimeout(timeout);
    };
  }, [consultationStatusMessage]);

  useEffect(() => {
    if (!addNoteSuccess) return;
    const timeout = window.setTimeout(() => setAddNoteSuccess(null), 4000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [addNoteSuccess]);

  // 3) Cuando tengo token, traigo la lista de pacientes (por ahora global)
  const fetchPatients = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) return;
      const silent = options?.silent ?? false;
      try {
        if (!silent) setLoadingPatients(true);
        setPatientsError(null);

        const res = await fetch(buildApiUrl("/api/patients"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error("Error al obtener la lista de contactos.");
        }

        const json = await res.json();
        const list = (json.patients || []) as Patient[];
        const normalized = list.map((patient) => ({
          ...patient,
          tags: Array.isArray(patient.tags) ? patient.tags : [],
        }));
        setPatients(normalized);
        if (businessType === "RETAIL") {
          setSelectedPatientId(normalized.length > 0 ? normalized[0].id : null);
        } else {
          setSelectedPatientId((prev) =>
            prev ?? (normalized.length > 0 ? normalized[0].id : null)
          );
        }
      } catch (err: any) {
        console.error("Error al cargar pacientes:", err);
        setPatientsError(
          err.message || "Error desconocido al cargar la lista."
        );
      } finally {
        if (!silent) setLoadingPatients(false);
      }
    },
    [token]
  );

  const fetchProducts = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token || !canAccessStock) return;
      const silent = options?.silent ?? false;
      try {
        if (!silent) setProductsLoading(true);
        setProductsError(null);
        const res = await fetch(buildApiUrl("/api/products"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error || "No pudimos obtener el stock.");
        }
        const list = Array.isArray(json?.products) ? json.products : [];
        setProducts(
          list.map((product: ProductItem) => normalizeProductRecord(product))
        );
      } catch (err: any) {
        console.error("Error al cargar productos:", err);
        setProductsError(
          err?.message ||
            "No pudimos cargar los productos. Intentá nuevamente."
        );
        if (!options?.silent) {
          setProducts([]);
        }
      } finally {
        if (!silent) setProductsLoading(false);
      }
    },
    [token, canAccessStock]
  );

  const clearProductImageSelection = useCallback(() => {
    setProductImageBase64(null);
    setProductImagePreview(null);
    if (productImageInputRef.current) {
      productImageInputRef.current.value = "";
    }
  }, []);

  const handleProductFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setProductForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleToggleProductCategory = (categoryKey: string) => {
    setProductForm((prev) => {
      const exists = prev.categories.includes(categoryKey);
      return {
        ...prev,
        categories: exists
          ? prev.categories.filter((key) => key !== categoryKey)
          : [...prev.categories, categoryKey],
      };
    });
  };

  const handleOpenProductCategoryModal = () => {
    setProductCategoryModalOpen(true);
    setProductCategoryInput("");
    setProductCategoryError(null);
  };

  const handleCloseProductCategoryModal = () => {
    setProductCategoryModalOpen(false);
    setProductCategoryInput("");
    setProductCategoryError(null);
  };

  const handleSaveCustomProductCategory = () => {
    const trimmed = productCategoryInput.trim();
    if (trimmed.length < 2) {
      setProductCategoryError("Ingresá al menos 2 caracteres.");
      return;
    }
    if (trimmed.length > 40) {
      setProductCategoryError("Usá un máximo de 40 caracteres.");
      return;
    }
    const exists = productForm.categories.some(
      (cat) => cat.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setProductCategoryError("Esa etiqueta ya está seleccionada.");
      return;
    }
    setProductForm((prev) => ({
      ...prev,
      categories: [...prev.categories, trimmed],
    }));
    handleCloseProductCategoryModal();
  };

  const openProductInlineEditor = (product: ProductItem) => {
    setProductEditingId(product.id);
    setProductEditError(null);
    setProductEditDrafts((prev) => ({
      ...prev,
      [product.id]: {
        name: product.name,
        price: String(product.price ?? ""),
        quantity: String(product.quantity ?? ""),
        description: product.description || "",
        categories: Array.isArray(product.categories) ? [...product.categories] : [],
      },
    }));
  };

  const closeProductInlineEditor = () => {
    if (productEditSavingId) return;
    setProductEditingId(null);
    setProductEditError(null);
  };

  const handleProductInlineChange = (
    productId: number,
    field: "name" | "price" | "quantity" | "description",
    value: string
  ) => {
    setProductEditDrafts((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  const handleInlineToggleCategory = (productId: number, categoryKey: string) => {
    setProductEditDrafts((prev) => {
      const current = prev[productId] ?? {
        name: "",
        price: "",
        quantity: "",
        description: "",
        categories: [],
      };
      const exists = current.categories.includes(categoryKey);
      const categories = exists
        ? current.categories.filter((key) => key !== categoryKey)
        : [...current.categories, categoryKey];
      return {
        ...prev,
        [productId]: { ...current, categories },
      };
    });
  };

  const handleSaveInlineProduct = async (productId: number) => {
    if (!token) return;
    const draft = productEditDrafts[productId];
    if (!draft) return;
    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setProductEditError("Ingresá el nombre del producto.");
      return;
    }
    const parsedPrice = parseFormInteger(draft.price);
    if (parsedPrice === null) {
      setProductEditError("Ingresá un precio válido.");
      return;
    }
    const parsedQuantity = parseFormInteger(draft.quantity);
    if (parsedQuantity === null) {
      setProductEditError("Ingresá una cantidad válida.");
      return;
    }
    try {
      setProductEditSavingId(productId);
      setProductEditError(null);
      const res = await fetch(buildApiUrl(`/api/products/${productId}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: trimmedName,
          description: draft.description.trim(),
          price: parsedPrice,
          quantity: parsedQuantity,
          categories: draft.categories,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "No pudimos actualizar el producto.");
      }
      if (json?.product) {
        setProducts((prev) =>
          prev.map((product) =>
            product.id === productId
              ? normalizeProductRecord(json.product as ProductItem)
              : product
          )
        );
      }
      setProductEditingId(null);
    } catch (err: any) {
      console.error("Error al actualizar producto:", err);
      setProductEditError(
        err?.message || "No pudimos actualizar el producto. Intentá nuevamente."
      );
    } finally {
      setProductEditSavingId((prev) => (prev === productId ? null : prev));
    }
  };

  const handleOpenProductModal = () => {
    handleResetProductForm();
    setProductModalOpen(true);
  };

  const handleCloseProductModal = () => {
    if (productSaving) return;
    setProductModalOpen(false);
  };

  const handleProductImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) {
      clearProductImageSelection();
      return;
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      setProductFormError("Formato no soportado. Subí PNG, JPG o WebP.");
      clearProductImageSelection();
      return;
    }

    if (file.size > MAX_UPLOAD_IMAGE_SIZE) {
      setProductFormError("La imagen supera los 2 MB permitidos.");
      clearProductImageSelection();
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setProductImageBase64(dataUrl);
      setProductImagePreview(dataUrl);
      setProductFormError((prev) =>
        prev && prev.toLowerCase().includes("imagen") ? null : prev
      );
    } catch (error) {
      console.error("Error al procesar imagen de producto:", error);
      setProductFormError(
        "No pudimos leer la imagen. Intentá nuevamente."
      );
      clearProductImageSelection();
    }
  };

  const handleResetProductForm = () => {
    setProductForm({ ...PRODUCT_FORM_INITIAL_STATE });
    setProductFormError(null);
    clearProductImageSelection();
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !canAccessStock) return;
    const trimmedName = productForm.name.trim();
    if (!trimmedName) {
      setProductFormError("Ingresá el nombre del producto.");
      return;
    }

    const parsedPrice = parseFormInteger(productForm.price);
    if (parsedPrice === null) {
      setProductFormError("Ingresá un precio válido.");
      return;
    }

    const parsedQuantity = parseFormInteger(productForm.quantity);
    if (parsedQuantity === null) {
      setProductFormError("Ingresá una cantidad válida.");
      return;
    }

    try {
      setProductSaving(true);
      setProductFormError(null);
      const res = await fetch(buildApiUrl("/api/products"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: trimmedName,
          description: productForm.description.trim() || null,
          imageBase64: productImageBase64,
          categories: productForm.categories,
          price: parsedPrice,
          quantity: parsedQuantity,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "No pudimos crear el producto.");
      }
      if (json?.product) {
        setProducts((prev) => [
          normalizeProductRecord(json.product as ProductItem),
          ...prev,
        ]);
      }
      handleResetProductForm();
      setProductSuccess("Producto agregado al stock.");
      setProductModalOpen(false);
    } catch (err: any) {
      console.error("Error al crear producto:", err);
      setProductFormError(
        err?.message || "No pudimos crear el producto. Intentá nuevamente."
      );
    } finally {
      setProductSaving(false);
    }
  };

  const handleRefreshProducts = () => {
    fetchProducts();
  };

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => {
      const haystack = [
        product.name,
        product.description || "",
        ...(product.categories || []),
        ...(product.tags || []).map((t) => t.label),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [products, productSearch]);

  const toggleMultiSelect = () => {
    setProductMultiSelect((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedProductIds(new Set());
      }
      return next;
    });
  };

  const toggleSelectProduct = (productId: number) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleCloseBulkDelete = () => {
    if (bulkDeleting) return;
    setBulkDeleteConfirmOpen(false);
    setBulkDeleteError(null);
  };

  const handleBulkDelete = async () => {
    if (!token) return;
    if (selectedProductIds.size === 0) return;
    try {
      setBulkDeleting(true);
      setBulkDeleteError(null);
      const ids = Array.from(selectedProductIds);
      for (const id of ids) {
        const res = await fetch(buildApiUrl(`/api/products/${id}`), {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error || "No pudimos eliminar algunos productos.");
        }
      }
      setProducts((prev) => prev.filter((p) => !selectedProductIds.has(p.id)));
      setSelectedProductIds(new Set());
      setProductMultiSelect(false);
      setBulkDeleteConfirmOpen(false);
    } catch (err: any) {
      console.error("Error en borrado múltiple:", err);
      setBulkDeleteError(err?.message || "No pudimos eliminar los productos seleccionados.");
    } finally {
      setBulkDeleting(false);
    }
  };

  const openProductTagModal = (productId: number) => {
    setProductTagProductId(productId);
    setProductTagLabel("");
    setProductTagSeverity("high");
    setProductTagError(null);
    setProductTagModalOpen(true);
  };

  const closeProductTagModal = () => {
    if (productTagSaving) return;
    setProductTagModalOpen(false);
    setProductTagProductId(null);
    setProductTagLabel("");
    setProductTagSeverity("high");
    setProductTagError(null);
  };

  const handleSaveProductTag = async () => {
    if (!token || !productTagProductId) return;
    const trimmed = productTagLabel.trim();
    if (trimmed.length < 2) {
      setProductTagError("Ingresá al menos 2 caracteres.");
      return;
    }
    try {
      setProductTagSaving(true);
      setProductTagError(null);
      const res = await fetch(
        buildApiUrl(`/api/products/${productTagProductId}/tags`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            label: trimmed,
            severity: productTagSeverity,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "No pudimos guardar la etiqueta.");
      }
      if (json?.tag) {
        setProducts((prev) =>
          prev.map((product) =>
            product.id === productTagProductId
              ? { ...product, tags: [json.tag, ...(product.tags || [])] }
              : product
          )
        );
      }
      closeProductTagModal();
    } catch (err: any) {
      console.error("Error al guardar etiqueta de producto:", err);
      setProductTagError(
        err?.message || "No pudimos guardar la etiqueta. Intentá nuevamente."
      );
    } finally {
      setProductTagSaving(false);
    }
  };

  const handleDeleteProductTag = async (productId: number, tagId: number) => {
    if (!token) return;
    try {
      const res = await fetch(
        buildApiUrl(`/api/products/${productId}/tags/${tagId}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "No pudimos eliminar la etiqueta.");
      }
      setProducts((prev) =>
        prev.map((product) =>
          product.id === productId
            ? {
                ...product,
                tags: (product.tags || []).filter((tag) => tag.id !== tagId),
              }
            : product
        )
      );
    } catch (err: any) {
      console.error("Error al eliminar etiqueta:", err);
      setProductsError(
        err?.message || "No pudimos eliminar la etiqueta. Intentá de nuevo."
      );
    }
  };

  const handleRequestDeleteProduct = (productId: number) => {
    setProductDeleteConfirmId(productId);
    setProductDeleteError(null);
  };

  const handleCancelDeleteProduct = () => {
    if (productDeletingId) return;
    setProductDeleteConfirmId(null);
    setProductDeleteError(null);
  };

  const handleConfirmDeleteProduct = async () => {
    if (!token || !productDeleteConfirmId) return;
    const productId = productDeleteConfirmId;
    try {
      setProductDeletingId(productId);
      setProductDeleteError(null);
      const res = await fetch(buildApiUrl(`/api/products/${productId}`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "No pudimos eliminar el producto.");
      }
      setProducts((prev) => prev.filter((product) => product.id !== productId));
      setProductDeleteConfirmId(null);
    } catch (err: any) {
      console.error("Error al eliminar producto:", err);
      setProductDeleteError(
        err?.message || "No pudimos eliminar el producto. Intentá nuevamente."
      );
    } finally {
      setProductDeletingId((prev) => (prev === productId ? null : prev));
    }
  };

  const handleSavePatientProfile = useCallback(async () => {
    if (!token || !patientViewId || !isMedicalDoctor) return;
    setProfileSaving(true);
    setProfileSaveError(null);
    setProfileSaveSuccess(null);
    try {
      const payload = {
        ...patientProfileForm,
        birthDate: patientProfileForm.birthDate ? patientProfileForm.birthDate : null,
      };
      const res = await fetch(
        buildApiUrl(`/api/patients/${patientViewId}/profile`),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "No pudimos actualizar la ficha.");
      }
      setProfileSaveSuccess("Ficha del paciente actualizada.");
      setProfileEditorOpen(false);
      setPatientViewRequestId((prev) => prev + 1);
      fetchPatients({ silent: true });
      setNotification({
        type: "success",
        message: "Ficha del paciente guardada.",
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      console.error("Error guardando ficha del paciente:", err);
      const message =
        err?.message || "No pudimos guardar los cambios de la ficha.";
      setProfileSaveError(message);
      setNotification({
        type: "error",
        message,
      });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setProfileSaving(false);
    }
  }, [
    token,
    patientViewId,
    patientProfileForm,
    fetchPatients,
  ]);

  const fetchPatientSegments = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) return;
      const silent = options?.silent ?? false;
      try {
        if (!silent) setPatientSegmentsLoading(true);
        const res = await fetch(buildApiUrl("/api/patient-tags"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          throw new Error("Error al obtener segmentos.");
        }
        const json = await res.json();
        const segments = Array.isArray(json.segments)
          ? (json.segments as PatientSegmentSummary[])
          : [];
        setPatientSegments(segments);
      } catch (err) {
        console.error("Error al cargar segmentos:", err);
        if (!silent) {
          setPatientSegments([]);
        }
      } finally {
        if (!silent) {
          setPatientSegmentsLoading(false);
        }
      }
    },
    [token]
  );

  const fetchDocuments = useCallback(
    async (options?: { silent?: boolean; search?: string }) => {
      if (!token) return;
      const silent = options?.silent ?? false;
      const searchValue = options?.search?.trim() ?? "";
      try {
        if (!silent) setDocumentsLoading(true);
        setDocumentsError(null);

        const params = new URLSearchParams();
        if (searchValue) {
          params.append("search", searchValue);
        }

        const url = params.toString()
          ? buildApiUrl(`/api/documents?${params.toString()}`)
          : buildApiUrl("/api/documents");

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || "No pudimos cargar los documentos.");
        }

        const json = await res.json();
        setDocuments((json.documents || []) as PatientDocumentItem[]);
      } catch (err: any) {
        console.error("Error al cargar documentos:", err);
        setDocumentsError(err?.message || "Error desconocido al cargar documentos.");
      } finally {
        if (!silent) setDocumentsLoading(false);
      }
    },
    [token]
  );

  const fetchInboxData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) return;
      const silent = options?.silent ?? false;
      try {
        if (!silent) setInboxLoading(true);
        setInboxError(null);

        const res = await fetch(buildApiUrl("/api/inbox"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(
            errJson?.error || "No pudimos obtener los pendientes."
          );
        }

        const json = await res.json();
        setInboxData({
          documents: Array.isArray(json.documents)
            ? (json.documents as InboxDocument[])
            : [],
          newAppointments: Array.isArray(json.newAppointments)
            ? (json.newAppointments as InboxAppointment[])
            : [],
          incompletePatients: Array.isArray(json.incompletePatients)
            ? (json.incompletePatients as InboxPatient[])
            : [],
        });
      } catch (err: any) {
        console.error("Error al cargar pendientes:", err);
        setInboxError(err?.message || "No pudimos cargar los pendientes.");
      } finally {
        if (!silent) setInboxLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    fetchPatientSegments({ silent: true });
  }, [token, fetchPatientSegments]);

  useEffect(() => {
    if (!token) return;
    fetchInboxData();
    const intervalId = window.setInterval(() => {
      fetchInboxData({ silent: true });
    }, INBOX_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [token, fetchInboxData]);

  useEffect(() => {
    if (token) return;
    setNotificationsOpen(false);
        setInboxData(buildEmptyInboxData());
        setInboxError(null);
        setInboxLoading(false);
        setProducts([]);
        setProductsError(null);
        setProductForm({ ...PRODUCT_FORM_INITIAL_STATE });
        setProductFormError(null);
        setProductSearch("");
        clearProductImageSelection();
        setProductTagModalOpen(false);
        setProductTagProductId(null);
        setProductDeleteConfirmId(null);
    setProductDeleteError(null);
    setProductDeletingId(null);
    setProductMultiSelect(false);
    setSelectedProductIds(new Set());
    setBulkDeleteConfirmOpen(false);
    setBulkDeleteError(null);
    setBulkDeleting(false);
  }, [token, clearProductImageSelection]);

  useEffect(() => {
    if (!token || !canAccessStock) return;
    fetchProducts({ silent: true });
  }, [token, canAccessStock, fetchProducts]);

  useEffect(() => {
    if (!token || !canAccessStock || activeSection !== "stock") return;
    fetchProducts({ silent: true });
  }, [token, canAccessStock, activeSection, fetchProducts]);

  useEffect(() => {
    if (!productSuccess) return;
    const timeout = window.setTimeout(() => setProductSuccess(null), 3500);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [productSuccess]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        notificationsPanelRef.current &&
        notificationsPanelRef.current.contains(target)
      ) {
        return;
      }
      if (
        notificationsButtonRef.current &&
        notificationsButtonRef.current.contains(target)
      ) {
        return;
      }
      setNotificationsOpen(false);
    };
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;
    setNotificationsOpen(false);
  }, [activeSection]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileSidebarOpen]);

  const applyTagUpdateToState = useCallback(
    (
      patientId: number,
      updater: (currentTags: PatientTag[]) => PatientTag[]
    ) => {
      setPatients((prev) =>
        prev.map((patient) =>
          patient.id === patientId
            ? { ...patient, tags: updater(patient.tags ?? []) }
            : patient
        )
      );
      setPatientViewData((prev) => {
        if (!prev || prev.patient.id !== patientId) return prev;
        return {
          ...prev,
          patient: {
            ...prev.patient,
            tags: updater(prev.patient.tags ?? []),
          },
        };
      });
    },
    []
  );

  const createPatientTag = useCallback(
    async ({
      patientId,
      label,
      severity,
    }: {
      patientId: number;
      label: string;
      severity: PatientTag["severity"];
    }) => {
      if (!token) {
        throw new Error("Necesitás iniciar sesión para guardar etiquetas.");
      }
      const res = await fetch(buildApiUrl(`/api/patients/${patientId}/tags`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label,
          severity,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.error || "No pudimos guardar la etiqueta. Intentá nuevamente."
        );
      }
      const json = await res.json();
      const createdTag = json.tag as PatientTag;
      applyTagUpdateToState(patientId, (current) => [createdTag, ...current]);
      fetchPatientSegments({ silent: true });
      return createdTag;
    },
    [token, applyTagUpdateToState, fetchPatientSegments]
  );

  const handleOpenDocument = useCallback(
    async (documentId: number): Promise<boolean> => {
      if (!token) {
        setNotification({
          type: "error",
          message: "Necesitás iniciar sesión para abrir documentos.",
        });
        setTimeout(() => setNotification(null), 4000);
        return false;
      }
      try {
        setDocumentDownloadId(documentId);
        const res = await fetch(
          buildApiUrl(`/api/documents/${documentId}/download`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(
            errJson?.error || "No pudimos abrir el archivo. Probá nuevamente."
          );
        }

        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");

        if (!opened) {
          const tempLink = document.createElement("a");
          tempLink.href = blobUrl;
          tempLink.target = "_blank";
          tempLink.rel = "noopener noreferrer";
          document.body.appendChild(tempLink);
          tempLink.click();
          document.body.removeChild(tempLink);
        }

        window.setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
        }, 60_000);
        return true;
      } catch (error: any) {
        console.error("Error al abrir documento:", error);
        const message =
          error?.message || "No pudimos abrir el archivo. Probá nuevamente.";
        setNotification({
          type: "error",
          message,
        });
        setTimeout(() => setNotification(null), 4000);
        return false;
      } finally {
        setDocumentDownloadId((prev) => (prev === documentId ? null : prev));
      }
    },
    [token]
  );

  const markDocumentAsReviewed = useCallback(
    async (documentId: number, options?: { silent?: boolean }) => {
      if (!token) return false;
      const silent = options?.silent ?? false;
      try {
        const res = await fetch(
          buildApiUrl(`/api/documents/${documentId}/review`),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(
            errJson?.error ||
              "No pudimos marcar el documento como revisado."
          );
        }
        const json = await res.json().catch(() => null);
        const reviewedAt =
          typeof json?.reviewedAt === "string"
            ? json.reviewedAt
            : new Date().toISOString();

        setDocuments((prev) =>
          prev.map((doc) =>
            doc.id === documentId ? { ...doc, reviewedAt } : doc
          )
        );
        setInboxData((prev) => ({
          ...prev,
          documents: prev.documents.filter((doc) => doc.id !== documentId),
        }));

        if (!silent) {
          setNotification({
            type: "success",
            message: "Marcamos el documento como revisado.",
          });
          setTimeout(() => setNotification(null), 4000);
        }
        return true;
      } catch (error: any) {
        console.error("Error al marcar documento como revisado:", error);
        if (!silent) {
          setNotification({
            type: "error",
            message:
              error?.message ||
              "No pudimos marcar el documento como revisado.",
          });
          setTimeout(() => setNotification(null), 4000);
        }
        return false;
      }
    },
    [token, setDocuments, setInboxData]
  );

  const handleMarkDocumentReviewed = useCallback(
    (documentId: number) => {
      markDocumentAsReviewed(documentId);
    },
    [markDocumentAsReviewed]
  );

  const handleInboxDocumentOpen = useCallback(
    async (documentId: number) => {
      const opened = await handleOpenDocument(documentId);
      if (opened) {
        await markDocumentAsReviewed(documentId, { silent: true });
      }
    },
    [handleOpenDocument, markDocumentAsReviewed]
  );

  const handleToggleNotifications = useCallback(() => {
    if (!token) return;
    if (!notificationsOpen) {
      fetchInboxData({ silent: true });
    }
    setNotificationsOpen((prev) => !prev);
  }, [token, notificationsOpen, fetchInboxData]);

  const handleCloseNotifications = useCallback(() => {
    setNotificationsOpen(false);
  }, []);

  const handleSidebarSectionChange = useCallback(
    (section: SidebarSection) => {
      setActiveSection(section);
      setMobileSidebarOpen(false);
    },
    [setActiveSection, setMobileSidebarOpen]
  );

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen((prev) => !prev);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  const handleGenerateMetricsSummary = useCallback(() => {
    const rangeLabel =
      METRICS_RANGE_OPTIONS.find((opt) => opt.key === metricsRange)?.label ||
      "este período";
    setMetricsSummaryRangeLabel(rangeLabel);
    setMetricsSummaryModalOpen(true);
    setMetricsSummary(null);
    setMetricsSummaryLoading(true);

    setTimeout(() => {
      if (isRetailBusiness && retailMetrics) {
        const daysInRange = (() => {
          const { start, end } = getRangeBounds(metricsRange);
          const diff = Math.max(
            1,
            Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
          );
          return diff;
        })();

        const paid = retailMetrics.revenue.paid;
        const total = retailMetrics.revenue.total;
        const outstanding =
          retailMetrics.revenue.outstanding + retailMetrics.revenue.partialOutstanding;
        const best = retailMetrics.products.best;
        const worst = retailMetrics.products.worst;
        const dailyOrders =
          retailMetrics.daily.length > 0
            ? retailMetrics.daily.reduce((sum, d) => sum + d.orders, 0) /
              retailMetrics.daily.length
            : retailMetrics.totals.total / daysInRange;
        const dailyPaid =
          retailMetrics.daily.length > 0
            ? retailMetrics.daily.reduce((sum, d) => sum + d.paid, 0) /
              retailMetrics.daily.length
            : paid / daysInRange;
        const projectionOrders = Math.round(dailyOrders * daysInRange);
        const projectionPaid = Math.round(dailyPaid * daysInRange);

        const lines: string[] = [];
        lines.push("Resumen ejecutivo:");
        lines.push(
          `- Pedidos: ${retailMetrics.totals.total} (confirmados ${retailMetrics.totals.confirmed}, pendientes ${retailMetrics.totals.pending}, cancelados ${retailMetrics.totals.cancelled}).`
        );
        lines.push(
          `- Ingresos cobrados: $ ${paid.toLocaleString("es-AR")} · Potencial total: $ ${total.toLocaleString(
            "es-AR"
          )} · Pendiente/deuda: $ ${outstanding.toLocaleString("es-AR")}.`
        );
        lines.push(
          `- Ticket promedio cobrado: $ ${retailMetrics.revenue.avgTicketPaid.toLocaleString(
            "es-AR"
          )} · Clientes únicos: ${retailMetrics.clients.unique}.`
        );

        if (best) {
          lines.push(
            `- Top producto: ${best.name} (${best.quantity} u, $ ${best.revenue.toLocaleString("es-AR")}).`
          );
        }
        if (worst) {
          lines.push(
            `- Baja rotación: ${worst.name} (${worst.quantity} u). Considerá promo o reemplazo.`
          );
        }

        lines.push(
          `Proyección (ritmo actual): ~${projectionOrders} pedidos y $ ${projectionPaid.toLocaleString(
            "es-AR"
          )} cobrados en el siguiente ${rangeLabel.toLowerCase()}.`
        );

        if (outstanding > 0) {
          lines.push(
            "- Cobros: enviá recordatorios automáticos a pendientes y ofrece pagos parciales para cerrar rápido."
          );
        } else {
          lines.push(
            "- Cobros: reforzá venta cruzada en los productos top para subir ticket promedio."
          );
        }

        lines.push("Ideas para potenciar las ventas:");
        if (best) {
          lines.push(`• Bundle con ${best.name} + complementos (ej: snacks/bebidas) con % off.`);
        }
        if (worst) {
          lines.push(`• Testeá promo flash o cambia la ubicación en catálogo de ${worst.name}.`);
        }
        lines.push("• Activa recordatorios de pago a las 24 h y cupones de recompra a 7 días.");
        lines.push("• Anuncia stock crítico para generar urgencia y rotar inventario lento.");
        lines.push("• Mantén un reporte semanal de margen por producto para ajustar precios.");

        setMetricsSummary(lines.join("\n"));
        setMetricsSummaryLoading(false);
        return;
      }

      // Health / turnos (existente)
      const { confirmed, cancelled, cancellationRate, completionRate } = metricsStats;
      const { collected, pending, avgTicket, cashCollected, transferCollected } =
        metricsRevenue;
      const topReason = topConsultReasons[0]?.label;
      const { start, end } = getRangeBounds(metricsRange);
      const daysInRange = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
      );
      const dailyConfirmed = confirmed / daysInRange;
      const projectionConfirmed = Math.round(dailyConfirmed * daysInRange);
      const projectionRevenue = Math.round((collected / Math.max(confirmed || 1, 1)) * projectionConfirmed);

      const lines: string[] = [];
      lines.push("Resumen ejecutivo:");
      lines.push(
        `- Turnos confirmados: ${confirmed} · Cancelados: ${cancelled} (tasa ${cancellationRate.toFixed(
          1
        )}%). Cumplimiento: ${completionRate.toFixed(1)}%.`
      );
      lines.push(
        `- Ingresos cobrados: $ ${collected.toLocaleString(
          "es-AR"
        )} · Pendiente: $ ${pending.toLocaleString("es-AR")} · Ticket promedio: $ ${avgTicket.toLocaleString(
          "es-AR"
        )}.`
      );
      lines.push(
        `- Cobros: efectivo $ ${cashCollected.toLocaleString(
          "es-AR"
        )} · transfer/débito/crédito $ ${transferCollected.toLocaleString("es-AR")}.`
      );
      if (topReason) {
        lines.push(`- Motivo más frecuente: “${topReason}”. Ajustá mensajes/guiones para ese caso.`);
      }
      lines.push(
        `Proyección (manteniendo ritmo): ~${projectionConfirmed} turnos y $ ${projectionRevenue.toLocaleString(
          "es-AR"
        )} cobrados en el siguiente ${rangeLabel.toLowerCase()}.`
      );
      lines.push("Ideas IA para potenciar:");
      if (cancellationRate > 20) {
        lines.push("• Activa recordatorios automáticos 24h antes y waitlist para reubicar cancelaciones.");
      } else {
        lines.push("• Ofrece chequeos complementarios o seguimientos post consulta para subir el ticket.");
      }
      lines.push("• Publicá disponibilidad clara en WhatsApp y confirma datos clave antes del turno.");
      lines.push("• Segmentá pacientes frecuentes y envía recordatorios de control preventivo.");

      setMetricsSummary(lines.join("\n"));
      setMetricsSummaryLoading(false);
    }, 350);
  }, [
    metricsRange,
    metricsRevenue,
    metricsStats,
    topConsultReasons,
    isRetailBusiness,
    retailMetrics,
  ]);

  const handleCloseMetricsSummaryModal = useCallback(() => {
    setMetricsSummaryModalOpen(false);
  }, []);

  const handleDownloadMetricsSummary = useCallback(() => {
    if (!metricsSummary) return;
    const docContent = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <h1>Resumen IA - ${metricsSummaryRangeLabel || metricsRangeLabel}</h1>
          <p>${metricsSummary}</p>
        </body>
      </html>
    `;
    const blob = new Blob([docContent], { type: "application/msword" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `resumen-metricas-${Date.now()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, [metricsSummary, metricsSummaryRangeLabel, metricsRangeLabel]);

  useEffect(() => {
    if (!token) return;
    fetchPatients();
    const intervalId = window.setInterval(() => {
      fetchPatients({ silent: true });
    }, PATIENTS_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [token, fetchPatients]);

  useEffect(() => {
    if (!token || activeSection !== "documents") return;
    const handler = window.setTimeout(() => {
      fetchDocuments({ search: documentSearch });
    }, 300);
    return () => {
      window.clearTimeout(handler);
    };
  }, [token, activeSection, documentSearch, fetchDocuments]);

  useEffect(() => {
    if (!token || activeSection !== "documents") return;
    const intervalId = window.setInterval(() => {
      fetchDocuments({ silent: true, search: documentSearch });
    }, DOCUMENTS_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [token, activeSection, documentSearch, fetchDocuments]);

  // 4) Al obtener token, traigo el perfil guardado del doctor
  useEffect(() => {
    if (!token) return;

    async function fetchProfile() {
      try {
        const res = await fetch(buildApiUrl("/api/me/profile"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error("Error al obtener perfil");
        }

        const json = await res.json();

        const normalizedAvailability = normalizeAvailabilityStatusValue(
          json.availabilityStatus
        );
        setAvailabilityStatus(normalizedAvailability);
        updateDoctorState((prev) => ({
          ...prev,
          availabilityStatus: normalizedAvailability,
          profileImageUrl: json.profileImageUrl ?? prev.profileImageUrl ?? null,
          ticketLogoUrl: json.ticketLogoUrl ?? prev.ticketLogoUrl ?? null,
        }));

        if (profilePrefilledFromStorage.current) {
          return;
        }

        setProfileForm((prev) => {
          const parsedHours = parseOfficeHoursText(json.officeHours);
          const parsedDays = parseOfficeDaysSelection(json.officeDays);

          return {
            ...prev,
            specialty: json.specialty ?? "",
            clinicName: json.clinicName ?? "",
            clinicAddress: json.officeAddress ?? "",
            ticketLogoUrl: json.ticketLogoUrl ?? prev.ticketLogoUrl ?? "",
            officeDays: json.officeDays ?? "",
            officeDaysSelection:
              parsedDays.length ? parsedDays : prev.officeDaysSelection,
            officeHours: json.officeHours ?? "",
            worksFullDay:
              typeof parsedHours.worksFullDay === "boolean"
                ? parsedHours.worksFullDay
                : prev.worksFullDay,
            officeHoursFullDayStart:
              parsedHours.officeHoursFullDayStart ||
              prev.officeHoursFullDayStart,
            officeHoursFullDayEnd:
              parsedHours.officeHoursFullDayEnd ||
              prev.officeHoursFullDayEnd,
            officeHoursMorningStart:
              parsedHours.officeHoursMorningStart ||
              prev.officeHoursMorningStart,
            officeHoursMorningEnd:
              parsedHours.officeHoursMorningEnd || prev.officeHoursMorningEnd,
            officeHoursAfternoonStart:
              parsedHours.officeHoursAfternoonStart ||
              prev.officeHoursAfternoonStart,
            officeHoursAfternoonEnd:
              parsedHours.officeHoursAfternoonEnd ||
              prev.officeHoursAfternoonEnd,
            contactPhone: json.contactPhone ?? "",
            consultFee:
              json.consultationPrice !== undefined &&
              json.consultationPrice !== null
                ? String(json.consultationPrice)
                : "",
            emergencyFee:
              json.emergencyConsultationPrice !== undefined &&
              json.emergencyConsultationPrice !== null
                ? String(json.emergencyConsultationPrice)
                : "",
            extraNotes: json.bio ?? "",
            slotInterval:
              doctor?.businessType === "HEALTH"
                ? String(json.appointmentSlotMinutes ?? 30)
                : prev.slotInterval || "30",
          };
        });
      } catch (err) {
        console.error("Error al cargar perfil:", err);
      }
    }

    fetchProfile();
  }, [token, doctor?.businessType, updateDoctorState]);

  useEffect(() => {
    if (activeSection !== "agenda" && activeAppointmentDetail) {
      setActiveAppointmentDetail(null);
    }
  }, [activeSection, activeAppointmentDetail]);

  const fetchCalendarAppointments = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) return;
      const silent = options?.silent ?? false;
      try {
        if (!silent) setLoadingCalendar(true);
        setCalendarError(null);
        const startISO = calendarWeekStart.toISOString();
        const endISO = addDays(calendarWeekStart, 7).toISOString();
        const res = await fetch(
          buildApiUrl(`/api/appointments/schedule?start=${encodeURIComponent(
            startISO
          )}&end=${encodeURIComponent(endISO)}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || "No pudimos cargar la agenda.");
        }

        const json = await res.json();
        setCalendarAppointments(json.appointments || []);
      } catch (err: any) {
        console.error("Error al cargar agenda:", err);
        setCalendarError(err?.message || "Error desconocido al cargar agenda.");
      } finally {
        if (!silent) setLoadingCalendar(false);
      }
    },
    [token, calendarWeekStart]
  );

  const fetchMetricsAppointmentsData = useCallback(async () => {
  if (!token || !doctor) return;
  const isRetail = doctor.businessType === "RETAIL";
  if (isRetail) {
      try {
        setRetailMetricsLoading(true);
        setRetailMetricsError(null);
        const { start, end } = getRangeBounds(metricsRange);
        const params = new URLSearchParams({
          start: start.toISOString(),
          end: end.toISOString(),
        });
        const res = await fetch(
          buildApiUrl(`/api/commerce/metrics?${params.toString()}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || "No pudimos cargar las métricas.");
        }
        const json = (await res.json()) as RetailMetricsResponse;
        setRetailMetrics(json);
        setMetricsAppointmentsData([]);
      } catch (err: any) {
        console.error("Error al cargar métricas retail:", err);
        setRetailMetrics(null);
        setRetailMetricsError(err?.message || "Error desconocido al cargar métricas.");
      } finally {
        setRetailMetricsLoading(false);
      }
      return;
    }

    try {
      setMetricsAppointmentsLoading(true);
      setMetricsAppointmentsError(null);
      const { start, end } = getRangeBounds(metricsRange);
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
        includeCancelled: "true",
      });
      const res = await fetch(
        buildApiUrl(`/api/appointments/schedule?${params.toString()}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "No pudimos cargar las métricas.");
      }

      const json = await res.json();
      setMetricsAppointmentsData((json.appointments || []) as CalendarAppointment[]);
    } catch (err: any) {
      console.error("Error al cargar métricas:", err);
      setMetricsAppointmentsError(
        err?.message || "Error desconocido al cargar métricas."
      );
      setMetricsAppointmentsData([]);
    } finally {
      setMetricsAppointmentsLoading(false);
    }
  }, [token, doctor, metricsRange]);

  const fetchPromotions = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token || !isRetailBusiness) return;
      const silent = options?.silent ?? false;
      try {
        if (!silent) setPromotionsLoading(true);
        setPromotionsError(null);
        const res = await fetch(buildApiUrl("/api/commerce/promotions"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error || "No pudimos cargar las promociones.");
        }
        const list = Array.isArray(json?.promotions) ? json.promotions : [];
        setPromotions(
          list.map((p: any) => ({
            ...p,
            productIds: Array.isArray(p.productIds)
              ? p.productIds.map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n))
              : [],
            productTagLabels: Array.isArray(p.productTagLabels) ? p.productTagLabels : [],
          }))
        );
      } catch (err: any) {
        console.error("Error al cargar promociones:", err);
        setPromotionsError(err?.message || "No pudimos cargar las promociones.");
        setPromotions([]);
      } finally {
        if (!silent) setPromotionsLoading(false);
      }
    },
    [token, isRetailBusiness]
  );

  useEffect(() => {
    if (!token) {
      setMetricsAppointmentsData([]);
      setRetailMetrics(null);
      return;
    }
    fetchMetricsAppointmentsData();
  }, [token, fetchMetricsAppointmentsData]);

  useEffect(() => {
    if (!token || !isRetailBusiness) return;
    if (activeSection === "promotions") {
      fetchPromotions();
    }
  }, [token, isRetailBusiness, activeSection, fetchPromotions]);

  const fetchRescheduleSlots = useCallback(async () => {
    if (!token) return;
    try {
      setRescheduleSlotsLoading(true);
      setRescheduleSlotsError(null);
      const res = await fetch(buildApiUrl("/api/appointments/available"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.error || "No pudimos obtener la disponibilidad."
        );
      }
      const json = await res.json();
      setRescheduleSlots(json.slots || []);
    } catch (err: any) {
      console.error("Error al obtener disponibilidad:", err);
      setRescheduleSlotsError(
        err?.message || "Error desconocido al buscar horarios."
      );
      setRescheduleSlots([]);
    } finally {
      setRescheduleSlotsLoading(false);
    }
  }, [token]);

  // 5) Cuando cambia el paciente seleccionado, traemos su historial de mensajes
  useEffect(() => {
    if (!token || !selectedPatientId) {
      setChatMessages([]);
      setMessagesError(null);
      return;
    }

    async function fetchMessages() {
      try {
        setLoadingMessages(true);
        setMessagesError(null);

        const res = await fetch(
          buildApiUrl(`/api/patients/${selectedPatientId}/messages`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || "Error al obtener mensajes");
        }

        const json = await res.json();
        const msgs = (json.messages || []) as ChatMessage[];
        setChatMessages(msgs);
      } catch (err: any) {
        console.error("Error al cargar mensajes:", err);
        setMessagesError(
          err.message || "Error desconocido al cargar mensajes"
        );
      } finally {
        setLoadingMessages(false);
      }
    }

    fetchMessages();
  }, [token, selectedPatientId]);

  useEffect(() => {
    if (!token || activeSection !== "agenda") return;
    fetchCalendarAppointments();
    const intervalId = window.setInterval(() => {
      fetchCalendarAppointments({ silent: true });
    }, CALENDAR_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [token, activeSection, calendarWeekStart, fetchCalendarAppointments]);

  // 6) Handler de login/registro exitoso → guardar también en localStorage
  const handleAuthSuccess = (tok: string, doc: Doctor) => {
    const normalizedDoctor: Doctor = {
      ...doc,
      businessType: doc.businessType ?? "HEALTH",
      availabilityStatus: normalizeAvailabilityStatusValue(
        doc.availabilityStatus
      ),
      ticketLogoUrl: doc.ticketLogoUrl ?? null,
    };

    setToken(tok);
    setDoctor(normalizedDoctor);
    setAvailabilityStatus(
      normalizedDoctor.availabilityStatus ?? DEFAULT_AVAILABILITY_STATUS
    );
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ token: tok, doctor: normalizedDoctor })
    );
  };

  // 7) Cerrar sesión
  const handleLogout = () => {
    setToken(null);
    setDoctor(null);
    setData(null);
    setDataError(null);
    setPatients([]);
    setSelectedPatientId(null);
    setPatientViewId(null);
    setPatientViewData(null);
    setPatientViewError(null);
    setPatientViewLoading(false);
    setClinicalHistorySnapshot(null);
    setPatientSearch("");
    setCalendarWeekStart(startOfWeek(new Date()));
    setCalendarAppointments([]);
    setCalendarError(null);
    setLoadingCalendar(false);
    setChatMessages([]);
    setAvailabilityStatus(DEFAULT_AVAILABILITY_STATUS);
    setPatientSegments([]);
    setSelectedBroadcastSegments([]);
    setProducts([]);
    setProductsError(null);
    setProductForm({ ...PRODUCT_FORM_INITIAL_STATE });
    setProductFormError(null);
    setProductSuccess(null);
    setProductDeletingId(null);
    setProductTagModalOpen(false);
    setProductTagProductId(null);
    setProductTagLabel("");
    setProductTagError(null);
    setInboxData(buildEmptyInboxData());
    setInboxError(null);
    setInboxLoading(false);
    setNotificationsOpen(false);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setActiveSection("dashboard");
  };

  // 8) Enviar mensaje a paciente seleccionado
  const handleSendToPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedPatientId || !messageText.trim()) return;

    const bodyToSend = messageText.trim();

    try {
      setSendingMessage(true);
      setSendError(null);
      setSendSuccess(null);

      const res = await fetch(
        buildApiUrl("/api/whatsapp/send-to-patient"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            patientId: selectedPatientId,
            message: bodyToSend,
          }),
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const baseMessage = errJson?.error || "Error al enviar mensaje";
        const detailPieces: string[] = [];
        if (errJson?.detail) {
          detailPieces.push(errJson.detail);
        }
        if (errJson?.twilioCode) {
          detailPieces.push(`Código Twilio: ${errJson.twilioCode}`);
        }
        throw new Error(
          detailPieces.length ? `${baseMessage}. ${detailPieces.join(" ")}` : baseMessage
        );
      }

      const json = await res.json();

      setSendSuccess("Mensaje enviado por WhatsApp.");
      setMessageText("");

      // Actualizamos el chat localmente para ver el mensaje enviado
      const selectedPatient =
        patients.find((p) => p.id === selectedPatientId) || null;

      setChatMessages((prev) => [
        ...prev,
        {
          id: json.savedMessageId ?? Date.now(),
          from: "me",
          to: selectedPatient?.phone ?? "",
          direction: "outgoing",
          type: "text",
          body: bodyToSend,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      console.error("Error al enviar mensaje al paciente:", err);
      setSendError(err.message || "Error desconocido al enviar mensaje");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleOpenBroadcastModal = useCallback(
    (options?: { presetMessage?: string; presetSegments?: string[] }) => {
      setBroadcastError(null);
      setBroadcastSuccess(null);
      setBroadcastSelectedPromoId(null);
      const presetMessage = options?.presetMessage ?? "";
      const presetSegments = options?.presetSegments ?? [];
      setBroadcastMessage(presetMessage);
      setSelectedBroadcastSegments(presetSegments);
      fetchPatientSegments({ silent: true });
      if (isRetailBusiness) {
        fetchPromotions({ silent: true });
      }
      setBroadcastModalOpen(true);
    },
    [fetchPatientSegments, fetchPromotions, isRetailBusiness]
  );

  const handleCloseBroadcastModal = useCallback(() => {
    if (broadcastSending) return;
    setBroadcastModalOpen(false);
    setSelectedBroadcastSegments([]);
    setBroadcastSelectedPromoId(null);
  }, [broadcastSending]);

  const handleBroadcastSend = useCallback(async () => {
    if (!token) return;
    const trimmed = broadcastMessage.trim();
    if (!trimmed) {
      setBroadcastError("Escribí un mensaje antes de enviarlo.");
      return;
    }
    try {
      setBroadcastSending(true);
      setBroadcastError(null);
      setBroadcastSuccess(null);
      if (isRetailBusiness && broadcastSelectedPromoId) {
        const res = await fetch(
          buildApiUrl(`/api/commerce/promotions/${broadcastSelectedPromoId}/send`),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ message: trimmed }),
          }
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error || "No pudimos enviar la promoción.");
        }
        setBroadcastSuccess(
          `Promoción enviada a ${json?.sent ?? "los"} clientes con teléfono registrado.`
        );
      } else {
        const res = await fetch(buildApiUrl("/api/whatsapp/broadcast"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: trimmed,
            tagLabels: selectedBroadcastSegments,
          }),
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || "No pudimos enviar el mensaje.");
        }
        const json = await res.json();
        const audienceLabel = isRetailBusiness ? "clientes" : "pacientes";
        if (selectedBroadcastSegments.length > 0) {
          setBroadcastSuccess(
            `Mensaje enviado a ${json.sent} ${audienceLabel} con las etiquetas seleccionadas (encontramos ${json.total}).`
          );
        } else {
          setBroadcastSuccess(
            `Mensaje enviado a ${json.sent} de ${json.total} ${audienceLabel}.`
          );
        }
      }
      setBroadcastMessage("");
    } catch (err: any) {
      console.error("Error al enviar mensaje masivo:", err);
      setBroadcastError(err?.message || "No pudimos enviar el mensaje masivo.");
    } finally {
      setBroadcastSending(false);
    }
  }, [broadcastMessage, selectedBroadcastSegments, token, isRetailBusiness, broadcastSelectedPromoId]);

  const handleOpenRescheduleModal = useCallback(
    (appointment: CalendarAppointment) => {
      setRescheduleModalAppointment(appointment);
      setRescheduleSelectedSlot(null);
      setRescheduleReason("");
      setRescheduleSlots([]);
      setRescheduleSlotsError(null);
      setRescheduleSubmitError(null);
      setActiveAppointmentDetail(null);
      fetchRescheduleSlots();
    },
    [fetchRescheduleSlots]
  );

  const handleAgendaReprogram = useCallback(
    async (item: AgendaItem) => {
      let appointmentPayload: CalendarAppointment | null = null;
      if (item.dateTimeISO && item.patientId !== undefined) {
        appointmentPayload = {
          id: item.id,
          dateTime: item.dateTimeISO,
          status: item.status || "scheduled",
          type: item.descripcion,
          source: "dashboard",
          patient: {
            id: item.patientId ?? null,
            fullName: item.paciente,
            insuranceProvider: item.insuranceProvider ?? undefined,
          },
        };
      } else {
        if (!token) return;
        try {
          const res = await fetch(buildApiUrl(`/api/appointments/${item.id}`), {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (!res.ok) {
            const errJson = await res.json().catch(() => null);
            throw new Error(
              errJson?.error || "No pudimos obtener los datos del turno."
            );
          }
          const json = await res.json();
          const appt = json.appointment;
          appointmentPayload = {
            id: appt.id,
            dateTime: appt.dateTime,
            status: appt.status,
            type: appt.type,
            source: appt.source,
            patient: {
              id: appt.patient?.id ?? null,
              fullName: appt.patient?.fullName ?? "Paciente sin nombre",
              insuranceProvider: appt.patient?.insuranceProvider ?? undefined,
            },
          };
        } catch (error: any) {
          console.error("Error obteniendo turno para reprogramar:", error);
          setNotification({
            type: "error",
            message:
              error?.message ||
              "No pudimos obtener el turno. Probá reprogramar desde la agenda.",
          });
          setTimeout(() => setNotification(null), 4000);
          return;
        }
      }

      if (appointmentPayload) {
        handleOpenRescheduleModal(appointmentPayload);
      }
    },
    [handleOpenRescheduleModal, setNotification, token]
  );

  const handleOpenPatientDetail = useCallback((patientId: number) => {
    setActiveSection("patients");
    setPatientViewId(patientId);
    setSelectedPatientId(patientId);
    setPatientViewLoading(true);
    setPatientViewData(null);
    setPatientViewError(null);
    setPatientViewRequestId((prev) => prev + 1);
  }, []);

  const pushAutomationMessage = useCallback((role: AutomationMessage["role"], text: string) => {
    setAutomationMessages((prev) => [
      ...prev,
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        role,
        text,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  const automationAddPatientTag = useCallback(
    async ({
      patientId,
      patientName,
      label,
      severity,
    }: {
      patientId: number;
      patientName: string;
      label: string;
      severity: PatientTag["severity"];
    }) => {
      const severityLabelMap: Record<PatientTag["severity"], string> = {
        critical: "prioridad crítica",
        high: "prioridad alta",
        medium: "control programado",
        info: "dato informativo",
      };
      try {
        await createPatientTag({ patientId, label, severity });
        pushAutomationMessage(
          "assistant",
          `Listo, guardé “${label}” como ${severityLabelMap[severity]} para ${patientName || "el paciente"}.`
        );
      } catch (err: any) {
        pushAutomationMessage(
          "assistant",
          `No pude guardar la etiqueta: ${err?.message || "error desconocido."}`
        );
      }
    },
    [createPatientTag, pushAutomationMessage]
  );

  const handleSendReminder = useCallback(
    async (appointmentId: number): Promise<boolean> => {
      if (!token) return false;

      try {
        setReminderLoadingId(appointmentId);
        setReminderError(null);
        setReminderSuccess(null);

        const res = await fetch(
          buildApiUrl(`/api/appointments/${appointmentId}/send-reminder`),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || "Error al enviar recordatorio");
        }

        await res.json().catch(() => null);
        setReminderSuccess("Recordatorio enviado por WhatsApp.");
        return true;
      } catch (err: any) {
        console.error("Error al enviar recordatorio:", err);
        setReminderError(
          err?.message || "Error desconocido al enviar recordatorio"
        );
        return false;
      } finally {
        setReminderLoadingId(null);
      }
    },
    [token]
  );

  const automationSendReminder = useCallback(
    async ({
      appointmentId,
      patientName,
      appointmentDate,
    }: {
      appointmentId: number;
      patientName: string;
      appointmentDate?: string | null;
    }) => {
      const displayName = patientName?.trim() || "el paciente";
      const formatDateLabel = (iso?: string | null) => {
        if (!iso) return null;
        const parsed = new Date(iso);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toLocaleString("es-AR", {
          weekday: "long",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
      };
      const appointmentLabel = formatDateLabel(appointmentDate);
      const suffix = appointmentLabel
        ? ` para su turno del ${appointmentLabel}`
        : "";

      pushAutomationMessage(
        "assistant",
        `Estoy enviando el recordatorio a ${displayName}${suffix}.`
      );
      const success = await handleSendReminder(appointmentId);
      if (success) {
        pushAutomationMessage(
          "assistant",
          `Recordatorio enviado a ${displayName}${suffix}.`
        );
      } else {
        pushAutomationMessage(
          "assistant",
          `No pude enviar el recordatorio para ${displayName}. Revisá la agenda por si necesitás hacerlo manualmente.`
        );
      }
    },
    [handleSendReminder, pushAutomationMessage]
  );

  const findAutomationAppointmentCandidate = useCallback(
    (input: string): AutomationAppointmentMatch | null => {
      const normalizedInput = normalizeSearchText(input);
      if (!normalizedInput) return null;

      let bestCandidate: AutomationAppointmentMatch | null = null;
      let bestStats = {
        matchedTokens: 0,
        completeness: 0,
        totalTokens: 0,
      };

      const considerCandidate = (candidate: AutomationAppointmentMatch) => {
        const normalizedName = normalizeSearchText(candidate.patientName);
        if (!normalizedName) return;
        const tokens = normalizedName.split(" ").filter(Boolean);
        if (tokens.length === 0) return;
        let matched = 0;
        tokens.forEach((token) => {
          if (normalizedInput.includes(token)) {
            matched += 1;
          }
        });
        if (matched === 0) return;
        const completeness = matched / tokens.length;
        const shouldReplace =
          !bestCandidate ||
          matched > bestStats.matchedTokens ||
          (matched === bestStats.matchedTokens &&
            completeness > bestStats.completeness) ||
          (matched === bestStats.matchedTokens &&
            completeness === bestStats.completeness &&
            tokens.length > bestStats.totalTokens);
        if (shouldReplace) {
          bestCandidate = candidate;
          bestStats = {
            matchedTokens: matched,
            completeness,
            totalTokens: tokens.length,
          };
        }
      };

      (data?.agendaHoy ?? []).forEach((appointment) => {
        if (!appointment.paciente) return;
        const statusValue = appointment.status?.toLowerCase() || "";
        if (statusValue.includes("cancel")) return;
        considerCandidate({
          source: "agenda",
          item: appointment,
          patientName: appointment.paciente,
        });
      });

      automationAppointmentPool.forEach((appointment) => {
        const name = appointment.patient?.fullName;
        if (!name) return;
        const status = appointment.status?.toLowerCase() ?? "";
        if (CALENDAR_HIDDEN_STATUSES.has(status)) return;
        considerCandidate({
          source: "calendar",
          item: appointment,
          patientName: name,
        });
      });

      return bestCandidate;
    },
    [automationAppointmentPool, data?.agendaHoy]
  );

  const interpretAutomationCommand = useCallback(
    (input: string) => {
      const lower = input.toLowerCase();
      const responses: string[] = [];
      const effects: Array<() => void> = [];
      let handled = false;
      if (isRetailBusiness) {
        if (/pedido|pendiente|revisar/.test(lower)) {
          responses.push("Te llevo a la vista de pedidos para que revises los pendientes.");
          effects.push(() => setActiveSection("orders"));
          handled = true;
        }
        if (/deuda|deudor|cobro/.test(lower)) {
          responses.push("Abrí Seguimiento de deudas para que veas los pedidos impagos.");
          effects.push(() => setActiveSection("debts"));
          handled = true;
        }
        if (/stock|inventario/.test(lower)) {
          responses.push("Voy a la sección de stock para que ajustes productos.");
          effects.push(() => setActiveSection("stock"));
          handled = true;
        }
        if (/promo|promoci/.test(lower)) {
          responses.push("Abrí la sección de promociones para que crees o envíes una promo.");
          effects.push(() => setActiveSection("promotions"));
          handled = true;
        }
        if (!handled) {
          responses.push(
            "Podés pedirme cosas como: “enviar recordatorio a deudores”, “aumentá bebidas 10%” o “mostrame pedidos pendientes”."
          );
        }
        return { text: responses.join(" "), effects };
      }
      const extractMessage = () => {
        const match =
          input.match(/diciendo(?: que)? (.+)/i) ||
          input.match(/deciles (.+)/i) ||
          input.match(/que (los|las|le) (.+)/i);
        if (match) {
          const candidate = match[match.length - 1] ?? "";
          return candidate.trim();
        }
        return "";
      };

      const buildBroadcast = (severity?: PatientTag["severity"]) => {
        let presetSegments: string[] = [];
        if (severity) {
          presetSegments = patientSegments
            .filter((segment) => segment.severity === severity)
            .map((segment) => segment.label);
        }
        const extractedMessage = extractMessage();
        const presetMessage =
          extractedMessage ||
          "Te espero mañana a las 14 hs en el consultorio. Confirmame si podés venir.";
        handleOpenBroadcastModal({
          presetMessage,
          presetSegments,
        });
        const severityLabel =
          severity === "critical"
            ? "prioridad crítica"
            : severity === "high"
            ? "prioridad alta"
            : severity === "medium"
            ? "prioridad media"
            : severity === "info"
            ? "informativos"
            : null;
        if (severityLabel) {
          responses.push(
            `Abrí el envío masivo con el mensaje pre cargado para pacientes ${severityLabel}.`
          );
          if (severity && presetSegments.length === 0) {
            responses.push(
              "No encontré segmentos con esa prioridad, pero podés elegirlos manualmente antes de enviar."
            );
          }
        } else {
          responses.push("Abrí el envío masivo con el mensaje listo para revisar y enviar.");
        }
      };

      if (
        /recordatorio|recordar|broadcast|masivo|campaña|campana|envi(a|á)|manda/.test(
          lower
        ) &&
        /mensaje/.test(lower)
      ) {
        handled = true;
        let targetedSeverity: PatientTag["severity"] | undefined;
        if (/crític|critico|crisis/.test(lower)) {
          targetedSeverity = "critical";
        } else if (/alto|alta/.test(lower)) {
          targetedSeverity = "high";
        } else if (/medio/.test(lower)) {
          targetedSeverity = "medium";
        } else if (/informativo|info|baja/.test(lower)) {
          targetedSeverity = "info";
        }
        buildBroadcast(targetedSeverity);
      }

      if (
        !handled &&
        /(dato importante|etiquet|tag)/.test(lower) &&
        /(pon|agreg|sum|carg|marc)/.test(lower)
      ) {
        handled = true;
        const patient = findPatientByQuery(input);
        const label =
          extractTagDescriptionFromCommand(input) ||
          extractTagDescriptionFromCommand(lower);
        if (!patient) {
          responses.push(
            "No encontré a qué paciente querés etiquetar. Decime el nombre completo o el DNI tal como figura en la ficha."
          );
        } else if (!label) {
          responses.push(
            `Decime qué texto querés guardar como dato importante para ${
              patient.fullName || "el paciente"
            }.`
          );
        } else {
          const trimmedLabel = label.slice(0, 60).trim();
          if (!trimmedLabel) {
            responses.push(
              "Necesito una descripción un poco más larga para poder guardarla como dato."
            );
          } else {
            const severity = detectTagSeverityFromText(input);
            responses.push(
              `Etiquetando a ${patient.fullName || "el paciente"} con “${trimmedLabel}”.`
            );
            effects.push(() => {
              automationAddPatientTag({
                patientId: patient.id,
                patientName: patient.fullName || "Paciente sin nombre",
                label: trimmedLabel,
                severity,
              });
            });
          }
        }
      }

      if (
        !handled &&
        /recordatorio/.test(lower) &&
        /(turno|consulta|cita)/.test(lower) &&
        !/masivo|campan|campaña|segment/.test(lower)
      ) {
        handled = true;
        const match = findAutomationAppointmentCandidate(input);

        if (!match) {
          responses.push(
            "No encontré un turno para enviarle el recordatorio. Probá indicarme el nombre tal como figura en la agenda o abrí la agenda para revisarlo manualmente."
          );
          effects.push(() => setActiveSection("agenda"));
        } else {
          const appointmentId = match.item.id;
          const appointmentDate =
            match.source === "agenda"
              ? match.item.dateTimeISO || null
              : match.item.dateTime || null;
          responses.push(
            `Enviando el recordatorio del turno de ${match.patientName || "el paciente"}.`
          );
          effects.push(() => {
            automationSendReminder({
              appointmentId,
              patientName: match.patientName,
              appointmentDate,
            });
          });
        }
      }

      if (
        !handled &&
        /(reprogram|reagend|cambi(a|á)|mover|pospon|atras)/.test(lower) &&
        /(turno|consulta|cita)/.test(lower)
      ) {
        handled = true;
        const parsedDateInfo = parseAutomationDateTime(input) || undefined;
        const bestMatch = findAutomationAppointmentCandidate(input);

        if (!bestMatch) {
          responses.push(
            "No encontré un turno para ese paciente en la agenda visible. Probá indicar el nombre tal como figura en los turnos o el DNI, o abrí la agenda para buscarlo manualmente."
          );
          effects.push(() => setActiveSection("agenda"));
        } else {
          const patientName = bestMatch.patientName;
          const infoMessage = parsedDateInfo?.targetLabel
            ? `Voy a buscar disponibilidad para ${parsedDateInfo.targetLabel}.`
            : "Elegí el nuevo horario en el modal.";
          responses.push(
            `Abrí la reprogramación del turno de ${patientName}. ${infoMessage}`
          );
          effects.push(() => {
            const appointmentId =
              bestMatch.source === "agenda"
                ? bestMatch.item.id
                : bestMatch.item.id;
            if (bestMatch.source === "agenda") {
              handleAgendaReprogram(bestMatch.item);
            } else {
              handleOpenRescheduleModal(bestMatch.item);
            }
            setAutomationRescheduleIntent({
              appointmentId,
              targetDate: parsedDateInfo?.targetDate ?? null,
              targetLabel: parsedDateInfo?.targetLabel ?? undefined,
              reason: parsedDateInfo?.targetLabel
                ? `Reprogramar para ${parsedDateInfo.targetLabel}`
                : "Reprogramación solicitada desde automatización",
              slotApplied: parsedDateInfo?.targetDate ? false : true,
              feedbackSent: parsedDateInfo?.targetDate ? false : true,
            });
          });
        }
      }

      if (
        !handled &&
        /(historia|historial)/.test(lower) &&
        /(clinica|clínica)/.test(lower)
      ) {
        handled = true;
        const patient = findPatientByQuery(input);
        let targetPatientId = patient?.id ?? null;
        let targetPatientName = patient?.fullName?.trim() || "";

        if (!targetPatientId) {
          const fallbackMatch = findAutomationAppointmentCandidate(input);
          if (fallbackMatch) {
            targetPatientId =
              fallbackMatch.source === "calendar"
                ? fallbackMatch.item.patient?.id ?? null
                : fallbackMatch.item.patientId ?? null;
            if (!targetPatientName) {
              targetPatientName = fallbackMatch.patientName;
            }
          }
        }

        if (!targetPatientId) {
          responses.push(
            "Necesito que me digas el nombre o DNI tal como figura en la ficha para poder generar la historia clínica."
          );
        } else {
          const spokenName =
            targetPatientName ||
            `${contactLabels.singularCapitalized} sin nombre`;
          responses.push(
            `Preparando la historia clínica de ${spokenName}. Te aviso cuando la descargo.`
          );
          const resolvedId = targetPatientId;
          effects.push(() => {
            if (!resolvedId) return;
            handleOpenPatientDetail(resolvedId);
            setAutomationHistoryIntent({
              patientId: resolvedId,
              patientName: spokenName,
              action: "download_history",
            });
          });
        }
      }

      if (!handled && /agenda|turno|horario|disponibilidad/.test(lower)) {
        handled = true;
        responses.push("Te llevo a la agenda para que revises los turnos.");
        effects.push(() => {
          setActiveSection("agenda");
        });
      }

      if (!handled && /radar|riesgo|crítico|critico/.test(lower)) {
        handled = true;
        responses.push("Mostrando el radar crítico para priorizar pacientes.");
        effects.push(() => {
          setActiveSection("risk");
        });
      }

      if (
        !handled &&
        /pendiente|inbox|documento|ficha incompleta/.test(lower)
      ) {
        handled = true;
        responses.push(
          `Tenés ${inboxCounts.documents} documentos, ${inboxCounts.newAppointments} turnos y ${inboxCounts.incompletePatients} fichas pendientes en el inbox.`
        );
      }

      if (
        !handled &&
        ((/resumen|ingreso|estado|métric|metric/.test(lower) && data) ||
          (/consultas|hoy/.test(lower) && data))
      ) {
        handled = true;
        responses.push(
          `Hoy tenés ${data?.stats.consultasHoy ?? 0} consultas y ${data?.stats.pacientesEnEspera ?? 0} pacientes en espera. Los ingresos del mes van en $ ${
            data?.stats.ingresosMes.toLocaleString("es-AR") ?? "0"
          }, con ${data?.stats.pacientesRecurrentesPorcentaje ?? 0}% de pacientes recurrentes.`
        );
      }

      if (
        !handled &&
        /paciente/.test(lower) &&
        /incomplet|dato/.test(lower)
      ) {
        handled = true;
        responses.push(
          `Hay ${patientStats.pendingInsurance} pacientes sin obra social y ${patientStats.pendingReason} sin motivo de consulta cargado.`
        );
      } else if (
        !handled &&
        /cuántos|cuantos|total.*paciente|pacientes tengo/.test(lower)
      ) {
        handled = true;
        responses.push(`Actualmente gestionás ${patients.length} pacientes.`);
      }

      if (
        !handled &&
        /mensaje|whatsapp/.test(lower) &&
        !/masivo|todos|segment|grupo|critico|crítico/.test(lower)
      ) {
        handled = true;
        responses.push(
          `Seleccioná un ${contactLabels.singularLower} en la lista y escribí el mensaje desde el panel derecho. Yo dejé todo listo en la vista principal.`
        );
        effects.push(() => {
          setActiveSection("dashboard");
        });
      }

      if (!handled) {
        responses.push(
          "Por ahora puedo ayudarte a abrir la agenda, mostrar pendientes, resumir métricas o preparar envíos masivos. Probá pidiéndome algo de eso."
        );
      }

      return { text: responses.join(" "), effects };
    },
    [
      data,
      automationAppointmentPool,
      inboxCounts.documents,
      inboxCounts.incompletePatients,
      inboxCounts.newAppointments,
      patientStats.pendingInsurance,
      patientStats.pendingReason,
      patients.length,
      contactLabels.singularLower,
      contactLabels.singularCapitalized,
      patientSegments,
      handleOpenBroadcastModal,
      handleAgendaReprogram,
      handleOpenRescheduleModal,
      findPatientByQuery,
      automationAddPatientTag,
      automationSendReminder,
      findAutomationAppointmentCandidate,
      handleOpenPatientDetail,
      setAutomationRescheduleIntent,
      setAutomationHistoryIntent,
      setActiveSection,
    ]
  );

  const handleAutomationSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!automationInput.trim() || automationProcessing) return;
      const trimmed = automationInput.trim();
      pushAutomationMessage("user", trimmed);
      setAutomationInput("");
      setAutomationProcessing(true);
      try {
        if (isRetailBusiness) {
          const handled = await automationRetailCommandRef.current(trimmed);
          if (handled) {
            setAutomationProcessing(false);
            return;
          }
        }
        const { text, effects } = interpretAutomationCommand(trimmed);
        pushAutomationMessage("assistant", text);
        effects.forEach((fn) => fn());
      } finally {
        setAutomationProcessing(false);
      }
    },
    [
      automationInput,
      automationProcessing,
      interpretAutomationCommand,
      pushAutomationMessage,
      isRetailBusiness,
      automationRetailCommandRef,
    ]
  );

  const handleAutomationSuggestion = useCallback(
    (suggestion: string) => {
      setAutomationInput(suggestion);
      if (!automationAssistantOpen) {
        setAutomationAssistantOpen(true);
      }
    },
    [automationAssistantOpen]
  );

  const toggleAutomationAssistant = useCallback(() => {
    setAutomationAssistantOpen((prev) => !prev);
  }, []);

  const summarizeAutomationAction = (action: AutomationAction): string => {
    if (!action || typeof action !== "object") return "Acción desconocida";
    switch (action.type) {
      case "navigate":
        return `Abrir ${getSectionLabel(action.target)}`;
      case "send_payment_reminders":
        return `Enviar recordatorios a ${action.orderIds?.length ?? 0} pedido(s)`;
      case "adjust_stock":
        return `Ajustar stock ${action.productName || `#${action.productId ?? ""}`} ${
          action.setQuantity != null ? `→ ${action.setQuantity}` : `Δ ${action.delta ?? 0}`
        }`;
      case "increase_prices_percent":
        return `Actualizar precios ${action.percent}% (${action.productIds?.length ?? "todos"})`;
      case "broadcast_prompt":
        return `Abrir envío masivo: "${action.message.slice(0, 80)}"`;
      default:
        return "Acción";
    }
  };

  const handleToggleBroadcastSegment = useCallback((label: string) => {
    setSelectedBroadcastSegments((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label]
    );
  }, []);

  const updateProductPriceQuick = useCallback(
    async (productId: number, newPrice: number) => {
      if (!token) throw new Error("Falta sesión");
      const res = await fetch(buildApiUrl(`/api/products/${productId}`), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ price: newPrice }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "No pudimos actualizar el precio");
      }
      const json = await res.json();
      const updated = json.product as CommerceProduct;
      setProducts((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, price: updated.price } : p))
      );
      return updated;
    },
    [token]
  );

  const updateProductQuantityQuick = useCallback(
    async (productId: number, newQuantity: number) => {
      if (!token) throw new Error("Falta sesión");
      const res = await fetch(buildApiUrl(`/api/products/${productId}`), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quantity: newQuantity }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "No pudimos actualizar la cantidad");
      }
      const json = await res.json();
      const updated = json.product as CommerceProduct;
      setProducts((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, quantity: updated.quantity } : p))
      );
      return updated;
    },
    [token]
  );

  const findProductByTerm = useCallback(
    (term: string): CommerceProduct | null => {
      const norm = term.toLowerCase().trim();
      if (!norm) return null;
      let best: { score: number; product: CommerceProduct | null } = {
        score: 0,
        product: null,
      };
      products.forEach((p) => {
        const name = p.name.toLowerCase();
        let score = 0;
        if (name.includes(norm)) score += 3;
        const tokens = norm.split(/\s+/);
        tokens.forEach((t) => {
          if (t.length >= 3 && name.includes(t)) score += 1;
        });
        if (p.categories?.includes("beverages") && /coca|bebida|gaseosa/.test(norm)) {
          score += 2;
        }
        if (score > best.score) {
          best = { score, product: p };
        }
      });
      return best.product;
    },
    [products]
  );

  const normalizeAutomationActions = useCallback((raw: any): AutomationAction[] => {
    if (!Array.isArray(raw)) return [];

    const out: AutomationAction[] = [];

    const toStr = (v: any) => (typeof v === "string" ? v.trim() : "");
    const toNum = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const toInt = (v: any) => {
      const n = toNum(v);
      return n === null ? null : Math.trunc(n);
    };
    const uniqNums = (arr: any[]) =>
      Array.from(new Set(arr.map(Number).filter(Number.isFinite).map((n) => Math.trunc(n))));

    const normalizeTarget = (
      t: any
    ): AutomationAction extends { type: "navigate"; target: infer T } ? T | null : any => {
      const s = toStr(t).toLowerCase();
      if (!s) return null;

      const map: Record<string, any> = {
        orders: "orders",
        pedidos: "orders",
        debts: "debts",
        deudas: "debts",
        stock: "stock",
        inventario: "stock",
        promotions: "promotions",
        promos: "promotions",
        promociones: "promotions",
        clients: "clients",
        clientes: "clients",
      };

      const v = map[s] ?? s;
      return ["orders", "debts", "stock", "promotions", "clients"].includes(v) ? (v as any) : null;
    };

    const expandLegacyShape = (entry: any) => {
      if (entry?.type) return entry;
      if (entry?.navigate) return { type: "navigate", ...(entry.navigate || {}) };
      if (entry?.send_payment_reminders)
        return { type: "send_payment_reminders", ...(entry.send_payment_reminders || {}) };
      if (entry?.increase_prices_percent)
        return { type: "increase_prices_percent", ...(entry.increase_prices_percent || {}) };
      if (entry?.adjust_stock) return { type: "adjust_stock", ...(entry.adjust_stock || {}) };
      if (entry?.broadcast_prompt) return { type: "broadcast_prompt", ...(entry.broadcast_prompt || {}) };
      if (entry?.noop) return { type: "noop", ...(entry.noop || {}) };
      return entry;
    };

    for (const rawEntry of raw) {
      if (!rawEntry || typeof rawEntry !== "object") continue;

      const entry = expandLegacyShape(rawEntry);
      const type = toStr(entry?.type);

      if (type === "navigate") {
        const target = normalizeTarget(entry?.target ?? entry?.view ?? entry?.section ?? entry?.page);
        if (!target) continue;
        out.push({ type: "navigate", target });
        continue;
      }

      if (type === "send_payment_reminders") {
        const ids = Array.isArray(entry?.orderIds) ? uniqNums(entry.orderIds) : [];
        out.push({ type: "send_payment_reminders", orderIds: ids });
        continue;
      }

      if (type === "increase_prices_percent") {
        const percent = toNum(entry?.percent);
        if (percent === null || percent === 0) continue;

        const productIds =
          Array.isArray(entry?.productIds) && entry.productIds.length > 0
            ? uniqNums(entry.productIds)
            : undefined;

        out.push({ type: "increase_prices_percent", percent, productIds });
        continue;
      }

      if (type === "adjust_stock") {
        const productId = toInt(entry?.productId);
        const productName = toStr(entry?.productName) || undefined;
        const delta = toNum(entry?.delta);
        const setQuantity = toNum(entry?.setQuantity);

        const hasProduct = productId !== null || !!productName;
        const hasChange = delta !== null || setQuantity !== null;
        if (!hasProduct || !hasChange) continue;

        out.push({
          type: "adjust_stock",
          productId: productId ?? undefined,
          productName,
          delta: delta ?? undefined,
          setQuantity: setQuantity ?? undefined,
        });
        continue;
      }

      if (type === "broadcast_prompt") {
        const message = toStr(entry?.message);
        if (!message) continue;
        out.push({ type: "broadcast_prompt", message });
        continue;
      }

      if (type === "noop") {
        const note = toStr(entry?.note) || undefined;
        out.push(note ? { type: "noop", note } : { type: "noop" });
        continue;
      }
    }

    return out;
  }, []);

  const applyAutomationActions = useCallback(
    async (actions: AutomationAction[]) => {
      if (!actions || actions.length === 0) return;
      const summaries: string[] = [];
      let executed = false;
      console.log("[automation] applying actions:", actions);

      const resolveOrderIdFrom = (list: any[], input: number) => {
        if (list.some((o) => o.id === input)) return input;
        const bySeq = list.find((o) => o.sequenceNumber === input);
        return bySeq ? bySeq.id : input;
      };

      for (const action of actions) {
        if (!action || typeof action !== "object") continue;

        if (action.type === "navigate" && action.target) {
          setActiveSection(action.target);
          summaries.push(`Te llevé a ${getSectionLabel(action.target)}.`);
          executed = true;
          continue;
        }

        if (action.type === "send_payment_reminders") {
          const orderIdsRaw = Array.isArray(action.orderIds) ? action.orderIds : [];
          const fallbackIds =
            orderIdsRaw.length === 0
              ? debtOrders.map((d) => d.order.id)
              : orderIdsRaw;

          let currentOrders = orders;
          // Si faltan pedidos en memoria, recargamos antes de intentar
          if (
            currentOrders.length === 0 ||
            fallbackIds.some((id) => !currentOrders.some((o) => o.id === id || o.sequenceNumber === id))
          ) {
            try {
              const res = await fetch(buildApiUrl("/api/commerce/orders"), {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const json = await res.json();
                const fresh = Array.isArray(json.orders) ? json.orders : [];
                currentOrders = fresh;
                setOrders(fresh);
              }
            } catch (err) {
              console.error("Automation reminder reload orders error:", err);
            }
          }

          const orderIds = fallbackIds
            .map((id) => resolveOrderIdFrom(currentOrders, id))
            .filter((id) => typeof id === "number" && Number.isFinite(id));

          const matched = currentOrders.filter((o) => orderIds.includes(o.id));
          const missingIds = orderIds.filter((id) => !matched.some((m) => m.id === id));

          for (const ord of matched) {
            try {
              await handleSendPaymentReminder(ord);
              summaries.push(`Recordatorio enviado a pedido #${ord.sequenceNumber || ord.id}.`);
              executed = true;
            } catch (err) {
              console.error("Reminder error (automation matched):", err);
              summaries.push(
                `No pude enviar recordatorio al pedido #${ord.sequenceNumber || ord.id}.`
              );
            }
          }

          // Intentamos enviar también para los IDs que no están cargados en la UI
          for (const missingId of missingIds) {
            try {
              const res = await fetch(
                buildApiUrl(`/api/commerce/orders/${missingId}/payment-reminder`),
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }
              );
              console.log("[automation] reminder fetch", missingId, "status", res.status);
              if (res.ok) {
                summaries.push(`Recordatorio enviado a pedido #${missingId}.`);
                executed = true;
              } else {
                const errText = await res.text().catch(() => "");
                summaries.push(
                  `No pude enviar recordatorio al pedido #${missingId}: ${errText || "error desconocido"}`
                );
              }
            } catch (err: any) {
              console.error("Reminder error (automation):", err);
              summaries.push(`No pude enviar recordatorio al pedido #${missingId}.`);
            }
          }

          if (matched.length === 0 && missingIds.length === 0) {
            summaries.push("No encontré esos pedidos en la lista actual. Refrescá pedidos y probá de nuevo.");
          }
          continue;
        }

        if (action.type === "adjust_stock") {
          const product =
            (typeof action.productId === "number"
              ? products.find((p) => p.id === action.productId)
              : null) ||
            (action.productName ? findProductByTerm(action.productName) : null);

          if (!product) {
            summaries.push("No encontré el producto para ajustar stock.");
            continue;
          }

          const currentQty = product.quantity ?? 0;
          const nextQty =
            typeof action.setQuantity === "number"
              ? Math.max(0, action.setQuantity)
              : Math.max(0, currentQty + (action.delta ?? 0));

          try {
            await updateProductQuantityQuick(product.id, nextQty);
            summaries.push(`Stock de ${product.name} ajustado a ${nextQty}.`);
            executed = true;
          } catch (err) {
            console.error("Automation stock update error:", err);
            summaries.push(`No pude actualizar stock de ${product.name}.`);
          }
          continue;
        }

        if (action.type === "increase_prices_percent") {
          const percent = Number(action.percent);
          if (!Number.isFinite(percent) || percent === 0) {
            summaries.push("Porcentaje inválido para actualizar precios.");
            continue;
          }
          const productIds = Array.isArray(action.productIds)
            ? action.productIds
            : products.map((p) => p.id);
          let updatedCount = 0;
          for (const prod of products) {
            if (!productIds.includes(prod.id)) continue;
            const newPrice = Math.max(0, Math.round((prod.price || 0) * (1 + percent / 100)));
            try {
              await updateProductPriceQuick(prod.id, newPrice);
              updatedCount += 1;
            } catch (err) {
              console.error("Automation price update error:", err);
            }
          }
          summaries.push(
            `Actualicé precios de ${updatedCount} producto${updatedCount === 1 ? "" : "s"} en ${
              percent > 0 ? `+${percent}%` : `${percent}%`
            }.`
          );
          if (updatedCount > 0) executed = true;
          continue;
        }

        if (action.type === "broadcast_prompt" && action.message) {
          handleOpenBroadcastModal({
            presetMessage: action.message,
          });
          summaries.push("Abrí el envío masivo con el texto sugerido.");
          executed = true;
          continue;
        }

        summaries.push("Ignoré una acción desconocida o incompleta.");
      }

      if (summaries.length > 0) {
        pushAutomationMessage("assistant", summaries.join("\n"));
      } else if (!executed) {
        pushAutomationMessage("assistant", "No ejecuté ninguna acción. Probá nuevamente.");
      }
      console.log("[automation] done. executed:", executed, "summaries:", summaries);
    },
    [
      getSectionLabel,
      debtOrders,
      findProductByTerm,
      handleOpenBroadcastModal,
      handleSendPaymentReminder,
      orders,
      products,
      pushAutomationMessage,
      setActiveSection,
      updateProductPriceQuick,
      updateProductQuantityQuick,
      token,
    ]
  );

  const handleConfirmAutomationActions = useCallback(async () => {
    const pending = automationPendingActions;
    setAutomationPendingActions(null);
    if (!pending || !pending.actions || pending.actions.length === 0) return;
    setAutomationProcessing(true);
    try {
      await applyAutomationActions(pending.actions);
    } finally {
      setAutomationProcessing(false);
    }
  }, [applyAutomationActions, automationPendingActions]);

  const handleCancelAutomationActions = useCallback(() => {
    setAutomationPendingActions(null);
    pushAutomationMessage("assistant", "Cancelé la ejecución. Decime si querés otra cosa.");
  }, [pushAutomationMessage]);

  const handleAutomationRetailCommand = useCallback(
    async (raw: string) => {
      if (!token || businessType !== "RETAIL") return false;
      try {
        setAutomationPendingActions(null);
        console.log("[automation] sending text to agent:", raw);
        const res = await fetch(buildApiUrl("/api/automation/retail"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: raw }),
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          console.error("[automation] agent error response:", errJson);
          throw new Error(errJson?.error || "No pude hablar con el agente.");
        }
        const json = await res.json();
        console.log("[automation] agent result:", json);
        const actions = normalizeAutomationActions(json?.actions);
        const reply = typeof json?.reply === "string" ? json.reply : "";
        if (reply) {
          pushAutomationMessage("assistant", reply);
        }
        // Pedimos confirmación antes de ejecutar acciones reales
        if (actions.length > 0) {
          setAutomationPendingActions({ reply, actions });
          pushAutomationMessage(
            "assistant",
            "Necesito tu confirmación para ejecutar estas acciones."
          );
        }
        if (!reply && actions.length === 0) {
          pushAutomationMessage(
            "assistant",
            "No encontré acciones para ejecutar con ese pedido. Probá pedirme algo como “subí bebidas 10%” o “enviá recordatorio a deudores”."
          );
        }
        return true;
      } catch (err: any) {
        console.error("Automation agent error:", err);
        pushAutomationMessage(
          "assistant",
          err?.message ||
            "No pude ejecutar la automatización. Probá nuevamente en unos segundos."
        );
        return true;
      }
    },
    [
      applyAutomationActions,
      businessType,
      pushAutomationMessage,
      token,
    ]
  );
  automationRetailCommandRef.current = handleAutomationRetailCommand;

  const loadPatientSummary = useCallback(async () => {
    if (!token || !patientViewId) return;
    try {
      setPatientSummaryLoading(true);
      setPatientSummaryError(null);
      const res = await fetch(
        buildApiUrl(`/api/patients/${patientViewId}/summary`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.error || "No pudimos generar el resumen del paciente."
        );
      }

      const json = await res.json();
      setPatientSummary(json?.summary || "Sin información para resumir.");
    } catch (err: any) {
      console.error("Error al generar resumen de paciente:", err);
      setPatientSummaryError(
        err?.message || "Error desconocido al generar el resumen."
      );
    } finally {
      setPatientSummaryLoading(false);
    }
  }, [patientViewId, token]);

  const handleOpenPatientSummaryModal = useCallback(() => {
    setPatientSummaryModalOpen(true);
    loadPatientSummary();
  }, [loadPatientSummary]);

  const handleClosePatientSummaryModal = useCallback(() => {
    setPatientSummaryModalOpen(false);
  }, []);

  const handleConsultationStatusUpdate = useCallback(
    async (
      appointmentId: number,
      nextStatus: "completed" | "incomplete",
      options?: { paymentMethod?: "cash" | "transfer_card"; chargedAmount?: number }
    ) => {
      if (!token) return;
      try {
        setConsultationStatusUpdating(appointmentId);
        setConsultationStatusMessage(null);

        const payload: {
          status: "completed" | "incomplete";
          paymentMethod?: string;
          chargedAmount?: number;
        } = { status: nextStatus };

        if (options?.paymentMethod) {
          payload.paymentMethod = options.paymentMethod;
        }
        if (
          typeof options?.chargedAmount === "number" &&
          !Number.isNaN(options.chargedAmount)
        ) {
          payload.chargedAmount = options.chargedAmount;
        }

        const res = await fetch(
          buildApiUrl(`/api/appointments/${appointmentId}/status`),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(
            errJson?.error ||
              "No pudimos actualizar el estado de la consulta. Probá nuevamente."
          );
        }

        const json = await res.json();
        setPatientViewData((prev) =>
          prev
            ? {
                ...prev,
                consultations: prev.consultations.map((c) =>
                  c.id === appointmentId
                    ? {
                        ...c,
                        status: json.status,
                        price: json.price ?? c.price,
                        paid: json.paid ?? c.paid,
                        paymentMethod: json.paymentMethod ?? null,
                        chargedAmount:
                          typeof json.chargedAmount === "number"
                            ? json.chargedAmount
                            : null,
                      }
                    : c
                ),
              }
            : prev
        );

        setConsultationFormState((prev) => ({
          ...prev,
          [appointmentId]: {
            paymentMethod:
              (json.paymentMethod as "cash" | "transfer_card" | "") || "",
            chargedAmount:
              typeof json.chargedAmount === "number"
                ? String(json.chargedAmount)
                : "",
          },
        }));

        setConsultationStatusMessage(
          nextStatus === "completed"
            ? "Consulta marcada como finalizada."
            : "Consulta marcada como incompleta."
        );
      } catch (err: any) {
        console.error("Error al actualizar estado de consulta:", err);
        setConsultationStatusMessage(
          err?.message ||
            "No pudimos actualizar el estado de la consulta. Probá nuevamente."
        );
      } finally {
        setConsultationStatusUpdating(null);
      }
    },
    [token]
  );

  const fetchPatientNotes = useCallback(async () => {
    if (!token || !patientViewId) return;
    try {
      setPatientNotesLoading(true);
      setPatientNotesError(null);
      const res = await fetch(
        buildApiUrl(`/api/patients/${patientViewId}/notes`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.error || "No pudimos cargar las notas del paciente."
        );
      }
      const json = await res.json();
      setPatientNotes(json?.notes || []);
    } catch (err: any) {
      console.error("Error al cargar notas del paciente:", err);
      setPatientNotesError(
        err?.message || "Error desconocido al cargar las notas."
      );
    } finally {
      setPatientNotesLoading(false);
    }
  }, [patientViewId, token]);

  const handleOpenPatientNotesModal = useCallback(() => {
    setPatientNotesModalOpen(true);
    fetchPatientNotes();
  }, [fetchPatientNotes]);

  const handleClosePatientNotesModal = useCallback(() => {
    setPatientNotesModalOpen(false);
  }, []);

  const handleOpenAddNoteModal = useCallback(() => {
    setAddNoteModalOpen(true);
    setAddNoteContent("");
    setAddNoteError(null);
    setAddNoteSuccess(null);
  }, []);

  const handleAddPatientNote = useCallback(async () => {
    if (!token || !patientViewId) return;
    const trimmed = addNoteContent.trim();
    if (!trimmed) {
      setAddNoteError("Escribí una nota antes de guardar.");
      return;
    }
    try {
      setAddNoteLoading(true);
      setAddNoteError(null);
      const res = await fetch(
        buildApiUrl(`/api/patients/${patientViewId}/notes`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: trimmed }),
        }
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.error || "No pudimos guardar la nota. Probá nuevamente."
        );
      }
      const json = await res.json();
      const created: PatientNote = json.note;
      setAddNoteSuccess("Nota guardada correctamente.");
      setAddNoteContent("");
      if (patientNotesModalOpen) {
        setPatientNotes((prev) => [created, ...prev]);
      }
    } catch (err: any) {
      console.error("Error al guardar nota:", err);
      setAddNoteError(err?.message || "No pudimos guardar la nota.");
    } finally {
      setAddNoteLoading(false);
    }
  }, [addNoteContent, patientViewId, patientNotesModalOpen, token]);

  const handleOpenPatientFromInbox = useCallback(
    (patientId: number) => {
      handleOpenPatientDetail(patientId);
      setNotificationsOpen(false);
    },
    [handleOpenPatientDetail, setNotificationsOpen]
  );

  const handleOpenAppointmentFromInbox = useCallback(
    (appointment: InboxAppointment) => {
      if (appointment?.dateTimeISO) {
        const target = new Date(appointment.dateTimeISO);
        if (!Number.isNaN(target.getTime())) {
          setCalendarWeekStart(startOfWeek(target));
        }
      }
      setActiveSection("agenda");
      setNotificationsOpen(false);
    },
    [setActiveSection, setCalendarWeekStart, setNotificationsOpen]
  );

  const handleClosePatientDetail = () => {
    setPatientViewId(null);
    setPatientViewData(null);
    setPatientViewError(null);
    setPatientViewLoading(false);
    setProfileEditorOpen(false);
    setProfileSaveSuccess(null);
    setProfileSaveError(null);
  };

  const handleOpenClinicalHistory = useCallback(() => {
    if (!patientViewData) return;
    setClinicalHistorySnapshot(patientViewData);
    setActiveSection("history");
  }, [patientViewData, setActiveSection]);

  const handleDownloadClinicalHistory = useCallback(
    async (options?: {
      snapshot?: PatientDetail | null;
    }): Promise<ClinicalHistoryDownloadResult> => {
      if (!token) {
        return {
          success: false,
          usedFallback: false,
          errorMessage: "Necesitás iniciar sesión para descargar la historia clínica.",
        };
      }

      const snapshot = options?.snapshot ?? clinicalHistorySnapshot;
      if (!snapshot) {
        return {
          success: false,
          usedFallback: false,
          errorMessage: "Seleccioná un paciente para descargar su historia clínica.",
        };
      }

      const patientName =
        snapshot.patient.fullName?.trim() ||
        `${contactLabels.singularCapitalized} sin nombre`;
      const fallbackNarrative = () =>
        buildClinicalHistoryNarrative(
          snapshot,
          contactLabels,
          doctor?.name ?? null
        );
      const triggerDownload = (documentText: string) => {
        const pdfBlob = createPdfFromText(documentText);
        const url = window.URL.createObjectURL(pdfBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `historia-clinica-${(patientName || "paciente")
          .toLowerCase()
          .replace(/\s+/g, "-")}-${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      };

      try {
        setClinicalHistoryDownloading(true);
        const res = await fetch(
          buildApiUrl(
            `/api/patients/${snapshot.patient.id}/history/narrative`
          ),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(
            errJson?.error || "No pudimos generar la historia clínica con IA."
          );
        }
        const json = await res.json().catch(() => null);
        const serverNarrative =
          typeof json?.narrative === "string" && json.narrative.trim()
            ? json.narrative.trim()
            : null;
        const generatedAtIso =
          typeof json?.generatedAt === "string" ? json.generatedAt : null;
        const finalNarrative = serverNarrative || fallbackNarrative();
        const documentText = buildClinicalHistoryDocumentText(
          snapshot,
          contactLabels,
          doctor?.name ?? null,
          finalNarrative,
          generatedAtIso
        );
        triggerDownload(documentText);
        setNotification({
          type: serverNarrative ? "success" : "error",
          message: serverNarrative
            ? "Generamos la historia clínica con IA."
            : "No pudimos usar la IA, descargaste la versión estándar.",
        });
        return {
          success: true,
          usedFallback: !serverNarrative,
          errorMessage: null,
        };
      } catch (error: any) {
        console.error("Error al generar la historia clínica:", error);
        const fallbackText = buildClinicalHistoryDocumentText(
          snapshot,
          contactLabels,
          doctor?.name ?? null,
          fallbackNarrative(),
          null
        );
        triggerDownload(fallbackText);
        const message =
          error?.message ||
          "No pudimos generar la historia clínica con IA. Descargaste la versión estándar.";
        setNotification({
          type: "error",
          message,
        });
        return {
          success: true,
          usedFallback: true,
          errorMessage: message,
        };
      } finally {
        setClinicalHistoryDownloading(false);
      }
    },
    [
      token,
      clinicalHistorySnapshot,
      contactLabels,
      doctor?.name,
      setNotification,
    ]
  );

  const automationDownloadClinicalHistory = useCallback(
    async ({
      snapshot,
      patientName,
    }: {
      snapshot: PatientDetail;
      patientName: string;
    }) => {
      const displayName = patientName?.trim() || "el paciente";
      pushAutomationMessage(
        "assistant",
        `Generando la historia clínica de ${displayName}...`
      );
      const result = await handleDownloadClinicalHistory({ snapshot });
      if (result.success) {
        const suffix = result.usedFallback
          ? " No pudimos usar la IA, descargaste la versión estándar."
          : " Ya podés revisar el PDF con la narrativa IA.";
        pushAutomationMessage(
          "assistant",
          `Listo, descargué la historia clínica de ${displayName}.${suffix}`
        );
      } else {
        pushAutomationMessage(
          "assistant",
          `No pude descargar la historia clínica: ${
            result.errorMessage || "probá hacerlo desde la ficha."
          }`
        );
      }
    },
    [handleDownloadClinicalHistory, pushAutomationMessage]
  );

  useEffect(() => {
    if (
      !automationHistoryIntent ||
      automationHistoryIntent.action !== "download_history"
    ) {
      return;
    }
    if (!patientViewData) return;
    if (patientViewData.patient.id !== automationHistoryIntent.patientId) {
      return;
    }
    const snapshot = patientViewData;
    setClinicalHistorySnapshot(snapshot);
    setActiveSection("history");
    automationDownloadClinicalHistory({
      snapshot,
      patientName: automationHistoryIntent.patientName,
    });
    setAutomationHistoryIntent(null);
  }, [
    automationHistoryIntent,
    patientViewData,
    automationDownloadClinicalHistory,
    setActiveSection,
  ]);
  const renderPatientDetailSectionByBusiness = () => {
    const handleConsultationStatusUpdateLoose = (
      consultationId: number,
      status: string,
      extra?: { paymentMethod?: "cash" | "transfer_card"; chargedAmount?: number }
    ) =>
      handleConsultationStatusUpdate(
        consultationId,
        status === "completed" ? "completed" : "incomplete",
        extra
      );

    if (!patientViewData) return null;
    if (isMedicalDoctor) {
      return (
        <ClientsHealthView
          patientViewData={patientViewData as any}
          contactLabels={contactLabels}
          formatPatientBirthDate={formatPatientBirthDate}
          getPatientTagBadgeClass={getPatientTagBadgeClass}
          handleRemovePatientTag={handleRemovePatientTag}
          tagRemovingId={tagRemovingId}
          handleOpenTagModal={handleOpenTagModal}
          consultationStatusMessage={consultationStatusMessage}
          openConsultations={openConsultations}
          consultationFormState={consultationFormState}
          consultationStatusUpdating={consultationStatusUpdating}
          toggleConsultationCard={toggleConsultationCard}
          handleConsultationStatusUpdate={handleConsultationStatusUpdateLoose}
          setConsultationStatusMessage={setConsultationStatusMessage}
        />
      );
    }
    return (
      <ClientsRetailView
        patientViewData={patientViewData as any}
        contactLabels={contactLabels}
        onAddTag={handleOpenTagModal}
        onRemoveTag={handleRemovePatientTag}
        removingTagId={tagRemovingId}
      />
    );
  };

  const handleOpenPatientChat = (
    patientId: number,
    options?: { stayOnSection?: boolean }
  ) => {
    setSelectedPatientId(patientId);
    setSendError(null);
    setSendSuccess(null);
    if (!options?.stayOnSection) {
      setActiveSection("dashboard");
    }
  };

  const handleOpenQuickChat = (patientId: number) => {
    handleOpenPatientChat(patientId, { stayOnSection: true });
    setQuickChatModalOpen(true);
  };

  const handleCloseQuickChat = () => {
    setQuickChatModalOpen(false);
  };

  const handleOpenTagModal = useCallback(
    (patientId: number) => {
      setTagModalPatientId(patientId);
      setTagFormLabel("");
      setTagFormSeverity("high");
      setTagFormError(null);
      setTagModalOpen(true);
    },
    []
  );

  const handleCloseTagModal = useCallback(() => {
    if (tagSaving) return;
    setTagModalOpen(false);
    setTagModalPatientId(null);
    setTagFormLabel("");
    setTagFormSeverity("high");
    setTagFormError(null);
  }, [tagSaving]);

  const handleSavePatientTag = useCallback(async () => {
    if (!token || !tagModalPatientId) return;
    const trimmed = tagFormLabel.trim();
    if (trimmed.length < 2) {
      setTagFormError("Ingresá al menos 2 caracteres.");
      return;
    }
    try {
      setTagSaving(true);
      setTagFormError(null);
      await createPatientTag({
        patientId: tagModalPatientId,
        label: trimmed,
        severity: tagFormSeverity,
      });
      setTagModalOpen(false);
      setTagModalPatientId(null);
      setTagFormLabel("");
      setTagFormSeverity("high");
    } catch (err: any) {
      console.error("Error al guardar etiqueta:", err);
      setTagFormError(
        err?.message || "No pudimos guardar la etiqueta. Intentá nuevamente."
      );
    } finally {
      setTagSaving(false);
    }
  }, [
    tagModalPatientId,
    tagFormLabel,
    tagFormSeverity,
    createPatientTag,
  ]);

  const handleRemovePatientTag = useCallback(
    async (patientId: number, tagId: number) => {
      if (!token) return;
      try {
        setTagRemovingId(tagId);
        const res = await fetch(
          buildApiUrl(`/api/patients/${patientId}/tags/${tagId}`),
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(
            errJson?.error ||
              "No pudimos eliminar la etiqueta. Intentá nuevamente."
          );
        }
        applyTagUpdateToState(patientId, (current) =>
          current.filter((tag) => tag.id !== tagId)
        );
        fetchPatientSegments({ silent: true });
      } catch (err) {
        console.error("Error al eliminar etiqueta:", err);
      } finally {
        setTagRemovingId(null);
      }
    },
    [token, applyTagUpdateToState, fetchPatientSegments]
  );

  const handleCloseRescheduleModal = useCallback(() => {
    setRescheduleModalAppointment(null);
    setRescheduleSelectedSlot(null);
    setRescheduleReason("");
    setRescheduleSlots([]);
    setRescheduleSlotsError(null);
    setRescheduleSubmitError(null);
  }, []);

  const handleRescheduleSubmit = useCallback(async () => {
    if (!token || !rescheduleModalAppointment || !rescheduleSelectedSlot) {
      setRescheduleSubmitError("Seleccioná un horario antes de continuar.");
      return;
    }
    try {
      setRescheduleSubmitting(true);
      setRescheduleSubmitError(null);
      const res = await fetch(
        buildApiUrl(`/api/appointments/${rescheduleModalAppointment.id}/reschedule`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dateTimeISO: rescheduleSelectedSlot,
            reason: rescheduleReason.trim() || undefined,
          }),
        }
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.error || "No pudimos reprogramar el turno."
        );
      }
      const newLabel = new Date(rescheduleSelectedSlot).toLocaleString(
        "es-AR",
        { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }
      );
      setNotification({
        type: "success",
        message: `Turno reprogramado para ${newLabel}.`,
      });
      setTimeout(() => setNotification(null), 5000);
      handleCloseRescheduleModal();
      fetchCalendarAppointments({ silent: true });
      fetchDashboardSummary({ silent: true });
      fetchPatients({ silent: true });
      if (
        rescheduleModalAppointment.patient.id &&
        patientViewId === rescheduleModalAppointment.patient.id
      ) {
        setPatientViewRequestId((prev) => prev + 1);
      }
    } catch (err: any) {
      console.error("Error reprogramando turno:", err);
      setRescheduleSubmitError(
        err?.message || "No pudimos reprogramar el turno."
      );
    } finally {
      setRescheduleSubmitting(false);
    }
  }, [
    token,
    rescheduleModalAppointment,
    rescheduleSelectedSlot,
    rescheduleReason,
    fetchCalendarAppointments,
    fetchDashboardSummary,
    fetchPatients,
    handleCloseRescheduleModal,
    patientViewId,
  ]);

  useEffect(() => {
    if (
      !automationRescheduleIntent ||
      !rescheduleModalAppointment ||
      automationRescheduleIntent.appointmentId !== rescheduleModalAppointment.id
    ) {
      return;
    }

    if (
      automationRescheduleIntent.reason &&
      !rescheduleReason.trim()
    ) {
      setRescheduleReason(automationRescheduleIntent.reason);
    }

    if (
      automationRescheduleIntent.targetDate &&
      !automationRescheduleIntent.slotApplied &&
      rescheduleSlots.length > 0
    ) {
      const targetTime = automationRescheduleIntent.targetDate.getTime();
      const matchingSlot = rescheduleSlots.find((slot) => {
        const slotDate = new Date(slot.startISO);
        return Math.abs(slotDate.getTime() - targetTime) < 60 * 1000;
      });

      if (matchingSlot) {
        setRescheduleSelectedSlot(matchingSlot.startISO);
        if (!automationRescheduleIntent.feedbackSent) {
          pushAutomationMessage(
            "assistant",
            `Seleccioné automáticamente el horario ${matchingSlot.humanLabel}.`
          );
        }
        setAutomationRescheduleIntent((prev) =>
          prev
            ? {
                ...prev,
                slotApplied: true,
                feedbackSent: true,
              }
            : prev
        );
      } else {
        if (!automationRescheduleIntent.feedbackSent) {
          pushAutomationMessage(
            "assistant",
            "No encontré disponibilidad exacta para ese horario. Revisá las opciones sugeridas en el modal."
          );
        }
        setAutomationRescheduleIntent((prev) =>
          prev
            ? {
                ...prev,
                slotApplied: true,
                feedbackSent: true,
              }
            : prev
        );
      }
    }
  }, [
    automationRescheduleIntent,
    rescheduleModalAppointment,
    rescheduleReason,
    rescheduleSlots,
    pushAutomationMessage,
  ]);

  useEffect(() => {
    if (!rescheduleModalAppointment && automationRescheduleIntent) {
      setAutomationRescheduleIntent(null);
    }
  }, [rescheduleModalAppointment, automationRescheduleIntent]);

  const handleDisconnectWhatsapp = async () => {
    if (!token || whatsappLoading) return;
    setWhatsappLoading(true);
    setWhatsappError(null);

    try {
      const res = await fetch(buildApiUrl("/api/me/whatsapp/connect"), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.error ||
            "No pudimos desconectar WhatsApp. Probá nuevamente."
        );
      }

      const json = await res.json();
      setWhatsappConnection(mapWhatsappPayload(json));
      setShowDisconnectModal(false);
      setNotification({
        type: "success",
        message: "WhatsApp desconectado.",
      });
      setTimeout(() => {
        setNotification(null);
      }, 4000);
    } catch (err: any) {
      console.error("Error al desconectar WhatsApp:", err);
      const message =
        err?.message || "No pudimos desconectar WhatsApp. Probá nuevamente.";
      setWhatsappError(message);
      setNotification({
        type: "error",
        message,
      });
      setTimeout(() => {
        setNotification(null);
      }, 5000);
    } finally {
      setWhatsappLoading(false);
      fetchWhatsappStatus();
    }
  };

  // 9) Perfil: handlers del formulario (solo front por ahora)
  const handleProfileChange = (e: any) => {
    const { name, value } = e.target as { name: string; value: string };
    setProfileForm((prev) => {
      const next = {
        ...prev,
        [name]: value,
      };

      if (
        name === "officeHoursMorningStart" ||
        name === "officeHoursMorningEnd" ||
        name === "officeHoursAfternoonStart" ||
        name === "officeHoursAfternoonEnd" ||
        name === "officeHoursFullDayStart" ||
        name === "officeHoursFullDayEnd"
      ) {
        const summary = buildOfficeHoursSummary(next);
        next.officeHours = summary || prev.officeHours || "";
      }

      return next;
    });
  };

  const handleToggleFullDaySchedule = (checked: boolean) => {
    setProfileForm((prev) => {
      const next = {
        ...prev,
        worksFullDay: checked,
      };

      if (checked) {
        if (!next.officeHoursFullDayStart) {
          next.officeHoursFullDayStart =
            prev.officeHoursFullDayStart ||
            prev.officeHoursMorningStart ||
            prev.officeHoursAfternoonStart ||
            "";
        }
        if (!next.officeHoursFullDayEnd) {
          next.officeHoursFullDayEnd =
            prev.officeHoursFullDayEnd ||
            prev.officeHoursAfternoonEnd ||
            prev.officeHoursMorningEnd ||
            "";
        }
      } else {
        next.officeHoursFullDayStart = "";
        next.officeHoursFullDayEnd = "";
      }

      return next;
    });
  };

  const handleToggleOfficeDay = (dayKey: string) => {
    setProfileForm((prev) => {
      const hasDay = prev.officeDaysSelection.includes(dayKey);
      const nextSelection = hasDay
        ? prev.officeDaysSelection.filter((d) => d !== dayKey)
        : [...prev.officeDaysSelection, dayKey];

      return {
        ...prev,
        officeDaysSelection: nextSelection,
        officeDays:
          nextSelection.length > 0
            ? buildOfficeDaysSummaryFromKeys(nextSelection)
            : "",
      };
    });
  };

  const handleCalendarPrevWeek = () => {
    setCalendarWeekStart((prev) => addDays(prev, -7));
  };

  const handleCalendarNextWeek = () => {
    setCalendarWeekStart((prev) => addDays(prev, 7));
  };

  const handleCalendarToday = () => {
    setCalendarWeekStart(startOfWeek(new Date()));
  };

  
  
  
  
  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !doctor) {
      setNotification({
        type: "error",
        message: "Necesitás iniciar sesión para guardar el perfil.",
      });
      setTimeout(() => {
        setNotification(null);
      }, 5000);
      return;
    }

    const parsePriceInput = (value: string) => {
      if (!value?.trim()) return null;
      const numeric = Number(
        value
          .replace(/[^\d.,]/g, "")
          .replace(",", ".")
      );
      return Number.isFinite(numeric) ? numeric : null;
    };

    const slotIntervalMinutes =
      doctor.businessType === "HEALTH" &&
      SLOT_INTERVAL_OPTIONS.includes(profileForm.slotInterval)
        ? Number(profileForm.slotInterval)
        : null;

    try {
      const officeHoursSummary = buildOfficeHoursSummary(profileForm);
      const payload = {
        specialty: profileForm.specialty || null,
        clinicName: profileForm.clinicName || null,
        officeDays: profileForm.officeDays || null,
        officeHours:
          officeHoursSummary || profileForm.officeHours || null,
        officeAddress: profileForm.clinicAddress || null,
        contactPhone: profileForm.contactPhone || null,
        consultationPrice: parsePriceInput(profileForm.consultFee),
        emergencyConsultationPrice: parsePriceInput(profileForm.emergencyFee),
        bio: profileForm.extraNotes || null,
        appointmentSlotMinutes: slotIntervalMinutes,
        availabilityStatus,
      };

      const res = await fetch(
        buildApiUrl("/api/me/profile"),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Error al guardar el perfil");
      }

      await res.json();
      updateDoctorState((prev) => ({
        ...prev,
        availabilityStatus,
      }));
      const persistedSummary = officeHoursSummary || profileForm.officeHours || "";
      if (persistedSummary !== profileForm.officeHours) {
        setProfileForm((prev) => ({
          ...prev,
          officeHours: persistedSummary,
        }));
      }

      setNotification({
        type: "success",
        message: "Perfil guardado correctamente ✅",
      });

      setTimeout(() => {
        setNotification(null);
      }, 4000);
    } catch (err: any) {
      console.error("Error al guardar perfil:", err);
      setNotification({
        type: "error",
        message:
          err?.message ||
          "Hubo un problema al guardar el perfil. Probá de nuevo.",
      });

      setTimeout(() => {
        setNotification(null);
      }, 5000);
    }
  };

  const handleProfileImageInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!token || !doctor) return;
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      setProfileImageError("Formato no soportado. Subí PNG, JPG o WebP.");
      if (profileImageInputRef.current) {
        profileImageInputRef.current.value = "";
      }
      return;
    }
    if (file.size > MAX_UPLOAD_IMAGE_SIZE) {
      setProfileImageError("La imagen supera los 2 MB permitidos.");
      if (profileImageInputRef.current) {
        profileImageInputRef.current.value = "";
      }
      return;
    }

    try {
      setProfileImageUploading(true);
      setProfileImageError(null);
      setProfileImageMessage(null);

      const imageBase64 = await fileToDataUrl(file);
      const res = await fetch(buildApiUrl("/api/me/profile/photo"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ imageBase64 }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          json?.error || "No pudimos actualizar la foto de perfil."
        );
      }

      const newUrl = json?.profileImageUrl ?? null;
      updateDoctorState((prev) => ({
        ...prev,
        profileImageUrl: newUrl,
      }));
      setProfileImageMessage("Actualizamos tu foto de perfil ✅");
      window.setTimeout(() => setProfileImageMessage(null), 4000);
    } catch (err: any) {
      console.error("Error al actualizar foto de perfil:", err);
      setProfileImageError(
        err?.message || "No pudimos actualizar la foto. Probá de nuevo."
      );
    } finally {
      setProfileImageUploading(false);
      if (profileImageInputRef.current) {
        profileImageInputRef.current.value = "";
      }
    }
  };

  const handleLogoInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!token || !doctor) return;
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      setLogoError("Formato no soportado. Subí PNG, JPG o WebP.");
      if (logoInputRef.current) logoInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_IMAGE_SIZE) {
      setLogoError("La imagen supera los 2 MB permitidos.");
      if (logoInputRef.current) logoInputRef.current.value = "";
      return;
    }

    try {
      setLogoUploading(true);
      setLogoError(null);
      setLogoMessage(null);
      const imageBase64 = await fileToDataUrl(file);
      const res = await fetch(buildApiUrl("/api/me/profile/ticket-logo"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ imageBase64 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "No pudimos guardar el logo.");
      }
      const newUrl = json?.ticketLogoUrl ?? null;
      updateDoctorState((prev) => ({
        ...prev,
        ticketLogoUrl: newUrl,
      }));
      setLogoMessage("Logo actualizado para las boletas ✅");
      window.setTimeout(() => setLogoMessage(null), 4000);
    } catch (err: any) {
      console.error("Error al subir logo:", err);
      setLogoError(err?.message || "No pudimos guardar el logo. Probá de nuevo.");
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = "";
      }
    }
  };

  const handleRemoveLogo = async () => {
    if (!token || !doctor?.ticketLogoUrl) return;
    try {
      setLogoUploading(true);
      setLogoError(null);
      setLogoMessage(null);
      const res = await fetch(buildApiUrl("/api/me/profile/ticket-logo"), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "No pudimos eliminar el logo.");
      }
      updateDoctorState((prev) => ({
        ...prev,
        ticketLogoUrl: null,
      }));
      setLogoMessage("Logo eliminado.");
      window.setTimeout(() => setLogoMessage(null), 4000);
    } catch (err: any) {
      console.error("Error al eliminar logo:", err);
      setLogoError(err?.message || "No pudimos eliminar el logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveProfileImage = async () => {
    if (!token || !doctor) return;
    if (!doctor.profileImageUrl) return;
    try {
      setProfileImageUploading(true);
      setProfileImageError(null);
      setProfileImageMessage(null);

      const res = await fetch(buildApiUrl("/api/me/profile/photo"), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          json?.error || "No pudimos eliminar la foto de perfil."
        );
      }

      updateDoctorState((prev) => ({
        ...prev,
        profileImageUrl: null,
      }));
      setProfileImageMessage("Eliminamos tu foto de perfil.");
      window.setTimeout(() => setProfileImageMessage(null), 4000);
    } catch (err: any) {
      console.error("Error al eliminar foto de perfil:", err);
      setProfileImageError(
        err?.message || "No pudimos eliminar la foto. Probá nuevamente."
      );
    } finally {
      setProfileImageUploading(false);
    }
  };

  const themeWrapperClass =
    themeMode === "dark"
      ? "min-h-screen flex dark-dashboard"
      : "min-h-screen flex dark-dashboard theme-inverted";

  // Si NO estoy autenticado, muestro la pantalla de login/registro
  if (!token || !doctor) {
    return (
      <div className={`${themeWrapperClass} items-center justify-center px-4`}>
        <AuthScreen onAuthSuccess={handleAuthSuccess} />
      </div>
    );
  }

  const selectedPatient =
    patients.find((p) => p.id === selectedPatientId) || null;
  const clinicalHistoryPatient = clinicalHistorySnapshot?.patient ?? null;
  const clinicalHistoryConsultations =
    clinicalHistorySnapshot?.consultations ?? [];
  const sidebarProps = {
    activeSection,
    onChangeSection: handleSidebarSectionChange,
    doctorName: doctor.name,
    businessLabel: businessInfo.label,
    businessShort: businessInfo.short,
    contactPluralLabel: contactLabels.plural,
    sections: sidebarSections,
    whatsappStatus: whatsappConnection.status,
    whatsappNumber: prettyWhatsappNumber(whatsappConnection.businessNumber),
    whatsappLoading,
    whatsappError,
    onRequestConnect: handleOpenConnectModal,
    onRequestDisconnect: handleRequestDisconnect,
    onLogout: handleLogout,
  };

  const officeHoursPreview = buildOfficeHoursSummary(profileForm);
  const usingExistingAppointmentPatient = Boolean(
    createAppointmentForm.patientId
  );
  const retailDashboardStats = data?.retailStats ?? null;
  const pendingOrdersToday = data?.pendingOrdersToday ?? [];

  // Si hay token + doctor → muestro el dashboard / secciones
return (
    <div className={themeWrapperClass}>
      {/* Notificación flotante */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`px-4 py-3 rounded-xl text-xs flex items-start gap-2 ${
              notification.type === "success"
                ? "bg-[#112923] border border-[#1e4d43] text-[#9ff7dc]"
                : "bg-[#2b1217] border border-[#5c1d28] text-[#ffc9d2]"
            }`}
          >
            <div className="mt-0.5">
              <span className="font-semibold block mb-0.5">
                {notification.type === "success"
                  ? "Cambios guardados"
                  : "Ocurrió un error"}
              </span>
              <span className="opacity-80">{notification.message}</span>
            </div>
            <button
              className="ml-2 text-[10px] uppercase tracking-wide opacity-60 hover:opacity-100"
              onClick={() => setNotification(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
      {promotionSendModalId !== null && (
        <Modal
          onClose={() => {
            if (promotionSendingId) return;
            setPromotionSendModalId(null);
          }}
          contentClassName="max-w-2xl"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Enviar promoción por WhatsApp
                </h3>
                <p className="text-sm text-slate-500">
                  Editá el texto y lo enviamos a tus clientes con teléfono registrado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPromotionSendModalId(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <textarea
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm h-32 focus:outline-none focus:ring-2 focus:ring-slate-200"
              value={promotionSendMessage}
              onChange={(e) => setPromotionSendMessage(e.target.value)}
              placeholder="Texto de la promo a enviar..."
              disabled={Boolean(promotionSendingId)}
            />
            <div className="flex items-center justify-end gap-2 text-sm">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPromotionSendModalId(null)}
                disabled={Boolean(promotionSendingId)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm disabled:opacity-60"
                onClick={handleSendPromotion}
                disabled={Boolean(promotionSendingId)}
              >
                {promotionSendingId ? "Enviando..." : "Enviar promo"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      <Sidebar {...sidebarProps} className="hidden md:flex" />

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="flex-1 bg-black/60 backdrop-blur-[1px]"
            onClick={closeMobileSidebar}
            aria-hidden="true"
          ></div>
          <div className="relative h-full w-64 max-w-[80%] shadow-2xl">
            <Sidebar
              {...sidebarProps}
              className="flex md:hidden h-full w-full"
            />
            <button
              type="button"
              onClick={closeMobileSidebar}
              className="absolute top-3 right-3 text-white/70 hover:text-white"
              aria-label="Cerrar menú"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Columna principal */}
      <div className="flex-1 flex flex-col">
        {/* Barra superior */}
        <Topbar
          doctor={doctor}
          businessLabel={businessInfo.label}
          onGoToProfile={() => setActiveSection("profile")}
          avatarUrl={doctorAvatarUrl}
          themeMode={themeMode}
          onToggleTheme={handleToggleTheme}
          notificationsCount={inboxTotalCount}
          notificationsOpen={notificationsOpen}
          onToggleNotifications={handleToggleNotifications}
          notificationsButtonRef={notificationsButtonRef}
          onToggleSidebar={toggleMobileSidebar}
        />

        {notificationsOpen && (
          <div className="fixed inset-0 z-40">
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
              onClick={handleCloseNotifications}
            ></div>
            <div
              ref={notificationsPanelRef}
              className="absolute right-4 md:right-8 top-20 w-[calc(100%-2rem)] max-w-md rounded-3xl card-surface text-sm p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-white">
                    Pendientes
                  </p>
                  <p className="text-xs text-muted">
                    Documentos, turnos y fichas que necesitan tu atención.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchInboxData({ silent: true })}
                    className="text-[11px] px-3 py-1 rounded-full border border-white/10 text-muted hover:text-white hover:border-transparent hover:bg-[linear-gradient(90deg,_rgba(1,46,221,0.83)_0%,_rgb(54,95,255)_100%)]"
                  >
                    Actualizar
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseNotifications}
                    className="text-[11px] text-muted hover:text-white"
                  >
                    Cerrar
                  </button>
                </div>
              </div>

              {inboxLoading && (
                <div className="text-xs text-muted">
                  Actualizando pendientes...
                </div>
              )}

              {inboxError && (
                <div className="text-xs text-rose-200 bg-rose-500/10 border border-rose-500/40 rounded-2xl px-3 py-2">
                  {inboxError}
                </div>
              )}

              {!inboxLoading && inboxTotalCount === 0 && !inboxError && (
                <div className="text-xs text-muted border border-dashed border-white/15 rounded-2xl px-4 py-6 text-center">
                  No tenés pendientes nuevos. Todo al día ✨
                </div>
              )}

              <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
                {!isRetailBusiness ? (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted">
                            Estudios sin revisar
                          </p>
                          <p className="text-sm font-semibold text-white">
                            {inboxCounts.documents} pendiente
                            {inboxCounts.documents === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      {inboxCounts.documents === 0 ? (
                        <p className="text-xs text-muted">
                          No hay archivos en espera.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {inboxData.documents.map((doc) => (
                            <div
                              key={`inbox-doc-${doc.id}`}
                              className="rounded-2xl border border-white/10 p-3 flex flex-col gap-2"
                            >
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {doc.patientName}
                                </p>
                                <p className="text-xs text-muted">
                                  {doc.caption?.trim() || "Archivo enviado"} ·{" "}
                                  {formatDocumentTimestamp(doc.createdAt)}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => handleInboxDocumentOpen(doc.id)}
                                  className="btn btn-primary btn-sm"
                                >
                                  Ver
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMarkDocumentReviewed(doc.id)}
                                  className="btn btn-outline btn-sm"
                                >
                                  Marcar revisado
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted">
                            Turnos nuevos
                          </p>
                          <p className="text-sm font-semibold text-white">
                            {inboxCounts.newAppointments} turno
                            {inboxCounts.newAppointments === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      {inboxCounts.newAppointments === 0 ? (
                        <p className="text-xs text-muted">
                          No registramos turnos recientes.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {inboxData.newAppointments.map((appt) => (
                            <div
                              key={`inbox-appt-${appt.id}`}
                              className="rounded-2xl border border-white/10 p-3 flex flex-col gap-2"
                            >
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {appt.patientName}
                                </p>
                                <p className="text-xs text-muted">
                                  {formatDocumentTimestamp(appt.dateTimeISO)} ·{" "}
                                  {appt.type || "Consulta"}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => handleOpenAppointmentFromInbox(appt)}
                                  className="btn btn-primary btn-sm"
                                >
                                  Ver en agenda
                                </button>
                                {appt.patientId && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenPatientFromInbox(appt.patientId!)
                                    }
                                    className="btn btn-outline btn-sm"
                                  >
                                    Abrir ficha
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted">
                            Fichas incompletas
                          </p>
                          <p className="text-sm font-semibold text-white">
                            {inboxCounts.incompletePatients} pendiente
                            {inboxCounts.incompletePatients === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      {inboxCounts.incompletePatients === 0 ? (
                        <p className="text-xs text-muted">
                          Todos los registros están completos.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {inboxData.incompletePatients.map((patient) => (
                            <div
                              key={`inbox-patient-${patient.id}`}
                              className="rounded-2xl border border-white/10 p-3 flex flex-col gap-2"
                            >
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {patient.fullName || "Paciente sin nombre"}
                                </p>
                                {patient.createdAt && (
                                  <p className="text-xs text-muted">
                                    Registrado el {formatDocumentTimestamp(patient.createdAt)}
                                  </p>
                                )}
                              </div>
                              {patient.missingFields.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {patient.missingFields.map((field) => (
                                    <span
                                      key={`${patient.id}-${field}`}
                                      className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-100"
                                    >
                                      {field}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => handleOpenPatientFromInbox(patient.id)}
                                  className="btn btn-primary btn-sm"
                                >
                                  Completar ficha
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted">
                            Pedidos nuevos
                          </p>
                          <p className="text-sm font-semibold text-white">
                            {inboxCounts.newOrders} pendiente
                            {inboxCounts.newOrders === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      {inboxCounts.newOrders === 0 ? (
                        <p className="text-xs text-muted">No hay pedidos nuevos.</p>
                      ) : (
                        <div className="space-y-2">
                          {(inboxData.newOrders || []).map((ord) => (
                            <div
                              key={`inbox-ord-${ord.id}`}
                              className="rounded-2xl border border-white/10 p-3 flex flex-col gap-2"
                            >
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  #{ord.sequenceNumber} · {ord.customerName || "Cliente WhatsApp"}
                                </p>
                                <p className="text-xs text-muted">
                                  {formatDocumentTimestamp(ord.createdAt)} · $
                                  {ord.totalAmount.toLocaleString("es-AR")}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveSection("orders");
                                    setOrderModalId(ord.id);
                                    setNotificationsOpen(false);
                                  }}
                                  className="btn btn-primary btn-sm"
                                >
                                  Revisar pedido
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted">
                            Clientes nuevos
                          </p>
                          <p className="text-sm font-semibold text-white">
                            {inboxCounts.newClients} cliente
                            {inboxCounts.newClients === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      {inboxCounts.newClients === 0 ? (
                        <p className="text-xs text-muted">Sin clientes recientes.</p>
                      ) : (
                        <div className="space-y-2">
                          {(inboxData.newClients || []).map((client) => (
                            <div
                              key={`inbox-client-${client.id}`}
                              className="rounded-2xl border border-white/10 p-3 flex flex-col gap-2"
                            >
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {client.fullName}
                                </p>
                                <p className="text-xs text-muted">
                                  {client.phone || "Sin teléfono"}{" "}
                                  {client.createdAt
                                    ? `· ${formatDocumentTimestamp(client.createdAt)}`
                                    : ""}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleOpenPatientDetail(client.id);
                                    setNotificationsOpen(false);
                                    setActiveSection("patients");
                                  }}
                                  className="btn btn-primary btn-sm"
                                >
                                  Ver cliente
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  
                  </>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleMarkAllNotificationsRead}
                  disabled={inboxTotalCount === 0}
                  className="text-[11px] px-3 py-1 rounded-full border border-white/10 text-muted disabled:opacity-40 hover:text-white hover:border-transparent hover:bg-[linear-gradient(90deg,_rgba(1,46,221,0.83)_0%,_rgb(54,95,255)_100%)]"
                >
                  Marcar todo leído
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Contenido */}
        <main className="relative z-10 flex-1 px-4 md:px-8 py-6">
          <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
            <div>
              Sesión iniciada como{" "}
              <span className="font-medium">{doctor.name}</span>{" "}
              <span className="text-xs text-slate-400">({doctor.email})</span>
            </div>
          </div>
          <div key={activeSection} className="section-transition">
          {/* === Sección: STOCK === */}
          {activeSection === "stock" && (
            <>
              {canAccessStock ? (
                <div className="space-y-6">
                  <section className="rounded-2xl card-surface p-4 md:p-6 space-y-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <p className="text-[11px] uppercase tracking-wide text-muted">
                        Gestión de productos
                      </p>
                      <h1 className="text-2xl font-semibold text-white">Stock</h1>
                      <p className="text-sm text-slate-400">
                        Cargá tus productos para llevar control de precios, cantidades y etiquetas.
                      </p>
                      {productSuccess && (
                        <p className="text-sm text-emerald-400 mt-1">{productSuccess}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleOpenProductModal}
                      >
                        Agregar producto
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm disabled:opacity-60"
                        onClick={handleRefreshProducts}
                        disabled={productsLoading}
                      >
                        Actualizar lista
                      </button>
                    </div>
                  </section>

                  <div className="space-y-2">
                    <div className="rounded-2xl border border-[#1f1f1f] bg-[#0c131d] p-3 md:p-4 shadow-[0_0_0_rgba(0,0,0,0)]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#111a24] border border-white/10 text-slate-300">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="1.6"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1010.5 18a7.5 7.5 0 006.15-3.35z"
                            />
                          </svg>
                        </span>
                        <input
                          type="text"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          placeholder="Buscar por nombre, categoría o etiqueta..."
                          className="flex-1 min-w-[220px] rounded-xl border border-white/12 bg-[#0f1722] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#365fff]/30 text-white placeholder:text-slate-500"
                        />
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setProductViewMode("grid")}
                            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border text-slate-200 transition ${
                              productViewMode === "grid"
                                ? "border-transparent bg-[linear-gradient(90deg,rgba(1,46,221,0.83)_0%,rgba(54,95,255,0.35)_100%)] shadow-[0_0_12px_rgba(54,95,255,0.35)]"
                                : "border-white/12 bg-[#111a24] hover:border-white/30"
                            }`}
                            title="Vista de grilla"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="3" y="3" width="7" height="7" rx="1.5" />
                              <rect x="14" y="3" width="7" height="7" rx="1.5" />
                              <rect x="3" y="14" width="7" height="7" rx="1.5" />
                              <rect x="14" y="14" width="7" height="7" rx="1.5" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setProductViewMode("list")}
                            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border text-slate-200 transition ${
                              productViewMode === "list"
                                ? "border-transparent bg-[linear-gradient(90deg,rgba(1,46,221,0.83)_0%,rgba(54,95,255,0.35)_100%)] shadow-[0_0_12px_rgba(54,95,255,0.35)]"
                                : "border-white/12 bg-[#111a24] hover:border-white/30"
                            }`}
                            title="Vista de lista"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M9 6h12" />
                              <path d="M9 12h12" />
                              <path d="M9 18h12" />
                              <path d="M3 6h0.01" />
                              <path d="M3 12h0.01" />
                              <path d="M3 18h0.01" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        className={`btn btn-outline btn-sm ${
                          productMultiSelect ? "border-white/40 text-white" : ""
                        }`}
                        onClick={toggleMultiSelect}
                      >
                        {productMultiSelect ? "Cancelar selección" : "Selección múltiple"}
                      </button>
                      {productMultiSelect && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm disabled:opacity-60"
                          disabled={selectedProductIds.size === 0}
                          onClick={() => {
                            if (selectedProductIds.size === 0) return;
                            setBulkDeleteError(null);
                            setBulkDeleteConfirmOpen(true);
                          }}
                        >
                          Eliminar seleccionados ({selectedProductIds.size})
                        </button>
                      )}
                    </div>
                  </div>

                  <section className="space-y-3">
                    {productsError && (
                      <p className="text-sm text-rose-400">{productsError}</p>
                    )}
                    {productsLoading && filteredProducts.length === 0 ? (
                      <div className="rounded-2xl card-surface p-6 text-sm text-slate-400">
                        Cargando productos...
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="rounded-2xl card-surface p-6 text-sm text-slate-400">
                        Aún no cargaste productos. Completá el formulario para empezar a construir tu stock.
                      </div>
                    ) : (
                      <div
                        className={
                          productViewMode === "grid"
                            ? "grid gap-4 md:grid-cols-2"
                            : "flex flex-col gap-3"
                        }
                      >
                        {filteredProducts.map((product) => {
                          const productImageSrc = resolveAssetUrl(
                            product.imageUrl
                          );
                          const isSelected =
                            productMultiSelect && selectedProductIds.has(product.id);
                          const productTags =
                            product.tags?.filter((tag) => tag && tag.label?.trim()) ?? [];
                          const hasCategories =
                            Array.isArray(product.categories) &&
                            product.categories.length > 0;
                          return (
                            <div
                              key={product.id}
                              className={`rounded-2xl card-surface p-4 md:p-6 space-y-4 relative ${
                                productViewMode === "list" ? "flex flex-col" : ""
                              } ${isSelected ? "product-card-selected" : ""}`}
                              onClick={(e) => {
                                const target = e.target as HTMLElement;
                                if (
                                  target.closest("button") ||
                                  target.closest("input") ||
                                  target.closest("textarea") ||
                                  target.closest("select") ||
                                  target.closest("option") ||
                                  target.closest("label")
                                ) {
                                  return;
                                }
                                if (productMultiSelect) {
                                  toggleSelectProduct(product.id);
                                } else {
                                  if (productEditingId === product.id) {
                                    closeProductInlineEditor();
                                  } else {
                                    openProductInlineEditor(product);
                                  }
                                }
                              }}
                            >
                              <div className="flex flex-col md:flex-row gap-4">
                                {productImageSrc ? (
                                  <img
                                    src={productImageSrc}
                                    alt={product.name}
                                    className="w-full md:w-40 h-32 object-cover rounded-2xl border border-slate-800/60"
                                    onError={(event) => {
                                      event.currentTarget.style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <div className="w-full md:w-40 h-32 rounded-2xl border border-dashed border-slate-700/70 flex items-center justify-center text-xs text-slate-500 bg-[#0d151a]">
                                    Sin imagen
                                  </div>
                                )}
                                <div className="flex-1 space-y-2">
                                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                                    <div>
                                      <h3 className="text-lg font-semibold text-white">
                                        {product.name}
                                      </h3>
                                      <p className="text-sm text-slate-400">
                                        {product.description || "Sin descripción registrada."}
                                      </p>
                                      {product.categories && product.categories.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {product.categories.map((category) => (
                                            <span
                                              key={`${product.id}-category-${category}`}
                                              className="text-[11px] px-2.5 py-1 rounded-full border border-transparent text-white bg-[linear-gradient(90deg,rgba(1,46,221,0.83)_0%,rgba(54,95,255,0.35)_100%)] shadow-[0_0_12px_rgba(54,95,255,0.35)]"
                                            >
                                              {PRODUCT_CATEGORY_LABEL[category] || category}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <p className="text-lg font-semibold text-white">
                                        {formatCurrencyARS(product.price)}
                                      </p>
                                      <p className="text-sm text-slate-400">
                                        Stock disponible: {product.quantity} uds.
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2 min-h-[24px]">
                                    {productTags.length > 0 &&
                                      productTags.map((tag) => {
                                        const badgeClass = getPatientTagBadgeClass(tag.severity);
                                        return (
                                          <span
                                            key={`product-${product.id}-tag-${tag.id}`}
                                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${badgeClass}`}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {tag.label}
                                            <button
                                              type="button"
                                              className="text-[11px] opacity-60 hover:opacity-100"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteProductTag(product.id, tag.id);
                                              }}
                                            >
                                              ×
                                            </button>
                                          </span>
                                        );
                                      })}
                                    {productTags.length === 0 && !hasCategories && (
                                      <span className="text-[11px] text-slate-500">
                                        Sin etiquetas aún.
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {!productMultiSelect && (
                                      <>
                                        <button
                                          type="button"
                                          className="btn btn-outline btn-sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openProductInlineEditor(product);
                                          }}
                                        >
                                          {productEditingId === product.id ? "Editar activo" : "Editar"}
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-outline btn-sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openProductTagModal(product.id);
                                          }}
                                        >
                                          Agregar etiqueta
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-danger btn-sm disabled:opacity-60"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRequestDeleteProduct(product.id);
                                          }}
                                          disabled={productDeletingId === product.id}
                                        >
                                          Eliminar
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  {productEditingId === product.id && (
                                    <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 inline-edit-panel">
                                      <div className="grid md:grid-cols-2 gap-3">
                                        <div>
                                          <label className="text-xs font-semibold text-slate-400 mb-1 block uppercase tracking-wide">
                                            Nombre *
                                          </label>
                                          <input
                                            type="text"
                                            value={productEditDrafts[product.id]?.name ?? ""}
                                            onChange={(e) =>
                                              handleProductInlineChange(product.id, "name", e.target.value)
                                            }
                                            className="w-full rounded-xl border border-slate-700/70 bg-[#0b1216] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                                          />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="text-xs font-semibold text-slate-400 mb-1 block uppercase tracking-wide">
                                              Precio *
                                            </label>
                                            <input
                                              type="text"
                                              value={productEditDrafts[product.id]?.price ?? ""}
                                              onChange={(e) =>
                                                handleProductInlineChange(
                                                  product.id,
                                                  "price",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full rounded-xl border border-slate-700/70 bg-[#0b1216] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                                            />
                                          </div>
                                          <div>
                                            <label className="text-xs font-semibold text-slate-400 mb-1 block uppercase tracking-wide">
                                              Cantidad *
                                            </label>
                                            <input
                                              type="text"
                                              value={productEditDrafts[product.id]?.quantity ?? ""}
                                              onChange={(e) =>
                                                handleProductInlineChange(
                                                  product.id,
                                                  "quantity",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full rounded-xl border border-slate-700/70 bg-[#0b1216] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-xs font-semibold text-slate-400 mb-1 block uppercase tracking-wide">
                                          Categorías
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                          {PRODUCT_CATEGORY_OPTIONS.map((option) => {
                                            const active =
                                              productEditDrafts[product.id]?.categories?.includes(
                                                option.key
                                              ) ?? false;
                                            return (
                                              <button
                                                key={`${product.id}-edit-cat-${option.key}`}
                                                type="button"
                                                onClick={() =>
                                                  handleInlineToggleCategory(product.id, option.key)
                                                }
                                                className={`px-3 py-1.5 rounded-full text-[11px] border transition ${
                                                  active
                                                    ? "border-transparent text-white shadow-[0_0_12px_rgba(54,95,255,0.35)] bg-[linear-gradient(90deg,rgba(1,46,221,0.83)_0%,rgba(54,95,255,0.35)_100%)]"
                                                    : "border-white/10 text-slate-300 hover:border-white/30 hover:bg-white/5"
                                                }`}
                                              >
                                                {option.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-xs font-semibold text-slate-400 mb-1 block uppercase tracking-wide">
                                          Descripción
                                        </label>
                                        <textarea
                                          value={productEditDrafts[product.id]?.description ?? ""}
                                          onChange={(e) =>
                                            handleProductInlineChange(
                                              product.id,
                                              "description",
                                              e.target.value
                                            )
                                          }
                                          className="w-full rounded-xl border border-slate-700/70 bg-[#0b1216] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25 min-h-[70px]"
                                          placeholder="Notas internas o detalles para el bot"
                                        />
                                      </div>
                                      {productEditError && (
                                        <p className="text-sm text-rose-400">{productEditError}</p>
                                      )}
                                      <div className="flex justify-end gap-2">
                                        <button
                                          type="button"
                                          className="btn btn-outline btn-sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            closeProductInlineEditor();
                                          }}
                                          disabled={productEditSavingId === product.id}
                                        >
                                          Cancelar
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-primary btn-sm disabled:opacity-60"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSaveInlineProduct(product.id);
                                          }}
                                          disabled={productEditSavingId === product.id}
                                        >
                                          {productEditSavingId === product.id
                                            ? "Guardando..."
                                            : "Guardar"}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                <div className="rounded-2xl card-surface p-6 text-sm text-slate-400">
                  Esta sección está disponible para cuentas de comercios. Actualizá tu tipo de negocio desde el perfil para habilitarla.
                </div>
              )}
            </>
          )}
          {/* === Sección: DASHBOARD === */}
          {activeSection === "dashboard" && (
            <>
              {loadingData && (
                <div className="text-sm text-slate-500 mb-4">
                  Cargando datos del dashboard...
                </div>
              )}

              {dataError && !loadingData && (
                <div className="text-sm text-red-600 mb-4">
                  Error al cargar datos: {dataError}
                </div>
              )}

              {!loadingData && !dataError && data && (
                <div className="grid gap-6 lg:grid-cols-3">
                  {/* Columna izquierda (2/3 del ancho en desktop) */}
                  <section className="lg:col-span-2 space-y-4">
                    {/* Resumen rápido */}
                    <div className="rounded-2xl card-surface p-4 md:p-6">
                      <h2 className="text-lg font-semibold mb-1">
                        Resumen rápido de hoy
                      </h2>
                      <p className="text-sm text-slate-500 mb-4">
                        Datos en tiempo real filtrados por tu cuenta.
                      </p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        {isRetailBusiness ? (
                          <>
                            <div className="rounded-2xl card-muted p-3">
                              <p className="text-xs text-muted tracking-wide uppercase">
                                Pedidos hoy
                              </p>
                              <p className="text-xl font-semibold text-white">
                                {retailDashboardStats?.pedidosHoy ?? 0}
                              </p>
                            </div>
                            <div className="rounded-2xl card-muted p-3">
                              <p className="text-xs text-muted tracking-wide uppercase">
                                Pedidos completos
                              </p>
                              <p className="text-xl font-semibold text-white">
                                {retailDashboardStats?.pedidosConfirmadosHoy ?? 0}
                              </p>
                            </div>
                            <div className="rounded-2xl card-muted p-3">
                              <p className="text-xs text-muted tracking-wide uppercase">
                                Ingresos de hoy
                              </p>
                              <p className="text-xl font-semibold text-white">
                                $ {(retailDashboardStats?.ingresosHoy ?? 0).toLocaleString("es-AR")}
                              </p>
                            </div>
                            <div className="rounded-2xl card-muted p-3">
                              <p className="text-xs text-muted tracking-wide uppercase">
                                Clientes de hoy
                              </p>
                              <p className="text-xl font-semibold text-white">
                                {retailDashboardStats?.clientesHoy ?? 0}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="rounded-2xl card-muted p-3">
                              <p className="text-xs text-muted tracking-wide uppercase">
                                Consultas hoy
                              </p>
                              <p className="text-xl font-semibold text-white">
                                {data.stats.consultasHoy}
                              </p>
                            </div>
                            <div className="rounded-2xl card-muted p-3">
                              <p className="text-xs text-muted tracking-wide uppercase">
                                {contactLabels.plural} en espera
                              </p>
                              <p className="text-xl font-semibold text-white">
                                {data.stats.pacientesEnEspera}
                              </p>
                            </div>
                            <div className="rounded-2xl card-muted p-3">
                              <p className="text-xs text-muted tracking-wide uppercase">
                                Ingresos (mes)
                              </p>
                              <p className="text-xl font-semibold text-white">
                                $ {data.stats.ingresosMes.toLocaleString("es-AR")}
                              </p>
                            </div>
                            <div className="rounded-2xl card-muted p-3">
                              <p className="text-xs text-muted tracking-wide uppercase">
                                {contactLabels.plural} recurrentes
                              </p>
                              <p className="text-xl font-semibold text-white">
                                {data.stats.pacientesRecurrentesPorcentaje}%
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Agenda de hoy / pedidos pendientes */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                          {isRetailBusiness ? "Pedidos para revisar" : "Pacientes para hoy"}
                        </h3>
                      </div>
                      {isRetailBusiness ? (
                        pendingOrdersToday.length === 0 ? (
                          <p className="text-xs text-muted border border-dashed border-slate-700/60 rounded-xl px-3 py-2 bg-[#121212]">
                            No tenés pedidos para revisar hoy.
                          </p>
                        ) : (
                          pendingOrdersToday.map((order) => {
                            const created = new Date(order.createdAt);
                            const hour = created.toLocaleTimeString("es-AR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                            return (
                              <div
                                key={order.id}
                                className="flex items-center justify-between rounded-xl px-3 py-2 card-surface"
                              >
                                <div className="flex items-center gap-3 flex-1">
                                  <div>
                                    <p className="font-medium flex items-center gap-2">
                                      <span>
                                        #{order.sequenceNumber} · {order.clientName}
                                      </span>
                                      <span className="text-[10px] uppercase tracking-wide border border-amber-400/40 bg-amber-400/10 text-amber-100 px-2 py-0.5 rounded-full">
                                        {order.status}
                                      </span>
                                    </p>
                                    <p className="text-xs text-muted">
                                      {hour} · Total $ {order.totalAmount}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )
                      ) : data.agendaHoy.length === 0 ? (
                        <p className="text-xs text-muted border border-dashed border-slate-700/60 rounded-xl px-3 py-2 bg-[#121212]">
                          No tenés turnos registrados el día de hoy.
                        </p>
                      ) : (
                        data.agendaHoy.map((item) => {
                          const statusValue = item.status?.toLowerCase() || "";
                          const isCancelled = /cancel/.test(statusValue);
                          const isRescheduled = /resched/.test(statusValue);
                          const quickChatTargetId = item.patientId ?? null;
                          return (
                            <div
                              key={item.id}
                              className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                                isCancelled
                                  ? "border border-rose-500/40 bg-[#2a0f19]"
                                  : isRescheduled
                                  ? "border border-sky-500/30 bg-[#0e1f2c]"
                                  : "card-surface"
                              }`}
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <div>
                                  <p className="font-medium flex items-center gap-2">
                                    <span>
                                      {item.hora} · {item.paciente}
                                    </span>
                                    {isCancelled && (
                                      <span className="text-[10px] uppercase tracking-wide border border-rose-500/50 bg-rose-500/15 text-rose-200 px-2 py-0.5 rounded-full">
                                        CANCELADO
                                      </span>
                                    )}
                                    {isRescheduled && (
                                      <span className="text-[10px] uppercase tracking-wide border border-sky-400/40 bg-sky-400/15 text-sky-100 px-2 py-0.5 rounded-full">
                                        REPROGRAMADO
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-xs text-muted">
                                    {item.descripcion}
                                  </p>
                                </div>
                                {!isCancelled && !isRescheduled && (
                                  <div className="flex items-center gap-2 text-[11px]">
                                    {quickChatTargetId ? (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenQuickChat(quickChatTargetId)}
                                        className="inline-flex items-center blanco justify-center w-8 h-8 rounded-full  border border-slate-500/40 text-slate-900 shadow-sm hover:shadow-lg transition"
                                        title="Abrir chat de WhatsApp"
                                      >
                                        <img
                                          src={whatsappIcon}
                                          alt="WhatsApp"
                                          className="w-4 h-4 blanco"
                                        />
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-slate-500 italic">
                                        Asigná un paciente para chatear
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {!isCancelled &&
                                !isRescheduled &&
                                item.accion === "recordatorio" && (
                                  <button
                                    className="btn btn-primary btn-sm disabled:opacity-60"
                                    onClick={() => handleSendReminder(item.id)}
                                    disabled={reminderLoadingId === item.id}
                                  >
                                    {reminderLoadingId === item.id
                                      ? "Enviando..."
                                      : "Enviar recordatorio"}
                                  </button>
                                )}

                              {!isCancelled &&
                                !isRescheduled &&
                                item.accion === "reprogramar" && (
                                  <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => handleAgendaReprogram(item)}
                                  >
                                    Reprogramar
                                  </button>
                                )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Contactos + envío de WhatsApp + chat */}
                    <div className="rounded-2xl card-surface p-4 md:p-6">
                      <h2 className="text-lg font-semibold mb-1">
                        {contactLabels.plural} (WhatsApp)
                      </h2>
                      <p className="text-sm text-slate-500 mb-4">
                        {contactLabels.plural} que interactuaron por WhatsApp. Podés
                        enviarles un mensaje directo desde acá y ver la
                        conversación.
                      </p>

                      {loadingPatients && (
                        <p className="text-xs text-slate-500 mb-2">
                          Cargando {contactLabels.pluralLower}...
                        </p>
                      )}
                      {patientsError && (
                        <p className="text-xs text-red-600 mb-2">
                          {patientsError}
                        </p>
                      )}
                      {patients.length === 0 &&
                        !loadingPatients &&
                        !patientsError && (
                          <p className="text-xs text-slate-400">
                            Todavía no hay {contactLabels.pluralLower} creados desde WhatsApp.
                          </p>
                        )}

                      {patients.length > 0 && (
                        <div className="flex flex-col md:flex-row gap-4">
                          {/* Lista de contactos */}
                          <div className="md:w-1/2 space-y-1 max-h-56 pr-1">
                            {patients.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setSelectedPatientId(p.id);
                                  setSendError(null);
                                  setSendSuccess(null);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition ${
                                  selectedPatientId === p.id
                                    ? "border-slate-500 bg-[#111f1f]"
                                    : "border-slate-700 hover:border-slate-600/80"
                                }`}
                              >
                                <div className="font-medium text-white">
                                  {p.fullName ||
                                    `${contactLabels.singularCapitalized} sin nombre`}
                                </div>
                                <div className="text-[11px] text-muted">
                                  {p.phone || "Sin teléfono registrado"}
                                </div>
                                {p.isProfileComplete === false && (
                                  <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                                    ⚠︎ Ficha incompleta
                                  </span>
                                )}
                                {isMedicalDoctor && (
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                                    {[
                                      { label: "DNI", value: p.dni },
                                      {
                                        label: "Nacimiento",
                                        value: formatPatientBirthDate(p.birthDate),
                                        formatted: true,
                                      },
                                      { label: "Obra social", value: p.insuranceProvider },
                                      { label: "Dirección", value: p.address },
                                    ].map((field) => (
                                      <div
                                        key={`${p.id}-${field.label}`}
                                        className="rounded-xl border border-slate-700/40 bg-slate-900/20 px-3 py-2"
                                      >
                                        <p className="uppercase text-[9px] tracking-wide text-slate-400">
                                          {field.label}
                                        </p>
                                        <p className="font-semibold text-slate-50 leading-tight line-clamp-2">
                                          {field.formatted
                                            ? field.value
                                            : (typeof field.value === "string" &&
                                                field.value.trim()) ||
                                              "Pendiente"}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {isMedicalDoctor && (
                                  <>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {p.tags && p.tags.length > 0 ? (
                                        p.tags.map((tag) => (
                                          <span
                                            key={`patient-${p.id}-tag-${tag.id}`}
                                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${getPatientTagBadgeClass(
                                              tag.severity
                                            )}`}
                                          >
                                            {tag.label}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[10px] text-slate-500">
                                          Sin datos importantes
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      className="mt-2 inline-flex text-[10px] text-slate-400 underline decoration-dotted hover:text-white focus:outline-none"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedPatientId(p.id);
                                        handleOpenTagModal(p.id);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          setSelectedPatientId(p.id);
                                          handleOpenTagModal(p.id);
                                        }
                                      }}
                                    >
                                      Agregar dato importante
                                    </span>
                                  </>
                                )}
                              </button>
                            ))}
                          </div>

                          {/* Chat + formulario para enviar mensaje */}
                          <div className="md:w-1/2 flex flex-col gap-2">
                            {selectedPatient ? (
                              <>
                                <div className="text-muted mb-1 text-xs">
                                  Conversación con{" "}
                                  <span className="font-semibold">
                                    {selectedPatient.fullName ||
                                      `${contactLabels.singularCapitalized} sin nombre`}
                                  </span>
                                </div>
                                {isMedicalDoctor && (
                                  <div className="rounded-xl border border-slate-700 bg-[#151515] px-3 py-2 text-[11px] text-muted">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      {[
                                        { label: "DNI", value: selectedPatient.dni },
                                        {
                                          label: "Fecha de nacimiento",
                                          value: formatPatientBirthDate(selectedPatient.birthDate),
                                          treatAsFormatted: true,
                                        },
                                        { label: "Dirección", value: selectedPatient.address },
                                        {
                                          label: "Obra social",
                                          value: selectedPatient.insuranceProvider,
                                        },
                                        {
                                          label: "Motivo de consulta",
                                          value: selectedPatient.consultReason,
                                        },
                                      ].map((field) => (
                                        <div key={`patient-summary-${field.label}`}>
                                          <p className="uppercase text-[9px] tracking-wide text-slate-500">
                                            {field.label}
                                          </p>
                                          <p className="font-semibold text-white text-[12px] leading-tight line-clamp-2">
                                            {field.treatAsFormatted
                                              ? field.value
                                              : (typeof field.value === "string" &&
                                                  field.value.trim()) ||
                                                "Pendiente"}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {isMedicalDoctor && (
                                  <div className="mt-2">
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                                      Datos importantes
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {selectedPatient.tags &&
                                      selectedPatient.tags.length > 0 ? (
                                        selectedPatient.tags.map((tag) => (
                                          <span
                                            key={`selected-${selectedPatient.id}-tag-${tag.id}`}
                                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${getPatientTagBadgeClass(
                                              tag.severity
                                            )}`}
                                          >
                                            {tag.label}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[10px] text-slate-500">
                                          Sin información cargada
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      className="mt-2 inline-flex text-[10px] text-slate-400 underline decoration-dotted hover:text-white focus:outline-none"
                                      onClick={() => {
                                        if (selectedPatient.id) {
                                          handleOpenTagModal(selectedPatient.id);
                                        }
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          if (selectedPatient.id) {
                                            handleOpenTagModal(selectedPatient.id);
                                          }
                                        }
                                      }}
                                    >
                                      Agregar dato importante
                                    </span>
                                  </div>
                                )}

                                <div className="border border-slate-700/60 rounded-xl bg-[#111] p-2 h-48 overflow-y-auto text-xs space-y-1">
                                  {loadingMessages && (
                                    <p className="text-muted">
                                      Cargando mensajes...
                                    </p>
                                  )}
                                  {messagesError && (
                                    <p className="text-rose-400">
                                      {messagesError}
                                    </p>
                                  )}
                                  {!loadingMessages &&
                                    !messagesError &&
                                    chatMessages.length === 0 && (
                                      <p className="text-muted">
                                        Todavía no hay mensajes en esta
                                        conversación.
                                      </p>
                                    )}
                                  {!loadingMessages &&
                                    !messagesError &&
                                    chatMessages.map((m) => {
                                      const dateLabel = (() => {
                                        try {
                                          return new Date(
                                            m.createdAt
                                          ).toLocaleTimeString("es-AR", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          });
                                        } catch {
                                          return "";
                                        }
                                      })();

                                      const isOutgoing =
                                        m.direction === "outgoing";

                                      return (
                                        <div
                                          key={m.id}
                                          className={`flex ${
                                            isOutgoing
                                              ? "justify-end"
                                              : "justify-start"
                                          }`}
                                        >
                                          <div
                                            className={`max-w-[75%] px-2 py-1 rounded-lg ${
                                              isOutgoing
                                                ? "bg-slate-900 text-white"
                                                : "bg-[#2a2a2a] text-white border border-slate-700/60"
                                            }`}
                                          >
                                            <div className="whitespace-pre-wrap">
                                              {m.body || ""}
                                            </div>
                                            <div
                                              className={`mt-0.5 text-[10px] ${
                                                isOutgoing
                                                  ? "text-slate-300"
                                                  : "text-muted"
                                              }`}
                                            >
                                              {dateLabel}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>

                                <form
                                  onSubmit={handleSendToPatient}
                                  className="space-y-2 text-xs"
                                >
                                  <textarea
                                    className="w-full rounded-xl border border-slate-700 px-3 py-2 text-xs resize-none h-20 bg-[#0f0f0f] focus:outline-none focus:ring-2 focus:ring-teal-400/20"
                                    placeholder="Escribí un mensaje corto de seguimiento, recordatorio, etc."
                                    value={messageText}
                                    onChange={(e) =>
                                      setMessageText(e.target.value)
                                    }
                                  />
                                  {sendError && (
                                    <div className="text-[11px] text-red-600">
                                      {sendError}
                                    </div>
                                  )}
                                  {sendSuccess && (
                                    <div className="text-[11px] text-emerald-600">
                                      {sendSuccess}
                                    </div>
                                  )}
                                  <button
                                    type="submit"
                                    disabled={
                                      sendingMessage || !messageText.trim()
                                    }
                                    className="btn btn-primary btn-sm w-full disabled:opacity-60"
                                  >
                                    {sendingMessage
                                      ? "Enviando..."
                                      : "Enviar por WhatsApp"}
                                  </button>
                                </form>
                              </>
                            ) : (
                              <p className="text-xs text-muted">
                                Elegí un {contactLabels.singular} de la lista
                                para ver la conversación y enviar mensajes.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Columna derecha (1/3 del ancho en desktop) */}
                  <section className="space-y-4">
                    <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-700 text-white shadow-soft p-4 md:p-5 space-y-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">
                          Comunicación masiva
                        </p>
                        <p className="text-xs text-white/80">
                          {isRetailBusiness
                            ? "Enviá promos o avisos a tus clientes con etiquetas."
                            : "Segmentá recordatorios con etiquetas o avisá novedades por WhatsApp."}
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenBroadcastModal()}
                          className="w-full inline-flex items-center justify-center rounded-xl bg-white/15 backdrop-blur px-4 py-2 text-sm font-semibold transition hover:bg-white/25"
                        >
                          Enviar mensaje {isRetailBusiness ? "a clientes" : "masivo / segmentado"}
                        </button>
                        {isRetailBusiness && (
                          <button
                            type="button"
                            onClick={() => handleOpenBroadcastModal({ presetMessage: "Mirá esta promo que preparamos para vos ✨" })}
                            className="w-full inline-flex items-center justify-center rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
                          >
                            Enviar promoción
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl card-surface p-4 md:p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-sm font-semibold">
                            Resumen de métricas
                          </h2>
                          <p className="text-xs text-muted">
                            {metricsRangeLabel}. Datos actualizados con tus{" "}
                            {isRetailBusiness ? "pedidos confirmados y cancelados" : "turnos confirmados y cancelados"}.
                          </p>
                        </div>
                      </div>
                      {isRetailBusiness ? (
                        retailMetricsLoading ? (
                          <p className="text-xs text-muted">
                            Cargando métricas del período...
                          </p>
                        ) : retailMetricsError ? (
                          <p className="text-xs text-rose-400">
                            {retailMetricsError}
                          </p>
                        ) : !retailMetrics ? (
                          <p className="text-xs text-muted">
                            No hay datos de pedidos en este rango.
                          </p>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div className="rounded-2xl card-muted p-3">
                                <p className="text-muted mb-1 uppercase tracking-wide">
                                  Confirmados
                                </p>
                                <p className="text-lg font-semibold text-white">
                                  {retailMetrics.totals.confirmed}
                                </p>
                                <p className="text-[11px] text-muted">
                                  Total: {retailMetrics.totals.total}
                                </p>
                              </div>
                              <div className="rounded-2xl card-muted p-3">
                                <p className="text-muted mb-1 uppercase tracking-wide">
                                  Cancelados
                                </p>
                                <p className="text-lg font-semibold text-rose-300">
                                  {retailMetrics.totals.cancelled}
                                </p>
                                <p className="text-[11px] text-muted">
                                  Pendientes {retailMetrics.totals.pending}
                                </p>
                              </div>
                              <div className="rounded-2xl card-muted p-3">
                                <p className="text-muted mb-1 uppercase tracking-wide">
                                  Ingresos cobrados
                                </p>
                                <p className="text-lg font-semibold text-white">
                                  $ {retailMetrics.revenue.paid.toLocaleString("es-AR")}
                                </p>
                                <p className="text-[11px] text-muted mt-1">
                                  Ticket: $ {retailMetrics.revenue.avgTicketPaid.toLocaleString("es-AR")}
                                </p>
                              </div>
                              <div className="rounded-2xl card-muted p-3">
                                <p className="text-muted mb-1 uppercase tracking-wide">
                                  Deuda / pendiente
                                </p>
                                <p className="text-lg font-semibold text-white">
                                  ${" "}
                                  {(retailMetrics.revenue.outstanding +
                                    retailMetrics.revenue.partialOutstanding).toLocaleString(
                                    "es-AR"
                                  )}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setActiveSection("metrics")}
                              className="btn btn-outline btn-sm w-full"
                            >
                              Ver métricas completas
                            </button>
                          </>
                        )
                      ) : metricsAppointmentsLoading ? (
                        <p className="text-xs text-muted">
                          Cargando métricas del período...
                        </p>
                      ) : metricsAppointmentsError ? (
                        <p className="text-xs text-rose-400">
                          {metricsAppointmentsError}
                        </p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="rounded-2xl card-muted p-3">
                              <p className="text-muted mb-1 uppercase tracking-wide">
                                Confirmados
                              </p>
                              <p className="text-lg font-semibold text-white">
                                {metricsStats.confirmed}
                              </p>
                              <p className="text-[11px] text-muted">
                                Cumplimiento {metricsStats.completionRate.toFixed(1)}%
                              </p>
                            </div>
                            <div className="rounded-2xl card-muted p-3">
                              <p className="text-muted mb-1 uppercase tracking-wide">
                                Cancelaciones
                              </p>
                              <p className="text-lg font-semibold text-rose-300">
                                {metricsStats.cancelled}
                              </p>
                              <p className="text-[11px] text-muted">
                                {metricsStats.cancellationRate.toFixed(1)}% del total
                              </p>
                            </div>
                            <div className="rounded-2xl card-muted p-3">
                              <p className="text-muted mb-1 uppercase tracking-wide">
                                Ingresos cobrados
                              </p>
                              <p className="text-lg font-semibold text-white">
                                $ {metricsRevenue.collected.toLocaleString("es-AR")}
                              </p>
                              <p className="text-[11px] text-muted mt-1">
                                Efectivo $ {metricsRevenue.cashCollected.toLocaleString("es-AR")} · Transfer/TC $ {metricsRevenue.transferCollected.toLocaleString("es-AR")}
                              </p>
                            </div>
                            <div className="rounded-2xl card-muted p-3">
                              <p className="text-muted mb-1 uppercase tracking-wide">
                                Pendiente estimado
                              </p>
                              <p className="text-lg font-semibold text-white">
                                $ {metricsRevenue.pending.toLocaleString("es-AR")}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveSection("metrics")}
                            className="btn btn-outline btn-sm w-full"
                          >
                            Ver métricas completas
                          </button>
                        </>
                      )}
                    </div>

                    {reminderError && (
                      <p className="text-[11px] text-red-600">
                        {reminderError}
                      </p>
                    )}
                    {reminderSuccess && (
                      <p className="text-[11px] text-emerald-600">
                        {reminderSuccess}
                      </p>
                    )}
                  </section>
                </div>
              )}
            </>
          )}

          {/* === Sección: RADAR CRÍTICO === */}
          {activeSection === "risk" && (
            <div className="space-y-5">
              <div className="rounded-2xl card-surface p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Inteligencia preventiva
                    </p>
                    <h2 className="text-2xl font-semibold text-white">
                      Radar crítico de pacientes
                    </h2>
                    <p className="text-sm text-slate-400 mt-2">
                      Identificamos fichas con datos sensibles o pendientes antes de
                      que generen un problema en la consulta.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="px-2 py-1 rounded-full border border-slate-600 uppercase tracking-wide">
                      Beta
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        fetchPatients({ silent: true });
                        fetchInboxData({ silent: true });
                      }}
                      className="btn btn-outline btn-sm whitespace-nowrap"
                    >
                      Actualizar datos
                    </button>
                  </div>
                </div>
              </div>

              {loadingPatients || inboxLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-700/70 text-sm text-slate-400 px-4 py-6">
                  Actualizando radar...
                </div>
              ) : invisibleRiskInsights.length === 0 ? (
                <div className="rounded-2xl card-surface p-6 text-center space-y-3">
                  <p className="text-base font-semibold text-white">
                    Sin alertas invisibles
                  </p>
                  <p className="text-sm text-slate-400 max-w-xl mx-auto">
                    No encontramos fichas con brechas críticas. Revisá tus pacientes
                    cuando quieras o completá información desde la sección de
                    pacientes.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setActiveSection("patients")}
                  >
                    Ir a pacientes
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {invisibleRiskInsights.map((insight) => {
                    const meta = INVISIBLE_RISK_LEVEL_META[insight.level];
                    return (
                      <div
                        key={insight.id}
                        className="rounded-3xl border border-slate-700/70 bg-[#0f151d] p-4 flex flex-col gap-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                              Paciente
                            </p>
                            <p className="text-lg font-semibold text-white">
                              {insight.patientName}
                            </p>
                            <div className="flex items-center gap-2 text-[12px] text-slate-400 mt-1">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${meta.badgeClass}`}
                              >
                                <span
                                  className={`inline-flex h-1.5 w-1.5 rounded-full ${meta.dotClass}`}
                                />
                                {meta.label}
                              </span>
                              <span>Puntaje {insight.score}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={!insight.patientId}
                            onClick={() =>
                              insight.patientId &&
                              handleOpenPatientDetail(insight.patientId)
                            }
                          >
                            Abrir ficha
                          </button>
                        </div>
                        <div className="text-xs text-slate-300">
                          <p className="uppercase tracking-wide text-slate-500 mb-1">
                            Razones detectadas
                          </p>
                          <ul className="list-disc list-inside space-y-1">
                            {insight.reasons.map((reason, idx) => (
                              <li key={`${insight.id}-reason-${idx}`}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* === Sección: MI PERFIL === */}
          {activeSection === "profile" && (
            <section className="max-w-8xl mx-auto mt-4">
              <div className="rounded-2xl card-surface p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold mb-1">Mi perfil</h2>
                    <p className="text-sm text-muted">
                      Estos datos se van a usar para que el asistente responda mejor
                      por WhatsApp (precios, horarios, especialidad, etc.).
                    </p>
                  </div>
                  <div className="inline-flex rounded-2xl border border-slate-700 overflow-hidden text-xs font-semibold">
                    {availabilityOptions.map((opt) => {
                      const active = availabilityStatus === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() =>
                            setAvailabilityStatus(opt.key)
                          }
                          className={`px-3 py-1.5 border-l border-slate-700 first:border-l-0 transition ${
                            active
                              ? `${opt.className}`
                              : "bg-transparent text-muted hover:bg-[#1e1e1e]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-700 bg-[#121212] px-4 py-4 mb-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-[#2b2b2b] text-muted flex items-center justify-center text-lg font-semibold overflow-hidden border border-slate-600">
                        {doctorAvatarUrl ? (
                          <img
                            src={doctorAvatarUrl}
                            alt={doctor.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          doctorInitials || doctor.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="text-sm text-muted">
                        Agregá una foto para reconocer tu cuenta más rápido dentro
                        del dashboard.
                        <p className="text-[11px] text-muted mt-1">
                          Formatos PNG, JPG o WebP. Peso máximo 2 MB.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        ref={profileImageInputRef}
                        type="file"
                        accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
                        className="hidden"
                        onChange={handleProfileImageInputChange}
                      />
                      <button
                        type="button"
                        onClick={() => profileImageInputRef.current?.click()}
                        disabled={profileImageUploading}
                        className="px-4 py-2 rounded-xl border border-slate-600 text-sm font-semibold text-white hover:border-slate-400 disabled:opacity-60"
                      >
                        {profileImageUploading ? "Procesando..." : "Cambiar foto"}
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveProfileImage}
                        disabled={
                          profileImageUploading || !doctor.profileImageUrl
                        }
                        className="px-4 py-2 rounded-xl text-sm font-semibold border border-rose-500/40 text-rose-300 hover:border-rose-300 disabled:opacity-60"
                      >
                        Quitar foto
                      </button>
                    </div>
                  </div>
                  {(profileImageError || profileImageMessage) && (
                    <p
                      className={`text-xs mt-3 ${
                        profileImageError ? "text-rose-600" : "text-emerald-600"
                      }`}
                    >
                      {profileImageError ?? profileImageMessage}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-dashed border-slate-700 bg-[#121212] px-4 py-4 mb-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-xl bg-[#1f1f1f] text-muted flex items-center justify-center overflow-hidden border border-slate-600">
                        {doctorTicketLogoUrl ? (
                          <img
                            src={doctorTicketLogoUrl}
                            alt="Logo para boletas"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <span className="text-xs text-muted text-center px-2">
                            Logo boleta
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted">
                        Logo de la empresa para las boletas (PDF).
                        <p className="text-[11px] text-muted mt-1">
                          Formatos PNG, JPG o WebP. Peso máximo 2 MB.
                        </p>
                        {logoMessage && (
                          <p className="text-[11px] text-emerald-300">
                            {logoMessage}
                          </p>
                        )}
                        {logoError && (
                          <p className="text-[11px] text-rose-300">
                            {logoError}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
                        className="hidden"
                        onChange={handleLogoInputChange}
                        disabled={logoUploading}
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={logoUploading}
                        className="px-4 py-2 rounded-xl border border-slate-600 text-sm font-semibold text-white hover:border-slate-400 disabled:opacity-60"
                      >
                        {logoUploading ? "Subiendo..." : "Subir logo"}
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        disabled={logoUploading || !doctor.ticketLogoUrl}
                        className="px-4 py-2 rounded-xl text-sm font-semibold border border-rose-500/40 text-rose-300 hover:border-rose-300 disabled:opacity-60"
                      >
                        Quitar logo
                      </button>
                    </div>
                  </div>
                </div>

                <form className="space-y-4" onSubmit={handleProfileSave}>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Nombre completo
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50"
                        value={doctor.name}
                        disabled
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Email de acceso
                      </label>
                      <input
                        type="email"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50"
                        value={doctor.email}
                        disabled
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Tipo de negocio
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50"
                      value={businessInfo.label}
                      readOnly
                      disabled
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Teléfono / WhatsApp de contacto
                    </label>
                    <input
                      type="text"
                      name="contactPhone"
                      value={profileForm.contactPhone}
                      onChange={handleProfileChange}
                      placeholder="+54 9 ..."
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                    />
                  </div>

                  {doctor.businessType === "HEALTH" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Duración entre turnos
                      </label>
                      <select
                        name="slotInterval"
                        value={profileForm.slotInterval}
                        onChange={handleProfileChange}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 bg-white"
                      >
                        {SLOT_INTERVAL_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt === "15"
                              ? "15 minutos"
                              : opt === "30"
                              ? "30 minutos"
                              : opt === "60"
                              ? "1 hora"
                              : "2 horas"}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Esta opción define cada cuánto se ofrecen turnos desde el asistente.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Dirección del negocio
                    </label>
                    <input
                      type="text"
                      name="clinicAddress"
                      value={profileForm.clinicAddress}
                      onChange={handleProfileChange}
                      placeholder="Calle, número, piso, ciudad"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Días de atención
                      </label>
                      <div className="rounded-2xl border border-slate-200 px-3 py-3 bg-white flex flex-wrap gap-2">
                        {WEEK_DAYS.map((day) => {
                          const active = profileForm.officeDaysSelection.includes(
                            day.key
                          );
                          return (
                            <button
                              key={day.key}
                              type="button"
                              onClick={() => handleToggleOfficeDay(day.key)}
                              aria-pressed={active}
                              className={`flex items-center justify-between gap-2 min-w-[72px] px-3 py-2 rounded-xl border text-sm font-medium transition ${
                                active
                                  ? "bg-[linear-gradient(90deg,_rgba(1,46,221,0.83)_0%,_rgb(54,95,255)_100%)] border-transparent text-white shadow-lg shadow-blue-900/40"
                                  : "border-slate-200 text-slate-600 hover:border-slate-400"
                              }`}
                            >
                              <span>{day.short}</span>
                              {active && <span className="text-xs">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {profileForm.officeDaysSelection.length
                          ? `Atendés: ${buildOfficeDaysSummaryFromKeys(
                              profileForm.officeDaysSelection
                            )}`
                          : profileForm.officeDays
                          ? `Usando tu descripción actual: ${profileForm.officeDays}`
                          : doctor.businessType === "RETAIL"
                          ? "Elegí los días en los que el bot acepta pedidos."
                          : "Elegí los días en los que el bot puede ofrecer turnos."}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Horarios de atención
                      </label>
                      <div className="flex items-center gap-3 text-sm mb-3">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-slate-600 focus:ring-slate-500"
                            checked={profileForm.worksFullDay}
                            onChange={(e) =>
                              handleToggleFullDaySchedule(e.target.checked)
                            }
                          />
                          <span className="text-slate-600 font-medium">
                            Trabajo con horario corrido todo el día
                          </span>
                        </label>
                      </div>
                      <div className="rounded-2xl border border-slate-200 px-3 py-3 bg-white space-y-3">
                        {profileForm.worksFullDay ? (
                          <div>
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                              Jornada completa
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                  Desde
                                </label>
                                <input
                                  type="time"
                                  name="officeHoursFullDayStart"
                                  value={profileForm.officeHoursFullDayStart}
                                  onChange={handleProfileChange}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                  Hasta
                                </label>
                                <input
                                  type="time"
                                  name="officeHoursFullDayEnd"
                                  value={profileForm.officeHoursFullDayEnd}
                                  onChange={handleProfileChange}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div>
                              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                                Turno mañana
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                    Desde
                                  </label>
                                  <input
                                    type="time"
                                    name="officeHoursMorningStart"
                                    value={profileForm.officeHoursMorningStart}
                                    onChange={handleProfileChange}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                    Hasta
                                  </label>
                                  <input
                                    type="time"
                                    name="officeHoursMorningEnd"
                                    value={profileForm.officeHoursMorningEnd}
                                    onChange={handleProfileChange}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                                  />
                                </div>
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                                Turno tarde
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                    Desde
                                  </label>
                                  <input
                                    type="time"
                                    name="officeHoursAfternoonStart"
                                    value={profileForm.officeHoursAfternoonStart}
                                    onChange={handleProfileChange}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                    Hasta
                                  </label>
                                  <input
                                    type="time"
                                    name="officeHoursAfternoonEnd"
                                    value={profileForm.officeHoursAfternoonEnd}
                                    onChange={handleProfileChange}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                                  />
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {officeHoursPreview
                          ? `El bot ofrecerá turnos: ${officeHoursPreview}.`
                          : profileForm.officeHours
                          ? `Usando tus horarios actuales: ${profileForm.officeHours}.`
                          : "Definí al menos un rango para que el asistente respete tus horarios reales."}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Notas para el asistente
                    </label>
                    <textarea
                      name="extraNotes"
                      value={profileForm.extraNotes}
                      onChange={handleProfileChange}
                      placeholder="Ej: prefiero stockear pedidos por la tarde, avisar si falta mercadería, no despachar domingos."
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                    />
                  </div>

                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 pt-2">
                    <button
                      type="submit"
                      className="btn btn-primary btn-md"
                    >
                      Guardar cambios
                    </button>
                  </div>
                </form>
              </div>
            </section>
          )}

          {/* === Sección: PACIENTES / CLIENTES === */}
          {activeSection === "patients" && (
            <section className="mt-6 space-y-4">
              {patientViewId ? (
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleClosePatientDetail}
                      className="btn btn-outline btn-sm w-fit"
                    >
                      ← Volver al listado
                    </button>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => patientViewId && handleOpenPatientChat(patientViewId)}
                        className="btn btn-primary btn-sm"
                      >
                        Abrir chat
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenAddNoteModal}
                        className="btn btn-outline btn-sm"
                      >
                        Agregar nota
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenPatientNotesModal}
                        className="btn btn-outline btn-sm"
                      >
                        Ver notas
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenPatientSummaryModal}
                        className="btn btn-outline btn-sm"
                      >
                        Ver resumen IA
                      </button>
                      {isMedicalDoctor && (
                        <>
                          <button
                            type="button"
                            onClick={handleOpenClinicalHistory}
                            className="btn btn-outline btn-sm"
                            disabled={!patientViewData}
                          >
                            Historia clínica
                          </button>
                          <button
                            type="button"
                            onClick={() => setProfileEditorOpen((prev) => !prev)}
                            className="btn btn-outline btn-sm"
                          >
                            {profileEditorOpen ? "Cerrar ficha" : "Completar ficha"}
                          </button>
                          </>
                        )}
                        <p className="text-[11px] text-slate-400">
                          {doctor.businessType === "RETAIL"
                            ? "Fuera de estos horarios el bot responde que no toma pedidos."
                            : "Fuera de estos horarios el bot responde que no ofrece turnos."}
                        </p>
                      </div>
                    </div>
                  {patientViewLoading && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                      {isMedicalDoctor
                        ? "Cargando datos del paciente..."
                        : "Cargando datos del cliente..."}
                    </div>
                  )}
                  {isMedicalDoctor && profileEditorOpen && patientViewData && (
                    <div className="rounded-2xl card-surface p-4 md:p-6 space-y-4">
                      <div className="flex flex-col gap-1">
                        <h4 className="text-base font-semibold text-slate-900">
                          Completar ficha del paciente
                        </h4>
                        <p className="text-sm text-slate-500">
                          Actualizá los datos para mantener la ficha al día.
                        </p>
                      </div>
                      {profileSaveError && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                          {profileSaveError}
                        </div>
                      )}
                      {profileSaveSuccess && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                          {profileSaveSuccess}
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(isMedicalDoctor
                          ? [
                              { label: "Nombre completo", field: "fullName", type: "text" },
                              { label: "Teléfono", field: "phone", type: "text" },
                              { label: "DNI", field: "dni", type: "text" },
                              { label: "Fecha de nacimiento", field: "birthDate", type: "date" },
                              { label: "Dirección", field: "address", type: "text" },
                              {
                                label: "Obra social",
                                field: "insuranceProvider",
                                type: "text",
                              },
                              { label: "Ocupación", field: "occupation", type: "text" },
                              {
                                label: "Estado civil",
                                field: "maritalStatus",
                                type: "text",
                              },
                            ]
                          : [
                              { label: "Nombre completo", field: "fullName", type: "text" },
                              { label: "Teléfono", field: "phone", type: "text" },
                              { label: "DNI", field: "dni", type: "text" },
                              { label: "Dirección", field: "address", type: "text" },
                            ]
                        ).map((input) => (
                          <label
                            key={`profile-field-${input.field}`}
                            className="flex flex-col gap-1 text-sm"
                          >
                            <span className="text-slate-500">{input.label}</span>
                            <input
                              type={input.type}
                              value={
                                patientProfileForm[
                                  input.field as keyof typeof patientProfileForm
                                ]
                              }
                              onChange={(event) =>
                                handleProfileFieldChange(
                                  input.field as keyof typeof patientProfileForm,
                                  event.target.value
                                )
                              }
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSavePatientProfile}
                          className="btn btn-primary btn-sm"
                          disabled={profileSaving}
                        >
                          {profileSaving ? "Guardando..." : "Guardar ficha"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setProfileEditorOpen(false)}
                          className="btn btn-outline btn-sm"
                          disabled={profileSaving}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {patientViewError && !patientViewLoading && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                      {patientViewError}
                    </div>
                  )}
                  {renderPatientDetailSectionByBusiness()}

                  {patientSummaryModalOpen && (
                    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
                      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-semibold text-slate-900">
                          {isMedicalDoctor ? "Resumen del paciente" : "Resumen del cliente"}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {isMedicalDoctor
                            ? "Generado automáticamente a partir de las consultas y motivos registrados."
                            : "Resumen generado a partir de las notas guardadas de este cliente."}
                        </p>
                      </div>
                          <button
                            type="button"
                            onClick={handleClosePatientSummaryModal}
                            className="btn btn-ghost btn-sm text-base leading-none"
                          >
                            ✕
                          </button>
                        </div>
                        {patientSummaryLoading ? (
                          <p className="text-sm text-slate-500">
                            Generando resumen...
                          </p>
                        ) : patientSummaryError ? (
                          <p className="text-sm text-rose-600">
                            {patientSummaryError}
                          </p>
                        ) : (
                          <div className="whitespace-pre-wrap text-sm text-slate-700 bg-slate-50 rounded-2xl border border-slate-100 p-4">
                            {patientSummary ||
                              "No hay suficiente información para crear un resumen todavía."}
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={loadPatientSummary}
                            disabled={patientSummaryLoading}
                            className="btn btn-outline btn-sm disabled:opacity-50"
                          >
                            {patientSummaryLoading ? "Actualizando..." : "Actualizar"}
                          </button>
                          <button
                            type="button"
                            onClick={handleClosePatientSummaryModal}
                            className="btn btn-primary btn-sm"
                          >
                            Cerrar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {addNoteModalOpen && (
                    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
                      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-lg font-semibold text-slate-900">
                              Agregar nota privada
                            </h4>
                            <p className="text-xs text-slate-500">
                              Estas notas solo las ves vos y tu equipo.
                            </p>
                          </div>
                      <button
                        type="button"
                        onClick={() => setAddNoteModalOpen(false)}
                        className="btn btn-ghost btn-sm text-base leading-none"
                      >
                        ✕
                      </button>
                        </div>
                        <textarea
                          value={addNoteContent}
                          onChange={(e) => setAddNoteContent(e.target.value)}
                          maxLength={800}
                          placeholder={
                            isMedicalDoctor
                              ? "Ej: responde mejor en consultas de tarde, suele presentar cefaleas luego de episodios de estrés..."
                              : "Ej: prefiere entregas por la tarde, coordinar antes de enviar, anotar marcas sugeridas."
                          }
                          className="w-full h-36 rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                        />
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{addNoteContent.length}/800 caracteres</span>
                          {addNoteError && (
                            <span className="text-rose-600">{addNoteError}</span>
                          )}
                          {addNoteSuccess && (
                            <span className="text-emerald-600">{addNoteSuccess}</span>
                          )}
                        </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setAddNoteModalOpen(false)}
                          className="btn btn-outline btn-sm"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleAddPatientNote}
                          disabled={addNoteLoading}
                          className="btn btn-primary btn-sm disabled:opacity-50"
                        >
                          {addNoteLoading ? "Guardando..." : "Guardar nota"}
                        </button>
                      </div>
                      </div>
                    </div>
                  )}
                  {patientNotesModalOpen && (
                    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
                      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-lg font-semibold text-slate-900">
                              Notas del paciente
                            </h4>
                            <p className="text-xs text-slate-500">
                              Registro privado para tu equipo.
                            </p>
                          </div>
                      <button
                        type="button"
                        onClick={handleClosePatientNotesModal}
                        className="btn btn-ghost btn-sm text-base leading-none"
                      >
                        ✕
                      </button>
                        </div>
                        {patientNotesLoading ? (
                          <p className="text-sm text-slate-500">Cargando notas...</p>
                        ) : patientNotesError ? (
                          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {patientNotesError}
                          </div>
                        ) : patientNotes.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            Todavía no agregaste notas para este paciente.
                          </p>
                        ) : (
                          <ul className="space-y-3">
                            {patientNotes.map((note) => (
                              <li
                                key={note.id}
                                className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                              >
                                <p className="text-xs text-slate-500 mb-1">
                                  {new Date(note.createdAt).toLocaleString("es-AR", {
                                    weekday: "short",
                                    day: "2-digit",
                                    month: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </p>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                  {note.content}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={fetchPatientNotes}
                          disabled={patientNotesLoading}
                          className="btn btn-outline btn-sm disabled:opacity-50"
                        >
                          {patientNotesLoading ? "Actualizando..." : "Actualizar"}
                        </button>
                        <button
                          type="button"
                          onClick={handleClosePatientNotesModal}
                          className="btn btn-primary btn-sm"
                        >
                          Cerrar
                        </button>
                      </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {isMedicalDoctor ? (
                    <ClientsHealthList
                      patients={patients}
                      patientStats={patientStats as any}
                      contactLabels={contactLabels}
                      patientSearch={patientSearch}
                      setPatientSearch={setPatientSearch}
                      patientsError={patientsError}
                      loadingPatients={loadingPatients}
                      getPatientTagBadgeClass={getPatientTagBadgeClass}
                      handleOpenPatientDetail={handleOpenPatientDetail}
                      handleOpenPatientChat={handleOpenPatientChat}
                      handleOpenTagModal={handleOpenTagModal}
                    />
                  ) : (
                    <ClientsRetailList
                      patients={patients}
                      patientStats={{ total: patientStats.total }}
                      contactLabels={contactLabels}
                      patientSearch={patientSearch}
                      setPatientSearch={setPatientSearch}
                      patientsError={patientsError}
                      loadingPatients={loadingPatients}
                      handleOpenPatientDetail={handleOpenPatientDetail}
                      handleOpenPatientChat={handleOpenPatientChat}
                    />
                  )}
                </>
              )}
            </section>
          )}

          {activeSection === "history" && (
            <section className="mt-6 space-y-4">
              <div className="rounded-2xl card-surface p-4 md:p-6 space-y-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Historia clínica
                    </h2>
                    <p className="text-sm text-slate-500">
                      Centralizá antecedentes, evoluciones y estudios de tus {contactLabels.pluralLower}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveSection("patients")}
                      className="btn btn-outline btn-sm"
                    >
                      Volver a {contactLabels.pluralLower}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDownloadClinicalHistory();
                      }}
                      className="btn btn-primary btn-sm"
                      disabled={!clinicalHistorySnapshot || clinicalHistoryDownloading}
                    >
                      {clinicalHistoryDownloading
                        ? "Generando..."
                        : "Descargar historia clínica"}
                    </button>
                    {clinicalHistorySnapshot && (
                      <button
                        type="button"
                        onClick={() => setClinicalHistorySnapshot(null)}
                        className="btn btn-ghost btn-sm"
                      >
                        Limpiar selección
                      </button>
                    )}
                  </div>
                </div>

                {!clinicalHistoryPatient ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-sm text-slate-500">
                    <p className="max-w-3xl">
                      Elegí un {contactLabels.singularLower} en la sección de pacientes y tocá el botón “Historia clínica” para visualizarlo acá. Próximamente vas a poder adjuntar estudios, registrar antecedentes y sumar la evolución en cada consulta.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 md:px-6 md:py-5 space-y-4">
                      <div className="flex flex-col gap-1">
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          Paciente seleccionado
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-semibold text-slate-900">
                            {clinicalHistoryPatient.fullName ||
                              `${contactLabels.singularCapitalized} sin nombre`}
                          </h3>
                          {clinicalHistoryPatient.isProfileComplete === false && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              ⚠︎ Ficha incompleta
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">
                          DNI {clinicalHistoryPatient.dni?.trim() || "pendiente"} · Teléfono {clinicalHistoryPatient.phone?.trim() || "sin número"}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                        {[
                          { label: "Fecha de nacimiento", value: formatPatientBirthDate(clinicalHistoryPatient.birthDate), formatted: true },
                          { label: "Dirección", value: clinicalHistoryPatient.address },
                          { label: "Obra social", value: clinicalHistoryPatient.insuranceProvider },
                          { label: "Ocupación", value: clinicalHistoryPatient.occupation },
                          { label: "Estado civil", value: clinicalHistoryPatient.maritalStatus },
                          { label: "Motivo principal", value: clinicalHistoryPatient.consultReason },
                        ].map((field) => (
                          <div
                            key={`history-field-${field.label}`}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                          >
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                              {field.label}
                            </p>
                            <p className="font-semibold text-slate-900 leading-tight line-clamp-2">
                              {field.formatted
                                ? field.value
                                : (typeof field.value === "string" && field.value.trim()) || "Pendiente"}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => handleOpenPatientDetail(clinicalHistoryPatient.id)}
                          className="btn btn-primary btn-sm"
                        >
                          Abrir ficha completa
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleOpenPatientDetail(clinicalHistoryPatient.id);
                            setProfileEditorOpen(true);
                          }}
                          className="btn btn-outline btn-sm"
                        >
                          Completar datos
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 md:px-6 md:py-5">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">
                            Últimas consultas registradas
                          </p>
                          <p className="text-sm text-slate-500">
                            Resumen rápido para tener contexto clínico.
                          </p>
                        </div>
                        <span className="text-xs text-slate-400">
                          {clinicalHistoryConsultations.length} en total
                        </span>
                      </div>
                      {clinicalHistoryConsultations.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          Todavía no registramos consultas para este {contactLabels.singularLower}.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {clinicalHistoryConsultations.slice(0, 4).map((consultation) => {
                            const consultDate = new Date(consultation.dateTime);
                            const readableDate = Number.isNaN(consultDate.getTime())
                              ? "Fecha no disponible"
                              : consultDate.toLocaleDateString("es-AR", {
                                  weekday: "long",
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                });
                            const readableTime = Number.isNaN(consultDate.getTime())
                              ? "—"
                              : consultDate.toLocaleTimeString("es-AR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                });
                            return (
                              <div
                                key={`history-consult-${consultation.id}`}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-col gap-1"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-slate-900">
                                    {consultation.type?.trim() || "Consulta sin detalle"}
                                  </p>
                                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-300 text-slate-600">
                                    {consultation.status?.toUpperCase() || "—"}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500">
                                  {readableDate} · {readableTime}
                                </p>
                                {typeof consultation.price === "number" && (
                                  <p className="text-xs text-slate-500">
                                    Honorarios registrados: $ {consultation.price.toLocaleString("es-AR")}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                          {clinicalHistoryConsultations.length > 4 && (
                            <p className="text-[11px] text-slate-500">
                              Mostrando los últimos 4 registros.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    
                  </div>
                )}
              </div>
            </section>
          )}

          {/* === Sección: AGENDA & TURNOS === */}
          {activeSection === "agenda" && (
            <section className="mt-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Agenda semanal
                  </h2>
                  <p className="text-sm text-slate-500">
                    Visualizá tus turnos confirmados por WhatsApp o desde el dashboard.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={handleCalendarPrevWeek}
                    className="btn btn-outline btn-sm"
                  >
                    Semana anterior
                  </button>
                  <button
                    onClick={handleCalendarToday}
                    className="btn btn-outline btn-sm"
                  >
                    Hoy
                  </button>
                  <button
                    onClick={handleCalendarNextWeek}
                    className="btn btn-outline btn-sm"
                  >
                    Próxima semana
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenCreateAppointmentModal}
                    className="btn btn-primary btn-sm whitespace-nowrap"
                  >
                    Nuevo turno
                  </button>
                </div>
              </div>

              {(loadingCalendar || calendarError) && (
                <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm">
                  {loadingCalendar && (
                    <p className="text-slate-500">Cargando agenda...</p>
                  )}
                  {calendarError && (
                    <p className="text-rose-600">{calendarError}</p>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto overflow-y-visible">
                <div className="min-w-[760px]">
                  <div className="flex border-b border-slate-200">
                    <div className="w-16"></div>
                    {calendarWeekDays.map((day) => (
                      <div
                        key={day.toISOString()}
                        className="flex-1 text-center text-xs py-3 border-l border-slate-100 first:border-l-0"
                      >
                        <div className="font-semibold text-slate-900 uppercase">
                          {day.toLocaleDateString("es-AR", {
                            weekday: "short",
                          })}
                        </div>
                        <div className="text-slate-500">
                          {day.toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex">
                    <div className="w-16 border-r border-slate-200 bg-slate-50 text-[11px] text-slate-400">
                      {Array.from(
                        { length: END_CALENDAR_HOUR - START_CALENDAR_HOUR },
                        (_, idx) => START_CALENDAR_HOUR + idx
                      ).map((hour) => (
                        <div
                          key={hour}
                          className="h-[60px] border-b border-slate-100 flex items-start justify-center pt-1"
                        >
                          {hour.toString().padStart(2, "0")}:00
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 flex">
                      {calendarWeekDays.map((day) => {
                        const dayAppointments = visibleCalendarAppointments.filter(
                          (appt) => isSameDay(new Date(appt.dateTime), day)
                        );
                        const totalHeight =
                          (END_CALENDAR_HOUR - START_CALENDAR_HOUR) *
                          HOUR_HEIGHT;
                        return (
                          <div
                            key={day.toISOString()}
                            className="flex-1 border-r border-slate-100 last:border-r-0 relative"
                          >
                            <div style={{ height: totalHeight }}>
                              {dayAppointments.map((appt) => {
                                const apptDate = new Date(appt.dateTime);
                                const hour = apptDate.getHours();
                                const minutes = apptDate.getMinutes();
                                const top =
                                  (hour - START_CALENDAR_HOUR) * HOUR_HEIGHT +
                                  (minutes / 60) * HOUR_HEIGHT;
                                const patientName =
                                  appt.patient.fullName ||
                                  "Paciente sin nombre";
                                return (
                                  <div
                                    key={appt.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() =>
                                      setActiveAppointmentDetail((prev) =>
                                        prev?.id === appt.id ? null : appt
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setActiveAppointmentDetail((prev) =>
                                          prev?.id === appt.id ? null : appt
                                        );
                                      }
                                    }}
                                    className={`absolute left-1 right-1 rounded-xl px-3 py-2 text-left text-[11px] leading-tight text-white shadow-soft cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/40 overflow-visible ${
                                      appt.source === "whatsapp"
                                        ? "bg-[linear-gradient(90deg,_rgba(1,46,221,0.83)_0%,_rgb(54,95,255)_100%)]"
                                        : "bg-slate-900/90"
                                    }`}
                                    style={{
                                      top: Math.max(0, top),
                                      height: 54,
                                    }}
                                  >
                                    <p className="font-semibold text-xs line-clamp-1">
                                      {patientName}
                                    </p>
                                    <p className="opacity-90 line-clamp-1">
                                      {appt.type || "Consulta"}
                                    </p>
                                    <p className="uppercase text-[10px] opacity-70">
                                      {appt.status}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {!loadingCalendar &&
                !calendarError &&
                visibleCalendarAppointments.length === 0 && (
                  <p className="text-sm text-slate-500">
                    Todavía no hay turnos registrados en esta semana.
                  </p>
                )}
            </section>
          )}

          {/* === Sección: PEDIDOS (Comercios) === */}
          {activeSection === "orders" && (
            <section className="mt-6 space-y-4">
              <div className="rounded-2xl card-surface p-4 md:p-6 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted">
                      Pedidos
                    </p>
                    <h2 className="text-xl font-semibold text-white">
                      Gestión de pedidos
                    </h2>
                    <p className="text-sm text-slate-400">
                      Pedidos generados por el asistente. Estado inicial: Falta revisión.
                    </p>
                  </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchOrders}
                    className="btn btn-outline btn-sm disabled:opacity-60"
                    disabled={ordersLoading}
                  >
                    {ordersLoading ? "Actualizando..." : "Actualizar"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="w-full lg:max-w-sm relative">
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Buscar por cliente, dirección o # de pedido"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/20 pr-20"
                  />
                  {orderSearch && (
                    <button
                      type="button"
                      onClick={() => setOrderSearch("")}
                      className="absolute inset-y-0 right-3 text-xs text-slate-400 hover:text-white"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="inline-flex rounded-2xl border border-white/10 overflow-hidden text-xs font-semibold">
                    {[
                      { key: "today", label: "Hoy" },
                      { key: "this_week", label: "Semana" },
                    { key: "all", label: "Todos" },
                  ].map((opt) => {
                    const active = orderRange === opt.key;
                    return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setOrderRange(opt.key as any)}
                          className={`px-3 py-1.5 first:border-l-0 pill-filter ${
                            active ? "active" : ""
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">
                      Filtrar por pago
                    </span>
                    <div className="relative">
                      <select
                        value={orderPaymentFilter}
                        onChange={(e) =>
                          setOrderPaymentFilter(
                            e.target.value as "all" | "unpaid" | "partial" | "paid"
                          )
                        }
                        className="appearance-none rounded-xl border border-white/10 bg-white/5 pl-3 pr-8 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                      >
                        <option value="all">Todos</option>
                        <option value="unpaid">No pagado</option>
                        <option value="partial">Pago parcial</option>
                        <option value="paid">Pagado</option>
                      </select>
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-slate-300">
                        ▼
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setOrderSearch("");
                      setOrderRange("today");
                      setOrderPaymentFilter("all");
                    }}
                  >
                    Limpiar filtros
                  </button>
                </div>
              </div>

              {ordersError && (
                <p className="text-sm text-rose-400">{ordersError}</p>
              )}

              {ordersLoading && orders.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    Cargando pedidos...
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                    Todavía no hay pedidos. Cuando lleguen por WhatsApp van a aparecer acá.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredOrders.map((order) => {
                      const createdAtLabel = (() => {
                        try {
                          return new Date(order.createdAt).toLocaleString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                        } catch {
                          return "";
                        }
                      })();

                      const statusLabel =
                        order.status === "pending"
                          ? "Falta revisión"
                          : order.status === "confirmed"
                          ? "Confirmado"
                          : "Cancelado";
                      const statusClass =
                        order.status === "pending"
                          ? "bg-amber-500/15 text-amber-200 border border-amber-500/30"
                          : order.status === "confirmed"
                          ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-200 border border-rose-500/30";
                      const payStatusClass =
                        order.paymentStatus === "paid"
                          ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
                          : order.paymentStatus === "partial"
                          ? "bg-amber-500/15 text-amber-200 border border-amber-500/30"
                          : "bg-slate-500/15 text-slate-200 border border-slate-500/30";
                      const payStatusLabel =
                        order.paymentStatus === "paid"
                          ? "Pagado"
                          : order.paymentStatus === "partial"
                          ? "Pago parcial"
                          : "No pagado";

                      return (
                        <div
                          key={order.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setOrderModalId(order.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOrderModalId(order.id);
                            }
                          }}
                          className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2 cursor-pointer transition hover:border-white/20"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm text-slate-400">
                                Pedido #{order.sequenceNumber} · {createdAtLabel}
                              </p>
                              <h3 className="text-lg font-semibold text-white">
                                {order.customerName || "Cliente WhatsApp"}
                              </h3>
                              {order.customerAddress && (
                                <p className="text-sm text-slate-400">{order.customerAddress}</p>
                              )}
                              {order.customerDni && (
                                <p className="text-xs text-slate-500">DNI: {order.customerDni}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[11px] px-3 py-1 rounded-full ${statusClass}`}
                              >
                                {statusLabel}
                              </span>
                              <span
                                className={`text-[11px] px-3 py-1 rounded-full ${payStatusClass} shadow-sm`}
                              >
                                {payStatusLabel}
                              </span>
                              {!!(order.promotions && order.promotions.length) && (
                                <span className="text-[11px] px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-100 border border-emerald-500/30">
                                  Promo aplicada
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <div className="text-sm text-slate-300">
                              Total:{" "}
                              <span className="font-semibold text-white">
                                ${order.totalAmount.toLocaleString("es-AR")}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOrderModalId(order.id);
                              }}
                            >
                              Ver pedido completo
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {orderDeleteModalId !== null && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
                  <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-semibold text-slate-900">
                          Eliminar pedido
                        </h4>
                        <p className="text-sm text-slate-600">
                          Esta acción borrará el pedido de la lista. ¿Querés continuar?
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setOrderDeleteModalId(null)}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setOrderDeleteModalId(null)}
                        disabled={orderUpdatingId === orderDeleteModalId}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm disabled:opacity-60"
                        onClick={() =>
                          orderDeleteModalId !== null && handleDeleteOrder(orderDeleteModalId)
                        }
                        disabled={orderUpdatingId === orderDeleteModalId}
                      >
                        {orderUpdatingId === orderDeleteModalId ? "Eliminando..." : "Eliminar"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

      {orderModalId !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl p-6 space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-semibold text-slate-900">Detalle del pedido</h4>
                        <p className="text-sm text-slate-600">
                          {(() => {
                            const ord = orders.find((o) => o.id === orderModalId);
                            if (!ord) return "";
                            const createdAtLabel = (() => {
                              try {
                                return new Date(ord.createdAt).toLocaleString("es-AR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                });
                              } catch {
                                return "";
                              }
                            })();
                            return `#${ord.sequenceNumber} · ${createdAtLabel}`;
                          })()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setOrderModalId(null)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {(() => {
                      const ord = orders.find((o) => o.id === orderModalId);
                      if (!ord)
                        return <p className="text-sm text-slate-600">Pedido no encontrado.</p>;
                      return (
                        <div className="space-y-4">
                          <div className="border-b border-slate-200 -mt-3 mb-5">
                            <div className="flex gap-2">
                              {[
                                { key: "details", label: "Detalle" },
                                { key: "payments", label: "Pagos" },
                                { key: "attachments", label: "Comprobantes" },
                              ].map((tab) => {
                                const active = orderModalTab === tab.key;
                                return (
                                  <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() =>
                                      setOrderModalTab(tab.key as "details" | "payments")
                                    }
                                    className={`px-4 py-2 text-sm font-semibold transition border-b-2 ${
                                      active
                                        ? "border-emerald-500 text-slate-900"
                                        : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-200"
                                    }`}
                                  >
                                    {tab.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {orderModalTab === "details" ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-700">
                                <p>
                                  <span className="font-semibold">Cliente:</span>{" "}
                                  {ord.customerName || "Cliente WhatsApp"}
                                </p>
                                <p>
                                  <span className="font-semibold">Total:</span>{" "}
                                  ${ord.totalAmount.toLocaleString("es-AR")}
                                </p>
                                {ord.customerAddress && (
                                  <p className="col-span-1 sm:col-span-2">
                                    <span className="font-semibold">Dirección:</span>{" "}
                                    {ord.customerAddress}
                                  </p>
                                )}
                                {ord.customerDni && (
                                  <p>
                                    <span className="font-semibold">DNI:</span> {ord.customerDni}
                                  </p>
                                )}
                                <p className="capitalize">
                                  <span className="font-semibold">Estado:</span>{" "}
                                  {ord.status === "pending" ? "Falta revisión" : ord.status}
                                </p>
                                <p>
                                  <span className="font-semibold">Pago:</span>{" "}
                                  {ord.paymentStatus === "paid"
                                    ? "Pagado"
                                    : ord.paymentStatus === "partial"
                                    ? "Parcial"
                                    : "No pagado"}{" "}
                                  ({(ord.paidAmount || 0).toLocaleString("es-AR")} /{" "}
                                  {ord.totalAmount.toLocaleString("es-AR")})
                                </p>
                              </div>
                              {!!(ord.promotions && ord.promotions.length) && (
                                <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 space-y-2 shadow-sm">
                                  <div className="flex items-center gap-2 text-emerald-800">
                                    <span className="text-base">🪄</span>
                                    <div>
                                      <p className="text-sm font-semibold leading-tight">
                                        Promos aplicadas
                                      </p>
                                      <p className="text-xs text-emerald-700">
                                        Se aplican al total y quedan registradas en el ticket.
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {ord.promotions.map((promo) => (
                                      <div
                                        key={promo.id}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 py-2 shadow-sm"
                                      >
                                        <div className="flex flex-col leading-tight">
                                          <span className="text-xs font-semibold text-emerald-900">
                                            {promo.title}
                                          </span>
                                          <span className="text-[11px] text-emerald-700">
                                            {promo.discountType === "percent"
                                              ? `-${promo.discountValue}%`
                                              : `-$${promo.discountValue.toLocaleString("es-AR")}`}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="rounded-xl border border-slate-200 overflow-hidden">
                                <div className="grid grid-cols-4 text-xs font-semibold text-slate-600 px-3 py-2 bg-slate-50">
                                  <span className="col-span-2">Producto</span>
                                  <span className="text-right">Cant.</span>
                                  <span className="text-right">Subtotal</span>
                                </div>
                                <div className="divide-y divide-slate-200 text-sm">
                                  {ord.items.map((item) => (
                                    <div
                                      key={item.id}
                                      className="grid grid-cols-4 px-3 py-2 text-slate-800 items-center"
                                    >
                                      <span className="col-span-2">{item.productName}</span>
                                      <span className="text-right">{item.quantity}</span>
                                      <span className="text-right">
                                        ${(item.quantity * item.unitPrice).toLocaleString("es-AR")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : orderModalTab === "payments" ? (
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-slate-900">Estado de pago</p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className={`btn btn-sm ${
                                    orderPaymentStatus === "unpaid" ? "btn-danger" : "btn-outline"
                                  }`}
                                  onClick={() => {
                                    setOrderPaymentDirty(true);
                                    setOrderPaymentStatus("unpaid");
                                    setOrderPaymentMode("custom");
                                    setOrderPaymentCustom(0);
                                    handleUpdateOrderStatus(ord.id, ord.status, ord, {
                                      paymentStatus: "unpaid",
                                      paidAmount: 0,
                                      suppressPrint: true,
                                    });
                                  }}
                                  disabled={orderUpdatingId === orderModalId}
                                >
                                  No pagado
                                </button>
                                <button
                                  type="button"
                                  className={`btn btn-sm ${
                                    orderPaymentStatus !== "unpaid" ? "btn-primary" : "btn-outline"
                                  }`}
                                  onClick={() => {
                                    setOrderPaymentDirty(true);
                                    setOrderPaymentStatus("paid");
                                    setOrderPaymentMode("full");
                                    setOrderPaymentCustom(ord.totalAmount);
                                    handleUpdateOrderStatus(ord.id, ord.status, ord, {
                                      paymentStatus: "paid",
                                      paidAmount: ord.totalAmount,
                                      suppressPrint: true,
                                    });
                                  }}
                                  disabled={orderUpdatingId === orderModalId}
                                >
                                  Pagado
                                </button>
                              </div>

                              {orderPaymentStatus !== "unpaid" && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm text-slate-700">
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <label className="flex items-center gap-1">
                                      <input
                                        type="radio"
                                        checked={orderPaymentMode === "full"}
                                        onChange={() => {
                                          setOrderPaymentDirty(true);
                                          setOrderPaymentMode("full");
                                          setOrderPaymentCustom(ord.totalAmount);
                                          setOrderPaymentStatus("paid");
                                          handleUpdateOrderStatus(ord.id, ord.status, ord, {
                                            paymentStatus: "paid",
                                            paidAmount: ord.totalAmount,
                                            suppressPrint: true,
                                          });
                                        }}
                                      />
                                      Monto total (${ord.totalAmount.toLocaleString("es-AR")})
                                    </label>
                                    <label className="flex items-center gap-1">
                                      <input
                                        type="radio"
                                        checked={orderPaymentMode === "custom"}
                                        onChange={() => {
                                          setOrderPaymentDirty(true);
                                          setOrderPaymentMode("custom");
                                        }}
                                      />
                                      Custom
                                    </label>
                                    {orderPaymentMode === "custom" && (
                                      <input
                                        type="number"
                                        className="w-28 rounded border border-slate-300 px-2 py-1 text-right"
                                        value={orderPaymentCustom}
                                        onChange={(e) => {
                                          setOrderPaymentDirty(true);
                                          const val = Math.max(0, Number(e.target.value) || 0);
                                          const status =
                                            val === 0
                                              ? "unpaid"
                                              : val >= ord.totalAmount
                                              ? "paid"
                                              : "partial";
                                          setOrderPaymentCustom(val);
                                          setOrderPaymentStatus(
                                            status as "unpaid" | "partial" | "paid"
                                          );
                                          handleUpdateOrderStatus(ord.id, ord.status, ord, {
                                            paymentStatus: status,
                                            paidAmount: val,
                                            suppressPrint: true,
                                          });
                                        }}
                                      />
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-500">
                                    Pagado: ${orderPaymentCustom.toLocaleString("es-AR")} / $
                                    {ord.totalAmount.toLocaleString("es-AR")}
                                  </p>
                                </div>
                              )}
                              {(ord.paymentStatus === "unpaid" || ord.paymentStatus === "partial") && (
                                <div className="pt-2">
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => {
                                      const pendingAmount = Math.max(
                                        0,
                                        (ord.totalAmount || 0) - (ord.paidAmount || 0)
                                      );
                                      setOrderReminderConfirmId(ord.id);
                                      setOrderReminderPendingAmount(pendingAmount);
                                    }}
                                    disabled={
                                      orderReminderSendingId === ord.id || orderUpdatingId === ord.id
                                    }
                                  >
                                    {orderReminderSendingId === ord.id
                                      ? "Enviando..."
                                      : "Enviar recordatorio"}
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <div className="space-y-1">
                                  <p className="text-sm font-semibold text-slate-900">
                                    Comprobantes del pedido
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    Subí imágenes o PDF relacionados al pedido.
                                  </p>
                                  {orderAttachmentError && (
                                    <p className="text-xs text-rose-600">{orderAttachmentError}</p>
                                  )}
                                </div>
                                <label className="btn btn-primary btn-sm cursor-pointer whitespace-nowrap">
                                  {orderAttachmentUploadingId === ord.id ? "Subiendo..." : "Subir archivo"}
                                  <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file && orderModalId !== null) {
                                        handleUploadOrderAttachment(orderModalId, file);
                                      }
                                      e.target.value = "";
                                    }}
                                    disabled={orderAttachmentUploadingId === ord.id}
                                  />
                                </label>
                              </div>

                              {Array.isArray(ord.attachments) && ord.attachments.length > 0 ? (
                                <div className="rounded-xl border border-slate-200 divide-y divide-slate-200">
                                  {[...ord.attachments]
                                    .sort(
                                      (a, b) =>
                                        new Date(b.createdAt).getTime() -
                                        new Date(a.createdAt).getTime()
                                    )
                                    .map((att) => {
                                      const createdLabel = (() => {
                                        try {
                                          return new Date(att.createdAt).toLocaleString("es-AR", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          });
                                        } catch {
                                          return "";
                                        }
                                      })();
                                      const fileUrl = buildApiUrl(att.url);
                                      return (
                                        <div
                                          key={att.id}
                                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 text-sm text-slate-800"
                                        >
                                          <div className="space-y-0.5">
                                            <p className="font-semibold">
                                              {att.filename || "Comprobante"}
                                            </p>
                                            <p className="text-xs text-slate-500">{createdLabel}</p>
                                          </div>
                                          <a
                                            href={fileUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="btn btn-outline btn-sm"
                                          >
                                            Ver / Descargar
                                          </a>
                                        </div>
                                      );
                                    })}
                                </div>
                              ) : (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 text-center">
                                  Todavía no hay comprobantes para este pedido.
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex justify-between items-center text-sm">
                            <button
                              type="button"
                              className="btn btn-danger btn-sm disabled:opacity-60"
                              onClick={() => {
                                if (orderModalId !== null) {
                                  setOrderDeleteModalId(orderModalId);
                                }
                              }}
                              disabled={orderUpdatingId === orderModalId}
                            >
                              Eliminar
                            </button>
                            <div className="flex items-center gap-2">
                              {ord.status === "pending" && (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm disabled:opacity-60"
                                  onClick={() => handleUpdateOrderStatus(ord.id, "confirmed", ord)}
                                  disabled={orderUpdatingId === orderModalId}
                                >
                                  {orderUpdatingId === orderModalId
                                    ? "Guardando..."
                                    : "Confirmar e imprimir"}
                                </button>
                              )}
                              {ord.status === "confirmed" && (
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={() => printOrderReceipt(ord)}
                                  disabled={orderUpdatingId === orderModalId}
                                >
                                  Imprimir boleta
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setOrderModalId(null)}
                              >
                                Cerrar
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
          </div>
        </div>
      )}

      {orderReminderConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-5 space-y-4">
            <div className="space-y-2">
              <h4 className="text-lg font-semibold text-slate-900">Enviar recordatorio</h4>
              <p className="text-sm text-slate-600">
                Registramos una deuda hasta la fecha de ${orderReminderPendingAmount} por el pedido #
                {
                  orders.find((o) => o.id === orderReminderConfirmId)?.sequenceNumber ??
                  orderReminderConfirmId
                }
                . ¿Querés enviar este recordatorio al cliente?
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 text-sm">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setOrderReminderConfirmId(null)}
                disabled={orderReminderSendingId === orderReminderConfirmId}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm disabled:opacity-60"
                onClick={() => {
                  const ord = orders.find((o) => o.id === orderReminderConfirmId);
                  if (ord) {
                    handleSendPaymentReminder(ord);
                  }
                  setOrderReminderConfirmId(null);
                }}
                disabled={orderReminderSendingId === orderReminderConfirmId}
              >
                {orderReminderSendingId === orderReminderConfirmId ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

            </section>
          )}

          {/* === Sección: SEGUIMIENTO DE DEUDAS (Retail) === */}
          {activeSection === "debts" && (
            <section className="mt-6 space-y-4">
              {!isRetailBusiness ? (
                <div className="rounded-2xl card-surface p-4 text-sm text-slate-400">
                  Disponible solo para comercios.
                </div>
              ) : (
                <>
                  <div className="rounded-2xl card-surface p-4 md:p-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted">
                          Seguimiento de deudas
                        </p>
                        <h2 className="text-xl font-semibold text-white">
                          Cobros pendientes
                        </h2>
                        <p className="text-sm text-slate-400">
                          Filtrá pedidos sin pagar según la antigüedad y enviá recordatorios.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={fetchOrders}
                        className="btn btn-outline btn-sm disabled:opacity-60"
                        disabled={ordersLoading}
                      >
                        {ordersLoading ? "Actualizando..." : "Actualizar"}
                      </button>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted">
                          Ver deudas con tiempo de
                        </label>
                        <div className="flex items-center gap-2">
                          <select
                            value={debtFilterInput}
                            onChange={(e) => setDebtFilterInput(Number(e.target.value))}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                          >
                            {[1, 2, 3, 7, 14, 30].map((days) => (
                              <option key={days} value={days}>
                                {days} {days === 1 ? "día" : "días"}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setDebtFilterDays(debtFilterInput)}
                          >
                            Aplicar
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setDebtFilterInput(0);
                              setDebtFilterDays(0);
                            }}
                          >
                            Ver todas
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Mostrando deudas con antigüedad mayor o igual a {debtFilterDays}{" "}
                          {debtFilterDays === 1 ? "día" : "días"}.
                        </p>
                      </div>
                    </div>
                  </div>

                  {ordersError && (
                    <p className="text-sm text-rose-400">{ordersError}</p>
                  )}

                  <div className="space-y-3">
                    {ordersLoading && debtOrders.length === 0 ? (
                      <div className="rounded-2xl card-surface p-4 text-sm text-slate-400">
                        Cargando deudas...
                      </div>
                    ) : debtOrders.length === 0 ? (
                      <div className="rounded-2xl card-surface p-4 text-sm text-slate-400">
                        No encontramos pedidos con deuda en este rango.
                      </div>
                    ) : (
                      <VirtualizedList
                        items={debtOrders}
                        itemHeight={210}
                        height={720}
                        overscan={4}
                        renderItem={({ item, style }) => {
                          const { order, outstanding, ageDays } = item;
                          const createdAtLabel = (() => {
                            try {
                              return new Date(order.createdAt).toLocaleString("es-AR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                            } catch {
                              return "";
                            }
                          })();
                          return (
                            <div style={style} className="px-1">
                              <div className="rounded-2xl card-surface p-4 md:p-5 flex flex-col gap-3 h-[194px]">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-xs uppercase tracking-wide text-muted">
                                      Pedido #{order.sequenceNumber} · {createdAtLabel}
                                    </p>
                                    <h3 className="text-lg font-semibold text-white">
                                      {order.customerName || "Cliente WhatsApp"}
                                    </h3>
                                    {order.customerAddress && (
                                      <p className="text-sm text-slate-400">{order.customerAddress}</p>
                                    )}
                                  </div>
                                  <div className="text-right text-sm text-slate-300">
                                    <p>
                                      Total:{" "}
                                      <span className="font-semibold text-white">
                                        ${order.totalAmount.toLocaleString("es-AR")}
                                      </span>
                                    </p>
                                    <p>
                                      Pagado:{" "}
                                      <span className="font-semibold text-white">
                                        ${(order.paidAmount ?? 0).toLocaleString("es-AR")}
                                      </span>
                                    </p>
                                    <p className="text-amber-200">
                                      Deuda: ${outstanding.toLocaleString("es-AR")}
                                    </p>
                                    <p className="text-[11px] text-slate-400">
                                      Antigüedad: {ageDays} {ageDays === 1 ? "día" : "días"}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => {
                                      setActiveSection("orders");
                                      setOrderModalId(order.id);
                                    }}
                                  >
                                    Ver pedido
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm disabled:opacity-60"
                                    onClick={() => handleSendPaymentReminder(order)}
                                    disabled={orderReminderSendingId === order.id}
                                  >
                                    {orderReminderSendingId === order.id
                                      ? "Enviando..."
                                      : "Enviar recordatorio"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      />
                    )}
                  </div>
                </>
              )}
            </section>
          )}

          {/* === Sección: PROMOCIONES (Retail) === */}
          {activeSection === "promotions" && (
            <section className="mt-6 space-y-4">
              {!isRetailBusiness ? (
                <div className="rounded-2xl card-surface p-4 text-sm text-slate-400">
                  Esta sección está disponible solo para comercios.
                </div>
              ) : (
                <div className="rounded-2xl card-surface p-4 md:p-6 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted">
                        Promociones
                      </p>
                      <h2 className="text-xl font-semibold text-white">
                        Crear y difundir promos
                      </h2>
                      <p className="text-sm text-slate-400">
                        Descuentos por producto o etiquetas, con duración o hasta agotar stock.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => fetchPromotions()}
                      disabled={promotionsLoading}
                    >
                      {promotionsLoading ? "Actualizando..." : "Actualizar"}
                    </button>
                  </div>

                  {promotionsError && (
                    <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 text-rose-200 text-sm px-3 py-2">
                      {promotionsError}
                    </div>
                  )}

                  <div className="space-y-5">
                    <div className="space-y-3">
                      <div className="grid md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-muted block mb-1">
                            Título de la promo
                          </label>
                          <input
                            type="text"
                            name="title"
                            value={promotionForm.title}
                            onChange={handlePromotionFieldChange}
                            className="w-full rounded-xl border border-slate-700 bg-[#0f1217] text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-600"
                            placeholder="Ej: 20% en bebidas"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-semibold text-muted block mb-1">
                              Tipo de descuento
                            </label>
                            <select
                              name="discountType"
                              value={promotionForm.discountType}
                              onChange={handlePromotionFieldChange}
                              className="w-full rounded-xl border border-slate-700 bg-[#0f1217] text-sm text-white px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-slate-600 appearance-none"
                              style={{
                                backgroundImage:
                                  "linear-gradient(45deg, transparent 50%, #94a3b8 50%), linear-gradient(135deg, #94a3b8 50%, transparent 50%), linear-gradient(to right, #0f1217, #0f1217)",
                                backgroundPosition:
                                  "calc(100% - 18px) calc(1.1em + 2px), calc(100% - 13px) calc(1.1em + 2px), 100% 0",
                                backgroundSize: "5px 5px, 5px 5px, 2.5em 100%",
                                backgroundRepeat: "no-repeat",
                              }}
                            >
                              <option value="amount">Monto ($)</option>
                              <option value="percent">Porcentaje (%)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-muted block mb-1">
                              Valor
                            </label>
                            <input
                              type="number"
                              name="discountValue"
                              value={promotionForm.discountValue}
                              onChange={handlePromotionFieldChange}
                              className="w-full rounded-xl border border-slate-700 bg-[#0f1217] text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-600"
                              placeholder="Ej: 500 o 20"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-muted block mb-1">
                          Descripción (opcional)
                        </label>
                        <textarea
                          name="description"
                          value={promotionForm.description}
                          onChange={handlePromotionFieldChange}
                          className="w-full rounded-xl border border-slate-700 bg-[#0f1217] text-sm text-white px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-slate-600"
                          placeholder="Ej: Promo de verano, combinable con 2x1 en snacks."
                        />
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-700 bg-[#0f1217] p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-wide text-muted">
                              Productos incluidos
                            </p>
                            <span className="text-[11px] text-muted">
                              {promotionForm.productIds.length} seleccionados
                            </span>
                          </div>
                          <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                            {products.length === 0 && (
                              <p className="text-xs text-muted">
                                No tenés productos cargados.
                              </p>
                            )}
                            {products.map((prod) => {
                              const checked = promotionForm.productIds.includes(prod.id);
                              return (
                                <label
                                  key={prod.id}
                                  className="flex items-center gap-2 text-sm text-white cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => handleTogglePromotionProduct(prod.id)}
                                    className="rounded border-slate-500 text-slate-700"
                                  />
                                  <span className="text-slate-200 line-clamp-1">
                                    {prod.name}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-700 bg-[#0f1217] p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-wide text-muted">
                              Etiquetas de producto
                            </p>
                            <span className="text-[11px] text-muted">
                              Opcional
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {productTagOptions.length === 0 ? (
                              <p className="text-xs text-muted">
                                Sin etiquetas creadas aún.
                              </p>
                            ) : (
                              productTagOptions.map((label) => {
                                const active = promotionForm.productTagLabels.includes(label);
                                return (
                                  <button
                                    key={label}
                                    type="button"
                                    onClick={() => handleTogglePromotionTag(label)}
                                    className={`px-3 py-1 rounded-full border text-xs transition ${
                                      active
                                        ? "border-emerald-500 text-emerald-200 bg-emerald-500/10"
                                        : "border-slate-600 text-slate-200 hover:border-slate-400"
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })
                            )}
                          </div>
                          <p className="text-[11px] text-muted">
                            Si seleccionás etiquetas, la promo se aplica a productos con esas etiquetas.
                          </p>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-muted block mb-1">
                            Duración (días)
                          </label>
                          <input
                            type="number"
                            name="durationDays"
                            value={promotionForm.durationDays}
                            onChange={handlePromotionFieldChange}
                            className="w-full rounded-xl border border-slate-700 bg-[#0f1217] text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-600"
                            placeholder="Ej: 7"
                            min={0}
                          />
                          <p className="text-[11px] text-muted mt-1">
                            Si dejás vacío, usa solo “hasta agotar stock”.
                          </p>
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <label className="text-xs font-semibold text-muted block">
                            Imagen de la promo
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="btn btn-outline btn-sm cursor-pointer">
                              Subir imagen
                              <input
                                type="file"
                                accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
                                className="hidden"
                                onChange={handlePromotionImageChange}
                              />
                            </label>
                            {promotionImagePreview && (
                              <>
                                <div className="w-20 h-14 rounded-lg overflow-hidden border border-slate-600">
                                  <img
                                    src={promotionImagePreview}
                                    alt="Preview"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs"
                                  onClick={handleClearPromotionImage}
                                >
                                  Quitar
                                </button>
                              </>
                            )}
                            {!promotionImagePreview && (
                              <span className="text-xs text-muted">
                                PNG/JPG/WEBP · máx 2 MB
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted">
                            Esta imagen se enviará junto al mensaje de la promo.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-6">
                          <input
                            type="checkbox"
                            name="untilStockOut"
                            checked={promotionForm.untilStockOut}
                            onChange={handlePromotionFieldChange}
                            className="rounded border-slate-500 text-slate-700"
                          />
                          <label className="text-sm text-slate-200">
                            Hasta agotar stock
                          </label>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleCreatePromotion}
                          disabled={promotionsLoading}
                        >
                          {promotionsLoading ? "Guardando..." : "Crear promoción"}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-700 bg-[#0f1217] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">Promos activas</h3>
                        <span className="text-[11px] text-muted">{promotions.length} en total</span>
                      </div>
                      {promotionsLoading && promotions.length === 0 && (
                        <p className="text-xs text-muted">Cargando promos...</p>
                      )}
                      {!promotionsLoading && promotions.length === 0 && (
                        <p className="text-xs text-muted">
                          Todavía no creaste promociones.
                        </p>
                      )}
                      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {promotions.map((promo) => {
                          const discountLabel =
                            promo.discountType === "percent"
                              ? `${promo.discountValue}%`
                              : `$${promo.discountValue}`;
                          const promoImage = resolveAssetUrl(promo.imageUrl);
                          const productsLabel =
                            promo.productIds.length > 0
                              ? promo.productIds
                                  .map((id) => productNameById.get(id) || `ID ${id}`)
                                  .join(", ")
                              : promo.productTagLabels.length > 0
                              ? `Etiquetas: ${promo.productTagLabels.join(", ")}`
                              : "Aplica a los productos seleccionados por etiquetas.";
                          const durationLabel = promo.untilStockOut
                            ? "Hasta agotar stock"
                            : promo.endDate
                            ? `Hasta ${new Date(promo.endDate).toLocaleDateString("es-AR")}`
                            : "Sin fecha de fin";
                          return (
                            <div
                              key={promo.id}
                              className="rounded-xl border border-slate-700 bg-[#0b1016] p-3 space-y-2"
                            >
                              {promoImage && (
                                <div className="w-full h-28 rounded-lg overflow-hidden border border-slate-700 bg-[#0f1217]">
                                  <img
                                    src={promoImage}
                                    alt={promo.title}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-white">
                                    {promo.title} · {discountLabel} OFF
                                  </p>
                                  <p className="text-xs text-muted">{promo.description || "Sin descripción"}</p>
                                </div>
                                <span
                                  className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                    promo.isActive
                                      ? "border-emerald-500 text-emerald-200"
                                      : "border-slate-600 text-slate-400"
                                  }`}
                                >
                                  {promo.isActive ? "Activa" : "Inactiva"}
                                </span>
                              </div>
                              <p className="text-xs text-muted">
                                {productsLabel}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {durationLabel}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-black text-xs font-semibold shadow-lg hover:shadow-xl transition"
                                  onClick={() => openPromotionSendModal(promo)}
                                >
                                  <span>Enviar a clientes</span>
                                  <span aria-hidden="true">💬</span>
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-rose-400/40 text-xs font-semibold text-rose-100 hover:bg-rose-500/10"
                                  onClick={() => handleDeletePromotion(promo.id)}
                                >
                                  ✕ Eliminar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* === Sección: MÉTRICAS === */}
          {activeSection === "metrics" && (
            <section className="mt-6 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Métricas del negocio
                  </h2>
                  <p className="text-sm text-slate-500">
                    {isRetailBusiness
                      ? "Seguimiento de pedidos, ingresos y productos."
                      : `Seguimiento de turnos, cancelaciones e ingresos (${metricsRangeLabel.toLowerCase()}).`}
                  </p>
                </div>
                <div className="inline-flex rounded-2xl border border-slate-700/60 overflow-hidden text-xs font-semibold">
                  {METRICS_RANGE_OPTIONS.map((option) => {
                    const active = metricsRange === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setMetricsRange(option.key)}
                        className={`px-3 py-1.5 first:border-l-0 pill-filter ${
                          active ? "active" : ""
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isRetailBusiness ? (
                retailMetricsLoading ? (
                  <div className="rounded-2xl border border-slate-100 bg-white px-4 py-6 text-sm text-slate-500">
                    Cargando métricas de pedidos...
                  </div>
                ) : retailMetricsError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
                    {retailMetricsError}
                  </div>
                ) : !retailMetrics ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                    No hay datos de pedidos en este rango. Probá con otro filtro.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl card-surface p-4">
                        <p className="text-xs uppercase tracking-wide text-muted">
                          Pedidos totales
                        </p>
                        <p className="text-2xl font-semibold text-white">
                          {retailMetrics.totals.total}
                        </p>
                        <p className="text-xs text-muted mt-1">
                          Confirmados: {retailMetrics.totals.confirmed}
                        </p>
                      </div>
                      <div className="rounded-2xl card-surface p-4">
                        <p className="text-xs uppercase tracking-wide text-muted">
                          Pendientes
                        </p>
                        <p className="text-2xl font-semibold text-amber-200">
                          {retailMetrics.totals.pending}
                        </p>
                        <p className="text-xs text-muted mt-1">En revisión</p>
                      </div>
                      <div className="rounded-2xl card-surface p-4">
                        <p className="text-xs uppercase tracking-wide text-muted">
                          Cancelados
                        </p>
                        <p className="text-2xl font-semibold text-rose-200">
                          {retailMetrics.totals.cancelled}
                        </p>
                        <p className="text-xs text-muted mt-1">No generan ingreso</p>
                      </div>
                      <div className="rounded-2xl card-surface p-4">
                        <p className="text-xs uppercase tracking-wide text-muted">
                          Clientes únicos
                        </p>
                        <p className="text-2xl font-semibold text-white">
                          {retailMetrics.clients.unique}
                        </p>
                        <p className="text-xs text-muted mt-1">En el rango seleccionado</p>
                      </div>
                      </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl card-surface p-5 space-y-3 lg:col-span-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted">
                            Ingresos
                          </p>
                          <p className="text-sm text-muted">
                            Cobrados vs potenciales ({metricsRangeLabel.toLowerCase()})
                          </p>
                        </div>
                        <div className="grid md:grid-cols-3 gap-3 text-sm">
                          <div className="rounded-xl card-muted p-3">
                            <p className="text-xs uppercase tracking-wide text-muted">
                              Cobrados
                            </p>
                            <p className="text-xl font-semibold text-emerald-200">
                              ${" "}
                              {retailMetrics.revenue.paid.toLocaleString("es-AR")}
                            </p>
                            <p className="text-[11px] text-muted mt-1">
                              Ticket: ${" "}
                              {retailMetrics.revenue.avgTicketPaid.toLocaleString("es-AR")}
                            </p>
                          </div>
                          <div className="rounded-xl card-muted p-3">
                            <p className="text-xs uppercase tracking-wide text-muted">
                              Potencial
                            </p>
                            <p className="text-xl font-semibold text-white">
                              ${" "}
                              {retailMetrics.revenue.total.toLocaleString("es-AR")}
                            </p>
                            <p className="text-[11px] text-muted mt-1">
                              Incluye pedidos no pagados
                            </p>
                          </div>
                          <div className="rounded-xl card-muted p-3">
                            <p className="text-xs uppercase tracking-wide text-muted">
                              Deuda / pendiente
                            </p>
                            <p className="text-xl font-semibold text-amber-200">
                              ${" "}
                              {(retailMetrics.revenue.outstanding +
                                retailMetrics.revenue.partialOutstanding).toLocaleString(
                                "es-AR"
                              )}
                            </p>
                            <p className="text-[11px] text-muted mt-1">
                              Incluye pagos parciales
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl card-surface p-5 space-y-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted">
                            Productos destacados
                          </p>
                          <p className="text-sm text-muted">
                            Dentro del rango seleccionado
                          </p>
                        </div>
                        <div className="rounded-xl card-muted p-3 space-y-2 text-sm">
                          <p className="text-xs uppercase tracking-wide text-emerald-200">
                            Más vendido
                          </p>
                          {retailMetrics.products.best ? (
                            <>
                              <p className="font-semibold text-white">
                                {retailMetrics.products.best.name}
                              </p>
                              <p className="text-muted text-xs">
                                {retailMetrics.products.best.quantity} unidades · ${" "}
                                {retailMetrics.products.best.revenue.toLocaleString("es-AR")}
                              </p>
                            </>
                          ) : (
                            <p className="text-muted text-xs">Sin datos</p>
                          )}
                        </div>
                        <div className="rounded-xl card-muted p-3 space-y-2 text-sm">
                          <p className="text-xs uppercase tracking-wide text-rose-200">
                            Menos vendido
                          </p>
                          {retailMetrics.products.worst ? (
                            <>
                              <p className="font-semibold text-white">
                                {retailMetrics.products.worst.name}
                              </p>
                              <p className="text-muted text-xs">
                                {retailMetrics.products.worst.quantity} unidades · ${" "}
                                {retailMetrics.products.worst.revenue.toLocaleString("es-AR")}
                              </p>
                            </>
                          ) : (
                            <p className="text-muted text-xs">Sin datos</p>
                          )}
                        </div>
                        <div className="rounded-xl card-muted p-3 space-y-2 text-sm">
                          <p className="text-xs uppercase tracking-wide text-emerald-200">
                            Promos
                          </p>
                          {retailMetrics.promotions ? (
                            <>
                              <p className="font-semibold text-white">
                                {retailMetrics.promotions.appliedOrders} pedidos con promo
                              </p>
                              <p className="text-muted text-xs">
                                Ahorro estimado: ${" "}
                                {retailMetrics.promotions.totalDiscount.toLocaleString("es-AR")}
                              </p>
                              {retailMetrics.promotions.top ? (
                                <p className="text-[11px] text-emerald-100">
                                  Top: {retailMetrics.promotions.top.title} (
                                  {retailMetrics.promotions.top.uses} usos)
                                </p>
                              ) : (
                                <p className="text-[11px] text-muted">Sin promos usadas</p>
                              )}
                            </>
                          ) : (
                            <p className="text-muted text-xs">Sin datos</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl card-surface p-5 lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted">
                              Evolución diaria
                            </p>
                            <p className="text-sm text-muted">
                              Pedidos e ingresos cobrados
                            </p>
                          </div>
                        </div>
                        {retailMetrics.daily.length === 0 ? (
                          <p className="text-xs text-muted">
                            No hay pedidos en este período.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {(() => {
                              const maxOrders =
                                retailMetrics.daily.reduce(
                                  (m, d) => Math.max(m, d.orders),
                                  0
                                ) || 1;
                              return retailMetrics.daily.map((d) => {
                                const width = `${(d.orders / maxOrders) * 100}%`;
                                return (
                                  <div key={d.date} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs text-muted">
                                      <span>{d.date}</span>
                                      <span>
                                        {d.orders} pedidos · ${" "}
                                        {d.paid.toLocaleString("es-AR")}
                                      </span>
                                    </div>
                                    <div className="h-2 progress-track">
                                      <div
                                        className="progress-fill bg-emerald-500"
                                        style={{ width }}
                                      ></div>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                      <div className="rounded-2xl card-surface p-5 space-y-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted">
                            Breakdown de estados
                          </p>
                          <p className="text-sm text-muted">
                            Confirmados vs pendientes vs cancelados
                          </p>
                        </div>
                        <div className="space-y-2 text-xs text-muted">
                          {[
                            { label: "Confirmados", value: retailMetrics.totals.confirmed, color: "bg-emerald-500" },
                            { label: "Pendientes", value: retailMetrics.totals.pending, color: "bg-amber-500" },
                            { label: "Cancelados", value: retailMetrics.totals.cancelled, color: "bg-rose-500" },
                          ].map((item) => {
                            const total =
                              retailMetrics.totals.total > 0 ? retailMetrics.totals.total : 1;
                            const percent = (item.value / total) * 100;
                            return (
                              <div key={item.label}>
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-white">{item.label}</span>
                                  <span>{item.value} · {percent.toFixed(1)}%</span>
                                </div>
                                <div className="h-2 progress-track">
                                  <div
                                    className={`progress-fill ${item.color}`}
                                    style={{ width: `${percent}%` }}
                                  ></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl card-surface p-5 space-y-3 lg:col-span-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted">
                            Resumen IA
                          </p>
                          <p className="text-sm text-muted">
                            Generá ideas para mejorar ventas y una proyección basada en estos datos.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateMetricsSummary}
                          disabled={metricsSummaryLoading}
                          className="btn btn-primary btn-sm w-full disabled:opacity-60"
                        >
                          {metricsSummaryLoading && metricsSummaryModalOpen
                            ? "Generando..."
                            : "Generar resumen IA"}
                        </button>
                        <p className="text-xs text-slate-500">
                          Se abrirá un popup con recomendaciones y proyección de ventas.
                        </p>
                      </div>
                    </div>
                  </>
                )
              ) : metricsAppointmentsLoading ? (
                <div className="rounded-2xl border border-slate-100 bg-white px-4 py-6 text-sm text-slate-500">
                  Cargando métricas del período...
                </div>
              ) : metricsAppointmentsError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
                  {metricsAppointmentsError}
                </div>
              ) : metricsStats.total === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                  Todavía no hay turnos registrados en este rango. Probá con otro filtro o esperá a que se generen nuevos turnos.
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl card-surface p-4">
                      <p className="text-xs uppercase tracking-wide text-muted">
                        Turnos programados
                      </p>
                      <p className="text-2xl font-semibold text-white">
                        {metricsStats.total}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        Incluye confirmados y pendientes
                      </p>
                    </div>
                    <div className="rounded-2xl card-surface p-4">
                      <p className="text-xs uppercase tracking-wide text-muted">
                        Pacientes concretados
                      </p>
                      <p className="text-2xl font-semibold text-[#7efed7]">
                        {metricsStats.confirmed}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {metricsStats.completionRate.toFixed(1)}% completados
                      </p>
                    </div>
                    <div className="rounded-2xl card-surface p-4">
                      <p className="text-xs uppercase tracking-wide text-muted">
                        Cancelaciones
                      </p>
                      <p className="text-2xl font-semibold text-[#ffadc0]">
                        {metricsStats.cancelled}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {metricsStats.cancellationRate.toFixed(1)}% del total
                      </p>
                    </div>
                    <div className="rounded-2xl card-surface p-4">
                      <p className="text-xs uppercase tracking-wide text-muted">
                        Turnos futuros
                      </p>
                      <p className="text-2xl font-semibold text-white">
                        {metricsStats.upcoming}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        Recomendado: enviar recordatorios 24 h antes
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl card-surface p-5 space-y-4 lg:col-span-1">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted">
                          Ingresos del período
                        </p>
                        <p className="text-2xl font-semibold text-white">
                          $ {metricsRevenue.collected.toLocaleString("es-AR")}
                        </p>
                        <p className="text-xs text-muted">
                          Pendiente: $ {metricsRevenue.pending.toLocaleString("es-AR")}
                        </p>
                      </div>
                      <div className="rounded-xl card-muted p-3 text-xs text-muted space-y-2">
                        <p className="font-semibold text-white">Detalle por medio de pago</p>
                        <div className="flex items-center justify-between">
                          <span>Efectivo</span>
                          <span className="font-semibold text-white">
                            $ {metricsRevenue.cashCollected.toLocaleString("es-AR")}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Transfer./Débito/Crédito</span>
                          <span className="font-semibold text-white">
                            $ {metricsRevenue.transferCollected.toLocaleString("es-AR")}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-xl card-muted p-3 text-xs text-muted space-y-2">
                        <p className="flex items-center justify-between">
                          <span>Ticket promedio</span>
                          <span className="font-semibold text-white">
                            $ {metricsRevenue.avgTicket.toLocaleString("es-AR")}
                          </span>
                        </p>
                        <p className="flex items-center justify-between">
                          <span>Recurrentes</span>
                          <span className="font-semibold text-white">
                            {data?.stats?.pacientesRecurrentesPorcentaje ?? 0}%
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="rounded-2xl card-surface p-5 lg:col-span-2">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted">
                            Estado de los turnos
                          </p>
                          <p className="text-sm text-muted">
                            Confirmados vs cancelados ({metricsStats.total} casos)
                          </p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="h-8 rounded-full progress-track flex">
                          {(() => {
                            const total =
                              statusChartData.reduce((sum, item) => sum + item.value, 0) ||
                              1;
                            return statusChartData.map((item) => {
                              const width = `${(item.value / total) * 100}%`;
                              return (
                                <div
                                  key={item.label}
                                  className={`${item.color} flex items-center justify-center text-[11px] text-white font-semibold`}
                                  style={{ width }}
                                >
                                  {item.value ? `${Math.round((item.value / total) * 100)}%` : ""}
                                </div>
                              );
                            });
                          })()}
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted">
                          {statusChartData.map((item) => (
                            <div key={item.label} className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${item.color}`}></span>
                              <span>
                                {item.label}:{" "}
                                <span className="font-semibold text-white">
                                  {item.value}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl card-surface p-5 lg:col-span-2">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted">
                            Motivos más frecuentes
                          </p>
                          <p className="text-sm text-muted">
                            Análisis dentro del rango seleccionado
                          </p>
                        </div>
                      </div>
                      {topConsultReasons.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Aún no registramos motivos suficientes en este rango.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {topConsultReasons.map((item) => {
                            const percent =
                              metricsStats.total > 0
                                ? (item.value / metricsStats.total) * 100
                                : 0;
                            return (
                              <div key={item.label}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="font-medium text-white">
                                    {item.label}
                                  </span>
                                  <span className="text-muted">
                                    {item.value} turnos · {percent.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="h-2 progress-track">
                                  <div
                                    className="progress-fill"
                                    style={{ width: `${percent}%` }}
                                  ></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="rounded-2xl card-surface p-5 space-y-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted">
                          Resumen IA
                        </p>
                        <p className="text-sm text-muted">
                          Generá un diagnóstico automático con recomendaciones descargables ({metricsRangeLabel.toLowerCase()}).
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerateMetricsSummary}
                        disabled={metricsSummaryLoading}
                        className="btn btn-primary btn-sm w-full disabled:opacity-60"
                      >
                        {metricsSummaryLoading && metricsSummaryModalOpen
                          ? "Generando..."
                          : "Generar resumen IA"}
                      </button>
                      <p className="text-xs text-slate-500">
                        Se abrirá un popup con el detalle y vas a poder descargarlo en formato Word.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {/* === Sección: COMPROBANTES === */}
          {activeSection === "attachments" && (
            <section className="mt-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Comprobantes</h2>
                  <p className="text-sm text-slate-500">
                    Todos los archivos subidos en pedidos. Filtrá por número o nombre.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <div className="relative flex-1 sm:min-w-[260px]">
                    <input
                      type="text"
                      value={attachmentSearch}
                      onChange={(e) => setAttachmentSearch(e.target.value)}
                      placeholder="Buscar por pedido o cliente"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm pr-12 focus:outline-none focus:ring-2 focus:ring-slate-900/5 bg-white"
                    />
                    {attachmentSearch && (
                      <button
                        type="button"
                        onClick={() => setAttachmentSearch("")}
                        className="absolute inset-y-0 right-8 text-xs text-slate-400 hover:text-slate-600"
                        aria-label="Limpiar búsqueda"
                      >
                        Limpiar
                      </button>
                    )}
                    <span className="absolute inset-y-0 right-2 flex items-center text-slate-400 text-[11px]">
                      {attachmentsLoading ? "..." : "Buscar"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchAttachments({ search: attachmentSearch })}
                    className="btn btn-outline btn-sm"
                  >
                    Actualizar
                  </button>
                </div>
              </div>

              {attachmentsError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <span>{attachmentsError}</span>
                  <button
                    type="button"
                    onClick={() => fetchAttachments({ search: attachmentSearch })}
                    className="btn btn-outline btn-sm border border-rose-300 text-rose-200 hover:text-rose-50"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {attachmentsLoading && (
                <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 text-sm text-slate-500">
                  Cargando comprobantes...
                </div>
              )}

              {!attachmentsLoading && !attachmentsError && attachments.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                  Todavía no hay comprobantes cargados. Subilos desde el pedido.
                </div>
              )}

              {!attachmentsLoading && !attachmentsError && attachments.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
                  <div className="grid grid-cols-12 text-xs font-semibold text-slate-600 px-4 py-2 bg-slate-50">
                    <span className="col-span-2">Pedido</span>
                    <span className="col-span-4">Cliente</span>
                    <span className="col-span-3">Archivo</span>
                    <span className="col-span-2">Fecha</span>
                    <span className="col-span-1 text-right">Acción</span>
                  </div>
                  <div className="divide-y divide-slate-200 text-sm">
                    {attachments.map((att) => {
                      const createdLabel = (() => {
                        try {
                          return new Date(att.createdAt).toLocaleString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                        } catch {
                          return "";
                        }
                      })();
                      return (
                        <div
                          key={att.id}
                          className="grid grid-cols-12 px-4 py-3 items-center text-slate-800"
                        >
                          <span className="col-span-2 font-semibold">
                            #{att.orderSequenceNumber}
                          </span>
                          <span className="col-span-4 truncate">{att.customerName}</span>
                          <span className="col-span-3 truncate">
                            {att.filename || "Comprobante"}
                          </span>
                          <span className="col-span-2 text-xs text-slate-500">{createdLabel}</span>
                          <span className="col-span-1 text-right">
                            <a
                              href={buildApiUrl(att.url)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-outline btn-sm"
                            >
                              Descargar
                            </a>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* === Otras secciones (placeholder por ahora) === */}
          {activeSection !== "dashboard" &&
            activeSection !== "profile" &&
            activeSection !== "patients" &&
            activeSection !== "history" &&
            activeSection !== "agenda" &&
            activeSection !== "stock" &&
            activeSection !== "orders" &&
            activeSection !== "debts" &&
            activeSection !== "promotions" &&
            activeSection !== "metrics" &&
            activeSection !== "attachments" && (
              <section className="mt-6">
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                  Estamos preparando la vista{" "}
                  <span className="font-medium">Sección en construcción</span>
                  . Por ahora, podés manejar todo desde el Dashboard principal y
                  la sección de WhatsApp dentro del dashboard.
                </div>
              </section>
            )}
          </div>
        {automationAssistantOpen && (
          <div className="fixed bottom-24 right-6 w-full max-w-md z-40">
            <div className="rounded-3xl card-surface border border-slate-700/60 shadow-2xl p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Automatización guiada
                  </p>
                  <p className="text-xl font-semibold text-white">
                    ¿Qué necesitas?
                  </p>
                  <p className="text-xs text-slate-400">
                    Pedí recordatorios, resúmenes o abrí módulos sin moverte.
                  </p>
                </div>
                <button
                  type="button"
                  className="text-slate-400 hover:text-white"
                  onClick={() => setAutomationAssistantOpen(false)}
                  aria-label="Cerrar asistente"
                >
                  ✕
                </button>
              </div>
              <div className="h-64 overflow-y-auto space-y-3 pr-1">
                {automationMessages.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          isUser
                            ? "bg-sky-600 text-white"
                            : "bg-slate-800 text-slate-100 border border-slate-700/70"
                        }`}
                      >
                        {message.text}
                      </div>
                    </div>
                  );
                })}
                {automationProcessing && (
                  <div className="text-xs text-slate-400 animate-pulse">
                    Procesando tu pedido...
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {automationSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleAutomationSuggestion(suggestion)}
                    className="text-xs px-3 py-1 rounded-full border border-slate-600 text-slate-300 hover:bg-slate-700/40"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={handleAutomationSubmit}
              >
                <input
                  type="text"
                  className="flex-1 rounded-2xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                  placeholder="Ej: “Enviá recordatorio a los ausentes de hoy”"
                  value={automationInput}
                  onChange={(e) => setAutomationInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm whitespace-nowrap"
                  disabled={automationProcessing || !automationInput.trim()}
                >
                  Enviar
                </button>
              </form>
            </div>
          </div>
        )}

        {automationPendingActions && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center px-4 py-6">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={handleCancelAutomationActions}
              aria-hidden="true"
            ></div>
            <div className="relative w-full max-w-lg rounded-3xl card-surface border border-slate-700/60 shadow-2xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Confirmar acciones
                  </p>
                  <h3 className="text-lg font-semibold text-white">
                    ¿Ejecutamos estas tareas?
                  </h3>
                </div>
                <button
                  type="button"
                  className="text-slate-400 hover:text-white"
                  onClick={handleCancelAutomationActions}
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              {automationPendingActions.reply && (
                <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
                  {automationPendingActions.reply}
                </div>
              )}

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {automationPendingActions.actions.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No hay acciones para ejecutar.
                  </p>
                ) : (
                  automationPendingActions.actions.map((action, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-700/70 bg-slate-900/50 px-3 py-2 text-sm text-slate-100"
                    >
                      {summarizeAutomationAction(action)}
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-wrap gap-3 justify-end">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-800"
                  onClick={handleCancelAutomationActions}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-md"
                  onClick={handleConfirmAutomationActions}
                  disabled={!automationPendingActions.actions.length}
                >
                  Confirmar y ejecutar
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={toggleAutomationAssistant}
          className="fixed bottom-6 right-6 z-30 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-2xl px-4 py-3 flex items-center gap-2 hover:scale-105 transition"
        >
          <span className="text-lg">⚡</span>
          <span className="text-sm font-semibold">
            {automationAssistantOpen ? "Cerrar asistente" : "Automatización"}
          </span>
        </button>

        {activeAppointmentDetail && (
          <div className="fixed inset-0 z-[240] flex items-center justify-center px-4 py-6">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
              onClick={() => setActiveAppointmentDetail(null)}
              aria-hidden="true"
            ></div>
            <div className="relative w-full max-w-md tooltip-panel px-5 py-6 text-white space-y-4">
              <button
                type="button"
                onClick={() => setActiveAppointmentDetail(null)}
                className="absolute top-3 right-3 text-white/70 hover:text-white text-base"
                aria-label="Cerrar detalle de turno"
              >
                ✕
              </button>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-muted mb-1">
                  Turno seleccionado
                </p>
                <h3 className="text-xl font-semibold">
                  {activeAppointmentDetail.patient.fullName ||
                    "Paciente sin nombre"}
                </h3>
                <p className="text-sm text-muted">
                  {activeAppointmentDetail.patient.insuranceProvider?.trim() ||
                    "Obra social no informada"}
                </p>
              </div>
              <div className="space-y-2 text-[13px]">
                <p>
                  <span className="text-muted">Fecha:</span>{" "}
                  {new Date(activeAppointmentDetail.dateTime).toLocaleDateString(
                    "es-AR",
                    {
                      weekday: "long",
                      day: "2-digit",
                      month: "2-digit",
                    }
                  )}
                </p>
                <p>
                  <span className="text-muted">Hora:</span>{" "}
                  {new Date(activeAppointmentDetail.dateTime).toLocaleTimeString(
                    "es-AR",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  )}
                </p>
                <p>
                  <span className="text-muted">Motivo:</span>{" "}
                  {activeAppointmentDetail.type || "Sin detalle"}
                </p>
                <p>
                  <span className="text-muted">Origen:</span>{" "}
                  {activeAppointmentDetail.source === "whatsapp"
                    ? "WhatsApp"
                    : "Dashboard"}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-md w-full"
                  onClick={() => {
                    if (activeAppointmentDetail.patient.id) {
                      handleOpenPatientDetail(activeAppointmentDetail.patient.id);
                    }
                    setActiveAppointmentDetail(null);
                  }}
                >
                  Ver paciente
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-md w-full"
                  onClick={() => {
                    handleOpenRescheduleModal(activeAppointmentDetail);
                    setActiveAppointmentDetail(null);
                  }}
                >
                  Reprogramar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
    {productDeleteConfirmId && (
      <Modal onClose={handleCancelDeleteProduct} contentClassName="max-w-md">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">
              Eliminar producto
            </h3>
            <p className="text-sm text-muted">
              {productPendingDelete
                ? `¿Querés eliminar "${productPendingDelete.name}" del stock? Esta acción no se puede deshacer.`
                : "¿Seguro que querés eliminar este producto del stock?"}
            </p>
          </div>
          {productDeleteError && (
            <p className="text-sm text-rose-400">{productDeleteError}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm disabled:opacity-60"
              onClick={handleCancelDeleteProduct}
              disabled={productDeletingId === productDeleteConfirmId}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm disabled:opacity-60"
              onClick={handleConfirmDeleteProduct}
              disabled={productDeletingId === productDeleteConfirmId}
            >
              {productDeletingId === productDeleteConfirmId
                ? "Eliminando..."
                : "Eliminar"}
            </button>
          </div>
        </div>
      </Modal>
    )}

    {bulkDeleteConfirmOpen && (
      <Modal onClose={handleCloseBulkDelete} contentClassName="max-w-md">
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-white">Eliminar productos</h3>
            <p className="text-sm text-muted">
              Vas a eliminar {selectedProductIds.size} producto
              {selectedProductIds.size === 1 ? "" : "s"} del stock. ¿Confirmás?
            </p>
          </div>
          {bulkDeleteError && (
            <p className="text-sm text-rose-400">{bulkDeleteError}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleCloseBulkDelete}
              disabled={bulkDeleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm disabled:opacity-60"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? "Eliminando..." : "Eliminar"}
            </button>
          </div>
        </div>
      </Modal>
    )}

      {productModalOpen && (
        <Modal onClose={handleCloseProductModal} contentClassName="max-w-2xl">
          <form className="space-y-4" onSubmit={handleCreateProduct}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">
                  Nuevo producto
                </p>
                <h3 className="text-xl font-semibold text-white">
                  Agregá un producto al stock
                </h3>
                <p className="text-sm text-slate-400">
                  Cargá precio, cantidad, imagen y etiquetas personalizadas.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseProductModal}
                className="btn btn-ghost btn-sm text-base leading-none"
                disabled={productSaving}
              >
                ✕
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">
                  Nombre *
                </label>
                <input
                  type="text"
                  name="name"
                  value={productForm.name}
                  onChange={handleProductFormChange}
                  className="w-full rounded-xl border border-slate-700/70 bg-[#0b1216] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                  placeholder="Ej: Kit de limpieza"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">
                  Precio *
                </label>
                <input
                  type="text"
                  name="price"
                  value={productForm.price}
                  onChange={handleProductFormChange}
                  className="w-full rounded-xl border border-slate-700/70 bg-[#0b1216] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                  placeholder="Ej: 15000"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">
                  Cantidad *
                </label>
                <input
                  type="text"
                  name="quantity"
                  value={productForm.quantity}
                  onChange={handleProductFormChange}
                  className="w-full rounded-xl border border-slate-700/70 bg-[#0b1216] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                  placeholder="Ej: 25"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">
                  Imagen (archivo opcional)
                </label>
                <input
                  type="file"
                  ref={productImageInputRef}
                  accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
                  onChange={handleProductImageChange}
                  className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-[#102036] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white/90 hover:file:bg-[#132b55]"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  PNG, JPG o WebP · Máx 2 MB.
                </p>
                {productImagePreview && (
                  <div className="mt-3 flex items-center gap-3">
                    <img
                      src={productImagePreview}
                      alt="Vista previa de producto"
                      className="h-16 w-16 rounded-2xl border border-white/10 object-cover"
                    />
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={clearProductImageSelection}
                    >
                      Quitar imagen
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">
                Categorías sugeridas
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Seleccioná las etiquetas que mejor describen el producto.
              </p>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_CATEGORY_OPTIONS.map((option) => {
                  const active = productForm.categories.includes(option.key);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => handleToggleProductCategory(option.key)}
                      className={`px-3 py-1.5 rounded-full text-[11px] border transition ${
                        active
                          ? "border-transparent text-white shadow-[0_0_12px_rgba(54,95,255,0.35)] bg-[linear-gradient(90deg,rgba(1,46,221,0.83)_0%,rgba(54,95,255,0.35)_100%)]"
                          : "border-white/10 text-slate-300 hover:border-white/30 hover:bg-white/5"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={handleOpenProductCategoryModal}
                  className="px-3 py-1.5 rounded-full text-[11px] border border-transparent text-white bg-[linear-gradient(90deg,rgba(1,46,221,0.83)_0%,rgba(54,95,255,0.45)_100%)] shadow-[0_0_12px_rgba(54,95,255,0.35)] hover:shadow-[0_0_16px_rgba(54,95,255,0.5)]"
                >
                  Crear etiqueta
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">
                Descripción
              </label>
              <textarea
                name="description"
                value={productForm.description}
                onChange={handleProductFormChange}
                className="w-full rounded-xl border border-slate-700/70 bg-[#0b1216] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25 min-h-[80px]"
                placeholder="Notas internas o detalles para el bot"
              />
            </div>

            {productFormError && (
              <p className="text-sm text-rose-400">{productFormError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleResetProductForm}
                disabled={productSaving}
              >
                Limpiar
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleCloseProductModal}
                disabled={productSaving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm disabled:opacity-60"
                disabled={productSaving}
              >
                {productSaving ? "Guardando..." : "Guardar producto"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {productCategoryModalOpen && (
        <Modal onClose={handleCloseProductCategoryModal} contentClassName="max-w-sm">
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-white">Crear etiqueta</h3>
              <p className="text-sm text-muted">
                Usala para categorizar el producto más allá de las sugerencias.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Nombre de la etiqueta
              </label>
              <input
                type="text"
                value={productCategoryInput}
                onChange={(e) => {
                  setProductCategoryInput(e.target.value);
                  setProductCategoryError(null);
                }}
                className="w-full rounded-xl border border-slate-700/70 bg-[#0b1216] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                placeholder="Ej: Línea premium"
              />
              {productCategoryError && (
                <p className="text-sm text-rose-400">{productCategoryError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleCloseProductCategoryModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveCustomProductCategory}
              >
                Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {productTagModalOpen && productTagProductId && (
        <Modal onClose={closeProductTagModal} contentClassName="max-w-md">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">
                  Etiquetas
                </p>
                {selectedProductForTags ? (
                  <h3 className="text-base font-semibold text-slate-100">
                    {selectedProductForTags.name}
                  </h3>
                ) : (
                  <h3 className="text-base font-semibold text-slate-100">
                    Producto
                  </h3>
                )}
                <p className="text-sm text-muted">
                  Organizá el stock con etiquetas clave (ej. destacado, baja disponibilidad).
                </p>
              </div>
              <button
                type="button"
                onClick={closeProductTagModal}
                className="btn btn-ghost btn-sm text-base leading-none"
                disabled={productTagSaving}
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">
                  Nombre de la etiqueta
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-700 bg-[#0f0f0f] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#39f3d7]/30"
                  value={productTagLabel}
                  onChange={(e) => setProductTagLabel(e.target.value)}
                  placeholder="Ej: Producto destacado"
                  disabled={productTagSaving}
                />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 mb-2">
                  Prioridad
                </p>
                <div className="flex flex-wrap gap-2">
                  {PATIENT_TAG_SEVERITY_OPTIONS.map((option) => {
                    const active = productTagSeverity === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setProductTagSeverity(option.value as PatientTag["severity"])
                        }
                        className={`px-3 py-1.5 text-[11px] rounded-full border transition ${
                          active
                            ? "border-teal-400/60 bg-teal-400/10 text-white"
                            : "border-slate-700 text-slate-400 hover:border-slate-500"
                        }`}
                        disabled={productTagSaving}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {productTagError && (
                <p className="text-sm text-rose-400">{productTagError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-outline btn-sm disabled:opacity-60"
                  onClick={closeProductTagModal}
                  disabled={productTagSaving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm disabled:opacity-60"
                  onClick={handleSaveProductTag}
                  disabled={productTagSaving}
                >
                  {productTagSaving ? "Guardando..." : "Guardar etiqueta"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {tagModalOpen && tagModalPatientId && (
        <Modal onClose={handleCloseTagModal} contentClassName="max-w-md">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  {isRetailBusiness ? "Agregar etiqueta de cliente" : "Agregar dato importante"}
                </h3>
                <p className="text-sm text-muted">
                  {isRetailBusiness
                    ? "Etiquetá al cliente para filtrar promos o envíos masivos."
                    : "Etiquetá al paciente para segmentar recordatorios y campañas."}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseTagModal}
                className="btn btn-ghost btn-sm text-base leading-none"
                disabled={tagSaving}
              >
                ✕
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">
                {isRetailBusiness ? "Nombre de la etiqueta" : "Descripción del dato"}
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-700 bg-[#0f0f0f] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#39f3d7]/30"
                maxLength={60}
                value={tagFormLabel}
                onChange={(e) => setTagFormLabel(e.target.value)}
                placeholder={
                  isRetailBusiness
                    ? "Ej: Solo pide gaseosas, Vip, Mayorista"
                    : "Ej: Hipertenso, Control gestacional, Post operatorio..."
                }
                disabled={tagSaving}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">
                {isRetailBusiness ? "Tipo" : "Prioridad"}
              </p>
              {(() => {
                const severityOptions = isRetailBusiness
                  ? RETAIL_TAG_SEVERITY_OPTIONS
                  : PATIENT_TAG_SEVERITY_OPTIONS;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {severityOptions.map((option) => {
                      const active = tagFormSeverity === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setTagFormSeverity(option.value)}
                          className={`text-left rounded-xl border px-3 py-2 text-sm transition focus:outline-none ${
                            active
                              ? "border-white bg-white/10 text-white shadow-lg shadow-black/30"
                              : "border-slate-700 text-slate-400 hover:border-slate-500"
                          }`}
                          disabled={tagSaving}
                        >
                          <p className="font-semibold">{option.label}</p>
                          <p className="text-xs text-slate-400">
                            {option.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            {tagFormError && (
              <p className="text-sm text-rose-500">{tagFormError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseTagModal}
                className="btn btn-outline btn-sm"
                disabled={tagSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePatientTag}
                className="btn btn-primary btn-sm"
                disabled={tagSaving}
              >
                {tagSaving ? "Guardando..." : "Guardar etiqueta"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {metricsSummaryModalOpen && (
        <Modal
          onClose={handleCloseMetricsSummaryModal}
          contentClassName="max-w-4xl lg:max-w-5xl"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Resumen IA ({metricsSummaryRangeLabel || metricsRangeLabel})
                </h3>
                <p className="text-sm text-slate-500">
                  Insights generados con los datos del período seleccionado.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseMetricsSummaryModal}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            {metricsSummaryLoading ? (
              <p className="text-sm text-slate-500">Analizando tus métricas...</p>
            ) : metricsSummary ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{metricsSummary}</p>
            ) : (
              <p className="text-sm text-slate-500">
                Tocá “Generar resumen IA” para obtener recomendaciones personalizadas.
              </p>
            )}
            <div className="flex justify-end gap-2">
              {metricsSummary && !metricsSummaryLoading && (
                <button
                  type="button"
                  onClick={handleDownloadMetricsSummary}
                  className="btn btn-outline btn-sm text-xs text-white hover:text-[#041215]"
                >
                  Descargar Word
                </button>
              )}
              <button
                type="button"
                onClick={handleCloseMetricsSummaryModal}
                className="btn btn-primary btn-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}
      {broadcastModalOpen && (
        <Modal onClose={handleCloseBroadcastModal}>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {isRetailBusiness ? "Enviar mensaje a tus clientes" : "Enviar mensaje a todos tus pacientes"}
                </h3>
                <p className="text-sm text-slate-500">
                  {isRetailBusiness
                    ? "Mandá un texto a tus clientes por WhatsApp, opcionalmente con una promo y etiquetas."
                    : "Este texto se envía por WhatsApp a todos tus pacientes o solo a los segmentos que elijas."}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseBroadcastModal}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                Mensaje
              </label>
              <textarea
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                rows={5}
                maxLength={1000}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder={
                  isRetailBusiness
                    ? "Ej: Tenemos promos esta semana, mirá lo que preparamos para vos."
                    : "Ej: Hola! Te recordamos que estaremos atendiendo con horario reducido la próxima semana..."
                }
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Límite 1000 caracteres. Se envía desde tu número conectado.
              </p>
            </div>
            {isRetailBusiness && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600">
                  Promoción (opcional)
                </label>
                <select
                  value={broadcastSelectedPromoId ?? ""}
                  onChange={(e) =>
                    setBroadcastSelectedPromoId(
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                >
                  <option value="">No enviar promo, solo texto</option>
                  {promotions.map((promo) => {
                    const discountLabel =
                      promo.discountType === "percent"
                        ? `${promo.discountValue}%`
                        : `$${promo.discountValue}`;
                    return (
                      <option key={promo.id} value={promo.id}>
                        {promo.title} · {discountLabel} OFF
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-slate-400">
                  Si elegís una promo, se envía con la imagen adjunta (solo en producción).
                </p>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600">
                  {isRetailBusiness ? "Etiquetas de clientes (opcional)" : "Segmento (opcional)"}
                </label>
                {patientSegmentsLoading && (
                  <span className="text-[10px] text-slate-400">
                    Cargando...
                  </span>
                )}
              </div>
              {patientSegments.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  {isRetailBusiness
                    ? "Todavía no hay etiquetas para clientes. Crealas desde la ficha del cliente."
                    : "Todavía no agregaste etiquetas. Usá “Agregar dato importante” en la ficha del paciente para clasificar y segmentar envíos."}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {patientSegments.map((segment) => {
                    const active = selectedBroadcastSegments.includes(
                      segment.label
                    );
                    const severityStyle =
                      PATIENT_TAG_STYLE_MAP[segment.severity];
                    return (
                      <button
                        key={`segment-${segment.label}`}
                        type="button"
                        onClick={() =>
                          handleToggleBroadcastSegment(segment.label)
                        }
                        className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition focus:outline-none ${
                          severityStyle?.toggle || "focus:ring-slate-500/40"
                        } ${
                          active
                            ? "bg-white text-slate-900 border-white shadow-lg shadow-black/20"
                            : "text-slate-300 border-slate-600/70 hover:border-slate-500"
                        }`}
                        aria-pressed={active}
                      >
                        <span>{segment.label}</span>
                        <span className="ml-1 text-[10px] opacity-70">
                          ({segment.count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedBroadcastSegments.length > 0 && (
                <p className="text-[11px] text-emerald-400">
                  Segmentos activos: {selectedBroadcastSegments.join(", ")}
                </p>
              )}
              <p className="text-[11px] text-slate-400">
                Si seleccionás etiquetas, el mensaje se enviará sólo a los{" "}
                {isRetailBusiness ? "clientes" : "pacientes"} que las tengan asignadas. Sin selección se envía a
                todos.
              </p>
            </div>
            {broadcastError && (
              <p className="text-sm text-rose-600">{broadcastError}</p>
            )}
            {broadcastSuccess && (
              <p className="text-sm text-emerald-600">{broadcastSuccess}</p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseBroadcastModal}
                disabled={broadcastSending}
                className="btn btn-outline btn-md disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleBroadcastSend}
                disabled={broadcastSending}
                className="btn btn-primary btn-md disabled:opacity-60"
              >
                {broadcastSending ? "Enviando..." : "Enviar a todos"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {createAppointmentModalOpen && (
        <Modal onClose={handleCloseCreateAppointmentModal}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Crear turno manual
              </h3>
              <button
                type="button"
                className="text-sm text-muted hover:text-white"
                onClick={handleCloseCreateAppointmentModal}
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-muted mb-1 block">
                Paciente
              </label>
              <select
                name="patientId"
                value={createAppointmentForm.patientId}
                onChange={handleCreateAppointmentFieldChange}
                className="w-full rounded-xl border border-slate-700 bg-[#111418] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
              >
                <option value="">Nuevo paciente (cargar datos)</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.fullName}
                  </option>
                ))}
              </select>
            </div>

            {!usingExistingAppointmentPatient && (
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    name="patientName"
                    value={createAppointmentForm.patientName}
                    onChange={handleCreateAppointmentFieldChange}
                    className="w-full rounded-xl border border-slate-700 bg-[#111418] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                    placeholder="Ej: Ana López"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">
                    Teléfono (opcional)
                  </label>
                  <input
                    type="tel"
                    name="patientPhone"
                    value={createAppointmentForm.patientPhone}
                    onChange={handleCreateAppointmentFieldChange}
                    className="w-full rounded-xl border border-slate-700 bg-[#111418] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                    placeholder="+54 9 ..."
                  />
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">
                  Fecha
                </label>
                <input
                  type="date"
                  name="date"
                  value={createAppointmentForm.date}
                  onChange={handleCreateAppointmentFieldChange}
                  className="w-full rounded-xl border border-slate-700 bg-[#111418] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">
                  Hora
                </label>
                <input
                  type="time"
                  name="time"
                  value={createAppointmentForm.time}
                  onChange={handleCreateAppointmentFieldChange}
                  className="w-full rounded-xl border border-slate-700 bg-[#111418] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted mb-1 block">
                Motivo de la consulta
              </label>
              <input
                type="text"
                name="type"
                value={createAppointmentForm.type}
                onChange={handleCreateAppointmentFieldChange}
                className="w-full rounded-xl border border-slate-700 bg-[#111418] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                placeholder="Ej: Control general"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted mb-1 block">
                Precio (opcional)
              </label>
              <input
                type="text"
                name="price"
                value={createAppointmentForm.price}
                onChange={handleCreateAppointmentFieldChange}
                className="w-full rounded-xl border border-slate-700 bg-[#111418] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                placeholder="Ej: 35000"
              />
            </div>

            {createAppointmentError && (
              <p className="text-sm text-rose-500">{createAppointmentError}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseCreateAppointmentModal}
                className="btn btn-outline btn-sm disabled:opacity-50"
                disabled={createAppointmentLoading}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateAppointmentSubmit}
                className="btn btn-primary btn-sm disabled:opacity-50"
                disabled={createAppointmentLoading}
              >
                {createAppointmentLoading ? "Guardando..." : "Crear turno"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {quickChatModalOpen && selectedPatientId && (
        <Modal onClose={handleCloseQuickChat} contentClassName="max-w-2xl">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Chat con {selectedPatient?.fullName || "paciente sin nombre"}
                </h3>
                <p className="text-xs text-muted">
                  Conversá por WhatsApp sin salir del dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseQuickChat}
                className="btn btn-ghost btn-sm text-base leading-none"
              >
                ✕
              </button>
            </div>
            <div className="border border-slate-700 rounded-xl bg-[#0f0f0f] p-3 h-72 overflow-y-auto text-xs space-y-2">
              {loadingMessages && (
                <p className="text-muted">Cargando mensajes...</p>
              )}
              {messagesError && (
                <p className="text-rose-400">{messagesError}</p>
              )}
              {!loadingMessages && !messagesError && chatMessages.length === 0 && (
                <p className="text-muted">
                  Todavía no registramos mensajes con este paciente.
                </p>
              )}
              {!loadingMessages &&
                !messagesError &&
                chatMessages.map((m) => {
                  const dateLabel = (() => {
                    try {
                      return new Date(m.createdAt).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    } catch {
                      return "";
                    }
                  })();
                  const isOutgoing = m.direction === "outgoing";
                  return (
                    <div
                      key={m.id}
                      className={`flex ${
                        isOutgoing ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] px-2 py-1 rounded-lg ${
                          isOutgoing
                            ? "bg-slate-900 text-white"
                            : "bg-[#1f1f1f] text-white border border-slate-700/60"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{m.body || ""}</div>
                        <div
                          className={`mt-0.5 text-[10px] ${
                            isOutgoing ? "text-slate-400" : "text-muted"
                          }`}
                        >
                          {dateLabel}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            <form onSubmit={handleSendToPatient} className="space-y-2 text-xs">
              <textarea
                className="w-full rounded-xl border border-slate-700 px-3 py-2 text-xs resize-none h-20 bg-[#0a0d10] focus:outline-none focus:ring-2 focus:ring-teal-400/20"
                placeholder="Escribí un mensaje de seguimiento, recordatorio, etc."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />
              {sendError && (
                <div className="text-[11px] text-rose-400">{sendError}</div>
              )}
              {sendSuccess && (
                <div className="text-[11px] text-emerald-400">{sendSuccess}</div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleCloseQuickChat}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={sendingMessage || !messageText.trim()}
                  className="btn btn-primary btn-sm disabled:opacity-60"
                >
                  {sendingMessage ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
      {showConnectModal && (
        <Modal onClose={handleCloseConnectModal}>
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            Elegí un número de WhatsApp
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Seleccioná el número con el que querés que tu asistente responda en Twilio.
          </p>
          {connectModalLoading ? (
            <p className="text-sm text-slate-500">Cargando números...</p>
          ) : availableNumbers.length === 0 ? (
            <p className="text-sm text-slate-500">
              Por ahora no hay números disponibles para tu segmento. Pedile a tu admin que cargue uno nuevo.
            </p>
          ) : (
            <div className="space-y-2 mb-3 max-h-60 overflow-y-auto pr-1">
              {availableNumbers.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${
                    selectedNumberId === item.id
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    className="mt-1"
                    checked={selectedNumberId === item.id}
                    onChange={() => setSelectedNumberId(item.id)}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {prettyWhatsappNumber(item.displayPhoneNumber)}
                    </p>
                    <p className="text-xs text-slate-500">
                      ID interno: {item.id.slice(0, 8)}…
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
          {connectModalError && (
            <p className="text-xs text-rose-600 mb-3">{connectModalError}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleCloseConnectModal}
              className="btn btn-outline btn-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmConnect}
              disabled={
                !selectedNumberId ||
                whatsappLoading ||
                connectModalLoading ||
                availableNumbers.length === 0
              }
              className="btn btn-primary btn-sm disabled:opacity-60"
            >
              {whatsappLoading ? "Conectando..." : "Conectar número"}
            </button>
          </div>
        </Modal>
      )}

      {showDisconnectModal && (
        <Modal onClose={handleCancelDisconnect}>
          <h3 className="text-base font-semibold text-slate-900 mb-2">
            ¿Desconectar el número?
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Si desconectás el número, el asistente dejará de responder hasta que vuelvas a asignar uno.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCancelDisconnect}
              className="btn btn-outline btn-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmDisconnect}
              disabled={whatsappLoading}
              className="btn btn-danger btn-sm disabled:opacity-60"
            >
              {whatsappLoading ? "Procesando..." : "Desconectar"}
            </button>
          </div>
        </Modal>
      )}

      {rescheduleModalAppointment && (
        <Modal onClose={handleCloseRescheduleModal}>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Elegí un turno disponible para reprogramar el turno de{" "}
                  <span className="text-slate-700">
                    {rescheduleModalAppointment.patient.fullName || "Paciente sin nombre"}
                  </span>
                </h3>
                <p className="text-sm text-slate-500">
                  Seleccioná un horario libre para confirmar la reprogramación.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseRescheduleModal}
                className="btn btn-ghost btn-sm text-base leading-none"
              >
                ✕
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-2xl border border-slate-700/60 p-4 bg-[#0f1216] space-y-4">
              {rescheduleSlotsLoading && (
                <p className="text-sm text-muted">
                  Buscando horarios disponibles...
                </p>
              )}
              {rescheduleSlotsError && (
                <p className="text-sm text-rose-600">{rescheduleSlotsError}</p>
              )}
              {!rescheduleSlotsLoading &&
                !rescheduleSlotsError &&
                rescheduleSlotsByDay.length === 0 && (
                  <p className="text-sm text-muted">
                    No encontramos turnos disponibles en los próximos días.
                  </p>
                )}
              {!rescheduleSlotsLoading &&
                !rescheduleSlotsError &&
                rescheduleSlotsByDay.length > 0 && (
                  <div className="space-y-4">
                    {rescheduleSlotsByDay.map((group) => (
                      <div key={group.label}>
                        <p className="text-xs font-semibold text-muted uppercase mb-2">
                          {group.label}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {group.slots.map((slot) => {
                            const selected = rescheduleSelectedSlot === slot.startISO;
                            return (
                              <button
                                key={slot.startISO}
                                type="button"
                                onClick={() => setRescheduleSelectedSlot(slot.startISO)}
                                className={`btn btn-sm ${
                                  selected ? "btn-primary" : "btn-outline text-muted"
                                }`}
                              >
                                {new Date(slot.startISO).toLocaleTimeString("es-AR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            <div>
              <label className="text-xs font-medium text-muted mb-1 block">
                Motivo (opcional)
              </label>
              <textarea
                className="w-full rounded-xl border border-slate-700 px-3 py-2 text-sm bg-[#0a0d10] focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                rows={3}
                placeholder="Ej: El doctor tuvo una urgencia, te propongo el nuevo horario..."
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
              />
            </div>

            {rescheduleSubmitError && (
              <p className="text-sm text-rose-600">{rescheduleSubmitError}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseRescheduleModal}
                className="btn btn-outline btn-sm disabled:opacity-50"
                disabled={rescheduleSubmitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRescheduleSubmit}
                disabled={!rescheduleSelectedSlot || rescheduleSubmitting}
                className="btn btn-primary btn-sm disabled:opacity-50"
              >
                {rescheduleSubmitting ? "Guardando..." : "Guardar y enviar"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default App;

type ModalProps = {
  children: ReactNode;
  onClose: () => void;
  contentClassName?: string;
};

function Modal({ children, onClose, contentClassName }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      ></div>
      <div
        className={`relative w-full max-w-lg card-surface p-5 ${
          contentClassName ?? ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}
