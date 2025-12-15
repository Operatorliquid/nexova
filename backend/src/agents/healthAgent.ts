import OpenAI from "openai";
import {
  AgentContextBase,
  AgentExecutionResult,
  AgentProfileUpdates,
  AgentToolAction,
} from "./types";

const DEFAULT_MODEL = "gpt-4.1-mini";
const IS_DEV_ENV = process.env.NODE_ENV !== "production";

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  name: "HealthAgentResponse",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["reply", "action"],
    properties: {
      reply: { type: "string", minLength: 1 },
      action: {
        type: "object",
        additionalProperties: false,
        required: ["type", "payload"],
        properties: {
          type: {
            type: "string",
            enum: [
              "offer_slots",
              "confirm_slot",
              "ask_clarification",
              "general",
            ],
          },
          payload: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
    },
  },
  strict: true,
};

const SYSTEM_PROMPT = `
Sos un asistente de WhatsApp para profesionales de la salud.
Actuás como ser humano: respondé cálido, profesional y breve. Si la conversación ya está avanzada, NO repitas saludos como "Hola de nuevo".
Interpretá faltas de ortografía, abreviaturas y jerga del paciente.

Proceso mental (no lo menciones):
1. Identificá datos faltantes, preferencias del paciente y si existe un turno pendiente.
2. Revisá la agenda del doctor: solo podés usar los slots listados en "Horarios disponibles" o el turno pendiente.
3. Decidí la acción y redactá la respuesta recién después de validar los pasos anteriores.

Objetivos:
1. Confirmar o coordinar turnos usando EXCLUSIVAMENTE los slots provistos en "available_slots". Elegí el que mejor matchee la preferencia del paciente (día/horario), incluso si está escrito como "5pm" o "17 hs".
2. Si el paciente solo está pidiendo información (precios, dirección, qué llevamos, etc.) y no expresó intención inmediata de agendar/reprogramar, respondé esa consulta y NO ofrezcas horarios salvo que él lo pida después.
3. Si el paciente acepta un horario ofrecido previamente (pendiente), confirmalo.
4. Si todavía no eligió, ofrecé hasta 3 slots (ordenados por prioridad) y pedile que confirme uno.
5. Registrá/actualizá el motivo de la consulta cuando sea posible (ej: "Dolor de cabeza").
6. Si no hay disponibilidad o falta información, explicalo y pedí aclaraciones concretas.
6. Antes de ofrecer turnos, revisá si faltan datos básicos. Si "patient_profile.needsDni" es true, pedí el DNI (solo números). Luego seguí con: nombre completo, fecha de nacimiento, dirección, obra social/prepaga y motivo de consulta (respetá ese orden). No avances al siguiente paso hasta completar el anterior.
7. Cada vez que el paciente aporte alguno de esos datos (aunque sea una sola palabra, ej.: “OSDE”), registralo textual en "action.profileUpdates" usando los campos "dni", "name", "birthDate", "address", "insurance" y/o "consultReason". No inventes ni reformules esos datos.
   "action": { "type": "general", "profileUpdates": { "dni": "12345678" } }
8. Usá el historial reciente para mantener el hilo de la charla; no repitas información ya confirmada salvo que el paciente lo pida.
9. Si el paciente menciona un día u horario preferido, priorizá los slots que coinciden o se acercan lo máximo posible. NO digas que no hay disponibilidad si existe un slot compatible en la lista que recibís.
10. Respetá los horarios de atención configurados para el consultorio; no propongas horarios fuera de ese rango.
11. Si no hay un slot que cumpla con la preferencia exacta, ofrecé el más cercano indicando claramente que es la alternativa disponible. Nunca inventes horarios.
12. Si encontrás un horario exactamente igual al que pidió el paciente, confirmalo tal cual (ej: “Sí, tengo disponible ese viernes a las 18:00”) sin decir que es “aproximado” o “cercano”.
13. Si la conversación viene hablando de un día/turno (ej: “viernes por la tarde”), mantené ese día salvo que el paciente cambie explícitamente. Si no hay disponibilidad ese día, decilo con claridad en vez de saltar a otra fecha.
14. Si "Disponibilidad para el día pedido" indica que NO hay turnos, comunicalo tal cual antes de ofrecer alternativas.
15. NO confirmes un turno si el paciente solo está consultando disponibilidad (“¿tenés a las 18?”). Primero respondé y pedí una confirmación explícita. Solo cuando el paciente diga que le sirve, enviá una acción \`confirm_slot\`.
16. Si el paciente expresa confusión o enojo (ej.: “wtf”, “no entendí”), respondé con empatía y aclaraciones antes de volver a ofrecer turnos.
17. Usá SIEMPRE formato horario de 24 horas (ej.: "16:00") en tus mensajes y evitá mencionar “p.m.” o “a.m.”.
18. Si el paciente cancela o rechaza un turno propuesto/pendiente, reconocelo, indicá que quedó liberado y ofrecé alternativas válidas del calendario solo si tiene sentido.
19. Nunca inventes fechas o turnos. Si no hay disponibilidad exacta, decilo tal cual e indicá la alternativa más cercana.
20. Basá tus respuestas en la información provista; evitá Heurísticas o suposiciones externas.

Formato de respuesta (JSON estricto):
{
  "reply": "texto natural para enviar por WhatsApp",
  "action": {
    "type": "offer_slots" | "confirm_slot" | "ask_clarification" | "general",
    ...payload_específico
  }
}
`;

