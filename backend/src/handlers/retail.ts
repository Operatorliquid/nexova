import { prisma } from "../prisma";
import { sendWhatsAppText } from "../whatsapp";
import { appendMenuHintForBusiness } from "../utils/hints";
import { matchProductName, upsertRetailOrder } from "../utils/retail";
import { normalizeDniInput } from "../utils/text";
import { createCatalogPdf } from "../retail/catalogPdf";
import { PaymentProofStatus, type Patient, type RetailClient } from "@prisma/client";

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca acentos
    .replace(/[^a-z0-9\s]/g, " ") // saca signos/emoji
    .replace(/\s+/g, " ")
    .trim();

const hasModifyIntent = (t: string) =>
  /\b(sum(ar|ame|a)?|agreg(ar|ame|a|alas)?|anad(ir|ime|i)?|quit(a|ame|a)?|sac(a|ame|a)?|borra|elimin(a|ame|a)?|sin|cambi(a|ame|a)?|reemplaz(a|ame|a)?)\b/i.test(
    t
  );

const isConfirmText = (raw: string) => {
  const t = norm(raw);

  if (hasModifyIntent(t)) return false;
  if (/\bconfirm/.test(t)) return true;

  const yes = new Set([
    "ok",
    "oka",
    "okey",
    "okay",
    "dale",
    "listo",
    "si",
    "s",
    "genial",
    "perfecto",
    "buenisimo",
    "barbaro",
    "joya",
    "de una",
    "deuna",
    "mandale",
    "esta bien",
    "ta bien",
    "todo bien",
    "asi esta bien",
    "asi esta ok",
  ]);
  return yes.has(t);
};

const stem = (w: string) => w.replace(/(es|s)$/i, "");

const appearsInMessage = (itemName: string, rawText: string) => {
  const msg = norm(rawText);
  const msgTokens = msg.split(" ").filter((t) => t.length >= 3);
  const tokens = norm(itemName)
    .split(" ")
    .map(stem)
    .filter((t) => t.length >= 3);

  if (tokens.length === 0) return false;
  // Allow light partial matches so “cocas” matches “CocaCola”.
  return tokens.some((t) => {
    if (msg.includes(t)) return true;
    if (t.length >= 4 && msg.includes(t.slice(0, 4))) return true;
    return msgTokens.some((mt) => t.includes(mt) || mt.includes(t));
  });
};


// ===============================
// ✅ Detección de consultas vs pedido (para NO agregar cosas por una pregunta)
// ===============================
const hasOrderVerb = (t: string) =>
  /\b(quiero|dame|mandame|armame|haceme|hace(me)?|poneme|sumar|suma|agregar|agrega|anadir|añadir|llevo|te pido|pasame|anota|anotame|meteme)\b/i.test(
    t
  );

const hasQtyPattern = (t: string) => /\b\d+\s*(?:x|×)?\s*[a-z]\b/i.test(t);

const looksLikeInquiry = (raw: string) => {
  const t = norm(raw || "");
  if (!t) return false;
  // Si hay verbo de compra/modificación o patrón de cantidad, NO es consulta.
  if (hasOrderVerb(t) || hasQtyPattern(t)) return false;
  // Pregunta explícita
  if ((raw || "").includes("?")) return true;
  // Preguntas típicas (sin cantidad)
  return /\b(tenes|tienen|hay|vendes|venden|stock|disponible|precio|cuanto|a cuanto|sale)\b/i.test(t);
};

const extractInquiryTerm = (raw: string) => {
  const t = norm(raw || "");
  // sacamos frases comunes
  return t
    .replace(
      /\b(tenes|tienen|hay|vendes|venden|me decis|decime|por favor|precio|cuanto sale|cuanto|a cuanto|sale)\b/g,
      ""
    )
    .replace(/\b(el|la|los|las|un|una|unos|unas|de|del)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const productSearchText = (p: any) =>
  norm(
    [
      p?.name || "",
      ...(Array.isArray(p?.categories) ? p.categories : []),
      p?.description || "",
      ...(Array.isArray(p?.tags) ? p.tags.map((t: any) => t.label) : []),
    ].join(" ")
  );

const findProductsByTerm = (term: string, products: any[], limit = 6) => {
  const q = norm(term || "");
  if (!q) return [];
  const tokens = q
    .split(" ")
    .filter((w) => w.length >= 3 && !["cual", "cuales", "que"].includes(w));

  const beveragePattern =
    /(bebid|gaseos|refresc|soda|cola|coca|pepsi|sprite|fanta|agua|jugo|cerveza|vino|fernet|aperitiv|energ|tonic)/i;
  const isBeverageQuery = beveragePattern.test(q);

  const scored = products
    .map((p) => {
      const txt = productSearchText(p);
      let score = 0;
      for (const tok of tokens) {
        if (txt.includes(tok)) score += 2;
        else if (tok.length >= 4 && txt.includes(tok.slice(0, 4))) score += 1;
      }
      // boost si es término genérico tipo galletitas/snacks
      if (/(galletit|galleta|snack|bizcoch)/.test(q) && /(galletit|galleta|snack|bizcoch)/.test(txt)) score += 2;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);

  if (scored.length === 0 && isBeverageQuery) {
    return products
      .filter((p) => beveragePattern.test(productSearchText(p)))
      .slice(0, limit);
  }

  return scored;
};

const formatProductOptions = (list: any[]) =>
  list
    .map(
      (p: any, i: number) =>
        `${i + 1}) ${p.name} — $${p.price ?? 0} (stock: ${p.quantity ?? 0})`
    )
    .join("\n");

// ===============================
// ✅ Estado conversacional 24h (para seguir el hilo cuando hacemos preguntas)
// Guarda cosas como: "¿Cuál galletita querés?" -> el próximo mensaje "2" se interpreta bien
// ===============================
const STATE_TTL_MS = 24 * 60 * 60 * 1000;

type RetailConversationState = {
  awaiting?:
    | {
        kind: "product_clarification";
        phase?: "choose" | "quantity";
        term?: string;
        productName?: string;
        candidates?: Array<{ productId: number; name: string }>;
        desiredQuantity?: number;
        op?: "add" | "set" | "remove";
        orderSequence?: number | null;
        orderId?: number | null;
        createdAt: number;
        prompt?: string;
      }
    | {
        kind: "proof_decision";
        proofId?: number | null;
        candidateSeq: number | null;
        createdAt: number;
        prompt?: string;
      }
    | {
        kind: "catalog_offer";
        createdAt: number;
        prompt?: string;
      }
    | {
        kind: "location_offer";
        createdAt: number;
        prompt?: string;
      }
    | {
        kind: "cancel_confirmation";
        orderSequence?: number | null;
        orderId?: number | null;
        createdAt: number;
        prompt?: string;
      }
    | {
        kind: "confirm_order";
        orderSequence?: number | null;
        orderId?: number | null;
        createdAt: number;
        prompt?: string;
      }
    | {
        kind: "stock_replacement";
        missing: Array<{ productId: number; name: string; need: number; have: number }>;
        orderSequence?: number | null;
        orderId?: number | null;
        createdAt: number;
        prompt?: string;
      }
    | {
        kind: "promo_offer";
        createdAt: number;
        prompt?: string;
      }
    | null;
};

async function loadRetailConversationState(clientId: number): Promise<RetailConversationState> {
  const row = await prisma.retailClient.findUnique({
    where: { id: clientId },
    select: { conversationState: true, conversationStateUpdatedAt: true },
  });

  const updatedAt = (row as any)?.conversationStateUpdatedAt
    ? new Date((row as any).conversationStateUpdatedAt).getTime()
    : 0;

  if (!updatedAt || Date.now() - updatedAt > STATE_TTL_MS) return {};

  const st = (row as any)?.conversationState;
  if (!st || typeof st !== "object") return {};
  const awaiting = (st as any)?.awaiting;
  if (awaiting && typeof awaiting === "object") {
    const kind = (awaiting as any)?.kind;
    if (kind === "proof_confirmation") {
      (st as any).awaiting = { ...awaiting, kind: "proof_decision" };
    } else if (kind === "choose_product") {
      (st as any).awaiting = { ...awaiting, kind: "product_clarification", phase: "choose" };
    } else if (kind === "quantity_needed") {
      (st as any).awaiting = { ...awaiting, kind: "product_clarification", phase: "quantity" };
    }
  }
  return st as any;
}

export async function getRetailConversationState(
  clientId: number
): Promise<RetailConversationState> {
  return loadRetailConversationState(clientId);
}

async function saveRetailConversationState(clientId: number, state: RetailConversationState) {
  await prisma.retailClient.update({
    where: { id: clientId },
    data: {
      conversationState: state as any,
      conversationStateUpdatedAt: new Date(),
    },
  });
}

async function clearRetailAwaiting(clientId: number) {
  const st = await loadRetailConversationState(clientId);
  if (!st.awaiting) return;
  const kind = (st.awaiting as any)?.kind;
  st.awaiting = null;
  await saveRetailConversationState(clientId, st);
  console.log("[Retail Awaiting] cleared", { clientId, kind });
}

function logAwaitingConsume(kind: string, msg: string) {
  console.log("[Retail Awaiting] consume", { kind, msg });
}

async function setRetailAwaiting(
  clientId: number,
  awaiting: NonNullable<RetailConversationState["awaiting"]>
) {
  const st = await loadRetailConversationState(clientId);
  st.awaiting = awaiting;
  await saveRetailConversationState(clientId, st);
  console.log("[Retail Awaiting] set", {
    clientId,
    kind: awaiting.kind,
    prompt: (awaiting as any).prompt,
    orderSequence: (awaiting as any).orderSequence,
    orderId: (awaiting as any).orderId,
  });
}

export async function setRetailProofConfirmationAwaiting(params: {
  clientId: number;
  proofId: number | null;
  candidateSeq: number | null;
  prompt?: string;
}) {
  await setRetailAwaiting(params.clientId, {
    kind: "proof_decision",
    proofId: params.proofId,
    candidateSeq: params.candidateSeq ?? null,
    createdAt: Date.now(),
    prompt: params.prompt,
  });
}

export async function hasRetailProofConfirmationAwaiting(clientId: number): Promise<boolean> {
  const st = await loadRetailConversationState(clientId);
  return st.awaiting?.kind === "proof_decision";
}


type OfficeDaySet = Set<number>;

const parseOfficeDays = (raw?: string | null): OfficeDaySet | null => {
  if (!raw) return null;
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const dayMap: Record<string, number> = {
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

  const set: OfficeDaySet = new Set();
  const rangeRegex =
    /(domingo|lunes|martes|miercoles|jueves|viernes|sabado|dom|lun|mar|mier|jue|vie|sab)\s*(?:a|al|hasta|-)\s*(domingo|lunes|martes|miercoles|jueves|viernes|sabado|dom|lun|mar|mier|jue|vie|sab)/g;

  for (const match of normalized.matchAll(rangeRegex)) {
    const start = dayMap[match[1]] ?? null;
    const end = dayMap[match[2]] ?? null;
    if (start === null || end === null) continue;
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
      const dayNum = dayMap[sanitized];
      if (dayNum !== undefined) {
        set.add(dayNum);
      }
    });

  return set.size ? set : null;
};

type OfficeHourWindow = { startMinute: number; endMinute: number };

const parseOfficeHoursWindows = (raw?: string | null): OfficeHourWindow[] => {
  if (!raw) return [];
  const normalized = raw
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\n\r]/g, " ")
    .trim();
  if (!normalized) return [];

  const windows: OfficeHourWindow[] = [];
  const regex =
    /(\d{1,2})(?::(\d{2}))?\s*(?:a|-|–|hasta)\s*(\d{1,2})(?::(\d{2}))?/gi;

  const parseTimeToMinutes = (hStr?: string, mStr?: string) => {
    if (!hStr) return null;
    const h = Number(hStr);
    const m = Number(mStr ?? "0");
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  };

  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized)) && windows.length < 6) {
    const startMinute = parseTimeToMinutes(match[1], match[2]);
    const endMinute = parseTimeToMinutes(match[3], match[4]);
    if (startMinute !== null && endMinute !== null && endMinute > startMinute) {
      windows.push({ startMinute, endMinute });
    }
  }

  return windows.sort((a, b) => a.startMinute - b.startMinute);
};

