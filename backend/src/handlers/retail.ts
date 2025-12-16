import { prisma } from "../prisma";
import { sendWhatsAppText } from "../whatsapp";
import { appendMenuHintForBusiness } from "../utils/hints";
import { matchProductName, upsertRetailOrder } from "../utils/retail";
import { normalizeDniInput } from "../utils/text";
import type { Patient, RetailClient } from "@prisma/client";

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

const isYes = (txt: string) => {
  const t = (txt || "").trim().toLowerCase();
  return /^(si|sí|sisi|ok|dale|listo|confirmo|confirmar|de una|obvio)$/.test(t);
};
const isNo = (txt: string) => {
  const t = (txt || "").trim().toLowerCase();
  return /^(no|nop|nah|negativo)$/.test(t);
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
  const looksLikeProof =
    /(recib[ií].*(archivo|comprobante)|pdf|transferencia|mp|mercado\s*pago)/i.test(lastBotMsg);
  if (!looksLikeProof) return null;
  return extractOrderSeqFromText(lastBotMsg);
}

// Estado en memoria para "estoy esperando #pedido para asignar comprobante"
const awaitingProofMap = new Map<string, number>();

async function assignLatestUnassignedProofToOrder(params: {
  doctorId: number;
  clientId: number;
  orderSequenceNumber: number;
}): Promise<boolean> {
  const { doctorId, clientId, orderSequenceNumber } = params;
  const target = await prisma.order.findFirst({
    where: { doctorId, clientId, sequenceNumber: orderSequenceNumber },
    select: { id: true },
  });
  if (!target) return false;

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const latestAtt = await prisma.orderAttachment.findFirst({
    where: {
      order: { doctorId, clientId },
      createdAt: { gte: tenMinutesAgo },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, orderId: true },
  });

  if (!latestAtt) return false;

  await prisma.orderAttachment.update({
    where: { id: latestAtt.id },
    data: { orderId: target.id },
  });

  return true;
}

async function setAwaitingProofOrderNumber(params: { doctorId: number; clientId: number }) {
  awaitingProofMap.set(`${params.doctorId}:${params.clientId}`, Date.now());
}

async function clearAwaitingProofOrderNumber(params: { doctorId: number; clientId: number }) {
  awaitingProofMap.delete(`${params.doctorId}:${params.clientId}`);
}

