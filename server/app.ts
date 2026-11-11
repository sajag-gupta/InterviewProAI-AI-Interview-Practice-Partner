import { type Server } from "node:http";

import express, {
  type Express,
  type Request,
  Response,
  NextFunction,
} from "express";

import { registerRoutes } from "./routes";
import { config } from "./config";
import { closeDb } from "./db";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export const app = express();

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");

  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
  });
  next();
});

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
) {
  const server = await registerRoutes(app);

  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    console.error(err);
    res.status(status).json({ message: status >= 500 ? "Internal Server Error" : err.message });
  });

  // importantly run the final setup after setting up all the other routes so
  // the catch-all route doesn't interfere with the other routes
  await setup(app, server);

  const host = process.platform === "win32" ? "127.0.0.1" : "0.0.0.0";
  server.listen(config.PORT, host, () => log(`serving on port ${config.PORT}`));

  const shutdown = () => {
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