export async function runHealthAgent(
  ctx: AgentContextBase,
  openai: OpenAI | null
): Promise<AgentExecutionResult | null> {
  if (!openai) {
    return null;
  }

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_APPOINTMENT_MODEL || DEFAULT_MODEL,
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildAgentUserPrompt(ctx),
        },
      ],
      text: {
        format: RESPONSE_FORMAT,
      },
    } as any);

    const parsed = extractStructuredResponse(response);
    if (!parsed) {
      logAgentResponse(null, "No se pudo obtener JSON estructurado");
      return null;
    }

    const reply =
      getStringField(parsed, ["reply", "Reply", "message", "text"]) ||
      "Listo, ¿en qué más te ayudo?";

    let action = normalizeAction(parsed.action ?? parsed.Action ?? null, parsed);
    action = enforceActionConsistency(action, ctx);
    action = enforcePatientDataPolicy(action, ctx);

    return {
      replyToPatient: reply,
      action,
      profileUpdates: action.profileUpdates ?? null,
    };
  } catch (error) {
    console.error("[HealthAgent] Error:", error);
    return null;
  }
}

function extractStructuredResponse(response: any) {
  try {
    const outputs = response?.output;
    if (Array.isArray(outputs)) {
      for (const block of outputs) {
        const contents = block?.content;
        if (!Array.isArray(contents)) continue;
        for (const entry of contents) {
          if (entry?.json && typeof entry.json === "object") {
            return entry.json;
          }
          if (entry?.type === "output_text" && entry?.text?.json) {
            return entry.text.json;
          }
        }
      }
    }
    if (
      response?.output?.[0]?.content?.[0]?.json &&
      typeof response.output[0].content[0].json === "object"
    ) {
      return response.output[0].content[0].json;
    }
    return null;
  } catch (error) {
    console.error("[HealthAgent] extractStructuredResponse error:", error);
    return null;
  }
}

function normalizeAction(action: any, rootPayload?: any): AgentToolAction {
  const payload =
    action?.payload ??
    action?.details ??
    action?.data ??
    null;
  const profileUpdates =
    extractProfileUpdates(action, rootPayload) ||
    extractProfileUpdates(payload, rootPayload) ||
    extractProfileUpdates(rootPayload);

  if (!action || typeof action !== "object") {
    return {
      type: "general" as const,
      reply: "",
      profileUpdates,
    };
  }

  const rawType =
    action.type ?? action.Type ?? action.actionType ?? action.ActionType;
  const type = typeof rawType === "string" ? rawType.toLowerCase() : "";

  if (type === "offer_slots" || type === "list_slots") {
    const slotsSource =
      payload?.slots ??
      action.slots ??
      action.SLOTS ??
      action.options ??
      action.Options ??
      action.option ??
      action.Option ??
      rootPayload?.slots ??
      null;
    const normalizedSlots = normalizeSlots(slotsSource);

    return {
      type: "offer_slots" as const,
      reply:
        getStringField(action, ["reply", "Reply"]) ||
        getStringField(payload, ["reply", "Reply"]) ||
        "",
      slots: normalizedSlots.slice(0, 3),
      reason:
        getStringField(action, ["reason", "Reason"]) ||
        getStringField(payload, ["reason", "Reason"]) ||
        getStringField(action, ["motive", "Motive"]) ||
        getStringField(payload, ["motive", "Motive"]) ||
        null,
      profileUpdates,
    };
  }

  if (type === "confirm_slot") {
    const slotSource =
      payload?.slot ??
      action.slot ??
      action.Slot ??
      rootPayload?.slot ??
      null;
    const normalizedSlot = normalizeSlot(slotSource);

    return {
      type: "confirm_slot" as const,
      slot: normalizedSlot,
      reply:
        getStringField(action, ["reply", "Reply"]) ||
        getStringField(payload, ["reply", "Reply"]) ||
        "",
      reason:
        getStringField(action, ["reason", "Reason"]) ||
        getStringField(payload, ["reason", "Reason"]) ||
        getStringField(action, ["motive", "Motive"]) ||
        getStringField(payload, ["motive", "Motive"]) ||
        null,
      profileUpdates,
    };
  }

  if (type === "ask_clarification") {
    return {
      type: "ask_clarification" as const,
      reply:
        getStringField(action, ["reply", "Reply"]) ||
        getStringField(payload, ["reply", "Reply"]) ||
        "",
      profileUpdates,
    };
  }

  return {
    type: "general" as const,
    reply:
      getStringField(action, ["reply", "Reply"]) ||
      getStringField(payload, ["reply", "Reply"]) ||
      "",
    profileUpdates,
  };
}

