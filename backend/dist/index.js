"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/index.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const axios_1 = __importDefault(require("axios"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const prisma_1 = require("./prisma");
const auth_1 = require("./auth");
const whatsapp_1 = require("./whatsapp");
const ai_1 = require("./ai");
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const text_1 = require("./utils/text");
const patientSummary_1 = require("./services/patientSummary");
const stateMachine_1 = require("./conversation/stateMachine");
const app = (0, express_1.default)();
const UPLOADS_DIR = path_1.default.join(__dirname, "..", "uploads");
const DOCTOR_UPLOADS_DIR = path_1.default.join(UPLOADS_DIR, "doctors");
const fsp = fs_1.default.promises;
ensureDirectory(UPLOADS_DIR);
ensureDirectory(DOCTOR_UPLOADS_DIR);
const PORT = process.env.PORT || 4000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || null;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const allowAnyOrigin = CORS_ORIGINS.includes("*");
// Habilitamos CORS para que el frontend (localhost:5173) pueda hablar con este backend
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowAnyOrigin) {
            return callback(null, true);
        }
        if (CORS_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
}));
// Para poder leer JSON en las request
app.use(express_1.default.json({
    limit: "5mb",
}));
app.use(express_1.default.urlencoded({
    extended: true,
    limit: "5mb",
}));
app.use("/uploads", express_1.default.static(UPLOADS_DIR));
// Ruta simple para probar que el backend funciona
app.get("/api/ping", (req, res) => {
    res.json({
        message: "pong desde el backend 🩺",
        time: new Date().toISOString(),
    });
});
/**
 * Helper para crear un token JWT
 */
function createToken(doctorId) {
    const secret = process.env.JWT_SECRET || "dev-secret";
    return jsonwebtoken_1.default.sign({ doctorId }, secret, {
        expiresIn: "7d",
    });
}
const SLOT_INTERVAL_MINUTES = [15, 30, 60, 120];
const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";
const ALLOWED_PAYMENT_METHODS = ["cash", "transfer_card"];
const DEFAULT_OFFICE_WINDOWS = [
    { startMinute: 9 * 60, endMinute: 18 * 60 },
];
const NON_BLOCKING_APPOINTMENT_STATUSES = [
    "cancelled",
    "cancelled_by_patient",
    "cancelled_by_doctor",
    "canceled",
    "no_show",
];
const PATIENT_TAG_SEVERITIES = ["critical", "high", "medium", "info"];
const isPatientTagSeverity = (value) => PATIENT_TAG_SEVERITIES.includes(value);
function normalizePatientTagSeverity(value) {
    if (!value)
        return "medium";
    const normalized = value.trim().toLowerCase();
    return isPatientTagSeverity(normalized) ? normalized : "medium";
}
function sanitizePatientTagLabel(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    if (trimmed.length < 2)
        return null;
    return trimmed.slice(0, 60);
}
function serializePatientTag(tag) {
    return {
        id: tag.id,
        label: tag.label,
        severity: tag.severity,
        createdAt: tag.createdAt.toISOString(),
    };
}
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_PROFILE_IMAGE_MIME = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
]);
function normalizeDoctorAvailabilityStatus(value) {
    if (!value)
        return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === "available" ||
        normalized === "unavailable" ||
        normalized === "vacation") {
        return normalized;
    }
    return null;
}
function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}
const HEALTH_KEYWORDS = [
    "dolor",
    "control",
    "estudio",
    "estudios",
    "fiebre",
    "tos",
    "cabeza",
    "garganta",
    "mareo",
    "mareos",
    "consulta",
    "turno de control",
    "revisión",
    "revision",
    "resonancia",
    "rx",
    "placa",
    "analisis",
    "análisis",
    "vacuna",
];
const SCHEDULING_KEYWORDS = [
    "turno",
    "horario",
    "hora",
    "agenda",
    "disponible",
    "mañana",
    "tarde",
    "noche",
    "hoy",
    "pasado",
    "semana",
    "lunes",
    "martes",
    "miercoles",
    "miércoles",
    "jueves",
    "viernes",
    "sabado",
    "sábado",
    "domingo",
];
function sanitizeReason(reason, options) {
    var _a;
    if (!reason)
        return null;
    const trimmed = reason.trim();
    if (!trimmed)
        return null;
    if (/^(si|sí|dale|ok|okay|listo|me sirve|confirmo|perfecto)/i.test(trimmed)) {
        return null;
    }
    if (!(options === null || options === void 0 ? void 0 : options.allowSchedulingLike) && isLikelySchedulingText(trimmed)) {
        return null;
    }
    const formatted = (_a = (0, text_1.formatConsultReasonAnswer)(trimmed)) !== null && _a !== void 0 ? _a : trimmed;
    return formatted.slice(0, 180);
}
function isLikelySchedulingText(text) {
    const lower = text.toLowerCase();
    const hasSchedulingKeyword = SCHEDULING_KEYWORDS.some((word) => lower.includes(word));
    if (hasSchedulingKeyword) {
        const hasHealthKeyword = HEALTH_KEYWORDS.some((word) => lower.includes(word));
        if (!hasHealthKeyword) {
            return true;
        }
    }
    if (/\b\d{1,2}[:h]\d{0,2}\s*(am|pm|hs|h|horas|hrs)?\b/.test(lower)) {
        const hasHealthKeyword = HEALTH_KEYWORDS.some((word) => lower.includes(word));
        if (!hasHealthKeyword) {
            return true;
        }
    }
    return false;
}
function normalizeSlotIntervalInput(value) {
    if (value === null || value === undefined)
        return null;
    const parsed = typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
            ? Number(value.trim())
            : null;
    if (!parsed || Number.isNaN(parsed))
        return null;
    return SLOT_INTERVAL_MINUTES.includes(parsed) ? parsed : null;
}
function getEffectiveSlotInterval(value) {
    var _a;
    return (_a = normalizeSlotIntervalInput(value)) !== null && _a !== void 0 ? _a : 30;
}
function normalizeNoteInput(raw) {
    if (!raw)
        return null;
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    return trimmed.slice(0, 800);
}
function normalizeAgentProvidedName(raw) {
    if (!raw)
        return null;
    const cleaned = raw.replace(/\s+/g, " ").trim();
    if (!cleaned)
        return null;
    if (!/^[a-záéíóúüñ\s.'-]+$/i.test(cleaned)) {
        return null;
    }
    return cleaned.slice(0, 120);
}
function extractFullNameFromMessage(raw) {
    if (!raw)
        return null;
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    const explicitMatch = trimmed.match(/^(?:me\s+llamo|mi\s+nombre\s+es|soy)\s+(.{2,120})$/i);
    let candidate = explicitMatch ? explicitMatch[1] : trimmed;
    candidate = candidate.replace(/[,.;]/g, " ");
    if (!/^[a-záéíóúüñ\s.'-]+$/i.test(candidate)) {
        return null;
    }
    const forbidden = [
        "turno",
        "consulta",
        "hora",
        "horario",
        "agenda",
        "obra social",
        "prepaga",
        "precio",
        "hola",
        "quiero",
        "necesito",
        "gracias",
    ];
    if (!explicitMatch &&
        forbidden.some((word) => candidate.toLowerCase().includes(word.toLowerCase()))) {
        return null;
    }
    const words = candidate.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) {
        return null;
    }
    const normalizedWords = words.map((word) => {
        if (/^(de|del|la|las|los|y)$/i.test(word)) {
            return word.toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
    return normalizedWords.join(" ").slice(0, 120);
}
function detectPatientPreference(text, timezone) {
    if (!text)
        return null;
    const pref = parsePreferenceFromTextLocal(text);
    if (!pref)
        return null;
    const now = getNowInTimezoneLocal(timezone);
    const day = resolvePreferredDay(pref, now, timezone);
    const hourMinutes = resolvePreferredHourMinutes(pref);
    if (!day && hourMinutes === null) {
        return null;
    }
    return { day, hourMinutes };
}
function parsePreferenceFromTextLocal(text) {
    var _a;
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
function resolvePreferredDay(preference, now, timezone) {
    if (typeof preference.dayOffset === "number") {
        return startOfDayLocal(addDaysLocal(now, preference.dayOffset), timezone);
    }
    if (typeof preference.weekday === "number") {
        return startOfDayLocal(nextWeekdayLocal(now, preference.weekday, timezone), timezone);
    }
    return null;
}
function resolvePreferredHourMinutes(preference) {
    if (typeof preference.hour === "number") {
        return Math.round(preference.hour * 60);
    }
    if (preference.period === "morning")
        return 10 * 60;
    if (preference.period === "afternoon")
        return 16 * 60;
    if (preference.period === "evening")
        return 19 * 60;
    return null;
}
function parseOfficeHoursWindows(raw) {
    if (!raw)
        return [];
    const normalized = raw
        .toLowerCase()
        .replace(/[–—−]/g, "-")
        .replace(/[\/|]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const rangeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|hs|h|hrs|horas)?\s*(?:a|hasta|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|hs|h|hrs|horas)?/g;
    const windows = [];
    let match;
    while ((match = rangeRegex.exec(normalized))) {
        const [_, sh, sm, ssuffixRaw, eh, em, esuffixRaw] = match;
        const startMinutes = parseTimeToMinutes(sh, sm, ssuffixRaw);
        const endMinutes = parseTimeToMinutes(eh, em, esuffixRaw);
        if (startMinutes === null ||
            endMinutes === null ||
            endMinutes <= startMinutes) {
            continue;
        }
        windows.push({
            startMinute: startMinutes,
            endMinute: endMinutes,
        });
    }
    return windows.sort((a, b) => a.startMinute - b.startMinute);
}
function parseOfficeDays(raw) {
    var _a, _b;
    if (!raw)
        return null;
    const normalized = raw
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!normalized)
        return null;
    const dayMap = {
        domingo: 0,
        dom: 0,
        lunes: 1,
        lun: 1,
        martes: 2,
        mar: 2,
        miercoles: 3,
        mier: 3,
        jueves: 4,
        jue: 4,
        viernes: 5,
        vie: 5,
        sabado: 6,
        sab: 6,
    };
    const set = new Set();
    const rangeRegex = /(domingo|lunes|martes|miercoles|jueves|viernes|sabado|dom|lun|mar|mier|jue|vie|sab)\s*(?:a|al|hasta|-)\s*(domingo|lunes|martes|miercoles|jueves|viernes|sabado|dom|lun|mar|mier|jue|vie|sab)/g;
    for (const match of normalized.matchAll(rangeRegex)) {
        const start = (_a = dayMap[match[1]]) !== null && _a !== void 0 ? _a : null;
        const end = (_b = dayMap[match[2]]) !== null && _b !== void 0 ? _b : null;
        if (start === null || end === null)
            continue;
        let current = start;
        set.add(current);
        let guard = 0;
        while (current !== end && guard < 7) {
            current = (current + 1) % 7;
            set.add(current);
            guard++;
        }
    }
    const cleaned = normalized.replace(rangeRegex, " ");
    cleaned
        .split(/[\s,]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .forEach((token) => {
        let base = token.replace(/[^a-z]/g, "");
        if (!base || base === "y" || base === "al" || base === "a") {
            return;
        }
        if (base.endsWith("s") && base.length > 3) {
            base = base.slice(0, -1);
        }
        const idx = dayMap[base];
        if (idx !== undefined) {
            set.add(idx);
        }
    });
    return set.size ? set : null;
}
function parseTimeToMinutes(hourStr, minuteStr, suffixRaw) {
    const hour = Number(hourStr);
    if (!Number.isFinite(hour)) {
        return null;
    }
    const minute = minuteStr ? Number(minuteStr) : 0;
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) {
        return null;
    }
    const suffix = suffixRaw
        ? suffixRaw.replace(/\./g, "").trim().toLowerCase()
        : "";
    let normalizedHour = hour;
    if (suffix.includes("pm") && normalizedHour < 12) {
        normalizedHour += 12;
    }
    else if (suffix.includes("am") && normalizedHour === 12) {
        normalizedHour = 0;
    }
    if (normalizedHour >= 24) {
        normalizedHour = normalizedHour % 24;
    }
    if (normalizedHour < 0 || normalizedHour > 23) {
        return null;
    }
    return normalizedHour * 60 + minute;
}
function areDatesWithinSameMinute(a, b) {
    return Math.abs(a.getTime() - b.getTime()) < 60 * 1000;
}
function formatSlotLabel(date, timezone) {
    const dateFormatter = new Intl.DateTimeFormat("es-AR", {
        timeZone: timezone,
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
    });
    const timeFormatter = new Intl.DateTimeFormat("es-AR", {
        timeZone: timezone,
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
function startOfDayLocal(date, timezone) {
    try {
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        const parts = formatter.formatToParts(date);
        const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
        return new Date(`${lookup.year}-${lookup.month}-${lookup.day}T00:00:00Z`);
    }
    catch {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    }
}
function formatMenuMessage(reply, menu) {
    const parts = [];
    if (reply && reply.trim()) {
        parts.push(reply.trim());
    }
    if (menu && menu.options.length) {
        const header = [`${menu.title}`.trim(), menu.prompt.trim()]
            .filter(Boolean)
            .join("\n");
        const options = menu.options
            .map((option) => {
            const desc = option.description ? ` · ${option.description}` : "";
            return `${option.id}. ${option.label}${desc}`;
        })
            .join("\n");
        parts.push(header, options);
        if (menu.hint) {
            parts.push(menu.hint);
        }
    }
    return parts.join("\n\n").trim();
}
function ensureDirectory(dir) {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
async function removeProfileImageFile(relativeUrl) {
    if (!relativeUrl || !relativeUrl.startsWith("/uploads/")) {
        return;
    }
    const normalized = relativeUrl.replace(/^\/uploads\//, "");
    if (!normalized)
        return;
    const targetPath = path_1.default.join(UPLOADS_DIR, normalized);
    if (!targetPath.startsWith(UPLOADS_DIR)) {
        return;
    }
    try {
        await fsp.unlink(targetPath);
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) !== "ENOENT") {
            console.warn("[Profile Image] No se pudo eliminar archivo:", (error === null || error === void 0 ? void 0 : error.message) || error);
        }
    }
}
function detectExtensionFromMime(mime) {
    if (mime.includes("png"))
        return "png";
    if (mime.includes("webp"))
        return "webp";
    if (mime.includes("gif"))
        return "gif";
    return "jpg";
}
function parseBase64ImageInput(imageBase64) {
    const trimmed = (imageBase64 || "").trim();
    if (!trimmed) {
        throw new Error("No recibí la imagen a guardar.");
    }
    const dataUriMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    const mime = dataUriMatch ? dataUriMatch[1] : "image/png";
    const base64Payload = dataUriMatch ? dataUriMatch[2] : trimmed;
    if (!ALLOWED_PROFILE_IMAGE_MIME.has(mime)) {
        throw new Error("Formato de imagen no soportado. Subí PNG, JPG o WEBP.");
    }
    const buffer = Buffer.from(base64Payload, "base64");
    if (!buffer.length) {
        throw new Error("La imagen no tiene datos válidos.");
    }
    if (buffer.length > MAX_PROFILE_IMAGE_BYTES) {
        throw new Error("La imagen es demasiado pesada. Usá un archivo de hasta 2 MB.");
    }
    const extension = detectExtensionFromMime(mime);
    return { buffer, extension };
}
async function saveProfileImageForDoctor(doctorId, imageBase64, previousUrl) {
    const { buffer, extension } = parseBase64ImageInput(imageBase64);
    const filename = `doctor-${doctorId}-${Date.now()}.${extension}`;
    const destination = path_1.default.join(DOCTOR_UPLOADS_DIR, filename);
    await fsp.writeFile(destination, buffer);
    const relativeUrl = `/uploads/doctors/${filename}`;
    if (previousUrl) {
        await removeProfileImageFile(previousUrl);
    }
    return relativeUrl;
}
function appendMenuHint(message) {
    const hint = 'Escribí "menu" para ver las opciones (sacar, reprogramar o cancelar turno).';
    if (!message || !message.trim()) {
        return hint;
    }
    const normalized = message.toLowerCase();
    if (normalized.includes("menu") || normalized.includes("menú")) {
        return message;
    }
    return `${message.trim()}\n\n${hint}`;
}
async function processBookingRequest(params) {
    const slot = params.availableSlots.find((s) => s.startISO === params.bookingRequest.slotISO);
    if (!slot) {
        return {
            message: "Ese horario ya no figura disponible. Elegí otro del calendario, por favor.",
        };
    }
    const slotDate = new Date(slot.startISO);
    if (isNaN(slotDate.getTime())) {
        return {
            message: "No pude leer el horario seleccionado. Probá nuevamente con otra opción.",
        };
    }
    if (params.bookingRequest.type === "book") {
        const conflicting = await prisma_1.prisma.appointment.findFirst({
            where: {
                doctorId: params.doctorId,
                dateTime: slotDate,
                status: { notIn: NON_BLOCKING_APPOINTMENT_STATUSES },
            },
        });
        if (conflicting) {
            return {
                message: "Ese turno se reservó recién. Elegí otro horario y lo confirmo al instante.",
            };
        }
        await prisma_1.prisma.appointment.create({
            data: {
                dateTime: slotDate,
                type: params.patient.consultReason ||
                    params.bookingRequest.slotLabel ||
                    "Consulta",
                status: "scheduled",
                price: 0,
                paid: false,
                source: "whatsapp",
                doctorId: params.doctorId,
                patientId: params.patient.id,
            },
        });
        return {
            message: `Listo ${params.patient.fullName.split(" ")[0]}, agendé tu turno ${slot.humanLabel}. Cualquier cambio avisame por acá.`,
        };
    }
    if (!params.bookingRequest.appointmentId) {
        return { message: params.fallbackReply };
    }
    const appointment = await prisma_1.prisma.appointment.findFirst({
        where: {
            id: params.bookingRequest.appointmentId,
            doctorId: params.doctorId,
            patientId: params.patient.id,
        },
    });
    if (!appointment) {
        return { message: params.fallbackReply };
    }
    await prisma_1.prisma.appointment.update({
        where: { id: appointment.id },
        data: {
            dateTime: slotDate,
            status: appointment.status === "waiting" ? "waiting" : "scheduled",
        },
    });
    const label = formatSlotLabel(slotDate, params.timezone);
    return {
        message: `Reprogramé tu turno para ${label}. Quedó confirmado ✅`,
    };
}
async function processCancelRequest(params) {
    const appointment = await prisma_1.prisma.appointment.findFirst({
        where: {
            id: params.cancelRequest.appointmentId,
            doctorId: params.doctorId,
            patientId: params.patient.id,
        },
    });
    if (!appointment) {
        return { message: params.fallbackReply };
    }
    if (appointment.status === "cancelled_by_patient") {
        return { message: "Ese turno ya estaba cancelado. ¿Querés agendar uno nuevo?" };
    }
    await prisma_1.prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: "cancelled_by_patient" },
    });
    let updatedPatient;
    if (params.patient.pendingSlotISO &&
        areDatesWithinSameMinute(params.patient.pendingSlotISO, appointment.dateTime)) {
        updatedPatient = await prisma_1.prisma.patient.update({
            where: { id: params.patient.id },
            data: {
                pendingSlotISO: null,
                pendingSlotHumanLabel: null,
                pendingSlotExpiresAt: null,
                pendingSlotReason: null,
            },
        });
    }
    return {
        message: "Listo, cancelé el turno. Si querés otro horario avisame y lo vemos.",
        ...(updatedPatient ? { patient: updatedPatient } : {}),
    };
}
function getNowInTimezoneLocal(timezone) {
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
        return new Date(`${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}Z`);
    }
    catch {
        return new Date();
    }
}
function addDaysLocal(date, days) {
    const copy = new Date(date.getTime());
    copy.setDate(copy.getDate() + days);
    return copy;
}
function nextWeekdayLocal(date, weekday, timezone) {
    let candidate = startOfDayLocal(date, timezone);
    for (let i = 0; i < 7; i++) {
        if (candidate.getDay() === weekday) {
            return candidate;
        }
        candidate = addDaysLocal(candidate, 1);
    }
    return candidate;
}
function getMinutesOfDayLocal(date, timezone) {
    try {
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
        const parts = formatter.formatToParts(date);
        const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
        return Number(lookup.hour) * 60 + Number(lookup.minute);
    }
    catch {
        return date.getHours() * 60 + date.getMinutes();
    }
}
function formatPreferredDayLabel(date, timezone) {
    const formatter = new Intl.DateTimeFormat("es-AR", {
        timeZone: timezone,
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
    });
    return formatter.format(date).replace(/\b\w/g, (c) => c.toLowerCase());
}
function formatMinutesAsHour(minutes) {
    if (minutes === null || minutes === undefined)
        return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function describePatientPreference(patient, timezone) {
    const parts = [];
    if (patient.preferredDayISO) {
        parts.push(`para ${formatPreferredDayLabel(patient.preferredDayISO, timezone)}`);
    }
    if (typeof patient.preferredHour === "number") {
        const hourLabel = formatMinutesAsHour(patient.preferredHour);
        if (hourLabel)
            parts.push(`cerca de ${hourLabel}`);
    }
    if (!parts.length)
        return null;
    return parts.join(" ");
}
function isSameCalendarDayLocal(a, b, timezone) {
    const dayA = startOfDayLocal(a, timezone);
    const dayB = startOfDayLocal(b, timezone);
    return dayA.getTime() === dayB.getTime();
}
function isSlotAlignedWithPreference(patient, slotDate, timezone) {
    if (patient.preferredDayISO) {
        if (!isSameCalendarDayLocal(slotDate, patient.preferredDayISO, timezone)) {
            return false;
        }
    }
    if (typeof patient.preferredHour === "number") {
        const slotMinutes = getMinutesOfDayLocal(slotDate, timezone);
        if (Math.abs(slotMinutes - patient.preferredHour) > 45) {
            return false;
        }
    }
    return true;
}
function pickBestSlotForPatient(slots, patient, timezone) {
    if (!slots || slots.length === 0)
        return null;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const slot of slots) {
        const slotDate = new Date(slot.startISO);
        if (isNaN(slotDate.getTime()))
            continue;
        const score = scoreSlotAgainstPreferenceLocal(slotDate, patient, timezone);
        if (score < bestScore) {
            best = slot;
            bestScore = score;
        }
    }
    return best;
}
function scoreSlotAgainstPreferenceLocal(slotDate, patient, timezone) {
    let score = 0;
    if (patient.preferredDayISO) {
        const diffDays = Math.abs(startOfDayLocal(slotDate, timezone).getTime() -
            startOfDayLocal(patient.preferredDayISO, timezone).getTime());
        score += diffDays / 86400000 * 1440;
    }
    if (typeof patient.preferredHour === "number") {
        const slotMinutes = getMinutesOfDayLocal(slotDate, timezone);
        score += Math.abs(slotMinutes - patient.preferredHour);
    }
    return score;
}
function alignSlotsWithPreferenceForAgent(slots, patient, timezone) {
    if (!patient.preferredDayISO) {
        return {
            slotsForAgent: slots.slice(0, 30),
            preferredDayMatches: 0,
        };
    }
    const matching = [];
    const rest = [];
    for (const slot of slots) {
        const slotDate = new Date(slot.startISO);
        if (isNaN(slotDate.getTime())) {
            rest.push(slot);
            continue;
        }
        if (isSameCalendarDayLocal(slotDate, patient.preferredDayISO, timezone)) {
            matching.push(slot);
        }
        else {
            rest.push(slot);
        }
    }
    const prioritized = [...matching, ...rest];
    return {
        slotsForAgent: prioritized.slice(0, 30),
        preferredDayMatches: matching.length,
    };
}
function requireAdminKey(req, res, next) {
    var _a;
    if (!ADMIN_API_KEY) {
        return res
            .status(403)
            .json({ error: "Admin API deshabilitada (falta ADMIN_API_KEY)" });
    }
    const headerKey = (_a = (req.headers["x-admin-key"] ||
        req.headers["X-Admin-Key"] ||
        req.headers["x-admin-token"] ||
        req.headers["X-Admin-Token"])) !== null && _a !== void 0 ? _a : null;
    if (typeof headerKey !== "string" || headerKey !== ADMIN_API_KEY) {
        return res.status(401).json({ error: "Admin API key inválida" });
    }
    return next();
}
async function requireDoctorWhatsapp(doctorId) {
    const doctor = await prisma_1.prisma.doctor.findUnique({
        where: { id: doctorId },
        select: {
            id: true,
            name: true,
            whatsappBusinessNumber: true,
        },
    });
    if (!doctor) {
        throw new Error("Doctor no encontrado");
    }
    let fromNumber = doctor.whatsappBusinessNumber;
    if (!fromNumber && process.env.TWILIO_WHATSAPP_FROM) {
        fromNumber = process.env.TWILIO_WHATSAPP_FROM;
    }
    if (!fromNumber) {
        throw new Error("Este doctor todavía no conectó WhatsApp");
    }
    return {
        ...doctor,
        whatsappBusinessNumber: fromNumber,
    };
}
function getDoctorBusinessNumber(doctor) {
    return (doctor.whatsappBusinessNumber ||
        process.env.TWILIO_WHATSAPP_FROM ||
        "business");
}
function formatE164(value) {
    if (!value)
        return null;
    let cleaned = value.toString().trim();
    cleaned = cleaned.replace(/^whatsapp:/i, "");
    if (!cleaned.startsWith("+")) {
        cleaned = `+${cleaned.replace(/^\+/, "")}`;
    }
    cleaned = cleaned.replace(/\s/g, "");
    return cleaned;
}
function normalizeWhatsappSender(value) {
    let cleaned = value.trim();
    if (!cleaned)
        return cleaned;
    cleaned = cleaned.replace(/^whatsapp:/i, "");
    if (!cleaned.startsWith("+")) {
        cleaned = `+${cleaned.replace(/^\+/, "")}`;
    }
    return `whatsapp:${cleaned}`;
}
function validateTwilioSignature(req) {
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    if (!twilioToken)
        return true;
    const signature = req.header("x-twilio-signature");
    if (!signature)
        return false;
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host") || "";
    const url = `${protocol}://${host}${req.originalUrl}`;
    const params = req.body || {};
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
        const value = params[key];
        data += key + (value !== null && value !== void 0 ? value : "");
    }
    const expected = crypto_1.default
        .createHmac("sha1", twilioToken)
        .update(Buffer.from(data, "utf8"))
        .digest("base64");
    const safeSignature = Buffer.from(signature);
    const safeExpected = Buffer.from(expected);
    if (safeSignature.length !== safeExpected.length) {
        return false;
    }
    return crypto_1.default.timingSafeEqual(safeSignature, safeExpected);
}
/**
 * Construir slots disponibles para el agente
 */
async function getAvailableSlotsForDoctor(doctorId) {
    var _a, _b, _c;
    const doctor = await prisma_1.prisma.doctor.findUnique({
        where: { id: doctorId },
        select: {
            appointmentSlotMinutes: true,
            officeHours: true,
            officeDays: true,
        },
    });
    const slotInterval = getEffectiveSlotInterval((_a = doctor === null || doctor === void 0 ? void 0 : doctor.appointmentSlotMinutes) !== null && _a !== void 0 ? _a : null);
    const officeWindows = parseOfficeHoursWindows((_b = doctor === null || doctor === void 0 ? void 0 : doctor.officeHours) !== null && _b !== void 0 ? _b : null);
    const workingWindows = officeWindows.length > 0 ? officeWindows : DEFAULT_OFFICE_WINDOWS;
    const allowedWeekdays = parseOfficeDays((_c = doctor === null || doctor === void 0 ? void 0 : doctor.officeDays) !== null && _c !== void 0 ? _c : null);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59, 999);
    const appointments = await prisma_1.prisma.appointment.findMany({
        where: {
            doctorId,
            status: {
                notIn: NON_BLOCKING_APPOINTMENT_STATUSES,
            },
            dateTime: {
                gte: start,
                lte: end,
            },
        },
    });
    const taken = new Set(appointments.map((a) => a.dateTime.toISOString().slice(0, 16)));
    const slots = [];
    const tz = "America/Argentina/Buenos_Aires";
    for (let d = new Date(start.getTime()); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        const dayAllowed = allowedWeekdays && allowedWeekdays.size
            ? allowedWeekdays.has(dayOfWeek)
            : dayOfWeek !== 0;
        if (!dayAllowed)
            continue;
        for (const window of workingWindows) {
            for (let minutes = window.startMinute; minutes + slotInterval <= window.endMinute; minutes += slotInterval) {
                const hour = Math.floor(minutes / 60);
                const minute = minutes % 60;
                const slot = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0);
                if (slot < now)
                    continue;
                const key = slot.toISOString().slice(0, 16);
                if (taken.has(key))
                    continue;
                slots.push({
                    startISO: slot.toISOString(),
                    humanLabel: formatSlotLabel(slot, tz),
                });
            }
        }
    }
    return slots.slice(0, 30);
}
/**
 * Registro de doctor
 * POST /api/auth/register
 */
