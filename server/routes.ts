import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents, extractDocumentsSchema } from "@shared/schema";
import { config } from "./config";
import { interviews } from "./db";
import { registerAuthRoutes, requireAuth, userFromCookieHeader } from "./auth";
import { rateLimit } from "./rateLimit";
import { createAiProvider } from "./services/ai/AiProvider";
import { InterviewOrchestrator, type SocketData } from "./services/InterviewOrchestrator";
import { dashboardFor } from "./services/stats";

export async function registerRoutes(app: Express): Promise<Server> {
  const allowedOrigins = config.CLIENT_ORIGIN?.split(",");

  if (allowedOrigins) {
    app.use("/api", (req, res, next) => {
      const origin = req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      }
      req.method === "OPTIONS" ? res.sendStatus(204) : next();
    });
  }

  app.get("/api/health", (_req, res) => res.json({ status: "ok", ai: config.AI_PROVIDER }));
  registerAuthRoutes(app);

  app.get("/api/stats", requireAuth, (req, res) => res.json(dashboardFor(req.user!.id)));
  app.get("/api/interviews", requireAuth, (req, res) => res.json(interviews.list(req.user!.id)));

  app.get("/api/interviews/:id", requireAuth, (req, res) => {
    const detail = interviews.get(req.user!.id, req.params.id);
    detail ? res.json(detail) : res.status(404).json({ message: "Interview not found" });
  });

  app.delete("/api/interviews/:id", requireAuth, (req, res) => {
    interviews.remove(req.user!.id, req.params.id) ? res.status(204).end() : res.status(404).json({ message: "Interview not found" });
  });

  app.post("/api/extract", requireAuth, rateLimit(30, 60 * 60 * 1000), async (req, res) => {
    const body = extractDocumentsSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "jdText and resumeText must be text under 20,000 characters" });

    const insights = await (await createAiProvider()).extractDocuments(body.data.jdText, body.data.resumeText);
    insights ? res.json(insights) : res.status(502).json({ message: "Could not analyze the documents" });
  });

  const httpServer = createServer(app);
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: allowedOrigins ? { origin: allowedOrigins, credentials: true } : undefined,
  });

  // Only signed-in users can open an interview socket. The session cookie travels with the handshake.
  io.use((socket, next) => {
    const user = userFromCookieHeader(socket.handshake.headers.cookie);
    if (!user) return next(new Error("unauthorized"));
    socket.data.user = user;
    next();
  });

  const orchestrator = new InterviewOrchestrator(io);
  io.on("connection", (socket) => orchestrator.handleConnection(socket));

  return httpServer;
}
