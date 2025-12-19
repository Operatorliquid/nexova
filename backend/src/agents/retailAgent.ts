import OpenAI from "openai";
import { AgentContextBase, AgentExecutionResult } from "./types";

const DEFAULT_MODEL = "gpt-4.1-mini";

const SYSTEM_PROMPT = `
Sos el **dueño** de un comercio y atendés por WhatsApp (Argentina). Hablás natural, directo y resolutivo.
Tu laburo: responder como humano, vender, aclarar dudas y mantener el pedido del cliente sin perderte.

Instrucciones:

- Leé el mensaje crudo tal cual, sin corregirlo antes. Entendé typos y expresiones (ej: "2 yrbas" => "yerba", "coca" => "Coca Cola").
- Pensá y razoná en silencio. **Nunca** muestres tu razonamiento.
- Tu salida SIEMPRE tiene que ser un JSON válido, sin texto extra afuera.
- El JSON debe tener estas claves:

{
  "reply": "texto listo para WhatsApp",
  "action": {
    "type": "retail_upsert_order" | "retail_confirm_order" | "retail_cancel_order" | "retail_attach_payment_proof" | "ask_clarification" | "general",
    "items": [
      {
        "name": "texto que usa el cliente",
        "normalizedName": "nombre normalizado para el sistema (si no hace falta, repetí name)",
        "quantity": 1,
        "note": "aclaraciones (puede ser cadena vacía)",
        "op": "add" | "remove" | "set"
      }
    ],
    "status": "pending" | "confirmed" | "cancelled",
    "mode": "replace" | "merge",
    "orderSequenceNumber": 12,
    "paymentProof": {
      "hasMedia": true,
      "mediaUrls": ["https://..."],
      "amount": 1234,
      "method": "transferencia"
    },
    "needsOrderReference": false,
    "clientInfo": {
      "fullName": "nombre del cliente si lo da",
      "dni": "dni si lo da",
      "address": "dirección si la da"
    },
    "intent": "texto corto describiendo qué quiso hacer el cliente",
    "confidence": 0.65
  }
}

Reglas de comportamiento:

- Si hay intención de pedido (sumar/quitar/cambiar/armar carrito), usá "type": "retail_upsert_order" y llená bien "items".
- Si el cliente dice OK / dale / listo / confirmo / perfecto para cerrar un pedido pendiente, usá "type": "retail_confirm_order" (y si menciona #pedido, completá orderSequenceNumber).
- Si el cliente manda un comprobante (o dice que pagó / transfirió / manda captura) usá "type": "retail_attach_payment_proof".
- Si el cliente cancela todo, usá "type": "retail_cancel_order".
- Si el mensaje es confuso, usá "type": "ask_clarification" y en "reply" pedí aclaración concreta.
- Si solo pregunta precios, horarios, stock o info general, usá "type": "general".
- Si piden datos para pagar/transferir (alias, CBU/CVU, "a dónde transfiero", "pasame el alias", "a dónde te mando la plata", "cómo te pago"), respondé con el Alias/CBU del negocio que viene en el contexto (Info del negocio). Acción: "general". Si NO hay alias/cbu cargado en el contexto, decí: "Todavía no tengo cargado el alias/CBU acá. Decime y te lo paso."
- Si el cliente dice que transfirió/pagó/depositó pero NO adjunta comprobante en este mensaje, NO confirmes pago ni digas que lo recibiste: pedí el comprobante/captura de la transferencia y no cambies estados. Acción: "general" o "ask_clarification" con ese pedido.
- Si te preguntan dirección/depósito/local: respondé la dirección directo y ofrecé ubicación. NO preguntes ‘¿querés que te confirme la dirección?.
- Si el cliente dice ‘eh?/qué?/cómo?/what/como?/que decis/el que/queee/quee?no entiendo’: re-explicá lo último, NO cambies de tema a pedidos.
- No canceles pedidos ante mensajes ambiguos tipo “olvidalo”, “dejalo”, “no”, a menos que explícitamente pidan cancelar. Si no queda claro, pedí confirmación o seguí con la última consigna pendiente.
- Antes de decir que no hay un producto, buscá por categorías/etiquetas/descripcion además del nombre. Si el término aparece en tags/categorías/descripcion de algún producto, ofrecelos como opción en vez de decir que no hay.

Precios / promos:
- Si preguntan precio de un producto y está en el catálogo/contexto, respondé con el precio.
- Si el producto es ambiguo (ej: "jugo"), pedí 1 detalle (marca/sabor/tamaño) y sugerí 2-4 opciones del catálogo.
- Si el producto está en el catálogo y tiene precio, decí el precio directo (no respondas "puede variar").
- Si preguntan por promos, listá las promos activas del contexto. Si no hay, decilo claro (sin inventar).
- Nunca hables de agenda médica ni turnos.
- Nunca preguntes si agregar a pedido actual o crear uno nuevo. Si el cliente pide productos/cantidades, devolvé retail_upsert_order con SOLO los items de ESTE mensaje. El backend decide si edita o crea según si hay pending.
- Si el usuario pide QUITAR/SACAR/BORRAR un producto, usá op="remove" y NO pidas cantidades.
- Si el cliente pide algo genérico ("5 jugos", "agregá yogures") sin marca/sabor, NO inventes productos: devolvé ask_clarification con un reply pidiendo que elija y sugerí opciones del catálogo similar.
- Si hay un pedido pendiente en contexto, asumí que las cantidades pedidas van para ese pedido en curso (no crees uno nuevo en la respuesta, solo listá los items mencionados).

Mensajes raros / fuera de tema:
- Si te mandan algo que NO es un pedido ni una consulta del negocio, intentá inferir qué necesitan (ej: saludo, "se me cortó", "no me llegó", "cómo pago", etc.).
- Si no se puede inferir, no tires un genérico vacío: hacé 1 pregunta concreta para destrabar (ej: "¿Querés armar un pedido, consultar precios/promos o ver el estado de un pedido?").
- Si piden algo fuera de tu alcance (ej: temas médicos/legales), decí que no podés ayudar con eso y ofrecé volver al pedido/consultas del comercio.

Sobre comprobantes:
- Si llegó media (foto/pdf) y NO está claro a qué pedido corresponde:
  - Si hay 1 solo pedido pendiente, preguntá: "¿Es para el pedido #X?" y marcá needsOrderReference=false (porque ya hay candidato).
  - Si hay varios pedidos pendientes o ninguno, preguntá explícitamente: "¿A qué pedido corresponde? Decime el número (#...)" y marcá needsOrderReference=true.
  - Nunca digas ‘ya está subido/duplicado’ si el contexto no te lo confirma explícitamente.
IMPORTANTE:
- NO devuelvas nada que no sea JSON.
- NO metas comentarios, ni texto antes o después del JSON.
`;