function extractProfileUpdates(action: any, rootPayload?: any) {
  const source =
    action?.profileUpdates ??
    action?.ProfileUpdates ??
    action?.profile ??
    action?.Profile ??
    action?.data ??
    rootPayload?.profileUpdates ??
    rootPayload?.ProfileUpdates ??
    null;
  return normalizeProfileUpdates(source);
}

function normalizeProfileUpdates(source: any): AgentProfileUpdates | null {
  if (!source) {
    return null;
  }

  const updates: AgentProfileUpdates = {};
  const setUpdate = (field: string, value?: string | null) => {
    if (!value) return;
    const normalizedField = field.replace(/[^a-z]/gi, "").toLowerCase();
    if (normalizedField === "name" || normalizedField === "fullname") {
      updates.name = value;
      return;
    }
    if (normalizedField === "insurance" || normalizedField === "provider") {
      updates.insurance = value;
      return;
    }
    if (
      normalizedField === "consultreason" ||
      normalizedField === "reason" ||
      normalizedField === "motive" ||
      normalizedField === "motivo"
    ) {
      updates.consultReason = value;
    }
  };

  if (Array.isArray(source)) {
    source.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const field = getStringField(entry, ["field", "Field", "key", "Key", "type", "Type"]);
      const value = getStringField(entry, ["value", "Value", "text", "Text"]);
      if (!field || !value) return;
      setUpdate(field, value);
    });
    return Object.keys(updates).length ? updates : null;
  }

  if (typeof source !== "object") {
    return null;
  }

  const payload =
    typeof source.fields === "object" ? source.fields : source.data ?? source;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  setUpdate("name", getStringField(payload, ["name", "Name", "fullName", "FullName"]));
  setUpdate(
    "insurance",
    getStringField(payload, [
      "insurance",
      "Insurance",
      "obraSocial",
      "obra_social",
      "provider",
    ])
  );
  setUpdate(
    "consultReason",
    getStringField(payload, [
      "consultReason",
      "ConsultReason",
      "reason",
      "motive",
      "motivo",
    ])
  );

  return Object.keys(updates).length ? updates : null;
}

function normalizeSlots(
  source: any
): Array<{ startISO: string; humanLabel: string }> {
  if (!source) return [];
  const arraySource = Array.isArray(source) ? source : [source];
  return arraySource
    .map((slot) => normalizeSlot(slot))
    .filter(Boolean) as Array<{ startISO: string; humanLabel: string }>;
}

function normalizeSlot(
  slot: any
): { startISO: string; humanLabel: string } | null {
  if (!slot || typeof slot !== "object") {
    return null;
  }

  const startISO =
    getStringField(slot, [
      "startISO",
      "startIso",
      "start_iso",
      "startTime",
      "start_time",
      "start",
      "iso",
      "dateTime",
      "datetime",
    ]) || null;

  const humanLabel =
    getStringField(slot, [
      "humanLabel",
      "human_label",
      "label",
      "display",
      "text",
    ]) || null;

  if (!startISO || !humanLabel) {
    return null;
  }

  return {
    startISO,
    humanLabel,
  };
}


