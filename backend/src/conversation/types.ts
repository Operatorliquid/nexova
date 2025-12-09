import { ConversationState } from "@prisma/client";

export type CalendarSlot = {
  startISO: string;
  humanLabel: string;
};

export type ConversationIntent = "book" | "reschedule" | "cancel";

export type ConversationStateData = {
  intent?: ConversationIntent;
  pendingDays?: Array<{
    id: string;
    dateISO: string;
    label: string;
    aliases?: string[];
  }>;
  pendingSlots?: Array<{
    id: string;
    startISO: string;
    label: string;
    aliases?: string[];
  }>;
  selectedDayISO?: string | null;
  rescheduleAppointmentId?: number | null;
  pendingReasonSlot?: {
    slotISO: string;
    slotLabel: string;
    appointmentId?: number | null;
  };
  requireFreshReason?: boolean;
  onboardingReasonSatisfied?: boolean;
};

export type PatientProfilePatch = {
  fullName?: string;
  insuranceProvider?: string | null;
  consultReason?: string | null;
  dni?: string | null;
  birthDate?: string | null;
  address?: string | null;
  needsName?: boolean;
  needsDni?: boolean;
  needsBirthDate?: boolean;
  needsAddress?: boolean;
  needsInsurance?: boolean;
  needsConsultReason?: boolean;
};

export type AppointmentSummary = {
  id: number;
  dateTime: Date;
  humanLabel: string;
  status: string;
};

export type ConversationContext = {
  incomingText: string;
  timezone: string;
  businessType: "HEALTH" | "BEAUTY" | "RETAIL";
  patient: {
    id: number;
    fullName: string;
    dni?: string | null;
    birthDate?: string | null;
    address?: string | null;
    conversationState: ConversationState;
    conversationStateData?: unknown;
    needsDni: boolean;
    needsName: boolean;
    needsBirthDate: boolean;
    needsAddress: boolean;
    needsInsurance: boolean;
    needsConsultReason: boolean;
    insuranceProvider?: string | null;
    consultReason?: string | null;
  };
  availableSlots: CalendarSlot[];
  activeAppointment?: AppointmentSummary | null;
  findPatientByDni?: (
    dni: string
  ) => Promise<{
    id: number;
    fullName: string;
    needsDni: boolean;
    needsName: boolean;
    needsBirthDate: boolean;
    needsAddress: boolean;
    needsInsurance: boolean;
    needsConsultReason: boolean;
  } | null>;
};

export type MenuOption = {
  id: string;
  label: string;
  description?: string;
  aliases?: string[];
};

export type MenuTemplate = {
  title: string;
  prompt: string;
  options: MenuOption[];
  hint?: string;
};

export type BookingRequest = {
  type: "book" | "reschedule";
  slotISO: string;
  slotLabel: string;
  appointmentId?: number | null;
};

export type CancelRequest = {
  appointmentId: number;
};

export type ConversationFlowResult =
  | {
      handled: true;
      reply: string;
      menu?: MenuTemplate;
      nextState: ConversationState;
      stateData?: ConversationStateData | null;
      patientProfilePatch?: PatientProfilePatch;
      bookingRequest?: BookingRequest;
      cancelRequest?: CancelRequest;
      mergeWithPatientId?: number;
    }
  | { handled: false };
