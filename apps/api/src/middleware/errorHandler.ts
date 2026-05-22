import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function notFoundHandler(request: Request, _response: Response, next: NextFunction) {
  next(new ApiError(404, `Route not found: ${request.method} ${request.path}`));
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return response.status(400).json({
      error: {
        message: "Validation failed",
        details: error.flatten()
      }
    });
  }

  if (error instanceof ApiError) {
    return response.status(error.statusCode).json({
      error: {
        message: error.message,
        details: error.details
      }
    });
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return response.status(500).json({
    error: {
      message
    }
  });
}