export async function runRetailAgent(
  ctx: AgentContextBase,
  openai: OpenAI | null
): Promise<AgentExecutionResult | null> {
  if (!openai) return null;

  // ===============================
  // ✅ Fast-path: saludo / charla corta
  // Evita gastar tokens y evita que un 'hola' termine creando un pedido por error
  // ===============================
  const raw = (ctx.text || "").trim();
  const norm = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const greetingOnlyFast =
    /^(hola+|buenas|buenos dias|buenas tardes|buenas noches|hey+|holi+)\b/i.test(norm) &&
    norm.split(" ").filter(Boolean).length <= 3;
  const hasDigits = /\b\d+\b/.test(norm);

  if (greetingOnlyFast && !hasDigits) {
    const reply = "¡Hola! 👋 Decime qué querés pedir o consultar.\nEj: '2 cocas y 1 galletitas'.";
    return {
      replyToPatient: reply,
      action: { type: "general", reply },
      profileUpdates: null,
    };
  }

  try {
    const productCatalog = (ctx as any).productCatalog;
    const activePromotions = (ctx as any).activePromotions || (ctx as any).promotions;
    const storeProfile = (ctx as any).storeProfile || (ctx as any).businessProfile || {};
    const businessAlias =
      (storeProfile as any).businessAlias ||
      (ctx as any).businessAlias ||
      null;
    const incomingMedia = (ctx as any).incomingMedia || (ctx as any).media;
    const retailState = (ctx as any).retailConversationState || (ctx as any).conversationState;

    const catalogText = formatCatalogForPrompt(productCatalog);
    const promosText = formatPromosForPrompt(activePromotions);
    const storeText = businessAlias
      ? `Alias/CBU para transferencias: ${businessAlias}`
      : formatStoreProfileForPrompt(storeProfile);
    const mediaText = formatMediaForPrompt(incomingMedia);

    const userPrompt = buildAgentPrompt(ctx, catalogText, promosText, storeText, mediaText, retailState);

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_COMMERCE_MODEL || DEFAULT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.15,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    if (!raw) return null;

    const payload = safeJsonParse(raw);
    if (!payload) {
      console.error("[RetailAgent] JSON parse error, raw content:", raw);
      return null;
    }

    const reply: string =
      typeof payload.reply === "string" ? payload.reply.trim() : "";
    if (!reply) return null;

    const action = sanitizeAction(payload.action);

    const clientInfo = (action as any).clientInfo;
    const profileUpdates =
      clientInfo && typeof clientInfo === "object"
        ? {
            name: clientInfo.fullName ?? null,
            dni: clientInfo.dni ?? null,
            address: clientInfo.address ?? null,
          }
        : null;

    return {
      replyToPatient: reply,
      action,
      profileUpdates,
    };
  } catch (error) {
    console.error("[RetailAgent] Error:", error);
    return null;
  }
}

