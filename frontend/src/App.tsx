// src/App.tsx
import "./index.css";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import AuthScreen from "./components/AuthScreen";
import whatsappIcon from "./assets/whatsappicon.svg";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { buildApiUrl } from "./config";

type DashboardStats = {
  consultasHoy: number;
  pacientesEnEspera: number;
  ingresosMes: number;
  pacientesRecurrentesPorcentaje: number;
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

type DashboardSummary = {
  stats: DashboardStats;
  agendaHoy: AgendaItem[];
  pagos: PagosInfo;
};

type BusinessType = "HEALTH" | "BEAUTY" | "RETAIL";

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
};

type PatientTag = {
  id: number;
  label: string;
  severity: "critical" | "high" | "medium" | "info";
  createdAt?: string;
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

const getPatientTagBadgeClass = (severity: PatientTag["severity"]) =>
  PATIENT_TAG_STYLE_MAP[severity]?.badge ||
  "bg-slate-800 text-slate-100 border border-slate-600/60";

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

type ClinicalHistoryDownloadResult = {
  success: boolean;
  usedFallback: boolean;
  errorMessage?: string | null;
};

type SectionKey =
  | "dashboard"
  | "risk"
  | "agenda"
  | "patients"
  | "history"
  | "metrics"
  | "documents"
  | "profile";

const AUTH_STORAGE_KEY = "med-assist-auth";
const PROFILE_FORM_STORAGE_KEY = "med-assist-profile-form";
const THEME_STORAGE_KEY = "med-assist-theme";

type ThemeMode = "dark" | "light";

const defaultProfileForm = {
  specialty: "",
  clinicName: "",
  clinicAddress: "",
  officeDays: "",
  officeHours: "",
  consultFee: "",
  emergencyFee: "",
  contactPhone: "",
  extraNotes: "",
  slotInterval: "30",
};

const MAX_PROFILE_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = [
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

const BUSINESS_TYPE_INFO: Record<
  BusinessType,
  { label: string; short: string }
> = {
  HEALTH: { label: "Servicios de salud", short: "SS" },
  BEAUTY: { label: "Servicios de belleza", short: "SB" },
  RETAIL: { label: "Comercios", short: "CM" },
};

const getBusinessInfo = (type?: BusinessType | null) => {
  if (type && BUSINESS_TYPE_INFO[type]) {
    return BUSINESS_TYPE_INFO[type];
  }
  return BUSINESS_TYPE_INFO.HEALTH;
};

const CONTACT_LABELS: Record<
  BusinessType,
  {
    plural: string;
    pluralLower: string;
    singular: string;
    singularCapitalized: string;
    singularLower: string;
  }
> = {
  HEALTH: {
    plural: "Pacientes",
    pluralLower: "pacientes",
    singular: "paciente",
    singularCapitalized: "Paciente",
    singularLower: "paciente",
  },
  BEAUTY: {
    plural: "Clientes",
    pluralLower: "clientes",
    singular: "cliente",
    singularCapitalized: "Cliente",
    singularLower: "cliente",
  },
  RETAIL: {
    plural: "Clientes",
    pluralLower: "clientes",
    singular: "cliente",
    singularCapitalized: "Cliente",
    singularLower: "cliente",
  },
};

const getContactLabels = (type?: BusinessType | null) => {
  if (type && CONTACT_LABELS[type]) {
    return CONTACT_LABELS[type];
  }
  return CONTACT_LABELS.HEALTH;
};

const SLOT_INTERVAL_OPTIONS = ["15", "30", "60", "120"];

const START_CALENDAR_HOUR = 8;
const END_CALENDAR_HOUR = 20;
const HOUR_HEIGHT = 60; // px
const PAYMENT_OPTIONS = [
  { value: "cash", label: "Pago en efectivo" },
  { value: "transfer_card", label: "Transferencia / Débito / Crédito" },
] as const;
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

const getDocumentTypeLabel = (contentType?: string | null) => {
  if (!contentType) return "Archivo";
  const mime = contentType.toLowerCase();
  if (mime.startsWith("image/")) return "Imagen";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("word")) return "Documento Word";
  if (mime.includes("excel") || mime.includes("sheet")) return "Hoja de cálculo";
  if (mime.startsWith("video/")) return "Video";
  return "Archivo";
};

const getDocumentTypeBadge = (contentType?: string | null) => {
  if (!contentType) return "FILE";
  const mime = contentType.toLowerCase();
  if (mime.startsWith("image/")) return "IMG";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("word")) return "DOC";
  if (mime.includes("excel") || mime.includes("sheet")) return "XLS";
  if (mime.startsWith("video/")) return "VID";
  return "FILE";
};

const resolveAssetUrl = (value?: string | null) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return buildApiUrl(`${value}`);
};

