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
        return new Intl.NumberFormat("es-AR", {
            style: "currency",
            currency: "ARS",
            maximumFractionDigits: 0,
        }).format(value);
    }
    return "Consultar precio";
};
const buildPublicUrl = (value) => {
    if (!value)
        return null;
    if (/^https?:\/\//i.test(value))
        return value;
    const base = APP_PUBLIC_BASE.replace(/\/+$/, "") || `http://localhost:${DEFAULT_PORT}`;
    const pathPart = value.startsWith("/") ? value : `/${value}`;
    return `${base}${pathPart}`;
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
const embedLogo = async (doc, logoUrl) => {
    var _a;
    const publicUrl = buildPublicUrl(logoUrl || null);
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
        console.warn("[CatalogPDF] No se pudo cargar el logo:", (error === null || error === void 0 ? void 0 : error.message) || error);
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
    let currentPage = page;
    let currentY = pageHeight - margin;
    const logoImage = await embedLogo(doc, params.logoUrl);
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
        color: (0, pdf_lib_1.rgb)(0.1, 0.1, 0.1),
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
        color: (0, pdf_lib_1.rgb)(0.25, 0.25, 0.25),
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
            color: (0, pdf_lib_1.rgb)(0.1, 0.1, 0.1),
        });
        currentY -= 16;
        currentPage.drawText(`Fecha: ${formatDate(generatedAt)}`, {
            x: margin,
            y: currentY,
            size: 11,
            font: bodyFont,
            color: (0, pdf_lib_1.rgb)(0.25, 0.25, 0.25),
        });
        currentY -= 16;
    };
    const ensureSpace = (needed) => {
        if (currentY - needed < margin) {
            addPage();
        }
    };
    const drawProduct = (product) => {
        var _a;
        const priceLabel = formatCurrency((_a = product.price) !== null && _a !== void 0 ? _a : null);
        const titleLines = wrapText(`${product.name} — ${priceLabel}`, titleFont, 12, usableWidth);
        const desc = (product.description || "").trim();
        const descLines = desc ? wrapText(desc, bodyFont, 11, usableWidth) : [];
        const blockHeight = titleLines.length * 14 + (descLines.length ? descLines.length * 13 + 4 : 0) + 6;
        ensureSpace(blockHeight);
        titleLines.forEach((line) => {
            currentPage.drawText(line, {
                x: margin,
                y: currentY,
                size: 12,
                font: titleFont,
                color: (0, pdf_lib_1.rgb)(0.1, 0.1, 0.1),
            });
            currentY -= 14;
        });
        descLines.forEach((line) => {
            currentPage.drawText(line, {
                x: margin,
                y: currentY,
                size: 11,
                font: bodyFont,
                color: (0, pdf_lib_1.rgb)(0.2, 0.2, 0.2),
            });
            currentY -= 13;
        });
        currentY -= 6;
    };
    params.products.forEach((product) => drawProduct(product));
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
