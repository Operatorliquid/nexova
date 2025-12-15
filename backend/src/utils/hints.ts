import { BusinessType } from "@prisma/client";

export function appendMenuHint(message: string) {
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

export function appendMenuHintForBusiness(message: string, businessType: BusinessType) {
  if (businessType === "RETAIL") return message;
  return appendMenuHint(message);
}
