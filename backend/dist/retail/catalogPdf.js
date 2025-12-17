"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCatalogPdf = createCatalogPdf;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const pdf_lib_1 = require("pdf-lib");
const CATALOG_UPLOADS_DIR = path_1.default.join(__dirname, "..", "..", "uploads", "catalogs");
const APP_PUBLIC_BASE = process.env.APP_BASE_URL || process.env.PUBLIC_URL || process.env.BASE_URL || "";
const DEFAULT_PORT = process.env.PORT || "4000";
const fsp = fs_1.default.promises;
const formatDate = (date) => new Intl.DateTimeFormat("es-AR", { dateStyle: "long" }).format(date);
const formatCurrency = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return `${new Intl.NumberFormat("es-AR", {
            style: "currency",
            currency: "ARS",
            maximumFractionDigits: 0,
        }).format(value)} / unidad`;
    }
    return "Consultar precio / unidad";
};
const buildPublicUrl = (value) => {
    if (!value)
        return null;
    if (/^https?:\/\//i.test(value))
        return value;
    const base = APP_PUBLIC_BASE.replace(/\/+$/, "") || `http://localhost:${DEFAULT_PORT}`;
    const isLocal = /localhost|127\.0\.0\.1/i.test(base);
    const normalizedBase = !isLocal && base.startsWith("http://") ? base.replace(/^http:\/\//i, "https://") : base;
    const pathPart = value.startsWith("/") ? value : `/${value}`;
    return `${normalizedBase}${pathPart}`;
};
const ensureCatalogDir = async () => {
    if (!fs_1.default.existsSync(CATALOG_UPLOADS_DIR)) {
        await fsp.mkdir(CATALOG_UPLOADS_DIR, { recursive: true });
    }
};
const wrapText = (text, font, size, maxWidth) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            current = candidate;
        }
        else {
            if (current)
                lines.push(current);
            current = word;
        }
    }
    if (current)
        lines.push(current);
    return lines.length ? lines : [""];
};
const embedImageFromUrl = async (doc, url) => {
    var _a;
    const publicUrl = buildPublicUrl(url || null);
    if (!publicUrl)
        return null;
    try {
        const response = await axios_1.default.get(publicUrl, {
            responseType: "arraybuffer",
        });
        const mime = ((_a = response.headers) === null || _a === void 0 ? void 0 : _a["content-type"]) || "";
        const bytes = new Uint8Array(response.data);
        if (mime.includes("png")) {
            return await doc.embedPng(bytes);
        }
        return await doc.embedJpg(bytes);
    }
    catch (error) {
        console.warn("[CatalogPDF] No se pudo cargar imagen:", (error === null || error === void 0 ? void 0 : error.message) || error);
        return null;
    }
};
const buildCatalogPdfBuffer = async (params) => {
    var _a;
    const generatedAt = (_a = params.generatedAt) !== null && _a !== void 0 ? _a : new Date();
    const doc = await pdf_lib_1.PDFDocument.create();
    const page = doc.addPage();
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const margin = 50;
    const usableWidth = pageWidth - margin * 2;
    const titleFont = await doc.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
    const bodyFont = await doc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const accent = (0, pdf_lib_1.rgb)(0.09, 0.57, 0.49);
    const softBg = (0, pdf_lib_1.rgb)(0.96, 0.98, 0.99);
    const border = (0, pdf_lib_1.rgb)(0.82, 0.88, 0.9);
    const textColor = (0, pdf_lib_1.rgb)(0.1, 0.1, 0.1);
    const muted = (0, pdf_lib_1.rgb)(0.25, 0.28, 0.3);
    let currentPage = page;
    let currentY = pageHeight - margin;
    const imageCache = new Map();
    const getImage = async (url) => {
        const publicUrl = buildPublicUrl(url || null);
        if (!publicUrl)
            return null;
        if (imageCache.has(publicUrl))
            return imageCache.get(publicUrl);
        const embedded = await embedImageFromUrl(doc, publicUrl);
        if (embedded) {
            imageCache.set(publicUrl, embedded);
        }
        return embedded;
    };
    const logoImage = await getImage(params.logoUrl || null);
    let logoHeight = 0;
    let logoWidth = 0;
    const drawHeader = () => {
        currentPage.drawRectangle({
            x: 0,
            y: pageHeight - 120,
            width: pageWidth,
            height: 120,
            color: softBg,
        });
        if (logoImage) {
            const maxLogoWidth = 130;
            const scale = Math.min(1, maxLogoWidth / logoImage.width);
            logoWidth = logoImage.width * scale;
            logoHeight = logoImage.height * scale;
            currentPage.drawImage(logoImage, {
                x: pageWidth - margin - logoWidth,
                y: pageHeight - 110,
                width: logoWidth,
                height: logoHeight,
            });
        }
        currentPage.drawText("Catálogo de productos", {
            x: margin,
            y: pageHeight - 60,
            size: 20,
            font: titleFont,
            color: (0, pdf_lib_1.rgb)(0.08, 0.1, 0.12),
        });
        currentPage.drawText(params.doctorName, {
            x: margin,
            y: pageHeight - 78,
            size: 12,
            font: bodyFont,
            color: (0, pdf_lib_1.rgb)(0.15, 0.2, 0.25),
        });
        currentPage.drawText(`Actualizado: ${formatDate(generatedAt)}`, {
            x: margin,
            y: pageHeight - 94,
            size: 11,
            font: bodyFont,
            color: (0, pdf_lib_1.rgb)(0.28, 0.32, 0.35),
        });
        currentPage.drawRectangle({
            x: margin,
            y: pageHeight - 112,
            width: pageWidth - margin * 2,
            height: 3,
            color: accent,
        });
        currentY = pageHeight - 130;
    };
    drawHeader();
    const addPage = () => {
        currentPage = doc.addPage();
        const { height } = currentPage.getSize();
        currentY = height - margin;
        drawHeader();
    };
    const ensureSpace = (needed) => {
        if (currentY - needed < margin) {
            addPage();
        }
    };
    const drawProduct = async (product) => {
        var _a;
        const embeddedImage = product.imageUrl ? await getImage(product.imageUrl) : null;
        const hasImage = Boolean(embeddedImage);
        const maxImgWidth = 80;
        const imgScale = embeddedImage && embeddedImage.width > 0 ? Math.min(1, maxImgWidth / embeddedImage.width) : 1;
        const imgWidth = hasImage ? embeddedImage.width * imgScale : 0;
        const imgHeight = hasImage ? embeddedImage.height * imgScale : 0;
        const textX = margin + (hasImage ? imgWidth + 12 : 0);
        const textWidth = usableWidth - (textX - margin) - 40; // deja espacio para el precio a la derecha
        const priceLabel = formatCurrency((_a = product.price) !== null && _a !== void 0 ? _a : null);
        const titleLines = wrapText(product.name, titleFont, 14, textWidth);
        const desc = (product.description || "").trim();
        const descLines = desc ? wrapText(desc, bodyFont, 11, textWidth) : [];
        const textContentHeight = titleLines.length * 15 +
            16 + // espacio del precio
            (descLines.length ? descLines.length * 13 + 4 : 0);
        const contentHeight = Math.max(textContentHeight, imgHeight || 0);
        const cardPadding = 10;
        const cardHeight = contentHeight + cardPadding * 2;
        ensureSpace(cardHeight + 10);
        const cardTop = currentY;
        const cardBottom = cardTop - cardHeight;
        currentPage.drawRectangle({
            x: margin,
            y: cardBottom,
            width: usableWidth,
            height: cardHeight,
            color: softBg,
            borderColor: border,
            borderWidth: 1,
            opacity: 0.98,
        });
        const baseY = cardTop - cardPadding;
        if (hasImage) {
            const imgY = baseY - imgHeight + 2;
            currentPage.drawImage(embeddedImage, {
                x: margin + cardPadding - 2,
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
                size: 14,
                font: titleFont,
                color: textColor,
            });
            textY -= 14;
        });
        // Price to the right
        const priceWidth = Math.max(60, bodyFont.widthOfTextAtSize(priceLabel, 11) + 10);
        const priceX = margin + usableWidth - priceWidth - 12;
        const priceY = baseY - 2;
        currentPage.drawRectangle({
            x: priceX,
            y: priceY - 14,
            width: priceWidth + 6,
            height: 18,
            color: (0, pdf_lib_1.rgb)(1, 1, 1),
            borderColor: accent,
            borderWidth: 1,
            opacity: 0.95,
        });
        currentPage.drawText(priceLabel, {
            x: priceX + 4,
            y: priceY - 2,
            size: 11,
            font: titleFont,
            color: accent,
        });
        textY = priceY - 18;
        descLines.forEach((line) => {
            currentPage.drawText(line, {
                x: textX,
                y: textY,
                size: 11,
                font: bodyFont,
                color: muted,
            });
            textY -= 13;
        });
        currentY = cardBottom - 8;
    };
    for (const product of params.products) {
        // eslint-disable-next-line no-await-in-loop
        await drawProduct(product);
    }
    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
};
async function createCatalogPdf(params) {
    if (!params.products || params.products.length === 0) {
        throw new Error("No hay productos en el catálogo.");
    }
    await ensureCatalogDir();
    const buffer = await buildCatalogPdfBuffer(params);
    const filename = `catalog-${params.doctorId}-${Date.now()}.pdf`;
    const destination = path_1.default.join(CATALOG_UPLOADS_DIR, filename);
    await fsp.writeFile(destination, buffer);
    const relativeUrl = `/uploads/catalogs/${filename}`;
    return {
        buffer,
        relativeUrl,
        publicUrl: buildPublicUrl(relativeUrl),
    };
}