app.post("/api/auth/register", async (req, res) => {
    var _a;
    try {
        const { name, email, password, contactPhone, gender, specialty, businessType, } = req.body;
        if (!name ||
            !email ||
            !password ||
            !contactPhone ||
            !gender ||
            !specialty ||
            !businessType) {
            return res.status(400).json({
                error: "Faltan campos: nombre, email, contraseña, teléfono, sexo, especialidad o tipo de negocio",
            });
        }
        const existing = await prisma_1.prisma.doctor.findUnique({
            where: { email },
        });
        if (existing) {
            return res.status(400).json({
                error: "Ya existe un médico con ese email",
            });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const doctor = await prisma_1.prisma.doctor.create({
            data: {
                name,
                email,
                passwordHash,
                contactPhone,
                gender,
                specialty,
                businessType: businessType === "BEAUTY"
                    ? "BEAUTY"
                    : businessType === "RETAIL"
                        ? "RETAIL"
                        : "HEALTH",
            },
        });
        const token = createToken(doctor.id);
        res.json({
            token,
            doctor: {
                id: doctor.id,
                name: doctor.name,
                email: doctor.email,
                businessType: doctor.businessType,
                availabilityStatus: doctor.availabilityStatus,
                profileImageUrl: (_a = doctor.profileImageUrl) !== null && _a !== void 0 ? _a : null,
            },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Error al registrar médico",
        });
    }
});
/**
 * Login de doctor
 * POST /api/auth/login
 */
app.post("/api/auth/login", async (req, res) => {
    var _a;
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                error: "Faltan campos: email o password",
            });
        }
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { email },
        });
        if (!doctor) {
            return res.status(401).json({
                error: "Credenciales inválidas",
            });
        }
        const isValid = await bcryptjs_1.default.compare(password, doctor.passwordHash);
        if (!isValid) {
            return res.status(401).json({
                error: "Credenciales inválidas",
            });
        }
        const token = createToken(doctor.id);
        res.json({
            token,
            doctor: {
                id: doctor.id,
                name: doctor.name,
                email: doctor.email,
                businessType: doctor.businessType,
                availabilityStatus: doctor.availabilityStatus,
                profileImageUrl: (_a = doctor.profileImageUrl) !== null && _a !== void 0 ? _a : null,
            },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Error al iniciar sesión",
        });
    }
});
/**
 * Ruta DEV: seed de la base de datos
 */