type HandleRetailParams = {
  doctor: any;
  patient?: Patient | null;
  retailClient: RetailClient;
  action: any;
  replyToPatient: string;
  phoneE164: string;
  doctorNumber: string;
  doctorWhatsappConfig: any;
  rawText: string;
};

// ✅ FIX: evitar redeclare de "norm" (dejo este helper sin uso por ahora, solo renombrado)
const normLite = (s: string) =>
  (s || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sÍ -> si
    .replace(/\s+/g, " ");

const isYes = (txt: string) => {
  const t = norm(txt);

  // acepta: si, sii, sisi, ok/okay/okey, dale, listo, de una/deuna, joya, perfecto, genial, barbaro, buenisimo
  // y también confirmar/confirmo/confirmar
  return /^(si+|sisi+|ok(ey|a|ay)?|dale+|listo+|confirm(o|ar)?|de una|deuna|obvio|joya|perfecto|genial|barbaro|buenisimo)$/.test(
    t
  );
};

const isTransferMention = (raw: string) => {
  const t = normLite(raw || "");
  if (!t) return false;
  if (isLocationQuestion(raw || "")) return false; // evitar confundir "depósito" de ubicación con pago/deposito bancario
  return (
    /\btransfe/.test(t) ||
    /\btransferenc/.test(t) ||
    /\btransfier/.test(t) || // transfiero, transfieren
    /\btransferi\b/.test(t) ||
    /\btransfiri/.test(t) ||
    /\bpague\b|\bpago\b|\bte pague\b|\bpagado\b/.test(t) ||
    /\bdeposit/.test(t) ||
    /\bte (mande|mandee|pase|envie|gire) (la\s*)?plata/.test(t)
  );
};

const shouldSkipProofRequest = (doctorId: number, clientId: number) => {
  const key = `${doctorId}:${clientId}`;
  const ts = proofRequestCooldown.get(key);
  if (!ts) return false;
  const elapsed = Date.now() - ts;
  if (elapsed > 15 * 60 * 1000) {
    proofRequestCooldown.delete(key);
    return false;
  }
  return true;
};

const markProofRequestCooldown = (doctorId: number, clientId: number) => {
  proofRequestCooldown.set(`${doctorId}:${clientId}`, Date.now());
};

const wantsCatalog = (raw: string) => {
  const t = normLite(raw || "");
  if (!t) return false;
  // cubre: catalogo, catálogo, catalog, lista de precios, lista, lsita, catalogo?, catalogar no
  if (/\bcatalo[gq]/.test(t)) return true;
  if (/\blista\s+de\s+precios\b/.test(t)) return true;
  if (/\blista\s+de\s+productos\b/.test(t)) return true;
  if (/\bprecios?\s+(de\s+)?(todo|todos|toda|productos|articulos)\b/.test(t)) return true;
  return false;
};

const isNo = (txt: string) => {
  const t = norm(txt);

  // acepta: no, noo, nooo, nop, nah, negativo, para nada
  return /^(no+|nop+|noo+|na+|nono+|non+|noon+|noooo+|non+|Noo+|No+|Non+|negativo|para nada)$/.test(
    t
  );
};

const isSoftAck = (txt: string) => {
  const t = norm(txt);
  return /^(ok|oka|okey|dale|listo|bueno|buenisimo|buenísimo|barbaro|bárbaro|genial|gracias|joya|perfecto|entendido)$/.test(
    t
  );
};

type ParsedIntentItem = {
  name: string;
  quantity: number;
  op?: "add" | "remove" | "set";
};

const extractIntentItems = (raw: string): ParsedIntentItem[] => {
  const text = raw.toLowerCase();
  const segments = text.split(/(?:,| y | e )/i).map((s) => s.trim()).filter(Boolean);
  const items: ParsedIntentItem[] = [];
  for (const seg of segments) {
    const isRemove = /\b(quit|sac|elimin|borr|sin)\b/.test(seg);
    const isSet = /\bdej(a|ar|alo|arlo)\b/.test(seg);
    const op: "add" | "remove" | "set" = isRemove ? "remove" : isSet ? "set" : "add";

    const qtyMatch = seg.match(/\b(\d+)\b/);
    const qty = qtyMatch ? Number(qtyMatch[1]) : 1;
    const name = seg
      .replace(/\b(quiero|sum[ao]?|agreg[ao]?|pone|pon[ée]|deja|dej[aá]|quit[ao]?|sac[ao]?|elimina|borra|sin)\b/gi, "")
      .replace(/\b\d+\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (name) {
      items.push({ name, quantity: qty, op });
    }
  }
  return items;
};

// ✅ “eh?/que?/no entiendo” (respuesta de confusión)
const isConfusion = (txt: string) => {
  const t = norm(txt);
  return /^(eh+|e+|que|ke|como|no entendi|no entiendo)$/.test(t) || t.length === 0;
};

const isStopProofText = (txt: string) => {
  const t = normLite(txt || "");
  return (
    /\bolvid/.test(t) ||
    /\bdejalo\b/.test(t) ||
    /\bdespues\b|\bdesp\b/.test(t) ||
    /\bmas\s+tarde\b/.test(t) ||
    /\bno puedo\b/.test(t) ||
    /\bno lo tengo\b/.test(t)
  );
};

const firstSentence = (s: string) => {
  if (!s) return "";
  const i = s.search(/[¿?]/);
  const cut = i > 0 ? s.slice(0, i) : s;
  return cut.trim();
};

// ✅ FIX: Detecta si el último mensaje del bot ofrecía promo o preguntaba cancelar
const lastBotAskedCancel = (lastBotMsg: string) => /\bcancel/.test(norm(lastBotMsg));

const lastBotAskedCatalog = (lastBotMsg: string) => /\bcatal[oó]g/.test(norm(lastBotMsg));

const lastBotAskedOrderConfirm = (lastBotMsg: string) => {
  const t = norm(lastBotMsg);
  if (!t) return false;
  if (!t.includes("pedido")) return false;
  const hasConfirm = /\bconfirm/.test(t);
  const hasRespond = /\brespond/.test(t) || t.includes("si esta ok");
  return hasConfirm && hasRespond;
};

const lastBotAskedPromo = (lastBotMsg: string) => {
  const t = norm(lastBotMsg);
  const hasPromoWord = t.includes("promo") || t.includes("descuento") || t.includes("off");
  const isOfferQuestion =
    t.includes("queres") || t.includes("aprovechar") || t.includes("sumar") || t.includes("agregar");
  return hasPromoWord && isOfferQuestion;
};

function asksPaymentMethod(raw: string) {
  const t = (raw || "").toLowerCase();
  return (
    /\b(alias|cbu|cvu)\b/.test(t) ||
    /(a\s*donde|donde)\s*(te\s*)?(puedo\s*)?(transferir|depositar|pagar|mandar)/.test(t) ||
    /(pasame|pasa|mandame|manda)\s*(el\s*)?(alias|cbu|cvu)/.test(t) ||
    /(como|cómo)\s*(te\s*)?(pago|transfero|transfiero)/.test(t) ||
    /(enviar|mandar)\s*(la\s*)?(plata|dinero)/.test(t)
  );
}

function wantsLocationShare(raw: string) {
  const t = norm(raw || "");
  if (!t) return false;
  if (/\b(alias|cbu|cvu)\b/.test(t)) return false;
  if (/\b(catalogo|promo|promos|descuento)\b/.test(t)) return false;
  return (
    /\b(ubicacion|direccion)\b/.test(t) ||
    /\b(pasame|pasamela|pasa|mandame|mandamela|manda|compartime|comparti|envia|enviame)\b/.test(t)
  );
}

function formatAliasReply(businessAlias: string) {
  const clean = businessAlias.trim();
  const isCBU = /^\d{20,26}$/.test(clean);
  return isCBU
    ? `Dale 🙌 Te paso el CBU/CVU:\n*${clean}*\n\nCuando transfieras, avisame y si querés mandá el comprobante.`
    : `Dale 🙌 Mi alias es:\n*${clean}*\n\nCuando transfieras, avisame y si querés mandá el comprobante.`;
}

function isPendingOrdersQuestion(raw: string) {
  const t = norm(raw || "");
  if (!t) return false;
  const hasPendingPhrase = /\bpedido(s)?\s+(pendiente(s)?|en\s+curso|en\s+revision)\b/.test(t);
  const hasOrderStatusPhrase = /\b(estado|como va)\s+(mi\s+)?pedido\b/.test(t);
  const hasAnyOrderQuestion = /\b(tengo|hay|tenes|tiene|tenemos)\s+algun\s+pedido(s)?\b/.test(t);
  return hasPendingPhrase || hasOrderStatusPhrase || hasAnyOrderQuestion;
}

const isLocationQuestion = (raw: string) => {
  const t = norm(raw || "");
  if (!t) return false;
  const hasWhere =
    /\b(donde|dónde|ubicacion|ubicación|ubicado|queda|quedan|direccion|dirección)\b/.test(t);
  const hasPlace =
    /\b(local|deposito|dep[oó]sito|sucursal|tienda|negocio|stock|almacen|almac[eé]n)\b/.test(t);
  return hasWhere && hasPlace;
};

function extractOrderSeqFromText(text: string): number | null {
  if (!text) return null;
  const m1 = text.match(/pedido\s*#?\s*(\d+)/i);
  if (m1?.[1]) return Number(m1[1]);
  const m2 = text.match(/#\s*(\d+)/);
  if (m2?.[1]) return Number(m2[1]);
  return null;
}

function parseProofCandidateFromLastBotMessage(lastBotMsg: string): number | null {
  if (!lastBotMsg) return null;
  const seq = extractOrderSeqFromText(lastBotMsg);
  if (!seq) return null;

  // Aceptamos tanto mensajes de “recibí el comprobante” como preguntas “¿Es para el pedido #X?”
  const looksLikeProof =
    /(recib[ií].*(archivo|comprobante)|pdf|transferencia|mp|mercado\s*pago|comprobante)/i.test(
      lastBotMsg
    );
  const proofQuestion = /para\s+el\s+pedido/i.test(lastBotMsg) || /\?\s*$/.test(lastBotMsg);

  if (!looksLikeProof && !proofQuestion) return null;
  return seq;
}


// ✅ Estado en memoria: el bot preguntó “¿de qué producto querés quitar X?”
const awaitingRemoveProductMap = new Map<string, { qty: number | null; ts: number }>();

const setAwaitingRemoveProduct = (doctorId: number, clientId: number, qty: number | null) => {
  awaitingRemoveProductMap.set(`${doctorId}:${clientId}`, { qty, ts: Date.now() });
};

const getAwaitingRemoveProduct = (doctorId: number, clientId: number) => {
  const key = `${doctorId}:${clientId}`;
  const v = awaitingRemoveProductMap.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > 5 * 60 * 1000) {
    awaitingRemoveProductMap.delete(key);
    return null;
  }
  return v;
};

const clearAwaitingRemoveProduct = (doctorId: number, clientId: number) => {
  awaitingRemoveProductMap.delete(`${doctorId}:${clientId}`);
};

// Estado en memoria para "estoy esperando #pedido para asignar comprobante"
const awaitingProofMap = new Map<string, number>();
const proofRequestCooldown = new Map<string, number>();

export async function assignLatestUnassignedProofToOrder(params: {
  doctorId: number;
  clientId: number;
  orderSequenceNumber: number;
  proofId?: number | null;
}): Promise<boolean> {
  const { doctorId, clientId, orderSequenceNumber, proofId } = params;
  const target = await prisma.order.findFirst({
    where: { doctorId, clientId, sequenceNumber: orderSequenceNumber },
    select: { id: true, totalAmount: true, paidAmount: true },
  });
  if (!target) return false;

  const proofStatusFilter = {
    in: [
      PaymentProofStatus.unassigned,
      PaymentProofStatus.duplicate,
      PaymentProofStatus.needs_review,
    ],
  };

  // Tomamos primero el más reciente en los últimos 10 minutos; si no hay, hacemos fallback al último sin asignar.
  let latestProof = proofId
    ? await prisma.paymentProof.findFirst({
        where: {
          id: proofId,
          doctorId,
          clientId,
          orderId: null,
          status: proofStatusFilter,
        },
        select: {
          id: true,
          fileUrl: true,
          fileName: true,
          contentType: true,
          amount: true,
        },
      })
    : null;

  if (proofId && !latestProof) return false;

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  if (!latestProof) {
    latestProof = await prisma.paymentProof.findFirst({
      where: {
        doctorId,
        clientId,
        orderId: null,
        status: proofStatusFilter,
        createdAt: { gte: tenMinutesAgo },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileUrl: true,
        fileName: true,
        contentType: true,
        amount: true,
      },
    });
  }

  if (!latestProof) {
    latestProof = await prisma.paymentProof.findFirst({
      where: {
        doctorId,
        clientId,
        orderId: null,
        status: proofStatusFilter,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileUrl: true,
        fileName: true,
        contentType: true,
        amount: true,
      },
    });
  }

  if (!latestProof) return false;

  await prisma.$transaction(async (tx) => {
    await tx.paymentProof.update({
      where: { id: latestProof.id },
      data: { orderId: target.id, status: PaymentProofStatus.assigned },
    });

    if (latestProof.fileUrl) {
      await tx.orderAttachment.create({
        data: {
          orderId: target.id,
          url: latestProof.fileUrl,
          filename: latestProof.fileName || "Comprobante",
          mimeType: latestProof.contentType || "application/octet-stream",
        },
      });
    }

    if (latestProof.amount && latestProof.amount > 0) {
      const nextPaid = (target.paidAmount ?? 0) + latestProof.amount;
      const nextStatus =
        nextPaid <= 0
          ? "unpaid"
          : nextPaid >= (target.totalAmount ?? 0)
          ? "paid"
          : "partial";

      await tx.order.update({
        where: { id: target.id },
        data: {
          paidAmount: nextPaid,
          paymentStatus: nextStatus,
        },
      });
    }
  });

  return true;
}

export async function setAwaitingProofOrderNumber(params: { doctorId: number; clientId: number }) {
  awaitingProofMap.set(`${params.doctorId}:${params.clientId}`, Date.now());
}

export async function clearAwaitingProofOrderNumber(params: { doctorId: number; clientId: number }) {
  awaitingProofMap.delete(`${params.doctorId}:${params.clientId}`);
}

export async function getAwaitingProofOrderNumber(params: {
  doctorId: number;
  clientId: number;
}): Promise<boolean> {
  const key = `${params.doctorId}:${params.clientId}`;
  const ts = awaitingProofMap.get(key);
  if (!ts) return false;
  // Expira a los 15 minutos
  if (Date.now() - ts > 15 * 60 * 1000) {
    awaitingProofMap.delete(key);
    return false;
  }
  return true;
}

export async function handleRetailAgentAction(params: HandleRetailParams) {  const {
    doctor,
    patient,
    retailClient,
    phoneE164,
    doctorNumber,
    doctorWhatsappConfig,
    rawText,
  } = params;

  let action = params.action;
  let replyToPatient = params.replyToPatient;

  let client = retailClient;

  const products = await prisma.product.findMany({
    where: { doctorId: doctor.id },
    orderBy: { name: "asc" },
    include: { tags: { select: { label: true } } },
  });

  const officeDaysSet = parseOfficeDays((doctor as any).officeDays ?? null);
  const officeHoursWindows = parseOfficeHoursWindows((doctor as any).officeHours ?? null);

  const sendMessage = async (text: string) => {
    const messageWithHint = appendMenuHintForBusiness(text, doctor.businessType);
    try {
      const waResult = await sendWhatsAppText(phoneE164, messageWithHint, doctorWhatsappConfig);
      await prisma.message.create({
        data: {
          waMessageId: (waResult as any)?.sid ?? null,
          from: doctorNumber,
          to: phoneE164,
          direction: "outgoing",
          type: "text",
          body: text,
          rawPayload: waResult,
          retailClientId: client.id,
          doctorId: doctor.id,
        },
      });
    } catch (error) {
      console.error("[RetailAgent] Error enviando respuesta:", error);
    }
  };

  const restockOrderInventory = async (order: any) => {
    if (!order || !order.inventoryDeducted) return;
    const map = new Map<number, number>();
    for (const it of order.items || []) {
      map.set(it.productId, (map.get(it.productId) ?? 0) + it.quantity);
    }

    await prisma.$transaction(async (tx) => {
      for (const [pid, qty] of map) {
        await tx.product.updateMany({
          where: { id: pid, doctorId: doctor.id },
          data: { quantity: { increment: qty } },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          inventoryDeducted: false,
          inventoryDeductedAt: null,
          customerConfirmed: false,
          customerConfirmedAt: null,
        },
      });
    });
  };

  // Envía el catálogo PDF (con fallback a link) y registra el mensaje
  const sendCatalog = async () => {
    if (!products.length) {
      await sendMessage("Todavía no tengo cargado el catálogo para compartir 📄.");
      return true;
    }

    let logoUrl: string | null | undefined = (doctor as any).ticketLogoUrl;
    if (logoUrl === undefined) {
      const doctorLogo = await prisma.doctor.findUnique({
        where: { id: doctor.id },
        select: { ticketLogoUrl: true },
      });
      logoUrl = doctorLogo?.ticketLogoUrl ?? null;
    }

    try {
      const catalog = await createCatalogPdf({
        doctorId: doctor.id,
        doctorName: doctor.name || "Catálogo",
        products: products.map((p) => ({
          name: p.name,
          price: p.price,
          description: p.description || undefined,
          imageUrl: p.imageUrl || undefined,
        })),
        logoUrl: logoUrl || null,
        generatedAt: new Date(),
      });

      if (!catalog.publicUrl) {
        await sendMessage("No pude generar el PDF del catálogo ahora mismo. Probemos de nuevo en un rato.");
        return true;
      }

      const reply =
        "Te paso el catálogo en PDF con precios y detalles. Contame qué querés pedir 👌";
      const messageWithHint = appendMenuHintForBusiness(reply, doctor.businessType as any);

      const isHttpsPublic =
        /^https:\/\//i.test(catalog.publicUrl) && !/localhost|127\.0\.0\.1/i.test(catalog.publicUrl);

      if (isHttpsPublic) {
        try {
          const waResult = await sendWhatsAppText(
            phoneE164,
            messageWithHint,
            doctorWhatsappConfig,
            catalog.publicUrl
          );
          await prisma.message.create({
            data: {
              waMessageId: (waResult as any)?.sid ?? null,
              from: doctorNumber,
              to: phoneE164,
              direction: "outgoing",
              type: "other",
              body: reply,
              rawPayload: waResult,
              retailClientId: client.id,
              doctorId: doctor.id,
            },
          });
          return true;
        } catch (err) {
          console.warn("[RetailAgent] No se pudo enviar media WhatsApp, hago fallback a link:", err);
        }
      }

      // Fallback: mandamos el link en texto (evita errores de MediaUrl en local/http)
      const replyWithLink = `${reply}\n${catalog.publicUrl}`;
      const waResult = await sendWhatsAppText(phoneE164, replyWithLink, doctorWhatsappConfig);
      await prisma.message.create({
        data: {
          waMessageId: (waResult as any)?.sid ?? null,
          from: doctorNumber,
          to: phoneE164,
          direction: "outgoing",
          type: "text",
          body: replyWithLink,
          rawPayload: waResult,
          retailClientId: client.id,
          doctorId: doctor.id,
        },
      });
    } catch (error) {
      console.error("[RetailAgent] Error generando catálogo PDF:", error);
      await sendMessage("No pude generar el catálogo ahora mismo. Avisame y te lo reenvío.");
    }
    return true;
  };

  // Actualizar datos básicos del cliente si el agente los envió
  const maybeUpdateProfile = async () => {
    const info = action.clientInfo;
    if (!info || typeof info !== "object") return;

    const clientUpdate: any = {};

    if (info.fullName && info.fullName.trim().length > 2) {
      const name = info.fullName.trim().slice(0, 120);
      clientUpdate.fullName = name;
    }

    if (info.dni && info.dni.trim()) {
      const normalizedDni = normalizeDniInput(info.dni);
      if (normalizedDni) {
        clientUpdate.dni = normalizedDni;
      }
    }

    if (info.address && info.address.trim().length >= 5) {
      const address = info.address.trim().slice(0, 160);
      clientUpdate.businessAddress = address;
    }

    if (Object.keys(clientUpdate).length > 0) {
      client = await prisma.retailClient.update({
        where: { id: client.id },
        data: clientUpdate,
      });
    }
  };

  // Horarios/días de atención (retail): si no está habilitado hoy u horario, no tomamos pedidos
  const now = new Date();
  const today = now.getDay(); // 0 domingo
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  if (officeDaysSet && !officeDaysSet.has(today)) {
    await sendMessage("No estamos tomando pedidos el día de hoy.");
    return true;
  }

  if (officeHoursWindows.length > 0) {
    const inWindow = officeHoursWindows.some(
      (w) => minutesNow >= w.startMinute && minutesNow <= w.endMinute
    );
    if (!inWindow) {
      await sendMessage("No estamos tomando pedidos en este horario.");
      return true;
    }
  }

  await maybeUpdateProfile();

  const msgText = (rawText || "").trim();
  const normMsg = norm(msgText);

  // Último mensaje del bot (para seguir el hilo)
  const lastBotMsgRow = await prisma.message.findFirst({
    where: {
      doctorId: doctor.id,
      retailClientId: client.id,
      direction: "outgoing",
      body: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });
  const lastBotMsg = lastBotMsgRow?.body || "";

  const lastBotAskedProof = /comprobante|captura de la transferencia|mand[aá] el comprobante/i.test(
    lastBotMsg
  );
  const candidateSeq = parseProofCandidateFromLastBotMessage(lastBotMsg);

  const conv = await loadRetailConversationState(client.id);
  const nowTs = Date.now();
  const awaitingValid =
    conv.awaiting && typeof (conv.awaiting as any).createdAt === "number"
      ? nowTs - (conv.awaiting as any).createdAt <= STATE_TTL_MS
      : false;
  if (conv.awaiting && !awaitingValid) {
    conv.awaiting = null;
    await saveRetailConversationState(client.id, conv);
  }

  // Si el último mensaje del bot fue una pregunta de comprobante/cancel/catalogo, persistimos el await
  if (
    lastBotAskedProof &&
    candidateSeq &&
    (!conv.awaiting || conv.awaiting.kind !== "proof_decision")
  ) {
    conv.awaiting = {
      kind: "proof_decision",
      candidateSeq,
      createdAt: nowTs,
      prompt: lastBotMsg || undefined,
    };
    await saveRetailConversationState(client.id, conv);
  }

  if (
    lastBotAskedCancel(lastBotMsg) &&
    (!conv.awaiting || conv.awaiting.kind !== "cancel_confirmation")
  ) {
    conv.awaiting = {
      kind: "cancel_confirmation",
      orderSequence: null,
      orderId: null,
      createdAt: nowTs,
      prompt: lastBotMsg || undefined,
    };
    await saveRetailConversationState(client.id, conv);
  }

  if (
    lastBotAskedOrderConfirm(lastBotMsg) &&
    (!conv.awaiting || conv.awaiting.kind !== "confirm_order")
  ) {
    conv.awaiting = {
      kind: "confirm_order",
      orderSequence: extractOrderSeqFromText(lastBotMsg),
      orderId: null,
      createdAt: nowTs,
      prompt: lastBotMsg || undefined,
    };
    await saveRetailConversationState(client.id, conv);
  }

  if (
    lastBotAskedCatalog(lastBotMsg) &&
    (!conv.awaiting || conv.awaiting.kind !== "catalog_offer")
  ) {
    conv.awaiting = { kind: "catalog_offer", createdAt: nowTs, prompt: lastBotMsg || undefined };
    await saveRetailConversationState(client.id, conv);
  }

  if (lastBotAskedPromo(lastBotMsg) && (!conv.awaiting || conv.awaiting.kind !== "promo_offer")) {
    conv.awaiting = { kind: "promo_offer", createdAt: nowTs, prompt: lastBotMsg || undefined };
    await saveRetailConversationState(client.id, conv);
  }

  let awaiting = awaitingValid ? conv.awaiting : null;

  // Si el usuario cambia de tema (pregunta algo nuevo), permitimos limpiar el await y seguir
  const newTopic =
    awaiting &&
    (msgText.includes("?") ||
      isLocationQuestion(msgText) ||
      asksPaymentMethod(msgText) ||
      isTransferMention(msgText));
  const clearOnNewTopicKinds = new Set([
    "catalog_offer",
    "promo_offer",
    "location_offer",
    "product_clarification",
  ]);
  if (newTopic && awaiting && clearOnNewTopicKinds.has((awaiting as any).kind)) {
    awaiting = null;
    await clearRetailAwaiting(client.id);
  }

  const softAckShort =
    isSoftAck(msgText) &&
    (msgText.trim().split(/\s+/).length <= 4 && msgText.trim().length <= 40);

  if (awaiting && softAckShort) {
    const ackKinds = new Set([
      "catalog_offer",
      "location_offer",
      "promo_offer",
      "stock_replacement",
    ]);
    if (ackKinds.has((awaiting as any).kind)) {
      await clearRetailAwaiting(client.id);
      awaiting = null;
      await sendMessage("Dale, avisame qué necesitás y seguimos.");
      return true;
    }
  }

  // Ack genérico después de respuesta informativa (sin awaiting)
  if (!awaiting && softAckShort && lastBotMsg && !lastBotAskedOrderConfirm(lastBotMsg)) {
    await sendMessage("Genial, contame si querés pedir algo o si tenés otra consulta.");
    return true;
  }

  // ⛔️ Guardrail: si no hay verbos de pedido ni cantidades, nunca procesar retail_upsert_order
  const hasOrderIntent = hasOrderVerb(normMsg) || hasQtyPattern(normMsg);
  if (!hasOrderIntent && action?.type === "retail_upsert_order") {
    action = { type: "general", items: [] };
    replyToPatient = "Contame qué necesitás (pedido, precio, stock o ubicación) y te ayudo.";
  }

  // Pregunta de ubicación: siempre responder directo y limpiar estados anteriores
  if (isLocationQuestion(msgText)) {
    console.log("[Retail] Location question detected", { msg: msgText });
    await clearRetailAwaiting(client.id);
    const addr =
      (doctor as any).businessAddress ||
      (doctor as any).clinicAddress ||
      (doctor as any).officeAddress ||
      (doctor as any).address ||
      null;
    if (addr) {
      await sendMessage(`Estamos en ${addr}. ¿Querés que te comparta la ubicación?`);
      await setRetailAwaiting(client.id, {
        kind: "location_offer",
        createdAt: Date.now(),
        prompt: "¿Querés que te comparta la ubicación?",
      });
    } else {
      const reply =
        "Estamos operando online. Si necesitás retirar, avisame y te paso la dirección.";
      await sendMessage(reply);
      await setRetailAwaiting(client.id, {
        kind: "location_offer",
        createdAt: Date.now(),
        prompt: reply,
      });
    }
    return true;
  }

  // ===============================
  // ✅ Seguir el hilo de preguntas directas (comprobante, catálogo, ubicación, cancelar)
  // ===============================
  if (awaiting?.kind === "proof_decision") {
    const seqInMsg = extractOrderSeqFromText(msgText);
    const proofId = awaiting.proofId ?? null;

    if (isYes(msgText) && awaiting.candidateSeq) {
      const ok = await assignLatestUnassignedProofToOrder({
        doctorId: doctor.id,
        clientId: client.id,
        orderSequenceNumber: awaiting.candidateSeq,
        proofId,
      });
      if (ok) {
        await clearAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });
        await clearRetailAwaiting(client.id);
        logAwaitingConsume("proof_decision", msgText);
        await sendMessage(`Listo ✅ Ya cargué tu comprobante para el pedido #${awaiting.candidateSeq}.`);
        return true;
      }
      await setAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });
      await sendMessage(
        `No pude asignarlo automático al pedido #${awaiting.candidateSeq}. ` +
          `Pasame el número correcto (ej: 5) o reenviá el comprobante.`
      );
      return true;
    }

    if (seqInMsg) {
      const ok = await assignLatestUnassignedProofToOrder({
        doctorId: doctor.id,
        clientId: client.id,
        orderSequenceNumber: seqInMsg,
        proofId,
      });
      if (ok) {
        await clearAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });
        await clearRetailAwaiting(client.id);
        logAwaitingConsume("proof_decision", msgText);
        await sendMessage(`Listo ✅ Asigné el comprobante al pedido #${seqInMsg}.`);
        return true;
      }
      await setAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });
      await sendMessage(
        `No encontré tu pedido #${seqInMsg}. Mandame el número correcto (ej: 6) o reenviá el comprobante.`
      );
      return true;
    }

    if (/\bno\b/.test(norm(msgText))) {
      await clearAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });
      await clearRetailAwaiting(client.id);
      logAwaitingConsume("proof_decision", msgText);
      await sendMessage("Ok, ignoro el comprobante. Decime qué necesitás y seguimos.");
      return true;
    }

    if (isConfusion(msgText) && awaiting.prompt) {
      const core = firstSentence(awaiting.prompt);
      await sendMessage(core ? `Perdón 🙏 Te preguntaba: ${core}` : "¿Para qué pedido era el comprobante?");
      return true;
    }

    await setAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });
    await sendMessage("¿Para qué pedido es el comprobante? Decime el número (ej: 5).");
    return true;
  }

  if (awaiting?.kind === "catalog_offer") {
    if (isNo(msgText)) {
      await clearRetailAwaiting(client.id);
      logAwaitingConsume("catalog_offer", msgText);
      await sendMessage("Dale, no te envío el catálogo. Decime qué necesitás y te ayudo.");
      return true;
    }
    if (isYes(msgText)) {
      await clearRetailAwaiting(client.id);
      logAwaitingConsume("catalog_offer", msgText);
      await sendCatalog();
      return true;
    }
    if (isConfusion(msgText) && awaiting.prompt) {
      await sendMessage(`Te preguntaba si querés que te envíe el catálogo. ¿Sí o no?`);
      return true;
    }
  }

  if (awaiting?.kind === "location_offer") {
    if (isNo(msgText)) {
      await clearRetailAwaiting(client.id);
      logAwaitingConsume("location_offer", msgText);
      await sendMessage("Ok, no envío ubicación. ¿Querés pedir algo o consultar stock/precios?");
      return true;
    }
    if (isYes(msgText) || wantsLocationShare(msgText)) {
      await clearRetailAwaiting(client.id);
      const addr =
        (doctor as any).businessAddress ||
        (doctor as any).clinicAddress ||
        (doctor as any).officeAddress ||
        (doctor as any).address ||
        null;
      if (addr) {
        await sendMessage(`Estamos en ${addr}. Te paso ubicación si la necesitas.`);
      } else {
        await sendMessage("Todavía no tengo la dirección cargada. Si necesitás retirar, avisame y la confirmo.");
      }
      logAwaitingConsume("location_offer", msgText);
      return true;
    }
    if (isConfusion(msgText) && awaiting.prompt) {
      await sendMessage("Te preguntaba si querés que te comparta la ubicación. ¿Sí o no?");
      return true;
    }
  }

  if (awaiting?.kind === "cancel_confirmation") {
    if (isYes(msgText)) {
      const pending = await prisma.order.findFirst({
        where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      });

      if (!pending) {
        await clearRetailAwaiting(client.id);
        await sendMessage("No encontré un pedido para cancelar.");
        return true;
      }

      await restockOrderInventory(pending);
      await prisma.order.update({
        where: { id: pending.id },
        data: { status: "cancelled" },
      });
      await clearRetailAwaiting(client.id);
      logAwaitingConsume("cancel_confirmation", msgText);
      await sendMessage(
        `Listo, cancelé el pedido #${pending.sequenceNumber}. Si querés armar uno nuevo, decime qué productos necesitas.`
      );
      return true;
    }

    if (isNo(msgText)) {
      await clearRetailAwaiting(client.id);
      logAwaitingConsume("cancel_confirmation", msgText);
      await sendMessage("No cancelo nada. ¿Querías algo más o era solo consulta?");
      return true;
    }

    if (isConfusion(msgText) && awaiting.prompt) {
      const core = firstSentence(awaiting.prompt);
      await sendMessage(core ? `Te preguntaba: ${core}` : "¿Querés cancelar el pedido pendiente?");
      return true;
    }
  }

  if (awaiting?.kind === "promo_offer") {
    if (isNo(msgText)) {
      await clearRetailAwaiting(client.id);
      await sendMessage("Ok, no aplico promo. ¿Querés otra cosa o armar un pedido?");
      return true;
    }
    if (isYes(msgText)) {
      await clearRetailAwaiting(client.id);
      await sendMessage("Dale, aplico promo si corresponde al pedido. Contame qué productos/cantidades querés.");
      return true;
    }
    if (isConfusion(msgText) && awaiting.prompt) {
      await sendMessage("Te preguntaba si querés aplicar la promo. ¿Sí o no?");
      return true;
    }
  }

  // ===============================
  // ✅ Seguir el hilo: si estamos esperando que el cliente elija una opción
  // (ej: "faltan galletitas" -> ofrecemos 1) Don Satur 2) ... -> cliente responde "2")
  // ===============================
  const productAwaiting = awaiting?.kind === "product_clarification" ? awaiting : null;
  const isProductChoiceAwaiting =
    !!productAwaiting &&
    (productAwaiting.phase === "choose" ||
      (productAwaiting.term &&
        Array.isArray(productAwaiting.candidates) &&
        productAwaiting.candidates.length > 1));

  if (isProductChoiceAwaiting) {
    // Permitir abortar o cambiar de tema
    if (isNo(msgText)) {
      await clearRetailAwaiting(client.id);
      await sendMessage("Ok, no elijo producto. Decime qué querés pedir o consultá stock/precios.");
      // seguimos con el resto por si trae un pedido nuevo
    } else if (msgText.includes("?")) {
      // deja pasar al resto de la lógica (puede ser otra pregunta)
    } else {
    const t = norm(rawText || "");
    const candidates = productAwaiting?.candidates || [];
    const desiredQty =
      typeof productAwaiting?.desiredQuantity === "number" ? productAwaiting.desiredQuantity : undefined;

    // números en el mensaje (puede ser "1", o "1 x 2")
    const nums = Array.from(t.matchAll(/\b(\d+)\b/g)).map((m) => Number(m[1]));

    let choiceIdx: number | null = null;
    let qty: number | undefined = undefined;

    if (nums.length >= 2 && nums[0] >= 1 && nums[0] <= candidates.length) {
      choiceIdx = nums[0];
      qty = nums[1];
    } else if (nums.length === 1) {
      const n = nums[0];
      // Si ya teníamos una cantidad esperada (por el mensaje original), un "2" probablemente es opción #2
      if (desiredQty && n >= 1 && n <= candidates.length) {
        choiceIdx = n;
        qty = desiredQty;
      } else if (n >= 1 && n <= candidates.length && (t === String(n) || t.startsWith(String(n) + " "))) {
        choiceIdx = n;
        qty = desiredQty;
      } else {
        // si no parece opción, lo tomamos como cantidad
        qty = n;
      }
    }

    // Si no eligió por número, intentamos por nombre
    if (!choiceIdx) {
      const byName = candidates.findIndex((c) => norm(c.name).includes(t) || t.includes(norm(c.name)));
      if (byName >= 0) {
        choiceIdx = byName + 1;
        qty = qty ?? desiredQty;
      }
    }

    // Si mandó solo cantidad, la guardamos y volvemos a pedir opción
    if (!choiceIdx && qty && qty > 0) {
      if (productAwaiting) {
        productAwaiting.desiredQuantity = qty;
        await setRetailAwaiting(client.id, productAwaiting as any);
      }
      await sendMessage(
        `Dale. ¿Cuál opción querés para *${productAwaiting?.term || "ese producto"}*?\n\n` +
          formatProductOptions(
            candidates.map((c) => ({
              name: c.name,
              price: (products.find((p: any) => p.id === c.productId) as any)?.price ?? 0,
              quantity: (products.find((p: any) => p.id === c.productId) as any)?.quantity ?? 0,
            }))
          ) +
          `\n\nRespondé con el número (1, 2, 3...)`
      );
      return true;
    }

    if (!choiceIdx || choiceIdx < 1 || choiceIdx > candidates.length) {
      await sendMessage(
        `No te entendí cuál elegís 🙏 Respondé con el número de opción (1, 2, 3...) para *${productAwaiting?.term || "ese producto"}*.`
      );
      return true;
    }

    const selected = candidates[choiceIdx - 1];
    const finalQty = qty && qty > 0 ? qty : desiredQty;

    if (!finalQty || finalQty <= 0) {
      // Tenemos el producto, falta cantidad
      if (productAwaiting) {
        productAwaiting.candidates = [selected];
        productAwaiting.desiredQuantity = undefined;
      }
      await setRetailAwaiting(client.id, {
        kind: "product_clarification",
        phase: "quantity",
        productName: selected.name,
        candidates: [selected],
        op: productAwaiting?.op || "add",
        orderSequence: productAwaiting?.orderSequence,
        createdAt: Date.now(),
        prompt: `¿Cuántas querés de ${selected.name}?`,
      });
      await sendMessage(`Perfecto: *${selected.name}*. ¿Cuántas querés? (ej: 2)`);
      return true;
    }

    // Convertimos esta respuesta en una acción de upsert para reutilizar el resto del flujo.
    action = {
      type: "retail_upsert_order",
      mode: "merge",
      status: "pending",
      items: [
        {
          name: selected.name,
          normalizedName: selected.name,
          quantity: finalQty,
          op: productAwaiting?.op || "add",
          note: "",
        },
      ],
    } as any;

    await clearRetailAwaiting(client.id);
    }
  }

  const isQuantityAwaiting =
    !!productAwaiting &&
    (productAwaiting.phase === "quantity" ||
      (!productAwaiting.term &&
        (productAwaiting.candidates?.length === 1 || productAwaiting.productName)));

  if (isQuantityAwaiting) {
    const nums = Array.from(norm(msgText || "").matchAll(/\b(\d+)\b/g)).map((m) => Number(m[1]));
    const qty = nums[0];
    if (qty && qty > 0) {
      // Convertimos en acción directa para el producto pendiente
      const candidates = productAwaiting?.candidates || [];
      const selected = candidates[0];
      if (selected) {
        action = {
          type: "retail_upsert_order",
          mode: "merge",
          status: "pending",
          items: [
            {
              name: selected.name,
              normalizedName: selected.name,
              quantity: qty,
              op: productAwaiting?.op || "add",
              note: "",
            },
          ],
        } as any;
        await clearRetailAwaiting(client.id);
        logAwaitingConsume("product_clarification", msgText);
        // dejamos seguir para que la lógica normal procese el upsert
      } else {
        await sendMessage("Decime la cantidad y el producto para poder agregarlo.");
        return true;
      }
    } else if (isConfusion(msgText) || msgText.includes("?")) {
      await sendMessage("Necesito la cantidad. Ej: 2");
      return true;
    }
  }

  if (awaiting?.kind === "stock_replacement") {
    const missing = awaiting.missing || [];
    if (!missing.length) {
      await clearRetailAwaiting(client.id);
      await sendMessage("No tengo claro qué producto ajustar. Decime qué cambiamos.");
      return true;
    }
    if (isNo(msgText)) {
      await clearRetailAwaiting(client.id);
      logAwaitingConsume("stock_replacement", msgText);
      await sendMessage("No ajusto el pedido. Decime si querés otra cosa.");
      return true;
    }
    if (isYes(msgText)) {
      await clearRetailAwaiting(client.id);
      logAwaitingConsume("stock_replacement", msgText);
      await sendMessage("Decime con qué querés reemplazar o la cantidad que ajustamos.");
      return true;
    }
    if (isSoftAck(msgText)) {
      await clearRetailAwaiting(client.id);
      logAwaitingConsume("stock_replacement", msgText);
      await sendMessage("Ok, dejamos el pedido como está. Avisame si querés otro ajuste.");
      return true;
    }
    // Si da un nombre nuevo, dejamos que siga al parser normal (se tratará como upsert)
  }


  const askedForCatalog = wantsCatalog(rawText || "");
  if (askedForCatalog) {
    await sendCatalog();
    return true;
  }

  if (isPendingOrdersQuestion(rawText || "")) {
    const pending = await prisma.order.findMany({
      where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    if (!pending.length) {
      await sendMessage(
        "No veo pedidos en revisión ahora. ¿Querés armar uno nuevo o consultar algo más?"
      );
      return true;
    }

    const formatItems = (items: any[]) =>
      Array.isArray(items) && items.length
        ? items.map((it) => `${it.quantity}x ${it.product?.name || "Producto"}`).join(", ")
        : "sin items";

    if (pending.length === 1) {
      const single = pending[0];
      await sendMessage(
        `Tenés 1 pedido en revisión (#${single.sequenceNumber}): ${formatItems(single.items)}. ` +
          `¿Querés confirmarlo o cambiar algo?`
      );
      return true;
    }

    const list = pending
      .map((o) => `#${o.sequenceNumber}: ${formatItems(o.items)}`)
      .join("\n");
    await sendMessage(
      `Tenés ${pending.length} pedidos en revisión:\n${list}\n¿Querés confirmar alguno o agregar algo?`
    );
    return true;
  }

  // ===============================
  // ✅ Si el cliente pregunta por un producto ("tenés galletitas?"), RESPONDEMOS sin tocar el pedido.
  // ===============================
  const inquiry = looksLikeInquiry(rawText || "");
  if (inquiry) {
    const term = extractInquiryTerm(rawText || "") || rawText || "";
    const matches = findProductsByTerm(term, products, 8);

    if (matches.length === 0) {
      await sendMessage(
        `Ahora mismo no encuentro "${term}" en el stock. Si querés, decime marca/tamaño o pedime el catálogo.`
      );
      return true;
    }

    const active = await prisma.order.findFirst({
      where: {
        doctorId: doctor.id,
        clientId: client.id,
        status: { in: ["pending", "confirmed"] },
      },
      orderBy: { createdAt: "desc" },
    });

    const options = formatProductOptions(matches);
    const extra = active
      ? `\n\nSi querés que te lo agregue al pedido #${active.sequenceNumber}, decime cuántas (ej: "sumar 2 de la opción 1").`
      : `\n\nSi querés pedir, decime cuántas (ej: "quiero 2 de la opción 1").`;

    await sendMessage(`Sí, tengo estas opciones 👇\n\n${options}${extra}`);
    return true;
  }


  // Si es un cliente nuevo y no tenemos datos mínimos, pedimos DNI y dirección antes de guardar/confirmar pedidos
  // (para consultas generales o cancelar, no lo bloqueamos)
  const profileRequiredForThisMessage =
    action.type === "retail_upsert_order" ||
    action.type === "retail_confirm_order" ||
    action.type === "retail_attach_payment_proof";

  if (profileRequiredForThisMessage && (!client.dni || !client.businessAddress)) {
    const missing: string[] = [];
    if (!client.dni) missing.push("DNI");
    if (!client.businessAddress) missing.push("dirección de entrega");
    await sendMessage(
      `Para continuar necesito algunos datos: ${missing.join(
        " y "
      )}.\nEnviame algo así:\nDNI: 12345678\nDirección: Calle 123, piso/depto.`
    );
    return true;
  }
  // Si piden cancelar, intentamos cancelar el pedido activo más reciente
  // ✅ IMPORTANTE: No confiamos en el texto del modelo para esto (evita que diga "no tenés" cuando sí cancelamos)
  if (action.type === "retail_cancel_order") {
    const active = await prisma.order.findFirst({
      where: {
        doctorId: doctor.id,
        clientId: client.id,
        status: { in: ["pending", "confirmed"] },
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });

    if (!active) {
      await sendMessage("No encontré ningún pedido activo para cancelar. ¿Querés hacer uno nuevo?");
      return true;
    }

    await restockOrderInventory(active);
    await prisma.order.update({
      where: { id: active.id },
      data: { status: "cancelled" },
    });

    await sendMessage(
      `Listo ✅ cancelé el pedido #${active.sequenceNumber}. Si querés armar otro, pasame productos y cantidades.`
    );
    return true;
  }


  // ===============================
  // ✅ Interceptor “quitar/sacar/borrar” (sin IA)
  // ===============================
  // ✅ IMPORTANTE: normalizar (saca acentos) para que “Quítame” = “quitame”
const removeIncoming = norm(rawText || "");

const isRemoveIntent = /\b(quit(ar|ame|a)?|quitar|sac(ar|ame|a)?|sacar|elimin(ar|ame|a)?|borra(r|me)?|borrame|borrar|sin)\b/i.test(
  removeIncoming
);

const hasOtherModifyIntent = /\b(sum(ar|ame|a)?|agreg(ar|ame|a|alas)?|anad(ir|ime|i)?|añad(ir|ime|i)?|mas|\+|cambi(a|ame|a)?|reemplaz(a|ame|a)?)\b/i.test(
  removeIncoming
);

  if (isRemoveIntent && !hasOtherModifyIntent) {
    const pending = await prisma.order.findFirst({
      where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (!pending) {
      await sendMessage(
        "No encontré un pedido pendiente para editar. Pasame tu pedido con productos y cantidades 🙌"
      );
      return true;
    }

    // ===============================
// ✅ Follow-up de “¿de qué producto querés quitar?”
// Ej: Cliente: "Quitame 1" -> Bot pregunta producto -> Cliente: "1 cif"
// ===============================
const awaitingRemove = getAwaitingRemoveProduct(doctor.id, client.id);

if (awaitingRemove) {
  const follow = norm(rawText || "");

  // Si el mensaje parece un producto (y no es confirmación/pago/etc), intentamos quitar
  if (follow && !isConfirmText(rawText || "") && !asksPaymentMethod(rawText || "")) {
    const pending = await prisma.order.findFirst({
      where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (pending?.items?.length) {
      // qty: si el cliente mandó un número acá, lo usamos; si no, usamos el guardado
      let qty2: number | null = null;
      const digit = follow.match(/\b(\d+)\b/);
      if (digit?.[1]) qty2 = parseInt(digit[1], 10);

      const qtyToRemove = qty2 ?? awaitingRemove.qty ?? 1;

      // candidate = texto sin números/stopwords
      let candidate2 = follow
        .replace(/\b\d+\b/g, " ")
        .replace(/\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|de|del|la|el|los|las)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const productIdsInOrder = new Set(pending.items.map((it) => it.productId));
      const catalogInOrder = products.filter((p) => productIdsInOrder.has(p.id));

      const { product: match2, score: score2 } = matchProductName(candidate2, catalogInOrder);

      if (!match2 || score2 <= 0) {
        const options = pending.items.map((it) => it.product.name).join(", ");
        await sendMessage(`No entendí cuál. En tu pedido tengo: ${options}. Decime cuál querés quitar.`);
        return true;
      }

      const existing2 = pending.items.find((it) => it.productId === match2.id);
      if (!existing2) {
        await sendMessage(`No veo "${match2.name}" en tu pedido actual.`);
        return true;
      }

      const nextQty2 = existing2.quantity - qtyToRemove;

      await prisma.$transaction(async (tx) => {
        if (nextQty2 <= 0) {
          await tx.orderItem.deleteMany({ where: { orderId: pending.id, productId: match2.id } });
        } else {
          await tx.orderItem.updateMany({
            where: { orderId: pending.id, productId: match2.id },
            data: { quantity: nextQty2 },
          });
        }

        const items = await tx.orderItem.findMany({
          where: { orderId: pending.id },
          select: { quantity: true, unitPrice: true },
        });

        const totalAmount = items.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);
        await tx.order.update({ where: { id: pending.id }, data: { totalAmount } });
      });

      const updated = await prisma.order.findUnique({
        where: { id: pending.id },
        include: { items: { include: { product: true } } },
      });

      clearAwaitingRemoveProduct(doctor.id, client.id);

      const summary =
        updated?.items?.map((it) => `- ${it.quantity} x ${it.product.name}`).join("\n") || "Pedido vacío";

      await sendMessage(
        `Listo ✅ Saqué ${qtyToRemove} ${match2.name}.\n\nPedido #${pending.sequenceNumber}:\n${summary}\nTotal: $${updated?.totalAmount ?? 0}`
      );
      return true;
    }
  }
}


    await restockOrderInventory(pending);

    // Detectar “todas/todo” => borrar completo ese producto
    const wantsAll =
      /\b(todas?|todo|toda)\b/i.test(removeIncoming) ||
      /\b(todas\s+las|todos\s+los)\b/i.test(removeIncoming);

    // Extraer cantidad si existe: “quitame 2 cocas”
    const wordNums: Record<string, number> = {
      un: 1,
      una: 1,
      uno: 1,
      dos: 2,
      tres: 3,
      cuatro: 4,
      cinco: 5,
      seis: 6,
      siete: 7,
      ocho: 8,
      nueve: 9,
      diez: 10,
    };

    let qty: number | null = null;
    const digitMatch = removeIncoming.match(/\b(\d+)\b/);
    if (digitMatch) qty = parseInt(digitMatch[1], 10);
    if (!qty) {
      const wn = Object.keys(wordNums).find((w) => new RegExp(`\\b${w}\\b`, "i").test(removeIncoming));
      if (wn) qty = wordNums[wn];
    }

    // Sacar el “verbo” y basura típica para quedarnos con el nombre del producto
    let candidate = removeIncoming
      .replace(
        /^(por\s+favor\s+)?(quitame|quita|quitá|sacame|saca|sacá|eliminame|elimina|borra|borrame|borrar|sin)\s+/i,
        ""
      )
      .replace(/\b(todas?|todo|toda|los|las|el|la|un|una|uno)\b/gi, " ")
      .replace(/\b\d+\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

 if (!candidate) {
  // ✅ guardamos que estamos esperando el producto, con la qty si vino (“quitame 1”)
  setAwaitingRemoveProduct(doctor.id, client.id, qty ?? null);

  const options = pending.items.map((it) => it.product.name).join(", ");
  await sendMessage(
    `¿Querés que te quite ${qty ?? 1} unidad${(qty ?? 1) === 1 ? "" : "es"} de qué producto? ` +
      `Tenés: ${options}`
  );
  return true;
}


    // Match contra productos que están EN el pedido (más seguro)
    const productIdsInOrder = new Set(pending.items.map((it) => it.productId));
    const catalogInOrder = products.filter((p) => productIdsInOrder.has(p.id));

    const { product: match, score } = matchProductName(candidate, catalogInOrder);
    if (!match || score <= 0) {
      const options = pending.items.map((it) => it.product.name).join(", ");
      await sendMessage(
        `No entendí qué querés quitar (${candidate}).\n\nEn tu pedido tengo: ${options}\nDecime cuál saco.`
      );
      return true;
    }

    const existing = pending.items.find((it) => it.productId === match.id);
    if (!existing) {
      await sendMessage(`No veo "${match.name}" en tu pedido actual.`);
      return true;
    }

    // Si no dio cantidad explícita, interpretamos “quitame X” como “sacar todas”
    const removeAll = wantsAll || qty == null;
    const removeQty = removeAll ? existing.quantity : qty!;
    const nextQty = existing.quantity - removeQty;

    await prisma.$transaction(async (tx) => {
      if (nextQty <= 0) {
        await tx.orderItem.deleteMany({
          where: { orderId: pending.id, productId: match.id },
        });
      } else {
        await tx.orderItem.updateMany({
          where: { orderId: pending.id, productId: match.id },
          data: { quantity: nextQty },
        });
      }

      const items = await tx.orderItem.findMany({
        where: { orderId: pending.id },
        select: { quantity: true, unitPrice: true },
      });

      const totalAmount = items.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);

      await tx.order.update({
        where: { id: pending.id },
        data: { totalAmount },
      });
    });

    const updated = await prisma.order.findUnique({
      where: { id: pending.id },
      include: { items: { include: { product: true } } },
    });

    const summary =
      updated?.items.map((it) => `- ${it.quantity} x ${it.product.name}`).join("\n") || "Pedido vacío";

    await sendMessage(
      `Listo ✅ Saqué ${removeAll ? "todas" : removeQty} ${match.name}.\n\nPedido #${
        pending.sequenceNumber
      } :\n${summary}\nTotal: $${
        updated?.totalAmount ?? 0
      }\n\nSi está OK respondé *CONFIRMAR* (o OK / dale / listo) o decime qué querés sumar/quitar.`
    );

    return true;
  }

  const incoming = (rawText || "").trim().toLowerCase();

  // ✅ Aceptación corta del cliente después de “no hay stock”
  const isAcceptShortage =
    /^(ok|oka|okey|dale|listo|bueno|esta bien|está bien|ta bien|tá bien|perfecto)$/i.test(incoming);

  if (isAcceptShortage) {
    const pending = await prisma.order.findFirst({
      where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (!pending) {
      await sendMessage("No encontré un pedido pendiente 🙌 Decime qué querés pedir.");
      return true;
    }

    // Calcular faltantes ahora mismo
    const shortagesNow = pending.items
      .map((it) => {
        const have = it.product?.quantity ?? 0;
        return {
          orderItem: it,
          name: it.product?.name ?? "Producto",
          have,
          need: it.quantity,
        };
      })
      .filter((x) => x.have < x.need);

    // Si NO hay faltantes, interpretamos “ok” como confirmación normal (dejá que siga)
    if (shortagesNow.length === 0) {
      // sigue al interceptor de confirmación
    } else {
      // ✅ Ajustar pedido al stock (0 => borrar, parcial => bajar)
      await prisma.$transaction(async (tx) => {
        for (const s of shortagesNow) {
          const orderId = pending.id;
          const productId = s.orderItem.productId;

          if (s.have <= 0) {
            await tx.orderItem.deleteMany({ where: { orderId, productId } });
          } else {
            await tx.orderItem.updateMany({
              where: { orderId, productId },
              data: { quantity: s.have },
            });
          }
        }

        const items = await tx.orderItem.findMany({
          where: { orderId: pending.id },
          select: { quantity: true, unitPrice: true },
        });

        const totalAmount = items.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);

        await tx.order.update({
          where: { id: pending.id },
          data: { totalAmount },
        });
      });

      const updated = await prisma.order.findUnique({
        where: { id: pending.id },
        include: { items: { include: { product: true } } },
      });

      const summary =
        updated?.items?.length
          ? updated.items.map((it) => `• ${it.quantity} x ${it.product.name}`).join("\n")
          : "";

      if (!updated || updated.items.length === 0) {
        await sendMessage(
          `Dale ✅ Lo dejé sin esos productos porque no había stock.\n\nTu pedido quedó vacío. ¿Querés pedir otra cosa?`
        );
        return true;
      }

      await sendMessage(
        `Listo ✅ Ajusté el pedido.\n\n` +
          `Pedido #${updated.sequenceNumber}:\n${summary}\n` +
          `Total: $${updated.totalAmount}\n\n` +
          `Si está OK respondé *CONFIRMAR*. Si querés cambiar algo, decime qué sumás/quitás.`
      );

      return true;
    }
  }

  if (isQuantityAwaiting) {
    const nums = Array.from(norm(msgText || "").matchAll(/\b(\d+)\b/g)).map((m) => Number(m[1]));
    const qty = nums[0];
    if (qty && qty > 0) {
      const candidates = productAwaiting?.candidates || [];
      const selected = candidates[0] || {
        name: productAwaiting?.productName,
        normalizedName: productAwaiting?.productName,
      };
      action = {
        type: "retail_upsert_order",
        mode: "merge",
        status: "pending",
        items: [
          {
            name: selected.name,
            normalizedName: selected.name,
            quantity: qty,
            op: productAwaiting?.op || "add",
            note: "",
          },
        ],
      } as any;
      await clearRetailAwaiting(client.id);
      logAwaitingConsume("product_clarification", msgText);
      // seguimos al flujo normal para procesar el upsert
    } else if (isConfusion(msgText) || msgText.includes("?")) {
      await sendMessage("Necesito la cantidad. Ej: 2");
      return true;
    }
  }

  // ✅ Alias/CBU (determinístico)
  if (asksPaymentMethod(msgText)) {
    const alias = (doctor as any)?.businessAlias?.trim?.();
    if (!alias) {
      await sendMessage("Todavía no tengo cargado el alias/CBU acá 😕.");
      return true;
    }
    await sendMessage(formatAliasReply(alias));
    return true;
  }

  // ✅ Declaración de transferencia sin comprobante: pedimos el comprobante si no hubo uno reciente
  if (isTransferMention(msgText)) {
    const pending = await prisma.order.findFirst({
      where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
      select: { sequenceNumber: true, items: { select: { quantity: true, product: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    const recentProof = await prisma.paymentProof.findFirst({
      where: { doctorId: doctor.id, clientId: client.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, orderId: true },
    });
    const recentWindowMs = 15 * 60 * 1000;
    const now = Date.now();
    const hasRecent =
      recentProof?.createdAt && now - new Date(recentProof.createdAt).getTime() <= recentWindowMs;

    if (hasRecent && recentProof?.orderId) {
      const ord = await prisma.order.findUnique({
        where: { id: recentProof.orderId },
        select: { sequenceNumber: true },
      });
      await sendMessage(
        ord?.sequenceNumber
          ? `Ya tengo tu comprobante y lo vinculé al pedido #${ord.sequenceNumber}. ¿Querés revisar algo más?`
          : "Ya tengo tu comprobante registrado. ¿Querés que lo vincule a algún pedido?"
      );
      markProofRequestCooldown(doctor.id, client.id);
      return true;
    }

    if (hasRecent && !recentProof?.orderId) {
      markProofRequestCooldown(doctor.id, client.id);
      await setAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });
      await sendMessage("Ya tengo tu comprobante 👍 ¿Para qué pedido es? Mandame el número (ej: 5).");
      return true;
    }

    // Si ya preguntamos hace poco, no insistimos; damos acuse simple y seguimos.
    if (shouldSkipProofRequest(doctor.id, client.id)) {
      const hint = pending?.sequenceNumber
        ? `Cuando puedas, mandá el comprobante y lo asigno al pedido #${pending.sequenceNumber}.`
        : "Cuando puedas, mandá el comprobante y lo asigno al pedido.";
      await sendMessage(hint);
      return true;
    }

    markProofRequestCooldown(doctor.id, client.id);
    const itemsText =
      pending?.items?.length && pending.items.length <= 3
        ? pending.items.map((it) => `${it.quantity}x ${it.product.name}`).join(", ")
        : null;
    const orderPart = pending?.sequenceNumber
      ? ` para el pedido #${pending.sequenceNumber}${itemsText ? ` (${itemsText})` : ""}`
      : "";
    await sendMessage(
      `¡Genial! ¿Me pasás el comprobante o captura de la transferencia${orderPart} así lo asigno?`
    );
    return true;
  }

  if (lastBotAskedProof && (isNo(msgText) || isStopProofText(msgText))) {
    await sendMessage("Listo, no tomo el pago. Cuando tengas el comprobante, mandalo y lo asigno al pedido.");
    return true;
  }

  // ✅ Si el cliente pone “eh?/qué?/no entiendo”, repetimos lo último y NO cambiamos de tema
  if (isConfusion(msgText) && lastBotMsg) {
    const core = firstSentence(lastBotMsg);
    if (core) {
      await sendMessage(`Perdón 🙏 Te decía: ${core}`);
      return true;
    }
  }

  // ✅ FIX: “no/noo” contextual (promo/cancel) — evita preguntas genéricas
  if (isNo(msgText) && lastBotMsg) {
    if (lastBotAskedPromo(lastBotMsg)) {
      await sendMessage(
        "Dale 🙌 No te agrego la promo. ¿Querés armar un pedido igual? Pasame productos y cantidades."
      );
      return true;
    }

    if (lastBotAskedCancel(lastBotMsg)) {
      await sendMessage("Tranqui 🙂 No cancelo nada. ¿Querías algo más o era solo consulta?");
      return true;
    }
  }

  // ✅ Seguimiento de catálogo: si el bot ofreció catálogo y el cliente responde sí/no
  if (lastBotAskedCatalog(lastBotMsg) && (isYes(msgText) || isNo(msgText))) {
    if (isNo(msgText)) {
      await sendMessage("Dale, no te envío el catálogo. Decime qué necesitás y te ayudo.");
      return true;
    }
    await sendCatalog();
    return true;
  }

  // ✅ Confirmación de cancelación después de que el bot preguntó
  if (lastBotAskedCancel(lastBotMsg) && isYes(msgText)) {
    const pending = await prisma.order.findFirst({
      where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });

    if (!pending) {
      await sendMessage("No encontré un pedido para cancelar.");
      return true;
    }

    await restockOrderInventory(pending);
    await prisma.order.update({
      where: { id: pending.id },
      data: { status: "cancelled" },
    });
    await sendMessage(
      `Listo, cancelé el pedido #${pending.sequenceNumber}. Si querés armar uno nuevo, decime qué productos necesitas.`
    );
    return true;
  }

  if (candidateSeq && (isYes(msgText) || isNo(msgText))) {
    if (isYes(msgText)) {
      const ok = await assignLatestUnassignedProofToOrder({
        doctorId: doctor.id,
        clientId: client.id,
        orderSequenceNumber: candidateSeq,
      });

      if (!ok) {
  // ✅ quedamos en modo “esperando #pedido” para que el “5” no dispare el flujo de productos
  await setAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });

  await sendMessage(
    `No pude asignarlo automático al pedido #${candidateSeq}. ` +
    `Mandame el número de pedido de nuevo (ej: 5). ` +
    `Si podés, reenviá el comprobante así lo agarro seguro.`
  );
  return true;
}

      await clearAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });
      await sendMessage(`Listo ✅ Ya cargué tu comprobante para el pedido #${candidateSeq}.`);
      return true;
    }

    await setAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });
    await sendMessage("Perfecto. ¿Para qué pedido es? Mandame el número (ej: 6).");
    return true;
  }

  const awaitingProofOrderNumber = await getAwaitingProofOrderNumber({
    doctorId: doctor.id,
    clientId: client.id,
  });

  if (awaitingProofOrderNumber) {
    const seq =
      extractOrderSeqFromText(msgText) ||
      (() => {
        const m = msgText.match(/\b(\d{1,6})\b/);
        return m?.[1] ? Number(m[1]) : null;
      })();

    if (!seq) {
      await sendMessage("Decime el número de pedido (ej: 6).");
      return true;
    }

    const ok = await assignLatestUnassignedProofToOrder({
      doctorId: doctor.id,
      clientId: client.id,
      orderSequenceNumber: seq,
    });

    if (!ok) {
      await sendMessage(
        `No encontré tu pedido #${seq}. Mandame el número correcto (ej: 6) o decime “pedido #...”.`
      );
      return true;
    }

    await clearAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });
    await sendMessage(`Listo ✅ Asigné el comprobante al pedido #${seq}.`);
    return true;
  }

  const isCustomerConfirm = isConfirmText(rawText || "");

  if (isCustomerConfirm) {
    if (awaiting?.kind === "confirm_order") {
      await clearRetailAwaiting(client.id);
      logAwaitingConsume("confirm_order", msgText);
    }
    // ✅ Si el último bot pidió confirmar cancelación, lo tratamos como cancel
    if (lastBotAskedCancel(lastBotMsg)) {
      const pending = await prisma.order.findFirst({
        where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      });

      if (!pending) {
        await sendMessage("No encontré un pedido para cancelar.");
        return true;
      }

      await restockOrderInventory(pending);
      await prisma.order.update({
        where: { id: pending.id },
        data: { status: "cancelled" },
      });
      await sendMessage(
        `Listo, cancelé el pedido #${pending.sequenceNumber}. Si querés armar otro, pasame productos y cantidades.`
      );
      return true;
    }

    // Si estamos esperando comprobante o pedido para comprobante, ignoramos "confirmo" y pedimos lo pendiente
    if (awaitingProofOrderNumber || shouldSkipProofRequest(doctor.id, client.id)) {
      await sendMessage("Necesito primero el comprobante para avanzar. Cuando lo tengas, mandalo y seguimos.");
      return true;
    }

    const pending = await prisma.order.findFirst({
      where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (!pending) {
      await sendMessage("No encontré un pedido en revisión para confirmar 🙌");
      return true;
    }

    // Ya descontado => no repetir
    if (pending.inventoryDeducted) {
      const summary =
        pending.items.map((it) => `• ${it.quantity} x ${it.product.name}`).join("\n") || "Pedido vacío";
      await sendMessage(
        `Ya esta enviado ✅.\n\nPedido #${pending.sequenceNumber}:\n${summary}\nTotal: $${pending.totalAmount}`
      );
      return true;
    }

    // Agrupar necesidad por producto
    const needByProductId = new Map<number, number>();
    for (const it of pending.items) {
      needByProductId.set(it.productId, (needByProductId.get(it.productId) ?? 0) + it.quantity);
    }
    const productIds = Array.from(needByProductId.keys());

    // Chequeo amigable (para decir exactamente qué falta)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, doctorId: doctor.id },
      select: { id: true, name: true, quantity: true },
    });
    const prodById = new Map(products.map((p) => [p.id, p]));

    const shortages: Array<{ productId: number; name: string; have: number; need: number }> = [];
    for (const [pid, need] of needByProductId.entries()) {
      const p = prodById.get(pid);
      const have = p?.quantity ?? 0;
      if (!p || have < need) {
        shortages.push({ productId: pid, name: p?.name ?? "Producto", have, need });
      }
    }

    if (shortages.length > 0) {
      const msg = shortages.map((s) => `• ${s.name}: pediste ${s.need}, hay ${s.have}`).join("\n");
      await setRetailAwaiting(client.id, {
        kind: "stock_replacement",
        missing: shortages.map((s) => ({
          productId: s.productId,
          name: s.name,
          need: s.need,
          have: s.have,
        })),
        orderSequence: pending.sequenceNumber,
        orderId: pending.id,
        createdAt: Date.now(),
        prompt: `No tengo stock suficiente para confirmar`,
      });
      await sendMessage(
        `No tengo stock suficiente para confirmar 😕\n\n${msg}\n\n` +
          `Decime si querés ajustar cantidades o reemplazar.`
      );
      return true;
    }

    console.log("[Retail] Confirmación con descuento de stock", {
      orderId: pending.id,
      need: Object.fromEntries(needByProductId.entries()),
    });

    // Descuento real (transacción + anti-carreras)
    try {
      await prisma.$transaction(async (tx) => {
        for (const [pid, need] of needByProductId.entries()) {
          const r = await tx.product.updateMany({
            where: { id: pid, doctorId: doctor.id, quantity: { gte: need } },
            data: { quantity: { decrement: need } },
          });
          if (r.count !== 1) {
            throw new Error(`NO_STOCK_RACE:${pid}:${need}`);
          }
        }

        await tx.order.update({
          where: { id: pending.id },
          data: {
            customerConfirmed: true,
            customerConfirmedAt: new Date(),
            inventoryDeducted: true,
            inventoryDeductedAt: new Date(),
          },
        });
      });
    } catch (e: any) {
      if (typeof e?.message === "string" && e.message.startsWith("NO_STOCK_RACE:")) {
        await sendMessage(
          "Uy, justo se quedó sin stock mientras confirmábamos 😕 " +
            "Decime si querés ajustar cantidades o cambiar productos."
        );
        return true;
      }
      throw e;
    }

    // Resumen final desde DB
    const confirmed = await prisma.order.findUnique({
      where: { id: pending.id },
      include: { items: { include: { product: true } } },
    });

    const summary =
      confirmed?.items.map((it) => `• ${it.quantity} x ${it.product.name}`).join("\n") || "Pedido vacío";

    await sendMessage(
      `Listo ✅ envie tu pedido.\n\n` +
        `Pedido #${confirmed?.sequenceNumber} (estado: Falta revisión):\n${summary}\n` +
        `Total: $${confirmed?.totalAmount ?? 0}`
    );

    return true;
  }

  if (action.type !== "retail_upsert_order" && action.type !== "retail_cancel_order") {
    return false;
  }

  let items = Array.isArray(action.items) ? action.items : [];

  items = items.filter((it: any) => {
    const candidate = (it?.normalizedName || it?.name || "").toString();
    return appearsInMessage(candidate, rawText);
  });

  // Extraer intents del texto crudo (add/remove/set) para frases mixtas
  const extracted = extractIntentItems(rawText || "");
  if (extracted.length) {
    const existingKeys = new Set(
      items
        .map((it: any) => norm((it?.normalizedName || it?.name || "").toString()))
        .filter(Boolean)
    );
    extracted.forEach((ex) => {
      const key = norm(ex.name);
      if (existingKeys.has(key)) return;
      items.push({
        name: ex.name,
        normalizedName: ex.name,
        quantity: ex.quantity,
        op: ex.op,
      });
      existingKeys.add(key);
    });
  }

  // Fallback robusto: capturar patrones "n producto" incluso si la IA omitió alguno
  const fallbackItems: Array<{ name: string; quantity: number }> = [];
  const fallbackRemovals: Array<{ name: string; quantity: number }> = [];
  const tokens = norm(rawText || "");
  const matches = Array.from(tokens.matchAll(/\b(\d+)\s*(?:x|×)?\s*([a-z0-9][a-z0-9\s]{1,40}?)(?=(?:\s*(?:,|y|&|\+)\s*\d+|$))/gi)).slice(0, 12);
  for (const m of matches) {
    const qty = Number(m[1]);
    const candidateName = (m[2] || "").trim();
    if (qty > 0 && candidateName) {
      fallbackItems.push({ name: candidateName, quantity: qty });
    }
  }

  // Detectar patrones de quitar/sacar para mapear a op=remove sin bloquear el resto del mensaje
  const removeMatches = Array.from(
    tokens.matchAll(
      /\b(quit(a|ar|ame)|sac(a|ar|ame)|elimin(a|ar|ame)|borr(a|ar|ame)|sin)\s+(\d+)?\s*([a-z0-9][a-z0-9\s]{1,40})/gi
    )
  ).slice(0, 8);
  for (const m of removeMatches) {
    const qtyRaw = m[6];
    const nameRaw = (m[7] || "").trim();
    const qty = qtyRaw ? Number(qtyRaw) : 1;
    if (nameRaw) {
      fallbackRemovals.push({ name: nameRaw, quantity: qty > 0 ? qty : 1 });
    }
  }

  if (fallbackItems.length > 0) {
    const existingKeys = items
      .map((it: any) => norm((it?.normalizedName || it?.name || "").toString()))
      .filter(Boolean);
    for (const fb of fallbackItems) {
      const key = norm(fb.name);
      const overlaps = existingKeys.some((k) => k.includes(key) || key.includes(k));
      if (overlaps) continue;
      items.push({
        name: fb.name,
        normalizedName: fb.name,
        quantity: fb.quantity,
        op: "add",
      });
      existingKeys.push(key);
    }
  }

  if (fallbackRemovals.length > 0) {
    const existingKeys = items
      .map((it: any) => norm((it?.normalizedName || it?.name || "").toString()))
      .filter(Boolean);
    for (const fb of fallbackRemovals) {
      const key = norm(fb.name);
      const overlaps = existingKeys.some((k) => k.includes(key) || key.includes(k));
      if (overlaps) continue;
      items.push({
        name: fb.name,
        normalizedName: fb.name,
        quantity: fb.quantity,
        op: "remove",
      });
      existingKeys.push(key);
    }
  }

  if (!items || items.length === 0) {
    await sendMessage("Decime productos y cantidades, ej: 2 coca, 3 galletitas.");
    return true;
  }

  const normalized = items
    .map((it: any) => {
      const name = typeof it.name === "string" ? it.name.trim() : "";
      const normalizedName =
        typeof it.normalizedName === "string" && it.normalizedName.trim().length > 0
          ? it.normalizedName.trim()
          : name;
      return {
        name: name.toLowerCase(),
        normalizedName: normalizedName.toLowerCase(),
        quantity: Math.max(0, Number(it.quantity) || 0),
        op: typeof it.op === "string" ? it.op : undefined,
      };
    })
    .filter((it: any) => (it.normalizedName || it.name) && it.quantity > 0);

  if (normalized.length === 0) {
    await sendMessage(
      "No pude leer los productos. Decime cada uno con su cantidad, ej: 2 coca 1.5L, 3 sprite."
    );
    return true;
  }

  const missingProducts: Array<{ term: string; quantity: number; op?: string }> = [];
  let resolvedItems: Array<{ productId: number; quantity: number; name: string; op?: string }> = [];

  for (const item of normalized) {
    const candidateName = (item as any).normalizedName || item.name;
    const { product: match, score } = matchProductName(candidateName, products);
    if (!match || score <= 0) {
      missingProducts.push({ term: item.name, quantity: item.quantity, op: (item as any).op });
      continue;
    }
    resolvedItems.push({
      productId: match.id,
      quantity: item.quantity,
      name: match.name,
      op: (item as any).op,
    });
  }

  // ✅ Si faltó mapear algún producto, NO guardamos todavía.
  // En vez de pedir "nombre exacto" seco, sugerimos opciones (nombre + precio + stock)
  // y guardamos estado para seguir el hilo (el próximo mensaje "2" no se pierde).
  if (missingProducts.length > 0) {
    const miss = missingProducts[0];
    const term = miss.term;
    const qty = miss.quantity;

    const candidates = findProductsByTerm(term, products, 6);
    if (candidates.length === 0) {
      await sendMessage(
        `No pude reconocer: ${term}. Decime el nombre exacto como figura en el stock o pedime el catálogo.`
      );
      return true;
    }

    const latestPending = await prisma.order.findFirst({
      where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      select: { sequenceNumber: true, id: true },
    });

    // Guardar estado para el próximo mensaje
    await setRetailAwaiting(client.id, {
      kind: "product_clarification",
      phase: "choose",
      term,
      candidates: candidates.map((p: any) => ({ productId: p.id, name: p.name })),
      desiredQuantity: qty,
      op: (miss.op as any) || "add",
      orderSequence: latestPending?.sequenceNumber ?? null,
      orderId: latestPending?.id ?? null,
      createdAt: Date.now(),
    });

    const options = formatProductOptions(candidates);
    const qtyText = qty ? ` (vos habías puesto ${qty})` : "";
    await sendMessage(
      `Cuando decís "${term}" ¿a cuál te referís?${qtyText}

${options}

Respondeme con el número de opción (ej: "1")` +
        (qty ? ` o "1 x ${qty}".` : ` y la cantidad (ej: "1 x 2").`)
    );
    return true;
  }

  const consolidated = new Map<string, { productId: number; quantity: number; name: string; op?: string }>();
  for (const item of resolvedItems) {
    const key = `${item.productId}:${item.op ?? ""}`;
    const existing = consolidated.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      consolidated.set(key, { ...item });
    }
  }
  resolvedItems = Array.from(consolidated.values());


  if (resolvedItems.length === 0) {
    await sendMessage(
      `No pude encontrar estos productos en el stock: ${missingProducts.map((m) => m.term).join(
        ", "
      )}. Decime nombres más precisos o reemplazos (ej: "yerba playadito 1kg", "coca 1.5L").`
    );
    return true;
  }

  resolvedItems.forEach((ri) => {
    const product = products.find((p) => p.id === ri.productId);
  });

  // Buscar pedidos abiertos (pendientes/confirmados) para decidir cuál tocar
  const openOrders = await prisma.order.findMany({
    where: { doctorId: doctor.id, clientId: client.id, status: { in: ["pending", "confirmed"] } },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
  const pendingOrders = openOrders.filter((o) => o.status === "pending");
  const confirmedOrders = openOrders.filter((o) => o.status === "confirmed");

  // Elegir pedido objetivo respetando el estado conversacional (orderId/sequence)
  let target = pendingOrders[0] ?? confirmedOrders[0] ?? null;
  if (awaiting && "orderId" in awaiting && awaiting.orderId) {
    const found = openOrders.find((o) => o.id === awaiting.orderId);
    if (found) target = found;
  } else if (awaiting && "orderSequence" in awaiting && awaiting.orderSequence) {
    const found = openOrders.find((o) => o.sequenceNumber === awaiting.orderSequence);
    if (found) target = found;
  }

  const wantsEdit =
    /\b(editar|cambiar|modificar|ajustar|actualizar)\b/i.test(rawText || "") &&
    (!Array.isArray(action.items) || action.items.length === 0);
  if (wantsEdit && openOrders.length > 0) {
    const summary = openOrders
      .slice(0, 3)
      .map((o) => {
        const itemsList =
          o.items?.map((it) => `${it.quantity}x ${products.find((p) => p.id === it.productId)?.name || "Producto"}`).join(", ") ||
          "sin ítems";
        return `#${o.sequenceNumber} (${o.status}) · ${itemsList}`;
      })
      .join("\n");
    await sendMessage(
      `Tengo estos pedidos:\n${summary}\nDecime qué producto querés sumar, quitar o cambiar y sobre cuál pedido (#).`
    );
    return true;
  }

  // "sumar/agregar" => suma cantidades. Si no, setea la cantidad del producto mencionado.
  let addMode =
    action.mode === "append" || /\b(sum(ar|ame|á)|agreg(ar|ame|á|alas)|añad(ir|ime|í)|mas|\+)\b/i.test(rawText);

  // Si el cliente dice "quiero/armame/haceme" con lista completa y hay un pendiente,
  // preferimos reemplazar cantidades en vez de sumar para evitar duplicar.
  const wantsFreshReplace =
    pendingOrders.length > 0 &&
    resolvedItems.length > 0 &&
    /\b(quiero|armame|arma|haceme|hace(me)?|pasame|pedido nuevo|arranca|empeza|empezar)\b/i.test(rawText || "") &&
    !/\b(sum(ar|ame|á)|agreg(ar|ame|á|alas)|añad(ir|ime|í)|mas|\+)\b/i.test(rawText || "");

  target = pendingOrders[0] ?? target;
  const targetOrderId = target?.id ?? null;
  const beforeItemsSnapshot = (target?.items || []).map((it) => {
    const productName = products.find((p) => p.id === it.productId)?.name || "Producto";
    return {
      productId: it.productId,
      quantity: it.quantity ?? 0,
      name: productName,
    };
  });

  if (target && target.inventoryDeducted) {
    await restockOrderInventory(target);
  }

  // Reducimos cantidades de forma determinística
  const currentQuantities = new Map<number, number>();
  if (target?.items) {
    target.items.forEach((it) => currentQuantities.set(it.productId, it.quantity));
  }

  if (wantsFreshReplace) {
    currentQuantities.clear();
    addMode = false;
  }

  for (const it of resolvedItems) {
    const baseOp = (it as any).op as string | undefined;
    const op: "add" | "remove" | "set" =
      baseOp === "remove" ? "remove" : baseOp === "set" ? "set" : addMode ? "add" : "set";
    const qty = Math.max(0, Math.trunc((it as any).quantity || 0));
    const prev = currentQuantities.get(it.productId) ?? 0;

  if (op === "remove") {
  // ✅ si vino cantidad (ej: “quitame 2”), restamos; si vino 0, borramos todo
  const next = qty > 0 ? Math.max(0, prev - qty) : 0;
  currentQuantities.set(it.productId, next);
  continue;
}
    if (op === "set") {
      currentQuantities.set(it.productId, qty);
      continue;
    }
    // add (default)
    if (qty > 0) {
      currentQuantities.set(it.productId, prev + qty);
    }
  }

  const finalItems = Array.from(currentQuantities.entries())
    .filter(([, qty]) => qty > 0)
    .map(([productId, quantity]) => ({ productId, quantity }));

  if (finalItems.length === 0) {
    await sendMessage("No quedó ningún producto en el pedido. Decime qué querés agregar.");
    return true;
  }

  // Stock check con cantidades finales
  const stockRows = await prisma.product.findMany({
    where: { id: { in: finalItems.map((i) => i.productId) }, doctorId: doctor.id },
    select: { id: true, name: true, quantity: true },
  });
  const stockById = new Map(stockRows.map((p) => [p.id, p]));
  const stockIssues: Array<{ name: string; have: number; need: number; productId: number }> = [];
  finalItems.forEach((item) => {
    const product = stockById.get(item.productId) || products.find((p) => p.id === item.productId);
    if (product && product.quantity < item.quantity) {
      stockIssues.push({
        name: product.name,
        have: product.quantity ?? 0,
        need: item.quantity,
        productId: product.id,
      });
    }
  });
  if (stockIssues.length > 0) {
    await setRetailAwaiting(client.id, {
      kind: "stock_replacement",
      missing: stockIssues.map((s) => ({
        productId: s.productId,
        name: s.name,
        need: s.need,
        have: s.have,
      })),
      orderSequence: target?.sequenceNumber ?? null,
      orderId: target?.id ?? null,
      createdAt: Date.now(),
      prompt: `No hay stock suficiente para ${stockIssues.map((s) => s.name).join(", ")}`,
    });
    const msg = stockIssues
      .map((s) => `• ${s.name}: pediste ${s.need}, hay ${s.have}`)
      .join("\n");
    await sendMessage(
      `No tengo stock suficiente para esos productos 😕\n\n${msg}\n\nDecime si querés ajustar cantidades o reemplazar por otra marca/variante.`
    );
    return true;
  }

  const upsert = await upsertRetailOrder({
    doctorId: doctor.id,
    clientId: client.id,
    items: finalItems,
    mode: "replace",
    status: "pending", // siempre queda en revisión; la confirmación real la hace el dueño en el panel
    existingOrderId: targetOrderId,
    customerName: action.clientInfo?.fullName || client.fullName || patient?.fullName || "Cliente WhatsApp",
    customerAddress: action.clientInfo?.address || client.businessAddress || patient?.address || null,
    customerDni: action.clientInfo?.dni || client.dni || patient?.dni || null,
  });

  if (!upsert.ok || !upsert.order) {
    await sendMessage("No pude guardar el pedido. Probemos de nuevo indicando los productos.");
    return true;
  }

  let order = upsert.order;

  // ✅ Descontamos stock apenas se registra/edita el pedido para evitar carreras
  if (!order.inventoryDeducted) {
    const needByProductId = new Map<number, number>();
    for (const it of order.items || []) {
      needByProductId.set(it.productId, (needByProductId.get(it.productId) ?? 0) + it.quantity);
    }
    const productIds = Array.from(needByProductId.keys());
    const productRows = await prisma.product.findMany({
      where: { id: { in: productIds }, doctorId: doctor.id },
      select: { id: true, name: true, quantity: true },
    });
    const prodById = new Map(productRows.map((p) => [p.id, p]));

    const shortages = [];
    for (const [pid, need] of needByProductId.entries()) {
      const p = prodById.get(pid);
      const have = p?.quantity ?? 0;
      if (!p || have < need) {
        shortages.push({ name: p?.name ?? "Producto", have, need });
      }
    }

    if (shortages.length > 0) {
      const msg = shortages.map((s) => `• ${s.name}: pediste ${s.need}, hay ${s.have}`).join("\n");
      await sendMessage(
        `No tengo stock suficiente para ese pedido 😕\n\n${msg}\n\n` +
          `Decime si querés ajustar cantidades o reemplazar productos.`
      );
      return true;
    }

    try {
      await prisma.$transaction(async (tx) => {
        for (const [pid, need] of needByProductId.entries()) {
          const r = await tx.product.updateMany({
            where: { id: pid, doctorId: doctor.id, quantity: { gte: need } },
            data: { quantity: { decrement: need } },
          });
          if (r.count !== 1) {
            throw new Error(`NO_STOCK_RACE:${pid}:${need}`);
          }
        }
        await tx.order.update({
          where: { id: order.id },
          data: {
            inventoryDeducted: true,
            inventoryDeductedAt: new Date(),
          },
        });
      });

      order = (await prisma.order.findUnique({
        where: { id: order.id },
        include: { items: { include: { product: true } } },
      })) as typeof order;
    } catch (e: any) {
      if (typeof e?.message === "string" && e.message.startsWith("NO_STOCK_RACE:")) {
        await sendMessage(
          "Uy, justo se quedó sin stock mientras armábamos el pedido 😕 " +
            "Decime si querés ajustar cantidades o cambiar productos."
        );
        return true;
      }
      throw e;
    }
  }

  const summary =
    order.items.map((it) => `- ${it.quantity} x ${it.product?.name || "Producto"}`).join("\n") || "Pedido vacío";

  const isEditingExisting = !!targetOrderId;
  const changesText =
    Array.isArray(action.items) && action.items.length
      ? action.items
          .map((it: any) => {
            const name = (it?.normalizedName || it?.name || "producto").toString();
            const qty =
              typeof it?.quantity === "number" && Number.isFinite(it.quantity)
                ? Math.max(0, Math.trunc(it.quantity))
                : 1;
            const op = (it?.op as string) || "add";
            if (op === "remove") return `saqué ${name}`;
            if (op === "set") return `dejé ${qty} x ${name}`;
            return `sumé ${qty} x ${name}`;
          })
          .join(", ")
      : "sumé lo que me pediste";

  const prefix = isEditingExisting
    ? `Dale. Como ya tenés un pedido en revisión (#${order.sequenceNumber}), ${changesText} a ese mismo pedido.\n\n`
    : "";

  await sendMessage(
    `${prefix}Revisá si está bien 👇\n\n` +
      `Pedido #${order.sequenceNumber} (En revisión):\n${summary}\nTotal: $${order.totalAmount}\n\n` +
      `Si está OK respondé *CONFIRMAR* (o OK / dale / listo).\n` +
      `Para sumar: "sumar 1 coca". Para quitar: "quitar coca". Para cambiar: "cambiar coca a 3".`
  );

  return true;
}
