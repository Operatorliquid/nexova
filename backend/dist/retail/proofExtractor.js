"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadTwilioMedia = downloadTwilioMedia;
exports.sha256 = sha256;
exports.imageDhashHex = imageDhashHex;
exports.guessExt = guessExt;
exports.extractProofWithOpenAI = extractProofWithOpenAI;
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const sharp_1 = __importDefault(require("sharp"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
async function downloadTwilioMedia(mediaUrl) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        throw new Error("Falta TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN");
    }
    const res = await axios_1.default.get(mediaUrl, {
        responseType: "arraybuffer",
        auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN },
    });
    return Buffer.from(res.data);
}
function sha256(buf) {
    return crypto_1.default.createHash("sha256").update(buf).digest("hex");
}
/**
 * dHash simple (9x8 grayscale). Sirve para detectar "mismo comprobante" aunque sea screenshot.
 */
async function imageDhashHex(buf) {
    try {
        const { data } = await (0, sharp_1.default)(buf)
            .grayscale()
            .resize(9, 8, { fit: "fill" })
            .raw()
            .toBuffer({ resolveWithObject: true });
        // 9*8 = 72 bytes
        let bits = "";
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const left = data[y * 9 + x];
                const right = data[y * 9 + (x + 1)];
                bits += left < right ? "1" : "0";
            }
        }
        // 64 bits -> hex
        let hex = "";
        for (let i = 0; i < 64; i += 4) {
            const nibble = bits.slice(i, i + 4);
            hex += parseInt(nibble, 2).toString(16);
        }
        return hex;
    }
    catch {
        return null;
    }
}
function guessExt(contentType) {
    const ct = (contentType || "").toLowerCase();
    if (ct.includes("pdf"))
        return "pdf";
    if (ct.includes("png"))
        return "png";
    if (ct.includes("jpeg") || ct.includes("jpg"))
        return "jpg";
    return "bin";
}
function normalizeArMoney(value) {
    const v = value.trim().replace(/\s/g, "");
    if (!v)
        return null;
    if (v.includes(",")) {
        const cleaned = v.replace(/\./g, "").replace(",", ".");
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : null;
    }
    const num = Number(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(num) ? num : null;
}
async function extractProofWithOpenAI(opts) {
    const { openai, buffer, contentType } = opts;
    const isPdf = contentType.toLowerCase().includes("pdf");
    const ext = guessExt(contentType);
    const tmpPath = path_1.default.join(os_1.default.tmpdir(), `proof-${Date.now()}.${ext}`);
    fs_1.default.writeFileSync(tmpPath, buffer);
    const uploaded = await openai.files.create({
        file: fs_1.default.createReadStream(tmpPath),
        purpose: isPdf ? "user_data" : "vision",
    });
    const prompt = `
Sos un extractor de comprobantes (transferencia / pago).
Devolvé SOLO JSON válido con esta forma exacta:

{
  "isPaymentProof": true/false,
  "amount": number|null,
  "currency": "ARS"|"USD"|null,
  "reference": string|null,
  "dateISO": "YYYY-MM-DD"|null,
  "confidence": number,
  "notes": string|null
}

Reglas:
- "amount" es el monto TOTAL pagado (no subtotal).
- Si no estás seguro, poné null y baja confidence.
- Si ves formato argentino (1.234,56) interpretalo bien.
`;
    const imageUrlData = isPdf && contentType.toLowerCase().includes("pdf")
        ? null
        : `data:${contentType};base64,${buffer.toString("base64")}`;
    const resp = await openai.responses.create({
        model: process.env.OPENAI_PROOF_MODEL || "gpt-4.1-mini",
        input: [
            {
                role: "user",
                content: [
                    { type: "input_text", text: prompt },
                    isPdf
                        ? { type: "input_file", file_id: uploaded.id }
                        : { type: "input_image", image_url: imageUrlData, detail: "auto" },
                ],
            },
        ],
        temperature: 0,
    });
    const rawText = resp.output_text ||
        JSON.stringify(resp.output || resp, null, 2);
    let parsed = null;
    try {
        parsed = JSON.parse(rawText);
    }
    catch {
        const m = rawText.match(/\{[\s\S]*\}/);
        if (m)
            parsed = JSON.parse(m[0]);
    }
    const amount = typeof (parsed === null || parsed === void 0 ? void 0 : parsed.amount) === "number"
        ? parsed.amount
        : typeof (parsed === null || parsed === void 0 ? void 0 : parsed.amount) === "string"
            ? normalizeArMoney(parsed.amount)
            : null;
    return {
        isPaymentProof: !!(parsed === null || parsed === void 0 ? void 0 : parsed.isPaymentProof),
        amount: amount !== null && amount !== void 0 ? amount : null,
        currency: (parsed === null || parsed === void 0 ? void 0 : parsed.currency) === "ARS" || (parsed === null || parsed === void 0 ? void 0 : parsed.currency) === "USD" ? parsed.currency : null,
        reference: typeof (parsed === null || parsed === void 0 ? void 0 : parsed.reference) === "string" ? parsed.reference.slice(0, 80) : null,
        dateISO: typeof (parsed === null || parsed === void 0 ? void 0 : parsed.dateISO) === "string" ? parsed.dateISO.slice(0, 10) : null,
        confidence: typeof (parsed === null || parsed === void 0 ? void 0 : parsed.confidence) === "number"
            ? Math.max(0, Math.min(1, parsed.confidence))
            : 0.4,
        notes: typeof (parsed === null || parsed === void 0 ? void 0 : parsed.notes) === "string" ? parsed.notes.slice(0, 160) : null,
    };
}
