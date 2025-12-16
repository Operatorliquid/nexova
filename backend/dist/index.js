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
const openai_1 = __importDefault(require("openai"));
const client_1 = require("@prisma/client");
const text_1 = require("./utils/text");
const patientSummary_1 = require("./services/patientSummary");
const stateMachine_1 = require("./conversation/stateMachine");
const retail_1 = require("./handlers/retail");
const health_1 = require("./handlers/health");
const retail_2 = require("./utils/retail");
const hints_1 = require("./utils/hints");
const automationRetail_1 = require("./agents/automationRetail");
const proofExtractor_1 = require("./retail/proofExtractor");
const app = (0, express_1.default)();
const UPLOADS_DIR = path_1.default.join(__dirname, "..", "uploads");
const DOCTOR_UPLOADS_DIR = path_1.default.join(UPLOADS_DIR, "doctors");
const PRODUCT_UPLOADS_DIR = path_1.default.join(UPLOADS_DIR, "products");
const ORDER_UPLOADS_DIR = path_1.default.join(UPLOADS_DIR, "orders");
const PROMOTION_UPLOADS_DIR = path_1.default.join(UPLOADS_DIR, "promotions");
const fsp = fs_1.default.promises;
ensureDirectory(UPLOADS_DIR);
ensureDirectory(DOCTOR_UPLOADS_DIR);
ensureDirectory(PRODUCT_UPLOADS_DIR);
ensureDirectory(ORDER_UPLOADS_DIR);
ensureDirectory(PROMOTION_UPLOADS_DIR);
const PORT = process.env.PORT || 4000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || null;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const APP_BASE_URL = process.env.APP_BASE_URL ||
    process.env.PUBLIC_URL ||
    process.env.BASE_URL ||
    `http://localhost:${PORT}`;
const allowAnyOrigin = CORS_ORIGINS.includes("*");
const automationOpenAIClient = process.env.OPENAI_API_KEY
    ? new openai_1.default({ apiKey: process.env.OPENAI_API_KEY })
    : null;
const MIN_DHASH_SIMILARITY = 10; // hamming distance threshold
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
const PRODUCT_CATEGORY_OPTIONS = [
    { key: "beverages", label: "Bebidas" },
    { key: "food", label: "Comidas" },
    { key: "coca_line", label: "Línea Coca" },
    { key: "manaos_line", label: "Línea Manaos" },
    { key: "snacks", label: "Galletitas & Snacks" },
    { key: "bakery", label: "Panificados" },
    { key: "cleaning", label: "Limpieza" },
    { key: "personal_care", label: "Cuidado personal" },
];
const PRODUCT_CATEGORY_SET = new Set(PRODUCT_CATEGORY_OPTIONS.map((option) => option.key));
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
function serializeProductTagRecord(tag) {
    return {
        id: tag.id,
        label: tag.label,
        severity: tag.severity,
        createdAt: tag.createdAt.toISOString(),
    };
}
function serializeProduct(product) {
    return {
        id: product.id,
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        price: product.price,
        quantity: product.quantity,
        doctorId: product.doctorId,
        categories: Array.isArray(product.categories)
            ? product.categories
            : [],
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
        tags: (product.tags || []).map(serializeProductTagRecord),
    };
}
function serializeOrderRecord(order) {
    return {
        id: order.id,
        sequenceNumber: order.sequenceNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paidAmount: order.paidAmount,
        totalAmount: order.totalAmount,
        customerName: order.customerName,
        customerAddress: order.customerAddress,
        customerDni: order.customerDni,
        createdAt: order.createdAt,
        promotions: (order.promotions || []).map((promo) => ({
            id: promo.id,
            title: promo.title,
            discountType: promo.discountType,
            discountValue: promo.discountValue,
        })),
        items: (order.items || []).map((item) => {
            var _a, _b, _c;
            return ({
                id: item.id,
                productId: item.productId,
                productName: (_c = (_b = (_a = item.product) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : item.productName) !== null && _c !== void 0 ? _c : "Producto",
                quantity: item.quantity,
                unitPrice: item.unitPrice,
            });
        }),
        attachments: (order.attachments || []).map((att) => ({
            id: att.id,
            url: att.url,
            filename: att.filename || null,
            mimeType: att.mimeType,
            createdAt: att.createdAt,
        })),
    };
}
function sanitizeProductName(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    return trimmed.slice(0, 120);
}
function sanitizeOptionalText(value, maxLength = 1000) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    return trimmed.slice(0, maxLength);
}
function parseNonNegativeInteger(value) {
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            return null;
        return Math.max(0, Math.round(value));
    }
    if (typeof value === "string") {
        const cleaned = value.replace(/[^\d.,-]/g, "").replace(",", ".");
        if (!cleaned)
            return null;
        const parsed = Number(cleaned);
        if (!Number.isFinite(parsed))
            return null;
        return Math.max(0, Math.round(parsed));
    }
    return null;
}
function sanitizeProductCategories(input) {
    if (!Array.isArray(input))
        return [];
    const result = [];
    const seen = new Set();
    for (const entry of input) {
        if (typeof entry !== "string")
            continue;
        const trimmed = entry.trim();
        if (!trimmed)
            continue;
        const lower = trimmed.toLowerCase();
        const allowedKey = PRODUCT_CATEGORY_SET.has(lower) ? lower : null;
        const value = allowedKey !== null && allowedKey !== void 0 ? allowedKey : trimmed
            .slice(0, 40)
            .replace(/\s+/g, " ")
            .trim();
        if (!value)
            continue;
        const dedupeKey = value.toLowerCase();
        if (seen.has(dedupeKey))
            continue;
        seen.add(dedupeKey);
        result.push(value);
        if (result.length >= 12)
            break;
    }
    return result;
}
const MAX_IMAGE_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_IMAGE_MIME_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
]);
const MAX_ATTACHMENT_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
    ...ALLOWED_IMAGE_MIME_TYPES,
    "application/pdf",
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
    if (windows.length === 0) {
        const fallbackTimes = [];
        const fallbackRegex = /(\d{1,2})(?::(\d{2}))?/g;
        let fallbackMatch;
        while ((fallbackMatch = fallbackRegex.exec(normalized)) &&
            fallbackTimes.length < 8) {
            const minutes = parseTimeToMinutes(fallbackMatch[1], fallbackMatch[2], null);
            if (minutes !== null) {
                fallbackTimes.push(minutes);
            }
        }
        for (let i = 0; i + 1 < fallbackTimes.length; i += 2) {
            const startMinute = fallbackTimes[i];
            const endMinute = fallbackTimes[i + 1];
            if (endMinute > startMinute) {
                windows.push({ startMinute, endMinute });
            }
        }
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
        const sanitized = token.replace(/[^a-z]/g, "");
        if (!sanitized || sanitized === "y" || sanitized === "al" || sanitized === "a") {
            return;
        }
        let idx = dayMap[sanitized];
        if (idx === undefined && sanitized.endsWith("s") && sanitized.length > 3) {
            idx = dayMap[sanitized.slice(0, -1)];
        }
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
async function removeUploadedFile(relativeUrl) {
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
    if (mime.includes("pdf"))
        return "pdf";
    return "jpg";
}
function buildImageValidationError(message) {
    const error = new Error(message);
    error.code = "IMAGE_VALIDATION_ERROR";
    return error;
}
function parseBase64ImageInput(imageBase64) {
    const trimmed = (imageBase64 || "").trim();
    if (!trimmed) {
        throw buildImageValidationError("No recibí la imagen a guardar.");
    }
    const dataUriMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    const mime = dataUriMatch ? dataUriMatch[1] : "image/png";
    const base64Payload = dataUriMatch ? dataUriMatch[2] : trimmed;
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
        throw buildImageValidationError("Formato de imagen no soportado. Subí PNG, JPG o WEBP.");
    }
    const buffer = Buffer.from(base64Payload, "base64");
    if (!buffer.length) {
        throw buildImageValidationError("La imagen no tiene datos válidos.");
    }
    if (buffer.length > MAX_IMAGE_UPLOAD_BYTES) {
        throw buildImageValidationError("La imagen es demasiado pesada. Usá un archivo de hasta 2 MB.");
    }
    const extension = detectExtensionFromMime(mime);
    return { buffer, extension };
}
function parseBase64AttachmentInput(fileBase64) {
    const trimmed = (fileBase64 || "").trim();
    if (!trimmed) {
        throw buildImageValidationError("No recibí el archivo a guardar.");
    }
    const dataUriMatch = trimmed.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
    const mime = dataUriMatch ? dataUriMatch[1] : "application/octet-stream";
    const base64Payload = dataUriMatch ? dataUriMatch[2] : trimmed;
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(mime)) {
        throw buildImageValidationError("Formato no soportado. Subí imagen o PDF.");
    }
    const buffer = Buffer.from(base64Payload, "base64");
    if (!buffer.length) {
        throw buildImageValidationError("El archivo no tiene datos válidos.");
    }
    if (buffer.length > MAX_ATTACHMENT_UPLOAD_BYTES) {
        throw buildImageValidationError("El archivo es demasiado pesado (máx 5 MB).");
    }
    const extension = detectExtensionFromMime(mime);
    return { buffer, extension, mime };
}
async function saveProfileImageForDoctor(doctorId, imageBase64, previousUrl) {
    const { buffer, extension } = parseBase64ImageInput(imageBase64);
    const filename = `doctor-${doctorId}-${Date.now()}.${extension}`;
    const destination = path_1.default.join(DOCTOR_UPLOADS_DIR, filename);
    await fsp.writeFile(destination, buffer);
    const relativeUrl = `/uploads/doctors/${filename}`;
    if (previousUrl) {
        await removeUploadedFile(previousUrl);
    }
    return relativeUrl;
}
async function saveProductImage(productId, imageBase64) {
    const { buffer, extension } = parseBase64ImageInput(imageBase64);
    const filename = `product-${productId}-${Date.now()}.${extension}`;
    const destination = path_1.default.join(PRODUCT_UPLOADS_DIR, filename);
    await fsp.writeFile(destination, buffer);
    return `/uploads/products/${filename}`;
}
async function saveOrderAttachmentFile(orderId, fileBase64, originalName) {
    const { buffer, extension, mime } = parseBase64AttachmentInput(fileBase64);
    const filename = `order-${orderId}-${Date.now()}.${extension}`;
    const destination = path_1.default.join(ORDER_UPLOADS_DIR, filename);
    await fsp.writeFile(destination, buffer);
    const cleanedName = sanitizeOptionalText(originalName, 120) || `Comprobante ${orderId}`;
    return {
        url: `/uploads/orders/${filename}`,
        filename: cleanedName,
        mime,
    };
}
async function saveOrderAttachmentBuffer(buffer, mime, originalName) {
    const extension = (0, proofExtractor_1.guessExt)(mime);
    const filename = `order-${Date.now()}-${Math.floor(Math.random() * 10000)}.${extension}`;
    const destination = path_1.default.join(ORDER_UPLOADS_DIR, filename);
    await fsp.writeFile(destination, buffer);
    const cleanedName = sanitizeOptionalText(originalName, 120) || `Comprobante ${filename}`;
    return {
        url: `/uploads/orders/${filename}`,
        filename: cleanedName,
        mime,
    };
}
async function savePromotionImage(doctorId, imageBase64) {
    const { buffer, extension } = parseBase64ImageInput(imageBase64);
    const filename = `promo-${doctorId}-${Date.now()}.${extension}`;
    const destination = path_1.default.join(PROMOTION_UPLOADS_DIR, filename);
    await fsp.writeFile(destination, buffer);
    return `/uploads/promotions/${filename}`;
}
function buildPublicUrl(value) {
    if (!value)
        return null;
    if (/^https?:\/\//i.test(value))
        return value;
    const base = (APP_BASE_URL === null || APP_BASE_URL === void 0 ? void 0 : APP_BASE_URL.replace(/\/+$/, "")) || "";
    if (value.startsWith("/"))
        return `${base}${value}`;
    return `${base}/${value}`;
}
function buildPublicUrlFromRequest(value, req) {
    if (!value)
        return null;
    if (/^https?:\/\//i.test(value))
        return value;
    const envOrigin = (APP_BASE_URL === null || APP_BASE_URL === void 0 ? void 0 : APP_BASE_URL.replace(/\/+$/, "")) || "";
    const host = req.get("host");
    const reqOrigin = host ? `${req.protocol}://${host}` : "";
    const origin = envOrigin || reqOrigin;
    const path = value.startsWith("/") ? value : `/${value}`;
    return origin ? `${origin}${path}` : null;
}
function isLikelyPublicUrl(url) {
    if (!url)
        return false;
    if (!/^https?:\/\//i.test(url))
        return false;
    return !/localhost|127\.0\.0\.1|\.local/i.test(url);
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
function extractWhatsappError(error) {
    var _a, _b, _c, _d, _e, _f;
    if (!error)
        return null;
    const data = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data;
    const messageCandidates = [
        data === null || data === void 0 ? void 0 : data.message,
        typeof (data === null || data === void 0 ? void 0 : data.error) === "string" ? data.error : null,
        (_b = data === null || data === void 0 ? void 0 : data.error) === null || _b === void 0 ? void 0 : _b.message,
        data === null || data === void 0 ? void 0 : data.error_message,
        data === null || data === void 0 ? void 0 : data.detail,
        data === null || data === void 0 ? void 0 : data.more_info,
        error === null || error === void 0 ? void 0 : error.message,
    ];
    const message = messageCandidates.find((value) => typeof value === "string" && value.trim().length > 0) || null;
    return {
        message,
        code: (_d = (_c = data === null || data === void 0 ? void 0 : data.code) !== null && _c !== void 0 ? _c : data === null || data === void 0 ? void 0 : data.error_code) !== null && _d !== void 0 ? _d : null,
        status: (_f = (_e = error === null || error === void 0 ? void 0 : error.response) === null || _e === void 0 ? void 0 : _e.status) !== null && _f !== void 0 ? _f : null,
    };
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
    var _a, _b;
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
                ticketLogoUrl: (_b = doctor.ticketLogoUrl) !== null && _b !== void 0 ? _b : null,
            },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Error al registrar usuario",
        });
    }
});
/**
 * Login de doctor
 * POST /api/auth/login
 */