app.get("/api/dev/seed", async (req, res) => {
    try {
        await prisma_1.prisma.appointment.deleteMany();
        await prisma_1.prisma.message.deleteMany();
        await prisma_1.prisma.patient.deleteMany();
        await prisma_1.prisma.whatsAppNumber.deleteMany();
        await prisma_1.prisma.doctor.deleteMany();
        const passwordHash = await bcryptjs_1.default.hash("demo1234", 10);
        const doctor = await prisma_1.prisma.doctor.create({
            data: {
                name: "Dra. Ana García",
                email: "ana@example.com",
                passwordHash,
                contactPhone: "+54 9 11 5555-6666",
                specialty: "Clínica médica",
                gender: "femenino",
                businessType: "HEALTH",
                appointmentSlotMinutes: 30,
            },
        });
        await prisma_1.prisma.whatsAppNumber.create({
            data: {
                displayPhoneNumber: normalizeWhatsappSender(process.env.TWILIO_WHATSAPP_FROM || "+54 9 11 5555-6666"),
                status: "available",
            },
        });
        const juan = await prisma_1.prisma.patient.create({
            data: {
                fullName: "Juan Pérez",
                phone: "+54 9 11 1234-5678",
                doctorId: doctor.id,
            },
        });
        const maria = await prisma_1.prisma.patient.create({
            data: {
                fullName: "María López",
                phone: "+54 9 11 2222-3333",
                doctorId: doctor.id,
            },
        });
        const carlos = await prisma_1.prisma.patient.create({
            data: {
                fullName: "Carlos Díaz",
                phone: "+54 9 11 4444-5555",
                doctorId: doctor.id,
            },
        });
        const now = new Date();
        const todayBase = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const atTime = (hours, minutes) => new Date(todayBase.getFullYear(), todayBase.getMonth(), todayBase.getDate(), hours, minutes, 0, 0);
        await prisma_1.prisma.appointment.create({
            data: {
                dateTime: atTime(9, 30),
                type: "Control post-operatorio · Presencial",
                status: "scheduled",
                price: 35000,
                paid: true,
                doctorId: doctor.id,
                patientId: juan.id,
            },
        });
        await prisma_1.prisma.appointment.create({
            data: {
                dateTime: atTime(11, 0),
                type: "Consulta general · Videollamada",
                status: "scheduled",
                price: 28000,
                paid: false,
                doctorId: doctor.id,
                patientId: maria.id,
            },
        });
        await prisma_1.prisma.appointment.create({
            data: {
                dateTime: atTime(12, 15),
                type: "Resultados de estudios · Presencial",
                status: "waiting",
                price: 31000,
                paid: false,
                doctorId: doctor.id,
                patientId: carlos.id,
            },
        });
        const sevenDaysAgo = new Date(todayBase.getFullYear(), todayBase.getMonth(), todayBase.getDate() - 7, 10, 0, 0, 0);
        const fiveDaysAgo = new Date(todayBase.getFullYear(), todayBase.getMonth(), todayBase.getDate() - 5, 14, 30, 0, 0);
        await prisma_1.prisma.appointment.create({
            data: {
                dateTime: sevenDaysAgo,
                type: "Consulta de seguimiento · Presencial",
                status: "completed",
                price: 32000,
                paid: true,
                doctorId: doctor.id,
                patientId: juan.id,
            },
        });
        await prisma_1.prisma.appointment.create({
            data: {
                dateTime: fiveDaysAgo,
                type: "Chequeo anual · Presencial",
                status: "completed",
                price: 45000,
                paid: true,
                doctorId: doctor.id,
                patientId: maria.id,
            },
        });
        res.json({
            ok: true,
            message: 'Base de datos de ejemplo creada. Login demo: email "ana@example.com", password "demo1234".',
        });
    }
    catch (error) {
        console.error("Error en /api/dev/seed:", error);
        res.status(500).json({
            error: "Error al seedear la base de datos",
            detail: (error === null || error === void 0 ? void 0 : error.message) || String(error),
        });
    }
});
/**
 * Resumen del dashboard (global, SIN auth, para no romper tu frontend actual)
 */
app.get("/api/dashboard-summary", async (req, res) => {
    var _a, _b, _c;
    try {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0, 0);
        const [consultasHoy, pacientesEnEspera, ingresosMesAgg, pagosHoyAgg, pagosPendAgg, groupByPatients, agendaHoyRaw,] = await Promise.all([
            prisma_1.prisma.appointment.count({
                where: {
                    dateTime: {
                        gte: startOfToday,
                        lte: endOfToday,
                    },
                },
            }),
            prisma_1.prisma.appointment.count({
                where: {
                    status: "waiting",
                    dateTime: {
                        gte: now,
                    },
                },
            }),
            prisma_1.prisma.appointment.aggregate({
                _sum: {
                    chargedAmount: true,
                },
                where: {
                    paid: true,
                    dateTime: {
                        gte: startOfMonth,
                    },
                },
            }),
            prisma_1.prisma.appointment.aggregate({
                _sum: {
                    chargedAmount: true,
                },
                where: {
                    paid: true,
                    dateTime: {
                        gte: startOfToday,
                        lte: endOfToday,
                    },
                },
            }),
            prisma_1.prisma.appointment.aggregate({
                _sum: {
                    price: true,
                },
                where: {
                    paid: false,
                },
            }),
            prisma_1.prisma.appointment.groupBy({
                by: ["patientId"],
                where: {
                    dateTime: {
                        gte: thirtyDaysAgo,
                    },
                },
                _count: {
                    _all: true,
                },
            }),
            prisma_1.prisma.appointment.findMany({
                where: {
                    dateTime: {
                        gte: startOfToday,
                        lte: endOfToday,
                    },
                },
                include: {
                    patient: true,
                },
                orderBy: {
                    dateTime: "asc",
                },
            }),
        ]);
        const ingresosMes = (_a = ingresosMesAgg._sum.chargedAmount) !== null && _a !== void 0 ? _a : 0;
        const cobradoHoy = (_b = pagosHoyAgg._sum.chargedAmount) !== null && _b !== void 0 ? _b : 0;
        const pendiente = (_c = pagosPendAgg._sum.price) !== null && _c !== void 0 ? _c : 0;
        const totalPatientsPeriod = groupByPatients.length;
        const recurrentesCount = groupByPatients.filter((g) => g._count._all >= 2).length;
        const pacientesRecurrentesPorcentaje = totalPatientsPeriod === 0
            ? 0
            : Math.round((recurrentesCount * 100) / totalPatientsPeriod);
        const agendaHoy = agendaHoyRaw.map((appt) => {
            var _a;
            return ({
                id: appt.id,
                hora: appt.dateTime.toTimeString().slice(0, 5),
                paciente: appt.patient.fullName,
                descripcion: appt.type,
                accion: appt.status === "waiting" ? "recordatorio" : "reprogramar",
                status: appt.status,
                dateTimeISO: appt.dateTime.toISOString(),
                patientId: appt.patientId,
                insuranceProvider: (_a = appt.patient.insuranceProvider) !== null && _a !== void 0 ? _a : null,
            });
        });
        res.json({
            stats: {
                consultasHoy,
                pacientesEnEspera,
                ingresosMes,
                pacientesRecurrentesPorcentaje,
            },
            agendaHoy,
            pagos: {
                cobradoHoy,
                pendiente,
            },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Error al obtener el resumen del dashboard",
        });
    }
});
/**
 * Resumen del dashboard para el doctor logueado
 * GET /api/dashboard-summary/me
 */
app.get("/api/dashboard-summary/me", auth_1.authMiddleware, async (req, res) => {
    var _a, _b, _c;
    try {
        const doctorId = req.doctorId;
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0, 0);
        const [consultasHoy, pacientesEnEspera, ingresosMesAgg, pagosHoyAgg, pagosPendAgg, groupByPatients, agendaHoyRaw,] = await Promise.all([
            prisma_1.prisma.appointment.count({
                where: {
                    doctorId,
                    dateTime: {
                        gte: startOfToday,
                        lte: endOfToday,
                    },
                },
            }),
            prisma_1.prisma.appointment.count({
                where: {
                    doctorId,
                    status: "waiting",
                    dateTime: {
                        gte: now,
                    },
                },
            }),
            prisma_1.prisma.appointment.aggregate({
                _sum: {
                    chargedAmount: true,
                },
                where: {
                    doctorId,
                    paid: true,
                    dateTime: {
                        gte: startOfMonth,
                    },
                },
            }),
            prisma_1.prisma.appointment.aggregate({
                _sum: {
                    chargedAmount: true,
                },
                where: {
                    doctorId,
                    paid: true,
                    dateTime: {
                        gte: startOfToday,
                        lte: endOfToday,
                    },
                },
            }),
            prisma_1.prisma.appointment.aggregate({
                _sum: {
                    price: true,
                },
                where: {
                    doctorId,
                    paid: false,
                },
            }),
            prisma_1.prisma.appointment.groupBy({
                by: ["patientId"],
                where: {
                    doctorId,
                    dateTime: {
                        gte: thirtyDaysAgo,
                    },
                },
                _count: {
                    _all: true,
                },
            }),
            prisma_1.prisma.appointment.findMany({
                where: {
                    doctorId,
                    dateTime: {
                        gte: startOfToday,
                        lte: endOfToday,
                    },
                },
                include: {
                    patient: true,
                },
                orderBy: {
                    dateTime: "asc",
                },
            }),
        ]);
        const ingresosMes = (_a = ingresosMesAgg._sum.chargedAmount) !== null && _a !== void 0 ? _a : 0;
        const cobradoHoy = (_b = pagosHoyAgg._sum.chargedAmount) !== null && _b !== void 0 ? _b : 0;
        const pendiente = (_c = pagosPendAgg._sum.price) !== null && _c !== void 0 ? _c : 0;
        const totalPatientsPeriod = groupByPatients.length;
        const recurrentesCount = groupByPatients.filter((g) => g._count._all >= 2).length;
        const pacientesRecurrentesPorcentaje = totalPatientsPeriod === 0
            ? 0
            : Math.round((recurrentesCount * 100) / totalPatientsPeriod);
        const agendaHoy = agendaHoyRaw.map((appt) => {
            var _a;
            return ({
                id: appt.id,
                hora: appt.dateTime.toTimeString().slice(0, 5),
                paciente: appt.patient.fullName,
                descripcion: appt.type,
                accion: appt.status === "waiting" ? "recordatorio" : "reprogramar",
                status: appt.status,
                dateTimeISO: appt.dateTime.toISOString(),
                patientId: appt.patientId,
                insuranceProvider: (_a = appt.patient.insuranceProvider) !== null && _a !== void 0 ? _a : null,
            });
        });
        res.json({
            stats: {
                consultasHoy,
                pacientesEnEspera,
                ingresosMes,
                pacientesRecurrentesPorcentaje,
            },
            agendaHoy,
            pagos: {
                cobradoHoy,
                pendiente,
            },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Error al obtener el resumen del dashboard (me)",
        });
    }
});
function buildWhatsappStatusPayload(doctor) {
    return {
        status: doctor.whatsappStatus,
        businessNumber: doctor.whatsappBusinessNumber,
        connectedAt: doctor.whatsappConnectedAt,
    };
}
app.get("/api/me/whatsapp/status", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: req.doctorId },
            select: {
                whatsappStatus: true,
                whatsappBusinessNumber: true,
                whatsappConnectedAt: true,
            },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        res.json(buildWhatsappStatusPayload(doctor));
    }
    catch (error) {
        console.error("Error en /api/me/whatsapp/status:", error);
        res.status(500).json({ error: "Error al obtener estado de WhatsApp" });
    }
});
app.get("/api/whatsapp/numbers", auth_1.authMiddleware, async (_req, res) => {
    try {
        const numbers = await prisma_1.prisma.whatsAppNumber.findMany({
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                displayPhoneNumber: true,
                status: true,
                assignedDoctorId: true,
            },
        });
        res.json({ numbers });
    }
    catch (error) {
        console.error("Error en /api/whatsapp/numbers:", error);
        res.status(500).json({ error: "No se pudieron obtener los números" });
    }
});
app.post("/api/me/whatsapp/connect", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const { whatsappNumberId } = req.body;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        if (doctor.whatsappStatus === "connected" &&
            doctor.whatsappBusinessNumber) {
            return res.json(buildWhatsappStatusPayload(doctor));
        }
        let availableNumber = null;
        if (whatsappNumberId) {
            availableNumber = await prisma_1.prisma.whatsAppNumber.findUnique({
                where: { id: whatsappNumberId },
            });
            if (!availableNumber || availableNumber.status !== "available") {
                return res.status(400).json({
                    error: "Ese número ya no está disponible. Elegí otro.",
                });
            }
        }
        else {
            availableNumber = await prisma_1.prisma.whatsAppNumber.findFirst({
                where: { status: "available" },
                orderBy: { createdAt: "asc" },
            });
            if (!availableNumber) {
                return res.status(409).json({
                    error: "No hay números de WhatsApp disponibles en este momento. Pedile a un administrador que cargue uno en Twilio.",
                });
            }
        }
        const now = new Date();
        const [, updatedDoctor] = await prisma_1.prisma.$transaction([
            prisma_1.prisma.whatsAppNumber.update({
                where: { id: availableNumber.id },
                data: {
                    status: "assigned",
                    assignedDoctorId: doctorId,
                },
            }),
            prisma_1.prisma.doctor.update({
                where: { id: doctorId },
                data: {
                    whatsappStatus: "connected",
                    whatsappBusinessNumber: availableNumber.displayPhoneNumber,
                    whatsappConnectedAt: now,
                },
            }),
        ]);
        res.json(buildWhatsappStatusPayload({
            whatsappStatus: updatedDoctor.whatsappStatus,
            whatsappBusinessNumber: updatedDoctor.whatsappBusinessNumber,
            whatsappConnectedAt: updatedDoctor.whatsappConnectedAt,
        }));
    }
    catch (error) {
        console.error("Error en /api/me/whatsapp/connect:", error);
        res.status(500).json({ error: "Error al conectar WhatsApp" });
    }
});
app.delete("/api/me/whatsapp/connect", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        if (!doctor.whatsappBusinessNumber) {
            return res.json(buildWhatsappStatusPayload({
                whatsappStatus: "disconnected",
                whatsappBusinessNumber: null,
                whatsappConnectedAt: null,
            }));
        }
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.whatsAppNumber.updateMany({
                where: { assignedDoctorId: doctorId },
                data: {
                    status: "available",
                    assignedDoctorId: null,
                },
            }),
            prisma_1.prisma.doctor.update({
                where: { id: doctorId },
                data: {
                    whatsappStatus: "disconnected",
                    whatsappBusinessNumber: null,
                    whatsappConnectedAt: null,
                },
            }),
        ]);
        res.json(buildWhatsappStatusPayload({
            whatsappStatus: "disconnected",
            whatsappBusinessNumber: null,
            whatsappConnectedAt: null,
        }));
    }
    catch (error) {
        console.error("Error en DELETE /api/me/whatsapp/connect:", error);
        res.status(500).json({ error: "Error al desconectar WhatsApp" });
    }
});
/**
 * Turnos de HOY del doctor logueado
 */
app.get("/api/appointments/today", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const appointments = await prisma_1.prisma.appointment.findMany({
            where: {
                doctorId,
                dateTime: {
                    gte: startOfToday,
                    lte: endOfToday,
                },
            },
            include: {
                patient: true,
            },
            orderBy: {
                dateTime: "asc",
            },
        });
        const result = appointments.map((appt) => {
            var _a;
            return ({
                id: appt.id,
                dateTime: appt.dateTime,
                hora: appt.dateTime.toTimeString().slice(0, 5),
                type: appt.type,
                status: appt.status,
                price: appt.price,
                paid: appt.paid,
                patient: {
                    id: appt.patient.id,
                    fullName: appt.patient.fullName,
                    phone: (_a = appt.patient.phone) !== null && _a !== void 0 ? _a : null,
                },
            });
        });
        res.json(result);
    }
    catch (error) {
        console.error("Error en /api/appointments/today:", error);
        res.status(500).json({
            error: "Error al listar los turnos de hoy",
        });
    }
});
/**
 * Crear nuevo turno
 */
app.post("/api/appointments", auth_1.authMiddleware, async (req, res) => {
    var _a;
    try {
        const doctorId = req.doctorId;
        const { patientName, patientPhone, dateTime, type, price } = req.body;
        if (!patientName || !dateTime || !type || typeof price !== "number") {
            return res.status(400).json({
                error: "Faltan campos: patientName, dateTime, type o price (number)",
            });
        }
        const parsedDate = new Date(dateTime);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                error: "dateTime no tiene un formato válido (usar ISO, ej: 2025-12-01T14:30:00)",
            });
        }
        const patient = await prisma_1.prisma.patient.create({
            data: {
                fullName: patientName,
                phone: patientPhone,
                doctorId,
                needsDni: true,
                needsBirthDate: true,
                needsAddress: true,
                needsInsurance: true,
                needsConsultReason: true,
            },
        });
        const appointment = await prisma_1.prisma.appointment.create({
            data: {
                dateTime: parsedDate,
                type,
                status: "scheduled",
                price,
                paid: false,
                source: "dashboard",
                doctorId,
                patientId: patient.id,
            },
            include: {
                patient: true,
            },
        });
        res.status(201).json({
            id: appointment.id,
            dateTime: appointment.dateTime,
            hora: appointment.dateTime.toTimeString().slice(0, 5),
            type: appointment.type,
            status: appointment.status,
            price: appointment.price,
            paid: appointment.paid,
            patient: {
                id: appointment.patient.id,
                fullName: appointment.patient.fullName,
                phone: (_a = appointment.patient.phone) !== null && _a !== void 0 ? _a : null,
            },
        });
    }
    catch (error) {
        console.error("Error en POST /api/appointments:", error);
        res.status(500).json({
            error: "Error al crear el turno",
        });
    }
});
/**
 * Enviar recordatorio de turno por WhatsApp
 */
