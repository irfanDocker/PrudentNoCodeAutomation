import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prudent/shared";
import { env } from "../config/env.js";
import { ApiError } from "./errorHandler.js";

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "12h" });
}

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    throw new ApiError(401, "Authentication required");
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    request.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role
    };
    next();
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }
}

export function requireRole(...allowedRoles: Role[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      throw new ApiError(403, "You do not have permission to perform this action");
    }

    next();
  };
}