app.post("/api/auth/login", async (req, res) => {
    var _a, _b;
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
                ticketLogoUrl: (_b = doctor.ticketLogoUrl) !== null && _b !== void 0 ? _b : null,
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
    var _a, _b, _c, _d;
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0, 0);
        if (doctor.businessType === "RETAIL") {
            const [pedidosHoyCount, pedidosConfirmadosCount, ingresosHoyAgg, clientesHoyGroup, pendingOrdersToday,] = await Promise.all([
                prisma_1.prisma.order.count({
                    where: {
                        doctorId,
                        createdAt: {
                            gte: startOfToday,
                            lte: endOfToday,
                        },
                    },
                }),
                prisma_1.prisma.order.count({
                    where: {
                        doctorId,
                        status: "confirmed",
                        createdAt: {
                            gte: startOfToday,
                            lte: endOfToday,
                        },
                    },
                }),
                prisma_1.prisma.order.aggregate({
                    _sum: { paidAmount: true },
                    where: {
                        doctorId,
                        paymentStatus: "paid",
                        createdAt: {
                            gte: startOfToday,
                            lte: endOfToday,
                        },
                    },
                }),
                prisma_1.prisma.order.groupBy({
                    by: ["clientId"],
                    where: {
                        doctorId,
                        createdAt: {
                            gte: startOfToday,
                            lte: endOfToday,
                        },
                    },
                    _count: { _all: true },
                }),
                prisma_1.prisma.order.findMany({
                    where: {
                        doctorId,
                        status: "pending",
                        createdAt: {
                            gte: startOfToday,
                            lte: endOfToday,
                        },
                    },
                    include: { client: true },
                    orderBy: { createdAt: "asc" },
                }),
            ]);
            const ingresosHoy = (_a = ingresosHoyAgg._sum.paidAmount) !== null && _a !== void 0 ? _a : 0;
            const clientesHoy = clientesHoyGroup.filter((g) => g.clientId != null).length;
            return res.json({
                stats: {
                    consultasHoy: 0,
                    pacientesEnEspera: 0,
                    ingresosMes: 0,
                    pacientesRecurrentesPorcentaje: 0,
                },
                agendaHoy: [],
                pagos: {
                    cobradoHoy: 0,
                    pendiente: 0,
                },
                retailStats: {
                    pedidosHoy: pedidosHoyCount,
                    pedidosConfirmadosHoy: pedidosConfirmadosCount,
                    ingresosHoy,
                    clientesHoy,
                },
                pendingOrdersToday: pendingOrdersToday.map((o) => {
                    var _a;
                    return ({
                        id: o.id,
                        sequenceNumber: o.sequenceNumber,
                        clientName: o.customerName || ((_a = o.client) === null || _a === void 0 ? void 0 : _a.fullName) || "Cliente",
                        status: o.status,
                        createdAt: o.createdAt.toISOString(),
                        totalAmount: o.totalAmount,
                    });
                }),
            });
        }
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
        const ingresosMes = (_b = ingresosMesAgg._sum.chargedAmount) !== null && _b !== void 0 ? _b : 0;
        const cobradoHoy = (_c = pagosHoyAgg._sum.chargedAmount) !== null && _c !== void 0 ? _c : 0;
        const pendiente = (_d = pagosPendAgg._sum.price) !== null && _d !== void 0 ? _d : 0;
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
/**
 * Métricas para comercios (pedidos)
 * GET /api/commerce/metrics?start=ISO&end=ISO
 */
app.get("/api/commerce/metrics", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(400).json({ error: "Métricas disponibles solo para comercios" });
        }
        const start = req.query.start ? new Date(String(req.query.start)) : new Date();
        const end = req.query.end ? new Date(String(req.query.end)) : new Date();
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return res.status(400).json({ error: "Rango de fechas inválido" });
        }
        const orders = await prisma_1.prisma.order.findMany({
            where: {
                doctorId,
                createdAt: {
                    gte: start,
                    lte: end,
                },
            },
            include: {
                items: {
                    include: { product: true },
                },
                client: true,
                promotions: true,
            },
        });
        const totals = {
            total: orders.length,
            pending: 0,
            confirmed: 0,
            cancelled: 0,
        };
        let paidRevenue = 0;
        let totalRevenue = 0;
        let outstanding = 0;
        let partialOutstanding = 0;
        const clientsSet = new Set();
        const fallbackClients = new Set();
        const productAgg = new Map();
        const clientAgg = new Map();
        const daily = new Map();
        const promoUsage = new Map();
        let ordersWithPromo = 0;
        let totalDiscountEstimate = 0;
        orders.forEach((order) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            const paid = (_a = order.paidAmount) !== null && _a !== void 0 ? _a : 0;
            totalRevenue += (_b = order.totalAmount) !== null && _b !== void 0 ? _b : 0;
            paidRevenue += paid;
            const remaining = Math.max(((_c = order.totalAmount) !== null && _c !== void 0 ? _c : 0) - paid, 0);
            if (order.paymentStatus === "partial") {
                partialOutstanding += remaining;
            }
            else if (order.paymentStatus !== "paid") {
                outstanding += remaining || order.totalAmount || 0;
            }
            if (order.status === "pending")
                totals.pending += 1;
            else if (order.status === "confirmed")
                totals.confirmed += 1;
            else if (order.status === "cancelled")
                totals.cancelled += 1;
            if (order.clientId)
                clientsSet.add(order.clientId);
            else if (order.customerName)
                fallbackClients.add(order.customerName.trim());
            const dayKey = order.createdAt.toISOString().slice(0, 10);
            const dayEntry = daily.get(dayKey) || { orders: 0, paid: 0, total: 0 };
            dayEntry.orders += 1;
            dayEntry.paid += paid;
            dayEntry.total += (_d = order.totalAmount) !== null && _d !== void 0 ? _d : 0;
            daily.set(dayKey, dayEntry);
            order.items.forEach((item) => {
                var _a, _b, _c;
                const name = ((_a = item.product) === null || _a === void 0 ? void 0 : _a.name) || "Producto";
                const current = productAgg.get(item.productId) || {
                    name,
                    quantity: 0,
                    revenue: 0,
                };
                current.quantity += item.quantity;
                current.revenue += item.quantity * item.unitPrice;
                productAgg.set(item.productId, current);
                // estimación de descuento aplicado (precio de lista vs unitPrice)
                const basePrice = (_c = (_b = item.product) === null || _b === void 0 ? void 0 : _b.price) !== null && _c !== void 0 ? _c : item.unitPrice;
                const discountPerUnit = Math.max(0, basePrice - item.unitPrice);
                totalDiscountEstimate += discountPerUnit * item.quantity;
            });
            if (order.promotions && order.promotions.length > 0) {
                ordersWithPromo += 1;
                order.promotions.forEach((promo) => {
                    const current = promoUsage.get(promo.id) || {
                        title: promo.title || "Promo",
                        uses: 0,
                    };
                    current.uses += 1;
                    promoUsage.set(promo.id, current);
                });
            }
            // Top compradores
            const clientKey = order.clientId
                ? `client-${order.clientId}`
                : order.customerName
                    ? `name-${order.customerName.trim()}`
                    : `order-${order.id}`;
            const displayName = ((_f = (_e = order.client) === null || _e === void 0 ? void 0 : _e.fullName) === null || _f === void 0 ? void 0 : _f.trim()) ||
                ((_g = order.customerName) === null || _g === void 0 ? void 0 : _g.trim()) ||
                "Cliente";
            const clientEntry = clientAgg.get(clientKey) || {
                key: clientKey,
                name: displayName,
                phone: ((_h = order.client) === null || _h === void 0 ? void 0 : _h.phone) || null,
                orders: 0,
                paidAmount: 0,
                totalAmount: 0,
            };
            clientEntry.orders += 1;
            clientEntry.paidAmount += paid;
            clientEntry.totalAmount += (_j = order.totalAmount) !== null && _j !== void 0 ? _j : 0;
            clientAgg.set(clientKey, clientEntry);
        });
        const uniqueClients = clientsSet.size || fallbackClients.size;
        const products = Array.from(productAgg.values());
        const bestProduct = products.length > 0
            ? products.slice().sort((a, b) => b.quantity - a.quantity)[0]
            : null;
        const worstProduct = products.length > 0
            ? products
                .filter((p) => p.quantity > 0)
                .slice()
                .sort((a, b) => a.quantity - b.quantity)[0] || null
            : null;
        const dailySeries = Array.from(daily.entries())
            .map(([date, info]) => ({
            date,
            orders: info.orders,
            paid: info.paid,
            total: info.total,
        }))
            .sort((a, b) => a.date.localeCompare(b.date));
        const avgTicketPaid = totals.confirmed > 0 ? Math.round(paidRevenue / totals.confirmed) : 0;
        const topPromo = promoUsage.size > 0
            ? Array.from(promoUsage.entries())
                .sort((a, b) => b[1].uses - a[1].uses)[0]
            : null;
        const topClients = Array.from(clientAgg.values())
            .sort((a, b) => b.paidAmount - a.paidAmount || b.totalAmount - a.totalAmount)
            .slice(0, 10)
            .map((c) => ({
            name: c.name,
            phone: c.phone || null,
            orders: c.orders,
            paidAmount: Math.round(c.paidAmount),
            totalAmount: Math.round(c.totalAmount),
            payRate: c.totalAmount > 0 ? Math.max(0, Math.min(1, c.paidAmount / c.totalAmount)) : 0,
        }));
        res.json({
            totals,
            revenue: {
                paid: paidRevenue,
                total: totalRevenue,
                outstanding,
                partialOutstanding,
                avgTicketPaid,
            },
            clients: {
                unique: uniqueClients,
            },
            products: {
                best: bestProduct,
                worst: worstProduct,
            },
            daily: dailySeries,
            promotions: {
                appliedOrders: ordersWithPromo,
                totalDiscount: Math.round(totalDiscountEstimate),
                top: topPromo && topPromo[1]
                    ? { id: topPromo[0], title: topPromo[1].title, uses: topPromo[1].uses }
                    : null,
            },
            topClients,
        });
    }
    catch (error) {
        console.error("[Retail metrics]", error);
        res.status(500).json({ error: "Error al obtener métricas" });
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
app.get("/api/whatsapp/numbers", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: req.doctorId },
            select: { businessType: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        const targetBusinessType = doctor.businessType === "RETAIL" ? "RETAIL" : "HEALTH";
        const numbers = await prisma_1.prisma.whatsAppNumber.findMany({
            where: {
                status: "available",
                businessType: targetBusinessType,
            },
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
            select: {
                businessType: true,
                whatsappStatus: true,
                whatsappBusinessNumber: true,
                whatsappConnectedAt: true,
            },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        if (doctor.whatsappStatus === "connected" &&
            doctor.whatsappBusinessNumber) {
            return res.json(buildWhatsappStatusPayload(doctor));
        }
        const targetBusinessType = doctor.businessType === "RETAIL" ? "RETAIL" : "HEALTH";
        let availableNumber = null;
        if (whatsappNumberId) {
            availableNumber = await prisma_1.prisma.whatsAppNumber.findUnique({
                where: { id: whatsappNumberId },
            });
            if (!availableNumber ||
                availableNumber.status !== "available" ||
                availableNumber.businessType !== targetBusinessType) {
                return res.status(400).json({
                    error: "Ese número ya no está disponible. Elegí otro.",
                });
            }
        }
        else {
            availableNumber = await prisma_1.prisma.whatsAppNumber.findFirst({
                where: { status: "available", businessType: targetBusinessType },
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const doctorId = req.doctorId;
        const { patientId, patientName, patientPhone, dateTime, type, price, } = req.body;
        if (!dateTime || !type) {
            return res.status(400).json({
                error: "Faltan campos: dateTime o type",
            });
        }
        const parsedDate = new Date(dateTime);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                error: "dateTime no tiene un formato válido (usar ISO, ej: 2025-12-01T14:30:00)",
            });
        }
        let patientRecord = null;
        if (patientId) {
            const numericId = Number(patientId);
            if (Number.isNaN(numericId)) {
                return res.status(400).json({
                    error: "patientId inválido",
                });
            }
            patientRecord = await prisma_1.prisma.patient.findFirst({
                where: { id: numericId, doctorId },
            });
            if (!patientRecord) {
                return res
                    .status(404)
                    .json({ error: "Paciente no encontrado para este doctor" });
            }
        }
        else {
            if (!patientName) {
                return res.status(400).json({
                    error: "Falta patientName para crear un nuevo paciente",
                });
            }
            patientRecord = await prisma_1.prisma.patient.create({
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
        }
        let finalPrice = null;
        if (typeof price === "number" && !Number.isNaN(price)) {
            finalPrice = price;
        }
        else {
            const doctor = await prisma_1.prisma.doctor.findUnique({
                where: { id: doctorId },
                select: { consultFee: true },
            });
            if (doctor === null || doctor === void 0 ? void 0 : doctor.consultFee) {
                const cleaned = doctor.consultFee
                    .replace(/[^\d.,]/g, "")
                    .replace(",", ".");
                const parsed = Number(cleaned);
                finalPrice = Number.isFinite(parsed) ? parsed : null;
            }
        }
        const appointment = await prisma_1.prisma.appointment.create({
            data: {
                dateTime: parsedDate,
                type,
                status: "scheduled",
                price: finalPrice !== null && finalPrice !== void 0 ? finalPrice : 0,
                paid: false,
                source: "dashboard",
                doctorId,
                patientId: patientRecord.id,
            },
            include: {
                patient: true,
            },
        });
        let whatsappNotification = null;
        if (appointment.patient.phone) {
            try {
                const doctorWhatsapp = await requireDoctorWhatsapp(doctorId);
                const patientFirstName = ((_a = appointment.patient.fullName) === null || _a === void 0 ? void 0 : _a.split(" ")[0]) || "Hola";
                const dateLabel = appointment.dateTime.toLocaleDateString("es-AR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "2-digit",
                });
                const timeLabel = appointment.dateTime.toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                });
                const confirmationMessage = `${patientFirstName}, tu turno fue reservado para el ${dateLabel} a las ${timeLabel}. Motivo: ${appointment.type}. Si necesitás reprogramar o cancelar, respondé este mensaje.`;
                const waResult = await (0, whatsapp_1.sendWhatsAppText)(appointment.patient.phone, confirmationMessage, {
                    from: doctorWhatsapp.whatsappBusinessNumber,
                });
                const waId = (_g = (_d = (_c = (_b = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : (_f = (_e = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.message_id) !== null && _g !== void 0 ? _g : null;
                const businessFrom = getDoctorBusinessNumber(doctorWhatsapp);
                await prisma_1.prisma.message.create({
                    data: {
                        waMessageId: waId,
                        from: businessFrom,
                        to: appointment.patient.phone,
                        direction: "outgoing",
                        type: "text",
                        body: confirmationMessage,
                        rawPayload: waResult,
                        patientId: appointment.patient.id,
                        doctorId,
                    },
                });
                whatsappNotification = { sent: true };
            }
            catch (error) {
                const waError = extractWhatsappError(error);
                console.error("Error enviando confirmación de turno manual:", ((_h = error === null || error === void 0 ? void 0 : error.response) === null || _h === void 0 ? void 0 : _h.data) || error);
                whatsappNotification = {
                    sent: false,
                    error: (waError === null || waError === void 0 ? void 0 : waError.message) ||
                        (error === null || error === void 0 ? void 0 : error.message) ||
                        "No pudimos notificar por WhatsApp.",
                };
            }
        }
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
                phone: (_j = appointment.patient.phone) !== null && _j !== void 0 ? _j : null,
            },
            whatsappNotification,
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
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
        const waError = extractWhatsappError(error);
        return res.status(500).json({
            error: "No se pudo enviar el recordatorio de turno",
            detail: (waError === null || waError === void 0 ? void 0 : waError.message) || (error === null || error === void 0 ? void 0 : error.message) || String(error),
            twilioCode: (_h = waError === null || waError === void 0 ? void 0 : waError.code) !== null && _h !== void 0 ? _h : null,
            twilioStatus: (_j = waError === null || waError === void 0 ? void 0 : waError.status) !== null && _j !== void 0 ? _j : null,
        });
    }
});
/**
 * Enviar mensaje de WhatsApp a un paciente por ID
 */
app.post("/api/whatsapp/send-to-patient", auth_1.authMiddleware, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    try {
        const doctorId = req.doctorId;
        const { patientId, message } = req.body;
        if (!patientId || !message) {
            return res.status(400).json({
                error: "Faltan campos: patientId y message",
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
        // Retail: interpretamos patientId como retailClientId
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        if (doctor.businessType === "RETAIL") {
            const client = await prisma_1.prisma.retailClient.findFirst({
                where: { id: Number(patientId), doctorId },
            });
            if (!client || !client.phone) {
                return res.status(404).json({
                    error: "Cliente no encontrado o sin teléfono",
                });
            }
            const waResult = await (0, whatsapp_1.sendWhatsAppText)(client.phone, message, {
                from: doctorWhatsapp.whatsappBusinessNumber,
            });
            const waId = (_f = (_c = (_b = (_a = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : (_e = (_d = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message_id) !== null && _f !== void 0 ? _f : null;
            const businessFrom = getDoctorBusinessNumber(doctorWhatsapp);
            const saved = await prisma_1.prisma.message.create({
                data: {
                    waMessageId: waId,
                    from: businessFrom,
                    to: client.phone,
                    direction: "outgoing",
                    type: "text",
                    body: message,
                    rawPayload: waResult,
                    retailClientId: client.id,
                    doctorId,
                },
            });
            return res.json({
                ok: true,
                waResult,
                savedMessageId: saved.id,
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
        const waResult = await (0, whatsapp_1.sendWhatsAppText)(patient.phone, message, {
            from: doctorWhatsapp.whatsappBusinessNumber,
        });
        const waId = (_m = (_j = (_h = (_g = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.id) !== null && _j !== void 0 ? _j : (_l = (_k = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _k === void 0 ? void 0 : _k[0]) === null || _l === void 0 ? void 0 : _l.message_id) !== null && _m !== void 0 ? _m : null;
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
        console.error("Error en /api/whatsapp/send-to-patient:", ((_o = error === null || error === void 0 ? void 0 : error.response) === null || _o === void 0 ? void 0 : _o.data) || error);
        const waError = extractWhatsappError(error);
        return res.status(500).json({
            error: "No se pudo enviar el mensaje al paciente",
            detail: (waError === null || waError === void 0 ? void 0 : waError.message) || (error === null || error === void 0 ? void 0 : error.message) || String(error),
            twilioCode: (_p = waError === null || waError === void 0 ? void 0 : waError.code) !== null && _p !== void 0 ? _p : null,
            twilioStatus: (_q = waError === null || waError === void 0 ? void 0 : waError.status) !== null && _q !== void 0 ? _q : null,
        });
    }
});
/**
 * Enviar mensaje de WhatsApp a todos los pacientes del doctor
 */
app.post("/api/whatsapp/broadcast", auth_1.authMiddleware, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado." });
        }
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
        const isRetail = doctor.businessType === "RETAIL";
        const recipients = isRetail
            ? await prisma_1.prisma.retailClient.findMany({
                where: {
                    doctorId,
                    phone: { not: null },
                    ...(normalizedSegments.length > 0
                        ? {
                            tags: {
                                some: {
                                    label: {
                                        in: normalizedSegments,
                                    },
                                },
                            },
                        }
                        : {}),
                },
                select: { id: true, phone: true },
            })
            : await prisma_1.prisma.patient.findMany({
                where: {
                    doctorId,
                    phone: { not: null },
                    ...(normalizedSegments.length > 0
                        ? {
                            tags: {
                                some: {
                                    label: {
                                        in: normalizedSegments,
                                    },
                                },
                            },
                        }
                        : {}),
                },
                select: { id: true, phone: true },
            });
        if (!recipients.length) {
            return res.status(400).json({
                error: isRetail
                    ? "No hay clientes con WhatsApp registrado para este negocio."
                    : "No hay pacientes con WhatsApp registrado para este doctor.",
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
        for (const recipient of recipients) {
            if (!recipient.phone)
                continue;
            try {
                const waResult = await (0, whatsapp_1.sendWhatsAppText)(recipient.phone, limitedMessage, {
                    from: doctorWhatsapp.whatsappBusinessNumber,
                });
                const waId = (_f = (_c = (_b = (_a = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : (_e = (_d = waResult === null || waResult === void 0 ? void 0 : waResult.messages) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message_id) !== null && _f !== void 0 ? _f : null;
                if (isRetail) {
                    await prisma_1.prisma.message.create({
                        data: {
                            waMessageId: waId,
                            from: businessFrom,
                            to: recipient.phone,
                            direction: "outgoing",
                            type: "text",
                            body: limitedMessage,
                            rawPayload: waResult,
                            retailClientId: recipient.id,
                            doctorId,
                        },
                    });
                }
                else {
                    await prisma_1.prisma.message.create({
                        data: {
                            waMessageId: waId,
                            from: businessFrom,
                            to: recipient.phone,
                            direction: "outgoing",
                            type: "text",
                            body: limitedMessage,
                            rawPayload: waResult,
                            patientId: recipient.id,
                            doctorId,
                        },
                    });
                }
                sent += 1;
            }
            catch (error) {
                console.error(`[Broadcast] Error al enviar a ${isRetail ? "cliente" : "paciente"} ${recipient.id}:`, ((_g = error === null || error === void 0 ? void 0 : error.response) === null || _g === void 0 ? void 0 : _g.data) || error);
                const failureDetail = extractWhatsappError(error);
                failures.push({
                    id: recipient.id,
                    error: (failureDetail === null || failureDetail === void 0 ? void 0 : failureDetail.message) ||
                        (error === null || error === void 0 ? void 0 : error.message) ||
                        "No pudimos enviar el mensaje",
                });
            }
        }
        return res.json({
            ok: true,
            total: recipients.length,
            sent,
            failed: failures.length,
            failures,
        });
    }
    catch (error) {
        console.error("Error en /api/whatsapp/broadcast:", ((_h = error === null || error === void 0 ? void 0 : error.response) === null || _h === void 0 ? void 0 : _h.data) || error);
        const waError = extractWhatsappError(error);
        return res.status(500).json({
            error: "No pudimos enviar el mensaje masivo",
            detail: (waError === null || waError === void 0 ? void 0 : waError.message) || (error === null || error === void 0 ? void 0 : error.message) || String(error),
            twilioCode: (_j = waError === null || waError === void 0 ? void 0 : waError.code) !== null && _j !== void 0 ? _j : null,
            twilioStatus: (_k = waError === null || waError === void 0 ? void 0 : waError.status) !== null && _k !== void 0 ? _k : null,
        });
    }
});
/**
 * Enviar mensaje de prueba por WhatsApp
 */
app.post("/api/whatsapp/send-test", auth_1.authMiddleware, async (req, res) => {
    var _a, _b, _c;
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
        const waError = extractWhatsappError(error);
        res.status(500).json({
            error: "No se pudo enviar el mensaje de WhatsApp",
            detail: (waError === null || waError === void 0 ? void 0 : waError.message) || (error === null || error === void 0 ? void 0 : error.message) || String(error),
            twilioCode: (_b = waError === null || waError === void 0 ? void 0 : waError.code) !== null && _b !== void 0 ? _b : null,
            twilioStatus: (_c = waError === null || waError === void 0 ? void 0 : waError.status) !== null && _c !== void 0 ? _c : null,
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4;
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
                businessAlias: true,
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
        // 1) Rama retail: no creamos pacientes, trabajamos con RetailClient
        if (doctor.businessType === "RETAIL") {
            const retailClient = await (0, retail_2.ensureRetailClientForPhone)({
                doctorId: doctor.id,
                phone: phoneE164,
                name: profileName || null,
            });
            const productCatalog = (await prisma_1.prisma.product.findMany({
                where: { doctorId: doctor.id },
                orderBy: { name: "asc" },
                select: { name: true, price: true, quantity: true, categories: true },
                take: 120,
            })).map((p) => ({
                name: p.name,
                price: p.price,
                unit: "u",
                keywords: Array.isArray(p.categories) ? p.categories : [],
            })) || [];
            const activePromotions = (await prisma_1.prisma.promotion.findMany({
                where: { doctorId: doctor.id, isActive: true },
                orderBy: { createdAt: "desc" },
                take: 20,
            })).map((p) => ({
                title: p.title,
                description: p.description || undefined,
                validUntil: p.endDate ? p.endDate.toISOString().slice(0, 10) : undefined,
            })) || [];
            const EDITABLE_ORDER_STATUSES = [client_1.OrderStatus.pending];
            const pendingOrdersForCtx = await prisma_1.prisma.order.findMany({
                where: { doctorId: doctor.id, clientId: retailClient.id, status: { in: EDITABLE_ORDER_STATUSES } },
                include: { items: { include: { product: true } } },
                orderBy: { createdAt: "desc" },
                take: 3,
            });
            const pendingOrdersCtx = pendingOrdersForCtx.map((o) => ({
                sequenceNumber: o.sequenceNumber,
                status: o.status,
                items: o.items.map((it) => { var _a; return ({ name: ((_a = it.product) === null || _a === void 0 ? void 0 : _a.name) || "Producto", quantity: it.quantity }); }),
            }));
            console.log("[RETAIL] pendingOrders:", pendingOrdersCtx.map((o) => ({ n: o.sequenceNumber, s: o.status, items: o.items.length })));
            const savedIncoming = await prisma_1.prisma.message.create({
                data: {
                    waMessageId: payload.MessageSid,
                    from: phoneE164,
                    to: doctorNumber,
                    direction: "incoming",
                    type: bodyText ? "text" : "other",
                    body: bodyText || null,
                    rawPayload: payload,
                    retailClientId: retailClient.id,
                    doctorId: doctor.id,
                },
            });
            console.log("💾 Mensaje guardado en DB (retail):", savedIncoming.id);
            // Si el dueño tomó control manual del chat, no responde el bot
            if (retailClient.manualChatHold) {
                console.log("[Retail] Chat en control manual, sin respuesta automática.");
                return res.sendStatus(200);
            }
            // Si llegan comprobantes/medios, procesar y preguntar asignación
            if (mediaItems.length > 0) {
                try {
                    const candidateOrder = pendingOrdersForCtx[0] ||
                        (await prisma_1.prisma.order.findFirst({
                            where: { doctorId: doctor.id, clientId: retailClient.id },
                            orderBy: { createdAt: "desc" },
                        }));
                    const candidateSeq = (_b = candidateOrder === null || candidateOrder === void 0 ? void 0 : candidateOrder.sequenceNumber) !== null && _b !== void 0 ? _b : null;
                    for (let i = 0; i < mediaItems.length; i += 1) {
                        const media = mediaItems[i];
                        if (!media.url)
                            continue;
                        try {
                            const buffer = await (0, proofExtractor_1.downloadTwilioMedia)(media.url);
                            const hash = (0, proofExtractor_1.sha256)(buffer);
                            const dhash = (media.contentType || "").toLowerCase().startsWith("image/")
                                ? await (0, proofExtractor_1.imageDhashHex)(buffer)
                                : null;
                            const savedFile = await saveOrderAttachmentBuffer(buffer, media.contentType || "application/octet-stream", media.mediaSid || "Comprobante");
                            const fileUrl = savedFile.url;
                            const duplicateExact = await prisma_1.prisma.paymentProof.findFirst({
                                where: { doctorId: doctor.id, bytesSha256: hash },
                                orderBy: { createdAt: "desc" },
                            });
                            let duplicateOfId = (_c = duplicateExact === null || duplicateExact === void 0 ? void 0 : duplicateExact.id) !== null && _c !== void 0 ? _c : null;
                            if (!duplicateOfId && dhash) {
                                const candidates = await prisma_1.prisma.paymentProof.findMany({
                                    where: {
                                        doctorId: doctor.id,
                                        imageDhash: { not: null },
                                    },
                                    select: { id: true, imageDhash: true },
                                    orderBy: { createdAt: "desc" },
                                    take: 40,
                                });
                                const hammingHex = (a, b) => {
                                    const len = Math.min(a.length, b.length);
                                    let diff = 0;
                                    for (let j = 0; j < len; j += 1) {
                                        const na = parseInt(a[j], 16);
                                        const nb = parseInt(b[j], 16);
                                        if (Number.isNaN(na) || Number.isNaN(nb))
                                            continue;
                                        diff += (na ^ nb).toString(2).split("1").length - 1;
                                    }
                                    return diff;
                                };
                                const similar = candidates.find((c) => c.imageDhash && hammingHex(dhash, c.imageDhash) <= MIN_DHASH_SIMILARITY);
                                if (similar)
                                    duplicateOfId = similar.id;
                            }
                            const extraction = automationOpenAIClient && media.contentType
                                ? await (0, proofExtractor_1.extractProofWithOpenAI)({
                                    openai: automationOpenAIClient,
                                    buffer,
                                    contentType: media.contentType || "application/octet-stream",
                                    fileName: media.mediaSid || undefined,
                                })
                                : null;
                            const proofDate = (extraction === null || extraction === void 0 ? void 0 : extraction.dateISO) && !Number.isNaN(Date.parse(extraction.dateISO))
                                ? new Date(extraction.dateISO)
                                : null;
                            await prisma_1.prisma.paymentProof.create({
                                data: {
                                    doctorId: doctor.id,
                                    clientId: retailClient.id,
                                    orderId: null,
                                    messageSid: payload.MessageSid || null,
                                    mediaIndex: i,
                                    fileName: media.mediaSid || undefined,
                                    contentType: media.contentType || null,
                                    fileUrl,
                                    bytesSha256: hash,
                                    imageDhash: dhash,
                                    amount: (_d = extraction === null || extraction === void 0 ? void 0 : extraction.amount) !== null && _d !== void 0 ? _d : null,
                                    currency: (_e = extraction === null || extraction === void 0 ? void 0 : extraction.currency) !== null && _e !== void 0 ? _e : null,
                                    reference: (_f = extraction === null || extraction === void 0 ? void 0 : extraction.reference) !== null && _f !== void 0 ? _f : null,
                                    proofDate,
                                    status: duplicateOfId ? "duplicate" : "unassigned",
                                    duplicateOfId: duplicateOfId !== null && duplicateOfId !== void 0 ? duplicateOfId : undefined,
                                },
                            });
                            const amountText = (extraction === null || extraction === void 0 ? void 0 : extraction.amount) != null ? `$${extraction.amount}` : null;
                            const reply = duplicateOfId
                                ? candidateSeq
                                    ? `Ojo, este comprobante parece repetido. ${amountText ? `Detecté ${amountText}. ` : ""}¿Lo asigno igual al pedido #${candidateSeq}?`
                                    : `Ojo, este comprobante parece repetido. ${amountText ? `Detecté ${amountText}. ` : ""}¿Para qué pedido es? Decime el número (ej: 6).`
                                : candidateSeq
                                    ? `Recibí tu comprobante ✅${amountText ? ` Detecté ${amountText}.` : ""} ¿Es para el pedido #${candidateSeq}?`
                                    : `Recibí tu comprobante ✅${amountText ? ` Detecté ${amountText}.` : ""} ¿Para qué pedido es? Decime el número (ej: 6).`;
                            if (!candidateSeq) {
                                await (0, retail_1.setAwaitingProofOrderNumber)({
                                    doctorId: doctor.id,
                                    clientId: retailClient.id,
                                });
                            }
                            const waResult = await (0, whatsapp_1.sendWhatsAppText)(phoneE164, reply, doctorWhatsappConfig);
                            await prisma_1.prisma.message.create({
                                data: {
                                    waMessageId: (_g = waResult === null || waResult === void 0 ? void 0 : waResult.sid) !== null && _g !== void 0 ? _g : null,
                                    from: doctorNumber,
                                    to: phoneE164,
                                    direction: "outgoing",
                                    type: "text",
                                    body: reply,
                                    rawPayload: waResult,
                                    retailClientId: retailClient.id,
                                    doctorId: doctor.id,
                                },
                            });
                            // respondemos una sola vez por tanda de media
                            return res.sendStatus(200);
                        }
                        catch (err) {
                            console.warn("[Retail] No se pudo procesar media entrante:", err);
                        }
                    }
                }
                catch (err) {
                    console.warn("[Retail] Error al procesar media entrante:", err);
                }
            }
            // Disponibilidad general (respeta botones de perfil en retail)
            const doctorAvailabilityStatus = doctor.availabilityStatus || "available";
            if (doctorAvailabilityStatus === "unavailable" || doctorAvailabilityStatus === "vacation") {
                const responseText = doctorAvailabilityStatus === "unavailable"
                    ? "No estamos tomando pedidos en este momento. Volvé a escribirnos más tarde 🙌"
                    : "Estamos de vacaciones y no estamos tomando pedidos por ahora. Te avisamos cuando volvamos ✅";
                try {
                    const waResult = await (0, whatsapp_1.sendWhatsAppText)(phoneE164, responseText, doctorWhatsappConfig);
                    await prisma_1.prisma.message.create({
                        data: {
                            waMessageId: (_h = waResult === null || waResult === void 0 ? void 0 : waResult.sid) !== null && _h !== void 0 ? _h : null,
                            from: doctorNumber,
                            to: phoneE164,
                            direction: "outgoing",
                            type: "text",
                            body: responseText,
                            rawPayload: waResult,
                            retailClientId: retailClient.id,
                            doctorId: doctor.id,
                        },
                    });
                }
                catch (error) {
                    console.error("[Retail] Error enviando aviso de disponibilidad:", error);
                }
                return res.sendStatus(200);
            }
            if (!bodyText)
                return res.sendStatus(200);
            const historyRaw = await prisma_1.prisma.message.findMany({
                where: { retailClientId: retailClient.id },
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
            const agentCtx = {
                text: bodyText,
                patientName: retailClient.fullName,
                patientPhone: retailClient.phone || phoneE164,
                doctorName: doctor.name,
                doctorId: doctor.id,
                businessType: doctor.businessType,
                timezone: DEFAULT_TIMEZONE,
                availableSlots: [],
                recentMessages,
                patientProfile: {
                    consultReason: null,
                    pendingSlotISO: null,
                    pendingSlotHumanLabel: null,
                    pendingSlotExpiresAt: null,
                    pendingSlotReason: null,
                    dni: retailClient.dni,
                    birthDate: null,
                    address: retailClient.businessAddress,
                    needsDni: !retailClient.dni,
                    needsName: !retailClient.fullName,
                    needsBirthDate: false,
                    needsAddress: !retailClient.businessAddress,
                    needsInsurance: false,
                    needsConsultReason: false,
                    preferredDayISO: null,
                    preferredDayLabel: null,
                    preferredHourMinutes: null,
                    preferredDayHasAvailability: null,
                },
                doctorProfile: {
                    specialty: null,
                    clinicName: null,
                    officeAddress: null,
                    officeCity: null,
                    officeMapsUrl: null,
                    officeDays: null,
                    officeHours: null,
                    contactPhone: null,
                    consultationPrice: null,
                    emergencyConsultationPrice: null,
                    additionalNotes: null,
                    slotMinutes: null,
                },
                productCatalog,
                activePromotions,
                pendingOrders: pendingOrdersCtx,
                storeProfile: {
                    name: doctor.name,
                    address: doctor.clinicAddress || null,
                    hours: doctor.officeHours || null,
                    notes: doctor.extraNotes || null,
                    businessAlias: (_j = doctor.businessAlias) !== null && _j !== void 0 ? _j : null,
                },
                incomingMedia: {
                    count: mediaItems.length,
                    urls: mediaItems.map((m) => m.url).filter(Boolean),
                    contentTypes: mediaItems.map((m) => m.contentType).filter(Boolean),
                },
            };
            console.log("[RETAIL_CTX]", {
                catalog: Array.isArray(agentCtx.productCatalog) ? agentCtx.productCatalog.length : 0,
                promos: Array.isArray(agentCtx.activePromotions) ? agentCtx.activePromotions.length : 0,
                media: (_l = (_k = agentCtx.incomingMedia) === null || _k === void 0 ? void 0 : _k.count) !== null && _l !== void 0 ? _l : 0,
                pending: (_m = agentCtx.pendingOrders) === null || _m === void 0 ? void 0 : _m.map((o) => ({ n: o.sequenceNumber, s: o.status, items: o.items.length })),
            });
            const agentResult = await (0, ai_1.runWhatsappAgent)(agentCtx);
            if (!agentResult)
                return res.sendStatus(200);
            if (agentResult.profileUpdates) {
                const info = agentResult.profileUpdates;
                const update = {};
                if ((_o = info.name) === null || _o === void 0 ? void 0 : _o.trim())
                    update.fullName = info.name.trim().slice(0, 120);
                if (info.dni) {
                    const normalized = normalizeDniInput(info.dni);
                    if (normalized)
                        update.dni = normalized;
                }
                if ((_p = info.address) === null || _p === void 0 ? void 0 : _p.trim()) {
                    const addr = info.address.trim();
                    if (addr.length >= 5)
                        update.businessAddress = addr.slice(0, 160);
                }
                if (Object.keys(update).length > 0) {
                    await prisma_1.prisma.retailClient.update({
                        where: { id: retailClient.id },
                        data: update,
                    });
                }
            }
            const { replyToPatient, action } = agentResult;
            const retailHandled = await (0, retail_1.handleRetailAgentAction)({
                doctor,
                retailClient,
                patient: null,
                action,
                replyToPatient,
                phoneE164,
                doctorNumber,
                doctorWhatsappConfig,
                rawText: bodyText,
            });
            if (retailHandled)
                return res.sendStatus(200);
            if (replyToPatient) {
                const messageWithHint = (0, hints_1.appendMenuHintForBusiness)(replyToPatient, doctor.businessType);
                try {
                    const waResult = await (0, whatsapp_1.sendWhatsAppText)(phoneE164, messageWithHint, doctorWhatsappConfig);
                    await prisma_1.prisma.message.create({
                        data: {
                            waMessageId: (_q = waResult === null || waResult === void 0 ? void 0 : waResult.sid) !== null && _q !== void 0 ? _q : null,
                            from: doctorNumber,
                            to: phoneE164,
                            direction: "outgoing",
                            type: "text",
                            body: replyToPatient,
                            rawPayload: waResult,
                            retailClientId: retailClient.id,
                            doctorId: doctor.id,
                        },
                    });
                }
                catch (error) {
                    console.error("[RetailAgent] Error enviando respuesta genérica:", error);
                }
            }
            return res.sendStatus(200);
        }
        // 1b) Buscar / crear paciente (solo salud)
        let patient = await prisma_1.prisma.patient.findFirst({
            where: { phone: phoneE164, doctorId: doctor.id },
        });
        const isRetailDoctor = doctor.businessType === "RETAIL";
        if (!patient) {
            patient = await prisma_1.prisma.patient.create({
                data: {
                    doctorId: doctor.id,
                    phone: phoneE164,
                    fullName: "Paciente WhatsApp",
                    needsName: true,
                },
            });
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
        if (!isRetailDoctor &&
            (doctorAvailabilityStatus === "unavailable" ||
                doctorAvailabilityStatus === "vacation")) {
            const responseText = doctorAvailabilityStatus === "unavailable"
                ? "El doctor no está tomando turnos por hoy."
                : "El doctor se encuentra de vacaciones.";
            try {
                const waResult = await (0, whatsapp_1.sendWhatsAppText)(phoneE164, responseText, doctorWhatsappConfig);
                await prisma_1.prisma.message.create({
                    data: {
                        waMessageId: (_r = waResult === null || waResult === void 0 ? void 0 : waResult.sid) !== null && _r !== void 0 ? _r : null,
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
            const responseText = (0, hints_1.appendMenuHintForBusiness)(`${acknowledgment} Podés enviar otro o escribir \"menu\" para volver.`, doctor.businessType);
            try {
                const waResult = await (0, whatsapp_1.sendWhatsAppText)(phoneE164, responseText, doctorWhatsappConfig);
                await prisma_1.prisma.message.create({
                    data: {
                        waMessageId: (_s = waResult === null || waResult === void 0 ? void 0 : waResult.sid) !== null && _s !== void 0 ? _s : null,
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
        const productCatalog = isRetailDoctor
            ? (await prisma_1.prisma.product.findMany({
                where: { doctorId: doctor.id },
                orderBy: { name: "asc" },
                select: { name: true },
                take: 100,
            })).map((p) => p.name)
            : [];
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
        const flowResult = isRetailDoctor
            ? { handled: false }
            : await (0, stateMachine_1.handleConversationFlow)({
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
                    conversationStateData: (_t = patient.conversationStateData) !== null && _t !== void 0 ? _t : undefined,
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
        if (isRetailDoctor) {
            // Saltamos la máquina de estado de salud; el agente retail se maneja arriba.
        }
        else if (flowResult.handled) {
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
                patient = (_u = bookingOutcome.patient) !== null && _u !== void 0 ? _u : patient;
                outgoingMessage = bookingOutcome.message;
            }
            else if (flowResult.cancelRequest) {
                const cancelOutcome = await processCancelRequest({
                    doctorId: doctor.id,
                    patient,
                    cancelRequest: flowResult.cancelRequest,
                    fallbackReply: outgoingMessage,
                });
                patient = (_v = cancelOutcome.patient) !== null && _v !== void 0 ? _v : patient;
                outgoingMessage = cancelOutcome.message;
            }
            if (outgoingMessage) {
                const messageWithHint = (0, hints_1.appendMenuHintForBusiness)(outgoingMessage, doctor.businessType);
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
        const consultationPrice = parsePrice((_w = doctor.consultFee) !== null && _w !== void 0 ? _w : null);
        const emergencyConsultationPrice = parsePrice((_x = doctor.emergencyFee) !== null && _x !== void 0 ? _x : null);
        const patientProfilePayload = {
            consultReason: (_y = patient.consultReason) !== null && _y !== void 0 ? _y : null,
            pendingSlotISO: patient.pendingSlotISO
                ? patient.pendingSlotISO.toISOString()
                : null,
            pendingSlotHumanLabel: (_z = patient.pendingSlotHumanLabel) !== null && _z !== void 0 ? _z : null,
            pendingSlotExpiresAt: patient.pendingSlotExpiresAt
                ? patient.pendingSlotExpiresAt.toISOString()
                : null,
            pendingSlotReason: (_0 = patient.pendingSlotReason) !== null && _0 !== void 0 ? _0 : null,
            dni: (_1 = patient.dni) !== null && _1 !== void 0 ? _1 : null,
            birthDate: patient.birthDate ? patient.birthDate.toISOString() : null,
            address: (_2 = patient.address) !== null && _2 !== void 0 ? _2 : null,
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
        // Rama retail: directo al handler y saltar lógica de salud
        if (isRetailDoctor) {
            const agentResult = await (0, ai_1.runWhatsappAgent)({
                text: bodyText,
                patientName: patient.fullName,
                patientPhone: patient.phone,
                doctorName: doctor.name,
                doctorId: doctor.id,
                businessType: doctor.businessType,
                timezone: DEFAULT_TIMEZONE,
                availableSlots: [],
                recentMessages,
                patientProfile: patientProfilePayload,
                doctorProfile: {
                    specialty: null,
                    clinicName: null,
                    officeAddress: null,
                    officeCity: null,
                    officeMapsUrl: null,
                    officeDays: null,
                    officeHours: null,
                    contactPhone: null,
                    consultationPrice: null,
                    emergencyConsultationPrice: null,
                    additionalNotes: null,
                    slotMinutes: null,
                },
                productCatalog,
            });
            if (!agentResult)
                return res.sendStatus(200);
            if (agentResult.profileUpdates) {
                const profileUpdates = agentResult.profileUpdates;
                const updateData = {};
                const normalizedName = normalizeAgentProvidedName(profileUpdates.name);
                if (normalizedName) {
                    updateData.fullName = normalizedName;
                    updateData.needsName = false;
                }
                if (profileUpdates.dni) {
                    const normalizedDni = normalizeDniInput(profileUpdates.dni);
                    if (normalizedDni) {
                        updateData.dni = normalizedDni;
                        updateData.needsDni = false;
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
                    try {
                        patient = await prisma_1.prisma.patient.update({
                            where: { id: patient.id },
                            data: updateData,
                        });
                    }
                    catch (error) {
                        if ((error === null || error === void 0 ? void 0 : error.code) === "P2002" && ((_3 = error === null || error === void 0 ? void 0 : error.meta) === null || _3 === void 0 ? void 0 : _3.modelName) === "Patient") {
                            console.warn("[RetailAgent] DNI en uso, omitiendo actualización del paciente");
                        }
                        else {
                            throw error;
                        }
                    }
                }
                // Si es retail, reflejar también en retailClient
                const retailUpdate = {};
                if (updateData.fullName)
                    retailUpdate.fullName = updateData.fullName;
                if (updateData.dni)
                    retailUpdate.dni = updateData.dni;
                if (updateData.address)
                    retailUpdate.businessAddress = updateData.address;
                if (Object.keys(retailUpdate).length > 0) {
                    const retailClient = await prisma_1.prisma.retailClient.findFirst({
                        where: { doctorId: doctor.id, patientId: patient.id },
                    });
                    if (retailClient) {
                        await prisma_1.prisma.retailClient.update({
                            where: { id: retailClient.id },
                            data: retailUpdate,
                        });
                    }
                }
            }
            const { replyToPatient, action } = agentResult;
            const retailHandled = await (0, retail_1.handleRetailAgentAction)({
                doctor,
                patient,
                retailClient: null,
                action,
                replyToPatient,
                phoneE164,
                doctorNumber,
                doctorWhatsappConfig,
                rawText: bodyText,
            });
            if (retailHandled)
                return res.sendStatus(200);
            if (replyToPatient) {
                const messageWithHint = (0, hints_1.appendMenuHintForBusiness)(replyToPatient, doctor.businessType);
                try {
                    const waResult = await (0, whatsapp_1.sendWhatsAppText)(phoneE164, messageWithHint, doctorWhatsappConfig);
                    await prisma_1.prisma.message.create({
                        data: {
                            waMessageId: (_4 = waResult === null || waResult === void 0 ? void 0 : waResult.sid) !== null && _4 !== void 0 ? _4 : null,
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
                    console.error("[RetailAgent] Error enviando respuesta genérica:", error);
                }
            }
            return res.sendStatus(200);
        }
        // Rama salud: delegamos en handler de salud
        await (0, health_1.handleHealthWebhookMessage)({
            doctor,
            patient,
            bodyText,
            doctorNumber,
            phoneE164,
            doctorWhatsappConfig,
            recentMessages,
            availableSlots,
            slotsForAgent,
            productCatalog,
            activeAppointment: activeAppointmentSummary,
            timezone: DEFAULT_TIMEZONE,
        });
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
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
            ticketLogoUrl: (_b = doc.ticketLogoUrl) !== null && _b !== void 0 ? _b : null,
            // estos los mapeamos desde tus campos actuales
            specialty: (_c = doc.specialty) !== null && _c !== void 0 ? _c : null,
            clinicName: (_d = doc.clinicName) !== null && _d !== void 0 ? _d : null,
            officeAddress: (_e = doc.clinicAddress) !== null && _e !== void 0 ? _e : null,
            officeDays: (_f = doc.officeDays) !== null && _f !== void 0 ? _f : null,
            officeHours: (_g = doc.officeHours) !== null && _g !== void 0 ? _g : null,
            officeCity: null,
            officeMapsUrl: null,
            contactPhone: (_h = doc.contactPhone) !== null && _h !== void 0 ? _h : null,
            whatsappBusinessNumber: null,
            consultationPrice,
            emergencyConsultationPrice,
            bio: (_j = doc.extraNotes) !== null && _j !== void 0 ? _j : null,
            appointmentSlotMinutes: (_k = doc.appointmentSlotMinutes) !== null && _k !== void 0 ? _k : null,
            businessAlias: (_l = doc.businessAlias) !== null && _l !== void 0 ? _l : null,
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
    var _a, _b;
    try {
        const doctorId = req.doctorId;
        const { specialty, clinicName, ticketLogoUrl, officeAddress, officeDays, officeHours, officeCity, // por ahora no lo persistimos
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
        const businessAlias = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.businessAlias) !== null && _b !== void 0 ? _b : null;
        const updateData = {
            specialty: specialty !== null && specialty !== void 0 ? specialty : null,
            clinicName: clinicName !== null && clinicName !== void 0 ? clinicName : null,
            ticketLogoUrl: ticketLogoUrl !== null && ticketLogoUrl !== void 0 ? ticketLogoUrl : null,
            // officeAddress del front → clinicAddress en la DB
            clinicAddress: officeAddress !== null && officeAddress !== void 0 ? officeAddress : null,
            businessAlias: businessAlias !== null && businessAlias !== void 0 ? businessAlias : null,
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
app.post("/api/me/profile/ticket-logo", auth_1.authMiddleware, async (req, res) => {
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
            select: { ticketLogoUrl: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        const profileImageUrl = await saveProfileImageForDoctor(doctorId, imageBase64, doctor.ticketLogoUrl);
        await prisma_1.prisma.doctor.update({
            where: { id: doctorId },
            data: { ticketLogoUrl: profileImageUrl },
        });
        res.json({ ticketLogoUrl: profileImageUrl });
    }
    catch (error) {
        console.error("Error en POST /api/me/profile/ticket-logo:", error);
        res.status(500).json({
            error: (error === null || error === void 0 ? void 0 : error.message) || "No pudimos actualizar el logo.",
        });
    }
});
app.delete("/api/me/profile/ticket-logo", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { ticketLogoUrl: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        const prevUrl = doctor.ticketLogoUrl;
        await prisma_1.prisma.doctor.update({
            where: { id: doctorId },
            data: { ticketLogoUrl: null },
        });
        if (prevUrl) {
            await removeUploadedFile(prevUrl).catch(() => { });
        }
        res.json({ ticketLogoUrl: null });
    }
    catch (error) {
        console.error("Error en DELETE /api/me/profile/ticket-logo:", error);
        res.status(500).json({
            error: (error === null || error === void 0 ? void 0 : error.message) || "No pudimos eliminar el logo.",
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
        await removeUploadedFile(doctor.profileImageUrl);
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
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        const search = (_a = req.query.q) === null || _a === void 0 ? void 0 : _a.trim();
        // Rama retail: listamos clientes retail (no pacientes de salud)
        if (doctor.businessType === "RETAIL") {
            const clients = await prisma_1.prisma.retailClient.findMany({
                where: {
                    doctorId,
                    ...(search
                        ? {
                            OR: [
                                { fullName: { contains: search } },
                                { phone: { contains: search } },
                                { dni: { contains: search } },
                                { businessAddress: { contains: search } },
                            ],
                        }
                        : {}),
                },
                orderBy: { id: "desc" },
                take: 50,
                include: {
                    patient: true,
                },
            });
            const mapped = clients.map((client) => {
                const patient = client.patient;
                const name = client.fullName || (patient === null || patient === void 0 ? void 0 : patient.fullName) || "Cliente WhatsApp";
                const phone = client.phone || (patient === null || patient === void 0 ? void 0 : patient.phone) || "";
                const dni = client.dni || (patient === null || patient === void 0 ? void 0 : patient.dni) || null;
                const address = client.businessAddress || (patient === null || patient === void 0 ? void 0 : patient.address) || null;
                return {
                    id: client.id,
                    fullName: name,
                    phone,
                    dni,
                    address,
                    needsName: !name || name === "Cliente WhatsApp",
                    needsDni: !dni,
                    needsAddress: !address,
                    tags: [],
                    isProfileComplete: Boolean(name && dni && address),
                };
            });
            return res.json({ patients: mapped });
        }
        // Rama salud: pacientes tradicionales
        const where = { doctorId };
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
    var _a, _b;
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        const patientId = Number(req.params.id);
        if (isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        if (doctor.businessType === "RETAIL") {
            const client = await prisma_1.prisma.retailClient.findFirst({
                where: { doctorId, id: patientId },
                include: { patient: true, tags: true },
            });
            if (!client) {
                return res.status(404).json({ error: "Cliente no encontrado" });
            }
            const orders = await prisma_1.prisma.order.findMany({
                where: { doctorId, clientId: client.id },
                orderBy: { createdAt: "desc" },
                include: { items: { include: { product: true } }, attachments: true },
            });
            const patient = client.patient;
            const paymentTotals = orders.reduce((acc, order) => {
                var _a, _b, _c;
                const billed = (_a = order.totalAmount) !== null && _a !== void 0 ? _a : 0;
                const paid = Math.min((_b = order.paidAmount) !== null && _b !== void 0 ? _b : 0, billed);
                const isCancelled = order.status === "cancelled";
                if (!isCancelled) {
                    acc.totalBilled += billed;
                    acc.totalPaid += paid;
                    acc.outstanding += Math.max(billed - ((_c = order.paidAmount) !== null && _c !== void 0 ? _c : 0), 0);
                }
                return acc;
            }, { totalBilled: 0, totalPaid: 0, outstanding: 0 });
            const tags = [];
            const dbTags = (_b = (_a = client.tags) === null || _a === void 0 ? void 0 : _a.map((t) => ({
                id: t.id,
                label: t.label,
                severity: t.severity,
            }))) !== null && _b !== void 0 ? _b : [];
            tags.push(...dbTags);
            if (paymentTotals.totalBilled > 0) {
                const scoreRaw = paymentTotals.totalBilled > 0
                    ? Math.round((paymentTotals.totalPaid / paymentTotals.totalBilled) * 10)
                    : 0;
                const score = Math.max(0, Math.min(10, scoreRaw));
                const scoreSeverity = score >= 8 ? "info" : score >= 5 ? "medium" : "high";
                tags.push({
                    id: -3,
                    label: `Score de pago: ${score}/10`,
                    severity: scoreSeverity,
                });
            }
            if (paymentTotals.outstanding > 0) {
                tags.unshift({
                    id: -1,
                    label: `Falta de pago ($${paymentTotals.outstanding.toLocaleString("es-AR")})`,
                    severity: "high",
                });
            }
            else if (paymentTotals.totalBilled > 0) {
                tags.unshift({
                    id: -2,
                    label: "Pago al día",
                    severity: "info",
                });
            }
            return res.json({
                patient: {
                    id: client.id,
                    fullName: client.fullName || (patient === null || patient === void 0 ? void 0 : patient.fullName) || "Cliente WhatsApp",
                    phone: client.phone || (patient === null || patient === void 0 ? void 0 : patient.phone) || null,
                    dni: client.dni || (patient === null || patient === void 0 ? void 0 : patient.dni) || null,
                    address: client.businessAddress || (patient === null || patient === void 0 ? void 0 : patient.address) || null,
                    tags,
                },
                appointments: [],
                openConsultations: [],
                orders: orders.map((order) => ({
                    ...serializeOrderRecord(order),
                    items: order.items.map((item) => {
                        var _a;
                        return ({
                            id: item.id,
                            productId: item.productId,
                            productName: ((_a = item.product) === null || _a === void 0 ? void 0 : _a.name) || "Producto",
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                        });
                    }),
                })),
            });
        }
        const patient = await prisma_1.prisma.patient.findFirst({
            where: { id: patientId, doctorId },
            include: {
                appointments: {
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
    var _a;
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        const patientId = Number(req.params.id);
        if (isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        if (doctor.businessType === "RETAIL") {
            const client = await prisma_1.prisma.retailClient.findFirst({
                where: { id: patientId, doctorId },
                include: {
                    notes: {
                        orderBy: { createdAt: "desc" },
                        take: 20,
                    },
                    orders: {
                        where: { status: { in: ["pending", "confirmed"] } },
                        orderBy: { createdAt: "desc" },
                        include: { items: { include: { product: true } } },
                        take: 10,
                    },
                },
            });
            if (!client) {
                return res.status(404).json({ error: "Cliente no encontrado" });
            }
            const summary = await (0, patientSummary_1.generateRetailClientSummary)({
                client: {
                    fullName: client.fullName,
                    address: client.businessAddress,
                    phone: client.phone,
                },
                notes: client.notes.map((n) => ({
                    content: n.content,
                    createdAt: n.createdAt,
                })),
                orders: ((_a = client.orders) === null || _a === void 0 ? void 0 : _a.map((o) => ({
                    createdAt: o.createdAt,
                    status: o.status,
                    items: o.items.map((it) => {
                        var _a;
                        return ({
                            name: ((_a = it.product) === null || _a === void 0 ? void 0 : _a.name) || "producto",
                            quantity: it.quantity,
                        });
                    }),
                }))) || [],
            });
            return res.json({ summary });
        }
        const patient = await prisma_1.prisma.patient.findFirst({
            where: { id: patientId, doctorId },
            include: {
                appointments: {
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
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        const patientId = Number(req.params.id);
        if (isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        if (doctor.businessType === "RETAIL") {
            const client = await prisma_1.prisma.retailClient.findFirst({
                where: { id: patientId, doctorId },
                select: { id: true },
            });
            if (!client) {
                return res.status(404).json({ error: "Cliente no encontrado" });
            }
            const notes = await prisma_1.prisma.retailClientNote.findMany({
                where: { retailClientId: client.id, doctorId },
                orderBy: { createdAt: "desc" },
                take: 100,
            });
            return res.json({
                notes: notes.map((note) => ({
                    id: note.id,
                    content: note.content,
                    createdAt: note.createdAt.toISOString(),
                })),
            });
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
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
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
        if (doctor.businessType === "RETAIL") {
            const client = await prisma_1.prisma.retailClient.findFirst({
                where: { id: patientId, doctorId },
                select: { id: true },
            });
            if (!client) {
                return res.status(404).json({ error: "Cliente no encontrado" });
            }
            const note = await prisma_1.prisma.retailClientNote.create({
                data: {
                    content,
                    retailClientId: client.id,
                    doctorId,
                },
                select: {
                    id: true,
                    content: true,
                    createdAt: true,
                },
            });
            return res.json({
                note: {
                    id: note.id,
                    content: note.content,
                    createdAt: note.createdAt.toISOString(),
                },
            });
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
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        if (doctor.businessType === "RETAIL") {
            const client = await prisma_1.prisma.retailClient.findFirst({
                where: { id: patientId, doctorId },
                select: { id: true },
            });
            if (!client) {
                return res.status(404).json({ error: "Cliente no encontrado" });
            }
            const tag = await prisma_1.prisma.retailClientTag.create({
                data: {
                    label,
                    severity,
                    clientId: client.id,
                    doctorId,
                },
            });
            return res.json({
                tag: {
                    id: tag.id,
                    label: tag.label,
                    severity: tag.severity,
                    createdAt: tag.createdAt.toISOString(),
                },
            });
        }
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
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if ((doctor === null || doctor === void 0 ? void 0 : doctor.businessType) === "RETAIL") {
            const tag = await prisma_1.prisma.retailClientTag.findFirst({
                where: { id: tagId, clientId: patientId, doctorId },
            });
            if (!tag) {
                return res.status(404).json({ error: "Etiqueta no encontrada" });
            }
            await prisma_1.prisma.retailClientTag.delete({
                where: { id: tagId },
            });
            return res.json({ ok: true });
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
    var _a, _b;
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        const tagSegments = await prisma_1.prisma.patientTag.groupBy({
            by: ["label", "severity"],
            where: { doctorId },
            _count: { _all: true },
            orderBy: { label: "asc" },
        });
        const segments = tagSegments.map((segment) => {
            var _a, _b;
            return ({
                label: segment.label,
                severity: segment.severity,
                count: (_b = (_a = segment._count) === null || _a === void 0 ? void 0 : _a._all) !== null && _b !== void 0 ? _b : 0,
            });
        });
        if ((doctor === null || doctor === void 0 ? void 0 : doctor.businessType) === "RETAIL") {
            const retailSegments = await prisma_1.prisma.retailClientTag.groupBy({
                by: ["label", "severity"],
                where: { doctorId },
                _count: { _all: true },
                orderBy: { label: "asc" },
            });
            retailSegments.forEach((segment) => {
                var _a, _b;
                segments.push({
                    label: segment.label,
                    severity: segment.severity,
                    count: (_b = (_a = segment._count) === null || _a === void 0 ? void 0 : _a._all) !== null && _b !== void 0 ? _b : 0,
                });
            });
            const orders = await prisma_1.prisma.order.findMany({
                where: { doctorId, status: { in: ["pending", "confirmed"] }, clientId: { not: null } },
                select: { clientId: true, totalAmount: true, paidAmount: true },
            });
            const byClient = new Map();
            for (const o of orders) {
                if (!o.clientId)
                    continue;
                const agg = byClient.get(o.clientId) || { billed: 0, paid: 0 };
                agg.billed += (_a = o.totalAmount) !== null && _a !== void 0 ? _a : 0;
                agg.paid += Math.max(0, (_b = o.paidAmount) !== null && _b !== void 0 ? _b : 0);
                byClient.set(o.clientId, agg);
            }
            let debtors = 0;
            let upToDate = 0;
            for (const agg of byClient.values()) {
                const outstanding = Math.max(agg.billed - agg.paid, 0);
                if (outstanding > 0)
                    debtors += 1;
                else if (agg.billed > 0)
                    upToDate += 1;
            }
            if (debtors > 0) {
                segments.push({
                    label: "Falta de pago",
                    severity: "high",
                    count: debtors,
                });
            }
            if (upToDate > 0) {
                segments.push({
                    label: "Pago al día",
                    severity: "info",
                    count: upToDate,
                });
            }
        }
        res.json({ segments });
    }
    catch (error) {
        console.error("Error en /api/patient-tags:", error);
        res.status(500).json({
            error: "No pudimos obtener las etiquetas.",
        });
    }
});
/**
 * Productos (stock)
 */
app.get("/api/products", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const products = await prisma_1.prisma.product.findMany({
            where: { doctorId },
            include: {
                tags: {
                    orderBy: { createdAt: "desc" },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        res.json({
            products: products.map(serializeProduct),
        });
    }
    catch (error) {
        console.error("Error en GET /api/products:", error);
        res.status(500).json({
            error: "No pudimos obtener el stock.",
        });
    }
});
app.post("/api/products", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const { name, description, imageUrl, imageBase64, categories, price, quantity, } = req.body;
        const sanitizedName = sanitizeProductName(name);
        if (!sanitizedName) {
            return res.status(400).json({
                error: "Ingresá un nombre para el producto.",
            });
        }
        const parsedPrice = parseNonNegativeInteger(price !== null && price !== void 0 ? price : 0);
        if (parsedPrice === null) {
            return res.status(400).json({
                error: "El precio debe ser un número válido.",
            });
        }
        const parsedQuantity = parseNonNegativeInteger(quantity !== null && quantity !== void 0 ? quantity : 0);
        if (parsedQuantity === null) {
            return res.status(400).json({
                error: "La cantidad debe ser un número válido.",
            });
        }
        const normalizedImageBase64 = typeof imageBase64 === "string" && imageBase64.trim().length > 0
            ? imageBase64.trim()
            : null;
        const normalizedCategories = sanitizeProductCategories(categories);
        const product = await prisma_1.prisma.product.create({
            data: {
                doctorId,
                name: sanitizedName,
                description: sanitizeOptionalText(description),
                imageUrl: normalizedImageBase64
                    ? null
                    : sanitizeOptionalText(imageUrl, 500),
                categories: normalizedCategories,
                price: parsedPrice,
                quantity: parsedQuantity,
            },
            include: {
                tags: {
                    orderBy: { createdAt: "desc" },
                },
            },
        });
        let finalProduct = product;
        if (normalizedImageBase64) {
            let uploadedImageUrl = null;
            try {
                uploadedImageUrl = await saveProductImage(product.id, normalizedImageBase64);
                finalProduct = await prisma_1.prisma.product.update({
                    where: { id: product.id },
                    data: { imageUrl: uploadedImageUrl },
                    include: {
                        tags: {
                            orderBy: { createdAt: "desc" },
                        },
                    },
                });
            }
            catch (error) {
                console.error("Error al guardar imagen de producto:", error);
                if (uploadedImageUrl) {
                    await removeUploadedFile(uploadedImageUrl);
                }
                await prisma_1.prisma.product.delete({ where: { id: product.id } }).catch(() => { });
                const status = (error === null || error === void 0 ? void 0 : error.code) === "IMAGE_VALIDATION_ERROR" ? 400 : 500;
                return res.status(status).json({
                    error: (error === null || error === void 0 ? void 0 : error.message) ||
                        "No pudimos guardar la imagen del producto. Intentá nuevamente.",
                });
            }
        }
        res.status(201).json({
            product: serializeProduct(finalProduct),
        });
    }
    catch (error) {
        console.error("Error en POST /api/products:", error);
        res.status(500).json({
            error: "No pudimos crear el producto.",
        });
    }
});
app.put("/api/products/:id", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const productId = Number(req.params.id);
        if (isNaN(productId)) {
            return res.status(400).json({ error: "productId inválido" });
        }
        const product = await prisma_1.prisma.product.findFirst({
            where: { id: productId, doctorId },
        });
        if (!product) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }
        const { name, description, imageUrl, imageBase64, removeImage, categories, price, quantity, } = req.body;
        const data = {};
        if (name !== undefined) {
            const sanitizedName = sanitizeProductName(name);
            if (!sanitizedName) {
                return res.status(400).json({
                    error: "El nombre del producto no puede estar vacío.",
                });
            }
            data.name = sanitizedName;
        }
        if (description !== undefined) {
            data.description = sanitizeOptionalText(description);
        }
        if (price !== undefined) {
            const parsedPrice = parseNonNegativeInteger(price);
            if (parsedPrice === null) {
                return res.status(400).json({
                    error: "El precio debe ser un número válido.",
                });
            }
            data.price = parsedPrice;
        }
        if (quantity !== undefined) {
            const parsedQuantity = parseNonNegativeInteger(quantity);
            if (parsedQuantity === null) {
                return res.status(400).json({
                    error: "La cantidad debe ser un número válido.",
                });
            }
            data.quantity = parsedQuantity;
        }
        if (categories !== undefined) {
            data.categories = sanitizeProductCategories(categories);
        }
        const normalizedImageBase64 = typeof imageBase64 === "string" && imageBase64.trim().length > 0
            ? imageBase64.trim()
            : null;
        const shouldRemoveImage = typeof removeImage === "string"
            ? removeImage === "true"
            : Boolean(removeImage);
        let uploadedImageUrl = null;
        if (normalizedImageBase64) {
            try {
                uploadedImageUrl = await saveProductImage(product.id, normalizedImageBase64);
            }
            catch (error) {
                const status = (error === null || error === void 0 ? void 0 : error.code) === "IMAGE_VALIDATION_ERROR" ? 400 : 500;
                return res.status(status).json({
                    error: (error === null || error === void 0 ? void 0 : error.message) ||
                        "No pudimos guardar la imagen del producto. Intentá nuevamente.",
                });
            }
        }
        if (uploadedImageUrl) {
            data.imageUrl = uploadedImageUrl;
        }
        else if (shouldRemoveImage) {
            data.imageUrl = null;
        }
        else if (imageUrl !== undefined) {
            data.imageUrl = sanitizeOptionalText(imageUrl, 500);
        }
        let updated;
        try {
            updated = await prisma_1.prisma.product.update({
                where: { id: product.id },
                data,
                include: {
                    tags: {
                        orderBy: { createdAt: "desc" },
                    },
                },
            });
        }
        catch (updateError) {
            if (uploadedImageUrl) {
                await removeUploadedFile(uploadedImageUrl).catch(() => { });
            }
            throw updateError;
        }
        if (uploadedImageUrl && product.imageUrl) {
            await removeUploadedFile(product.imageUrl);
        }
        else if (shouldRemoveImage && product.imageUrl && !uploadedImageUrl) {
            await removeUploadedFile(product.imageUrl);
        }
        res.json({
            product: serializeProduct(updated),
        });
    }
    catch (error) {
        console.error("Error en PUT /api/products/:id:", error);
        res.status(500).json({
            error: "No pudimos actualizar el producto.",
        });
    }
});
app.delete("/api/products/:id", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const productId = Number(req.params.id);
        if (isNaN(productId)) {
            return res.status(400).json({ error: "productId inválido" });
        }
        const product = await prisma_1.prisma.product.findFirst({
            where: { id: productId, doctorId },
        });
        if (!product) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }
        await prisma_1.prisma.product.delete({
            where: { id: product.id },
        });
        await removeUploadedFile(product.imageUrl);
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Error en DELETE /api/products/:id:", error);
        res.status(500).json({
            error: "No pudimos eliminar el producto.",
        });
    }
});
app.post("/api/products/:id/tags", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const productId = Number(req.params.id);
        if (isNaN(productId)) {
            return res.status(400).json({ error: "productId inválido" });
        }
        const product = await prisma_1.prisma.product.findFirst({
            where: { id: productId, doctorId },
        });
        if (!product) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }
        const { label, severity } = req.body;
        const sanitizedLabel = sanitizePatientTagLabel(label);
        if (!sanitizedLabel) {
            return res.status(400).json({
                error: "Ingresá al menos 2 caracteres.",
            });
        }
        const normalizedSeverity = normalizePatientTagSeverity(severity);
        const tag = await prisma_1.prisma.productTag.create({
            data: {
                doctorId,
                productId: product.id,
                label: sanitizedLabel,
                severity: normalizedSeverity,
            },
        });
        res.status(201).json({
            tag: serializeProductTagRecord(tag),
        });
    }
    catch (error) {
        console.error("Error en POST /api/products/:id/tags:", error);
        res.status(500).json({
            error: "No pudimos guardar la etiqueta.",
        });
    }
});
app.post("/api/automation/retail", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res
                .status(403)
                .json({ error: "Automatización disponible solo para comercios." });
        }
        const { text } = req.body;
        const trimmed = (text || "").trim();
        if (!trimmed) {
            return res.status(400).json({ error: "Mandá el texto a interpretar." });
        }
        const products = await prisma_1.prisma.product.findMany({
            where: { doctorId },
            select: {
                id: true,
                name: true,
                price: true,
                quantity: true,
                categories: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 120,
        });
        const now = new Date();
        const outstandingOrders = await prisma_1.prisma.order.findMany({
            where: {
                doctorId,
                paymentStatus: { in: ["unpaid", "partial"] },
            },
            select: {
                id: true,
                sequenceNumber: true,
                totalAmount: true,
                paidAmount: true,
                paymentStatus: true,
                createdAt: true,
                client: { select: { fullName: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        const pendingOrders = await prisma_1.prisma.order.findMany({
            where: { doctorId, status: "pending" },
            select: {
                id: true,
                sequenceNumber: true,
                client: { select: { fullName: true } },
                items: {
                    select: {
                        quantity: true,
                        product: { select: { name: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
        });
        const agentResult = await (0, automationRetail_1.runRetailAutomationAgent)({
            text: trimmed,
            products,
            outstandingOrders: outstandingOrders.map((o) => {
                var _a, _b, _c;
                return ({
                    id: o.id,
                    sequenceNumber: o.sequenceNumber,
                    clientName: (_b = (_a = o.client) === null || _a === void 0 ? void 0 : _a.fullName) !== null && _b !== void 0 ? _b : null,
                    totalAmount: o.totalAmount,
                    paidAmount: (_c = o.paidAmount) !== null && _c !== void 0 ? _c : 0,
                    paymentStatus: o.paymentStatus,
                    daysOpen: Math.max(0, Math.round((now.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24))),
                });
            }),
            pendingOrders: pendingOrders.map((o) => {
                var _a, _b;
                return ({
                    id: o.id,
                    sequenceNumber: o.sequenceNumber,
                    clientName: (_b = (_a = o.client) === null || _a === void 0 ? void 0 : _a.fullName) !== null && _b !== void 0 ? _b : null,
                    items: o.items.map((it) => {
                        var _a, _b;
                        return ({
                            name: (_b = (_a = it.product) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : "Producto",
                            quantity: it.quantity,
                        });
                    }),
                });
            }),
        }, automationOpenAIClient);
        if (!agentResult) {
            return res.status(500).json({
                error: "No pude generar un plan de automatización.",
            });
        }
        return res.json(agentResult);
    }
    catch (error) {
        console.error("Error en POST /api/automation/retail:", error);
        res.status(500).json({
            error: "No pudimos procesar la automatización.",
        });
    }
});
/**
 * Comercio: pedidos
 */
app.get("/api/commerce/orders", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const orders = await prisma_1.prisma.order.findMany({
            where: { doctorId },
            orderBy: { createdAt: "desc" },
            include: {
                client: true,
                items: {
                    include: { product: true },
                },
                attachments: true,
                promotions: true,
            },
        });
        res.json({
            orders: orders.map(serializeOrderRecord),
        });
    }
    catch (error) {
        console.error("Error en GET /api/commerce/orders:", error);
        res.status(500).json({ error: "No pudimos obtener los pedidos." });
    }
});
app.get("/api/commerce/attachments", auth_1.authMiddleware, async (req, res) => {
    var _a;
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const search = (_a = req.query.q) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase();
        const searchNumber = search && /^\d+$/.test(search) ? Number(search) : null;
        const attachments = await prisma_1.prisma.orderAttachment.findMany({
            where: {
                order: {
                    doctorId,
                    ...(search
                        ? {
                            OR: [
                                { customerName: { contains: search, mode: "insensitive" } },
                                ...(searchNumber ? [{ sequenceNumber: searchNumber }] : []),
                            ],
                        }
                        : {}),
                },
            },
            include: {
                order: {
                    select: {
                        id: true,
                        sequenceNumber: true,
                        customerName: true,
                        clientId: true,
                        createdAt: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            take: 300,
        });
        res.json({
            attachments: attachments.map((att) => ({
                id: att.id,
                orderId: att.orderId,
                orderSequenceNumber: att.order.sequenceNumber,
                customerName: att.order.customerName,
                clientId: att.order.clientId,
                url: att.url,
                filename: att.filename,
                mimeType: att.mimeType,
                createdAt: att.createdAt,
                orderCreatedAt: att.order.createdAt,
            })),
        });
    }
    catch (error) {
        console.error("Error en GET /api/commerce/attachments:", error);
        res.status(500).json({ error: "No pudimos obtener los comprobantes." });
    }
});
app.post("/api/commerce/orders/:id/payment-reminder", auth_1.authMiddleware, async (req, res) => {
    var _a;
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true, whatsappBusinessNumber: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const orderId = Number(req.params.id);
        if (!Number.isFinite(orderId)) {
            return res.status(400).json({ error: "orderId inválido" });
        }
        const order = await prisma_1.prisma.order.findFirst({
            where: { id: orderId, doctorId },
            include: { items: true, client: true },
        });
        if (!order) {
            return res.status(404).json({ error: "Pedido no encontrado" });
        }
        if (!((_a = order.client) === null || _a === void 0 ? void 0 : _a.phone)) {
            return res.status(400).json({ error: "El cliente no tiene teléfono para notificar." });
        }
        if (!doctor.whatsappBusinessNumber) {
            return res
                .status(400)
                .json({ error: "Configurá un número de WhatsApp para enviar recordatorios." });
        }
        const pendingAmount = Math.max(0, order.totalAmount - (order.paidAmount || 0));
        const message = `Registramos una deuda hasta la fecha de $${pendingAmount} por tu pedido #${order.sequenceNumber}.`;
        try {
            await (0, whatsapp_1.sendWhatsAppText)(order.client.phone, message, {
                from: doctor.whatsappBusinessNumber,
            });
        }
        catch (err) {
            console.error("Error enviando recordatorio de pago:", err);
            return res
                .status(500)
                .json({ error: "No pudimos enviar el recordatorio. Verificá el número." });
        }
        return res.json({ ok: true });
    }
    catch (error) {
        console.error("Error en POST /api/commerce/orders/:id/payment-reminder:", error);
        res.status(500).json({ error: "No pudimos enviar el recordatorio." });
    }
});
const addDaysSafe = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};
app.get("/api/commerce/promotions", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const promotions = await prisma_1.prisma.promotion.findMany({
            where: { doctorId },
            orderBy: { createdAt: "desc" },
        });
        return res.json({ promotions });
    }
    catch (error) {
        console.error("Error en GET /api/commerce/promotions:", error);
        res.status(500).json({ error: "No pudimos obtener las promociones." });
    }
});
app.post("/api/commerce/promotions", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const { title, description, discountType, discountValue, productIds, productTagLabels, imageBase64, durationDays, untilStockOut, } = req.body;
        const trimmedTitle = (title || "").trim();
        if (!trimmedTitle) {
            return res.status(400).json({ error: "Poné un título para la promo." });
        }
        const normalizedDiscountType = discountType === "percent" || discountType === "amount" ? discountType : "amount";
        const numericDiscount = Number(discountValue !== null && discountValue !== void 0 ? discountValue : 0);
        if (!Number.isFinite(numericDiscount) || numericDiscount <= 0) {
            return res.status(400).json({ error: "El descuento debe ser mayor a 0." });
        }
        const productIdsClean = Array.isArray(productIds)
            ? productIds
                .map((id) => Number(id))
                .filter((id) => Number.isFinite(id) && id > 0)
            : [];
        const tagLabelsClean = Array.isArray(productTagLabels)
            ? productTagLabels
                .map((t) => (typeof t === "string" ? t.trim() : ""))
                .filter((t) => t.length > 0)
            : [];
        const durationClean = typeof durationDays === "number" && durationDays > 0
            ? Math.round(durationDays)
            : null;
        let endDate = null;
        if (durationClean && durationClean > 0) {
            endDate = addDaysSafe(new Date(), durationClean);
        }
        let savedImageUrl = null;
        if (typeof imageBase64 === "string" && imageBase64.trim()) {
            savedImageUrl = await savePromotionImage(doctorId, imageBase64.trim());
        }
        const created = await prisma_1.prisma.promotion.create({
            data: {
                doctorId,
                title: trimmedTitle.slice(0, 180),
                description: (description === null || description === void 0 ? void 0 : description.trim()) || null,
                discountType: normalizedDiscountType,
                discountValue: Math.round(numericDiscount),
                productIds: productIdsClean,
                productTagLabels: tagLabelsClean,
                imageUrl: savedImageUrl,
                durationDays: durationClean,
                untilStockOut: Boolean(untilStockOut),
                endDate,
            },
        });
        return res.json({ promotion: created });
    }
    catch (error) {
        console.error("Error en POST /api/commerce/promotions:", error);
        res.status(500).json({ error: "No pudimos crear la promoción." });
    }
});
app.post("/api/commerce/promotions/:id/send", auth_1.authMiddleware, async (req, res) => {
    var _a, _b, _c;
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true, whatsappBusinessNumber: true, name: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const promotionId = Number(req.params.id);
        if (!Number.isFinite(promotionId)) {
            return res.status(400).json({ error: "ID de promoción inválido." });
        }
        const messageRaw = (((_a = req.body) === null || _a === void 0 ? void 0 : _a.message) || "").toString().trim();
        if (!messageRaw) {
            return res.status(400).json({ error: "Escribí el mensaje a enviar." });
        }
        const promotion = await prisma_1.prisma.promotion.findFirst({
            where: { id: promotionId, doctorId },
            include: {
                _count: true,
            },
        });
        if (!promotion) {
            return res.status(404).json({ error: "Promoción no encontrada." });
        }
        if (!doctor.whatsappBusinessNumber) {
            return res.status(400).json({
                error: "Configurá un número de WhatsApp para enviar la promoción.",
            });
        }
        const clients = await prisma_1.prisma.retailClient.findMany({
            where: { doctorId, phone: { not: null } },
            select: { id: true, phone: true },
        });
        if (!clients.length) {
            return res.status(400).json({ error: "No hay clientes con teléfono para enviar." });
        }
        // Armamos texto enriquecido de la promo
        const discountLabel = promotion.discountType === "percent"
            ? `${promotion.discountValue}% OFF`
            : `$${promotion.discountValue} de descuento`;
        let validity = "";
        if (promotion.untilStockOut) {
            validity = "Válida hasta agotar stock.";
        }
        else if (promotion.endDate) {
            validity = `Vigente hasta ${promotion.endDate.toLocaleDateString("es-AR")}.`;
        }
        const productIds = Array.isArray(promotion.productIds)
            ? promotion.productIds
            : [];
        const productNames = productIds.length > 0
            ? await prisma_1.prisma.product.findMany({
                where: { id: { in: productIds }, doctorId },
                select: { name: true },
                take: 6,
            })
            : [];
        const targetLine = productNames.length > 0
            ? `Aplica a: ${productNames.map((p) => p.name).join(", ")}`
            : ((_b = promotion.productTagLabels) === null || _b === void 0 ? void 0 : _b.length)
                ? `Aplica a tags: ${promotion.productTagLabels.join(", ")}`
                : "";
        const promoBlock = [
            `${promotion.title} — ${discountLabel}`,
            ((_c = promotion.description) === null || _c === void 0 ? void 0 : _c.trim()) || "",
            targetLine,
            validity,
        ]
            .filter(Boolean)
            .join("\n");
        const finalBody = `${messageRaw}\n\n${promoBlock}`.trim();
        let sent = 0;
        const mediaUrl = (() => {
            if (!promotion.imageUrl)
                return undefined;
            const path = promotion.imageUrl.startsWith("/")
                ? promotion.imageUrl
                : `/${promotion.imageUrl}`;
            const envBase = (APP_BASE_URL || "").replace(/\/+$/, "");
            const host = req.get("host") || "";
            const hostBase = host ? `https://${host}` : "";
            const candidates = [hostBase, envBase].filter(Boolean);
            for (const base of candidates) {
                if (!base)
                    continue;
                const url = `${base}${path}`;
                if (isLikelyPublicUrl(url) &&
                    !/localhost|127\.0\.0\.1/i.test(url)) {
                    return url;
                }
            }
            return undefined;
        })();
        for (const client of clients) {
            if (!client.phone)
                continue;
            try {
                await (0, whatsapp_1.sendWhatsAppText)(client.phone, finalBody, {
                    from: doctor.whatsappBusinessNumber,
                }, mediaUrl);
                sent += 1;
            }
            catch (err) {
                console.warn("[Promotion send] Error enviando a cliente", client.id, err);
            }
        }
        return res.json({ ok: true, sent });
    }
    catch (error) {
        console.error("Error en POST /api/commerce/promotions/:id/send:", error);
        res.status(500).json({ error: "No pudimos enviar la promoción." });
    }
});
app.delete("/api/commerce/promotions/:id", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const promotionId = Number(req.params.id);
        if (!Number.isFinite(promotionId)) {
            return res.status(400).json({ error: "ID de promoción inválido." });
        }
        const promo = await prisma_1.prisma.promotion.findFirst({
            where: { id: promotionId, doctorId },
        });
        if (!promo) {
            return res.status(404).json({ error: "Promoción no encontrada." });
        }
        await prisma_1.prisma.promotion.delete({
            where: { id: promotionId },
        });
        return res.json({ ok: true });
    }
    catch (error) {
        console.error("Error en DELETE /api/commerce/promotions/:id:", error);
        res.status(500).json({ error: "No pudimos eliminar la promoción." });
    }
});
app.post("/api/commerce/orders", auth_1.authMiddleware, async (req, res) => {
    var _a;
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const { items, client, } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "No hay items en el pedido." });
        }
        const normalizedItems = items
            .map((it) => ({
            productId: Number(it.productId),
            quantity: Number(it.quantity),
        }))
            .filter((it) => Number.isFinite(it.productId) && it.quantity > 0);
        if (normalizedItems.length === 0) {
            return res
                .status(400)
                .json({ error: "Los items del pedido no son válidos." });
        }
        const productIds = normalizedItems.map((i) => i.productId);
        const products = await prisma_1.prisma.product.findMany({
            where: { id: { in: productIds }, doctorId },
            select: { id: true, name: true, price: true, quantity: true, categories: true },
        });
        if (products.length !== productIds.length) {
            return res
                .status(400)
                .json({ error: "Algunos productos no existen o no pertenecen al negocio." });
        }
        const stockIssues = [];
        normalizedItems.forEach((item) => {
            const product = products.find((p) => p.id === item.productId);
            if (product.quantity < item.quantity) {
                stockIssues.push(product.name);
            }
        });
        if (stockIssues.length > 0) {
            return res.status(409).json({
                error: `Sin stock suficiente: ${stockIssues.join(", ")}`,
            });
        }
        const activePromotions = await (0, retail_2.getActivePromotionsForDoctor)(doctorId);
        const appliedPromotionIds = new Set();
        const pricedItems = normalizedItems.map((item) => {
            const product = products.find((p) => p.id === item.productId);
            const effective = (0, retail_2.resolvePromotionForProduct)(product, activePromotions);
            if (effective.promotionId)
                appliedPromotionIds.add(effective.promotionId);
            return {
                ...item,
                unitPrice: effective.unitPrice,
            };
        });
        const totalAmount = pricedItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
        let linkedClientId = null;
        if (client === null || client === void 0 ? void 0 : client.retailClientId) {
            const rc = await prisma_1.prisma.retailClient.findFirst({
                where: { id: client.retailClientId, doctorId },
            });
            linkedClientId = (_a = rc === null || rc === void 0 ? void 0 : rc.id) !== null && _a !== void 0 ? _a : null;
        }
        else if (client === null || client === void 0 ? void 0 : client.fullName) {
            const created = await prisma_1.prisma.retailClient.create({
                data: {
                    doctorId,
                    fullName: client.fullName,
                    phone: client.phone || null,
                    dni: client.dni || null,
                    businessAddress: client.address || null,
                },
            });
            linkedClientId = created.id;
        }
        const last = await prisma_1.prisma.order.findFirst({
            where: { doctorId },
            orderBy: { sequenceNumber: "desc" },
            select: { sequenceNumber: true },
        });
        const nextSequence = ((last === null || last === void 0 ? void 0 : last.sequenceNumber) || 0) + 1;
        const createdOrder = await prisma_1.prisma.order.create({
            data: {
                doctorId,
                sequenceNumber: nextSequence,
                status: "pending",
                totalAmount,
                customerName: (client === null || client === void 0 ? void 0 : client.fullName) || "Cliente WhatsApp",
                customerAddress: (client === null || client === void 0 ? void 0 : client.address) || null,
                customerDni: (client === null || client === void 0 ? void 0 : client.dni) || null,
                clientId: linkedClientId,
                items: {
                    create: pricedItems.map((item) => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                    })),
                },
                promotions: appliedPromotionIds.size > 0
                    ? { connect: Array.from(appliedPromotionIds).map((id) => ({ id })) }
                    : undefined,
            },
            include: {
                items: { include: { product: true } },
                attachments: true,
                promotions: true,
            },
        });
        return res.status(201).json({
            order: serializeOrderRecord(createdOrder),
        });
    }
    catch (error) {
        console.error("Error en POST /api/commerce/orders:", error);
        res.status(500).json({ error: "No pudimos crear el pedido." });
    }
});
app.patch("/api/commerce/orders/:id", auth_1.authMiddleware, async (req, res) => {
    var _a, _b, _c;
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const orderId = Number(req.params.id);
        const { items, status, paymentStatus, paidAmount, } = req.body;
        if (!Number.isFinite(orderId)) {
            return res.status(400).json({ error: "orderId inválido" });
        }
        const order = await prisma_1.prisma.order.findFirst({
            where: { id: orderId, doctorId },
            include: { items: true },
        });
        if (!order) {
            return res.status(404).json({ error: "Pedido no encontrado" });
        }
        const wantsEditItems = Array.isArray(items) && items.length > 0;
        if (wantsEditItems && order.status !== "pending") {
            return res
                .status(400)
                .json({ error: "Solo se pueden editar pedidos en revisión." });
        }
        if (order.inventoryDeducted && Array.isArray(items) && items.length > 0) {
            return res
                .status(400)
                .json({ error: "El stock ya fue descontado; no se pueden editar ítems en este estado." });
        }
        let updateData = {};
        if (status && ["pending", "confirmed", "cancelled"].includes(status)) {
            updateData.status = status;
        }
        const normalizedPaidAmount = paidAmount === undefined || paidAmount === null ? undefined : Math.max(0, Number(paidAmount));
        const normalizedPaymentStatus = paymentStatus && ["unpaid", "paid", "partial"].includes(paymentStatus)
            ? paymentStatus
            : undefined;
        if (normalizedPaidAmount !== undefined) {
            updateData.paidAmount = normalizedPaidAmount;
        }
        if (normalizedPaymentStatus) {
            updateData.paymentStatus = normalizedPaymentStatus;
        }
        else if (normalizedPaidAmount !== undefined) {
            if (normalizedPaidAmount === 0) {
                updateData.paymentStatus = "unpaid";
            }
            else if (normalizedPaidAmount >= order.totalAmount) {
                updateData.paymentStatus = "paid";
            }
            else {
                updateData.paymentStatus = "partial";
            }
        }
        if (Array.isArray(items) && items.length > 0) {
            const normalizedItems = items
                .map((it) => ({
                productId: Number(it.productId),
                quantity: Number(it.quantity),
            }))
                .filter((it) => Number.isFinite(it.productId) && it.quantity > 0);
            if (normalizedItems.length === 0) {
                return res
                    .status(400)
                    .json({ error: "Los items del pedido no son válidos." });
            }
            const productIds = normalizedItems.map((i) => i.productId);
            const products = await prisma_1.prisma.product.findMany({
                where: { id: { in: productIds }, doctorId },
                select: { id: true, name: true, price: true, quantity: true, categories: true },
            });
            if (products.length !== productIds.length) {
                return res
                    .status(400)
                    .json({ error: "Algunos productos no existen o no pertenecen al negocio." });
            }
            const stockIssues = [];
            normalizedItems.forEach((item) => {
                const product = products.find((p) => p.id === item.productId);
                if (product.quantity < item.quantity) {
                    stockIssues.push(product.name);
                }
            });
            if (stockIssues.length > 0) {
                return res.status(409).json({
                    error: `Sin stock suficiente: ${stockIssues.join(", ")}`,
                });
            }
            const activePromotions = await (0, retail_2.getActivePromotionsForDoctor)(doctorId);
            const appliedPromotionIds = new Set();
            const pricedItems = normalizedItems.map((item) => {
                const product = products.find((p) => p.id === item.productId);
                const effective = (0, retail_2.resolvePromotionForProduct)(product, activePromotions);
                if (effective.promotionId)
                    appliedPromotionIds.add(effective.promotionId);
                return {
                    ...item,
                    unitPrice: effective.unitPrice,
                };
            });
            const totalAmount = pricedItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
            await prisma_1.prisma.$transaction([
                prisma_1.prisma.orderItem.deleteMany({ where: { orderId: order.id } }),
                prisma_1.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        ...updateData,
                        totalAmount,
                        items: {
                            create: pricedItems.map((item) => ({
                                productId: item.productId,
                                quantity: item.quantity,
                                unitPrice: item.unitPrice,
                            })),
                        },
                        promotions: { set: Array.from(appliedPromotionIds).map((id) => ({ id })) },
                    },
                }),
            ]);
        }
        else if (Object.keys(updateData).length > 0) {
            await prisma_1.prisma.order.update({
                where: { id: order.id },
                data: updateData,
            });
        }
        let updated = await prisma_1.prisma.order.findUnique({
            where: { id: order.id },
            include: { items: { include: { product: true } }, attachments: true, promotions: true },
        });
        const confirmingRequested = status === "confirmed" || updateData.status === "confirmed";
        if (updated && confirmingRequested && !updated.inventoryDeducted) {
            const needByProductId = new Map();
            for (const it of updated.items || []) {
                needByProductId.set(it.productId, ((_a = needByProductId.get(it.productId)) !== null && _a !== void 0 ? _a : 0) + it.quantity);
            }
            const productIds = Array.from(needByProductId.keys());
            const products = await prisma_1.prisma.product.findMany({
                where: { id: { in: productIds }, doctorId },
                select: { id: true, name: true, quantity: true },
            });
            const prodById = new Map(products.map((p) => [p.id, p]));
            const shortages = [];
            for (const [pid, need] of needByProductId.entries()) {
                const p = prodById.get(pid);
                const have = (_b = p === null || p === void 0 ? void 0 : p.quantity) !== null && _b !== void 0 ? _b : 0;
                if (!p || have < need) {
                    shortages.push({ name: (_c = p === null || p === void 0 ? void 0 : p.name) !== null && _c !== void 0 ? _c : "Producto", have, need });
                }
            }
            if (shortages.length > 0) {
                const msg = shortages
                    .map((s) => `• ${s.name}: pediste ${s.need}, hay ${s.have}`)
                    .join("\n");
                return res.status(409).json({
                    error: `Sin stock suficiente:\n${msg}`,
                });
            }
            try {
                await prisma_1.prisma.$transaction(async (tx) => {
                    for (const [pid, need] of needByProductId.entries()) {
                        const r = await tx.product.updateMany({
                            where: { id: pid, doctorId, quantity: { gte: need } },
                            data: { quantity: { decrement: need } },
                        });
                        if (r.count !== 1) {
                            throw new Error(`NO_STOCK_RACE:${pid}:${need}`);
                        }
                    }
                    await tx.order.update({
                        where: { id: updated.id },
                        data: {
                            inventoryDeducted: true,
                            inventoryDeductedAt: new Date(),
                        },
                    });
                });
            }
            catch (e) {
                if (typeof (e === null || e === void 0 ? void 0 : e.message) === "string" && e.message.startsWith("NO_STOCK_RACE:")) {
                    return res.status(409).json({
                        error: "Se quedó sin stock mientras confirmabas. Probá ajustar cantidades o reemplazar productos.",
                    });
                }
                throw e;
            }
            updated = await prisma_1.prisma.order.findUnique({
                where: { id: order.id },
                include: { items: { include: { product: true } }, attachments: true, promotions: true },
            });
        }
        res.json({
            order: updated ? serializeOrderRecord(updated) : null,
        });
    }
    catch (error) {
        console.error("Error en PATCH /api/commerce/orders/:id:", error);
        res.status(500).json({ error: "No pudimos actualizar el pedido." });
    }
});
app.post("/api/commerce/orders/:id/attachments", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const orderId = Number(req.params.id);
        if (!Number.isFinite(orderId)) {
            return res.status(400).json({ error: "orderId inválido" });
        }
        const { fileBase64, filename } = req.body;
        if (!fileBase64 || typeof fileBase64 !== "string") {
            return res.status(400).json({ error: "Falta el archivo a subir." });
        }
        const order = await prisma_1.prisma.order.findFirst({
            where: { id: orderId, doctorId },
        });
        if (!order) {
            return res.status(404).json({ error: "Pedido no encontrado" });
        }
        let saved;
        try {
            saved = await saveOrderAttachmentFile(orderId, fileBase64, filename);
        }
        catch (error) {
            if (typeof (error === null || error === void 0 ? void 0 : error.message) === "string" && (error === null || error === void 0 ? void 0 : error.code) === "IMAGE_VALIDATION_ERROR") {
                return res.status(400).json({ error: error.message });
            }
            throw error;
        }
        const attachment = await prisma_1.prisma.orderAttachment.create({
            data: {
                orderId,
                url: saved.url,
                filename: saved.filename,
                mimeType: saved.mime,
            },
        });
        return res.status(201).json({
            attachment: {
                id: attachment.id,
                url: attachment.url,
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                createdAt: attachment.createdAt,
            },
        });
    }
    catch (error) {
        console.error("Error en POST /api/commerce/orders/:id/attachments:", error);
        res.status(500).json({ error: "No pudimos subir el comprobante." });
    }
});
app.get("/api/commerce/chat-control", auth_1.authMiddleware, async (req, res) => {
    var _a, _b;
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const phone = typeof req.query.phone === "string" ? req.query.phone : null;
        if (!phone) {
            return res.status(400).json({ error: "Falta el teléfono." });
        }
        const client = await prisma_1.prisma.retailClient.findFirst({
            where: { doctorId, phone },
            select: { id: true, manualChatHold: true },
        });
        return res.json({
            hold: (_a = client === null || client === void 0 ? void 0 : client.manualChatHold) !== null && _a !== void 0 ? _a : false,
            clientId: (_b = client === null || client === void 0 ? void 0 : client.id) !== null && _b !== void 0 ? _b : null,
        });
    }
    catch (error) {
        console.error("Error en GET /api/commerce/chat-control:", error);
        res.status(500).json({ error: "No pudimos obtener el estado del chat." });
    }
});
app.patch("/api/commerce/chat-control", auth_1.authMiddleware, async (req, res) => {
    var _a, _b;
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const phone = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.phone) === "string" ? req.body.phone : null;
        const hold = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.hold) === "boolean" ? req.body.hold : null;
        if (!phone || hold === null) {
            return res.status(400).json({ error: "Faltan parámetros (phone, hold)." });
        }
        const client = await prisma_1.prisma.retailClient.findFirst({
            where: { doctorId, phone },
            select: { id: true, manualChatHold: true },
        });
        if (!client) {
            return res.status(404).json({ error: "Cliente no encontrado." });
        }
        const updated = await prisma_1.prisma.retailClient.update({
            where: { id: client.id },
            data: { manualChatHold: hold },
            select: { id: true, manualChatHold: true },
        });
        return res.json({
            ok: true,
            clientId: updated.id,
            hold: updated.manualChatHold,
        });
    }
    catch (error) {
        console.error("Error en PATCH /api/commerce/chat-control:", error);
        res.status(500).json({ error: "No pudimos actualizar el estado del chat." });
    }
});
app.delete("/api/commerce/orders/:id", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor || doctor.businessType !== "RETAIL") {
            return res.status(403).json({ error: "Sección disponible solo para comercios." });
        }
        const orderId = Number(req.params.id);
        if (!Number.isFinite(orderId)) {
            return res.status(400).json({ error: "orderId inválido" });
        }
        const order = await prisma_1.prisma.order.findFirst({
            where: { id: orderId, doctorId },
        });
        if (!order) {
            return res.status(404).json({ error: "Pedido no encontrado" });
        }
        const attachments = await prisma_1.prisma.orderAttachment.findMany({
            where: { orderId },
        });
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.orderItem.deleteMany({ where: { orderId } }),
            prisma_1.prisma.orderAttachment.deleteMany({ where: { orderId } }),
            prisma_1.prisma.order.delete({ where: { id: orderId } }),
        ]);
        await Promise.all(attachments.map((att) => removeUploadedFile(att.url).catch(() => { })));
        return res.json({ ok: true });
    }
    catch (error) {
        console.error("Error en DELETE /api/commerce/orders/:id:", error);
        res.status(500).json({ error: "No pudimos eliminar el pedido." });
    }
});
app.delete("/api/products/:id/tags/:tagId", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const productId = Number(req.params.id);
        const tagId = Number(req.params.tagId);
        if (isNaN(productId) || isNaN(tagId)) {
            return res.status(400).json({ error: "Parámetros inválidos" });
        }
        const tag = await prisma_1.prisma.productTag.findFirst({
            where: { id: tagId, productId, doctorId },
        });
        if (!tag) {
            return res.status(404).json({ error: "Etiqueta no encontrada" });
        }
        await prisma_1.prisma.productTag.delete({
            where: { id: tag.id },
        });
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Error en DELETE /api/products/:id/tags/:tagId:", error);
        res.status(500).json({
            error: "No pudimos eliminar la etiqueta.",
        });
    }
});
/**
 * Historial de mensajes de un paciente
 */
app.get("/api/patients/:id/messages", auth_1.authMiddleware, async (req, res) => {
    try {
        const doctorId = req.doctorId;
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        const patientId = Number(req.params.id);
        if (isNaN(patientId)) {
            return res.status(400).json({ error: "patientId inválido" });
        }
        if (doctor.businessType === "RETAIL") {
            const client = await prisma_1.prisma.retailClient.findFirst({
                where: { id: patientId, doctorId },
            });
            if (!client) {
                return res.status(404).json({ error: "Cliente no encontrado" });
            }
            const messages = await prisma_1.prisma.message.findMany({
                where: { retailClientId: client.id, doctorId },
                orderBy: { createdAt: "asc" },
            });
            return res.json({ messages });
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
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { businessType: true },
        });
        if (!doctor) {
            return res.status(404).json({ error: "Doctor no encontrado" });
        }
        const now = new Date();
        const appointmentRecentThreshold = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2);
        if (doctor.businessType === "RETAIL") {
            const recentOrderThreshold = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3);
            const recentClientThreshold = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2);
            const [newOrders, newClients] = await Promise.all([
                prisma_1.prisma.order.findMany({
                    where: {
                        doctorId,
                        status: "pending",
                        createdAt: { gte: recentOrderThreshold },
                    },
                    orderBy: { createdAt: "desc" },
                    take: 25,
                }),
                prisma_1.prisma.retailClient.findMany({
                    where: {
                        doctorId,
                        createdAt: { gte: recentClientThreshold },
                        orders: { none: {} }, // clientes que aún no tienen pedidos
                    },
                    orderBy: { createdAt: "desc" },
                    take: 25,
                }),
            ]);
            return res.json({
                documents: [],
                newAppointments: [],
                incompletePatients: [],
                newOrders: newOrders.map((order) => ({
                    id: order.id,
                    sequenceNumber: order.sequenceNumber,
                    customerName: order.customerName,
                    totalAmount: order.totalAmount,
                    createdAt: order.createdAt.toISOString(),
                })),
                newClients: newClients.map((c) => ({
                    id: c.id,
                    fullName: c.fullName,
                    phone: c.phone,
                    createdAt: c.createdAt.toISOString(),
                })),
                overdueOrders: [],
            });
        }
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
        const { displayPhoneNumber, status, businessType, } = req.body;
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
        const normalizedBusinessType = businessType === "RETAIL" ? "RETAIL" : "HEALTH";
        const normalizedNumber = normalizeWhatsappSender(displayPhoneNumber);
        const number = await prisma_1.prisma.whatsAppNumber.upsert({
            where: { displayPhoneNumber: normalizedNumber },
            update: {
                displayPhoneNumber: normalizedNumber,
                status: normalizedStatus,
                businessType: normalizedBusinessType,
                ...(normalizedStatus === "available"
                    ? { assignedDoctorId: null }
                    : {}),
            },
            create: {
                displayPhoneNumber: normalizedNumber,
                status: normalizedStatus,
                businessType: normalizedBusinessType,
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