function enforceActionConsistency(
  action: AgentToolAction,
  ctx: AgentContextBase
): AgentToolAction {
  if (!action) {
    return {
      type: "general",
      reply: "",
      profileUpdates: null,
    };
  }

  if (action.type === "offer_slots") {
    const sanitizedSlots = (action.slots ?? [])
      .map((slot) => matchSlotAgainstCalendar(slot, ctx))
      .filter(
        (
          slot
        ): slot is {
          startISO: string;
          humanLabel: string;
        } => Boolean(slot)
      );

    if (sanitizedSlots.length) {
      return { ...action, slots: sanitizedSlots.slice(0, 3) };
    }

    if (ctx.availableSlots.length) {
      return {
        ...action,
        slots: ctx.availableSlots.slice(0, 3),
      };
    }

    return {
      type: "ask_clarification",
      reply:
        action.reply ||
        "No veo horarios válidos en agenda para lo que pediste. Contame qué día te sirve y vuelvo a revisar.",
      profileUpdates: action.profileUpdates ?? null,
    };
  }

  if (action.type === "confirm_slot") {
    const sanitizedSlot =
      matchSlotAgainstCalendar(action.slot, ctx, { allowPending: true }) ||
      null;

    if (sanitizedSlot) {
      return { ...action, slot: sanitizedSlot };
    }

    return {
      type: "ask_clarification",
      reply:
        action.reply ||
        "Necesito saber qué turno querés confirmar. Decime día y horario exactos y lo reviso en agenda.",
      profileUpdates: action.profileUpdates ?? null,
    };
  }

  return action;
}

function matchSlotAgainstCalendar(
  slot: { startISO?: string | null; humanLabel?: string | null } | null,
  ctx: AgentContextBase,
  options?: { allowPending?: boolean }
): { startISO: string; humanLabel: string } | null {
  if (!slot) return null;
  const iso = slot.startISO?.trim();
  const labelLower = normalizeLower(slot.humanLabel);

  if (iso) {
    const exact = ctx.availableSlots.find((s) => s.startISO === iso);
    if (exact) {
      return { startISO: exact.startISO, humanLabel: exact.humanLabel };
    }
  }

  if (labelLower) {
    const match = ctx.availableSlots.find(
      (s) => s.humanLabel.toLowerCase() === labelLower
    );
    if (match) {
      return { startISO: match.startISO, humanLabel: match.humanLabel };
    }
  }

  if (options?.allowPending && ctx.patientProfile.pendingSlotISO) {
    const pendingISO = ctx.patientProfile.pendingSlotISO;
    const pendingLabel = normalizeLower(
      ctx.patientProfile.pendingSlotHumanLabel
    );
    if (iso && iso === pendingISO) {
      return {
        startISO: pendingISO,
        humanLabel:
          ctx.patientProfile.pendingSlotHumanLabel ||
          slot.humanLabel ||
          "turno pendiente",
      };
    }
    if (labelLower && pendingLabel && labelLower === pendingLabel) {
      return {
        startISO: pendingISO,
        humanLabel:
          ctx.patientProfile.pendingSlotHumanLabel || slot.humanLabel || "",
      };
    }
  }

  return null;
}

type MissingField =
  | "dni"
  | "name"
  | "birthDate"
  | "address"
  | "insurance"
  | "consultReason";

function enforcePatientDataPolicy(
  action: AgentToolAction,
  ctx: AgentContextBase
): AgentToolAction {
  const missingField = determineNextMissingField(action, ctx);
  if (!missingField) {
    return action;
  }

  const reminder = buildMissingFieldPrompt(missingField);
  const alreadyMentioned = replyMentionsField(action.reply, missingField);
  const replyText = alreadyMentioned
    ? action.reply?.trim() || reminder
    : [action.reply?.trim(), reminder].filter(Boolean).join(" ");

  return {
    type: "general",
    reply: replyText || reminder,
    profileUpdates: action.profileUpdates ?? null,
  };
}

function determineNextMissingField(
  action: AgentToolAction,
  ctx: AgentContextBase
): MissingField | null {
  const updates = action.profileUpdates ?? null;
  if (ctx.patientProfile.needsDni && !updates?.dni) {
    return "dni";
  }
  if (ctx.patientProfile.needsName && !updates?.name) {
    return "name";
  }
  if (ctx.patientProfile.needsBirthDate && !updates?.birthDate) {
    return "birthDate";
  }
  if (ctx.patientProfile.needsAddress && !updates?.address) {
    return "address";
  }
  if (ctx.patientProfile.needsInsurance && !updates?.insurance) {
    return "insurance";
  }
  if (ctx.patientProfile.needsConsultReason && !updates?.consultReason) {
    return "consultReason";
  }
  return null;
}

