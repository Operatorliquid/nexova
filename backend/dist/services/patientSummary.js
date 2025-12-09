"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePatientSummary = generatePatientSummary;
exports.generateClinicalHistoryNarrative = generateClinicalHistoryNarrative;
const openai_1 = __importDefault(require("openai"));
const text_1 = require("../utils/text");
const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-4.1-mini";
const openaiClient = process.env.OPENAI_API_KEY
    ? new openai_1.default({ apiKey: process.env.OPENAI_API_KEY })
    : null;
async function generatePatientSummary(params) {
    const fallback = buildFallbackSummary(params);
    if (!openaiClient) {
        return fallback;
    }
    try {
        const prompt = buildSummaryPrompt(params);
        const response = await openaiClient.responses.create({
            model: SUMMARY_MODEL,
            input: [
                {
                    role: "system",
                    content: "Eres un asistente médico que redacta resúmenes concisos en español sobre pacientes recurrentes. Enfócate en síntomas frecuentes, evolución y próximos pasos sugeridos.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });
        const text = extractResponseText(response);
        if (!text) {
            return fallback;
        }
        return text.trim();
    }
    catch (error) {
        console.error("[generatePatientSummary] Error:", error);
        return fallback;
    }
}
async function generateClinicalHistoryNarrative(params) {
    const fallback = buildClinicalHistoryFallback(params);
    if (!openaiClient) {
        return fallback;
    }
    try {
        const prompt = buildClinicalHistoryPrompt(params);
        const response = await openaiClient.responses.create({
            model: SUMMARY_MODEL,
            input: [
                {
                    role: "system",
                    content: "Eres un asistente médico en español que redacta historias clínicas sintéticas basadas en la información provista. Identificá patrones, evolución, alertas y próximos pasos clínicos.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });
        const text = extractResponseText(response);
        if (!text) {
            return fallback;
        }
        return text.trim();
    }
    catch (error) {
        console.error("[generateClinicalHistoryNarrative] Error:", error);
        return fallback;
    }
}
function buildSummaryPrompt({ patient, consultations, notes, }) {
    const normalizedReason = (0, text_1.formatConsultReasonAnswer)(patient.consultReason) ||
        patient.consultReason ||
        "sin motivo registrado";
    const tagsText = patient.tags && patient.tags.length > 0
        ? patient.tags
            .map((tag) => `${tag.label} (${tag.severity || "info"})`)
            .join(", ")
        : "Sin etiquetas relevantes registradas.";
    const consultationsText = consultations.length > 0
        ? consultations
            .slice(0, 12)
            .map((c, index) => {
            var _a;
            const when = formatDateTimeHuman(c.dateTime);
            const motive = ((_a = c.type) === null || _a === void 0 ? void 0 : _a.trim()) || "Motivo no detallado";
            return `${index + 1}. ${when} - Motivo: ${motive}. Estado: ${c.status || "sin estado"}.`;
        })
            .join("\n")
        : "No hay consultas registradas.";
    const notesText = notes.length > 0
        ? notes
            .slice(0, 10)
            .map((note, index) => {
            const when = formatDateTimeHuman(note.createdAt);
            return `${index + 1}. ${when}: ${note.content}`;
        })
            .join("\n")
        : "Sin notas adicionales registradas.";
    return `
Paciente: ${patient.fullName || "Nombre no disponible"}
Motivo principal registrado: ${normalizedReason}
Etiquetas cargadas por el equipo: ${tagsText}

Historial de consultas:
${consultationsText}

Notas internas del doctor:
${notesText}

Redactá un resumen de 3 a 5 frases, en español, que describa:
- Síntomas o motivos más habituales.
- Cómo evolucionaron las consultas o si hay adherencia a los turnos.
- Riesgos o aspectos a vigilar mencionados por el paciente o el doctor.
- Próximos pasos sugeridos si aplica.
No repitas datos de contacto ni campos administrativos.
`;
}
function buildFallbackSummary({ patient, consultations, notes, }) {
    const parts = [];
    parts.push(`Motivo habitual: ${(0, text_1.formatConsultReasonAnswer)(patient.consultReason) ||
        patient.consultReason ||
        "sin motivo registrado"}.`);
    if (patient.tags && patient.tags.length > 0) {
        const tagList = patient.tags
            .slice(0, 5)
            .map((tag) => tag.label)
            .join(", ");
        parts.push(`Etiquetas registradas: ${tagList}.`);
    }
    if (consultations.length === 0) {
        parts.push("Todavía no registramos consultas para esta persona.");
    }
    else {
        const recent = consultations[0];
        parts.push(`Última consulta: ${formatDateTimeHuman(recent.dateTime)} (${recent.type || "sin detalle"}).`);
    }
    if (notes.length > 0) {
        const latestNote = notes[0];
        parts.push(`Nota reciente (${formatDateTimeHuman(latestNote.createdAt)}): ${latestNote.content}.`);
    }
    parts.push("Cuando el paciente comparta más información, vamos a enriquecer automáticamente este resumen con patrones y recomendaciones.");
    return parts.join(" ");
}
function buildClinicalHistoryPrompt({ patient, consultations, notes, documents, doctorName, }) {
    const normalizedReason = (0, text_1.formatConsultReasonAnswer)(patient.consultReason) ||
        patient.consultReason ||
        "sin motivo registrado";
    const generalInfo = [
        `Nombre: ${patient.fullName || "No disponible"}`,
        `DNI: ${patient.dni || "Sin DNI"}`,
        `Profesional responsable: ${doctorName || "No informado"}`,
        `Teléfono: ${patient.phone || "No registrado"}`,
        `Fecha de nacimiento: ${patient.birthDate ? formatDateTimeHuman(patient.birthDate) : "No registrada"}`,
        `Dirección: ${patient.address || "No registrada"}`,
        `Cobertura: ${patient.insuranceProvider || "Pendiente"}`,
        `Ocupación: ${patient.occupation || "Pendiente"}`,
        `Estado civil: ${patient.maritalStatus || "Pendiente"}`,
        `Motivo principal declarado: ${normalizedReason}`,
    ].join("\n");
    const tagsText = patient.tags && patient.tags.length > 0
        ? patient.tags
            .map((tag) => `${tag.label} (${tag.severity || "info"})`)
            .join(", ")
        : "Sin etiquetas relevantes registradas.";
    const consultationsText = consultations.length > 0
        ? consultations
            .map((c) => {
            var _a;
            const when = formatDateTimeHuman(c.dateTime);
            const motive = ((_a = c.type) === null || _a === void 0 ? void 0 : _a.trim()) || "Motivo no detallado";
            const payment = c.paymentMethod
                ? c.paymentMethod === "cash"
                    ? "Pago en efectivo"
                    : "Transferencia / débito / crédito"
                : "Pago sin registrar";
            const amount = typeof c.chargedAmount === "number"
                ? `$ ${c.chargedAmount.toLocaleString("es-AR")}`
                : "—";
            return `- ${when} | Motivo: ${motive}. Estado: ${c.status || "sin estado"}. Pago: ${payment}. Monto: ${amount}.`;
        })
            .join("\n")
        : "Todavía no registramos consultas para esta persona.";
    const notesText = notes.length > 0
        ? notes
            .map((note) => `- ${formatDateTimeHuman(note.createdAt)}: ${note.content.substring(0, 400)}`)
            .join("\n")
        : "Sin notas internas cargadas.";
    const documentsText = documents.length > 0
        ? documents
            .map((doc) => {
            var _a;
            const when = formatDateTimeHuman(doc.createdAt);
            const label = ((_a = doc.caption) === null || _a === void 0 ? void 0 : _a.trim()) || "Documento sin descripción";
            return `- ${when}: ${label} (${doc.mediaContentType || "tipo desconocido"})`;
        })
            .join("\n")
        : "Sin estudios o documentos adjuntados.";
    return `Datos del paciente:\n${generalInfo}\n\nEtiquetas registradas:\n${tagsText}\n\nConsultas ordenadas de la más reciente a la más antigua:\n${consultationsText}\n\nNotas internas del equipo:\n${notesText}\n\nDocumentos o estudios adjuntos:\n${documentsText}\n\nInstrucciones:\nRedactá en español una historia clínica narrativa y profesional (4 a 7 párrafos) que incluya: antecedentes relevantes, evolución y frecuencia de consultas, señales de alarma o etiquetas críticas, aprendizajes de las notas del equipo y sugerencias de seguimiento. No repitas datos administrativos; enfocáte en lo clínico y en la interpretación del caso.`;
}
function buildClinicalHistoryFallback({ patient, consultations, notes, documents, doctorName, }) {
    const lines = [];
    lines.push(`Historia clínica de ${patient.fullName || "Paciente sin nombre"} (DNI ${patient.dni || "sin DNI"}).`);
    lines.push(`Profesional responsable: ${doctorName || "No informado"}.`);
    lines.push(`Motivo habitual declarado: ${(0, text_1.formatConsultReasonAnswer)(patient.consultReason) ||
        patient.consultReason ||
        "sin motivo registrado"}.`);
    lines.push(`Cobertura/obra social: ${patient.insuranceProvider || "pendiente"}. Dirección: ${patient.address || "sin datos"}. Teléfono: ${patient.phone || "no informado"}.`);
    if (patient.tags && patient.tags.length > 0) {
        const critical = patient.tags.map((tag) => tag.label).join(", ");
        lines.push(`Datos importantes registrados: ${critical}.`);
    }
    else {
        lines.push("No hay datos importantes cargados por el equipo.");
    }
    if (consultations.length === 0) {
        lines.push("No se registran consultas previas en el sistema.");
    }
    else {
        const mostRecent = consultations[0];
        lines.push(`Última consulta: ${formatDateTimeHuman(mostRecent.dateTime)} (${mostRecent.type ||
            "sin detalle"}). Estado: ${mostRecent.status || "sin estado"}.`);
        if (consultations.length > 1) {
            lines.push(`Se registran ${consultations.length} consultas totales, con signos de ${consultations.length > 6 ? "seguimiento periódico" : "contacto esporádico"}.`);
        }
    }
    if (notes.length > 0) {
        const latestNote = notes[0];
        lines.push(`Nota más reciente (${formatDateTimeHuman(latestNote.createdAt)}): ${latestNote.content}`);
    }
    else {
        lines.push("Sin notas internas para este paciente.");
    }
    if (documents.length > 0) {
        lines.push(`Se adjuntaron ${documents.length} documentos o estudios. Revisar los más recientes para contexto clínico.`);
    }
    lines.push("Este resumen fue generado automáticamente como respaldo cuando la IA no está disponible. Revisá la ficha completa para más detalle.");
    return lines.join(" ");
}
function extractResponseText(response) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const outputText = response === null || response === void 0 ? void 0 : response.output_text;
        if (Array.isArray(outputText) && outputText.length) {
            const joined = outputText.join(" ").trim();
            if (joined) {
                return joined;
            }
        }
        const outputs = response === null || response === void 0 ? void 0 : response.output;
        if (Array.isArray(outputs)) {
            for (const block of outputs) {
                const contentEntries = block === null || block === void 0 ? void 0 : block.content;
                if (!Array.isArray(contentEntries))
                    continue;
                for (const entry of contentEntries) {
                    if ((entry === null || entry === void 0 ? void 0 : entry.type) === "output_text") {
                        const value = (_b = (_a = entry.text) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : entry.text;
                        if (typeof value === "string" && value.trim()) {
                            return value;
                        }
                    }
                    if (typeof (entry === null || entry === void 0 ? void 0 : entry.text) === "string" && entry.text.trim()) {
                        return entry.text;
                    }
                }
            }
        }
        const choices = response === null || response === void 0 ? void 0 : response.choices;
        if (Array.isArray(choices) && choices.length) {
            const choiceText = (_g = (_e = (_d = (_c = choices[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) !== null && _e !== void 0 ? _e : (_f = choices[0]) === null || _f === void 0 ? void 0 : _f.text) !== null && _g !== void 0 ? _g : (_j = (_h = choices[0]) === null || _h === void 0 ? void 0 : _h.message) === null || _j === void 0 ? void 0 : _j.text;
            if (typeof choiceText === "string" && choiceText.trim()) {
                return choiceText;
            }
            if (Array.isArray(choiceText)) {
                const joined = choiceText
                    .map((chunk) => typeof chunk === "string"
                    ? chunk
                    : typeof (chunk === null || chunk === void 0 ? void 0 : chunk.text) === "string"
                        ? chunk.text
                        : "")
                    .join("")
                    .trim();
                if (joined) {
                    return joined;
                }
            }
        }
        const content = response === null || response === void 0 ? void 0 : response.content;
        if (typeof content === "string" && content.trim()) {
            return content;
        }
        return null;
    }
    catch (err) {
        console.error("[generatePatientSummary] extractText error:", err);
        return null;
    }
}
function formatDateTimeHuman(date) {
    return date.toLocaleString("es-AR", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}
