import { Patient, Product, RetailClient } from "@prisma/client";
import { prisma } from "../prisma";

export async function ensureRetailClientForPatient(opts: {
  doctorId: number;
  patient: Patient;
}) {
  const { doctorId, patient } = opts;
  const existing = await prisma.retailClient.findFirst({
    where: { doctorId, patientId: patient.id },
  });
  if (existing) return existing;

  return prisma.retailClient.create({
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

export async function ensureRetailClientForPhone(opts: {
  doctorId: number;
  phone: string;
  name?: string | null;
}): Promise<RetailClient> {
  const { doctorId, phone, name } = opts;
  const existing = await prisma.retailClient.findFirst({
    where: { doctorId, phone },
  });
  if (existing) return existing;
  return prisma.retailClient.create({
    data: {
      doctorId,
      phone,
      fullName: name?.trim() || "Cliente WhatsApp",
    },
  });
}

export function matchProductName(
  query: string,
  products: Product[]
): { product: Product | null; score: number } {
  const queryNorm = normalizeText(query);
  const queryTokens = tokenizeProductQuery(query);

  let best: { product: Product | null; score: number } = {
    product: null,
    score: 0,
  };

  for (const product of products) {
    const nameNorm = normalizeText(product.name);
    const nameTokens = tokenizeProductQuery(product.name);
    let score = 0;

    if (nameNorm.includes(queryNorm) || queryNorm.includes(nameNorm)) {
      score += 3;
    }

    for (const token of queryTokens) {
      if (!token) continue;
      if (nameTokens.includes(token) || nameNorm.includes(token)) {
        score += 1;
      }
    }

    if (score > best.score) {
      best = { product, score };
    }
  }

  return best;
}

export async function findPendingOrderForClient(doctorId: number, clientId: number) {
  return prisma.order.findFirst({
    where: {
      doctorId,
      clientId,
      status: "pending",
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function upsertRetailOrder(params: {
  doctorId: number;
  clientId: number;
  items: Array<{ productId: number; quantity: number }>;
  status?: "pending" | "confirmed" | "cancelled";
  existingOrderId?: number | null;
  customerName: string;
  customerAddress?: string | null;
  customerDni?: string | null;
  mode?: "set" | "merge" | "replace";
}) {
  const {
    doctorId,
    clientId,
    items,
    status = "pending",
    existingOrderId,
    customerName,
    customerAddress,
    customerDni,
    mode,
  } = params;

  // Normalizamos productIds únicos (evita delete/create duplicado)
  const incomingProductIds = Array.from(new Set(items.map((i) => i.productId)));

  const products = await prisma.product.findMany({
    where: { id: { in: incomingProductIds }, doctorId },
    select: { id: true, price: true },
  });

  const priceByProductId = new Map(products.map((p) => [p.id, p.price]));

  let orderId = existingOrderId ?? null;
  let sequenceNumber: number | null = null;

  if (!existingOrderId) {
    const last = await prisma.order.findFirst({
      where: { doctorId },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    });
    sequenceNumber = (last?.sequenceNumber || 0) + 1;
  }

  const effectiveMode: "set" | "merge" | "replace" =
    mode ?? (orderId ? "set" : "replace"); // 👈 default seguro

  const upserted = await prisma.$transaction(async (tx) => {
    if (orderId) {
      // ✅ UPDATE EXISTENTE

      if (effectiveMode === "replace") {
        // comportamiento viejo
        await tx.orderItem.deleteMany({ where: { orderId } });

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
              create: items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: priceByProductId.get(item.productId)!,
              })),
            },
          },
        });
      } else {
        // ✅ SET o MERGE: solo tocamos productIds mencionados

        // Traemos cantidades previas SOLO de esos productos
        const existingSame = await tx.orderItem.findMany({
          where: { orderId, productId: { in: incomingProductIds } },
          select: { productId: true, quantity: true },
        });

        const prevQty = new Map<number, number>();
        for (const it of existingSame) {
          prevQty.set(it.productId, (prevQty.get(it.productId) ?? 0) + it.quantity);
        }

        // Calculamos la cantidad final por producto del mensaje
        const finalRows = items.map((item) => {
          const prev = prevQty.get(item.productId) ?? 0;
          const finalQty = effectiveMode === "merge" ? prev + item.quantity : item.quantity;
          const unitPrice = priceByProductId.get(item.productId);
          if (unitPrice == null) {
            throw new Error(
              `Producto ${item.productId} no encontrado o no pertenece al doctor ${doctorId}`
            );
          }
          return { productId: item.productId, quantity: finalQty, unitPrice };
        });

        // Borramos SOLO los items de esos productos (evita duplicados)
        await tx.orderItem.deleteMany({
          where: { orderId, productId: { in: incomingProductIds } },
        });

        // Creamos los nuevos items para esos productos
        await tx.orderItem.createMany({
          data: finalRows.map((r) => ({ orderId: orderId!, ...r })),
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
          },
        });
      }
    } else {
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

      await tx.orderItem.createMany({
        data: items.map((item) => {
          const unitPrice = priceByProductId.get(item.productId);
          if (unitPrice == null) {
            throw new Error(
              `Producto ${item.productId} no encontrado o no pertenece al doctor ${doctorId}`
            );
          }
          return {
            orderId: orderId!,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice,
          };
        }),
      });
    }

    // ✅ Recalcular totalAmount desde la DB (siempre correcto)
    const allItems = await tx.orderItem.findMany({
      where: { orderId: orderId! },
      select: { quantity: true, unitPrice: true },
    });

    const totalAmount = allItems.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);

    await tx.order.update({
      where: { id: orderId! },
      data: { totalAmount },
    });

    return tx.order.findUnique({
      where: { id: orderId! },
      include: { items: { include: { product: true } } },
    });
  });

  return { ok: true as const, order: upserted };
}

// Helpers internos
function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenizeProductQuery(value: string): string[] {
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