app.post("/api/appointments/:id/send-reminder", auth_1.authMiddleware, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const doctorId = req.doctorId;
        const appointmentId = Number(req.params.id);
        if (isNaN(appointmentId)) {
            return res.status(400).json({ error: "appointmentId inválido" });
        }
        const appt = await prisma_1.prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: { patient: true },
        });
        if (!appt || appt.doctorId !== doctorId) {
            return res.status(404).json({ error: "Turno no encontrado" });
        }
        if (!appt.patient || !appt.patient.phone) {
            return res.status(400).json({
                error: "El paciente de este turno no tiene teléfono de WhatsApp guardado",
            });
        }
        let doctorWhatsapp;
        try {
            doctorWhatsapp = await requireDoctorWhatsapp(doctorId);
        }
        catch (error) {
            return res.status(400).json({
                error: (error === null || error === void 0 ? void 0 : error.message) ||
                    "Este doctor aún no tiene un número de WhatsApp conectado",
            });
        }
        const patientName = appt.patient.fullName || "paciente";
        const dateLabel = appt.dateTime.toLocaleDateString("es-AR", {
            weekday: "long",
            day: "2-digit",
            month: "2-digit",
        });
        const timeLabel = appt.dateTime.toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
        });
        const msg = `Hola ${patientName}, te recordamos tu turno el ${dateLabel} a las ${timeLabel}. Motivo: ${appt.type}. Si necesitás reprogramar, respondé este mensaje.`;
        const waResult = await (0, whatsapp_1.sendWhatsAppText)(appt.patient.phone, msg, {
            from: doctorWhatsapp.whatsappBusinessNumber,
        });
        const waId = (_f = (_c = (_b = (_a = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : (_e = (_d = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message_id) !== null && _f !== void 0 ? _f : null;
        const businessFrom = getDoctorBusinessNumber(doctorWhatsapp);
        const saved = await prisma_1.prisma.message.create({
            data: {
                waMessageId: waId,
                from: businessFrom,
                to: appt.patient.phone,
                direction: "outgoing",
                type: "text",
                body: msg,
                rawPayload: waResult,
                patientId: appt.patient.id,
                doctorId,
            },
        });
        return res.json({
            ok: true,
            waResult,
            savedMessageId: saved.id,
        });
    }
    catch (error) {
        console.error("Error en /api/appointments/:id/send-reminder:", ((_g = error === null || error === void 0 ? void 0 : error.response) === null || _g === void 0 ? void 0 : _g.data) || error);
        return res.status(500).json({
            error: "No se pudo enviar el recordatorio de turno",
            detail: (error === null || error === void 0 ? void 0 : error.message) || String(error),
        });
    }
});
/**
 * Enviar mensaje de WhatsApp a un paciente por ID
 */
app.post("/api/whatsapp/send-to-patient", auth_1.authMiddleware, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const doctorId = req.doctorId;
        const { patientId, message } = req.body;
        if (!patientId || !message) {
            return res.status(400).json({
                error: "Faltan campos: patientId y message",
            });
        }
        const patient = await prisma_1.prisma.patient.findFirst({
            where: { id: Number(patientId), doctorId },
        });
        if (!patient) {
            return res.status(404).json({
                error: "Paciente no encontrado",
            });
        }
        if (!patient.phone) {
            return res.status(400).json({
                error: "El paciente no tiene teléfono de WhatsApp guardado",
            });
        }
        let doctorWhatsapp;
        try {
            doctorWhatsapp = await requireDoctorWhatsapp(doctorId);
        }
        catch (error) {
            return res.status(400).json({
                error: (error === null || error === void 0 ? void 0 : error.message) ||
                    "Este doctor aún no tiene un número de WhatsApp conectado",
            });
        }
        const waResult = await (0, whatsapp_1.sendWhatsAppText)(patient.phone, message, {
            from: doctorWhatsapp.whatsappBusinessNumber,
        });
        const waId = (_f = (_c = (_b = (_a = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : (_e = (_d = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message_id) !== null && _f !== void 0 ? _f : null;
        const businessFrom = getDoctorBusinessNumber(doctorWhatsapp);
        const saved = await prisma_1.prisma.message.create({
            data: {
                waMessageId: waId,
                from: businessFrom,
                to: patient.phone,
                direction: "outgoing",
                type: "text",
                body: message,
                rawPayload: waResult,
                patientId: patient.id,
                doctorId,
            },
        });
        return res.json({
            ok: true,
            waResult,
            savedMessageId: saved.id,
        });
    }
    catch (error) {
        console.error("Error en /api/whatsapp/send-to-patient:", ((_g = error === null || error === void 0 ? void 0 : error.response) === null || _g === void 0 ? void 0 : _g.data) || error);
        return res.status(500).json({
            error: "No se pudo enviar el mensaje al paciente",
            detail: (error === null || error === void 0 ? void 0 : error.message) || String(error),
        });
    }
});
/**
 * Enviar mensaje de WhatsApp a todos los pacientes del doctor
 */
app.post("/api/whatsapp/broadcast", auth_1.authMiddleware, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        const doctorId = req.doctorId;
        const { message, tagLabels } = req.body;
        const trimmed = (message || "").trim();
        if (!trimmed) {
            return res.status(400).json({
                error: "Escribí el mensaje que querés enviar.",
            });
        }
        const limitedMessage = trimmed.slice(0, 1000);
        const normalizedSegments = Array.isArray(tagLabels)
            ? tagLabels
                .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
                .filter((tag) => tag.length > 0)
            : [];
        const patientWhere = {
            doctorId,
            phone: { not: null },
        };
        if (normalizedSegments.length > 0) {
            patientWhere.tags = {
                some: {
                    label: {
                        in: normalizedSegments,
                    },
                },
            };
        }
        const patients = await prisma_1.prisma.patient.findMany({
            where: patientWhere,
            select: {
                id: true,
                phone: true,
            },
        });
        if (!patients.length) {
            return res.status(400).json({
                error: "No hay pacientes con WhatsApp registrado para este doctor.",
            });
        }
        let doctorWhatsapp;
        try {
            doctorWhatsapp = await requireDoctorWhatsapp(doctorId);
        }
        catch (error) {
            return res.status(400).json({
                error: (error === null || error === void 0 ? void 0 : error.message) ||
                    "Este doctor aún no tiene un número de WhatsApp conectado",
            });
        }
        const businessFrom = getDoctorBusinessNumber(doctorWhatsapp);
        let sent = 0;
        const failures = [];
        for (const patient of patients) {
            if (!patient.phone)
                continue;
            try {
                const waResult = await (0, whatsapp_1.sendWhatsAppText)(patient.phone, limitedMessage, {
                    from: doctorWhatsapp.whatsappBusinessNumber,
                });
                const waId = (_f = (_c = (_b = (_a = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : (_e = (_d = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message_id) !== null && _f !== void 0 ? _f : null;
                await prisma_1.prisma.message.create({
                    data: {
                        waMessageId: waId,
                        from: businessFrom,
                        to: patient.phone,
                        direction: "outgoing",
                        type: "text",
                        body: limitedMessage,
                        rawPayload: waResult,
                        patientId: patient.id,
                        doctorId,
                    },
                });
                sent += 1;
            }
            catch (error) {
                console.error(`[Broadcast] Error al enviar a paciente ${patient.id}:`, ((_g = error === null || error === void 0 ? void 0 : error.response) === null || _g === void 0 ? void 0 : _g.data) || error);
                failures.push({
                    patientId: patient.id,
                    error: (error === null || error === void 0 ? void 0 : error.message) || "No pudimos enviar el mensaje",
                });
            }
        }
        return res.json({
            ok: true,
            total: patients.length,
            sent,
            failed: failures.length,
            failures,
        });
    }
    catch (error) {
        console.error("Error en /api/whatsapp/broadcast:", ((_h = error === null || error === void 0 ? void 0 : error.response) === null || _h === void 0 ? void 0 : _h.data) || error);
        return res.status(500).json({
            error: "No pudimos enviar el mensaje masivo",
            detail: (error === null || error === void 0 ? void 0 : error.message) || String(error),
        });
    }
});
/**
 * Enviar mensaje de prueba por WhatsApp
 */
app.post("/api/whatsapp/send-test", auth_1.authMiddleware, async (req, res) => {
    var _a;
    try {
        const { to, message } = req.body;
        if (!to || !message) {
            return res.status(400).json({
                error: "Faltan campos: to y message",
            });
        }
        const result = await (0, whatsapp_1.sendWhatsAppText)(to, message);
        res.json({
            ok: true,
            result,
        });
    }
    catch (error) {
        console.error("Error en /api/whatsapp/send-test:", ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || error);
        res.status(500).json({
            error: "No se pudo enviar el mensaje de WhatsApp",
            detail: (error === null || error === void 0 ? void 0 : error.message) || String(error),
        });
    }
});
/**
 * Webhook de verificación de WhatsApp (GET)
 */
app.get("/api/whatsapp/webhook", (_req, res) => {
    res.sendStatus(200);
});
app.post("/api/whatsapp/webhook", async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2;
    try {
        if (!validateTwilioSignature(req)) {
            return res.status(403).send("Invalid signature");
        }
        const payload = req.body;
        const fromRaw = payload.From;
        const toRaw = payload.To;
        const bodyText = ((_a = payload.Body) === null || _a === void 0 ? void 0 : _a.trim()) || "";
        const numMedia = Number(payload.NumMedia || "0");
        const mediaItems = [];
        if (numMedia > 0) {
            for (let i = 0; i < numMedia; i += 1) {
                const url = payload[`MediaUrl${i}`];
                if (!url)
                    continue;
                const contentType = payload[`MediaContentType${i}`] || null;
                const mediaSid = payload[`MediaSid${i}`] || null;
                mediaItems.push({
                    url,
                    contentType,
                    mediaSid,
                });
            }
        }
        if (!fromRaw || !toRaw) {
            return res.sendStatus(200);
        }
        const profileName = payload.ProfileName || null;
        const waId = payload.WaId || fromRaw.replace(/^whatsapp:/, "");
        const phoneE164 = formatE164(waId);
        const doctorNumber = normalizeWhatsappSender(toRaw);
        if (!phoneE164 || !doctorNumber) {
            return res.sendStatus(200);
        }
        const doctor = await prisma_1.prisma.doctor.findFirst({
            where: { whatsappBusinessNumber: doctorNumber },
            select: {
                id: true,
                name: true,
                businessType: true,
                specialty: true,
                clinicAddress: true,
                contactPhone: true,
                consultFee: true,
                emergencyFee: true,
                clinicName: true,
                officeDays: true,
                officeHours: true,
                extraNotes: true,
                whatsappBusinessNumber: true,
                availabilityStatus: true,
            },
        });
        if (!doctor) {
            console.warn("[Twilio Webhook] Doctor no encontrado para: ", doctorNumber);
            return res.sendStatus(200);
        }
        const isMedicalDoctor = doctor.businessType === "HEALTH";
        const doctorWhatsappConfig = {
            from: doctor.whatsappBusinessNumber,
        };
        const waMessageId = payload.MessageSid;
        console.log("📩 Mensaje entrante (Twilio)", {
            from: phoneE164,
            to: doctorNumber,
            profileName,
            body: bodyText,
        });
        // 1) Buscar / crear paciente
        let patient = await prisma_1.prisma.patient.findFirst({
            where: { phone: phoneE164, doctorId: doctor.id },
        });
        if (!patient) {
            patient = await prisma_1.prisma.patient.create({
                data: {
                    fullName: profileName || "Paciente WhatsApp",
                    phone: phoneE164,
                    needsDni: true,
                    needsName: true,
                    needsBirthDate: true,
                    needsAddress: true,
                    needsInsurance: isMedicalDoctor,
                    needsConsultReason: isMedicalDoctor,
                    doctorId: doctor.id,
                },
            });
        }
        if (!patient) {
            return res.sendStatus(200);
        }
        // 2) Guardar mensaje normal
        const savedIncoming = await prisma_1.prisma.message.create({
            data: {
                waMessageId,
                from: phoneE164,
                to: doctorNumber,
                direction: "incoming",
                type: bodyText ? "text" : "other",
                body: bodyText || null,
                rawPayload: payload,
                patientId: patient.id,
                doctorId: doctor.id,
            },
        });
        console.log("💾 Mensaje guardado en DB:", savedIncoming.id);
        const doctorAvailabilityStatus = doctor.availabilityStatus || "available";
        if (doctorAvailabilityStatus === "unavailable" ||
            doctorAvailabilityStatus === "vacation") {
            const responseText = doctorAvailabilityStatus === "unavailable"
                ? "El doctor no está tomando turnos por hoy."
                : "El doctor se encuentra de vacaciones.";
            try {
                const waResult = await (0, whatsapp_1.sendWhatsAppText)(phoneE164, responseText, doctorWhatsappConfig);
                await prisma_1.prisma.message.create({
                    data: {
                        waMessageId: (_b = waResult === null || waResult === void 0 ? void 0 : waResult.sid) !== null && _b !== void 0 ? _b : null,
                        from: doctorNumber,
                        to: phoneE164,
                        direction: "outgoing",
                        type: "text",
                        body: responseText,
                        rawPayload: waResult,
                        patientId: patient.id,
                        doctorId: doctor.id,
                    },
                });
            }
            catch (error) {
                console.error("[Twilio Webhook] Error enviando respuesta por indisponibilidad:", error);
            }
            return res.sendStatus(200);
        }
        if (mediaItems.length &&
            patient &&
            patient.conversationState === client_1.ConversationState.UPLOAD_WAITING) {
            const activePatient = patient;
            await prisma_1.prisma.$transaction(mediaItems.map((item) => prisma_1.prisma.patientDocument.create({
                data: {
                    patientId: activePatient.id,
                    doctorId: doctor.id,
                    mediaUrl: item.url,
                    mediaContentType: item.contentType,
                    caption: bodyText || null,
                    sourceMessageId: item.mediaSid,
                },
            })));
            const acknowledgment = mediaItems.length === 1
                ? "Perfecto, guardé tu archivo."
                : `Perfecto, guardé ${mediaItems.length} archivos.`;
            const responseText = appendMenuHint(`${acknowledgment} Podés enviar otro o escribir \"menu\" para volver.`);
            try {
                const waResult = await (0, whatsapp_1.sendWhatsAppText)(phoneE164, responseText, doctorWhatsappConfig);
                await prisma_1.prisma.message.create({
                    data: {
                        waMessageId: (_c = waResult === null || waResult === void 0 ? void 0 : waResult.sid) !== null && _c !== void 0 ? _c : null,
                        from: doctorNumber,
                        to: phoneE164,
                        direction: "outgoing",
                        type: "text",
                        body: responseText,
                        rawPayload: waResult,
                        patientId: activePatient.id,
                        doctorId: doctor.id,
                    },
                });
            }
            catch (error) {
                console.error("[Twilio Webhook] Error enviando confirmación de documentos:", error);
            }
            return res.sendStatus(200);
        }
        if (!bodyText) {
            return res.sendStatus(200);
        }
        const preferenceDetection = detectPatientPreference(bodyText, DEFAULT_TIMEZONE);
        let preferenceUpdatedThisMessage = false;
        if (preferenceDetection) {
            const preferenceUpdate = {};
            if (preferenceDetection.day) {
                preferenceUpdate.preferredDayISO = preferenceDetection.day;
            }
            if (preferenceDetection.hourMinutes !== null) {
                preferenceUpdate.preferredHour = preferenceDetection.hourMinutes;
            }
            if (Object.keys(preferenceUpdate).length > 0) {
                patient = await prisma_1.prisma.patient.update({
                    where: { id: patient.id },
                    data: preferenceUpdate,
                });
                preferenceUpdatedThisMessage = true;
            }
        }
        const availableSlots = await getAvailableSlotsForDoctor(doctor.id);
        const slotAlignment = alignSlotsWithPreferenceForAgent(availableSlots, patient, DEFAULT_TIMEZONE);
        const slotsForAgent = slotAlignment.slotsForAgent;
        const activeAppointment = await prisma_1.prisma.appointment.findFirst({
            where: {
                patientId: patient.id,
                doctorId: doctor.id,
                dateTime: { gte: new Date() },
                status: { in: ["scheduled", "waiting", "confirmed"] },
            },
            orderBy: { dateTime: "asc" },
        });
        const activeAppointmentSummary = activeAppointment
            ? {
                id: activeAppointment.id,
                dateTime: activeAppointment.dateTime,
                humanLabel: formatSlotLabel(activeAppointment.dateTime, DEFAULT_TIMEZONE),
                status: activeAppointment.status,
            }
            : null;
        const historyRaw = await prisma_1.prisma.message.findMany({
            where: { patientId: patient.id },
            orderBy: { createdAt: "asc" },
            take: 20,
        });
        const recentMessages = historyRaw
            .map((m) => {
            var _a;
            return ({
                from: m.direction === "incoming" ? "patient" : "doctor",
                text: (_a = m.body) !== null && _a !== void 0 ? _a : "",
            });
        })
            .filter((m) => m.text.trim().length > 0);
        const flowResult = await (0, stateMachine_1.handleConversationFlow)({
            incomingText: bodyText,
            timezone: DEFAULT_TIMEZONE,
            businessType: doctor.businessType,
            patient: {
                id: patient.id,
                fullName: patient.fullName,
                dni: patient.dni,
                birthDate: patient.birthDate ? patient.birthDate.toISOString() : null,
                address: patient.address,
                conversationState: patient.conversationState,
                conversationStateData: (_d = patient.conversationStateData) !== null && _d !== void 0 ? _d : undefined,
                needsDni: patient.needsDni,
                needsName: patient.needsName,
                needsBirthDate: patient.needsBirthDate,
                needsAddress: patient.needsAddress,
                needsInsurance: patient.needsInsurance,
                needsConsultReason: patient.needsConsultReason,
                insuranceProvider: patient.insuranceProvider,
                consultReason: patient.consultReason,
            },
            availableSlots: slotsForAgent,
            activeAppointment: activeAppointmentSummary,
            findPatientByDni: async (dni) => prisma_1.prisma.patient.findFirst({
                where: { doctorId: doctor.id, dni },
                select: {
                    id: true,
                    fullName: true,
                    needsDni: true,
                    needsName: true,
                    needsBirthDate: true,
                    needsAddress: true,
                    needsInsurance: true,
                    needsConsultReason: true,
                },
            }),
        });
        if (flowResult.handled) {
            if (flowResult.mergeWithPatientId &&
                flowResult.mergeWithPatientId !== patient.id) {
                patient = await mergePatientRecords({
                    sourcePatientId: patient.id,
                    targetPatientId: flowResult.mergeWithPatientId,
                    phone: phoneE164,
                });
            }
            const updateData = {};
            if (flowResult.patientProfilePatch) {
                const patch = flowResult.patientProfilePatch;
                if (patch.fullName) {
                    updateData.fullName = patch.fullName;
                }
                if (patch.insuranceProvider !== undefined) {
                    updateData.insuranceProvider = patch.insuranceProvider;
                }
                if (patch.consultReason !== undefined) {
                    updateData.consultReason = patch.consultReason;
                }
                if (patch.dni !== undefined) {
                    updateData.dni = patch.dni;
                }
                if (patch.birthDate !== undefined) {
                    updateData.birthDate = patch.birthDate
                        ? new Date(patch.birthDate)
                        : null;
                }
                if (patch.address !== undefined) {
                    updateData.address = patch.address;
                }
                if (typeof patch.needsName === "boolean") {
                    updateData.needsName = patch.needsName;
                }
                if (typeof patch.needsDni === "boolean") {
                    updateData.needsDni = patch.needsDni;
                }
                if (typeof patch.needsBirthDate === "boolean") {
                    updateData.needsBirthDate = patch.needsBirthDate;
                }
                if (typeof patch.needsAddress === "boolean") {
                    updateData.needsAddress = patch.needsAddress;
                }
                if (typeof patch.needsInsurance === "boolean") {
                    updateData.needsInsurance = patch.needsInsurance;
                }
                if (typeof patch.needsConsultReason === "boolean") {
                    updateData.needsConsultReason = patch.needsConsultReason;
                }
            }
            updateData.conversationState = flowResult.nextState;
            if (flowResult.stateData !== undefined) {
                if (flowResult.stateData) {
                    updateData.conversationStateData = JSON.parse(JSON.stringify(flowResult.stateData));
                }
                else {
                    updateData.conversationStateData = client_1.Prisma.JsonNull;
                }
            }
            if (Object.keys(updateData).length) {
                patient = await prisma_1.prisma.patient.update({
                    where: { id: patient.id },
                    data: updateData,
                });
            }
            let outgoingMessage = formatMenuMessage(flowResult.reply, flowResult.menu);
            if (flowResult.bookingRequest) {
                const bookingOutcome = await processBookingRequest({
                    doctorId: doctor.id,
                    patient,
                    bookingRequest: flowResult.bookingRequest,
                    availableSlots: slotsForAgent,
                    timezone: DEFAULT_TIMEZONE,
                    fallbackReply: outgoingMessage,
                });
                patient = (_e = bookingOutcome.patient) !== null && _e !== void 0 ? _e : patient;
                outgoingMessage = bookingOutcome.message;
            }
            else if (flowResult.cancelRequest) {
                const cancelOutcome = await processCancelRequest({
                    doctorId: doctor.id,
                    patient,
                    cancelRequest: flowResult.cancelRequest,
                    fallbackReply: outgoingMessage,
                });
                patient = (_f = cancelOutcome.patient) !== null && _f !== void 0 ? _f : patient;
                outgoingMessage = cancelOutcome.message;
            }
            if (outgoingMessage) {
                const messageWithHint = appendMenuHint(outgoingMessage);
                try {
                    await (0, whatsapp_1.sendWhatsAppText)(phoneE164, messageWithHint, doctorWhatsappConfig);
                }
                catch (error) {
                    console.error("[Twilio Webhook] Error enviando respuesta:", error);
                }
            }
            return res.sendStatus(200);
        }
        const parsePrice = (value) => {
            if (!value)
                return null;
            const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".");
            const n = Number(cleaned);
            return Number.isFinite(n) ? n : null;
        };
        const consultationPrice = parsePrice((_g = doctor.consultFee) !== null && _g !== void 0 ? _g : null);
        const emergencyConsultationPrice = parsePrice((_h = doctor.emergencyFee) !== null && _h !== void 0 ? _h : null);
        const patientProfilePayload = {
            consultReason: (_j = patient.consultReason) !== null && _j !== void 0 ? _j : null,
            pendingSlotISO: patient.pendingSlotISO
                ? patient.pendingSlotISO.toISOString()
                : null,
            pendingSlotHumanLabel: (_k = patient.pendingSlotHumanLabel) !== null && _k !== void 0 ? _k : null,
            pendingSlotExpiresAt: patient.pendingSlotExpiresAt
                ? patient.pendingSlotExpiresAt.toISOString()
                : null,
            pendingSlotReason: (_l = patient.pendingSlotReason) !== null && _l !== void 0 ? _l : null,
            dni: (_m = patient.dni) !== null && _m !== void 0 ? _m : null,
            birthDate: patient.birthDate ? patient.birthDate.toISOString() : null,
            address: (_o = patient.address) !== null && _o !== void 0 ? _o : null,
            needsDni: patient.needsDni,
            needsName: patient.needsName,
            needsBirthDate: patient.needsBirthDate,
            needsAddress: patient.needsAddress,
            needsInsurance: patient.needsInsurance,
            needsConsultReason: patient.needsConsultReason,
            preferredDayISO: patient.preferredDayISO
                ? patient.preferredDayISO.toISOString()
                : null,
            preferredDayLabel: patient.preferredDayISO
                ? formatPreferredDayLabel(patient.preferredDayISO, DEFAULT_TIMEZONE)
                : null,
            preferredHourMinutes: typeof patient.preferredHour === "number" ? patient.preferredHour : null,
            preferredDayHasAvailability: patient.preferredDayISO instanceof Date
                ? slotAlignment.preferredDayMatches > 0
                : null,
        };
        const agentResult = await (0, ai_1.runWhatsappAgent)({
            text: bodyText,
            patientName: patient.fullName,
            patientPhone: patient.phone,
            doctorName: doctor.name,
            doctorId: doctor.id,
            businessType: doctor.businessType,
            timezone: DEFAULT_TIMEZONE,
            availableSlots: slotsForAgent,
            recentMessages,
            patientProfile: patientProfilePayload,
            doctorProfile: {
                specialty: (_p = doctor.specialty) !== null && _p !== void 0 ? _p : null,
                clinicName: (_q = doctor.clinicName) !== null && _q !== void 0 ? _q : null,
                officeAddress: (_r = doctor.clinicAddress) !== null && _r !== void 0 ? _r : null,
                officeCity: null,
                officeMapsUrl: null,
                officeDays: (_s = doctor.officeDays) !== null && _s !== void 0 ? _s : null,
                officeHours: (_t = doctor.officeHours) !== null && _t !== void 0 ? _t : null,
                contactPhone: (_u = doctor.contactPhone) !== null && _u !== void 0 ? _u : null,
                consultationPrice,
                emergencyConsultationPrice,
                additionalNotes: (_v = doctor.extraNotes) !== null && _v !== void 0 ? _v : null,
            },
        });
        if (!agentResult) {
            return res.sendStatus(200);
        }
        if (agentResult.profileUpdates) {
            const profileUpdates = agentResult.profileUpdates;
            const updateData = {};
            const normalizedName = normalizeAgentProvidedName(profileUpdates.name);
            if (normalizedName) {
                updateData.fullName = normalizedName;
                updateData.needsName = false;
            }
            if (profileUpdates.insurance) {
                const normalizedInsurance = (0, text_1.normalizeInsuranceAnswer)(profileUpdates.insurance) ||
                    profileUpdates.insurance.trim();
                if (normalizedInsurance) {
                    updateData.insuranceProvider = normalizedInsurance.slice(0, 120);
                    updateData.needsInsurance = false;
                }
            }
            if (profileUpdates.consultReason) {
                const normalizedReason = sanitizeReason(profileUpdates.consultReason, {
                    allowSchedulingLike: true,
                });
                if (normalizedReason) {
                    updateData.consultReason = normalizedReason;
                    updateData.needsConsultReason = false;
                }
            }
            if (profileUpdates.dni) {
                const normalizedDni = normalizeDniInput(profileUpdates.dni);
                if (normalizedDni) {
                    updateData.dni = normalizedDni;
                    updateData.needsDni = false;
                }
            }
            if (profileUpdates.birthDate) {
                const parsedBirthDate = parseBirthDateInput(profileUpdates.birthDate);
                if (parsedBirthDate) {
                    updateData.birthDate = parsedBirthDate;
                    updateData.needsBirthDate = false;
                }
            }
            if (profileUpdates.address) {
                const cleanedAddress = profileUpdates.address.trim();
                if (cleanedAddress.length >= 5) {
                    updateData.address = cleanedAddress.slice(0, 160);
                    updateData.needsAddress = false;
                }
            }
            if (Object.keys(updateData).length > 0) {
                patient = await prisma_1.prisma.patient.update({
                    where: { id: patient.id },
                    data: updateData,
                });
            }
        }
        const { replyToPatient, action } = agentResult;
        let outgoingMessage = replyToPatient;
        if (action.type === "LIST_SLOTS") {
            const preferenceState = {
                preferredDayISO: (_w = patient.preferredDayISO) !== null && _w !== void 0 ? _w : null,
                preferredHour: typeof patient.preferredHour === "number"
                    ? patient.preferredHour
                    : null,
            };
            const preferredSlot = (_z = (_x = pickBestSlotForPatient(action.slots, preferenceState, DEFAULT_TIMEZONE)) !== null && _x !== void 0 ? _x : (_y = action.slots) === null || _y === void 0 ? void 0 : _y[0]) !== null && _z !== void 0 ? _z : (agentResult.pendingSlotHint
                ? {
                    startISO: agentResult.pendingSlotHint.startISO,
                    humanLabel: agentResult.pendingSlotHint.humanLabel,
                }
                : null);
            if (preferredSlot) {
                const slotDate = new Date(preferredSlot.startISO);
                if (!isNaN(slotDate.getTime())) {
                    const pendingReason = sanitizeReason(action.reason, { allowSchedulingLike: true }) ||
                        sanitizeReason((_0 = agentResult.pendingSlotHint) === null || _0 === void 0 ? void 0 : _0.reason, {
                            allowSchedulingLike: true,
                        }) ||
                        sanitizeReason(patient.consultReason, {
                            allowSchedulingLike: true,
                        }) ||
                        sanitizeReason(bodyText) ||
                        patient.pendingSlotReason;
                    const pendingData = {
                        pendingSlotISO: slotDate,
                        pendingSlotHumanLabel: preferredSlot.humanLabel,
                        pendingSlotExpiresAt: addMinutes(new Date(), 30),
                        pendingSlotReason: pendingReason,
                    };
                    if (!preferenceUpdatedThisMessage) {
                        pendingData.preferredDayISO = startOfDayLocal(slotDate, DEFAULT_TIMEZONE);
                        pendingData.preferredHour = getMinutesOfDayLocal(slotDate, DEFAULT_TIMEZONE);
                    }
                    if (pendingReason) {
                        pendingData.consultReason = pendingReason;
                        pendingData.needsConsultReason = false;
                    }
                    patient = await prisma_1.prisma.patient.update({
                        where: { id: patient.id },
                        data: pendingData,
                    });
                }
            }
        }
        if (action.type === "CREATE_APPOINTMENT") {
            const pendingDataMissing = [];
            if (patient.needsDni)
                pendingDataMissing.push("tu DNI");
            if (patient.needsName)
                pendingDataMissing.push("tu nombre completo");
            if (patient.needsBirthDate)
                pendingDataMissing.push("tu fecha de nacimiento");
            if (patient.needsAddress)
                pendingDataMissing.push("tu dirección");
            if (patient.needsInsurance)
                pendingDataMissing.push("obra social/prepaga");
            if (patient.needsConsultReason)
                pendingDataMissing.push("el motivo de la consulta");
            if (pendingDataMissing.length) {
                outgoingMessage = `Antes de confirmar un turno necesito ${pendingDataMissing.length === 1
                    ? pendingDataMissing[0]
                    : `${pendingDataMissing.slice(0, -1).join(", ")} y ${pendingDataMissing[pendingDataMissing.length - 1]}`}. ¿Me lo compartís?`;
            }
            else {
                const matchingSlot = availableSlots.find((slot) => {
                    const slotTime = new Date(slot.startISO).getTime();
                    const actionTime = new Date(action.dateTimeISO).getTime();
                    return !Number.isNaN(slotTime) && slotTime === actionTime;
                });
                if (!matchingSlot) {
                    console.warn("[AI Turnos] Slot confirmado no coincide con disponibilidad", { requested: action.dateTimeISO });
                    outgoingMessage =
                        "Ese horario no figura como disponible en el sistema. Decime de nuevo qué día y horario te sirve y te paso los turnos correctos 😊.";
                }
                else {
                    const slotDate = new Date(matchingSlot.startISO);
                    if (isNaN(slotDate.getTime())) {
                        outgoingMessage =
                            "No pude confirmar ese turno porque la hora no es válida. Decime nuevamente el horario que te sirve.";
                    }
                    else {
                        const reason = sanitizeReason(action.reason, { allowSchedulingLike: true }) ||
                            sanitizeReason(patient.pendingSlotReason, {
                                allowSchedulingLike: true,
                            }) ||
                            sanitizeReason(patient.consultReason, {
                                allowSchedulingLike: true,
                            }) ||
                            sanitizeReason(bodyText) ||
                            "Consulta generada desde WhatsApp";
                        const preferenceState = {
                            preferredDayISO: (_1 = patient.preferredDayISO) !== null && _1 !== void 0 ? _1 : null,
                            preferredHour: typeof patient.preferredHour === "number"
                                ? patient.preferredHour
                                : null,
                        };
                        if (!isSlotAlignedWithPreference(preferenceState, slotDate, DEFAULT_TIMEZONE)) {
                            const preferenceDesc = describePatientPreference(preferenceState, DEFAULT_TIMEZONE);
                            const slotLabel = formatSlotLabel(slotDate, DEFAULT_TIMEZONE);
                            outgoingMessage = preferenceDesc
                                ? `Entendí que buscabas un turno ${preferenceDesc}, pero el horario disponible ahora es ${slotLabel}. ¿Te sirve igualmente o prefieres que busque otro?`
                                : `El horario disponible es ${slotLabel}. ¿Querés que lo confirme o busco otro?`;
                        }
                        else {
                            const existingFutureAppointment = await prisma_1.prisma.appointment.findFirst({
                                where: {
                                    doctorId: doctor.id,
                                    patientId: patient.id,
                                    status: { in: ["scheduled", "confirmed"] },
                                    dateTime: {
                                        gte: new Date(),
                                    },
                                },
                                orderBy: { dateTime: "asc" },
                            });
                            try {
                                if (existingFutureAppointment &&
                                    areDatesWithinSameMinute(existingFutureAppointment.dateTime, slotDate)) {
                                    await prisma_1.prisma.appointment.update({
                                        where: { id: existingFutureAppointment.id },
                                        data: {
                                            type: reason || existingFutureAppointment.type,
                                        },
                                    });
                                }
                                else {
                                    await prisma_1.prisma.appointment.create({
                                        data: {
                                            dateTime: slotDate,
                                            type: reason || "Consulta generada desde WhatsApp",
                                            status: "scheduled",
                                            price: 0,
                                            paid: false,
                                            source: "whatsapp",
                                            doctorId: doctor.id,
                                            patientId: patient.id,
                                        },
                                    });
                                    if (existingFutureAppointment) {
                                        await prisma_1.prisma.appointment.update({
                                            where: { id: existingFutureAppointment.id },
                                            data: {
                                                status: "cancelled_by_patient",
                                            },
                                        });
                                    }
                                }
                                patient = await prisma_1.prisma.patient.update({
                                    where: { id: patient.id },
                                    data: {
                                        consultReason: reason,
                                        needsConsultReason: !!reason
                                            ? false
                                            : patient.needsConsultReason,
                                        pendingSlotISO: null,
                                        pendingSlotHumanLabel: null,
                                        pendingSlotExpiresAt: null,
                                        pendingSlotReason: null,
                                        preferredDayISO: startOfDayLocal(slotDate, DEFAULT_TIMEZONE),
                                        preferredHour: getMinutesOfDayLocal(slotDate, DEFAULT_TIMEZONE),
                                    },
                                });
                            }
                            catch (error) {
                                console.error("[AI Turnos] Error creando turno:", error);
                                outgoingMessage =
                                    "Intenté registrar ese turno pero hubo un problema. Probemos con otro horario o avisame si querés que te derive a recepción.";
                            }
                        }
                    }
                }
            }
        }
        if (outgoingMessage) {
            const messageWithHint = appendMenuHint(outgoingMessage);
            try {
                const waResult = await (0, whatsapp_1.sendWhatsAppText)(phoneE164, messageWithHint, doctorWhatsappConfig);
                await prisma_1.prisma.message.create({
                    data: {
                        waMessageId: (_2 = waResult === null || waResult === void 0 ? void 0 : waResult.sid) !== null && _2 !== void 0 ? _2 : null,
                        from: doctorNumber,
                        to: phoneE164,
                        direction: "outgoing",
                        type: "text",
                        body: messageWithHint,
                        rawPayload: waResult,
                        patientId: patient.id,
                        doctorId: doctor.id,
                    },
                });
            }
            catch (error) {
                console.error("[Twilio Webhook] Error enviando respuesta del agente:", error);
            }
        }
        return res.sendStatus(200);
    }
    catch (error) {
        console.error("Error en webhook de Twilio:", error);
        return res.sendStatus(200);
    }
});
app.get("/api/documents", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
        const documents = await prisma_1.prisma.patientDocument.findMany({
            where: {
                doctorId,
                ...(search
                    ? {
                        patient: {
                            fullName: {
                                contains: search,
                            },
                        },
                    }
                    : {}),
            },
            include: {
                patient: {
                    select: {
                        id: true,
                        fullName: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        res.json({
            documents: documents.map((doc) => {
                var _a, _b;
                return ({
                    id: doc.id,
                    patientId: doc.patientId,
                    patientName: (_b = (_a = doc.patient) === null || _a === void 0 ? void 0 : _a.fullName) !== null && _b !== void 0 ? _b : "Paciente",
                    mediaUrl: doc.mediaUrl,
                    mediaContentType: doc.mediaContentType,
                    caption: doc.caption,
                    createdAt: doc.createdAt.toISOString(),
                    reviewedAt: doc.reviewedAt ? doc.reviewedAt.toISOString() : null,
                });
            }),
        });
    }
    catch (error) {
        console.error("Error en /api/documents:", error);
        res.status(500).json({
            error: "No pudimos obtener los documentos",
        });
    }
});
app.get("/api/documents/:id/download", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const documentId = Number(req.params.id);
        if (Number.isNaN(documentId)) {
            return res.status(400).json({ error: "documentId inválido" });
        }
        const document = await prisma_1.prisma.patientDocument.findFirst({
            where: {
                id: documentId,
                doctorId,
            },
        });
        if (!document) {
            return res.status(404).json({ error: "Documento no encontrado" });
        }
        if (!document.mediaUrl) {
            return res.status(400).json({ error: "El documento no tiene un archivo adjunto" });
        }
        if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
            return res.status(500).json({
                error: "Twilio no está configurado para descargar archivos.",
            });
        }
        const twilioResponse = await axios_1.default.get(document.mediaUrl, {
            responseType: "arraybuffer",
            auth: {
                username: TWILIO_ACCOUNT_SID,
                password: TWILIO_AUTH_TOKEN,
            },
        });
        const contentType = twilioResponse.headers["content-type"] ||
            document.mediaContentType ||
            "application/octet-stream";
        const extension = inferExtensionFromContentType(contentType);
        const filename = buildDocumentFilename(document.caption, document.id, extension);
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
        return res.send(Buffer.from(twilioResponse.data));
    }
    catch (error) {
        console.error("Error en /api/documents/:id/download:", error);
        return res.status(502).json({
            error: "No pudimos descargar el archivo desde Twilio. Probá nuevamente.",
        });
    }
});
app.post("/api/documents/:id/review", auth_1.authMiddleware, async (req, res) => {
    var _a, _b;
    try {
        const doctorId = req.doctorId;
        const documentId = Number(req.params.id);
        if (Number.isNaN(documentId)) {
            return res.status(400).json({ error: "documentId inválido" });
        }
        const document = await prisma_1.prisma.patientDocument.findFirst({
            where: {
                id: documentId,
                doctorId,
            },
        });
        if (!document) {
            return res.status(404).json({ error: "Documento no encontrado" });
        }
        if (document.reviewedAt) {
            return res.json({ reviewedAt: document.reviewedAt.toISOString() });
        }
        const updated = await prisma_1.prisma.patientDocument.update({
            where: { id: documentId },
            data: {
                reviewedAt: new Date(),
            },
            select: {
                reviewedAt: true,
            },
        });
        res.json({
            reviewedAt: (_b = (_a = updated.reviewedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null,
        });
    }
    catch (error) {
        console.error("Error en /api/documents/:id/review:", error);
        res.status(500).json({
            error: "No pudimos marcar el documento como revisado.",
        });
    }
});
app.get("/api/patients/:id/documents", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const patientId = Number(req.params.id);
        if (Number.isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        const documents = await prisma_1.prisma.patientDocument.findMany({
            where: {
                doctorId,
                patientId,
            },
            orderBy: { createdAt: "desc" },
        });
        res.json({
            documents: documents.map((doc) => ({
                id: doc.id,
                mediaUrl: doc.mediaUrl,
                mediaContentType: doc.mediaContentType,
                caption: doc.caption,
                createdAt: doc.createdAt.toISOString(),
            })),
        });
    }
    catch (error) {
        console.error("Error en /api/patients/:id/documents:", error);
        res.status(500).json({
            error: "No pudimos obtener los documentos del paciente",
        });
    }
});
function inferExtensionFromContentType(contentType) {
    if (!contentType)
        return "bin";
    const normalized = contentType.toLowerCase();
    if (normalized.includes("jpeg"))
        return "jpg";
    if (normalized.includes("png"))
        return "png";
    if (normalized.includes("pdf"))
        return "pdf";
    if (normalized.includes("gif"))
        return "gif";
    if (normalized.includes("mp4"))
        return "mp4";
    const parts = normalized.split("/");
    const subtype = parts[1] || "bin";
    const clean = subtype.split("+")[0].split(";")[0].replace(/[^a-z0-9]/g, "");
    return clean || "bin";
}
function buildDocumentFilename(caption, id, extension) {
    const base = (caption === null || caption === void 0 ? void 0 : caption.trim().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/gi, "").toLowerCase()) ||
        `documento_${id}`;
    return `${base}.${extension}`;
}
/**
 * Obtener perfil del doctor logueado
 * GET /api/me/profile
 *
 * Esta ruta devuelve los datos ya "normalizados" para el front
 * y para el agente (officeAddress, consultationPrice, etc.),
 * pero internamente lee de las columnas reales:
 * clinicAddress, consultFee, emergencyFee, extraNotes, etc.
 */
app.get("/api/me/profile", auth_1.authMiddleware, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const doctorId = req.doctorId;
        const doc = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
        });
        if (!doc) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        // Helper para convertir lo que tengas guardado en consultFee/emergencyFee a número
        const parsePrice = (value) => {
            if (!value)
                return null;
            const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".");
            const n = Number(cleaned);
            return Number.isFinite(n) ? n : null;
        };
        const consultationPrice = parsePrice(doc.consultFee);
        const emergencyConsultationPrice = parsePrice(doc.emergencyFee);
        res.json({
            id: doc.id,
            name: doc.name,
            email: doc.email,
            availabilityStatus: doc.availabilityStatus,
            profileImageUrl: (_a = doc.profileImageUrl) !== null && _a !== void 0 ? _a : null,
            // estos los mapeamos desde tus campos actuales
            specialty: (_b = doc.specialty) !== null && _b !== void 0 ? _b : null,
            clinicName: (_c = doc.clinicName) !== null && _c !== void 0 ? _c : null,
            officeAddress: (_d = doc.clinicAddress) !== null && _d !== void 0 ? _d : null,
            officeDays: (_e = doc.officeDays) !== null && _e !== void 0 ? _e : null,
            officeHours: (_f = doc.officeHours) !== null && _f !== void 0 ? _f : null,
            officeCity: null,
            officeMapsUrl: null,
            contactPhone: (_g = doc.contactPhone) !== null && _g !== void 0 ? _g : null,
            whatsappBusinessNumber: null,
            consultationPrice,
            emergencyConsultationPrice,
            bio: (_h = doc.extraNotes) !== null && _h !== void 0 ? _h : null,
            appointmentSlotMinutes: (_j = doc.appointmentSlotMinutes) !== null && _j !== void 0 ? _j : null,
        });
    }
    catch (error) {
        console.error("Error en /api/me/profile (GET):", error);
        res.status(500).json({ error: "Error al obtener perfil" });
    }
});
/**
 * Actualizar perfil del doctor logueado
 * PUT /api/me/profile
 *
 * Recibe el payload que manda el front (specialty, officeAddress,
 * consultationPrice, emergencyConsultationPrice, bio, etc.)
 * y lo guarda en las columnas existentes del modelo Doctor:
 * clinicAddress, consultFee, emergencyFee, extraNotes, etc.
 */
app.put("/api/me/profile", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const { specialty, clinicName, officeAddress, officeDays, officeHours, officeCity, // por ahora no lo persistimos
        officeMapsUrl, // por ahora no lo persistimos
        contactPhone, whatsappBusinessNumber, // por ahora no lo persistimos
        consultationPrice, emergencyConsultationPrice, bio, appointmentSlotMinutes, availabilityStatus, } = req.body;
        // Serializamos los precios a string para guardarlos en consultFee/emergencyFee
        const consultFee = typeof consultationPrice === "number" && !Number.isNaN(consultationPrice)
            ? String(consultationPrice)
            : null;
        const emergencyFee = typeof emergencyConsultationPrice === "number" &&
            !Number.isNaN(emergencyConsultationPrice)
            ? String(emergencyConsultationPrice)
            : null;
        const normalizedSlotInterval = normalizeSlotIntervalInput(appointmentSlotMinutes);
        const normalizedAvailabilityStatus = typeof availabilityStatus === "string"
            ? normalizeDoctorAvailabilityStatus(availabilityStatus)
            : null;
        const updateData = {
            specialty: specialty !== null && specialty !== void 0 ? specialty : null,
            clinicName: clinicName !== null && clinicName !== void 0 ? clinicName : null,
            // officeAddress del front → clinicAddress en la DB
            clinicAddress: officeAddress !== null && officeAddress !== void 0 ? officeAddress : null,
            officeDays: officeDays !== null && officeDays !== void 0 ? officeDays : null,
            officeHours: officeHours !== null && officeHours !== void 0 ? officeHours : null,
            contactPhone: contactPhone !== null && contactPhone !== void 0 ? contactPhone : null,
            consultFee,
            emergencyFee,
            // bio del front → extraNotes en la DB
            extraNotes: bio !== null && bio !== void 0 ? bio : null,
            appointmentSlotMinutes: normalizedSlotInterval,
        };
        if (normalizedAvailabilityStatus) {
            updateData.availabilityStatus = normalizedAvailabilityStatus;
        }
        const updated = await prisma_1.prisma.doctor.update({
            where: { id: doctorId },
            data: updateData,
        });
        res.json({ ok: true, doctor: updated });
    }
    catch (error) {
        console.error("Error en /api/me/profile (PUT):", error);
        res.status(500).json({ error: "Error al guardar perfil" });
    }
});
app.post("/api/me/profile/photo", auth_1.authMiddleware, async (req, res) => {
    var _a;
    try {
        const doctorId = req.doctorId;
        const imageBase64 = (_a = req.body) === null || _a === void 0 ? void 0 : _a.imageBase64;
        if (typeof imageBase64 !== "string" || !imageBase64.trim()) {
            return res.status(400).json({
                error: "Mandá la imagen en formato base64.",
            });
        }
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { profileImageUrl: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        const profileImageUrl = await saveProfileImageForDoctor(doctorId, imageBase64, doctor.profileImageUrl);
        await prisma_1.prisma.doctor.update({
            where: { id: doctorId },
            data: { profileImageUrl },
        });
        res.json({ profileImageUrl });
    }
    catch (error) {
        console.error("Error en POST /api/me/profile/photo:", error);
        res.status(500).json({
            error: (error === null || error === void 0 ? void 0 : error.message) || "No pudimos actualizar la foto de perfil.",
        });
    }
});
app.delete("/api/me/profile/photo", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { profileImageUrl: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        await removeProfileImageFile(doctor.profileImageUrl);
        await prisma_1.prisma.doctor.update({
            where: { id: doctorId },
            data: { profileImageUrl: null },
        });
        res.json({ profileImageUrl: null });
    }
    catch (error) {
        console.error("Error en DELETE /api/me/profile/photo:", error);
        res.status(500).json({
            error: "No pudimos eliminar la foto de perfil.",
        });
    }
});
/**
 * Listado simple de pacientes
 */