const MISSING_FIELD_KEYWORDS: Record<MissingField, string[]> = {
  dni: ["dni", "documento", "identidad"],
  name: ["nombre", "cómo te llamás", "como te llamas"],
  birthDate: ["nacimiento", "fecha de nacimiento"],
  address: ["dirección", "direccion", "domicilio", "calle"],
  insurance: ["obra", "prepaga", "cobertura", "seguro"],
  consultReason: ["motivo", "consulta", "razón", "razon"],
};

function buildMissingFieldPrompt(field: MissingField) {
  if (field === "dni") {
    return "Antes de avanzar necesito tu DNI (solo números).";
  }
  if (field === "name") {
    return "Antes de avanzar necesito tu nombre completo para registrar la ficha.";
  }
  if (field === "birthDate") {
    return "¿Cuál es tu fecha de nacimiento? Podés escribirla como 31/12/1990.";
  }
  if (field === "address") {
    return "Necesito tu dirección (calle y número) para completar la ficha.";
  }
  if (field === "insurance") {
    return "¿Tenés obra social o prepaga? Pasame el nombre exacto, por favor.";
  }
  return "Contame el motivo principal de la consulta así el doctor se prepara.";
}

function replyMentionsField(
  reply: string | null | undefined,
  field: MissingField
) {
  if (!reply) return false;
  const lower = reply.toLowerCase();
  return MISSING_FIELD_KEYWORDS[field].some((keyword) =>
    lower.includes(keyword)
  );
}

function normalizeLower(value?: string | null) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function getStringField(source: any, keys: string[]): string | null {
  if (!source) return null;

  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  const lowerKeys = keys.map((key) => key.toLowerCase());
  for (const prop of Object.keys(source)) {
    if (!lowerKeys.includes(prop.toLowerCase())) {
      continue;
    }
    const value = source[prop];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function logAgentResponse(raw: string | null, message: string, error?: unknown) {
  if (!IS_DEV_ENV) return;
  const preview =
    typeof raw === "string" ? raw.slice(0, 1000) : "[sin texto]";
  console.warn("[HealthAgent]", message, { preview });
  if (error) {
    console.warn("[HealthAgent] Detalle del error:", error);
  }
}

function buildGeneralFallback(raw: string): AgentExecutionResult | null {
  const reply = raw.trim();
  if (!reply) {
    return null;
  }
  return {
    replyToPatient: reply,
    action: {
      type: "general",
      reply,
    },
  };
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value).slice(0, 2000);
  } catch {
    return "[unserializable]";
  }
}

