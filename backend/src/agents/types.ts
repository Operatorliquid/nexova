import OpenAI from "openai";

export type AgentProfileUpdates = {
  name?: string | null;
  insurance?: string | null;
  consultReason?: string | null;
  dni?: string | null;
  birthDate?: string | null;
  address?: string | null;
};

type AgentToolActionBase = {
  profileUpdates?: AgentProfileUpdates | null;
};

export type AgentToolAction =
  | ({ type: "general"; reply: string } & AgentToolActionBase)
  | ({
      type: "offer_slots";
      reply: string;
      slots: Array<{ startISO: string; humanLabel: string }>;
      reason?: string | null;
    } & AgentToolActionBase)
  | ({
      type: "confirm_slot";
      slot: { startISO: string; humanLabel: string } | null;
      reply: string;
      reason?: string | null;
    } & AgentToolActionBase)
  | ({ type: "ask_clarification"; reply: string } & AgentToolActionBase)
  | ({
      type: "retail_upsert_order";
      reply: string;
      items: Array<{ name: string; quantity: number }>;
      status?: "pending" | "confirmed" | "cancelled";
      mode?: "replace" | "merge";
      clientInfo?: { fullName?: string; dni?: string; address?: string };
    } & AgentToolActionBase)
  | ({
      type: "retail_cancel_order";
      reply: string;
    } & AgentToolActionBase);

export type AgentExecutionResult = {
  replyToPatient: string;
  action: AgentToolAction;
  profileUpdates?: AgentProfileUpdates | null;
};

export type AgentContextBase = {
  text: string;
  patientName: string | null;
  patientPhone: string;
  doctorName: string;
  doctorId: number;
  timezone: string;
  availableSlots: Array<{ startISO: string; humanLabel: string }>;
  recentMessages: { from: "patient" | "doctor"; text: string }[];
  patientProfile: {
    consultReason: string | null;
    pendingSlotISO: string | null;
    pendingSlotHumanLabel: string | null;
    pendingSlotExpiresAt: string | null;
    pendingSlotReason: string | null;
    dni: string | null;
    birthDate: string | null;
    address: string | null;
    needsDni: boolean;
    needsName: boolean;
    needsBirthDate: boolean;
    needsAddress: boolean;
    needsInsurance: boolean;
    needsConsultReason: boolean;
    preferredDayISO: string | null;
    preferredDayLabel: string | null;
    preferredHourMinutes: number | null;
    preferredDayHasAvailability: boolean | null;
  };
  doctorProfile: {
    specialty: string | null;
    clinicName: string | null;
    officeAddress: string | null;
    officeCity: string | null;
    officeMapsUrl: string | null;
    officeDays: string | null;
    officeHours: string | null;
    contactPhone: string | null;
    consultationPrice: number | null;
    emergencyConsultationPrice: number | null;
    additionalNotes: string | null;
    slotMinutes?: number | null;
  };
  pendingOrders?: Array<{
    sequenceNumber: number;
    status: string;
    items: Array<{ name: string; quantity: number }>;
  }>;
};

export type AgentRunner = (
  ctx: AgentContextBase,
  openai: OpenAI | null
) => Promise<AgentExecutionResult | null>;