app.get("/api/patients", auth_1.authMiddleware, async (req, res) => {
    var _a;
    try {
        const doctorId = req.doctorId;
        const search = (_a = req.query.q) === null || _a === void 0 ? void 0 : _a.trim();
        const where = {
            doctorId,
        };
        if (search && search.length > 0) {
            where.AND = [
                {
                    OR: [
                        { fullName: { contains: search } },
                        { phone: { contains: search } },
                        { insuranceProvider: { contains: search } },
                        { consultReason: { contains: search } },
                    ],
                },
            ];
        }
        const patients = await prisma_1.prisma.patient.findMany({
            where,
            orderBy: { id: "desc" },
            take: 50,
            include: {
                tags: {
                    orderBy: { createdAt: "desc" },
                },
            },
        });
        res.json({
            patients: patients.map((patient) => ({
                ...patient,
                isProfileComplete: isPatientProfileComplete(patient),
                tags: patient.tags.map(serializePatientTag),
            })),
        });
    }
    catch (error) {
        console.error("Error en /api/patients:", error);
        res.status(500).json({
            error: "Error al obtener pacientes",
        });
    }
});
/**
 * Detalle de un paciente
 */
app.get("/api/patients/:id", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const patientId = Number(req.params.id);
        if (isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        const patient = await prisma_1.prisma.patient.findFirst({
            where: { id: patientId, doctorId },
            include: {
                appointments: {
                    where: { source: "whatsapp" },
                    orderBy: { dateTime: "desc" },
                    take: 50,
                },
                tags: {
                    orderBy: { createdAt: "desc" },
                },
            },
        });
        if (!patient) {
            return res.status(404).json({ error: "Paciente no encontrado" });
        }
        const consultations = (patient.appointments || []).map((appt) => ({
            id: appt.id,
            dateTime: appt.dateTime.toISOString(),
            type: appt.type,
            status: appt.status,
            price: appt.price,
            paid: appt.paid,
            paymentMethod: appt.paymentMethod,
            chargedAmount: appt.chargedAmount,
        }));
        return res.json({
            patient: {
                id: patient.id,
                fullName: patient.fullName,
                phone: patient.phone,
                dni: patient.dni,
                birthDate: patient.birthDate ? patient.birthDate.toISOString() : null,
                address: patient.address,
                occupation: patient.occupation,
                maritalStatus: patient.maritalStatus,
                insuranceProvider: patient.insuranceProvider,
                consultReason: patient.consultReason,
                isProfileComplete: isPatientProfileComplete(patient),
                needsDni: patient.needsDni,
                needsName: patient.needsName,
                needsBirthDate: patient.needsBirthDate,
                needsAddress: patient.needsAddress,
                needsInsurance: patient.needsInsurance,
                needsConsultReason: patient.needsConsultReason,
                tags: patient.tags.map(serializePatientTag),
            },
            consultations,
        });
    }
    catch (error) {
        console.error("Error en /api/patients/:id:", error);
        res.status(500).json({
            error: "Error al obtener el detalle del paciente",
        });
    }
});
app.put("/api/patients/:id/profile", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const patientId = Number(req.params.id);
        if (Number.isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        const patient = await prisma_1.prisma.patient.findFirst({
            where: { id: patientId, doctorId },
        });
        if (!patient) {
            return res.status(404).json({ error: "Paciente no encontrado" });
        }
        const { fullName, phone, dni, birthDate, address, insuranceProvider, occupation, maritalStatus, } = req.body;
        const updateData = {};
        if (typeof fullName === "string") {
            const trimmed = fullName.trim();
            updateData.fullName = trimmed || patient.fullName;
            if (trimmed) {
                updateData.needsName = false;
            }
        }
        if (typeof phone === "string") {
            updateData.phone = phone.trim() || null;
        }
        if (typeof dni === "string") {
            const trimmed = dni.trim();
            updateData.dni = trimmed || null;
            updateData.needsDni = trimmed ? false : patient.needsDni;
        }
        if (birthDate !== undefined) {
            if (!birthDate) {
                updateData.birthDate = null;
            }
            else {
                const parsed = parseBirthDateInput(birthDate);
                if (!parsed) {
                    return res.status(400).json({
                        error: "La fecha de nacimiento no tiene un formato válido",
                    });
                }
                updateData.birthDate = parsed;
                updateData.needsBirthDate = false;
            }
        }
        if (typeof address === "string") {
            const trimmed = address.trim();
            updateData.address = trimmed || null;
            if (trimmed) {
                updateData.needsAddress = false;
            }
        }
        if (typeof insuranceProvider === "string") {
            const trimmed = insuranceProvider.trim();
            updateData.insuranceProvider = trimmed || null;
            if (trimmed) {
                updateData.needsInsurance = false;
            }
        }
        if (typeof occupation === "string") {
            updateData.occupation = occupation.trim() || null;
        }
        if (typeof maritalStatus === "string") {
            updateData.maritalStatus = maritalStatus.trim() || null;
        }
        const updated = await prisma_1.prisma.patient.update({
            where: { id: patientId },
            data: updateData,
            include: {
                tags: {
                    orderBy: { createdAt: "desc" },
                },
            },
        });
        return res.json({
            patient: {
                id: updated.id,
                fullName: updated.fullName,
                phone: updated.phone,
                dni: updated.dni,
                birthDate: updated.birthDate ? updated.birthDate.toISOString() : null,
                address: updated.address,
                occupation: updated.occupation,
                maritalStatus: updated.maritalStatus,
                insuranceProvider: updated.insuranceProvider,
                consultReason: updated.consultReason,
                isProfileComplete: isPatientProfileComplete(updated),
                needsDni: updated.needsDni,
                needsName: updated.needsName,
                needsBirthDate: updated.needsBirthDate,
                needsAddress: updated.needsAddress,
                needsInsurance: updated.needsInsurance,
                needsConsultReason: updated.needsConsultReason,
                tags: updated.tags.map(serializePatientTag),
            },
        });
    }
    catch (error) {
        console.error("Error en PUT /api/patients/:id/profile:", error);
        res.status(500).json({
            error: "No pudimos actualizar la ficha del paciente.",
        });
    }
});
app.get("/api/patients/:id/summary", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const patientId = Number(req.params.id);
        if (isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        const patient = await prisma_1.prisma.patient.findFirst({
            where: { id: patientId, doctorId },
            include: {
                appointments: {
                    where: { source: "whatsapp" },
                    orderBy: { dateTime: "desc" },
                    take: 10,
                },
                notes: {
                    orderBy: { createdAt: "desc" },
                    take: 20,
                },
                tags: {
                    orderBy: { createdAt: "desc" },
                },
            },
        });
        if (!patient) {
            return res.status(404).json({ error: "Paciente no encontrado" });
        }
        const summary = await (0, patientSummary_1.generatePatientSummary)({
            patient: {
                fullName: patient.fullName,
                consultReason: patient.consultReason,
                tags: patient.tags.map((tag) => ({
                    label: tag.label,
                    severity: tag.severity,
                })),
            },
            consultations: patient.appointments.map((appt) => ({
                dateTime: appt.dateTime,
                type: appt.type,
                status: appt.status,
            })),
            notes: patient.notes.map((note) => ({
                content: note.content,
                createdAt: note.createdAt,
            })),
        });
        res.json({ summary });
    }
    catch (error) {
        console.error("Error en /api/patients/:id/summary:", error);
        res.status(500).json({
            error: "Error al generar el resumen del paciente",
        });
    }
});
app.get("/api/patients/:id/history/narrative", auth_1.authMiddleware, async (req, res) => {
    var _a;
    try {
        const doctorId = req.doctorId;
        const patientId = Number(req.params.id);
        if (isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        const patient = await prisma_1.prisma.patient.findFirst({
            where: { id: patientId, doctorId },
            include: {
                doctor: { select: { name: true } },
                tags: { orderBy: { createdAt: "asc" } },
                appointments: {
                    orderBy: { dateTime: "desc" },
                    take: 100,
                },
                notes: {
                    orderBy: { createdAt: "desc" },
                    take: 50,
                },
                documents: {
                    orderBy: { createdAt: "desc" },
                    take: 20,
                },
            },
        });
        if (!patient) {
            return res.status(404).json({ error: "Paciente no encontrado" });
        }
        const narrative = await (0, patientSummary_1.generateClinicalHistoryNarrative)({
            doctorName: ((_a = patient.doctor) === null || _a === void 0 ? void 0 : _a.name) || null,
            patient: {
                fullName: patient.fullName,
                consultReason: patient.consultReason,
                tags: patient.tags.map((tag) => ({
                    label: tag.label,
                    severity: tag.severity,
                })),
                phone: patient.phone,
                birthDate: patient.birthDate,
                address: patient.address,
                insuranceProvider: patient.insuranceProvider,
                occupation: patient.occupation,
                maritalStatus: patient.maritalStatus,
                dni: patient.dni,
            },
            consultations: patient.appointments.map((appt) => ({
                dateTime: appt.dateTime,
                type: appt.type,
                status: appt.status,
                paymentMethod: appt.paymentMethod,
                chargedAmount: appt.chargedAmount,
            })),
            notes: patient.notes.map((note) => ({
                content: note.content,
                createdAt: note.createdAt,
            })),
            documents: patient.documents.map((doc) => ({
                caption: doc.caption,
                mediaContentType: doc.mediaContentType,
                createdAt: doc.createdAt,
            })),
        });
        res.json({
            narrative,
            generatedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error("Error en /api/patients/:id/history/narrative:", error);
        res.status(500).json({
            error: "No pudimos generar la historia clínica con IA",
        });
    }
});
app.get("/api/patients/:id/notes", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const patientId = Number(req.params.id);
        if (isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        const patient = await prisma_1.prisma.patient.findFirst({
            where: { id: patientId, doctorId },
            select: { id: true },
        });
        if (!patient) {
            return res.status(404).json({ error: "Paciente no encontrado" });
        }
        const notes = await prisma_1.prisma.patientNote.findMany({
            where: { patientId, doctorId },
            orderBy: { createdAt: "desc" },
            take: 100,
        });
        res.json({
            notes: notes.map((note) => ({
                id: note.id,
                content: note.content,
                createdAt: note.createdAt.toISOString(),
            })),
        });
    }
    catch (error) {
        console.error("Error en /api/patients/:id/notes (GET):", error);
        res.status(500).json({
            error: "Error al obtener las notas del paciente",
        });
    }
});
app.post("/api/patients/:id/notes", auth_1.authMiddleware, async (req, res) => {
    var _a;
    try {
        const doctorId = req.doctorId;
        const patientId = Number(req.params.id);
        if (isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        const content = normalizeNoteInput((_a = req.body) === null || _a === void 0 ? void 0 : _a.content);
        if (!content) {
            return res
                .status(400)
                .json({ error: "Necesitamos una nota con al menos un carácter." });
        }
        const patient = await prisma_1.prisma.patient.findFirst({
            where: { id: patientId, doctorId },
            select: { id: true },
        });
        if (!patient) {
            return res.status(404).json({ error: "Paciente no encontrado" });
        }
        const note = await prisma_1.prisma.patientNote.create({
            data: {
                content,
                patientId,
                doctorId,
            },
            select: {
                id: true,
                content: true,
                createdAt: true,
            },
        });
        res.json({
            note: {
                id: note.id,
                content: note.content,
                createdAt: note.createdAt.toISOString(),
            },
        });
    }
    catch (error) {
        console.error("Error en /api/patients/:id/notes (POST):", error);
        res.status(500).json({
            error: "No pudimos guardar la nota. Intentá de nuevo.",
        });
    }
});
app.post("/api/patients/:id/tags", auth_1.authMiddleware, async (req, res) => {
    var _a, _b;
    try {
        const doctorId = req.doctorId;
        const patientId = Number(req.params.id);
        if (isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        const label = sanitizePatientTagLabel((_a = req.body) === null || _a === void 0 ? void 0 : _a.label);
        if (!label) {
            return res
                .status(400)
                .json({ error: "Necesitamos un texto de al menos 2 caracteres." });
        }
        const severity = normalizePatientTagSeverity((_b = req.body) === null || _b === void 0 ? void 0 : _b.severity);
        const patient = await prisma_1.prisma.patient.findFirst({
            where: { id: patientId, doctorId },
            select: { id: true },
        });
        if (!patient) {
            return res.status(404).json({ error: "Paciente no encontrado" });
        }
        const tag = await prisma_1.prisma.patientTag.create({
            data: {
                label,
                severity,
                patientId,
                doctorId,
            },
        });
        res.json({ tag: serializePatientTag(tag) });
    }
    catch (error) {
        console.error("Error en /api/patients/:id/tags (POST):", error);
        res.status(500).json({
            error: "No pudimos guardar la etiqueta. Intentá nuevamente.",
        });
    }
});
app.delete("/api/patients/:patientId/tags/:tagId", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const patientId = Number(req.params.patientId);
        const tagId = Number(req.params.tagId);
        if (isNaN(patientId) || isNaN(tagId)) {
            return res.status(400).json({ error: "Parámetros inválidos" });
        }
        const tag = await prisma_1.prisma.patientTag.findFirst({
            where: { id: tagId, patientId, doctorId },
        });
        if (!tag) {
            return res.status(404).json({ error: "Etiqueta no encontrada" });
        }
        await prisma_1.prisma.patientTag.delete({
            where: { id: tagId },
        });
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Error en DELETE /api/patients/:id/tags:", error);
        res.status(500).json({
            error: "No pudimos eliminar la etiqueta. Intentá nuevamente.",
        });
    }
});
app.get("/api/patient-tags", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const segments = await prisma_1.prisma.patientTag.groupBy({
            by: ["label", "severity"],
            where: { doctorId },
            _count: {
                _all: true,
            },
            orderBy: {
                label: "asc",
            },
        });
        res.json({
            segments: segments.map((segment) => {
                var _a, _b;
                return ({
                    label: segment.label,
                    severity: segment.severity,
                    count: (_b = (_a = segment._count) === null || _a === void 0 ? void 0 : _a._all) !== null && _b !== void 0 ? _b : 0,
                });
            }),
        });
    }
    catch (error) {
        console.error("Error en /api/patient-tags:", error);
        res.status(500).json({
            error: "No pudimos obtener las etiquetas.",
        });
    }
});
/**
 * Historial de mensajes de un paciente
 */