const formatPatientBirthDate = (iso?: string | null) => {
  if (!iso) return "Pendiente";
  const date = new Date(iso);
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
  contactLabels: ReturnType<typeof getContactLabels>,
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
  contactLabels: ReturnType<typeof getContactLabels>,
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
  const [profileImageUploading, setProfileImageUploading] = useState(false);
  const [profileImageError, setProfileImageError] = useState<string | null>(
    null
  );
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
  const [hoveredAppointmentId, setHoveredAppointmentId] = useState<number | null>(
    null
  );
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Chat / mensajes
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [quickChatModalOpen, setQuickChatModalOpen] = useState(false);

  // Documentos
  const [documents, setDocuments] = useState<PatientDocumentItem[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentsPatientViewId, setDocumentsPatientViewId] = useState<
    number | null
  >(null);
  const [documentDownloadId, setDocumentDownloadId] = useState<number | null>(
    null
  );
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

  useEffect(() => {
    setMetricsSummary(null);
    setMetricsSummaryLoading(false);
  }, [metricsRange]);
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
      text: "Hola, soy tu asistente de automatización. Decime qué necesitás y te guío paso a paso.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [automationRescheduleIntent, setAutomationRescheduleIntent] = useState<
    AutomationRescheduleIntent | null
  >(null);
  const [automationHistoryIntent, setAutomationHistoryIntent] = useState<
    AutomationHistoryIntent | null
  >(null);

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
  const [connectModalLoading, setConnectModalLoading] = useState(false);
  const [connectModalError, setConnectModalError] = useState<string | null>(
    null
  );
  const [selectedNumberId, setSelectedNumberId] = useState<string | null>(null);

  const businessType = doctor?.businessType ?? null;
  const businessInfo = getBusinessInfo(businessType);
  const contactLabels = getContactLabels(businessType);
  const isMedicalDoctor = businessType === "HEALTH";

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients;
    const query = patientSearch.trim().toLowerCase();
    return patients.filter((p) => {
      const name = p.fullName?.toLowerCase() || "";
      const phone = p.phone?.toLowerCase() || "";
      const insurance = p.insuranceProvider?.toLowerCase() || "";
      const reason = p.consultReason?.toLowerCase() || "";
      return (
        name.includes(query) ||
        phone.includes(query) ||
        insurance.includes(query) ||
        reason.includes(query)
      );
    });
  }, [patients, patientSearch]);

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

  const automationSuggestions = useMemo(
    () => [
      "Enviá recordatorios segmentados",
      "Mostrame pendientes del día",
      "Abrí la agenda de mañana",
      "Resumime ingresos y consultas",
    ],
    []
  );

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
      let best:
        | {
            patient: Patient;
            matched: number;
            completeness: number;
            total: number;
          }
        | null = null;
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
        if (
          !best ||
          matched > best.matched ||
          (matched === best.matched && completeness > best.completeness) ||
          (matched === best.matched &&
            completeness === best.completeness &&
            tokens.length > best.total)
        ) {
          best = {
            patient,
            matched,
            completeness,
            total: tokens.length,
          };
        }
      });
      return best?.patient ?? null;
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

  const documentsByPatient = useMemo(() => {
    if (!documents.length) return [];
    const map = new Map<
      number,
      {
        patientId: number;
        patientName: string;
        documents: PatientDocumentItem[];
        latestTimestamp: number;
      }
    >();

    documents.forEach((doc) => {
      const entry = map.get(doc.patientId);
      const docTime = new Date(doc.createdAt).getTime();
      if (entry) {
        entry.documents.push(doc);
        entry.latestTimestamp = Math.max(entry.latestTimestamp, docTime);
      } else {
        map.set(doc.patientId, {
          patientId: doc.patientId,
          patientName: doc.patientName,
          documents: [doc],
          latestTimestamp: docTime,
        });
      }
    });

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        documents: [...group.documents].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      }))
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  }, [documents]);

  const inboxCounts = useMemo(
    () => ({
      documents: inboxData.documents.length,
      newAppointments: inboxData.newAppointments.length,
      incompletePatients: inboxData.incompletePatients.length,
    }),
    [inboxData]
  );

  const inboxTotalCount =
    inboxCounts.documents +
    inboxCounts.newAppointments +
    inboxCounts.incompletePatients;

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

  const selectedDocumentsGroup = useMemo(() => {
    if (documentsPatientViewId === null) return null;
    return (
      documentsByPatient.find(
        (group) => group.patientId === documentsPatientViewId
      ) || null
    );
  }, [documentsByPatient, documentsPatientViewId]);

  const handleDocumentSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDocumentSearch(event.target.value);
      setDocumentsPatientViewId(null);
    },
    []
  );

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

  const updateConsultationFormState = useCallback(
    (
      consultationId: number,
      updates: Partial<{
        paymentMethod: "cash" | "transfer_card" | "";
        chargedAmount: string;
      }>
    ) => {
      setConsultationFormState((prev) => {
        const current = prev[consultationId] || {
          paymentMethod: "",
          chargedAmount: "",
        };
        return {
          ...prev,
          [consultationId]: {
            paymentMethod:
              updates.paymentMethod !== undefined
                ? updates.paymentMethod
                : current.paymentMethod,
            chargedAmount:
              updates.chargedAmount !== undefined
                ? updates.chargedAmount
                : current.chargedAmount,
          },
        };
      });
    },
    []
  );

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
        profilePrefilledFromStorage.current = true;
        setProfileForm({
          ...defaultProfileForm,
          ...parsed,
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
    const initialState: Record<
      number,
      { paymentMethod: "cash" | "transfer_card" | ""; chargedAmount: string }
    > = {};
    patientViewData.consultations.forEach((c) => {
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
        setSelectedPatientId((prev) =>
          prev ?? (normalized.length > 0 ? normalized[0].id : null)
        );
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

  const handleSavePatientProfile = useCallback(async () => {
    if (!token || !patientViewId) return;
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
  }, [token]);

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

  const handleDocumentsRefresh = useCallback(() => {
    fetchDocuments({ search: documentSearch });
  }, [fetchDocuments, documentSearch]);

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
      const { confirmed, cancelled, cancellationRate, completionRate } =
        metricsStats;
      const { collected, pending, avgTicket, cashCollected, transferCollected } =
        metricsRevenue;
      const topReason = topConsultReasons[0]?.label;
      const insightParts = [
        `En ${rangeLabel.toLowerCase()} tuviste ${confirmed} turnos confirmados y ${cancelled} cancelaciones (tasa ${cancellationRate.toFixed(
          1
        )}%).`,
        `El índice de cumplimiento se mantiene en ${completionRate.toFixed(
          1
        )}%, con ingresos estimados de $ ${collected.toLocaleString(
          "es-AR"
        )} y $ ${pending.toLocaleString(
          "es-AR"
        )} pendientes (ticket promedio $ ${avgTicket.toLocaleString("es-AR")}).`,
        `Detalle de cobros: $ ${cashCollected.toLocaleString(
          "es-AR"
        )} en efectivo y $ ${transferCollected.toLocaleString(
          "es-AR"
        )} vía transferencia/débito/crédito.`,
      ];
      if (topReason) {
        insightParts.push(
          `El motivo más frecuente fue “${topReason}”. Considerá reforzar la comunicación para ese tipo de consulta.`
        );
      }
      if (cancellationRate > 20) {
        insightParts.push(
          "Recomendación IA: sumá recordatorios automáticos o abrí lista de espera para reducir cancelaciones."
        );
      } else if (completionRate > 75) {
        insightParts.push(
          "Recomendación IA: mantené este ritmo ofreciendo opciones de seguimiento o chequeos complementarios."
        );
      } else {
        insightParts.push(
          "Recomendación IA: revisá la disponibilidad ofrecida y confirmá datos clave antes del turno."
        );
      }
      setMetricsSummary(insightParts.join(" "));
      setMetricsSummaryLoading(false);
    }, 350);
  }, [metricsRange, metricsRevenue, metricsStats, topConsultReasons]);

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
        }));

        if (profilePrefilledFromStorage.current) {
          return;
        }

        setProfileForm((prev) => ({
          ...prev,
          specialty: json.specialty ?? "",
          clinicName: json.clinicName ?? "",
          clinicAddress: json.officeAddress ?? "",
          officeDays: json.officeDays ?? "",
          officeHours: json.officeHours ?? "",
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
        }));
      } catch (err) {
        console.error("Error al cargar perfil:", err);
      }
    }

    fetchProfile();
  }, [token, doctor?.businessType, updateDoctorState]);

  useEffect(() => {
    if (activeSection !== "agenda" && hoveredAppointmentId !== null) {
      setHoveredAppointmentId(null);
    }
  }, [activeSection, hoveredAppointmentId]);

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
    if (!token) return;
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
  }, [token, metricsRange]);

  useEffect(() => {
    if (!token) {
      setMetricsAppointmentsData([]);
      return;
    }
    fetchMetricsAppointmentsData();
  }, [token, fetchMetricsAppointmentsData]);

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
        throw new Error(errJson?.error || "Error al enviar mensaje");
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
      const presetMessage = options?.presetMessage ?? "";
      const presetSegments = options?.presetSegments ?? [];
      setBroadcastMessage(presetMessage);
      setSelectedBroadcastSegments(presetSegments);
      fetchPatientSegments({ silent: true });
      setBroadcastModalOpen(true);
    },
    [fetchPatientSegments]
  );

  const handleCloseBroadcastModal = useCallback(() => {
    if (broadcastSending) return;
    setBroadcastModalOpen(false);
    setSelectedBroadcastSegments([]);
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
      if (selectedBroadcastSegments.length > 0) {
        setBroadcastSuccess(
          `Mensaje enviado a ${json.sent} pacientes con las etiquetas seleccionadas (encontramos ${json.total} con esas etiquetas).`
        );
      } else {
        setBroadcastSuccess(
          `Mensaje enviado a ${json.sent} de ${json.total} pacientes.`
        );
      }
      setBroadcastMessage("");
    } catch (err: any) {
      console.error("Error al enviar mensaje masivo:", err);
      setBroadcastError(err?.message || "No pudimos enviar el mensaje masivo.");
    } finally {
      setBroadcastSending(false);
    }
  }, [broadcastMessage, selectedBroadcastSegments, token]);

  const handleOpenRescheduleModal = useCallback(
    (appointment: CalendarAppointment) => {
      setRescheduleModalAppointment(appointment);
      setRescheduleSelectedSlot(null);
      setRescheduleReason("");
      setRescheduleSlots([]);
      setRescheduleSlotsError(null);
      setRescheduleSubmitError(null);
      setHoveredAppointmentId(null);
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

      type InternalMatch = AutomationAppointmentMatch & {
        matchedTokens: number;
        completeness: number;
        totalTokens: number;
      };

      let bestMatch: InternalMatch | null = null;

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
        if (
          !bestMatch ||
          matched > bestMatch.matchedTokens ||
          (matched === bestMatch.matchedTokens &&
            completeness > bestMatch.completeness) ||
          (matched === bestMatch.matchedTokens &&
            completeness === bestMatch.completeness &&
            tokens.length > bestMatch.totalTokens)
        ) {
          bestMatch = {
            ...candidate,
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

      if (!bestMatch) return null;
      const { matchedTokens: _matched, completeness: _comp, totalTokens: _total, ...match } =
        bestMatch;
      return match;
    },
    [automationAppointmentPool, data?.agendaHoy]
  );

  const interpretAutomationCommand = useCallback(
    (input: string) => {
      const lower = input.toLowerCase();
      const responses: string[] = [];
      const effects: Array<() => void> = [];
      let handled = false;
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
    (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!automationInput.trim() || automationProcessing) return;
      const trimmed = automationInput.trim();
      pushAutomationMessage("user", trimmed);
      setAutomationInput("");
      setAutomationProcessing(true);
      setTimeout(() => {
        const { text, effects } = interpretAutomationCommand(trimmed);
        pushAutomationMessage("assistant", text);
        setAutomationProcessing(false);
        effects.forEach((fn) => fn());
      }, 400);
    },
    [
      automationInput,
      automationProcessing,
      interpretAutomationCommand,
      pushAutomationMessage,
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

  const handleToggleBroadcastSegment = useCallback((label: string) => {
    setSelectedBroadcastSegments((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label]
    );
  }, []);

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

  const renderPatientDetailSection = () => {
    if (!patientViewData) return null;
    return (
      <>
        <div className="rounded-2xl card-surface p-4 md:p-6 space-y-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-900">
                {patientViewData.patient.fullName ||
                  `${contactLabels.singularCapitalized} sin nombre`}
              </h3>
              {patientViewData.patient.isProfileComplete === false && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  ⚠︎ Ficha incompleta
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">
              Teléfono:{" "}
              <span className="font-medium text-slate-800">
                {patientViewData.patient.phone || "Sin teléfono"}
              </span>
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            {[
              { label: "DNI", value: patientViewData.patient.dni },
              {
                label: "Fecha de nacimiento",
                value: formatPatientBirthDate(patientViewData.patient.birthDate),
                treatAsFormatted: true,
              },
              {
                label: "Dirección",
                value: patientViewData.patient.address,
              },
              {
                label: "Obra social",
                value: patientViewData.patient.insuranceProvider,
              },
            ].map((field) => (
              <div
                key={`detail-grid-${field.label}`}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {field.label}
                </p>
                <p className="font-semibold text-slate-900 leading-tight line-clamp-2">
                  {field.treatAsFormatted
                    ? field.value
                    : (typeof field.value === "string" && field.value.trim()) ||
                      "Pendiente"}
                </p>
              </div>
            ))}
          </div>
          <div className="pt-2">
            <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">
              Datos importantes
            </p>
            <div className="flex flex-wrap gap-1">
              {patientViewData.patient.tags &&
              patientViewData.patient.tags.length > 0 ? (
                patientViewData.patient.tags.map((tag) => (
                  <span
                    key={`detail-tag-${tag.id}`}
                    className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border inline-flex items-center gap-1 ${getPatientTagBadgeClass(
                      tag.severity
                    )}`}
                  >
                    {tag.label}
                    <button
                      type="button"
                      className="text-[10px] opacity-80 hover:opacity-100"
                      onClick={() =>
                        handleRemovePatientTag(
                          patientViewData.patient.id,
                          tag.id
                        )
                      }
                      disabled={tagRemovingId === tag.id}
                      aria-label="Eliminar etiqueta"
                    >
                      ×
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">
                  Sin etiquetas cargadas para este paciente.
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={() => handleOpenTagModal(patientViewData.patient.id)}
                className="btn btn-outline btn-sm"
              >
                Agregar dato importante
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl card-surface">
          <div className="p-4 md:p-6 text-sm text-slate-600">
            {patientViewData.consultations.length === 0 ? (
              <p className="text-slate-500">
                Todavía no registramos consultas para este{
                  " "
                }
                {contactLabels.singularLower || "paciente"}.
              </p>
            ) : (
              <div className="space-y-3">
                {consultationStatusMessage && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {consultationStatusMessage}
                  </div>
                )}
                {patientViewData.consultations.map((c) => {
                  const date = new Date(c.dateTime);
                  const dateLabel = date.toLocaleDateString("es-AR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "2-digit",
                  });
                  const timeLabel = date.toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const isOpen = !!openConsultations[c.id];
                  const formState = consultationFormState[c.id] || {
                    paymentMethod: "",
                    chargedAmount: "",
                  };
                  const isCancelled =
                    c.status === "cancelled" ||
                    c.status === "cancelled_by_patient" ||
                    c.status === "cancelled_by_doctor" ||
                    c.status === "canceled";
                  const isRescheduled = c.status === "rescheduled";
                  const statusLabel = isCancelled
                    ? "CANCELADO"
                    : isRescheduled
                    ? "REPROGRAMADO"
                    : c.status === "completed"
                    ? "FINALIZADA"
                    : c.status === "incomplete"
                    ? "INCOMPLETA"
                    : "PENDIENTE";
                  const statusBadgeClass = isCancelled
                    ? "bg-[#451320] text-rose-100 border border-rose-400/70 shadow-[0_0_12px_rgba(244,63,94,0.25)]"
                    : isRescheduled
                    ? "bg-[#102437] text-sky-100 border border-sky-400/70 shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                    : c.status === "completed"
                    ? "bg-[#0f2b1f] text-emerald-100 border border-emerald-400/70 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                    : c.status === "incomplete"
                    ? "bg-[#3c2c0d] text-amber-100 border border-amber-400/70 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                    : "bg-[#1f1f1f] text-slate-200 border border-slate-500/40";
                  const paymentSummary = c.paymentMethod
                    ? c.paymentMethod === "cash"
                      ? "Pago en efectivo"
                      : "Transferencia / Débito / Crédito"
                    : "Sin registrar";
                  const amountSummary =
                    typeof c.chargedAmount === "number"
                      ? `$ ${c.chargedAmount.toLocaleString("es-AR")}`
                      : "—";
                  const finalizeDisabled =
                    consultationStatusUpdating === c.id;
                  const handleFinalize = () => {
                    const method = formState.paymentMethod;
                    if (!method) {
                      setConsultationStatusMessage(
                        "Elegí la forma de pago antes de finalizar la consulta."
                      );
                      return;
                    }
                    const amountNumber = Number(formState.chargedAmount);
                    if (!Number.isFinite(amountNumber) || amountNumber < 0) {
                      setConsultationStatusMessage(
                        "Ingresá un monto válido para finalizar la consulta."
                      );
                      return;
                    }
                    handleConsultationStatusUpdate(c.id, "completed", {
                      paymentMethod: method as "cash" | "transfer_card",
                      chargedAmount: amountNumber,
                    });
                  };
                  const handleMarkIncomplete = () =>
                    handleConsultationStatusUpdate(c.id, "incomplete");

                  return (
                    <div key={c.id} className="border border-slate-200 rounded-xl">
                      <button
                        type="button"
                        onClick={() => toggleConsultationCard(c.id)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
                      >
                        <div>
                          <p className="text-xs text-slate-500">
                            {dateLabel} · {timeLabel}
                          </p>
                          <p className="text-sm font-semibold text-slate-900">
                            Turno {dateLabel} · {timeLabel}
                          </p>
                          <p className="text-xs text-slate-500 line-clamp-1">
                            Motivo:{" "}
                            <span className="font-medium text-slate-800">
                              {c.type?.trim() || "Sin detalle"}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusBadgeClass}`}
                          >
                            {statusLabel}
                          </span>
                          <span
                            className={`text-slate-400 transition-transform ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          >
                            ▼
                          </span>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 space-y-4">
                          <div className="text-xs text-slate-500">
                            Pago registrado:{" "}
                            <span className="font-medium text-slate-800">
                              {paymentSummary}
                            </span>{" "}
                            · Monto:{" "}
                            <span className="font-medium text-slate-800">
                              {amountSummary}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                              Forma de pago
                            </p>
                            <div className="grid gap-2 md:grid-cols-2">
                              {PAYMENT_OPTIONS.map((option) => {
                                const selected =
                                  formState.paymentMethod === option.value;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() =>
                                      updateConsultationFormState(c.id, {
                                        paymentMethod: option.value,
                                      })
                                    }
                                    className={`btn btn-sm ${
                                      selected ? "btn-primary" : "btn-outline text-muted"
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                              Monto cobrado (ARS)
                            </p>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={formState.chargedAmount || ""}
                              onChange={(e) =>
                                updateConsultationFormState(c.id, {
                                  chargedAmount: e.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                              placeholder="Ej: 15000"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleFinalize}
                              disabled={finalizeDisabled || isCancelled}
                              className={`btn btn-sm ${
                                finalizeDisabled || isCancelled
                                  ? "btn-outline opacity-50 cursor-not-allowed"
                                  : c.status === "completed"
                                  ? "btn-success"
                                  : "btn-primary"
                              }`}
                            >
                              {finalizeDisabled
                                ? "Actualizando..."
                                : isCancelled
                                ? "Turno cancelado"
                                : c.status === "completed"
                                ? "✓ Consulta finalizada"
                                : "Guardar y finalizar"}
                            </button>
                            <button
                              type="button"
                              onClick={handleMarkIncomplete}
                              disabled={
                                consultationStatusUpdating === c.id || isCancelled
                              }
                              className={`btn btn-sm ${
                                consultationStatusUpdating === c.id || isCancelled
                                  ? "btn-outline opacity-50 cursor-not-allowed"
                                  : c.status === "incomplete"
                                  ? "btn-warning"
                                  : "btn-outline"
                              }`}
                            >
                              {consultationStatusUpdating === c.id
                                ? "Actualizando..."
                                : isCancelled
                                ? "Turno cancelado"
                                : c.status === "incomplete"
                                ? "⚠ Consulta incompleta"
                                : "Marcar como incompleta"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </>
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

  const handleCalendarPrevWeek = () => {
    setCalendarWeekStart((prev) => addDays(prev, -7));
  };

  const handleCalendarNextWeek = () => {
    setCalendarWeekStart((prev) => addDays(prev, 7));
  };

  const handleCalendarToday = () => {
    setCalendarWeekStart(startOfWeek(new Date()));
  };

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
    setProfileForm((prev) => ({
      ...prev,
      [name]: value,
    }));
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
      const payload = {
        specialty: profileForm.specialty || null,
        clinicName: profileForm.clinicName || null,
        officeDays: profileForm.officeDays || null,
        officeHours: profileForm.officeHours || null,
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

  const handleProfileImageInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!token || !doctor) return;
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_PROFILE_IMAGE_TYPES.includes(file.type)) {
      setProfileImageError("Formato no soportado. Subí PNG, JPG o WebP.");
      if (profileImageInputRef.current) {
        profileImageInputRef.current.value = "";
      }
      return;
    }
    if (file.size > MAX_PROFILE_IMAGE_SIZE) {
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
    whatsappStatus: whatsappConnection.status,
    whatsappNumber: prettyWhatsappNumber(whatsappConnection.businessNumber),
    whatsappLoading,
    whatsappError,
    onRequestConnect: handleOpenConnectModal,
    onRequestDisconnect: handleRequestDisconnect,
    onLogout: handleLogout,
  };

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
                    className="text-[11px] px-3 py-1 rounded-full border border-white/10 text-muted hover:text-[#031816] hover:bg-gradient-to-r hover:from-[#39F3D7] hover:to-[#68AFDD]"
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
              </div>
            </div>
          </div>
        )}

        {/* Contenido */}
        <main className="flex-1 px-4 md:px-8 py-6">
          <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
            <div>
              Sesión iniciada como{" "}
              <span className="font-medium">{doctor.name}</span>{" "}
              <span className="text-xs text-slate-400">({doctor.email})</span>
            </div>
          </div>
          <div key={activeSection} className="section-transition">
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
                      </div>
                    </div>

                    {/* Agenda de hoy */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                          Pacientes para hoy
                        </h3>
                      </div>
                      {data.agendaHoy.length === 0 ? (
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
                    <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-700 text-white shadow-soft p-4 md:p-5 space-y-2">
                      <div>
                        <p className="text-sm font-semibold">
                          Comunicación masiva
                        </p>
                        <p className="text-xs text-white/80">
                          Segmentá recordatorios con etiquetas o avisá novedades por WhatsApp.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenBroadcastModal}
                        className="w-full inline-flex items-center justify-center rounded-xl bg-white/15 backdrop-blur px-4 py-2 text-sm font-semibold transition hover:bg-white/25"
                      >
                        Enviar mensaje masivo / segmentado
                      </button>
                    </div>
                    <div className="rounded-2xl card-surface p-4 md:p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-sm font-semibold">
                            Resumen de métricas
                          </h2>
                          <p className="text-xs text-muted">
                            {metricsRangeLabel}. Datos actualizados con tus turnos confirmados y cancelados.
                          </p>
                        </div>
                      </div>
                      {metricsAppointmentsLoading ? (
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
                        accept={ALLOWED_PROFILE_IMAGE_TYPES.join(",")}
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

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Profesión / Especialidad
                      </label>
                      <input
                        type="text"
                        name="specialty"
                        value={profileForm.specialty}
                        onChange={handleProfileChange}
                        placeholder="Ej: Clínica médica, pediatría..."
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
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
                      Nombre del consultorio o clínica
                    </label>
                    <input
                      type="text"
                      name="clinicName"
                      value={profileForm.clinicName}
                      onChange={handleProfileChange}
                      placeholder="Ej: Consultorios García"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Dirección del consultorio
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
                      <input
                        type="text"
                        name="officeDays"
                        value={profileForm.officeDays}
                        onChange={handleProfileChange}
                        placeholder="Ej: Lunes a viernes"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Horarios de atención
                      </label>
                      <input
                        type="text"
                        name="officeHours"
                        value={profileForm.officeHours}
                        onChange={handleProfileChange}
                        placeholder="Ej: 9 a 13 hs y 15 a 19 hs"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Precio consulta estándar
                      </label>
                      <input
                        type="text"
                        name="consultFee"
                        value={profileForm.consultFee}
                        onChange={handleProfileChange}
                        placeholder="Ej: 35000"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Precio consulta de urgencia
                      </label>
                      <input
                        type="text"
                        name="emergencyFee"
                        value={profileForm.emergencyFee}
                        onChange={handleProfileChange}
                        placeholder="Ej: 50000"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                      />
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
                      placeholder="Ej: no agendar turnos después de las 20 hs, dejar 30 minutos entre consultas, etc."
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
                    </div>
                  </div>
                  {patientViewLoading && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                      Cargando datos del paciente...
                    </div>
                  )}
                  {profileEditorOpen && patientViewData && (
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
                        {[
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
                        ].map((input) => (
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
                  {renderPatientDetailSection()}

                  {patientSummaryModalOpen && (
                    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
                      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-lg font-semibold text-slate-900">
                              Resumen del paciente
                            </h4>
                            <p className="text-xs text-slate-500">
                              Generado automáticamente a partir de las consultas y motivos registrados.
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
                          placeholder="Ej: responde mejor en consultas de tarde, suele presentar cefaleas luego de episodios de estrés..."
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
                  <div className="rounded-2xl card-surface p-4 md:p-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                          {contactLabels.plural} de WhatsApp
                        </h2>
                        <p className="text-sm text-slate-500">
                          Listado filtrado por tu cuenta. Buscá por nombre, número u
                          obra social.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs">
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                          <p className="text-slate-500">Total</p>
                          <p className="text-base font-semibold text-slate-900">
                            {patientStats.total}
                          </p>
                        </div>
                        {isMedicalDoctor && (
                          <>
                            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                              <p className="text-slate-500">Obra social pendiente</p>
                              <p className="text-base font-semibold text-slate-900">
                                {patientStats.pendingInsurance}
                              </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                              <p className="text-slate-500">Motivo pendiente</p>
                              <p className="text-base font-semibold text-slate-900">
                                {patientStats.pendingReason}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <input
                        type="text"
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                        placeholder={`Buscar ${contactLabels.pluralLower} por nombre, teléfono o nota`}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
                      />
                      {patientsError && (
                        <p className="text-xs text-rose-600">{patientsError}</p>
                      )}
                      {loadingPatients && (
                        <p className="text-xs text-slate-500">
                          Cargando {contactLabels.pluralLower}...
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {filteredPatients.length === 0 && !loadingPatients && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                        {patientSearch.trim()
                          ? `No encontramos ${contactLabels.pluralLower} que coincidan con “${patientSearch}”.`
                          : `Todavía no registramos ${contactLabels.pluralLower} desde WhatsApp.`}
                      </div>
                    )}

                    {filteredPatients.map((p) => {
                  const missingInsurance =
                    isMedicalDoctor && !(p.insuranceProvider || "").trim();
                  const missingReason =
                    isMedicalDoctor && !(p.consultReason || "").trim();

                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenPatientDetail(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleOpenPatientDetail(p.id);
                        }
                      }}
                      className="rounded-2xl card-surface px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 cursor-pointer transition-all hover:-translate-y-0.5"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-slate-900">
                            {p.fullName ||
                              `${contactLabels.singularCapitalized} sin nombre`}
                          </h3>
                          {missingInsurance || missingReason ? (
                            <span className="text-[11px] uppercase tracking-wide bg-[#3b2507] text-amber-100 px-2 py-0.5 rounded-full border border-amber-400/60">
                              Datos incompletos
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-500">
                          {p.phone || "Sin teléfono registrado"}
                        </p>
                        {isMedicalDoctor && (
                          <div className="text-xs text-slate-600 mt-2">
                            <p>
                              <span className="text-slate-400">
                                Obra social:
                              </span>{" "}
                              <span className="font-medium text-slate-800">
                                {p.insuranceProvider?.trim() || "Pendiente"}
                              </span>
                            </p>
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {p.tags && p.tags.length > 0 ? (
                            p.tags.map((tag) => (
                              <span
                                key={`list-tag-${p.id}-${tag.id}`}
                                className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${getPatientTagBadgeClass(
                                  tag.severity
                                )}`}
                              >
                                {tag.label}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-500">
                              Sin datos importantes
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenPatientChat(p.id);
                          }}
                          className="btn btn-outline btn-sm"
                        >
                          Abrir chat
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenTagModal(p.id);
                          }}
                          className="btn btn-ghost btn-sm"
                        >
                          Etiquetar
                        </button>
                      </div>
                    </div>
                  );
                })}
                  </div>
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
                      onClick={handleDownloadClinicalHistory}
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

                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                      <p className="font-semibold text-slate-800 mb-1">Próximamente</p>
                      <p>
                        Estamos diseñando el módulo completo de historia clínica: podrás cargar antecedentes, alergias, hábitos, adjuntar estudios e imprimir resúmenes para derivaciones.
                      </p>
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

              <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
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
                                      appt.patient.id &&
                                      handleOpenPatientDetail(appt.patient.id)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        if (appt.patient.id) {
                                          handleOpenPatientDetail(appt.patient.id);
                                        }
                                      }
                                    }}
                                    onMouseEnter={() => {
                                      if (hoverTimeoutRef.current) {
                                        clearTimeout(hoverTimeoutRef.current);
                                        hoverTimeoutRef.current = null;
                                      }
                                      setHoveredAppointmentId(appt.id);
                                    }}
                                    onMouseLeave={() => {
                                      if (hoverTimeoutRef.current) {
                                        clearTimeout(hoverTimeoutRef.current);
                                      }
                                      hoverTimeoutRef.current = setTimeout(() => {
                                        setHoveredAppointmentId((prev) =>
                                          prev === appt.id ? null : prev
                                        );
                                      }, 120);
                                    }}
                                    className={`absolute left-1 right-1 rounded-xl px-3 py-2 text-left text-[11px] leading-tight text-white shadow-soft cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/40 overflow-visible ${
                                      appt.source === "whatsapp"
                                        ? "bg-emerald-500/90"
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
                                  {hoveredAppointmentId === appt.id && (
                                    <div
                                      className="absolute z-50 left-full ml-3 w-72 tooltip-panel px-4 py-4 text-[11px] text-muted pointer-events-auto"
                                      style={{ top: "20%", transform: "translateY(-80%)" }}
                                      onMouseEnter={(e) => {
                                        e.stopPropagation();
                                        if (hoverTimeoutRef.current) {
                                          clearTimeout(hoverTimeoutRef.current);
                                          hoverTimeoutRef.current = null;
                                        }
                                        setHoveredAppointmentId(appt.id);
                                      }}
                                      onMouseLeave={(e) => {
                                        e.stopPropagation();
                                        if (hoverTimeoutRef.current) {
                                          clearTimeout(hoverTimeoutRef.current);
                                        }
                                        hoverTimeoutRef.current = setTimeout(() => {
                                          setHoveredAppointmentId((prev) =>
                                            prev === appt.id ? null : prev
                                          );
                                        }, 120);
                                      }}
                                    >
                                      <p className="text-sm font-semibold text-white mb-1">
                                        {patientName}
                                      </p>
                                      <div className="space-y-1">
                                        <p>
                                          <span className="text-muted">Fecha:</span>{" "}
                                          {apptDate.toLocaleDateString("es-AR", {
                                            weekday: "short",
                                            day: "2-digit",
                                            month: "2-digit",
                                          })}
                                        </p>
                                        <p>
                                          <span className="text-muted">Hora:</span>{" "}
                                          {apptDate.toLocaleTimeString("es-AR", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </p>
                                        <p>
                                          <span className="text-muted">Motivo:</span>{" "}
                                          {appt.type || "Sin detalle"}
                                        </p>
                                        <p>
                                          <span className="text-muted">
                                            Obra social:
                                          </span>{" "}
                                          {appt.patient.insuranceProvider?.trim() ||
                                            "No informada"}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        className="btn btn-primary btn-sm w-full mt-3"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenRescheduleModal(appt);
                                        }}
                                      >
                                        Reprogramar
                                      </button>
                                    </div>
                                  )}
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

          {/* === Sección: MÉTRICAS === */}
          {activeSection === "metrics" && (
            <section className="mt-6 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Métricas del negocio
                  </h2>
                  <p className="text-sm text-slate-500">
                    Seguimiento de turnos, cancelaciones e ingresos ({metricsRangeLabel.toLowerCase()}).
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

              {metricsAppointmentsLoading ? (
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

          {/* === Sección: DOCUMENTOS === */}
          {activeSection === "documents" && (
            <section className="mt-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Documentos recibidos
                  </h2>
                  <p className="text-sm text-slate-500">
                    Revisá los archivos que compartieron tus pacientes por WhatsApp.
                  </p>
                </div>
                {documentsPatientViewId === null && (
                  <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <div className="relative flex-1 sm:min-w-[240px]">
                      <input
                        type="text"
                        value={documentSearch}
                        onChange={handleDocumentSearchChange}
                        placeholder="Buscar por paciente o nota"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm pr-12 focus:outline-none focus:ring-2 focus:ring-slate-900/5 bg-white"
                      />
                      {documentSearch && (
                        <button
                          type="button"
                          onClick={() => setDocumentSearch("")}
                          className="absolute inset-y-0 right-8 text-xs text-slate-400 hover:text-slate-600"
                          aria-label="Limpiar búsqueda"
                        >
                          Limpiar
                        </button>
                      )}
                      <span className="absolute inset-y-0 right-2 flex items-center text-slate-400 text-[11px]">
                        {documentsLoading ? "..." : "Buscar"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleDocumentsRefresh}
                      className="btn btn-outline btn-sm"
                    >
                      Actualizar
                    </button>
                  </div>
                )}
              </div>

              {documentsPatientViewId !== null && selectedDocumentsGroup && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setDocumentsPatientViewId(null)}
                        className="btn btn-outline btn-sm"
                      >
                        ← Volver
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenPatientDetail(selectedDocumentsGroup.patientId)
                        }
                        className="btn btn-outline btn-sm"
                      >
                        Abrir ficha del paciente
                      </button>
                    </div>
                  <div className="rounded-2xl border border-slate-100 bg-white shadow-soft p-5 space-y-4">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">
                        {selectedDocumentsGroup.patientName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {selectedDocumentsGroup.documents.length}{" "}
                        {selectedDocumentsGroup.documents.length === 1
                          ? "archivo cargado"
                          : "archivos cargados"}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {selectedDocumentsGroup.documents.map((doc) => {
                        const typeLabel = getDocumentTypeLabel(doc.mediaContentType);
                        const badge = getDocumentTypeBadge(doc.mediaContentType);
                        const caption = doc.caption?.trim();
                        return (
                          <div
                            key={doc.id}
                            className="rounded-2xl border border-slate-100 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-[10px] font-semibold text-slate-600">
                                {badge}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {caption || `${typeLabel} enviado`}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {typeLabel} · {formatDocumentTimestamp(doc.createdAt)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => handleOpenDocument(doc.id)}
                                disabled={documentDownloadId === doc.id}
                                className="btn btn-primary btn-sm text-center disabled:opacity-60"
                              >
                                {documentDownloadId === doc.id
                                  ? "Abriendo..."
                                  : "Ver archivo"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {documentsPatientViewId !== null && !selectedDocumentsGroup && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                  No encontramos archivos para este paciente. Probá volver al listado.
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setDocumentsPatientViewId(null)}
                      className="btn btn-outline btn-sm"
                    >
                      Volver al listado
                    </button>
                  </div>
                </div>
              )}

              {documentsPatientViewId === null && documentsError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <span>{documentsError}</span>
                  <button
                    type="button"
                    onClick={handleDocumentsRefresh}
                    className="btn btn-outline btn-sm border border-rose-300 text-rose-200 hover:text-rose-50"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {documentsPatientViewId === null && documentsLoading && (
                <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 text-sm text-slate-500">
                  Cargando documentos...
                </div>
              )}

              {documentsPatientViewId === null &&
                !documentsLoading &&
                !documentsError &&
                documentsByPatient.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                    Todavía no hay archivos cargados. Cuando los pacientes envíen estudios
                    o recetas van a aparecer en esta lista.
                  </div>
                )}

              {documentsPatientViewId === null &&
                !documentsError &&
                documentsByPatient.length > 0 && (
                  <div className="space-y-4">
                    {documentsByPatient.map((group) => (
                      <button
                        key={group.patientId}
                        type="button"
                        onClick={() => setDocumentsPatientViewId(group.patientId)}
                        className="w-full rounded-2xl border border-slate-100 bg-white shadow-soft p-4 text-left transition hover:border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-slate-900">
                              {group.patientName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {group.documents.length}{" "}
                              {group.documents.length === 1 ? "archivo" : "archivos"} · Última
                              carga {formatDocumentTimestamp(group.documents[0].createdAt)}
                            </p>
                          </div>
                          <span className="text-[11px] uppercase tracking-wide text-slate-400">
                            Ver archivos →
                          </span>
                        </div>
                      </button>
                    ))}
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
            activeSection !== "metrics" &&
            activeSection !== "documents" && (
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
      </main>
    </div>
      {tagModalOpen && tagModalPatientId && (
        <Modal onClose={handleCloseTagModal} contentClassName="max-w-md">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Agregar dato importante
                </h3>
                <p className="text-sm text-muted">
                  Etiquetá al paciente para segmentar recordatorios y campañas.
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
                Descripción del dato
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-700 bg-[#0f0f0f] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#39f3d7]/30"
                maxLength={60}
                value={tagFormLabel}
                onChange={(e) => setTagFormLabel(e.target.value)}
                placeholder="Ej: Hipertenso, Control gestacional, Post operatorio..."
                disabled={tagSaving}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">
                Prioridad
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PATIENT_TAG_SEVERITY_OPTIONS.map((option) => {
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
        <Modal onClose={handleCloseMetricsSummaryModal}>
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
                  Enviar mensaje a todos tus pacientes
                </h3>
                <p className="text-sm text-slate-500">
                  Este texto se envía por WhatsApp a todos tus pacientes o solo a los segmentos que elijas.
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
                placeholder="Ej: Hola! Te recordamos que estaremos atendiendo con horario reducido la próxima semana..."
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Límite 1000 caracteres. Se envía desde tu número conectado.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600">
                  Segmento (opcional)
                </label>
                {patientSegmentsLoading && (
                  <span className="text-[10px] text-slate-400">
                    Cargando...
                  </span>
                )}
              </div>
              {patientSegments.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Todavía no agregaste etiquetas. Usá “Agregar dato importante”
                  en la ficha del paciente para clasificar y segmentar envíos.
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
                Si seleccionás etiquetas, el mensaje se enviará sólo a los
                pacientes que las tengan asignadas. Sin selección se envía a
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
              Por ahora no hay números disponibles. Pedile a tu admin que cargue uno nuevo.
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