async function getAwaitingProofOrderNumber(params: {
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
      const waResult = await sendWhatsAppText(
        phoneE164,
        messageWithHint,
        doctorWhatsappConfig
      );
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
        replyToPatient ||
          `Cancelé el pedido #${pending.sequenceNumber}. Avisame si querés armar otro.`
      );
      return true;
    }
    await sendMessage(replyToPatient || "No encontré un pedido para cancelar.");
    return true;
  }

  // ===============================
  // ✅ Interceptor “quitar/sacar/borrar” (sin IA)
  // ===============================
  const removeIncoming = (rawText || "").trim().toLowerCase();

  const isRemoveIntent = /\b(quit(a|ame|á)|sac(a|ame|á)|elimin(a|ame|á)|borra|borrame|borrar|sin)\b/i.test(
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
        "No encontré un pedido en revisión para editar. Pasame tu pedido con productos y cantidades 🙌"
      );
      return true;
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
      const wn = Object.keys(wordNums).find((w) =>
        new RegExp(`\\b${w}\\b`, "i").test(removeIncoming)
      );
      if (wn) qty = wordNums[wn];
    }

    // Sacar el “verbo” y basura típica para quedarnos con el nombre del producto
    let candidate = removeIncoming
      .replace(/^(por\s+favor\s+)?(quitame|quita|quitá|sacame|saca|sacá|eliminame|elimina|borra|borrame|borrar|sin)\s+/i, "")
      .replace(/\b(todas?|todo|toda|los|las|el|la|un|una|uno)\b/gi, " ")
      .replace(/\b\d+\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!candidate) {
      const options = pending.items.map((it) => it.product.name).join(", ");
      await sendMessage(
        `¿Qué querés quitar? Podés decir: "quitá coca" o "quitá 2 galletitas".\n\nEn tu pedido tengo: ${options}`
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
      updated?.items
        .map((it) => `- ${it.quantity} x ${it.product.name}`)
        .join("\n") || "Pedido vacío";

    await sendMessage(
      `Listo ✅ Saqué ${removeAll ? "todas" : removeQty} ${match.name}.\n\nPedido #${pending.sequenceNumber} (estado: Falta revisión):\n${summary}\nTotal: $${updated?.totalAmount ?? 0}\n\nSi está OK respondé *CONFIRMAR* (o OK / dale / listo) o decime qué querés sumar/quitar.`
    );

    return true;
  }

  const incoming = (rawText || "").trim().toLowerCase();

  // ✅ Aceptación corta del cliente después de “no hay stock”
  const isAcceptShortage =
    /^(ok|oka|okey|dale|listo|bueno|esta bien|está bien|ta bien|tá bien|perfecto)$/i.test(
      incoming
    );

  if (isAcceptShortage) {
    const pending = await prisma.order.findFirst({
      where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (!pending) {
      await sendMessage("No encontré un pedido en revisión 🙌 Decime qué querés pedir.");
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
          `Dale ✅ Lo dejé sin esos productos porque no había stock.\n\n` +
            `Tu pedido quedó vacío. ¿Querés pedir otra cosa?`
        );
        return true;
      }

      await sendMessage(
        `Listo ✅ Ajusté el pedido al stock disponible.\n\n` +
          `Pedido #${updated.sequenceNumber} (estado: Falta revisión):\n${summary}\n` +
          `Total: $${updated.totalAmount}\n\n` +
          `Si está OK respondé *CONFIRMAR*. Si querés cambiar algo, decime qué sumás/quitás.`
      );

      return true;
    }
  }

  const msgText = (rawText || "").trim();

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
  const candidateSeq = parseProofCandidateFromLastBotMessage(lastBotMsg);

  if (candidateSeq && (isYes(msgText) || isNo(msgText))) {
    if (isYes(msgText)) {
      const ok = await assignLatestUnassignedProofToOrder({
        doctorId: doctor.id,
        clientId: client.id,
        orderSequenceNumber: candidateSeq,
      });

      if (!ok) {
        await sendMessage(
          `No pude asignar el comprobante al pedido #${candidateSeq}. Decime el número de pedido de nuevo por favor.`
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
        pending.items.map((it) => `• ${it.quantity} x ${it.product.name}`).join("\n") ||
        "Pedido vacío";
      await sendMessage(
        `Ya estaba confirmado ✅ (stock ya reservado).\n\nPedido #${pending.sequenceNumber}:\n${summary}\nTotal: $${pending.totalAmount}`
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
      confirmed?.items.map((it) => `• ${it.quantity} x ${it.product.name}`).join("\n") ||
      "Pedido vacío";

    await sendMessage(
      `Listo ✅ confirmé tu pedido y reservé el stock.\n\n` +
        `Pedido #${confirmed?.sequenceNumber} (estado: Falta revisión):\n${summary}\n` +
        `Total: $${confirmed?.totalAmount ?? 0}`
    );

    return true;
  }

  if (
    action.type !== "retail_upsert_order" &&
    action.type !== "retail_cancel_order"
  ) {
    return false;
  }

  let items = Array.isArray(action.items) ? action.items : [];

  items = items.filter((it: any) => {
    const candidate = (it?.normalizedName || it?.name || "").toString();
    return appearsInMessage(candidate, rawText);
  });

  if (!items || items.length === 0) {
    await sendMessage(
      "Decime productos y cantidades, ej: 2 coca, 3 galletitas."
    );
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
  const resolvedItems: Array<{ productId: number; quantity: number; name: string; op?: string }> =
    [];

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
        (suggestions.length
          ? ` Opciones que tengo: ${suggestions.join(" · ")}.`
          : "") +
        ` Decime el nombre exacto como figura en el stock (ej: "yerba playadito 1kg").`
    );
    return true;
  }

  if (resolvedItems.length === 0) {
    await sendMessage(
      `No pude mapear estos productos al stock: ${missingProducts.join(
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
      `Tengo estos pedidos en revisión:\n${summary}\nDecime qué producto querés sumar, quitar o cambiar y sobre cuál pedido (#).`
    );
    return true;
  }

  // "sumar/agregar" => suma cantidades. Si no, setea la cantidad del producto mencionado.
  const addMode =
    action.mode === "merge" ||
    /\b(sum(ar|ame|á)|agreg(ar|ame|á|alas)|añad(ir|ime|í)|mas|\+)\b/i.test(rawText);

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
    const op: "add" | "remove" | "set" =
      baseOp === "remove" || baseOp === "set" ? baseOp : "add";
    const qty = Math.max(0, Math.trunc((it as any).quantity || 0));
    const prev = currentQuantities.get(it.productId) ?? 0;

    if (op === "remove") {
      currentQuantities.set(it.productId, 0);
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
      `No tengo stock suficiente para: ${stockIssues.join(
        ", "
      )}. Decime si querés ajustar cantidades o reemplazar.`
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
    customerName:
      action.clientInfo?.fullName || client.fullName || patient?.fullName || "Cliente WhatsApp",
    customerAddress:
      action.clientInfo?.address || client.businessAddress || patient?.address || null,
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
    order.items
      .map((it) => `- ${it.quantity} x ${it.product?.name || "Producto"}`)
      .join("\n") || "Pedido vacío";

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
      `Pedido #${order.sequenceNumber} (estado: Falta revisión):\n${summary}\nTotal: $${order.totalAmount}\n\n` +
      `Si está OK respondé *CONFIRMAR* (o OK / dale / listo).\n` +
      `Para sumar: "sumar 1 coca". Para quitar: "quitar coca". Para cambiar: "cambiar coca a 3".`
  );

  return true;
}
