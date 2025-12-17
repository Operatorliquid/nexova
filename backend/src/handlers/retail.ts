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
  const tokens = norm(itemName)
    .split(" ")
    .map(stem)
    .filter((t) => t.length >= 3);

  if (tokens.length === 0) return false;
  // con que matchee 1 token “fuerte” alcanza (coca / yerba / galletit…)
  return tokens.some((t) => msg.includes(t));
};

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
  return (
    /\btransfe/.test(t) ||
    /\btransferenc/.test(t) ||
    /\btransfiri/.test(t) ||
    /\bpague\b|\bpago\b|\bte pague\b|\bpagado\b/.test(t) ||
    // "deposito" es ambiguo (puede ser "depósito" = lugar).
    // Lo mantenemos, pero evitamos el bucle con un handler de "ubicación" antes.
    /\bdeposit/.test(t) ||
    /\bte (mande|mande|pase|envie) la plata/.test(t) ||
    /\bte gire/.test(t) ||
    /\btransferi\b/.test(t)
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

// ✅ “eh?/que?/no entiendo” (respuesta de confusión)
const isConfusion = (txt: string) => {
  const t = norm(txt);
  return (
    /^(eh+|e+|que|ke|como|no entendi|no entiendo|wtf|what|q onda|que onda|que decis|que deci|no se)$/.test(
      t
    ) ||
    t.length === 0
  );
};

const firstSentence = (s: string) => {
  if (!s) return "";
  const txt = String(s).trim().replace(/\s+/g, " ");

  // Si hay pregunta en español (¿ ... ?), devolvemos la pregunta completa.
  const iStart = txt.indexOf("¿");
  if (iStart >= 0) {
    const iEnd = txt.indexOf("?", iStart);
    if (iEnd > iStart) return txt.slice(iStart, Math.min(iEnd + 1, iStart + 220)).trim();
    return txt.slice(iStart, iStart + 220).trim();
  }

  const q = txt.indexOf("?");
  if (q >= 0) return txt.slice(0, Math.min(q + 1, 220)).trim();

  const nl = txt.indexOf("\n");
  const dot = txt.indexOf(".");
  const cutCandidates = [nl, dot].filter((x) => x >= 0);
  const cut = cutCandidates.length ? Math.min(...cutCandidates) : Math.min(220, txt.length);
  return txt.slice(0, cut).trim();
};

// ✅ FIX: Detecta si el último mensaje del bot ofrecía promo o preguntaba cancelar
const lastBotAskedCancel = (lastBotMsg: string) => /\bcancel/.test(norm(lastBotMsg));

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

// ✅ Ubicación / dirección del depósito / local (determinístico)
function asksStoreLocation(raw: string) {
  const t = normLite(raw || "");
  if (!t) return false;

  // Ej: "donde queda el deposito", "direccion del local", "ubicacion", "maps"
  if (/(donde)\s*(queda|esta)\s*(el|la)?\s*(deposito|local|tienda|sucursal|negocio)/.test(t)) return true;
  if (/\b(direccion|ubicacion|maps|google|como llego|como llegar)\b/.test(t) && /\b(deposito|local|tienda|sucursal|negocio)\b/.test(t)) {
    return true;
  }
  // "donde queda" sin objeto pero viene de contexto de depósito/local
  if (/(donde)\s*(queda|esta)/.test(t) && /\b(deposito|local|tienda|sucursal)\b/.test(t)) return true;
  return false;
}

function formatStoreLocationReply(doctor: any) {
  const address =
    (doctor as any)?.officeAddress ||
    (doctor as any)?.businessAddress ||
    (doctor as any)?.address ||
    (doctor as any)?.storeAddress ||
    null;
  const city = (doctor as any)?.officeCity || (doctor as any)?.city || null;
  const mapsUrl = (doctor as any)?.officeMapsUrl || (doctor as any)?.mapsUrl || null;

  if (!address && !mapsUrl) {
    return "Todavía no tengo cargada la dirección del depósito/local 😕. Si querés, decime por dónde te queda y lo coordinamos.";
  }

  const line = address ? `El depósito/local queda en:\n*${address}${city ? `, ${city}` : ""}*` : "";
  const link = mapsUrl ? `\n\nUbicación: ${mapsUrl}` : "";
  return `${line}${link}\n\nSi querés, decime desde dónde venís y te digo cómo llegar.`.trim();
}

// ✅ Rechazo explícito de comprobante (no solo "no")
function isProofRefusal(raw: string) {
  const t = normLite(raw || "");
  if (!t) return false;
  // Ej: "no voy a mandar ningun comprobante", "no tengo comprobante", "sin comprobante"
  if (/\b(sin\s+comprobante|no\s+tengo\s+comprobante)\b/.test(t)) return true;
  if (/\bno\b/.test(t) && /\b(comprobante|captura|recibo|ticket)\b/.test(t) && /(mandar|enviar|pasar|adjuntar)/.test(t)) return true;
  return false;
}

function formatAliasReply(businessAlias: string) {
  const clean = businessAlias.trim();
  const isCBU = /^\d{20,26}$/.test(clean);
  return isCBU
    ? `Dale 🙌 Te paso el CBU/CVU:\n*${clean}*\n\nCuando transfieras, avisame y si querés mandá el comprobante.`
    : `Dale 🙌 Mi alias es:\n*${clean}*\n\nCuando transfieras, avisame y si querés mandá el comprobante.`;
}

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
  const looksLikeProof =
    /(recib[ií].*(archivo|comprobante)|pdf|transferencia|mp|mercado\s*pago)/i.test(lastBotMsg);
  if (!looksLikeProof) return null;
  return extractOrderSeqFromText(lastBotMsg);
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

// Estado en memoria: el cliente rechazó mandar comprobante (snooze para no insistir)
const proofDeclinedMap = new Map<string, number>();

const markProofDeclined = (doctorId: number, clientId: number) => {
  proofDeclinedMap.set(`${doctorId}:${clientId}`, Date.now());
};

const hasProofDeclinedRecently = (doctorId: number, clientId: number) => {
  const key = `${doctorId}:${clientId}`;
  const ts = proofDeclinedMap.get(key);
  if (!ts) return false;
  // Expira a los 30 minutos
  if (Date.now() - ts > 30 * 60 * 1000) {
    proofDeclinedMap.delete(key);
    return false;
  }
  return true;
};

export async function assignLatestUnassignedProofToOrder(params: {
  doctorId: number;
  clientId: number;
  orderSequenceNumber: number;
}): Promise<boolean> {
  const { doctorId, clientId, orderSequenceNumber } = params;
  const target = await prisma.order.findFirst({
    where: { doctorId, clientId, sequenceNumber: orderSequenceNumber },
    select: { id: true, totalAmount: true, paidAmount: true },
  });
  if (!target) return false;

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const latestProof = await prisma.paymentProof.findFirst({
    where: {
      doctorId,
      clientId,
      orderId: null,
      status: { in: [PaymentProofStatus.unassigned, PaymentProofStatus.duplicate] },
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

export async function handleRetailAgentAction(params: HandleRetailParams) {
  const {
    doctor,
    patient,
    retailClient,
    action,
    replyToPatient,
    phoneE164,
    doctorNumber,
    doctorWhatsappConfig,
    rawText,
  } = params;

  let client = retailClient;

  const products = await prisma.product.findMany({
    where: { doctorId: doctor.id },
    orderBy: { name: "asc" },
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

  const askedForCatalog = wantsCatalog(rawText || "");
  if (askedForCatalog) {
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

      const isHttpsPublic = /^https:\/\//i.test(catalog.publicUrl) && !/localhost|127\.0\.0\.1/i.test(catalog.publicUrl);

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
      const waResult = await sendWhatsAppText(
        phoneE164,
        replyWithLink,
        doctorWhatsappConfig
      );
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
  }

  // Si es un cliente nuevo y no tenemos datos mínimos, pedimos DNI y dirección antes de seguir
  if (!client.dni || !client.businessAddress) {
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

  // Si piden cancelar, intentamos cancelar el pendiente más reciente
  if (action.type === "retail_cancel_order") {
    const pending = await prisma.order.findFirst({
      where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    if (pending) {
      await restockOrderInventory(pending);
      await prisma.order.update({
        where: { id: pending.id },
        data: { status: "cancelled" },
      });
      await sendMessage(
        replyToPatient || `Cancelé el pedido #${pending.sequenceNumber}. Avisame si querés armar otro.`
      );
      return true;
    }
    await sendMessage(replyToPatient || "No encontré un pedido para cancelar.");
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

  if (isRemoveIntent) {
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

  const msgText = (rawText || "").trim();

  // ✅ Dirección / depósito / local (determinístico)
  // Importante: va ANTES de detectar "transferencia" porque "depósito" puede ser lugar.
  if (asksStoreLocation(msgText)) {
    await sendMessage(formatStoreLocationReply(doctor));
    return true;
  }

  // ✅ Si el cliente rechaza mandar comprobante, no insistimos por un rato
  if (isProofRefusal(msgText)) {
    markProofDeclined(doctor.id, client.id);
    markProofRequestCooldown(doctor.id, client.id);
    await clearAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });
    await sendMessage(
      "Dale, no hay drama 🙂. Si después lo podés mandar, mejor para dejarlo registrado. ¿Necesitás algo del pedido o la dirección del depósito?"
    );
    return true;
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
  if (isTransferMention(msgText) && !asksStoreLocation(msgText)) {
    // Si el cliente ya nos dijo que NO manda comprobante, no insistimos.
    if (hasProofDeclinedRecently(doctor.id, client.id)) {
      await sendMessage(
        "Dale 🙂. Quedó avisado. Si después querés mandarme el comprobante, lo cargo y listo."
      );
      return true;
    }

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

    // Si ya preguntamos hace poco, NO volvemos a pedir comprobante (evita loop).
    if (shouldSkipProofRequest(doctor.id, client.id)) {
      await sendMessage("Dale 🙌");
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

  // ✅ Asignación de comprobantes (intercepta antes de confirmar pedido)
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

  const candidateSeq = parseProofCandidateFromLastBotMessage(lastBotMsg);

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
        quantity: Number(it.quantity) || 0,
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

  const missingProducts: string[] = [];
  const resolvedItems: Array<{ productId: number; quantity: number; name: string; op?: string }> = [];

  for (const item of normalized) {
    const candidateName = (item as any).normalizedName || item.name;
    const { product: match, score } = matchProductName(candidateName, products);
    if (!match || score <= 0) {
      missingProducts.push(item.name);
      continue;
    }
    resolvedItems.push({
      productId: match.id,
      quantity: item.quantity,
      name: match.name,
      op: (item as any).op,
    });
  }

  // ✅ Si faltó mapear algún producto, NO guardamos todavía
  if (missingProducts.length > 0) {
    // Sugerimos opciones cercanas en el catálogo (ej: "jugo" -> listar jugos)
    const suggestions: string[] = [];
    for (const miss of missingProducts) {
      const normMiss = miss.toLowerCase();
      const candidates = products
        .filter((p) => p.name.toLowerCase().includes(normMiss))
        .slice(0, 5)
        .map((p) => p.name);
      if (candidates.length) {
        suggestions.push(`${miss}: ${candidates.join(", ")}`);
      }
    }

    await sendMessage(
      `No pude reconocer: ${missingProducts.join(", ")}.` +
        (suggestions.length ? ` Opciones que tengo: ${suggestions.join(" · ")}.` : "") +
        ` Decime el nombre exacto como figura en el stock (ej: "yerba playadito 1kg").`
    );
    return true;
  }

  if (resolvedItems.length === 0) {
    await sendMessage(
      `No pude encontrar estos productos en el stock: ${missingProducts.join(
        ", "
      )}. Decime nombres más precisos o reemplazos (ej: "yerba playadito 1kg", "coca 1.5L").`
    );
    return true;
  }

  resolvedItems.forEach((ri) => {
    const product = products.find((p) => p.id === ri.productId);
  });

  // Buscar pedidos pendientes (para que el agente decida cuál tocar)
  const pendingOrders = await prisma.order.findMany({
    where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  const wantsEdit =
    /\b(editar|cambiar|modificar|ajustar|actualizar)\b/i.test(rawText || "") &&
    (!Array.isArray(action.items) || action.items.length === 0);
  if (wantsEdit && pendingOrders.length > 0) {
    const summary = pendingOrders
      .slice(0, 3)
      .map((o) => {
        const itemsList =
          o.items?.map((it) => `${it.quantity}x ${products.find((p) => p.id === it.productId)?.name || "Producto"}`).join(", ") ||
          "sin ítems";
        return `#${o.sequenceNumber} · ${itemsList}`;
      })
      .join("\n");
    await sendMessage(
      `Tengo estos pedidos:\n${summary}\nDecime qué producto querés sumar, quitar o cambiar y sobre cuál pedido (#).`
    );
    return true;
  }

  // "sumar/agregar" => suma cantidades. Si no, setea la cantidad del producto mencionado.
  const addMode =
    action.mode === "merge" || /\b(sum(ar|ame|á)|agreg(ar|ame|á|alas)|añad(ir|ime|í)|mas|\+)\b/i.test(rawText);

  const target = pendingOrders[0] ?? null;
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

  for (const it of resolvedItems) {
    const baseOp = (it as any).op as string | undefined;
    const op: "add" | "remove" | "set" = baseOp === "remove" || baseOp === "set" ? baseOp : "add";
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
  const stockIssues: string[] = [];
  finalItems.forEach((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (product && product.quantity < item.quantity) {
      stockIssues.push(product.name);
    }
  });
  if (stockIssues.length > 0) {
    await sendMessage(
      `No tengo stock suficiente para: ${stockIssues.join(", ")}. Decime si querés ajustar cantidades o reemplazar.`
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
      `Pedido #${order.sequenceNumber} (Enviado):\n${summary}\nTotal: $${order.totalAmount}\n\n` +
      `Si está OK respondé *CONFIRMAR* (o OK / dale / listo).\n` +
      `Para sumar: "sumar 1 coca". Para quitar: "quitar coca". Para cambiar: "cambiar coca a 3".`
  );

  return true;
}
