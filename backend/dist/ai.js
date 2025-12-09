"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkOpenAIConnectivity = checkOpenAIConnectivity;
exports.runWhatsappAgent = runWhatsappAgent;
// backend/src/ai.ts
const openai_1 = __importDefault(require("openai"));
const healthAgent_1 = require("./agents/healthAgent");
const text_1 = require("./utils/text");
const openaiClient = process.env.OPENAI_API_KEY
    ? new openai_1.default({ apiKey: process.env.OPENAI_API_KEY })
    : null;
async function checkOpenAIConnectivity() {
    var _a, _b, _c;
    if (!openaiClient) {
        return {
            ok: false,
            message: "OPENAI_API_KEY no está configurada.",
        };
    }
    const start = Date.now();
    try {
        await openaiClient.models.list();
        return {
            ok: true,
            message: "Conexión establecida correctamente.",
            latencyMs: Date.now() - start,
        };
    }
    catch (error) {
        const detail = ((_c = (_b = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) ||
            (error === null || error === void 0 ? void 0 : error.message) ||
            "No pudimos contactar a OpenAI.";
        return {
            ok: false,
            message: detail,
            latencyMs: Date.now() - start,
        };
    }
}
/**
 * Agente principal: intenta usar OpenAI, si falla cae a heurística simple.
 */
async function runWhatsappAgent(ctx) {
    var _a;
    const text = (_a = ctx.text) === null || _a === void 0 ? void 0 : _a.trim();
    if (!text) {
        return {
            replyToPatient: "Te leo, ¿podés escribirme en texto para ayudarte mejor?",
            action: { type: "NONE" },
        };
    }
    const lower = text.toLowerCase();
    const intentFlags = analyzePatientIntent(text);
    if (ctx.patientProfile.pendingSlotISO &&
        intentFlags.confirmed &&
        !intentFlags.rejected) {
        const confirmationLabel = ctx.patientProfile.pendingSlotHumanLabel ||
            formatSlotLabelFromISO(ctx.patientProfile.pendingSlotISO, ctx.timezone);
        return {
            replyToPatient: `Perfecto, confirmo el turno ${confirmationLabel}.`,
            action: {
                type: "CREATE_APPOINTMENT",
                dateTimeISO: ctx.patientProfile.pendingSlotISO,
                reason: normalizeReasonInput(ctx.patientProfile.pendingSlotReason) ||
                    normalizeReasonInput(text) ||
                    text.slice(0, 200),
            },
        };
    }
    // 1) Casos súper simples: saludos / agradecimientos → sin acción
    const greetingRegex = /(hola|buenos dias|buen día|buenas tardes|buenas noches)/;
    const generalKeywords = [
        "donde",
        "dónde",
        "atiende",
        "direccion",
        "dirección",
        "ubicacion",
        "ubicación",
        "cuesta",
        "cobra",
        "precio",
        "cuanto",
        "cuánto",
        "valor",
        "horario",
        "obra",
        "prepaga",
        "consultorio",
    ];
    const isGeneralQuestion = /[?¿]/.test(lower) ||
        generalKeywords.some((kw) => lower.includes(kw));
    if (greetingRegex.test(lower) &&
        !/(turno|consulta|cita)/.test(lower) &&
        !isGeneralQuestion) {
        const namePart = ctx.patientName
            ? ` ${ctx.patientName.split(" ")[0]}`
            : "";
        return {
            replyToPatient: `Hola${namePart} 👋, soy el asistente de ${ctx.doctorName}. ¿En qué puedo ayudarte?`,
            action: { type: "NONE" },
        };
    }
    if (/(gracias|listo|ok|perfecto|bárbaro|genial)/.test(lower)) {
        return {
            replyToPatient: "De nada 🙌. Si necesitás reprogramar o pedir otro turno, escribime por acá.",
            action: { type: "NONE" },
        };
    }
    const llmResult = await runDomainAgent(ctx);
    if (llmResult) {
        return llmResult;
    }
    // 3) Fallback heurístico (por si el modelo falla o no hay key)
    return simpleHeuristicAgent(ctx);
}
async function runDomainAgent(ctx) {
    var _a, _b, _c, _d, _e, _f;
    if (!openaiClient)
        return null;
    let execution = null;
    if (ctx.businessType === "HEALTH") {
        execution = await (0, healthAgent_1.runHealthAgent)(ctx, openaiClient);
    }
    if (!execution)
        return null;
    const action = execution.action;
    const profileUpdates = (_b = (_a = execution.profileUpdates) !== null && _a !== void 0 ? _a : execution.action.profileUpdates) !== null && _b !== void 0 ? _b : null;
    if (action.type === "offer_slots") {
        return {
            replyToPatient: execution.replyToPatient,
            action: {
                type: "LIST_SLOTS",
                reply: execution.replyToPatient,
                slots: action.slots,
                reason: (_c = action.reason) !== null && _c !== void 0 ? _c : null,
                profileUpdates,
            },
            pendingSlotHint: ((_d = action.slots) === null || _d === void 0 ? void 0 : _d[0])
                ? {
                    startISO: action.slots[0].startISO,
                    humanLabel: action.slots[0].humanLabel,
                    reason: (_e = action.reason) !== null && _e !== void 0 ? _e : null,
                }
                : undefined,
            profileUpdates,
        };
    }
    if (action.type === "confirm_slot") {
        const matchedSlot = findSlotMatchingMessage(ctx, ctx.text);
        let slotToConfirm = matchedSlot || action.slot || null;
        if (!slotToConfirm && ctx.patientProfile.pendingSlotISO) {
            slotToConfirm = {
                startISO: ctx.patientProfile.pendingSlotISO,
                humanLabel: (_f = ctx.patientProfile.pendingSlotHumanLabel) !== null && _f !== void 0 ? _f : "el turno pendiente",
            };
        }
        const slotISO = (slotToConfirm === null || slotToConfirm === void 0 ? void 0 : slotToConfirm.startISO) || ctx.patientProfile.pendingSlotISO || null;
        const intent = analyzePatientIntent(ctx.text);
        if (intent.rejected && !intent.confirmed) {
            return {
                replyToPatient: "Entendido, no confirmo ese turno. Decime qué día y horario querés para ofrecerte opciones correctas.",
                action: { type: "NONE", profileUpdates },
                profileUpdates,
            };
        }
        if (!slotISO) {
            return {
                replyToPatient: action.reply ||
                    "Necesito saber qué turno querés confirmar. Decime el horario o elegí uno de los que te propuse.",
                action: { type: "NONE", profileUpdates },
                profileUpdates,
            };
        }
        return {
            replyToPatient: action.reply ||
                `Perfecto, confirmo el turno ${(slotToConfirm === null || slotToConfirm === void 0 ? void 0 : slotToConfirm.humanLabel) || ctx.patientProfile.pendingSlotHumanLabel || ""}.`,
            action: {
                type: "CREATE_APPOINTMENT",
                dateTimeISO: slotISO,
                reason: normalizeReasonInput(action.reason) ||
                    normalizeReasonInput(ctx.patientProfile.pendingSlotReason) ||
                    normalizeReasonInput(ctx.text) ||
                    ctx.text.slice(0, 200),
                profileUpdates,
            },
            profileUpdates,
        };
    }
    if (action.type === "ask_clarification") {
        return {
            replyToPatient: execution.replyToPatient ||
                "¿Me repetís la info para ayudarte mejor?",
            action: {
                type: "ASK_CLARIFICATION",
                reply: execution.replyToPatient,
                profileUpdates,
            },
            profileUpdates,
        };
    }
    if (action.type === "general") {
        return {
            replyToPatient: execution.replyToPatient,
            action: { type: "NONE", profileUpdates },
            profileUpdates,
        };
    }
    return null;
}
/**
 * Fallback heurístico:
 * - Detecta si el mensaje habla de turno.
 * - Elige un slot disponible aproximado.
 * - Devuelve acción CREATE_APPOINTMENT.
 */
function simpleHeuristicAgent(ctx) {
    const text = ctx.text;
    const lower = text.toLowerCase();
    const profile = ctx.doctorProfile;
    const mentionsAppointment = lower.includes("turno") ||
        lower.includes("consulta") ||
        lower.includes("cita");
    const asksPrice = lower.includes("precio") ||
        lower.includes("cuánto sale") ||
        lower.includes("cuanto sale") ||
        lower.includes("valor") ||
        lower.includes("cobrás") ||
        lower.includes("cobras") ||
        lower.includes("cuánto cuesta") ||
        lower.includes("cuanto cuesta");
    const asksSchedule = lower.includes("horario") ||
        lower.includes("horarios") ||
        lower.includes("atienden") ||
        lower.includes("atiende") ||
        lower.includes("abren") ||
        lower.includes("cierran") ||
        lower.includes("días") ||
        lower.includes("dias");
    const asksAddress = lower.includes("direccion") ||
        lower.includes("dirección") ||
        lower.includes("ubicacion") ||
        lower.includes("ubicación") ||
        lower.includes("donde queda") ||
        lower.includes("dónde queda") ||
        lower.includes("donde atiende") ||
        lower.includes("dónde atiende") ||
        lower.includes("como llegar") ||
        lower.includes("cómo llegar") ||
        (lower.includes("donde") && lower.includes("consultorio"));
    const asksContact = lower.includes("telefono") ||
        lower.includes("teléfono") ||
        lower.includes("celu") ||
        lower.includes("whatsapp") ||
        lower.includes("número") ||
        lower.includes("numero");
    const asksSpecialty = lower.includes("especialidad") ||
        lower.includes("especialista") ||
        lower.includes("qué doctor") ||
        lower.includes("que doctor");
    const asksNotes = lower.includes("indicacion") ||
        lower.includes("indicación") ||
        lower.includes("preparacion") ||
        lower.includes("preparación") ||
        lower.includes("nota") ||
        lower.includes("recomendacion") ||
        lower.includes("recomendación");
    const acceptanceRegex = /(me sirve|lo tomo|lo tomamos|confirmo|perfecto ese|queda ese|agendalo|agéndalo|dale ese|está bien ese|ese me va|de una)/;
    const acceptance = acceptanceRegex.test(lower);
    const lastDoctorMessage = [...ctx.recentMessages]
        .reverse()
        .find((m) => m.from === "doctor");
    const doctorRecentlyOfferedSlot = lastDoctorMessage
        ? /turno|horario disponible|reservado/.test(lastDoctorMessage.text.toLowerCase())
        : false;
    if (asksPrice) {
        const normal = profile.consultationPrice;
        const emergency = profile.emergencyConsultationPrice;
        if (normal && emergency) {
            return {
                replyToPatient: `La consulta tiene un valor de $ ${normal.toLocaleString("es-AR")} ` +
                    `y la consulta de urgencia $ ${emergency.toLocaleString("es-AR")}. ` +
                    `Si querés, te ofrezco horarios disponibles para agendar. 😊`,
                action: { type: "NONE" },
            };
        }
        if (normal) {
            return {
                replyToPatient: `La consulta tiene un valor de $ ${normal.toLocaleString("es-AR")}. ` +
                    `Si necesitás, te puedo ofrecer horarios disponibles para agendar. 😊`,
                action: { type: "NONE" },
            };
        }
        return {
            replyToPatient: "Todavía no tengo cargado el valor de la consulta. Escribí \"menu\" para ver las opciones y coordinar tu turno.",
            action: { type: "NONE" },
        };
    }
    if (asksSchedule) {
        if (profile.officeDays || profile.officeHours) {
            const parts = [];
            if (profile.officeDays)
                parts.push(`atiende ${profile.officeDays}`);
            if (profile.officeHours)
                parts.push(`en el horario ${profile.officeHours}`);
            const where = profile.clinicName || profile.officeAddress
                ? ` en ${[profile.clinicName, profile.officeAddress]
                    .filter(Boolean)
                    .join(" - ")}`
                : "";
            return {
                replyToPatient: `La doctora ${ctx.doctorName} ${parts.join(" ")}${where}. ¿Querés que te proponga un turno?`,
                action: { type: "NONE" },
            };
        }
        return {
            replyToPatient: "No tengo cargados los días y horarios exactos del consultorio. Escribí \"menu\" para ver las opciones y coordinar tu turno.",
            action: { type: "NONE" },
        };
    }
    if (asksAddress) {
        if (profile.officeAddress || profile.clinicName) {
            const location = [profile.clinicName, profile.officeAddress]
                .filter(Boolean)
                .join(" - ");
            const extra = profile.contactPhone
                ? ` Ante cualquier duda podés escribir al ${profile.contactPhone}.`
                : "";
            return {
                replyToPatient: `El consultorio queda en ${location}.${extra}`,
                action: { type: "NONE" },
            };
        }
        return {
            replyToPatient: "No tengo cargada la dirección exacta. Escribí \"menu\" para ver las opciones y coordinar un turno.",
            action: { type: "NONE" },
        };
    }
    if (asksContact) {
        if (profile.contactPhone) {
            return {
                replyToPatient: `Podés comunicarte al ${profile.contactPhone} o seguir por acá y te ayudo a coordinar tu turno.`,
                action: { type: "NONE" },
            };
        }
        return {
            replyToPatient: "No tengo un teléfono cargado, pero podés escribirme \"menu\" para ver cómo sacar, reprogramar o cancelar un turno.",
            action: { type: "NONE" },
        };
    }
    if (asksSpecialty) {
        if (profile.specialty) {
            return {
                replyToPatient: `La doctora ${ctx.doctorName} es especialista en ${profile.specialty}. Contame qué necesitás y vemos un turno.`,
                action: { type: "NONE" },
            };
        }
        return {
            replyToPatient: `No tengo más datos sobre la especialidad. Escribí "menu" para ver las opciones y coordinar un turno.`,
            action: { type: "NONE" },
        };
    }
    if (asksNotes && profile.additionalNotes) {
        return {
            replyToPatient: `${profile.additionalNotes} ¿Querés que avancemos con un turno?`,
            action: { type: "NONE" },
        };
    }
    if (mentionsAppointment && ctx.patientProfile.needsDni) {
        return {
            replyToPatient: "Antes de coordinar necesito tu DNI (solo números).",
            action: { type: "NONE" },
        };
    }
    if (mentionsAppointment && ctx.patientProfile.needsName) {
        return {
            replyToPatient: "Genial, pero antes necesito tu nombre y apellido completos.",
            action: { type: "NONE" },
        };
    }
    if (mentionsAppointment && ctx.patientProfile.needsBirthDate) {
        return {
            replyToPatient: "¿Me pasás tu fecha de nacimiento? Podés escribirla como 31/12/1990.",
            action: { type: "NONE" },
        };
    }
    if (mentionsAppointment && ctx.patientProfile.needsAddress) {
        return {
            replyToPatient: "Necesito tu dirección (calle y número) para terminar de registrar la ficha.",
            action: { type: "NONE" },
        };
    }
    if (mentionsAppointment && ctx.patientProfile.needsInsurance && ctx.businessType === "HEALTH") {
        return {
            replyToPatient: "¿Tenés obra social o prepaga? Decime el nombre exacto así lo anoto.",
            action: { type: "NONE" },
        };
    }
    if (mentionsAppointment && ctx.patientProfile.needsConsultReason) {
        return {
            replyToPatient: "¿Cuál es el motivo principal de la consulta? (ej: control anual, dolor de cabeza, etc.)",
            action: { type: "NONE" },
        };
    }
    // Buscar hoy / mañana
    let dayOffset = 0;
    if (lower.includes("pasado mañana"))
        dayOffset = 2;
    else if (lower.includes("mañana"))
        dayOffset = 1;
    // Buscar hora aproximada
    let requestedHour = null;
    const hourMatch = lower.match(/(\d{1,2})\s*(?:hs|h|:| horas|hora)?/);
    if (hourMatch) {
        const h = parseInt(hourMatch[1], 10);
        if (h >= 0 && h <= 23) {
            requestedHour = h;
        }
    }
    // Elegimos slot en base a los disponibles
    const pickSlot = () => {
        if (ctx.availableSlots.length === 0) {
            return null;
        }
        let chosen = ctx.availableSlots[0];
        if (requestedHour !== null) {
            const now = new Date();
            const baseDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, requestedHour, 0, 0, 0);
            let bestDiff = Number.POSITIVE_INFINITY;
            for (const slot of ctx.availableSlots) {
                const d = new Date(slot.startISO);
                const diff = Math.abs(d.getTime() - baseDay.getTime());
                if (diff < bestDiff) {
                    bestDiff = diff;
                    chosen = slot;
                }
            }
        }
        return chosen;
    };
    const confirmAppointment = (slot) => {
        const reply = `Perfecto, te reservo el turno ${slot.humanLabel}. Te confirmo por acá cualquier novedad ✅`;
        const normalizedReason = normalizeReasonInput(text) ||
            normalizeReasonInput(ctx.patientProfile.consultReason) ||
            text.slice(0, 200);
        return {
            replyToPatient: reply,
            action: {
                type: "CREATE_APPOINTMENT",
                dateTimeISO: slot.startISO,
                reason: normalizedReason,
            },
        };
    };
    if (acceptance) {
        if (doctorRecentlyOfferedSlot) {
            const slot = pickSlot();
            if (slot) {
                return confirmAppointment(slot);
            }
            return {
                replyToPatient: "Intenté reservar ese turno pero ya no está disponible. Decime otro horario y lo coordinamos.",
                action: { type: "NONE" },
            };
        }
        return {
            replyToPatient: "Genial. Para avanzar contame qué día u horario te viene bien y te propongo un turno disponible.",
            action: { type: "NONE" },
        };
    }
    if (!mentionsAppointment) {
        return {
            replyToPatient: 'No puedo ayudarte con eso ahora mismo. Escribí "menu" para ver las opciones para sacar, reprogramar o cancelar un turno.',
            action: { type: "NONE" },
        };
    }
    const chosenSlot = pickSlot();
    if (!chosenSlot) {
        return {
            replyToPatient: "Por ahora no veo turnos libres en los próximos días. Probá escribirme de nuevo más tarde o llamá a la recepción de la clínica 🙏.",
            action: { type: "NONE" },
        };
    }
    const reply = `Puedo ofrecerte este turno: ${chosenSlot.humanLabel}. Si te sirve, te lo dejo reservado ✅. Si preferís otro día u horario, decime.`;
    const suggestedSlots = [chosenSlot];
    const reason = normalizeReasonInput(text) ||
        normalizeReasonInput(ctx.patientProfile.consultReason) ||
        null;
    return {
        replyToPatient: reply,
        action: {
            type: "LIST_SLOTS",
            reply,
            slots: suggestedSlots,
            reason,
        },
        pendingSlotHint: {
            startISO: chosenSlot.startISO,
            humanLabel: chosenSlot.humanLabel,
            reason,
        },
    };
}
function normalizeReasonInput(value) {
    var _a;
    if (!value)
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    if (/^(si|sí|dale|ok|okay|listo|me sirve|confirmo|perfecto|vale|está bien)/i.test(trimmed)) {
        return null;
    }
    const formatted = (_a = (0, text_1.formatConsultReasonAnswer)(trimmed)) !== null && _a !== void 0 ? _a : trimmed;
    return formatted.slice(0, 180);
}
function analyzePatientIntent(text) {
    if (!text) {
        return { confirmed: false, rejected: false };
    }
    const lower = text.toLowerCase();
    const confirmedRegex = /(me sirve|lo tomo|confirmo|dale|perfecto|agendalo|agéndalo|sí,? ese|si ese|queda ese|ok ese|está bien|esta bien|lo confirmo|reservalo|reserválo|listo ese|genial,? gracias|de una|aseguralo)/;
    const rejectedRegex = /(no quiero|no ese|ese no|prefiero otro|otro horario|wtf|qué decís|que decís|no me sirve|no confirmes|cambiemos|cambiarlo|busca otro|buscá otro|ninguno|no,? gracias)/;
    const confirmed = confirmedRegex.test(lower);
    const rejected = rejectedRegex.test(lower);
    return { confirmed, rejected };
}
function findSlotMatchingMessage(ctx, text) {
    if (!text || ctx.availableSlots.length === 0) {
        return null;
    }
    let preference = parsePreferenceFromText(text) || {};
    const preferredDayDate = ctx.patientProfile.preferredDayISO &&
        !Number.isNaN(Date.parse(ctx.patientProfile.preferredDayISO))
        ? new Date(ctx.patientProfile.preferredDayISO)
        : null;
    const pendingSlotDate = ctx.patientProfile.pendingSlotISO &&
        !Number.isNaN(Date.parse(ctx.patientProfile.pendingSlotISO))
        ? new Date(ctx.patientProfile.pendingSlotISO)
        : null;
    if (preferredDayDate &&
        preference.dayOffset === undefined &&
        preference.weekday === undefined) {
        preference.weekday = preferredDayDate.getDay();
    }
    if (typeof preference.hour !== "number" &&
        typeof ctx.patientProfile.preferredHourMinutes === "number") {
        preference.hour = ctx.patientProfile.preferredHourMinutes / 60;
    }
    if (preference.dayOffset === undefined &&
        preference.weekday === undefined &&
        !preferredDayDate &&
        !pendingSlotDate) {
        return null;
    }
    const anchorDate = preferredDayDate || pendingSlotDate;
    const anchorMatters = !!anchorDate &&
        preference.dayOffset === undefined &&
        preference.weekday === undefined;
    const now = getNowInTimezone(ctx.timezone);
    const scored = ctx.availableSlots
        .map((slot) => {
        const slotDate = new Date(slot.startISO);
        if (isNaN(slotDate.getTime()))
            return null;
        const baseScore = scoreSlotAgainstPreference(slotDate, preference, now, ctx.timezone);
        const anchorPenalty = anchorMatters && anchorDate
            ? Math.abs(startOfDay(slotDate, ctx.timezone).getTime() -
                startOfDay(anchorDate, ctx.timezone).getTime()) / 86400000
            : 0;
        return {
            slot,
            score: baseScore + anchorPenalty * 2880,
            baseScore,
        };
    })
        .filter((entry) => entry !== null)
        .sort((a, b) => a.score - b.score);
    if (!scored.length)
        return null;
    const best = scored[0];
    const hasSpecificTime = typeof preference.hour === "number";
    const threshold = hasSpecificTime ? 180 : 1440; // 3h vs 1 día completo
    if (best.baseScore > threshold) {
        return null;
    }
    return best.slot;
}
function parsePreferenceFromText(text) {
    var _a;
    if (!text)
        return null;
    const lower = text.toLowerCase();
    const preference = {};
    if (/\bpasado\s+mañana\b/.test(lower)) {
        preference.dayOffset = 2;
    }
    else if (/\bmañana\b/.test(lower)) {
        preference.dayOffset = 1;
    }
    else if (/\bhoy\b/.test(lower)) {
        preference.dayOffset = 0;
    }
    const weekdayMap = {
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
    const timeMatch = /(?:a\s+las\s+)?(\d{1,2})(?:[:h\.](\d{1,2}))?\s*(am|pm|hs|h|horas|hrs|a\.m\.|p\.m\.)?/i.exec(lower);
    if (timeMatch) {
        const hour = parseInt(timeMatch[1], 10);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        let normalizedHour = hour;
        const suffix = (_a = timeMatch[3]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        if (suffix) {
            if (suffix.includes("pm") && hour < 12) {
                normalizedHour = hour + 12;
            }
            else if (suffix.includes("am") && hour === 12) {
                normalizedHour = 0;
            }
        }
        else if (hour <= 6 && /tarde|noche|pm/.test(lower)) {
            normalizedHour = hour + 12;
        }
        preference.hour = normalizedHour + minutes / 60;
    }
    else if (/tarde/.test(lower)) {
        preference.period = "afternoon";
    }
    else if (/noche/.test(lower)) {
        preference.period = "evening";
    }
    else if (/(por|de)\s+la\s+mañana/.test(lower)) {
        preference.period = "morning";
    }
    if (preference.dayOffset === undefined &&
        preference.weekday === undefined &&
        preference.hour === undefined &&
        preference.period === undefined) {
        return null;
    }
    return preference;
}
function scoreSlotAgainstPreference(slotDate, preference, now, timezone) {
    let score = 0;
    if (typeof preference.dayOffset === "number") {
        const diffDays = Math.round((startOfDay(slotDate, timezone).getTime() -
            startOfDay(now, timezone).getTime()) /
            86400000);
        score += Math.abs(diffDays - preference.dayOffset) * 1440;
    }
    if (typeof preference.weekday === "number") {
        const diff = Math.min(Math.abs(slotDate.getDay() - preference.weekday), 7 - Math.abs(slotDate.getDay() - preference.weekday));
        score += diff * 720;
    }
    if (typeof preference.hour === "number") {
        const slotHour = getHourInTimezone(slotDate, timezone);
        score += Math.abs(slotHour - preference.hour) * 60;
    }
    else if (preference.period) {
        const slotHour = Math.floor(getHourInTimezone(slotDate, timezone));
        if (!isHourInPeriod(slotHour, preference.period)) {
            score += 360;
        }
    }
    return score;
}
function startOfDay(date, timezone) {
    if (!timezone) {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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
    }
    catch {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    }
}
function isHourInPeriod(hour, period) {
    if (!period)
        return true;
    if (period === "morning")
        return hour >= 6 && hour < 12;
    if (period === "afternoon")
        return hour >= 12 && hour < 18;
    if (period === "evening")
        return hour >= 18 && hour < 23;
    return true;
}
function getNowInTimezone(timezone) {
    if (!timezone)
        return new Date();
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
    }
    catch {
        return new Date();
    }
}
function getHourInTimezone(date, timezone) {
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
    }
    catch {
        return date.getHours() + date.getMinutes() / 60;
    }
}
function formatSlotLabelFromISO(iso, timezone) {
    try {
        const date = new Date(iso);
        if (isNaN(date.getTime())) {
            return "el turno seleccionado";
        }
        const dateFormatter = new Intl.DateTimeFormat("es-AR", {
            timeZone: timezone || "America/Argentina/Buenos_Aires",
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
        });
        const timeFormatter = new Intl.DateTimeFormat("es-AR", {
            timeZone: timezone || "America/Argentina/Buenos_Aires",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
        const datePart = dateFormatter
            .format(date)
            .replace(/\./g, "")
            .replace(/,\s*/g, " ");
        const timePart = timeFormatter.format(date);
        return `${datePart} · ${timePart}`;
    }
    catch {
        return "el turno seleccionado";
    }
}
