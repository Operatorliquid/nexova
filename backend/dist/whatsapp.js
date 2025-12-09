"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkTwilioConnectivity = checkTwilioConnectivity;
exports.sendWhatsAppText = sendWhatsAppText;
const axios_1 = __importDefault(require("axios"));
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "";
const TWILIO_API_URL = TWILIO_ACCOUNT_SID
    ? `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
    : null;
async function checkTwilioConnectivity() {
    var _a, _b;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        return {
            ok: false,
            message: "Twilio no está configurado. Completá TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN.",
        };
    }
    const infoUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json`;
    const start = Date.now();
    try {
        await axios_1.default.get(infoUrl, {
            auth: {
                username: TWILIO_ACCOUNT_SID,
                password: TWILIO_AUTH_TOKEN,
            },
        });
        return {
            ok: true,
            message: "Conexión establecida correctamente.",
            latencyMs: Date.now() - start,
        };
    }
    catch (error) {
        const detail = ((_b = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) ||
            (error === null || error === void 0 ? void 0 : error.message) ||
            "No pudimos comunicarnos con Twilio.";
        return {
            ok: false,
            message: detail,
            latencyMs: Date.now() - start,
        };
    }
}
/**
 * Envía un mensaje usando Twilio WhatsApp.
 */
async function sendWhatsAppText(to, body, credentials) {
    if (!TWILIO_API_URL || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        throw new Error("Twilio no está configurado. Completá TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en el .env");
    }
    const sender = normalizeFrom((credentials === null || credentials === void 0 ? void 0 : credentials.from) || TWILIO_WHATSAPP_FROM);
    if (!sender) {
        throw new Error("No hay número de WhatsApp asignado. Conectá un número de Twilio.");
    }
    const normalizedTo = normalizeRecipient(to);
    const params = new URLSearchParams();
    params.set("To", normalizedTo);
    params.set("From", sender);
    params.set("Body", body);
    const response = await axios_1.default.post(TWILIO_API_URL, params.toString(), {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        auth: {
            username: TWILIO_ACCOUNT_SID,
            password: TWILIO_AUTH_TOKEN,
        },
    });
    return response.data;
}
function normalizeFrom(raw) {
    if (!raw)
        return null;
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    if (trimmed.startsWith("whatsapp:"))
        return trimmed;
    return `whatsapp:${trimmed.startsWith("+") ? trimmed : `+${trimmed}`}`;
}
function normalizeRecipient(raw) {
    if (!raw)
        return raw;
    let cleaned = raw.toString().trim();
    if (cleaned.startsWith("whatsapp:")) {
        cleaned = cleaned.replace(/^whatsapp:/, "");
    }
    cleaned = cleaned.replace(/[\s-]/g, "");
    if (cleaned.startsWith("00")) {
        cleaned = `+${cleaned.slice(2)}`;
    }
    else if (!cleaned.startsWith("+")) {
        cleaned = `+${cleaned}`;
    }
    return `whatsapp:${cleaned}`;
}
