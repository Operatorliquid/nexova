import axios from "axios";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "";
const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL || "";
const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY || "";

type WhatsappProvider = "twilio" | "infobip";

function resolveWhatsappProvider(): WhatsappProvider {
  return process.env.WHATSAPP_PROVIDER?.toLowerCase() === "infobip"
    ? "infobip"
    : "twilio";
}

export type WhatsappCredentials = {
  from?: string | null;
};

const TWILIO_API_URL = TWILIO_ACCOUNT_SID
  ? `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  : null;

type ServiceCheckResult = {
  ok: boolean;
  message: string;
  latencyMs?: number;
};

export async function checkTwilioConnectivity(): Promise<ServiceCheckResult> {
  if (resolveWhatsappProvider() === "infobip") {
    if (!INFOBIP_BASE_URL || !INFOBIP_API_KEY) {
      return {
        ok: false,
        message:
          "Infobip no está configurado. Completá INFOBIP_BASE_URL y INFOBIP_API_KEY.",
      };
    }
    return {
      ok: true,
      message: "Infobip configurado. Conectividad no validada.",
    };
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return {
      ok: false,
      message:
        "Twilio no está configurado. Completá TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN.",
    };
  }
  const infoUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json`;
  const start = Date.now();
  try {
    await axios.get(infoUrl, {
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
  } catch (error: any) {
    const detail =
      error?.response?.data?.message ||
      error?.message ||
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
export async function sendWhatsAppText(
  to: string,
  body: string,
  credentials?: WhatsappCredentials,
  mediaUrl?: string
) {
  if (resolveWhatsappProvider() === "infobip") {
    return sendInfobipWhatsAppText(to, body, credentials, mediaUrl);
  }

  if (!TWILIO_API_URL || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error(
      "Twilio no está configurado. Completá TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en el .env"
    );
  }

  const sender = normalizeFrom(credentials?.from || TWILIO_WHATSAPP_FROM);
  if (!sender) {
    throw new Error(
      "No hay número de WhatsApp asignado. Conectá un número de Twilio."
    );
  }

  const normalizedTo = normalizeRecipient(to);

  const params = new URLSearchParams();
  params.set("To", normalizedTo);
  params.set("From", sender);
  params.set("Body", body);
  if (mediaUrl) {
    params.set("MediaUrl", mediaUrl);
  }

  const response = await axios.post(TWILIO_API_URL, params.toString(), {
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

function normalizeInfobipBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
}

function normalizeInfobipNumber(raw: string): string {
  if (!raw) return raw;
  let cleaned = raw.toString().trim();
  cleaned = cleaned.replace(/^whatsapp:/i, "");
  cleaned = cleaned.replace(/[\s-]/g, "");
  cleaned = cleaned.replace(/^\+/, "");
  return cleaned;
}

async function sendInfobipWhatsAppText(
  to: string,
  body: string,
  credentials?: WhatsappCredentials,
  mediaUrl?: string
) {
  if (!INFOBIP_BASE_URL || !INFOBIP_API_KEY) {
    throw new Error(
      "Infobip no está configurado. Completá INFOBIP_BASE_URL y INFOBIP_API_KEY en el .env"
    );
  }

  const sender = normalizeInfobipNumber(
    credentials?.from || process.env.INFOBIP_WHATSAPP_FROM || TWILIO_WHATSAPP_FROM
  );
  if (!sender) {
    throw new Error(
      "No hay número de WhatsApp asignado. Conectá un número de Infobip."
    );
  }

  const normalizedTo = normalizeInfobipNumber(to);
  const baseUrl = normalizeInfobipBaseUrl(INFOBIP_BASE_URL);
  const mediaEndpoint = mediaUrl ? inferInfobipMediaEndpoint(mediaUrl) : null;
  const endpoint = mediaEndpoint
    ? `${baseUrl}/whatsapp/1/message/${mediaEndpoint}`
    : `${baseUrl}/whatsapp/1/message/text`;

  const payload = mediaUrl
    ? {
        from: sender,
        to: normalizedTo,
        content: {
          mediaUrl,
          caption: body,
        },
      }
    : {
        from: sender,
        to: normalizedTo,
        content: {
          text: body,
        },
      };

  const response = await axios.post(endpoint, payload, {
    headers: {
      Authorization: `App ${INFOBIP_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

function inferInfobipMediaEndpoint(mediaUrl: string): "image" | "document" {
  const lower = mediaUrl.toLowerCase();
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)(\?|$)/.test(lower)) {
    return "document";
  }
  return "image";
}

function normalizeFrom(raw?: string | null) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  return `whatsapp:${trimmed.startsWith("+") ? trimmed : `+${trimmed}`}`;
}

function normalizeRecipient(raw: string): string {
  if (!raw) return raw;

  let cleaned = raw.toString().trim();
  if (cleaned.startsWith("whatsapp:")) {
    cleaned = cleaned.replace(/^whatsapp:/, "");
  }

  cleaned = cleaned.replace(/[\s-]/g, "");

  if (cleaned.startsWith("00")) {
    cleaned = `+${cleaned.slice(2)}`;
  } else if (!cleaned.startsWith("+")) {
    cleaned = `+${cleaned}`;
  }

  return `whatsapp:${cleaned}`;
}
