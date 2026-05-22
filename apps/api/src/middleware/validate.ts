import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

type RequestPart = "body" | "query" | "params";

export function validate(schema: ZodSchema, part: RequestPart = "body") {
  return (request: Request, _response: Response, next: NextFunction) => {
    request[part] = schema.parse(request[part]) as never;
    next();
  };
}

