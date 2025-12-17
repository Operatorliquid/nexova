"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignLatestUnassignedProofToOrder = assignLatestUnassignedProofToOrder;
exports.setAwaitingProofOrderNumber = setAwaitingProofOrderNumber;
exports.clearAwaitingProofOrderNumber = clearAwaitingProofOrderNumber;
exports.getAwaitingProofOrderNumber = getAwaitingProofOrderNumber;
exports.handleRetailAgentAction = handleRetailAgentAction;
const prisma_1 = require("../prisma");
const whatsapp_1 = require("../whatsapp");
const hints_1 = require("../utils/hints");
const retail_1 = require("../utils/retail");
const text_1 = require("../utils/text");
const catalogPdf_1 = require("../retail/catalogPdf");
const client_1 = require("@prisma/client");
const norm = (s) => (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca acentos
    .replace(/[^a-z0-9\s]/g, " ") // saca signos/emoji
    .replace(/\s+/g, " ")
    .trim();
const hasModifyIntent = (t) => /\b(sum(ar|ame|a)?|agreg(ar|ame|a|alas)?|anad(ir|ime|i)?|quit(a|ame|a)?|sac(a|ame|a)?|borra|elimin(a|ame|a)?|sin|cambi(a|ame|a)?|reemplaz(a|ame|a)?)\b/i.test(t);
const isConfirmText = (raw) => {
    const t = norm(raw);
    if (hasModifyIntent(t))
        return false;
    if (/\bconfirm/.test(t))
        return true;
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
const stem = (w) => w.replace(/(es|s)$/i, "");
const appearsInMessage = (itemName, rawText) => {
    const msg = norm(rawText);
    const tokens = norm(itemName)
        .split(" ")
        .map(stem)
        .filter((t) => t.length >= 3);
    if (tokens.length === 0)
        return false;
    // con que matchee 1 token “fuerte” alcanza (coca / yerba / galletit…)
    return tokens.some((t) => msg.includes(t));
};
const parseOfficeDays = (raw) => {
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
        const dayNum = dayMap[sanitized];
        if (dayNum !== undefined) {
            set.add(dayNum);
        }
    });
    return set.size ? set : null;
};
const parseOfficeHoursWindows = (raw) => {
    if (!raw)
        return [];
    const normalized = raw
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\n\r]/g, " ")
        .trim();
    if (!normalized)
        return [];
    const windows = [];
    const regex = /(\d{1,2})(?::(\d{2}))?\s*(?:a|-|–|hasta)\s*(\d{1,2})(?::(\d{2}))?/gi;
    const parseTimeToMinutes = (hStr, mStr) => {
        if (!hStr)
            return null;
        const h = Number(hStr);
        const m = Number(mStr !== null && mStr !== void 0 ? mStr : "0");
        if (!Number.isFinite(h) || !Number.isFinite(m))
            return null;
        if (h < 0 || h > 23 || m < 0 || m > 59)
            return null;
        return h * 60 + m;
    };
    let match;
    while ((match = regex.exec(normalized)) && windows.length < 6) {
        const startMinute = parseTimeToMinutes(match[1], match[2]);
        const endMinute = parseTimeToMinutes(match[3], match[4]);
        if (startMinute !== null && endMinute !== null && endMinute > startMinute) {
            windows.push({ startMinute, endMinute });
        }
    }
    return windows.sort((a, b) => a.startMinute - b.startMinute);
};
// ✅ FIX: evitar redeclare de "norm" (dejo este helper sin uso por ahora, solo renombrado)
const normLite = (s) => (s || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sÍ -> si
    .replace(/\s+/g, " ");
const isYes = (txt) => {
    const t = norm(txt);
    // acepta: si, sii, sisi, ok/okay/okey, dale, listo, de una/deuna, joya, perfecto, genial, barbaro, buenisimo
    // y también confirmar/confirmo/confirmar
    return /^(si+|sisi+|ok(ey|a|ay)?|dale+|listo+|confirm(o|ar)?|de una|deuna|obvio|joya|perfecto|genial|barbaro|buenisimo)$/.test(t);
};
const wantsCatalog = (raw) => {
    const t = normLite(raw || "");
    if (!t)
        return false;
    if (/\bcat(a|á)logo\b/.test(t))
        return true;
    if (/\blista\s+de\s+precios\b/.test(t))
        return true;
    if (/\blista\s+de\s+productos\b/.test(t))
        return true;
    if (/\bprecios?\s+(de\s+)?(todo|todos|toda|productos|articulos)\b/.test(t))
        return true;
    return false;
};
const isNo = (txt) => {
    const t = norm(txt);
    // acepta: no, noo, nooo, nop, nah, negativo, para nada
    return /^(no+|nop+|noo+|na+|nono+|non+|noon+|noooo+|non+|Noo+|No+|Non+|negativo|para nada)$/.test(t);
};
// ✅ “eh?/que?/no entiendo” (respuesta de confusión)
const isConfusion = (txt) => {
    const t = norm(txt);
    return /^(eh+|e+|que|ke|como|no entendi|no entiendo)$/.test(t) || t.length === 0;
};
const firstSentence = (s) => {
    if (!s)
        return "";
    const i = s.search(/[¿?]/);
    const cut = i > 0 ? s.slice(0, i) : s;
    return cut.trim();
};
// ✅ FIX: Detecta si el último mensaje del bot ofrecía promo o preguntaba cancelar
const lastBotAskedCancel = (lastBotMsg) => /\bcancel/.test(norm(lastBotMsg));
const lastBotAskedPromo = (lastBotMsg) => {
    const t = norm(lastBotMsg);
    const hasPromoWord = t.includes("promo") || t.includes("descuento") || t.includes("off");
    const isOfferQuestion = t.includes("queres") || t.includes("aprovechar") || t.includes("sumar") || t.includes("agregar");
    return hasPromoWord && isOfferQuestion;
};
function asksPaymentMethod(raw) {
    const t = (raw || "").toLowerCase();
    return (/\b(alias|cbu|cvu)\b/.test(t) ||
        /(a\s*donde|donde)\s*(te\s*)?(puedo\s*)?(transferir|depositar|pagar|mandar)/.test(t) ||
        /(pasame|pasa|mandame|manda)\s*(el\s*)?(alias|cbu|cvu)/.test(t) ||
        /(como|cómo)\s*(te\s*)?(pago|transfero|transfiero)/.test(t) ||
        /(enviar|mandar)\s*(la\s*)?(plata|dinero)/.test(t));
}
function formatAliasReply(businessAlias) {
    const clean = businessAlias.trim();
    const isCBU = /^\d{20,26}$/.test(clean);
    return isCBU
        ? `Dale 🙌 Te paso el CBU/CVU:\n*${clean}*\n\nCuando transfieras, avisame y si querés mandá el comprobante.`
        : `Dale 🙌 Mi alias es:\n*${clean}*\n\nCuando transfieras, avisame y si querés mandá el comprobante.`;
}
function extractOrderSeqFromText(text) {
    if (!text)
        return null;
    const m1 = text.match(/pedido\s*#?\s*(\d+)/i);
    if (m1 === null || m1 === void 0 ? void 0 : m1[1])
        return Number(m1[1]);
    const m2 = text.match(/#\s*(\d+)/);
    if (m2 === null || m2 === void 0 ? void 0 : m2[1])
        return Number(m2[1]);
    return null;
}
function parseProofCandidateFromLastBotMessage(lastBotMsg) {
    if (!lastBotMsg)
        return null;
    const looksLikeProof = /(recib[ií].*(archivo|comprobante)|pdf|transferencia|mp|mercado\s*pago)/i.test(lastBotMsg);
    if (!looksLikeProof)
        return null;
    return extractOrderSeqFromText(lastBotMsg);
}
// ✅ Estado en memoria: el bot preguntó “¿de qué producto querés quitar X?”
const awaitingRemoveProductMap = new Map();
const setAwaitingRemoveProduct = (doctorId, clientId, qty) => {
    awaitingRemoveProductMap.set(`${doctorId}:${clientId}`, { qty, ts: Date.now() });
};
const getAwaitingRemoveProduct = (doctorId, clientId) => {
    const key = `${doctorId}:${clientId}`;
    const v = awaitingRemoveProductMap.get(key);
    if (!v)
        return null;
    if (Date.now() - v.ts > 5 * 60 * 1000) {
        awaitingRemoveProductMap.delete(key);
        return null;
    }
    return v;
};
const clearAwaitingRemoveProduct = (doctorId, clientId) => {
    awaitingRemoveProductMap.delete(`${doctorId}:${clientId}`);
};
// Estado en memoria para "estoy esperando #pedido para asignar comprobante"
const awaitingProofMap = new Map();
async function assignLatestUnassignedProofToOrder(params) {
    const { doctorId, clientId, orderSequenceNumber } = params;
    const target = await prisma_1.prisma.order.findFirst({
        where: { doctorId, clientId, sequenceNumber: orderSequenceNumber },
        select: { id: true, totalAmount: true, paidAmount: true },
    });
    if (!target)
        return false;
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const latestProof = await prisma_1.prisma.paymentProof.findFirst({
        where: {
            doctorId,
            clientId,
            orderId: null,
            status: { in: [client_1.PaymentProofStatus.unassigned, client_1.PaymentProofStatus.duplicate] },
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
    if (!latestProof)
        return false;
    await prisma_1.prisma.$transaction(async (tx) => {
        var _a, _b;
        await tx.paymentProof.update({
            where: { id: latestProof.id },
            data: { orderId: target.id, status: client_1.PaymentProofStatus.assigned },
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
            const nextPaid = ((_a = target.paidAmount) !== null && _a !== void 0 ? _a : 0) + latestProof.amount;
            const nextStatus = nextPaid <= 0
                ? "unpaid"
                : nextPaid >= ((_b = target.totalAmount) !== null && _b !== void 0 ? _b : 0)
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
async function setAwaitingProofOrderNumber(params) {
    awaitingProofMap.set(`${params.doctorId}:${params.clientId}`, Date.now());
}
async function clearAwaitingProofOrderNumber(params) {
    awaitingProofMap.delete(`${params.doctorId}:${params.clientId}`);
}
async function getAwaitingProofOrderNumber(params) {
    const key = `${params.doctorId}:${params.clientId}`;
    const ts = awaitingProofMap.get(key);
    if (!ts)
        return false;
    // Expira a los 15 minutos
    if (Date.now() - ts > 15 * 60 * 1000) {
        awaitingProofMap.delete(key);
        return false;
    }
    return true;
}
async function handleRetailAgentAction(params) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1;
    const { doctor, patient, retailClient, action, replyToPatient, phoneE164, doctorNumber, doctorWhatsappConfig, rawText, } = params;
    let client = retailClient;
    const products = await prisma_1.prisma.product.findMany({
        where: { doctorId: doctor.id },
        orderBy: { name: "asc" },
    });
    const officeDaysSet = parseOfficeDays((_a = doctor.officeDays) !== null && _a !== void 0 ? _a : null);
    const officeHoursWindows = parseOfficeHoursWindows((_b = doctor.officeHours) !== null && _b !== void 0 ? _b : null);
    const sendMessage = async (text) => {
        var _a;
        const messageWithHint = (0, hints_1.appendMenuHintForBusiness)(text, doctor.businessType);
        try {
            const waResult = await (0, whatsapp_1.sendWhatsAppText)(phoneE164, messageWithHint, doctorWhatsappConfig);
            await prisma_1.prisma.message.create({
                data: {
                    waMessageId: (_a = waResult === null || waResult === void 0 ? void 0 : waResult.sid) !== null && _a !== void 0 ? _a : null,
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
        }
        catch (error) {
            console.error("[RetailAgent] Error enviando respuesta:", error);
        }
    };
    const restockOrderInventory = async (order) => {
        var _a;
        if (!order || !order.inventoryDeducted)
            return;
        const map = new Map();
        for (const it of order.items || []) {
            map.set(it.productId, ((_a = map.get(it.productId)) !== null && _a !== void 0 ? _a : 0) + it.quantity);
        }
        await prisma_1.prisma.$transaction(async (tx) => {
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
        if (!info || typeof info !== "object")
            return;
        const clientUpdate = {};
        if (info.fullName && info.fullName.trim().length > 2) {
            const name = info.fullName.trim().slice(0, 120);
            clientUpdate.fullName = name;
        }
        if (info.dni && info.dni.trim()) {
            const normalizedDni = (0, text_1.normalizeDniInput)(info.dni);
            if (normalizedDni) {
                clientUpdate.dni = normalizedDni;
            }
        }
        if (info.address && info.address.trim().length >= 5) {
            const address = info.address.trim().slice(0, 160);
            clientUpdate.businessAddress = address;
        }
        if (Object.keys(clientUpdate).length > 0) {
            client = await prisma_1.prisma.retailClient.update({
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
        const inWindow = officeHoursWindows.some((w) => minutesNow >= w.startMinute && minutesNow <= w.endMinute);
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
        let logoUrl = doctor.ticketLogoUrl;
        if (logoUrl === undefined) {
            const doctorLogo = await prisma_1.prisma.doctor.findUnique({
                where: { id: doctor.id },
                select: { ticketLogoUrl: true },
            });
            logoUrl = (_c = doctorLogo === null || doctorLogo === void 0 ? void 0 : doctorLogo.ticketLogoUrl) !== null && _c !== void 0 ? _c : null;
        }
        try {
            const catalog = await (0, catalogPdf_1.createCatalogPdf)({
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
            const reply = "Te paso el catálogo en PDF con precios y detalles. Contame qué querés pedir 👌";
            const messageWithHint = (0, hints_1.appendMenuHintForBusiness)(reply, doctor.businessType);
            const isHttpsPublic = /^https:\/\//i.test(catalog.publicUrl) && !/localhost|127\.0\.0\.1/i.test(catalog.publicUrl);
            if (isHttpsPublic) {
                try {
                    const waResult = await (0, whatsapp_1.sendWhatsAppText)(phoneE164, messageWithHint, doctorWhatsappConfig, catalog.publicUrl);
                    await prisma_1.prisma.message.create({
                        data: {
                            waMessageId: (_d = waResult === null || waResult === void 0 ? void 0 : waResult.sid) !== null && _d !== void 0 ? _d : null,
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
                }
                catch (err) {
                    console.warn("[RetailAgent] No se pudo enviar media WhatsApp, hago fallback a link:", err);
                }
            }
            // Fallback: mandamos el link en texto (evita errores de MediaUrl en local/http)
            const replyWithLink = `${reply}\n${catalog.publicUrl}`;
            const waResult = await (0, whatsapp_1.sendWhatsAppText)(phoneE164, replyWithLink, doctorWhatsappConfig);
            await prisma_1.prisma.message.create({
                data: {
                    waMessageId: (_e = waResult === null || waResult === void 0 ? void 0 : waResult.sid) !== null && _e !== void 0 ? _e : null,
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
        }
        catch (error) {
            console.error("[RetailAgent] Error generando catálogo PDF:", error);
            await sendMessage("No pude generar el catálogo ahora mismo. Avisame y te lo reenvío.");
        }
        return true;
    }
    // Si es un cliente nuevo y no tenemos datos mínimos, pedimos DNI y dirección antes de seguir
    if (!client.dni || !client.businessAddress) {
        const missing = [];
        if (!client.dni)
            missing.push("DNI");
        if (!client.businessAddress)
            missing.push("dirección de entrega");
        await sendMessage(`Para continuar necesito algunos datos: ${missing.join(" y ")}.\nEnviame algo así:\nDNI: 12345678\nDirección: Calle 123, piso/depto.`);
        return true;
    }
    // Si piden cancelar, intentamos cancelar el pendiente más reciente
    if (action.type === "retail_cancel_order") {
        const pending = await prisma_1.prisma.order.findFirst({
            where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
            include: { items: true },
            orderBy: { createdAt: "desc" },
        });
        if (pending) {
            await restockOrderInventory(pending);
            await prisma_1.prisma.order.update({
                where: { id: pending.id },
                data: { status: "cancelled" },
            });
            await sendMessage(replyToPatient || `Cancelé el pedido #${pending.sequenceNumber}. Avisame si querés armar otro.`);
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
    const isRemoveIntent = /\b(quit(ar|ame|a)?|quitar|sac(ar|ame|a)?|sacar|elimin(ar|ame|a)?|borra(r|me)?|borrame|borrar|sin)\b/i.test(removeIncoming);
    const hasOtherModifyIntent = /\b(sum(ar|ame|a)?|agreg(ar|ame|a|alas)?|anad(ir|ime|i)?|añad(ir|ime|i)?|mas|\+|cambi(a|ame|a)?|reemplaz(a|ame|a)?)\b/i.test(removeIncoming);
    if (isRemoveIntent) {
        const pending = await prisma_1.prisma.order.findFirst({
            where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
            include: { items: { include: { product: true } } },
            orderBy: { createdAt: "desc" },
        });
        if (!pending) {
            await sendMessage("No encontré un pedido pendiente para editar. Pasame tu pedido con productos y cantidades 🙌");
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
                const pending = await prisma_1.prisma.order.findFirst({
                    where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
                    include: { items: { include: { product: true } } },
                    orderBy: { createdAt: "desc" },
                });
                if ((_f = pending === null || pending === void 0 ? void 0 : pending.items) === null || _f === void 0 ? void 0 : _f.length) {
                    // qty: si el cliente mandó un número acá, lo usamos; si no, usamos el guardado
                    let qty2 = null;
                    const digit = follow.match(/\b(\d+)\b/);
                    if (digit === null || digit === void 0 ? void 0 : digit[1])
                        qty2 = parseInt(digit[1], 10);
                    const qtyToRemove = (_g = qty2 !== null && qty2 !== void 0 ? qty2 : awaitingRemove.qty) !== null && _g !== void 0 ? _g : 1;
                    // candidate = texto sin números/stopwords
                    let candidate2 = follow
                        .replace(/\b\d+\b/g, " ")
                        .replace(/\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|de|del|la|el|los|las)\b/g, " ")
                        .replace(/\s+/g, " ")
                        .trim();
                    const productIdsInOrder = new Set(pending.items.map((it) => it.productId));
                    const catalogInOrder = products.filter((p) => productIdsInOrder.has(p.id));
                    const { product: match2, score: score2 } = (0, retail_1.matchProductName)(candidate2, catalogInOrder);
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
                    await prisma_1.prisma.$transaction(async (tx) => {
                        if (nextQty2 <= 0) {
                            await tx.orderItem.deleteMany({ where: { orderId: pending.id, productId: match2.id } });
                        }
                        else {
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
                    const updated = await prisma_1.prisma.order.findUnique({
                        where: { id: pending.id },
                        include: { items: { include: { product: true } } },
                    });
                    clearAwaitingRemoveProduct(doctor.id, client.id);
                    const summary = ((_h = updated === null || updated === void 0 ? void 0 : updated.items) === null || _h === void 0 ? void 0 : _h.map((it) => `- ${it.quantity} x ${it.product.name}`).join("\n")) || "Pedido vacío";
                    await sendMessage(`Listo ✅ Saqué ${qtyToRemove} ${match2.name}.\n\nPedido #${pending.sequenceNumber}:\n${summary}\nTotal: $${(_j = updated === null || updated === void 0 ? void 0 : updated.totalAmount) !== null && _j !== void 0 ? _j : 0}`);
                    return true;
                }
            }
        }
        await restockOrderInventory(pending);
        // Detectar “todas/todo” => borrar completo ese producto
        const wantsAll = /\b(todas?|todo|toda)\b/i.test(removeIncoming) ||
            /\b(todas\s+las|todos\s+los)\b/i.test(removeIncoming);
        // Extraer cantidad si existe: “quitame 2 cocas”
        const wordNums = {
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
        let qty = null;
        const digitMatch = removeIncoming.match(/\b(\d+)\b/);
        if (digitMatch)
            qty = parseInt(digitMatch[1], 10);
        if (!qty) {
            const wn = Object.keys(wordNums).find((w) => new RegExp(`\\b${w}\\b`, "i").test(removeIncoming));
            if (wn)
                qty = wordNums[wn];
        }
        // Sacar el “verbo” y basura típica para quedarnos con el nombre del producto
        let candidate = removeIncoming
            .replace(/^(por\s+favor\s+)?(quitame|quita|quitá|sacame|saca|sacá|eliminame|elimina|borra|borrame|borrar|sin)\s+/i, "")
            .replace(/\b(todas?|todo|toda|los|las|el|la|un|una|uno)\b/gi, " ")
            .replace(/\b\d+\b/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!candidate) {
            // ✅ guardamos que estamos esperando el producto, con la qty si vino (“quitame 1”)
            setAwaitingRemoveProduct(doctor.id, client.id, qty !== null && qty !== void 0 ? qty : null);
            const options = pending.items.map((it) => it.product.name).join(", ");
            await sendMessage(`¿Querés que te quite ${qty !== null && qty !== void 0 ? qty : 1} unidad${(qty !== null && qty !== void 0 ? qty : 1) === 1 ? "" : "es"} de qué producto? ` +
                `Tenés: ${options}`);
            return true;
        }
        // Match contra productos que están EN el pedido (más seguro)
        const productIdsInOrder = new Set(pending.items.map((it) => it.productId));
        const catalogInOrder = products.filter((p) => productIdsInOrder.has(p.id));
        const { product: match, score } = (0, retail_1.matchProductName)(candidate, catalogInOrder);
        if (!match || score <= 0) {
            const options = pending.items.map((it) => it.product.name).join(", ");
            await sendMessage(`No entendí qué querés quitar (${candidate}).\n\nEn tu pedido tengo: ${options}\nDecime cuál saco.`);
            return true;
        }
        const existing = pending.items.find((it) => it.productId === match.id);
        if (!existing) {
            await sendMessage(`No veo "${match.name}" en tu pedido actual.`);
            return true;
        }
        // Si no dio cantidad explícita, interpretamos “quitame X” como “sacar todas”
        const removeAll = wantsAll || qty == null;
        const removeQty = removeAll ? existing.quantity : qty;
        const nextQty = existing.quantity - removeQty;
        await prisma_1.prisma.$transaction(async (tx) => {
            if (nextQty <= 0) {
                await tx.orderItem.deleteMany({
                    where: { orderId: pending.id, productId: match.id },
                });
            }
            else {
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
        const updated = await prisma_1.prisma.order.findUnique({
            where: { id: pending.id },
            include: { items: { include: { product: true } } },
        });
        const summary = (updated === null || updated === void 0 ? void 0 : updated.items.map((it) => `- ${it.quantity} x ${it.product.name}`).join("\n")) || "Pedido vacío";
        await sendMessage(`Listo ✅ Saqué ${removeAll ? "todas" : removeQty} ${match.name}.\n\nPedido #${pending.sequenceNumber} :\n${summary}\nTotal: $${(_k = updated === null || updated === void 0 ? void 0 : updated.totalAmount) !== null && _k !== void 0 ? _k : 0}\n\nSi está OK respondé *CONFIRMAR* (o OK / dale / listo) o decime qué querés sumar/quitar.`);
        return true;
    }
    const incoming = (rawText || "").trim().toLowerCase();
    // ✅ Aceptación corta del cliente después de “no hay stock”
    const isAcceptShortage = /^(ok|oka|okey|dale|listo|bueno|esta bien|está bien|ta bien|tá bien|perfecto)$/i.test(incoming);
    if (isAcceptShortage) {
        const pending = await prisma_1.prisma.order.findFirst({
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
            var _a, _b, _c, _d;
            const have = (_b = (_a = it.product) === null || _a === void 0 ? void 0 : _a.quantity) !== null && _b !== void 0 ? _b : 0;
            return {
                orderItem: it,
                name: (_d = (_c = it.product) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : "Producto",
                have,
                need: it.quantity,
            };
        })
            .filter((x) => x.have < x.need);
        // Si NO hay faltantes, interpretamos “ok” como confirmación normal (dejá que siga)
        if (shortagesNow.length === 0) {
            // sigue al interceptor de confirmación
        }
        else {
            // ✅ Ajustar pedido al stock (0 => borrar, parcial => bajar)
            await prisma_1.prisma.$transaction(async (tx) => {
                for (const s of shortagesNow) {
                    const orderId = pending.id;
                    const productId = s.orderItem.productId;
                    if (s.have <= 0) {
                        await tx.orderItem.deleteMany({ where: { orderId, productId } });
                    }
                    else {
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
            const updated = await prisma_1.prisma.order.findUnique({
                where: { id: pending.id },
                include: { items: { include: { product: true } } },
            });
            const summary = ((_l = updated === null || updated === void 0 ? void 0 : updated.items) === null || _l === void 0 ? void 0 : _l.length)
                ? updated.items.map((it) => `• ${it.quantity} x ${it.product.name}`).join("\n")
                : "";
            if (!updated || updated.items.length === 0) {
                await sendMessage(`Dale ✅ Lo dejé sin esos productos porque no había stock.\n\nTu pedido quedó vacío. ¿Querés pedir otra cosa?`);
                return true;
            }
            await sendMessage(`Listo ✅ Ajusté el pedido.\n\n` +
                `Pedido #${updated.sequenceNumber}:\n${summary}\n` +
                `Total: $${updated.totalAmount}\n\n` +
                `Si está OK respondé *CONFIRMAR*. Si querés cambiar algo, decime qué sumás/quitás.`);
            return true;
        }
    }
    const msgText = (rawText || "").trim();
    // ✅ Alias/CBU (determinístico)
    if (asksPaymentMethod(msgText)) {
        const alias = (_o = (_m = doctor === null || doctor === void 0 ? void 0 : doctor.businessAlias) === null || _m === void 0 ? void 0 : _m.trim) === null || _o === void 0 ? void 0 : _o.call(_m);
        if (!alias) {
            await sendMessage("Todavía no tengo cargado el alias/CBU acá 😕.");
            return true;
        }
        await sendMessage(formatAliasReply(alias));
        return true;
    }
    // ✅ Asignación de comprobantes (intercepta antes de confirmar pedido)
    const lastBotMsgRow = await prisma_1.prisma.message.findFirst({
        where: {
            doctorId: doctor.id,
            retailClientId: client.id,
            direction: "outgoing",
            body: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: { body: true },
    });
    const lastBotMsg = (lastBotMsgRow === null || lastBotMsgRow === void 0 ? void 0 : lastBotMsgRow.body) || "";
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
            await sendMessage("Dale 🙌 No te agrego la promo. ¿Querés armar un pedido igual? Pasame productos y cantidades.");
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
                await sendMessage(`No pude asignarlo automático al pedido #${candidateSeq}. ` +
                    `Mandame el número de pedido de nuevo (ej: 5). ` +
                    `Si podés, reenviá el comprobante así lo agarro seguro.`);
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
        const seq = extractOrderSeqFromText(msgText) ||
            (() => {
                const m = msgText.match(/\b(\d{1,6})\b/);
                return (m === null || m === void 0 ? void 0 : m[1]) ? Number(m[1]) : null;
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
            await sendMessage(`No encontré tu pedido #${seq}. Mandame el número correcto (ej: 6) o decime “pedido #...”.`);
            return true;
        }
        await clearAwaitingProofOrderNumber({ doctorId: doctor.id, clientId: client.id });
        await sendMessage(`Listo ✅ Asigné el comprobante al pedido #${seq}.`);
        return true;
    }
    const isCustomerConfirm = isConfirmText(rawText || "");
    if (isCustomerConfirm) {
        const pending = await prisma_1.prisma.order.findFirst({
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
            const summary = pending.items.map((it) => `• ${it.quantity} x ${it.product.name}`).join("\n") || "Pedido vacío";
            await sendMessage(`Ya esta enviado ✅.\n\nPedido #${pending.sequenceNumber}:\n${summary}\nTotal: $${pending.totalAmount}`);
            return true;
        }
        // Agrupar necesidad por producto
        const needByProductId = new Map();
        for (const it of pending.items) {
            needByProductId.set(it.productId, ((_p = needByProductId.get(it.productId)) !== null && _p !== void 0 ? _p : 0) + it.quantity);
        }
        const productIds = Array.from(needByProductId.keys());
        // Chequeo amigable (para decir exactamente qué falta)
        const products = await prisma_1.prisma.product.findMany({
            where: { id: { in: productIds }, doctorId: doctor.id },
            select: { id: true, name: true, quantity: true },
        });
        const prodById = new Map(products.map((p) => [p.id, p]));
        const shortages = [];
        for (const [pid, need] of needByProductId.entries()) {
            const p = prodById.get(pid);
            const have = (_q = p === null || p === void 0 ? void 0 : p.quantity) !== null && _q !== void 0 ? _q : 0;
            if (!p || have < need) {
                shortages.push({ name: (_r = p === null || p === void 0 ? void 0 : p.name) !== null && _r !== void 0 ? _r : "Producto", have, need });
            }
        }
        if (shortages.length > 0) {
            const msg = shortages.map((s) => `• ${s.name}: pediste ${s.need}, hay ${s.have}`).join("\n");
            await sendMessage(`No tengo stock suficiente para confirmar 😕\n\n${msg}\n\n` +
                `Decime si querés ajustar cantidades o reemplazar.`);
            return true;
        }
        console.log("[Retail] Confirmación con descuento de stock", {
            orderId: pending.id,
            need: Object.fromEntries(needByProductId.entries()),
        });
        // Descuento real (transacción + anti-carreras)
        try {
            await prisma_1.prisma.$transaction(async (tx) => {
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
        }
        catch (e) {
            if (typeof (e === null || e === void 0 ? void 0 : e.message) === "string" && e.message.startsWith("NO_STOCK_RACE:")) {
                await sendMessage("Uy, justo se quedó sin stock mientras confirmábamos 😕 " +
                    "Decime si querés ajustar cantidades o cambiar productos.");
                return true;
            }
            throw e;
        }
        // Resumen final desde DB
        const confirmed = await prisma_1.prisma.order.findUnique({
            where: { id: pending.id },
            include: { items: { include: { product: true } } },
        });
        const summary = (confirmed === null || confirmed === void 0 ? void 0 : confirmed.items.map((it) => `• ${it.quantity} x ${it.product.name}`).join("\n")) || "Pedido vacío";
        await sendMessage(`Listo ✅ envie tu pedido.\n\n` +
            `Pedido #${confirmed === null || confirmed === void 0 ? void 0 : confirmed.sequenceNumber} (estado: Falta revisión):\n${summary}\n` +
            `Total: $${(_s = confirmed === null || confirmed === void 0 ? void 0 : confirmed.totalAmount) !== null && _s !== void 0 ? _s : 0}`);
        return true;
    }
    if (action.type !== "retail_upsert_order" && action.type !== "retail_cancel_order") {
        return false;
    }
    let items = Array.isArray(action.items) ? action.items : [];
    items = items.filter((it) => {
        const candidate = ((it === null || it === void 0 ? void 0 : it.normalizedName) || (it === null || it === void 0 ? void 0 : it.name) || "").toString();
        return appearsInMessage(candidate, rawText);
    });
    if (!items || items.length === 0) {
        await sendMessage("Decime productos y cantidades, ej: 2 coca, 3 galletitas.");
        return true;
    }
    const normalized = items
        .map((it) => {
        const name = typeof it.name === "string" ? it.name.trim() : "";
        const normalizedName = typeof it.normalizedName === "string" && it.normalizedName.trim().length > 0
            ? it.normalizedName.trim()
            : name;
        return {
            name: name.toLowerCase(),
            normalizedName: normalizedName.toLowerCase(),
            quantity: Number(it.quantity) || 0,
            op: typeof it.op === "string" ? it.op : undefined,
        };
    })
        .filter((it) => (it.normalizedName || it.name) && it.quantity > 0);
    if (normalized.length === 0) {
        await sendMessage("No pude leer los productos. Decime cada uno con su cantidad, ej: 2 coca 1.5L, 3 sprite.");
        return true;
    }
    const missingProducts = [];
    const resolvedItems = [];
    for (const item of normalized) {
        const candidateName = item.normalizedName || item.name;
        const { product: match, score } = (0, retail_1.matchProductName)(candidateName, products);
        if (!match || score <= 0) {
            missingProducts.push(item.name);
            continue;
        }
        resolvedItems.push({
            productId: match.id,
            quantity: item.quantity,
            name: match.name,
            op: item.op,
        });
    }
    // ✅ Si faltó mapear algún producto, NO guardamos todavía
    if (missingProducts.length > 0) {
        // Sugerimos opciones cercanas en el catálogo (ej: "jugo" -> listar jugos)
        const suggestions = [];
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
        await sendMessage(`No pude reconocer: ${missingProducts.join(", ")}.` +
            (suggestions.length ? ` Opciones que tengo: ${suggestions.join(" · ")}.` : "") +
            ` Decime el nombre exacto como figura en el stock (ej: "yerba playadito 1kg").`);
        return true;
    }
    if (resolvedItems.length === 0) {
        await sendMessage(`No pude encontrar estos productos en el stock: ${missingProducts.join(", ")}. Decime nombres más precisos o reemplazos (ej: "yerba playadito 1kg", "coca 1.5L").`);
        return true;
    }
    resolvedItems.forEach((ri) => {
        const product = products.find((p) => p.id === ri.productId);
    });
    // Buscar pedidos pendientes (para que el agente decida cuál tocar)
    const pendingOrders = await prisma_1.prisma.order.findMany({
        where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
        include: { items: true },
        orderBy: { createdAt: "desc" },
    });
    const wantsEdit = /\b(editar|cambiar|modificar|ajustar|actualizar)\b/i.test(rawText || "") &&
        (!Array.isArray(action.items) || action.items.length === 0);
    if (wantsEdit && pendingOrders.length > 0) {
        const summary = pendingOrders
            .slice(0, 3)
            .map((o) => {
            var _a;
            const itemsList = ((_a = o.items) === null || _a === void 0 ? void 0 : _a.map((it) => { var _a; return `${it.quantity}x ${((_a = products.find((p) => p.id === it.productId)) === null || _a === void 0 ? void 0 : _a.name) || "Producto"}`; }).join(", ")) ||
                "sin ítems";
            return `#${o.sequenceNumber} · ${itemsList}`;
        })
            .join("\n");
        await sendMessage(`Tengo estos pedidos:\n${summary}\nDecime qué producto querés sumar, quitar o cambiar y sobre cuál pedido (#).`);
        return true;
    }
    // "sumar/agregar" => suma cantidades. Si no, setea la cantidad del producto mencionado.
    const addMode = action.mode === "merge" || /\b(sum(ar|ame|á)|agreg(ar|ame|á|alas)|añad(ir|ime|í)|mas|\+)\b/i.test(rawText);
    const target = (_t = pendingOrders[0]) !== null && _t !== void 0 ? _t : null;
    const targetOrderId = (_u = target === null || target === void 0 ? void 0 : target.id) !== null && _u !== void 0 ? _u : null;
    const beforeItemsSnapshot = ((target === null || target === void 0 ? void 0 : target.items) || []).map((it) => {
        var _a, _b;
        const productName = ((_a = products.find((p) => p.id === it.productId)) === null || _a === void 0 ? void 0 : _a.name) || "Producto";
        return {
            productId: it.productId,
            quantity: (_b = it.quantity) !== null && _b !== void 0 ? _b : 0,
            name: productName,
        };
    });
    if (target && target.inventoryDeducted) {
        await restockOrderInventory(target);
    }
    // Reducimos cantidades de forma determinística
    const currentQuantities = new Map();
    if (target === null || target === void 0 ? void 0 : target.items) {
        target.items.forEach((it) => currentQuantities.set(it.productId, it.quantity));
    }
    for (const it of resolvedItems) {
        const baseOp = it.op;
        const op = baseOp === "remove" || baseOp === "set" ? baseOp : "add";
        const qty = Math.max(0, Math.trunc(it.quantity || 0));
        const prev = (_v = currentQuantities.get(it.productId)) !== null && _v !== void 0 ? _v : 0;
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
    const stockIssues = [];
    finalItems.forEach((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (product && product.quantity < item.quantity) {
            stockIssues.push(product.name);
        }
    });
    if (stockIssues.length > 0) {
        await sendMessage(`No tengo stock suficiente para: ${stockIssues.join(", ")}. Decime si querés ajustar cantidades o reemplazar.`);
        return true;
    }
    const upsert = await (0, retail_1.upsertRetailOrder)({
        doctorId: doctor.id,
        clientId: client.id,
        items: finalItems,
        mode: "replace",
        status: "pending", // siempre queda en revisión; la confirmación real la hace el dueño en el panel
        existingOrderId: targetOrderId,
        customerName: ((_w = action.clientInfo) === null || _w === void 0 ? void 0 : _w.fullName) || client.fullName || (patient === null || patient === void 0 ? void 0 : patient.fullName) || "Cliente WhatsApp",
        customerAddress: ((_x = action.clientInfo) === null || _x === void 0 ? void 0 : _x.address) || client.businessAddress || (patient === null || patient === void 0 ? void 0 : patient.address) || null,
        customerDni: ((_y = action.clientInfo) === null || _y === void 0 ? void 0 : _y.dni) || client.dni || (patient === null || patient === void 0 ? void 0 : patient.dni) || null,
    });
    if (!upsert.ok || !upsert.order) {
        await sendMessage("No pude guardar el pedido. Probemos de nuevo indicando los productos.");
        return true;
    }
    let order = upsert.order;
    // ✅ Descontamos stock apenas se registra/edita el pedido para evitar carreras
    if (!order.inventoryDeducted) {
        const needByProductId = new Map();
        for (const it of order.items || []) {
            needByProductId.set(it.productId, ((_z = needByProductId.get(it.productId)) !== null && _z !== void 0 ? _z : 0) + it.quantity);
        }
        const productIds = Array.from(needByProductId.keys());
        const productRows = await prisma_1.prisma.product.findMany({
            where: { id: { in: productIds }, doctorId: doctor.id },
            select: { id: true, name: true, quantity: true },
        });
        const prodById = new Map(productRows.map((p) => [p.id, p]));
        const shortages = [];
        for (const [pid, need] of needByProductId.entries()) {
            const p = prodById.get(pid);
            const have = (_0 = p === null || p === void 0 ? void 0 : p.quantity) !== null && _0 !== void 0 ? _0 : 0;
            if (!p || have < need) {
                shortages.push({ name: (_1 = p === null || p === void 0 ? void 0 : p.name) !== null && _1 !== void 0 ? _1 : "Producto", have, need });
            }
        }
        if (shortages.length > 0) {
            const msg = shortages.map((s) => `• ${s.name}: pediste ${s.need}, hay ${s.have}`).join("\n");
            await sendMessage(`No tengo stock suficiente para ese pedido 😕\n\n${msg}\n\n` +
                `Decime si querés ajustar cantidades o reemplazar productos.`);
            return true;
        }
        try {
            await prisma_1.prisma.$transaction(async (tx) => {
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
            order = (await prisma_1.prisma.order.findUnique({
                where: { id: order.id },
                include: { items: { include: { product: true } } },
            }));
        }
        catch (e) {
            if (typeof (e === null || e === void 0 ? void 0 : e.message) === "string" && e.message.startsWith("NO_STOCK_RACE:")) {
                await sendMessage("Uy, justo se quedó sin stock mientras armábamos el pedido 😕 " +
                    "Decime si querés ajustar cantidades o cambiar productos.");
                return true;
            }
            throw e;
        }
    }
    const summary = order.items.map((it) => { var _a; return `- ${it.quantity} x ${((_a = it.product) === null || _a === void 0 ? void 0 : _a.name) || "Producto"}`; }).join("\n") || "Pedido vacío";
    const isEditingExisting = !!targetOrderId;
    const changesText = Array.isArray(action.items) && action.items.length
        ? action.items
            .map((it) => {
            const name = ((it === null || it === void 0 ? void 0 : it.normalizedName) || (it === null || it === void 0 ? void 0 : it.name) || "producto").toString();
            const qty = typeof (it === null || it === void 0 ? void 0 : it.quantity) === "number" && Number.isFinite(it.quantity)
                ? Math.max(0, Math.trunc(it.quantity))
                : 1;
            const op = (it === null || it === void 0 ? void 0 : it.op) || "add";
            if (op === "remove")
                return `saqué ${name}`;
            if (op === "set")
                return `dejé ${qty} x ${name}`;
            return `sumé ${qty} x ${name}`;
        })
            .join(", ")
        : "sumé lo que me pediste";
    const prefix = isEditingExisting
        ? `Dale. Como ya tenés un pedido en revisión (#${order.sequenceNumber}), ${changesText} a ese mismo pedido.\n\n`
        : "";
    await sendMessage(`${prefix}Revisá si está bien 👇\n\n` +
        `Pedido #${order.sequenceNumber} (Enviado):\n${summary}\nTotal: $${order.totalAmount}\n\n` +
        `Si está OK respondé *CONFIRMAR* (o OK / dale / listo).\n` +
        `Para sumar: "sumar 1 coca". Para quitar: "quitar coca". Para cambiar: "cambiar coca a 3".`);
    return true;
}
