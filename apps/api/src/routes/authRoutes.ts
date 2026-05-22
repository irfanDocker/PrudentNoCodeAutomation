import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prudent/shared";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { signToken, requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post(
  "/login",
  asyncHandler(async (request, response) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new ApiError(401, "Invalid email or password");
    }

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role as Role
    });

    response.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user?.id },
      select: { id: true, email: true, name: true, role: true }
    });

    response.json({ data: user });
  })
);

export { router as authRoutes };

