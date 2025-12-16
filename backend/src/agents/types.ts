import OpenAI from "openai";

export type AgentProfileUpdates = {
  name?: string | null;
  insurance?: string | null;
  consultReason?: string | null;
  dni?: string | null;
  birthDate?: string | null;
  address?: string | null;
};

// =====================
// Retail (comercios)
// =====================
export type RetailOrderItemOp = "add" | "remove" | "set";

export type RetailOrderItem = {
  /** Texto tal cual lo dijo el cliente (puede venir con typos). */
  name: string;
  /** Nombre normalizado (para match con catálogo). Si no aplica, repetir `name`. */
  normalizedName?: string;
  /** Cantidad (para op=remove puede omitirse). */
  quantity?: number;
  /** Nota/aclaración: sabor, tamaño, etc. */
  note?: string;
  /** Operación a aplicar sobre el pedido actual. */
  op?: RetailOrderItemOp;
};

export type RetailClientInfo = {
  fullName?: string;
  dni?: string;
  address?: string;
};

export type RetailPaymentProof = {
  /** Si llegó media (foto/pdf) por WhatsApp. */
  hasMedia?: boolean;
  /** URLs de media (si las tenés en contexto). */
  mediaUrls?: string[];
  /** Monto detectado (si el cliente lo escribió). */
  amount?: number | null;
  /** Método: transferencia/MP/efectivo/etc. */
  method?: string | null;
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
      /** Items/ops mencionados en ESTE mensaje. */
      items: RetailOrderItem[];
      status?: "pending" | "confirmed" | "cancelled";
      /** merge=agregar/modificar; replace=reemplazar todo (solo si el cliente lo pidió explícito). */
      mode?: "replace" | "merge";
      clientInfo?: RetailClientInfo;
      /** Si el cliente refiere a un pedido específico (#12). */
      orderSequenceNumber?: number | null;
      /** Texto corto: qué quiso hacer. */
      intent?: string;
      /** 0..1: qué tan seguro estás. */
      confidence?: number;
    } & AgentToolActionBase)
  | ({
      type: "retail_confirm_order";
      reply: string;
      orderSequenceNumber?: number | null;
      intent?: string;
      confidence?: number;
    } & AgentToolActionBase)
  | ({
      type: "retail_attach_payment_proof";
      reply: string;
      orderSequenceNumber?: number | null;
      paymentProof?: RetailPaymentProof;
      /** Si falta info para asignar el comprobante, el backend puede guardar un "awaiting". */
      needsOrderReference?: boolean;
      intent?: string;
      confidence?: number;
    } & AgentToolActionBase)
  | ({
      type: "retail_cancel_order";
      reply: string;
      orderSequenceNumber?: number | null;
      intent?: string;
      confidence?: number;
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
