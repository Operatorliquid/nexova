export function normalizeInsuranceAnswer(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const negativePatterns = [
    "no tengo",
    "sin obra",
    "sin prepaga",
    "no cuento",
    "particular",
    "no uso",
  ];
  if (negativePatterns.some((phrase) => lower.includes(phrase))) {
    return "Sin obra social";
  }

  let cleaned = trimmed
    .replace(/[:.,]/g, " ")
    .replace(
      /\b(mi|la|el|es|tengo|tenemos|con|obra social|prepaga|prepago|se llama|llamada|llamado|llama|es de|del|de|si|sí|aceptan|acepta|toma|toman|trabajan|trabaja|atienden|atiende)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    cleaned = trimmed;
  }

  if (cleaned.length <= 2) {
    cleaned = cleaned.toUpperCase();
  }

  return sentenceCase(cleaned);
}

export function formatConsultReasonAnswer(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalizedSpace = trimmed.replace(/\s+/g, " ");
  const patterns: Array<{
    regex: RegExp;
    handler: (match: RegExpExecArray) => string;
  }> = [
    {
      regex: /^me\s+duele\s+(.+)$/i,
      handler: (match) => buildPainPhrase(match[1]),
    },
    {
      regex: /^me\s+est[aá]\s+doliendo\s+(.+)$/i,
      handler: (match) => buildPainPhrase(match[1]),
    },
    {
      regex: /^tengo\s+dolor(?:\s+en|\s+de)?\s+(.+)$/i,
      handler: (match) => buildPainPhrase(match[1]),
    },
    {
      regex: /^dolor\s+(?:en|de)?\s*(.+)$/i,
      handler: (match) => buildPainPhrase(match[1]),
    },
    {
      regex: /^me\s+siento\s+mal/i,
      handler: () => "Malestar general",
    },
    {
      regex: /^control\s+(.+)$/i,
      handler: (match) => `Control ${cleanupTail(match[1])}`,
    },
    {
      regex: /^consulta\s+por\s+(.+)$/i,
      handler: (match) => `Consulta por ${cleanupTail(match[1])}`,
    },
    {
      regex: /^turno\s+para\s+(.+)$/i,
      handler: (match) => `Turno para ${cleanupTail(match[1])}`,
    },
  ];

  for (const pattern of patterns) {
    const exec = pattern.regex.exec(normalizedSpace);
    if (exec) {
      const formatted = pattern.handler(exec).replace(/\s+/g, " ").trim();
      if (formatted) {
        return sentenceCase(formatted);
      }
    }
  }

  return sentenceCase(cleanupTail(normalizedSpace));
}

function buildPainPhrase(rawZone: string | undefined) {
  const zone = normalizeBodyZone(rawZone);
  if (!zone) {
    return "Dolor";
  }
  return `Dolor de ${zone}`;
}

function normalizeBodyZone(rawZone: string | undefined) {
  if (!rawZone) return "";
  return cleanupTail(rawZone)
    .replace(/^(el|la|los|las|un|una|unos|unas)\s+/i, "")
    .trim();
}

function cleanupTail(value: string | undefined) {
  if (!value) return "";
  return value.replace(/[.,;:]+$/g, "").trim();
}

function sentenceCase(value: string) {
  if (!value) return value;
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Normaliza DNI: devuelve solo dígitos si tiene longitud esperable, sino null
export function normalizeDniInput(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 10) {
    return null;
  }
  return digits;
}