function buildAgentPrompt(
  ctx: AgentContextBase,
  catalogText: string,
  promosText: string,
  storeText: string,
  mediaText: string,
  retailState?: any
): string {
  const pending = (ctx as any).pendingOrders?.[0];
  const pendingSingleText = pending
    ? `Pedido pendiente #${pending.sequenceNumber}: ${pending.items
        .map((i: any) => `${i.quantity}x ${i.name}`)
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

  const clientInfoParts: string[] = [];
  if (ctx.patientName) clientInfoParts.push(`Nombre: ${ctx.patientName}`);
  if (ctx.patientProfile?.dni) clientInfoParts.push(`DNI: ${ctx.patientProfile.dni}`);
  if (ctx.patientProfile?.address)
    clientInfoParts.push(`Dirección: ${ctx.patientProfile.address}`);

  return `
Promos activas:
${promosText}

Info del negocio (si existe):
${storeText}

Media entrante (si existe):
${mediaText}

Pedidos pendientes actuales:
${pendingText || "No hay pedidos pendientes."}

Pedido pendiente principal:
${pendingSingleText}

Catálogo del comercio (con precios si existen):
${catalogText}

Datos del cliente (si existen): ${
    clientInfoParts.join(" | ") || "sin datos aún"
  }.

Mensaje actual del cliente (crudo, sin normalizar):
"${ctx.text}"

Historial reciente:
${recent || "Sin historial previo."}

Estado conversacional retail (si existe):
${retailState ? JSON.stringify(retailState).slice(0, 800) : "(sin estado)"}

Recordá:
- Si preguntan cómo pagar/transferir, devolvé el alias/cbu del negocio.
- En action.items poné SOLO lo que el cliente mencionó en ESTE mensaje. No repitas items anteriores.
- Devolvé solo JSON con "reply" y "action".
`;
}

function safeJsonParse(raw: string): any | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function sanitizeAction(action: any): any {
  const a = action && typeof action === "object" ? action : {};
  const type = typeof a.type === "string" ? a.type : "general";
  const cleaned: any = { ...a, type };

  if (!Array.isArray(cleaned.items)) cleaned.items = [];
  cleaned.items = cleaned.items
    .filter((it: any) => it && typeof it === "object" && typeof it.name === "string")
    .slice(0, 25)
    .map((it: any) => {
      const op = typeof it.op === "string" ? it.op : undefined;
      const q = Number.isFinite(it.quantity) ? Number(it.quantity) : undefined;
      return {
        name: String(it.name).trim(),
        normalizedName:
          typeof it.normalizedName === "string" && it.normalizedName.trim()
            ? it.normalizedName.trim()
            : undefined,
        quantity: q,
        note: typeof it.note === "string" ? it.note.trim() : undefined,
        op: op === "add" || op === "remove" || op === "set" ? op : undefined,
      };
    });

  if (typeof cleaned.mode !== "string") cleaned.mode = "merge";
  if (cleaned.mode !== "merge" && cleaned.mode !== "replace") cleaned.mode = "merge";

  if (typeof cleaned.status !== "string") cleaned.status = "pending";
  if (!["pending", "confirmed", "cancelled"].includes(cleaned.status)) cleaned.status = "pending";

  if (cleaned.orderSequenceNumber != null) {
    const n = Number(cleaned.orderSequenceNumber);
    cleaned.orderSequenceNumber = Number.isFinite(n) ? n : null;
  }

  if (cleaned.paymentProof && typeof cleaned.paymentProof === "object") {
    const pp = cleaned.paymentProof;
    cleaned.paymentProof = {
      hasMedia: Boolean(pp.hasMedia),
      mediaUrls: Array.isArray(pp.mediaUrls) ? pp.mediaUrls.slice(0, 3) : undefined,
      amount: Number.isFinite(pp.amount) ? Number(pp.amount) : pp.amount ?? null,
      method: typeof pp.method === "string" ? pp.method : null,
    };
  }

  if (typeof cleaned.needsOrderReference !== "boolean") {
    cleaned.needsOrderReference = false;
  }

  if (typeof cleaned.intent !== "string") cleaned.intent = "";
  if (!Number.isFinite(cleaned.confidence)) cleaned.confidence = 0.65;
  cleaned.confidence = Math.max(0, Math.min(1, Number(cleaned.confidence)));

  return cleaned;
}

function formatCatalogForPrompt(catalog: any): string {
  if (!catalog) return "(sin catálogo cargado)";

  if (Array.isArray(catalog) && catalog.every((x) => typeof x === "string")) {
    return (catalog as string[]).slice(0, 80).join(" · ");
  }

  if (Array.isArray(catalog) && catalog.length > 0 && typeof catalog[0] === "object") {
    const truncate = (txt: string, max = 120) =>
      txt.length > max ? `${txt.slice(0, max - 1).trimEnd()}…` : txt;

    const categorySet = new Set<string>();
    const tagSet = new Set<string>();

    const items = catalog.slice(0, 80).map((p: any) => {
      const name = p.name || p.title || p.productName;
      const price = p.price ?? p.unitPrice ?? null;
      const unit = p.unit || p.uom || "";
      const priceText = Number.isFinite(price)
        ? `$${Number(price).toLocaleString("es-AR")}`
        : "(precio s/dato)";
      const categories =
        Array.isArray(p.categories) && p.categories.length
          ? p.categories
          : p.category
          ? [p.category]
          : [];
      const tags =
        Array.isArray(p.tags) && p.tags.length
          ? p.tags
          : Array.isArray(p.tagLabels) && p.tagLabels.length
          ? p.tagLabels
          : [];
      const desc = p.description ? truncate(String(p.description)) : "";

      categories.forEach((c: any) => {
        if (typeof c === "string" && c.trim()) categorySet.add(c.trim());
      });
      tags.forEach((t: any) => {
        if (typeof t === "string" && t.trim()) tagSet.add(t.trim());
      });

      const extras: string[] = [];
      if (categories.length) extras.push(`cat: ${categories.join("/")}`);
      if (tags.length) extras.push(`tags: ${tags.join("/")}`);
      if (desc) extras.push(`desc: ${desc}`);
      const keywords: string[] = [];
      keywords.push(name);
      if (categories.length) keywords.push(...categories);
      if (tags.length) keywords.push(...tags);
      if (desc) keywords.push(desc);

      const extrasText = extras.length ? ` · ${extras.join(" · ")}` : "";

      return `- ${String(name)}${unit ? ` (${unit})` : ""}: ${priceText}${extrasText}` + (keywords.length ? ` | keywords: ${keywords.join(" / ")}` : "");
    });

    const catLine =
      categorySet.size > 0
        ? `Categorías: ${Array.from(categorySet).slice(0, 30).join(" · ")}`
        : "Categorías: (no declaradas)";
    const tagLine =
      tagSet.size > 0 ? `Etiquetas: ${Array.from(tagSet).slice(0, 40).join(" · ")}` : "Etiquetas: (no declaradas)";

    return `${catLine}\n${tagLine}\nProductos:\n${items.join("\n")}`;
  }

  return "(catálogo en formato desconocido)";
}

function formatPromosForPrompt(promos: any): string {
  if (!promos) return "(sin promos cargadas)";
  if (Array.isArray(promos) && promos.length === 0) return "(sin promos activas)";

  if (Array.isArray(promos)) {
    return promos
      .slice(0, 20)
      .map((p: any) => {
        if (typeof p === "string") return `- ${p}`;
        const title = p.title || p.name || "Promo";
        const desc = p.description || p.details || "";
        const until = p.validUntil || p.until || p.endsAt || "";
        return `- ${title}${desc ? `: ${desc}` : ""}${until ? ` (hasta ${until})` : ""}`;
      })
      .join("\n");
  }

  return "(promos en formato desconocido)";
}

function formatStoreProfileForPrompt(profile: any): string {
  if (!profile) return "(sin info del negocio)";
  if (typeof profile === "string") return profile;
  if (typeof profile !== "object") return "(info del negocio en formato desconocido)";

  const lines: string[] = [];
  if (profile.name) lines.push(`- Nombre: ${profile.name}`);
  if (profile.address) lines.push(`- Dirección: ${profile.address}`);
  if (profile.hours) lines.push(`- Horarios: ${profile.hours}`);
  if (profile.delivery) lines.push(`- Envíos: ${profile.delivery}`);
  if (profile.paymentMethods) {
    lines.push(
      `- Pagos: ${
        Array.isArray(profile.paymentMethods)
          ? profile.paymentMethods.join(", ")
          : profile.paymentMethods
      }`
    );
  }
  if (profile.notes) lines.push(`- Notas: ${profile.notes}`);

  return lines.length ? lines.join("\n") : JSON.stringify(profile).slice(0, 800);
}

function formatMediaForPrompt(media: any): string {
  if (!media) return "(sin media)";

  if (typeof media === "object") {
    const urls = Array.isArray(media.urls) ? media.urls.slice(0, 3) : undefined;
    const contentTypes = Array.isArray(media.contentTypes) ? media.contentTypes.slice(0, 3) : undefined;
    const count = Number.isFinite(media.count) ? Number(media.count) : urls?.length ?? 0;

    return `- count: ${count}
- urls: ${urls?.join(", ") || "(s/dato)"}
- contentTypes: ${contentTypes?.join(", ") || "(s/dato)"}`;
  }

  return "(media en formato desconocido)";
}