function buildAgentUserPrompt(ctx: AgentContextBase) {
  const patientName = ctx.patientName || "Paciente sin nombre";
  const availableSlotsText =
    ctx.availableSlots.length > 0
      ? ctx.availableSlots
          .slice(0, 30)
          .map(
            (slot, index) =>
              `${index + 1}. ${slot.humanLabel} (${slot.startISO})`
          )
          .join("\n")
      : "Sin turnos disponibles cargados.";

  const recentConversation =
    ctx.recentMessages.length > 0
      ? ctx.recentMessages
          .slice(-8)
          .map((msg) => {
            const speaker = msg.from === "doctor" ? "Asistente" : "Paciente";
            return `${speaker}: ${msg.text}`;
          })
          .join("\n")
      : "Sin historial reciente.";

  const pendingSlot = ctx.patientProfile.pendingSlotHumanLabel
    ? `Pendiente: ${ctx.patientProfile.pendingSlotHumanLabel} (${ctx.patientProfile.pendingSlotISO})`
    : "Sin turno pendiente.";

  const formatCurrency = (value?: number | null) => {
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const consultationPrice = formatCurrency(
    ctx.doctorProfile.consultationPrice
  );
  const emergencyPrice = formatCurrency(
    ctx.doctorProfile.emergencyConsultationPrice
  );

  const doctorProfileParts = [
    ctx.doctorProfile.specialty
      ? `Especialidad: ${ctx.doctorProfile.specialty}`
      : null,
    ctx.doctorProfile.clinicName
      ? `Consultorio: ${ctx.doctorProfile.clinicName}`
      : null,
    ctx.doctorProfile.officeAddress
      ? `Dirección: ${ctx.doctorProfile.officeAddress}`
      : null,
    ctx.doctorProfile.slotMinutes
      ? `Duración promedio: ${ctx.doctorProfile.slotMinutes} minutos`
      : null,
    consultationPrice
      ? `Valor consulta: ${consultationPrice}`
      : null,
    emergencyPrice
      ? `Emergencias: ${emergencyPrice}`
      : null,
    ctx.doctorProfile.contactPhone
      ? `Teléfono: ${ctx.doctorProfile.contactPhone}`
      : null,
    ctx.doctorProfile.additionalNotes
      ? `Notas del doctor: ${ctx.doctorProfile.additionalNotes}`
      : null,
  ].filter(Boolean);

  const officeHours = ctx.doctorProfile.officeHours || "Sin horario declarado";
  const preferenceSummary = summarizePatientPreference(ctx.text);
  const preferredSlotsForPrompt = buildPreferredSlotsList(ctx);
  const conversationStatus =
    ctx.recentMessages.length > 0
      ? "La conversación YA está en curso. Evitá saludos iniciales."
      : "Este es el primer mensaje, podés saludar una sola vez.";
  const missingData: string[] = [];
  if (ctx.patientProfile.needsDni) missingData.push("DNI");
  if (ctx.patientProfile.needsName) missingData.push("Nombre");
  if (ctx.patientProfile.needsBirthDate)
    missingData.push("Fecha de nacimiento");
  if (ctx.patientProfile.needsAddress) missingData.push("Dirección");
  if (ctx.patientProfile.needsInsurance) missingData.push("Obra social/prepaga");
  if (ctx.patientProfile.needsConsultReason) missingData.push("Motivo de la consulta");
  const availableSlotsJson = ctx.availableSlots
    .slice(0, 50)
    .map((slot) => ({
      startISO: slot.startISO,
      humanLabel: slot.humanLabel,
    }));

const focusDaySummary = buildFocusDaySummary(ctx);
const preferredSummary = buildPreferredSummary(ctx);
const preferredAvailabilityText =
  ctx.patientProfile.preferredDayHasAvailability === true
    ? "Hay disponibilidad para ese día."
    : ctx.patientProfile.preferredDayHasAvailability === false
    ? "NO hay turnos para el día solicitado; explicalo y ofrecé la alternativa más cercana."
    : "Sin preferencia guardada.";

return `
Paciente: ${patientName} (${ctx.patientPhone})
Doctor/a: ${ctx.doctorName}
Perfil del consultorio: ${doctorProfileParts.join(" | ") || "Sin datos extra"}
Motivo registrado: ${ctx.patientProfile.consultReason || "Sin motivo"}
${pendingSlot}
Horario habitual declarado: ${officeHours}
Duración típica del turno: ${
  ctx.doctorProfile.slotMinutes
    ? `${ctx.doctorProfile.slotMinutes} minutos`
    : "no informada"
}
Preferencias detectadas en este mensaje: ${preferenceSummary}
Foco del día/turno actual: ${focusDaySummary}
Disponibilidad para el día pedido: ${preferredAvailabilityText}
Preferencia guardada: ${preferredSummary}
${conversationStatus}
Datos pendientes para poder agendar: ${
    missingData.length ? missingData.join(", ") : "ninguno"
  }

Horarios disponibles:
${availableSlotsText}
Slots detallados (JSON):
${JSON.stringify(availableSlotsJson, null, 2)}

Slots sugeridos según preferencia:
${preferredSlotsForPrompt}

Historial reciente:
${recentConversation}

Mensaje actual del paciente (con errores tal cual llegó):
"${ctx.text}"
`.trim();
}

function summarizePatientPreference(text: string) {
  if (!text) return "Sin preferencia clara";
  const lower = text.toLowerCase();
  const parts: string[] = [];

  if (/(hoy|esta tarde|esta mañana)/.test(lower)) {
    parts.push("Quiere turno hoy");
  }
  if (/\bmañana\b/.test(lower)) {
    parts.push("Quiere turno mañana");
  }
  if (/pasado mañana/.test(lower)) {
    parts.push("Quiere turno pasado mañana");
  }

  const dayNames: Record<string, string> = {
    lunes: "lunes",
    martes: "martes",
    miercoles: "miércoles",
    miércoles: "miércoles",
    jueves: "jueves",
    viernes: "viernes",
    sabado: "sábado",
    sábado: "sábado",
    domingo: "domingo",
  };
  for (const [key, label] of Object.entries(dayNames)) {
    if (lower.includes(key)) {
      parts.push(`Prefiere ${label}`);
      break;
    }
  }

  const timeMatch =
    /(\d{1,2})(?:[:h\.](\d{1,2}))?\s*(am|pm|hs|h|horas|hrs|a\.m\.|p\.m\.)?/i.exec(
      lower
    );
  if (timeMatch) {
    const hour = timeMatch[1];
    const minutes = timeMatch[2] ? `:${timeMatch[2].padEnd(2, "0")}` : "";
    const suffix = timeMatch[3] ? ` ${timeMatch[3]}` : "";
    parts.push(`Hora solicitada aprox: ${hour}${minutes}${suffix}`.trim());
  } else if (/tarde/.test(lower)) {
    parts.push("Prefiere turno por la tarde");
  } else if (/mañana/.test(lower) && !parts.includes("Quiere turno mañana")) {
    parts.push("Prefiere turno por la mañana");
  }

  if (!parts.length) {
    return "Sin preferencia clara";
  }

  return parts.join(" | ");
}

function buildPreferredSlotsList(ctx: AgentContextBase) {
  const preference = parsePreferenceFromText(ctx.text);
  if (!preference) {
    return "No se detectó una preferencia concreta.";
  }

  const now = getNowInTimezone(ctx.timezone);
  const scored = ctx.availableSlots
    .map((slot) => {
      const slotDate = new Date(slot.startISO);
      if (isNaN(slotDate.getTime())) return null;
      const score = scoreSlotAgainstPreference(
        slotDate,
        preference,
        now,
        ctx.timezone
      );
      return { slot, score };
    })
    .filter((entry): entry is { slot: AgentContextBase["availableSlots"][0]; score: number } => !!entry)
    .sort((a, b) => a.score - b.score);

  if (!scored.length) {
    return "La lista de turnos no tiene coincidencias claras con la preferencia.";
  }

  return scored
    .slice(0, 5)
    .map(
      (entry, index) =>
        `${index + 1}. ${entry.slot.humanLabel} (${entry.slot.startISO}) [match score: ${entry.score}]`
    )
    .join("\n");
}

type ParsedPreference = {
  dayOffset?: number;
  weekday?: number;
  hour?: number;
  period?: "morning" | "afternoon" | "evening";
};

function parsePreferenceFromText(text: string): ParsedPreference | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const preference: ParsedPreference = {};

  if (/\bpasado\s+mañana\b/.test(lower)) {
    preference.dayOffset = 2;
  } else if (/\bmañana\b/.test(lower)) {
    preference.dayOffset = 1;
  } else if (/\bhoy\b/.test(lower)) {
    preference.dayOffset = 0;
  }

  const weekdayMap: Record<string, number> = {
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
  for (const [name, value] of Object.entries(weekdayMap)) {
    if (lower.includes(name)) {
      preference.weekday = value;
      break;
    }
  }

  const timeMatch =
    /(?:a\s+las\s+)?(\d{1,2})(?:[:h\.](\d{1,2}))?\s*(am|pm|hs|h|horas|hrs|a\.m\.|p\.m\.)?/i.exec(
      lower
    );
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    let normalizedHour = hour;
    const suffix = timeMatch[3]?.toLowerCase();
    if (suffix) {
      if (suffix.includes("pm") && hour < 12) {
        normalizedHour = hour + 12;
      } else if (suffix.includes("am") && hour === 12) {
        normalizedHour = 0;
      }
    } else if (hour <= 6 && /tarde|noche|pm/.test(lower)) {
      normalizedHour = hour + 12;
    }

    preference.hour = normalizedHour + minutes / 60;
  } else if (/tarde/.test(lower)) {
    preference.period = "afternoon";
  } else if (/noche/.test(lower)) {
    preference.period = "evening";
  } else if (/(por|de)\s+la\s+mañana/.test(lower)) {
    preference.period = "morning";
  }

  if (
    preference.dayOffset === undefined &&
    preference.weekday === undefined &&
    preference.hour === undefined &&
    preference.period === undefined
  ) {
    return null;
  }

  return preference;
}

