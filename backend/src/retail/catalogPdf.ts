import fs from "fs";
import path from "path";
import axios from "axios";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export type CatalogPdfProduct = {
  name: string;
  price?: number | null;
  description?: string | null;
  imageUrl?: string | null;
};

type CatalogPdfParams = {
  doctorId: number;
  doctorName: string;
  products: CatalogPdfProduct[];
  generatedAt?: Date;
  logoUrl?: string | null;
};

const CATALOG_UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads", "catalogs");
const APP_PUBLIC_BASE =
  process.env.APP_BASE_URL || process.env.PUBLIC_URL || process.env.BASE_URL || "";
const DEFAULT_PORT = process.env.PORT || "4000";

const fsp = fs.promises;

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("es-AR", { dateStyle: "long" }).format(date);

const formatCurrency = (value?: number | null) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return "Consultar precio";
};

const buildPublicUrl = (value: string | null | undefined) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = APP_PUBLIC_BASE.replace(/\/+$/, "") || `http://localhost:${DEFAULT_PORT}`;
  const isLocal = /localhost|127\.0\.0\.1/i.test(base);
  const normalizedBase =
    !isLocal && base.startsWith("http://") ? base.replace(/^http:\/\//i, "https://") : base;
  const pathPart = value.startsWith("/") ? value : `/${value}`;
  return `${normalizedBase}${pathPart}`;
};

const ensureCatalogDir = async () => {
  if (!fs.existsSync(CATALOG_UPLOADS_DIR)) {
    await fsp.mkdir(CATALOG_UPLOADS_DIR, { recursive: true });
  }
};

const wrapText = (
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
};

const embedImageFromUrl = async (doc: PDFDocument, url?: string | null) => {
  const publicUrl = buildPublicUrl(url || null);
  if (!publicUrl) return null;

  try {
    const response = await axios.get<ArrayBuffer>(publicUrl, {
      responseType: "arraybuffer",
    });
    const mime = (response.headers?.["content-type"] as string | undefined) || "";
    const bytes = new Uint8Array(response.data as ArrayBuffer);
    if (mime.includes("png")) {
      return await doc.embedPng(bytes);
    }
    return await doc.embedJpg(bytes);
  } catch (error) {
    console.warn("[CatalogPDF] No se pudo cargar imagen:", (error as any)?.message || error);
    return null;
  }
};

const buildCatalogPdfBuffer = async (params: CatalogPdfParams) => {
  const generatedAt = params.generatedAt ?? new Date();
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const margin = 50;
  const usableWidth = pageWidth - margin * 2;
  const titleFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);

  let currentPage = page;
  let currentY = pageHeight - margin;

  const imageCache = new Map<string, any>();
  const getImage = async (url?: string | null) => {
    const publicUrl = buildPublicUrl(url || null);
    if (!publicUrl) return null;
    if (imageCache.has(publicUrl)) return imageCache.get(publicUrl);
    const embedded = await embedImageFromUrl(doc, publicUrl);
    if (embedded) {
      imageCache.set(publicUrl, embedded);
    }
    return embedded;
  };

  const logoImage = await getImage(params.logoUrl || null);
  let logoHeight = 0;
  let logoWidth = 0;

  if (logoImage) {
    const maxLogoWidth = 140;
    const scale = Math.min(1, maxLogoWidth / logoImage.width);
    logoWidth = logoImage.width * scale;
    logoHeight = logoImage.height * scale;
    currentPage.drawImage(logoImage, {
      x: pageWidth - margin - logoWidth,
      y: currentY - logoHeight + 8,
      width: logoWidth,
      height: logoHeight,
    });
  }

  currentPage.drawText("Catálogo de productos", {
    x: margin,
    y: currentY,
    size: 18,
    font: titleFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  currentY -= 22;

  currentPage.drawText(params.doctorName, {
    x: margin,
    y: currentY,
    size: 12,
    font: bodyFont,
  });
  currentY -= 14;

  currentPage.drawText(`Fecha: ${formatDate(generatedAt)}`, {
    x: margin,
    y: currentY,
    size: 11,
    font: bodyFont,
    color: rgb(0.25, 0.25, 0.25),
  });

  const headerBottom = Math.min(currentY - 18, currentY - logoHeight - 6);
  currentY = headerBottom;

  const addPage = () => {
    currentPage = doc.addPage();
    const { height } = currentPage.getSize();
    currentY = height - margin;
    currentPage.drawText("Catálogo de productos", {
      x: margin,
      y: currentY,
      size: 14,
      font: titleFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    currentY -= 16;
    currentPage.drawText(`Fecha: ${formatDate(generatedAt)}`, {
      x: margin,
      y: currentY,
      size: 11,
      font: bodyFont,
      color: rgb(0.25, 0.25, 0.25),
    });
    currentY -= 16;
  };

  const ensureSpace = (needed: number) => {
    if (currentY - needed < margin) {
      addPage();
    }
  };

  const drawProduct = async (product: CatalogPdfProduct) => {
    const embeddedImage = product.imageUrl ? await getImage(product.imageUrl) : null;
    const hasImage = Boolean(embeddedImage);
    const maxImgWidth = 90;
    const imgScale =
      embeddedImage && embeddedImage.width > 0 ? Math.min(1, maxImgWidth / embeddedImage.width) : 1;
    const imgWidth = hasImage ? embeddedImage!.width * imgScale : 0;
    const imgHeight = hasImage ? embeddedImage!.height * imgScale : 0;

    const textX = margin + (hasImage ? imgWidth + 12 : 0);
    const textWidth = usableWidth - (textX - margin);

    const priceLabel = formatCurrency(product.price ?? null);
    const titleLines = wrapText(`${product.name} — ${priceLabel}`, titleFont, 12, textWidth);
    const desc = (product.description || "").trim();
    const descLines = desc ? wrapText(desc, bodyFont, 11, textWidth) : [];

    const blockHeight =
      Math.max(titleLines.length * 14 + (descLines.length ? descLines.length * 13 + 4 : 0), imgHeight || 0) +
      6;
    ensureSpace(blockHeight);

    const baseY = currentY;

    if (hasImage) {
      const imgY = baseY - imgHeight + 2;
      currentPage.drawImage(embeddedImage!, {
        x: margin,
        y: imgY,
        width: imgWidth,
        height: imgHeight,
      });
    }

    let textY = baseY;
    titleLines.forEach((line) => {
      currentPage.drawText(line, {
        x: textX,
        y: textY,
        size: 12,
        font: titleFont,
        color: rgb(0.1, 0.1, 0.1),
      });
      textY -= 14;
    });

    descLines.forEach((line) => {
      currentPage.drawText(line, {
        x: textX,
        y: textY,
        size: 11,
        font: bodyFont,
        color: rgb(0.2, 0.2, 0.2),
      });
      textY -= 13;
    });

    currentY = baseY - blockHeight;
  };

  for (const product of params.products) {
    // eslint-disable-next-line no-await-in-loop
    await drawProduct(product);
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
};

export async function createCatalogPdf(params: CatalogPdfParams) {
  if (!params.products || params.products.length === 0) {
    throw new Error("No hay productos en el catálogo.");
  }

  await ensureCatalogDir();
  const buffer = await buildCatalogPdfBuffer(params);
  const filename = `catalog-${params.doctorId}-${Date.now()}.pdf`;
  const destination = path.join(CATALOG_UPLOADS_DIR, filename);
  await fsp.writeFile(destination, buffer);
  const relativeUrl = `/uploads/catalogs/${filename}`;

  return {
    buffer,
    relativeUrl,
    publicUrl: buildPublicUrl(relativeUrl),
  };
}
