"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendMenuHint = appendMenuHint;
exports.appendMenuHintForBusiness = appendMenuHintForBusiness;
function appendMenuHint(message) {
    const hint = 'Escribí "menu" para ver las opciones (sacar, reprogramar o cancelar turno).';
    if (!message || !message.trim()) {
        return hint;
    }
    const normalized = message.toLowerCase();
    if (normalized.includes("menu") || normalized.includes("menú")) {
        return message;
    }
    return `${message.trim()}\n\n${hint}`;
}
function appendMenuHintForBusiness(message, businessType) {
    if (businessType === "RETAIL")
        return message;
    return appendMenuHint(message);
}