app.get("/api/patients/:id/messages", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const patientId = Number(req.params.id);
        if (isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        const patient = await prisma_1.prisma.patient.findFirst({
            where: { id: patientId, doctorId },
        });
        if (!patient) {
            return res.status(404).json({ error: "Paciente no encontrado" });
        }
        const messages = await prisma_1.prisma.message.findMany({
            where: { patientId: patient.id, doctorId },
            orderBy: { createdAt: "asc" },
        });
        res.json({ messages });
    }
    catch (error) {
        console.error("Error en /api/patients/:id/messages:", error);
        res.status(500).json({
            error: "Error al obtener mensajes del paciente",
        });
    }
});
app.get("/api/inbox", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const now = new Date();
        const appointmentRecentThreshold = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2);
        const [documents, newAppointments, incompletePatients] = await Promise.all([
            prisma_1.prisma.patientDocument.findMany({
                where: {
                    doctorId,
                    reviewedAt: null,
                },
                include: {
                    patient: {
                        select: { id: true, fullName: true },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: 25,
            }),
            prisma_1.prisma.appointment.findMany({
                where: {
                    doctorId,
                    status: { in: ["scheduled", "waiting"] },
                    createdAt: {
                        gte: appointmentRecentThreshold,
                    },
                },
                include: {
                    patient: {
                        select: { id: true, fullName: true, insuranceProvider: true },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: 25,
            }),
            prisma_1.prisma.patient.findMany({
                where: {
                    doctorId,
                    OR: [
                        { needsDni: true },
                        { needsName: true },
                        { needsBirthDate: true },
                        { needsAddress: true },
                        { needsInsurance: true },
                        { needsConsultReason: true },
                    ],
                },
                orderBy: { createdAt: "desc" },
                take: 25,
            }),
        ]);
        res.json({
            documents: documents.map((doc) => {
                var _a, _b;
                return ({
                    id: doc.id,
                    patientId: doc.patientId,
                    patientName: (_b = (_a = doc.patient) === null || _a === void 0 ? void 0 : _a.fullName) !== null && _b !== void 0 ? _b : "Paciente",
                    caption: doc.caption,
                    mediaContentType: doc.mediaContentType,
                    createdAt: doc.createdAt.toISOString(),
                });
            }),
            newAppointments: newAppointments.map((appt) => {
                var _a, _b;
                return ({
                    id: appt.id,
                    patientId: appt.patientId,
                    patientName: (_b = (_a = appt.patient) === null || _a === void 0 ? void 0 : _a.fullName) !== null && _b !== void 0 ? _b : "Paciente sin nombre",
                    dateTimeISO: appt.dateTime.toISOString(),
                    status: appt.status,
                    type: appt.type,
                    createdAt: appt.createdAt.toISOString(),
                });
            }),
            incompletePatients: incompletePatients.map((patient) => {
                var _a, _b, _c, _d, _e;
                return ({
                    id: patient.id,
                    fullName: patient.fullName,
                    phone: patient.phone,
                    createdAt: (_c = (_b = (_a = patient.createdAt) === null || _a === void 0 ? void 0 : _a.toISOString) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : null,
                    missingFields: [
                        patient.needsDni ? "DNI" : null,
                        patient.needsName ? "Nombre completo" : null,
                        patient.needsBirthDate ? "Fecha de nacimiento" : null,
                        patient.needsAddress ? "Dirección" : null,
                        patient.needsInsurance ? "Obra social" : null,
                        patient.needsConsultReason ? "Motivo" : null,
                        !((_d = patient.occupation) === null || _d === void 0 ? void 0 : _d.trim()) ? "Ocupación" : null,
                        !((_e = patient.maritalStatus) === null || _e === void 0 ? void 0 : _e.trim()) ? "Estado civil" : null,
                    ].filter(Boolean),
                });
            }),
        });
    }
    catch (error) {
        console.error("Error en /api/inbox:", error);
        res.status(500).json({ error: "No pudimos obtener los pendientes." });
    }
});
app.post("/api/appointments/:id/status", auth_1.authMiddleware, async (req, res) => {
    var _a, _b, _c;
    try {
        const doctorId = req.doctorId;
        const appointmentId = Number(req.params.id);
        if (isNaN(appointmentId)) {
            return res.status(400).json({ error: "appointmentId inválido" });
        }
        const nextStatus = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) || "").toLowerCase();
        const allowedStatuses = ["completed", "incomplete"];
        if (!allowedStatuses.includes(nextStatus)) {
            return res.status(400).json({
                error: "Estado no permitido. Usa 'completed' o 'incomplete'.",
            });
        }
        const appointment = await prisma_1.prisma.appointment.findFirst({
            where: { id: appointmentId, doctorId },
        });
        if (!appointment) {
            return res.status(404).json({ error: "Turno no encontrado" });
        }
        let paymentMethod = null;
        let chargedAmount = null;
        if (nextStatus === "completed") {
            const paymentRaw = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.paymentMethod) === "string"
                ? req.body.paymentMethod
                : "";
            const amountRaw = (_c = req.body) === null || _c === void 0 ? void 0 : _c.chargedAmount;
            if (!ALLOWED_PAYMENT_METHODS.includes(paymentRaw)) {
                return res.status(400).json({
                    error: "Método de pago inválido. Usá 'cash' o 'transfer_card'.",
                });
            }
            const parsedAmount = typeof amountRaw === "number"
                ? amountRaw
                : typeof amountRaw === "string"
                    ? Number(amountRaw)
                    : NaN;
            if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
                return res.status(400).json({
                    error: "El monto cobrado debe ser un número mayor o igual a 0.",
                });
            }
            paymentMethod = paymentRaw;
            chargedAmount = Math.round(parsedAmount);
        }
        const updateData = {
            status: nextStatus,
        };
        if (nextStatus === "completed") {
            updateData.paymentMethod = paymentMethod;
            updateData.chargedAmount = chargedAmount;
            updateData.price = chargedAmount !== null && chargedAmount !== void 0 ? chargedAmount : appointment.price;
            updateData.paid = (chargedAmount !== null && chargedAmount !== void 0 ? chargedAmount : 0) > 0;
        }
        else if (nextStatus === "incomplete") {
            updateData.paymentMethod = null;
            updateData.chargedAmount = null;
            updateData.paid = false;
        }
        const updated = await prisma_1.prisma.appointment.update({
            where: { id: appointmentId },
            data: updateData,
            select: {
                id: true,
                status: true,
                paymentMethod: true,
                chargedAmount: true,
                price: true,
                paid: true,
            },
        });
        res.json(updated);
    }
    catch (error) {
        console.error("Error en /api/appointments/:id/status:", error);
        res.status(500).json({
            error: "No pudimos actualizar el estado de la consulta",
        });
    }
});
/**
 * Agenda de turnos (vista calendario)
 */
