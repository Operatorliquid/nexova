"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRetailAutomationAgent = runRetailAutomationAgent;
const SYSTEM_PROMPT = `
Sos un asistente interno de automatización para un comercio. Recibís una orden en lenguaje natural y devolvés un JSON con acciones concretas para ejecutar en el dashboard.

Reglas importantes:
- Respondé solo JSON válido (nada de texto afuera).
- Acciones disponibles: navigate, send_payment_reminders, adjust_stock, increase_prices_percent, broadcast_prompt, noop.
- Para navegar usá exactamente: {"type":"navigate","target":"promotions"|"orders"|"debts"|"stock"|"clients"|"profile"|"dashboard"} (no uses "view").
- No inventes IDs: usá SOLO los IDs internos que aparecen como "id=123".
- Para pedidos: "orderIds" SIEMPRE son IDs internos (id=...), NO el #sequenceNumber visible.
- No agregues acciones extra no pedidas; si el usuario pide una sola cosa, devolvé sólo esa acción (sin recordar deudores ni nada adicional).
- Si piden recordar deudores, sugerí send_payment_reminders sobre pedidos con saldo pendiente.
- Si piden subir precios, usá increase_prices_percent con percent y opcionalmente productIds.
- Si piden sumar/restar stock, usá adjust_stock con productId o productName y delta (positivo o negativo) o setQuantity.
- Si dicen "eliminar/sacar/borrar" un producto, usá adjust_stock con setQuantity=0 (no inventes un delta).
- Si solo querés abrir una vista, usá navigate.
- Si no hay nada para hacer, devolvé noop con una nota breve.

Formato:
{
  "reply": "texto corto explicando qué harás",
  "actions": [ { ... } ]
}
`;
const ACTION_SCHEMA = {
    anyOf: [
        // navigate
        {
            type: "object",
            additionalProperties: false,
            properties: {
                type: { type: "string", const: "navigate" },
                target: {
                    type: "string",
                    enum: ["orders", "debts", "stock", "promotions", "clients", "profile", "dashboard"],
                },
            },
            required: ["type", "target"],
        },
        // send_payment_reminders
        {
            type: "object",
            additionalProperties: false,
            properties: {
                type: { type: "string", const: "send_payment_reminders" },
                orderIds: { type: "array", items: { type: "number" } },
            },
            required: ["type", "orderIds"],
        },
        // adjust_stock (4 variantes)
        {
            type: "object",
            additionalProperties: false,
            properties: {
                type: { type: "string", const: "adjust_stock" },
                productId: { type: "number" },
                delta: { type: "number" },
            },
            required: ["type", "productId", "delta"],
        },
        {
            type: "object",
            additionalProperties: false,
            properties: {
                type: { type: "string", const: "adjust_stock" },
                productId: { type: "number" },
                setQuantity: { type: "number" },
            },
            required: ["type", "productId", "setQuantity"],
        },
        {
            type: "object",
            additionalProperties: false,
            properties: {
                type: { type: "string", const: "adjust_stock" },
                productName: { type: "string" },
                delta: { type: "number" },
            },
            required: ["type", "productName", "delta"],
        },
        {
            type: "object",
            additionalProperties: false,
            properties: {
                type: { type: "string", const: "adjust_stock" },
                productName: { type: "string" },
                setQuantity: { type: "number" },
            },
            required: ["type", "productName", "setQuantity"],
        },
        // increase_prices_percent (con/sin productIds)
        {
            type: "object",
            additionalProperties: false,
            properties: {
                type: { type: "string", const: "increase_prices_percent" },
                percent: { type: "number" },
            },
            required: ["type", "percent"],
        },
        {
            type: "object",
            additionalProperties: false,
            properties: {
                type: { type: "string", const: "increase_prices_percent" },
                percent: { type: "number" },
                productIds: { type: "array", items: { type: "number" } },
            },
            required: ["type", "percent", "productIds"],
        },
        // broadcast_prompt
        {
            type: "object",
            additionalProperties: false,
            properties: {
                type: { type: "string", const: "broadcast_prompt" },
                message: { type: "string" },
            },
            required: ["type", "message"],
        },
        // noop (con/sin note)
        {
            type: "object",
            additionalProperties: false,
            properties: {
                type: { type: "string", const: "noop" },
            },
            required: ["type"],
        },
        {
            type: "object",
            additionalProperties: false,
            properties: {
                type: { type: "string", const: "noop" },
                note: { type: "string" },
            },
            required: ["type", "note"],
        },
    ],
};
const JSON_SCHEMA = {
    name: "RetailAutomationResult",
    strict: true,
    schema: {
        type: "object",
        additionalProperties: false,
        properties: {
            reply: { type: "string" },
            actions: { type: "array", items: ACTION_SCHEMA },
        },
        required: ["reply", "actions"],
    },
};
function safeJsonParse(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(raw.slice(start, end + 1));
            }
            catch { }
        }
        return null;
    }
}
async function runRetailAutomationAgent(ctx, openai) {
    var _a, _b, _c;
    if (!openai) {
        console.warn("[AutomationRetail] openai=null (no se ejecuta)");
        return null;
    }
    const outstandingSummary = ctx.outstandingOrders
        .slice(0, 15)
        .map((o) => {
        var _a, _b, _c;
        const pending = Math.max(0, o.totalAmount - o.paidAmount);
        return `id=${o.id} | #${(_a = o.sequenceNumber) !== null && _a !== void 0 ? _a : o.id} (${(_b = o.paymentStatus) !== null && _b !== void 0 ? _b : "status?"}) ${(_c = o.clientName) !== null && _c !== void 0 ? _c : "Cliente"} | saldo $${pending} | hace ${o.daysOpen} días`;
    })
        .join("\n");
    const pendingSummary = ctx.pendingOrders
        .slice(0, 10)
        .map((o) => {
        var _a, _b;
        return `id=${o.id} | #${(_a = o.sequenceNumber) !== null && _a !== void 0 ? _a : o.id} | ${(_b = o.clientName) !== null && _b !== void 0 ? _b : "Cliente"} | ${o.items
            .map((it) => `${it.quantity}x ${it.name}`)
            .join(", ") || "vacío"}`;
    })
        .join("\n");
    const productList = ctx.products
        .slice(0, 60)
        .map((p) => {
        var _a;
        return `id=${p.id} | ${p.name} | $${p.price} | stock ${p.quantity}${((_a = p.categories) === null || _a === void 0 ? void 0 : _a.length) ? ` | tags: ${p.categories.join(",")}` : ""}`;
    })
        .join("\n");
    const userContent = `
Pedido del usuario:
${ctx.text}

Pedidos con deuda o saldo (top):
${outstandingSummary || "Sin deudas registradas"}

Pedidos pendientes:
${pendingSummary || "Sin pendientes"}

Productos (id | nombre | precio | stock | tags):
${productList || "Catálogo vacío"}
`;
    let completion;
    try {
        completion = await openai.chat.completions.create({
            model: process.env.OPENAI_COMMERCE_MODEL || "gpt-4.1-mini",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userContent },
            ],
            temperature: 0.2,
            response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
            max_completion_tokens: 600,
        });
    }
    catch (err) {
        console.error("[AutomationRetail] OpenAI error:", err);
        return null;
    }
    const raw = (_c = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim();
    console.log("[AutomationRetail] user text:", ctx.text);
    console.log("[AutomationRetail] raw response:", raw);
    if (!raw)
        return null;
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== "object")
        return null;
    const reply = typeof parsed.reply === "string" ? parsed.reply : "";
    const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    return { reply, actions };
}