function scoreSlotAgainstPreference(
  slotDate: Date,
  preference: ParsedPreference,
  now: Date,
  timezone?: string
) {
  let score = 0;

  if (typeof preference.dayOffset === "number") {
    const diffDays = Math.round(
      (startOfDay(slotDate, timezone).getTime() -
        startOfDay(now, timezone).getTime()) /
        86400000
    );
    score += Math.abs(diffDays - preference.dayOffset) * 1440;
  }

  if (typeof preference.weekday === "number") {
    const diff = Math.min(
      Math.abs(slotDate.getDay() - preference.weekday),
      7 - Math.abs(slotDate.getDay() - preference.weekday)
    );
    score += diff * 720;
  }

  if (typeof preference.hour === "number") {
    const slotHour = getHourInTimezone(slotDate, timezone);
    score += Math.abs(slotHour - preference.hour) * 60;
  } else if (preference.period) {
    const slotHour = Math.floor(getHourInTimezone(slotDate, timezone));
    if (!isHourInPeriod(slotHour, preference.period)) {
      score += 360;
    }
  }

  return score;
}

function startOfDay(date: Date, timezone?: string) {
  if (!timezone) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const isoString = `${lookup.year}-${lookup.month}-${lookup.day}T00:00:00Z`;
    return new Date(isoString);
  } catch {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );
  }
}

