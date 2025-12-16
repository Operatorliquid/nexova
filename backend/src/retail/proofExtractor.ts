import crypto from "crypto";
import axios from "axios";
import OpenAI from "openai";
import sharp from "sharp";
import fs from "fs";
import os from "os";
import path from "path";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";

export type ProofExtraction = {
  isPaymentProof: boolean;
  amount: number | null; // en pesos (ej 880)
  currency: "ARS" | "USD" | null;
  reference: string | null; // nro operación / comprobante si aparece
  dateISO: string | null; // YYYY-MM-DD si aparece
  confidence: number; // 0..1
  notes: string | null;
};

export async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Falta TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN");
  }

  const res = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN },
  });
  return Buffer.from(res.data);
}

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * dHash simple (9x8 grayscale). Sirve para detectar "mismo comprobante" aunque sea screenshot.
 */
export async function imageDhashHex(buf: Buffer): Promise<string | null> {
  try {
    const { data } = await sharp(buf)
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
  } catch {
    return null;
  }
}

export function guessExt(contentType?: string | null) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("pdf")) return "pdf";
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  return "bin";
}

function normalizeArMoney(value: string): number | null {
  const v = value.trim().replace(/\s/g, "");
  if (!v) return null;
  if (v.includes(",")) {
    const cleaned = v.replace(/\./g, "").replace(",", ".");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? num : null;
}

export async function extractProofWithOpenAI(opts: {
  openai: OpenAI;
  buffer: Buffer;
  contentType: string;
  fileName?: string;
}): Promise<ProofExtraction> {
  const { openai, buffer, contentType } = opts;

  const isPdf = contentType.toLowerCase().includes("pdf");
  const ext = guessExt(contentType);
  const tmpPath = path.join(os.tmpdir(), `proof-${Date.now()}.${ext}`);
  fs.writeFileSync(tmpPath, buffer);

  const uploaded = await openai.files.create({
    file: fs.createReadStream(tmpPath),
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

  const imageUrlData =
    isPdf && contentType.toLowerCase().includes("pdf")
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
            : { type: "input_image", image_url: imageUrlData!, detail: "auto" },
        ],
      },
    ],
    temperature: 0,
  });

  const rawText =
    (resp as any).output_text ||
    JSON.stringify((resp as any).output || (resp as any), null, 2);

  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const m = rawText.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }

  const amount =
    typeof parsed?.amount === "number"
      ? parsed.amount
      : typeof parsed?.amount === "string"
      ? normalizeArMoney(parsed.amount)
      : null;

  return {
    isPaymentProof: !!parsed?.isPaymentProof,
    amount: amount ?? null,
    currency: parsed?.currency === "ARS" || parsed?.currency === "USD" ? parsed.currency : null,
    reference: typeof parsed?.reference === "string" ? parsed.reference.slice(0, 80) : null,
    dateISO: typeof parsed?.dateISO === "string" ? parsed.dateISO.slice(0, 10) : null,
    confidence:
      typeof parsed?.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.4,
    notes: typeof parsed?.notes === "string" ? parsed.notes.slice(0, 160) : null,
  };
}
