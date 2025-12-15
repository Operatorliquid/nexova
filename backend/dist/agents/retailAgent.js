"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRetailAgent = runRetailAgent;
const DEFAULT_MODEL = "gpt-4.1-mini";
const SYSTEM_PROMPT = `
Sos un asistente de WhatsApp para comercios (no médico). Actuás como un empleado que piensa: tomás pedidos y los normalizás, sin hablar de turnos.

Instrucciones:

- Leé el mensaje crudo tal cual, sin corregirlo antes. Entendé typos y expresiones (ej: "2 yrbas" => "yerba", "coca" => "Coca Cola").
- Tu salida SIEMPRE tiene que ser un JSON válido, sin texto extra afuera.
- El JSON debe tener estas claves:

{
  "reply": "texto listo para WhatsApp",
  "action": {
    "type": "retail_upsert_order" | "retail_cancel_order" | "ask_clarification" | "general",
    "items": [
      {
        "name": "texto que usa el cliente",
        "normalizedName": "nombre normalizado para el sistema (si no hace falta, repetí name)",
        "quantity": 1,
        "note": "aclaraciones (puede ser cadena vacía)"
      }
    ],
    "status": "pending" | "confirmed" | "cancelled",
    "mode": "replace" | "merge",
    "clientInfo": {
      "fullName": "nombre del cliente si lo da",
      "dni": "dni si lo da",
      "address": "dirección si la da"
    },
    "intent": "texto corto describiendo qué quiso hacer el cliente"
  }
}

Reglas de comportamiento:

- Si hay intención de pedido, usá "type": "retail_upsert_order" y llená bien "items".
- Si el cliente cancela todo, usá "type": "retail_cancel_order".
- Si el mensaje es confuso, usá "type": "ask_clarification" y en "reply" pedí aclaración concreta.
- Si solo pregunta precios, horarios, stock o info general, usá "type": "general".
- Nunca hables de agenda médica ni turnos.
- Nunca preguntes si agregar a pedido actual o crear uno nuevo. Si el cliente pide productos/cantidades, devolvé retail_upsert_order con SOLO los items de ESTE mensaje. El backend decide si edita o crea según si hay pending.
- Si el usuario pide QUITAR/SACAR un producto, NO pidas cantidades de compra. El backend lo resuelve.

IMPORTANTE:
- NO devuelvas nada que no sea JSON.
- NO metas comentarios, ni texto antes o después del JSON.
`;
async function runRetailAgent(ctx, openai) {
    var _a, _b, _c, _d, _e, _f;
    if (!openai)
        return null;
    try {
        const productCatalog = ctx.productCatalog;
        const catalogText = Array.isArray(productCatalog) && productCatalog.length > 0
            ? productCatalog.slice(0, 50).join(" · ")
            : "sin datos de catálogo, deduce por el mensaje";
        const userPrompt = buildAgentPrompt(ctx, catalogText);
        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_COMMERCE_MODEL || DEFAULT_MODEL,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.2,
            response_format: { type: "json_object" },
        });
        const raw = (_c = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) !== null && _c !== void 0 ? _c : "";
        if (!raw)
            return null;
        const trimmed = raw.trim();
        let payload;
        try {
            payload = JSON.parse(trimmed);
        }
        catch (e) {
            console.error("[RetailAgent] JSON parse error, raw content:", trimmed);
            return null;
        }
        if (!payload || typeof payload !== "object")
            return null;
        const reply = typeof payload.reply === "string" ? payload.reply.trim() : "";
        if (!reply)
            return null;
        const action = payload.action || { type: "general" };
        const clientInfo = action.clientInfo;
        const profileUpdates = clientInfo && typeof clientInfo === "object"
            ? {
                name: (_d = clientInfo.fullName) !== null && _d !== void 0 ? _d : null,
                dni: (_e = clientInfo.dni) !== null && _e !== void 0 ? _e : null,
                address: (_f = clientInfo.address) !== null && _f !== void 0 ? _f : null,
            }
            : null;
        return {
            replyToPatient: reply,
            action,
            profileUpdates,
        };
    }
    catch (error) {
        console.error("[RetailAgent] Error:", error);
        return null;
    }
}
function buildAgentPrompt(ctx, catalogText) {
    var _a, _b, _c;
    const pending = (_a = ctx.pendingOrders) === null || _a === void 0 ? void 0 : _a[0];
    const pendingSingleText = pending
        ? `Pedido pendiente #${pending.sequenceNumber}: ${pending.items
            .map((i) => `${i.quantity}x ${i.name}`)
            .join(", ")}`
        : "No hay pedido pendiente.";
    const pendingText = (ctx.pendingOrders || [])
        .slice(0, 3)
        .map((o) => {
        const items = o.items.map((it) => `${it.quantity}x ${it.name}`).join(", ");
        return `#${o.sequenceNumber} (${o.status}): ${items || "vacío"}`;
    })
        .join("\n");
    const recent = (ctx.recentMessages || [])
        .map((m) => `${m.from === "patient" ? "Cliente" : "Bot"}: ${m.text}`)
        .join("\n");
    const clientInfoParts = [];
    if (ctx.patientName)
        clientInfoParts.push(`Nombre: ${ctx.patientName}`);
    if ((_b = ctx.patientProfile) === null || _b === void 0 ? void 0 : _b.dni)
        clientInfoParts.push(`DNI: ${ctx.patientProfile.dni}`);
    if ((_c = ctx.patientProfile) === null || _c === void 0 ? void 0 : _c.address)
        clientInfoParts.push(`Dirección: ${ctx.patientProfile.address}`);
    return `
Pedidos pendientes actuales:
${pendingText || "No hay pedidos pendientes."}

Pedido pendiente principal:
${pendingSingleText}

Catálogo del comercio (ejemplos de productos): ${catalogText}

Datos del cliente (si existen): ${clientInfoParts.join(" | ") || "sin datos aún"}.

Mensaje actual del cliente (crudo, sin normalizar):
"${ctx.text}"

Historial reciente:
${recent || "Sin historial previo."}

Recordá:
- Usá el catálogo solo como referencia, no estás obligado a usarlo literal.
- En action.items poné SOLO lo que el cliente mencionó en ESTE mensaje. No repitas items anteriores.
- Analizá el mensaje completo, entendé qué quiere y devolvé solo el JSON con "reply" y "action".
`;
}
