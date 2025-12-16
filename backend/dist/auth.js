"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "No autorizado: falta encabezado Authorization",
        });
    }
    const token = authHeader.split(" ")[1];
    try {
        const secret = process.env.JWT_SECRET || "dev-secret";
        const payload = jsonwebtoken_1.default.verify(token, secret);
        req.doctorId = payload.doctorId;
        next();
    }
    catch (error) {
        console.error("Error verificando JWT:", error);
        return res.status(401).json({
            error: "No autorizado: token inválido o expirado",
        });
    }
}
