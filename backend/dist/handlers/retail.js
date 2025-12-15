"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRetailAgentAction = handleRetailAgentAction;
const prisma_1 = require("../prisma");
const whatsapp_1 = require("../whatsapp");
const hints_1 = require("../utils/hints");
const retail_1 = require("../utils/retail");
const text_1 = require("../utils/text");
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
async function handleRetailAgentAction(params) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
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
            await sendMessage(replyToPatient ||
                `Cancelé el pedido #${pending.sequenceNumber}. Avisame si querés armar otro.`);
            return true;
        }
        await sendMessage(replyToPatient || "No encontré un pedido para cancelar.");
        return true;
    }
    // ===============================
    // ✅ Interceptor “quitar/sacar/borrar” (sin IA)
    // ===============================
    const removeIncoming = (rawText || "").trim().toLowerCase();
    const isRemoveIntent = /\b(quit(a|ame|á)|sac(a|ame|á)|elimin(a|ame|á)|borra|borrame|borrar|sin)\b/i.test(removeIncoming);
    if (isRemoveIntent) {
        const pending = await prisma_1.prisma.order.findFirst({
            where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
            include: { items: { include: { product: true } } },
            orderBy: { createdAt: "desc" },
        });
        if (!pending) {
            await sendMessage("No encontré un pedido en revisión para editar. Pasame tu pedido con productos y cantidades 🙌");
            return true;
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
            const options = pending.items.map((it) => it.product.name).join(", ");
            await sendMessage(`¿Qué querés quitar? Podés decir: "quitá coca" o "quitá 2 galletitas".\n\nEn tu pedido tengo: ${options}`);
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
        await sendMessage(`Listo ✅ Saqué ${removeAll ? "todas" : removeQty} ${match.name}.\n\nPedido #${pending.sequenceNumber} (estado: Falta revisión):\n${summary}\nTotal: $${(_c = updated === null || updated === void 0 ? void 0 : updated.totalAmount) !== null && _c !== void 0 ? _c : 0}\n\nSi está OK respondé *CONFIRMAR* (o OK / dale / listo) o decime qué querés sumar/quitar.`);
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
            await sendMessage("No encontré un pedido en revisión 🙌 Decime qué querés pedir.");
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
            const summary = ((_d = updated === null || updated === void 0 ? void 0 : updated.items) === null || _d === void 0 ? void 0 : _d.length)
                ? updated.items.map((it) => `• ${it.quantity} x ${it.product.name}`).join("\n")
                : "";
            if (!updated || updated.items.length === 0) {
                await sendMessage(`Dale ✅ Lo dejé sin esos productos porque no había stock.\n\n` +
                    `Tu pedido quedó vacío. ¿Querés pedir otra cosa?`);
                return true;
            }
            await sendMessage(`Listo ✅ Ajusté el pedido al stock disponible.\n\n` +
                `Pedido #${updated.sequenceNumber} (estado: Falta revisión):\n${summary}\n` +
                `Total: $${updated.totalAmount}\n\n` +
                `Si está OK respondé *CONFIRMAR*. Si querés cambiar algo, decime qué sumás/quitás.`);
            return true;
        }
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
            const summary = pending.items.map((it) => `• ${it.quantity} x ${it.product.name}`).join("\n") ||
                "Pedido vacío";
            await sendMessage(`Ya estaba confirmado ✅ (stock ya reservado).\n\nPedido #${pending.sequenceNumber}:\n${summary}\nTotal: $${pending.totalAmount}`);
            return true;
        }
        // Agrupar necesidad por producto
        const needByProductId = new Map();
        for (const it of pending.items) {
            needByProductId.set(it.productId, ((_e = needByProductId.get(it.productId)) !== null && _e !== void 0 ? _e : 0) + it.quantity);
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
            const have = (_f = p === null || p === void 0 ? void 0 : p.quantity) !== null && _f !== void 0 ? _f : 0;
            if (!p || have < need) {
                shortages.push({ name: (_g = p === null || p === void 0 ? void 0 : p.name) !== null && _g !== void 0 ? _g : "Producto", have, need });
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
        const summary = (confirmed === null || confirmed === void 0 ? void 0 : confirmed.items.map((it) => `• ${it.quantity} x ${it.product.name}`).join("\n")) ||
            "Pedido vacío";
        await sendMessage(`Listo ✅ confirmé tu pedido y reservé el stock.\n\n` +
            `Pedido #${confirmed === null || confirmed === void 0 ? void 0 : confirmed.sequenceNumber} (estado: Falta revisión):\n${summary}\n` +
            `Total: $${(_h = confirmed === null || confirmed === void 0 ? void 0 : confirmed.totalAmount) !== null && _h !== void 0 ? _h : 0}`);
        return true;
    }
    if (action.type !== "retail_upsert_order" &&
        action.type !== "retail_cancel_order") {
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
        };
    })
        .filter((it) => (it.normalizedName || it.name) && it.quantity > 0);
    if (normalized.length === 0) {
        await sendMessage("No pude leer los productos. Decime cada uno con su cantidad, ej: 2 coca 1.5L, 3 sprite.");
        return true;
    }
    const missingProducts = [];
    const stockIssues = [];
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
        });
    }
    // ✅ Si faltó mapear algún producto, NO guardamos todavía
    if (missingProducts.length > 0) {
        await sendMessage(`No pude reconocer: ${missingProducts.join(", ")}. ` +
            `Decime el nombre exacto como figura en el stock (ej: "yerba playadito 1kg").`);
        return true;
    }
    if (resolvedItems.length === 0) {
        await sendMessage(`No pude mapear estos productos al stock: ${missingProducts.join(", ")}. Decime nombres más precisos o reemplazos (ej: "yerba playadito 1kg", "coca 1.5L").`);
        return true;
    }
    resolvedItems.forEach((ri) => {
        const product = products.find((p) => p.id === ri.productId);
        if (product && product.quantity < ri.quantity) {
            stockIssues.push(`${product.name} (stock ${product.quantity})`);
        }
    });
    if (stockIssues.length > 0) {
        await sendMessage(`No tengo stock suficiente para: ${stockIssues.join(", ")}. Decime si querés ajustar cantidades o reemplazar.`);
        return true;
    }
    // Buscar pedidos pendientes (para que el agente decida cuál tocar)
    const pendingOrders = await prisma_1.prisma.order.findMany({
        where: { doctorId: doctor.id, clientId: client.id, status: "pending" },
        include: { items: true },
        orderBy: { createdAt: "desc" },
    });
    const target = (_j = pendingOrders[0]) !== null && _j !== void 0 ? _j : null;
    const targetOrderId = (_k = target === null || target === void 0 ? void 0 : target.id) !== null && _k !== void 0 ? _k : null;
    if (target && target.inventoryDeducted) {
        await restockOrderInventory(target);
    }
    // "sumar/agregar" => suma cantidades. Si no, setea la cantidad del producto mencionado.
    const addMode = action.mode === "merge" ||
        /\b(sum(ar|ame|á)|agreg(ar|ame|á|alas)|añad(ir|ime|í)|mas|\+)\b/i.test(rawText);
    const itemsToSave = resolvedItems;
    const upsert = await (0, retail_1.upsertRetailOrder)({
        doctorId: doctor.id,
        clientId: client.id,
        items: itemsToSave,
        mode: addMode ? "merge" : "set",
        status: "pending", // siempre queda en revisión; la confirmación real la hace el dueño en el panel
        existingOrderId: targetOrderId,
        customerName: ((_l = action.clientInfo) === null || _l === void 0 ? void 0 : _l.fullName) || client.fullName || (patient === null || patient === void 0 ? void 0 : patient.fullName) || "Cliente WhatsApp",
        customerAddress: ((_m = action.clientInfo) === null || _m === void 0 ? void 0 : _m.address) || client.businessAddress || (patient === null || patient === void 0 ? void 0 : patient.address) || null,
        customerDni: ((_o = action.clientInfo) === null || _o === void 0 ? void 0 : _o.dni) || client.dni || (patient === null || patient === void 0 ? void 0 : patient.dni) || null,
    });
    if (!upsert.ok || !upsert.order) {
        await sendMessage("No pude guardar el pedido. Probemos de nuevo indicando los productos.");
        return true;
    }
    const order = upsert.order;
    const summary = order.items
        .map((it) => `- ${it.quantity} x ${it.product.name}`)
        .join("\n") || "Pedido vacío";
    await sendMessage(`Revisá si está bien 👇\n\nPedido #${order.sequenceNumber} (estado: Falta revisión):\n${summary}\nTotal: $${order.totalAmount}\n\n` +
        `Si está OK respondé *CONFIRMAR* (o OK / dale / listo).\n` +
        `Para sumar: "sumar 1 coca". Para quitar: "quitar coca". Para cambiar: "cambiar coca a 3".`);
    return true;
}
