import path from "node:path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { authRoutes } from "./routes/authRoutes.js";
import { projectRoutes } from "./routes/projectRoutes.js";
import { testCaseRoutes } from "./routes/testCaseRoutes.js";
import { suiteRoutes } from "./routes/suiteRoutes.js";
import { runRoutes } from "./routes/runRoutes.js";
import { dashboardRoutes } from "./routes/dashboardRoutes.js";
import { ciRoutes } from "./routes/ciRoutes.js";
import { localRunRoutes } from "./routes/localRunRoutes.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();

const localDevOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1):517\d$/;
const allowedOrigins = new Set(env.WEB_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean));

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || (env.NODE_ENV !== "production" && localDevOriginPattern.test(origin))) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));
app.use("/artifacts", express.static(path.resolve(env.ARTIFACT_DIR)));

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "prudent-api",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/ci", ciRoutes);
app.use("/api/local-runs", localRunRoutes);
app.use("/api/projects", requireAuth, projectRoutes);
app.use("/api/test-cases", requireAuth, testCaseRoutes);
app.use("/api/test-suites", requireAuth, suiteRoutes);
app.use("/api/runs", requireAuth, runRoutes);
app.use("/api/dashboard", requireAuth, dashboardRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`Prudent API listening on http://localhost:${env.PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

export { app };
