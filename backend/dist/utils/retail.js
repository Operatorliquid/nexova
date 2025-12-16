"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureRetailClientForPatient = ensureRetailClientForPatient;
exports.ensureRetailClientForPhone = ensureRetailClientForPhone;
exports.matchProductName = matchProductName;
exports.findPendingOrderForClient = findPendingOrderForClient;
exports.upsertRetailOrder = upsertRetailOrder;
exports.getActivePromotionsForDoctor = getActivePromotionsForDoctor;
exports.resolvePromotionForProduct = resolvePromotionForProduct;
const prisma_1 = require("../prisma");
async function ensureRetailClientForPatient(opts) {
    const { doctorId, patient } = opts;
    const existing = await prisma_1.prisma.retailClient.findFirst({
        where: { doctorId, patientId: patient.id },
    });
    if (existing)
        return existing;
    return prisma_1.prisma.retailClient.create({
        data: {
            doctorId,
            patientId: patient.id,
            fullName: patient.fullName || "Cliente WhatsApp",
            phone: patient.phone,
            dni: patient.dni,
            businessAddress: patient.address,
        },
    });
}
async function ensureRetailClientForPhone(opts) {
    const { doctorId, phone, name } = opts;
    const existing = await prisma_1.prisma.retailClient.findFirst({
        where: { doctorId, phone },
    });
    if (existing)
        return existing;
    return prisma_1.prisma.retailClient.create({
        data: {
            doctorId,
            phone,
            fullName: (name === null || name === void 0 ? void 0 : name.trim()) || "Cliente WhatsApp",
        },
    });
}
function matchProductName(query, products) {
    const queryNorm = normalizeText(query);
    const queryNoSpace = queryNorm.replace(/\s+/g, "");
    const queryTokens = tokenizeProductQuery(query);
    let best = {
        product: null,
        score: 0,
    };
    for (const product of products) {
        const nameNorm = normalizeText(product.name);
        const nameTokens = tokenizeProductQuery(product.name);
        const nameNoSpace = nameNorm.replace(/\s+/g, "");
        const aliases = buildProductAliases(nameNorm, nameNoSpace);
        let score = 0;
        if (nameNorm.includes(queryNorm) || queryNorm.includes(nameNorm)) {
            score += 3;
        }
        if (nameNoSpace.includes(queryNoSpace) || queryNoSpace.includes(nameNoSpace)) {
            score += 3;
        }
        for (const token of queryTokens) {
            if (!token)
                continue;
            if (nameTokens.includes(token) || nameNorm.includes(token)) {
                score += 1;
            }
        }
        // Alias y fuzzy leve
        for (const alias of aliases) {
            if (alias.includes(queryNoSpace) || queryNoSpace.includes(alias)) {
                score += 2;
            }
            else {
                const dist = levenshtein(alias, queryNoSpace);
                if (dist === 1)
                    score += 1.5;
                else if (dist === 2)
                    score += 1;
            }
        }
        if (score > best.score) {
            best = { product, score };
        }
    }
    return best;
}
async function findPendingOrderForClient(doctorId, clientId) {
    return prisma_1.prisma.order.findFirst({
        where: {
            doctorId,
            clientId,
            status: "pending",
        },
        include: { items: true },
        orderBy: { createdAt: "desc" },
    });
}
async function upsertRetailOrder(params) {
    const { doctorId, clientId, items, status = "pending", existingOrderId, customerName, customerAddress, customerDni, mode, } = params;
    // Normalizamos productIds únicos (evita delete/create duplicado)
    const incomingProductIds = Array.from(new Set(items.map((i) => i.productId)));
    const products = await prisma_1.prisma.product.findMany({
        where: { id: { in: incomingProductIds }, doctorId },
        select: { id: true, price: true, categories: true },
    });
    const activePromotions = await getActivePromotionsForDoctor(doctorId);
    const priceByProductId = new Map(products.map((p) => [p.id, p.price]));
    let orderId = existingOrderId !== null && existingOrderId !== void 0 ? existingOrderId : null;
    let sequenceNumber = null;
    if (!existingOrderId) {
        const last = await prisma_1.prisma.order.findFirst({
            where: { doctorId },
            orderBy: { sequenceNumber: "desc" },
            select: { sequenceNumber: true },
        });
        sequenceNumber = ((last === null || last === void 0 ? void 0 : last.sequenceNumber) || 0) + 1;
    }
    const effectiveMode = mode !== null && mode !== void 0 ? mode : (orderId ? "set" : "replace"); // 👈 default seguro
    const upserted = await prisma_1.prisma.$transaction(async (tx) => {
        var _a;
        if (orderId) {
            // ✅ UPDATE EXISTENTE
            if (effectiveMode === "replace") {
                // comportamiento viejo
                await tx.orderItem.deleteMany({ where: { orderId } });
                const appliedPromotionIds = new Set();
                await tx.order.update({
                    where: { id: orderId },
                    data: {
                        status,
                        customerName,
                        customerAddress,
                        customerDni,
                        customerConfirmed: false,
                        customerConfirmedAt: null,
                        inventoryDeducted: false,
                        inventoryDeductedAt: null,
                        paymentStatus: "unpaid",
                        paidAmount: 0,
                        items: {
                            create: items.map((item) => {
                                const product = products.find((p) => p.id === item.productId);
                                const effective = resolvePromotionForProduct(product, activePromotions);
                                if (effective.promotionId)
                                    appliedPromotionIds.add(effective.promotionId);
                                return {
                                    productId: item.productId,
                                    quantity: item.quantity,
                                    unitPrice: effective.unitPrice,
                                };
                            }),
                        },
                        promotions: { set: Array.from(appliedPromotionIds).map((id) => ({ id })) },
                    },
                });
            }
            else {
                // ✅ SET o MERGE: solo tocamos productIds mencionados
                // Traemos cantidades previas SOLO de esos productos
                const existingSame = await tx.orderItem.findMany({
                    where: { orderId, productId: { in: incomingProductIds } },
                    select: { productId: true, quantity: true },
                });
                const prevQty = new Map();
                for (const it of existingSame) {
                    prevQty.set(it.productId, ((_a = prevQty.get(it.productId)) !== null && _a !== void 0 ? _a : 0) + it.quantity);
                }
                const appliedPromotionIds = new Set();
                // Calculamos la cantidad final por producto del mensaje
                const finalRows = items.map((item) => {
                    var _a;
                    const prev = (_a = prevQty.get(item.productId)) !== null && _a !== void 0 ? _a : 0;
                    const finalQty = effectiveMode === "merge" ? prev + item.quantity : item.quantity;
                    const product = products.find((p) => p.id === item.productId);
                    if (!product) {
                        throw new Error(`Producto ${item.productId} no encontrado o no pertenece al doctor ${doctorId}`);
                    }
                    const effective = resolvePromotionForProduct(product, activePromotions);
                    if (effective.promotionId)
                        appliedPromotionIds.add(effective.promotionId);
                    return { productId: item.productId, quantity: finalQty, unitPrice: effective.unitPrice };
                });
                // Borramos SOLO los items de esos productos (evita duplicados)
                await tx.orderItem.deleteMany({
                    where: { orderId, productId: { in: incomingProductIds } },
                });
                // Creamos los nuevos items para esos productos
                await tx.orderItem.createMany({
                    data: finalRows.map((r) => ({ orderId: orderId, ...r })),
                });
                // Actualizamos metadata del pedido
                await tx.order.update({
                    where: { id: orderId },
                    data: {
                        status,
                        customerName,
                        customerAddress,
                        customerDni,
                        customerConfirmed: false,
                        customerConfirmedAt: null,
                        inventoryDeducted: false,
                        inventoryDeductedAt: null,
                        paymentStatus: "unpaid",
                        paidAmount: 0,
                        promotions: { set: Array.from(appliedPromotionIds).map((id) => ({ id })) },
                    },
                });
            }
        }
        else {
            // ✅ CREATE NUEVO
            const created = await tx.order.create({
                data: {
                    doctorId,
                    clientId,
                    sequenceNumber: sequenceNumber || 1,
                    status,
                    customerName,
                    customerAddress,
                    customerDni,
                    customerConfirmed: false,
                    customerConfirmedAt: null,
                    inventoryDeducted: false,
                    inventoryDeductedAt: null,
                    paymentStatus: "unpaid",
                    paidAmount: 0,
                },
            });
            orderId = created.id;
            const appliedPromotionIds = new Set();
            await tx.orderItem.createMany({
                data: items.map((item) => {
                    const product = products.find((p) => p.id === item.productId);
                    if (!product) {
                        throw new Error(`Producto ${item.productId} no encontrado o no pertenece al doctor ${doctorId}`);
                    }
                    const effective = resolvePromotionForProduct(product, activePromotions);
                    if (effective.promotionId)
                        appliedPromotionIds.add(effective.promotionId);
                    return {
                        orderId: orderId,
                        productId: item.productId,
                        quantity: item.quantity,
                        unitPrice: effective.unitPrice,
                    };
                }),
            });
            await tx.order.update({
                where: { id: orderId },
                data: {
                    promotions: { set: Array.from(appliedPromotionIds).map((id) => ({ id })) },
                },
            });
        }
        // ✅ Recalcular totalAmount desde la DB (siempre correcto)
        const allItems = await tx.orderItem.findMany({
            where: { orderId: orderId },
            select: { quantity: true, unitPrice: true },
        });
        const totalAmount = allItems.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);
        await tx.order.update({
            where: { id: orderId },
            data: { totalAmount },
        });
        return tx.order.findUnique({
            where: { id: orderId },
            include: { items: { include: { product: true } } },
        });
    });
    return { ok: true, order: upserted };
}
// Helpers internos
async function getActivePromotionsForDoctor(doctorId) {
    const now = new Date();
    return prisma_1.prisma.promotion.findMany({
        where: {
            doctorId,
            isActive: true,
            startDate: { lte: now },
            OR: [{ endDate: null }, { endDate: { gt: now } }],
        },
    });
}
function parseProductIds(raw) {
    if (!raw)
        return [];
    if (Array.isArray(raw)) {
        return raw
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v) && v > 0)
            .map((v) => Math.trunc(v));
    }
    return [];
}
function resolvePromotionForProduct(product, promotions) {
    const basePrice = product.price;
    if (!promotions || promotions.length === 0) {
        return { unitPrice: basePrice, promotionId: null };
    }
    const categories = Array.isArray(product.categories)
        ? product.categories.map((c) => c.toLowerCase())
        : [];
    let bestPromo = null;
    let bestDiscount = 0;
    for (const promo of promotions) {
        const promoProductIds = parseProductIds(promo.productIds);
        const productMatch = promoProductIds.includes(product.id);
        const tagMatch = Array.isArray(promo.productTagLabels)
            ? promo.productTagLabels.some((t) => categories.includes(t.toLowerCase()))
            : false;
        if (!productMatch && !tagMatch)
            continue;
        const discount = promo.discountType === "percent"
            ? Math.round((basePrice * promo.discountValue) / 100)
            : promo.discountValue;
        const cappedDiscount = Math.max(0, Math.min(discount, basePrice));
        if (cappedDiscount > bestDiscount) {
            bestDiscount = cappedDiscount;
            bestPromo = promo;
        }
    }
    if (!bestPromo || bestDiscount <= 0) {
        return { unitPrice: basePrice, promotionId: null };
    }
    return {
        unitPrice: Math.max(0, basePrice - bestDiscount),
        promotionId: bestPromo.id,
    };
}
function normalizeText(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}
function tokenizeProductQuery(value) {
    const stopwords = new Set([
        "de",
        "del",
        "la",
        "el",
        "y",
        "para",
        "un",
        "una",
        "en",
        "con",
        "los",
        "las",
    ]);
    return normalizeText(value)
        .split(/[\s,.;:]+/)
        .map((t) => t.replace(/s$/, ""))
        .filter((t) => t.length > 2 && !stopwords.has(t));
}
function buildProductAliases(nameNorm, nameNoSpace) {
    const aliases = new Set();
    aliases.add(nameNoSpace);
    const base = nameNorm.replace(/\s+/g, "");
    aliases.add(base);
    if (/coca/.test(nameNorm)) {
        aliases.add("cocacola");
        aliases.add("coca");
    }
    if (/manaos/.test(nameNorm)) {
        aliases.add("manaoscola");
        aliases.add("manaos");
    }
    if (/yerba/.test(nameNorm)) {
        aliases.add("yerbamate");
        aliases.add("yrba");
    }
    return Array.from(aliases);
}
function levenshtein(a, b) {
    if (a === b)
        return 0;
    if (!a.length)
        return b.length;
    if (!b.length)
        return a.length;
    const v0 = new Array(b.length + 1).fill(0).map((_, i) => i);
    const v1 = new Array(b.length + 1).fill(0);
    for (let i = 0; i < a.length; i++) {
        v1[0] = i + 1;
        for (let j = 0; j < b.length; j++) {
            const cost = a[i] === b[j] ? 0 : 1;
            v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
        }
        for (let j = 0; j < v0.length; j++)
            v0[j] = v1[j];
    }
    return v1[b.length];
}
