// backend/src/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  doctorId?: number;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "No autorizado: falta encabezado Authorization",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET || "dev-secret";
    const payload = jwt.verify(token, secret) as { doctorId: number };

    req.doctorId = payload.doctorId;
    next();
  } catch (error) {
    console.error("Error verificando JWT:", error);
    return res.status(401).json({
      error: "No autorizado: token inválido o expirado",
    });
  }
}