app.get("/api/appointments/schedule", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const startParam = req.query.start;
        const endParam = req.query.end;
        const includeCancelled = req.query.includeCancelled === "true";
        const start = startParam ? new Date(startParam) : new Date();
        if (isNaN(start.getTime())) {
            return res.status(400).json({ error: "start inválido" });
        }
        start.setSeconds(0, 0);
        const end = endParam ? new Date(endParam) : addMinutes(new Date(start), 7 * 24 * 60);
        if (isNaN(end.getTime())) {
            return res.status(400).json({ error: "end inválido" });
        }
        const appointments = await prisma_1.prisma.appointment.findMany({
            where: {
                doctorId,
                ...(includeCancelled
                    ? {}
                    : {
                        status: {
                            notIn: NON_BLOCKING_APPOINTMENT_STATUSES,
                        },
                    }),
                dateTime: {
                    gte: start,
                    lte: end,
                },
            },
            include: {
                patient: true,
            },
            orderBy: {
                dateTime: "asc",
            },
        });
        const payload = appointments.map((appt) => {
            var _a;
            return ({
                id: appt.id,
                dateTime: appt.dateTime.toISOString(),
                type: appt.type,
                status: appt.status,
                source: appt.source,
                chargedAmount: appt.chargedAmount,
                price: appt.price,
                paymentMethod: appt.paymentMethod,
                patient: appt.patient
                    ? {
                        id: appt.patient.id,
                        fullName: appt.patient.fullName,
                        insuranceProvider: (_a = appt.patient.insuranceProvider) !== null && _a !== void 0 ? _a : null,
                    }
                    : {
                        id: null,
                        fullName: "Paciente sin nombre",
                        insuranceProvider: null,
                    },
            });
        });
        res.json({ appointments: payload });
    }
    catch (error) {
        console.error("Error en /api/appointments/schedule:", error);
        res.status(500).json({
            error: "Error al obtener la agenda",
        });
    }
});
app.get("/api/appointments/available", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const slots = await getAvailableSlotsForDoctor(doctorId);
        res.json({ slots });
    }
    catch (error) {
        console.error("Error en /api/appointments/available:", error);
        res.status(500).json({
            error: "Error al obtener la disponibilidad",
        });
    }
});
app.post("/api/appointments/:id/reschedule", auth_1.authMiddleware, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        const doctorId = req.doctorId;
        const appointmentId = Number(req.params.id);
        const { dateTimeISO, reason } = req.body;
        if (!appointmentId || isNaN(appointmentId)) {
            return res.status(400).json({ error: "appointmentId inválido" });
        }
        if (!dateTimeISO) {
            return res.status(400).json({ error: "Falta dateTimeISO" });
        }
        const newDate = new Date(dateTimeISO);
        if (isNaN(newDate.getTime())) {
            return res.status(400).json({ error: "dateTimeISO inválido" });
        }
        const appointment = await prisma_1.prisma.appointment.findFirst({
            where: { id: appointmentId, doctorId },
            include: {
                patient: true,
                doctor: {
                    select: {
                        whatsappBusinessNumber: true,
                        name: true,
                    },
                },
            },
        });
        if (!appointment) {
            return res.status(404).json({ error: "Turno no encontrado" });
        }
        const conflict = await prisma_1.prisma.appointment.findFirst({
            where: {
                doctorId,
                id: { not: appointmentId },
                status: {
                    notIn: NON_BLOCKING_APPOINTMENT_STATUSES,
                },
                dateTime: newDate,
            },
        });
        if (conflict) {
            return res.status(409).json({
                error: "Ese horario ya está ocupado. Elegí otra opción.",
            });
        }
        const sanitizedReason = (_b = (_a = sanitizeReason(reason, { allowSchedulingLike: true })) === null || _a === void 0 ? void 0 : _a.slice(0, 200)) !== null && _b !== void 0 ? _b : null;
        const updated = await prisma_1.prisma.appointment.update({
            where: { id: appointmentId },
            data: {
                dateTime: newDate,
                status: "rescheduled",
            },
            include: {
                patient: true,
            },
        });
        if (updated.patientId) {
            await prisma_1.prisma.patient.update({
                where: { id: updated.patientId },
                data: {
                    pendingSlotISO: null,
                    pendingSlotHumanLabel: null,
                    pendingSlotExpiresAt: null,
                    pendingSlotReason: null,
                    preferredDayISO: startOfDayLocal(newDate, DEFAULT_TIMEZONE),
                    preferredHour: getMinutesOfDayLocal(newDate, DEFAULT_TIMEZONE),
                },
            });
        }
        const slotLabel = formatSlotLabel(newDate, DEFAULT_TIMEZONE);
        let messageSent = false;
        if (((_c = updated.patient) === null || _c === void 0 ? void 0 : _c.phone) && ((_d = appointment.doctor) === null || _d === void 0 ? void 0 : _d.whatsappBusinessNumber)) {
            const whatsMessage = `Tu turno fue reprogramado para ${slotLabel}${sanitizedReason ? ` por el siguiente motivo: ${sanitizedReason}` : ""}.`;
            try {
                await (0, whatsapp_1.sendWhatsAppText)(updated.patient.phone, whatsMessage, {
                    from: appointment.doctor.whatsappBusinessNumber,
                });
                messageSent = true;
            }
            catch (error) {
                console.error("[Reschedule] Error enviando notificación de WhatsApp:", error);
            }
        }
        res.json({
            appointment: {
                id: updated.id,
                dateTime: updated.dateTime.toISOString(),
                status: updated.status,
                type: updated.type,
                patient: {
                    id: updated.patientId,
                    fullName: (_f = (_e = updated.patient) === null || _e === void 0 ? void 0 : _e.fullName) !== null && _f !== void 0 ? _f : "Paciente sin nombre",
                    insuranceProvider: (_h = (_g = updated.patient) === null || _g === void 0 ? void 0 : _g.insuranceProvider) !== null && _h !== void 0 ? _h : null,
                },
            },
            messageSent,
        });
    }
    catch (error) {
        console.error("Error en POST /api/appointments/:id/reschedule:", error);
        res.status(500).json({
            error: "No pudimos reprogramar el turno",
        });
    }
});
app.get("/api/appointments/:id", auth_1.authMiddleware, async (req, res) => {
    var _a;
    try {
        const doctorId = req.doctorId;
        const appointmentId = Number(req.params.id);
        if (!appointmentId || isNaN(appointmentId)) {
            return res.status(400).json({ error: "appointmentId inválido" });
        }
        const appointment = await prisma_1.prisma.appointment.findFirst({
            where: { id: appointmentId, doctorId },
            include: {
                patient: true,
            },
        });
        if (!appointment) {
            return res.status(404).json({ error: "Turno no encontrado" });
        }
        return res.json({
            appointment: {
                id: appointment.id,
                dateTime: appointment.dateTime.toISOString(),
                status: appointment.status,
                type: appointment.type,
                source: appointment.source,
                patient: appointment.patient
                    ? {
                        id: appointment.patient.id,
                        fullName: appointment.patient.fullName,
                        insuranceProvider: (_a = appointment.patient.insuranceProvider) !== null && _a !== void 0 ? _a : null,
                    }
                    : {
                        id: null,
                        fullName: "Paciente sin nombre",
                        insuranceProvider: null,
                    },
            },
        });
    }
    catch (error) {
        console.error("Error en GET /api/appointments/:id:", error);
        res.status(500).json({
            error: "Error al obtener el turno",
        });
    }
});
function normalizeDniInput(value) {
    if (!value)
        return null;
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 10) {
        return null;
    }
    return digits;
}
function parseBirthDateInput(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]);
        const day = Number(isoMatch[3]);
        if (month >= 1 &&
            month <= 12 &&
            day >= 1 &&
            day <= 31 &&
            year >= 1900) {
            const result = new Date(Date.UTC(year, month - 1, day));
            if (result.getUTCFullYear() === year &&
                result.getUTCMonth() === month - 1 &&
                result.getUTCDate() === day &&
                result <= new Date()) {
                return result;
            }
        }
    }
    const match = trimmed.match(/(\d{1,2})[\/\-\.\s]+(\d{1,2})[\/\-\.\s]+(\d{2,4})/);
    if (!match)
        return null;
    let day = Number(match[1]);
    let month = Number(match[2]);
    let year = Number(match[3]);
    if (Number.isNaN(day) ||
        Number.isNaN(month) ||
        Number.isNaN(year) ||
        day < 1 ||
        day > 31 ||
        month < 1 ||
        month > 12) {
        return null;
    }
    if (year < 100) {
        year += year >= 40 ? 1900 : 2000;
    }
    if (year < 1900)
        return null;
    const result = new Date(Date.UTC(year, month - 1, day));
    if (result.getUTCFullYear() !== year ||
        result.getUTCMonth() !== month - 1 ||
        result.getUTCDate() !== day) {
        return null;
    }
    if (result > new Date()) {
        return null;
    }
    return result;
}
function isPatientProfileComplete(patient) {
    var _a, _b, _c, _d, _e, _f, _g;
    const birthValue = typeof patient.birthDate === "string"
        ? patient.birthDate
        : (_a = patient.birthDate) === null || _a === void 0 ? void 0 : _a.toISOString();
    return Boolean(((_b = patient.fullName) === null || _b === void 0 ? void 0 : _b.trim()) &&
        ((_c = patient.dni) === null || _c === void 0 ? void 0 : _c.trim()) &&
        birthValue &&
        ((_d = patient.address) === null || _d === void 0 ? void 0 : _d.trim()) &&
        ((_e = patient.insuranceProvider) === null || _e === void 0 ? void 0 : _e.trim()) &&
        ((_f = patient.occupation) === null || _f === void 0 ? void 0 : _f.trim()) &&
        ((_g = patient.maritalStatus) === null || _g === void 0 ? void 0 : _g.trim()));
}
async function mergePatientRecords({ sourcePatientId, targetPatientId, phone, }) {
    if (sourcePatientId === targetPatientId) {
        return prisma_1.prisma.patient.findUniqueOrThrow({
            where: { id: targetPatientId },
        });
    }
    await prisma_1.prisma.message.updateMany({
        where: { patientId: sourcePatientId },
        data: { patientId: targetPatientId },
    });
    await prisma_1.prisma.appointment.updateMany({
        where: { patientId: sourcePatientId },
        data: { patientId: targetPatientId },
    });
    await prisma_1.prisma.patientNote.updateMany({
        where: { patientId: sourcePatientId },
        data: { patientId: targetPatientId },
    });
    await prisma_1.prisma.patientDocument.updateMany({
        where: { patientId: sourcePatientId },
        data: { patientId: targetPatientId },
    });
    await prisma_1.prisma.patientTag.updateMany({
        where: { patientId: sourcePatientId },
        data: { patientId: targetPatientId },
    });
    await prisma_1.prisma.patient.delete({
        where: { id: sourcePatientId },
    });
    if (phone) {
        await prisma_1.prisma.patient.update({
            where: { id: targetPatientId },
            data: { phone },
        });
    }
    return prisma_1.prisma.patient.findUniqueOrThrow({
        where: { id: targetPatientId },
    });
}
// Levantamos el servidor
app.listen(PORT, () => {
    console.log(`✅ Backend escuchando en http://localhost:${PORT}`);
});
app.post("/api/admin/whatsapp-numbers", requireAdminKey, async (req, res) => {
    try {
        const { displayPhoneNumber, status, } = req.body;
        if (!displayPhoneNumber) {
            return res.status(400).json({
                error: "Falta el número de WhatsApp",
            });
        }
        const normalizedStatus = status === "assigned"
            ? "assigned"
            : status === "reserved"
                ? "reserved"
                : "available";
        const normalizedNumber = normalizeWhatsappSender(displayPhoneNumber);
        const number = await prisma_1.prisma.whatsAppNumber.upsert({
            where: { displayPhoneNumber: normalizedNumber },
            update: {
                displayPhoneNumber: normalizedNumber,
                status: normalizedStatus,
                ...(normalizedStatus === "available"
                    ? { assignedDoctorId: null }
                    : {}),
            },
            create: {
                displayPhoneNumber: normalizedNumber,
                status: normalizedStatus,
            },
        });
        res.json(number);
    }
    catch (error) {
        console.error("Error en POST /api/admin/whatsapp-numbers:", error);
        res
            .status(500)
            .json({ error: "Error al registrar número de WhatsApp" });
    }
});
app.get("/api/admin/whatsapp-numbers", requireAdminKey, async (_req, res) => {
    try {
        const numbers = await prisma_1.prisma.whatsAppNumber.findMany({
            orderBy: { createdAt: "asc" },
            include: {
                assignedDoctor: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
        res.json(numbers);
    }
    catch (error) {
        console.error("Error en GET /api/admin/whatsapp-numbers:", error);
        res
            .status(500)
            .json({ error: "Error al listar números de WhatsApp" });
    }
});
app.get("/api/admin/services/status", requireAdminKey, async (_req, res) => {
    try {
        const [openaiStatus, twilioStatus] = await Promise.all([
            (0, ai_1.checkOpenAIConnectivity)(),
            (0, whatsapp_1.checkTwilioConnectivity)(),
        ]);
        const now = new Date().toISOString();
        res.json({
            openai: { ...openaiStatus, checkedAt: now },
            twilio: { ...twilioStatus, checkedAt: now },
        });
    }
    catch (error) {
        console.error("Error en GET /api/admin/services/status:", error);
        res.status(500).json({
            error: "No pudimos verificar el estado de los servicios.",
        });
    }
});