function isHourInPeriod(hour: number, period: ParsedPreference["period"]) {
  if (!period) return true;
  if (period === "morning") return hour >= 6 && hour < 12;
  if (period === "afternoon") return hour >= 12 && hour < 18;
  if (period === "evening") return hour >= 18 && hour < 23;
  return true;
}

function getNowInTimezone(timezone?: string) {
  if (!timezone) return new Date();
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const isoString = `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}Z`;
    return new Date(isoString);
  } catch {
    return new Date();
  }
}

function getHourInTimezone(date: Date, timezone?: string) {
  if (!timezone) {
    return date.getHours() + date.getMinutes() / 60;
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return Number(lookup.hour) + Number(lookup.minute) / 60;
  } catch {
    return date.getHours() + date.getMinutes() / 60;
  }
}

function buildPreferredSummary(ctx: AgentContextBase) {
  const parts: string[] = [];
  if (ctx.patientProfile.preferredDayLabel) {
    parts.push(ctx.patientProfile.preferredDayLabel);
  }
  if (typeof ctx.patientProfile.preferredHourMinutes === "number") {
    const hourLabel = formatMinutesForPrompt(
      ctx.patientProfile.preferredHourMinutes
    );
    if (hourLabel) {
      parts.push(`alrededor de ${hourLabel}`);
    }
  }
  if (parts.length) {
    return parts.join(" ");
  }
  return "Sin preferencia guardada";
}

function formatMinutesForPrompt(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function buildFocusDaySummary(ctx: AgentContextBase) {
  if (ctx.patientProfile.preferredDayLabel) {
    const hourLabel =
      typeof ctx.patientProfile.preferredHourMinutes === "number"
        ? formatMinutesForPrompt(ctx.patientProfile.preferredHourMinutes)
        : null;
    return hourLabel
      ? `El paciente pidió ${ctx.patientProfile.preferredDayLabel} a las ${hourLabel}`
      : `El paciente pidió ${ctx.patientProfile.preferredDayLabel}`;
  }

  const preferenceTexts = [
    ctx.text,
    ...ctx.recentMessages
      .filter((msg) => msg.from === "patient")
      .map((msg) => msg.text)
      .reverse(),
  ];

  for (const text of preferenceTexts) {
    const pref = parsePreferenceFromText(text);
    if (!pref) continue;
    const parts: string[] = [];
    if (typeof pref.dayOffset === "number") {
      if (pref.dayOffset === 0) parts.push("hoy");
      else if (pref.dayOffset === 1) parts.push("mañana");
      else parts.push(`en ${pref.dayOffset} días`);
    }
    if (typeof pref.weekday === "number") {
      const weekdayLabel = weekdayFromIndex(pref.weekday);
      if (weekdayLabel) parts.push(weekdayLabel);
    }
    if (parts.length) {
      return `El paciente viene hablando de ${parts.join(" / ")}`;
    }
  }

  if (ctx.patientProfile.pendingSlotHumanLabel) {
    return `Último turno ofrecido: ${ctx.patientProfile.pendingSlotHumanLabel}`;
  }

  return "Sin foco claro (considerá lo último que escribió el paciente).";
}

function weekdayFromIndex(index: number) {
  const labels = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];
  return labels[index] ?? null;
}
