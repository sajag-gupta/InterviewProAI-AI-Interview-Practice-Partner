import crypto from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";
import { loginSchema, signupSchema, type AuthUser } from "@shared/schema";
import { authSessions, users } from "./db";
import { isProd } from "./config";
import { rateLimit } from "./rateLimit";

const COOKIE = "ipai_session";
const SESSION_MS = 1000 * 60 * 60 * 24 * 14;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const hashPassword = (password: string, salt: string) => crypto.scryptSync(password, salt, 64).toString("hex");

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.[1];
}

/** Used by both Express middleware and the Socket.IO handshake. */
export function userFromCookieHeader(header: string | undefined): AuthUser | undefined {
  const token = readCookie(header, COOKIE);
  return token ? users.byToken(sha256(token)) : undefined;
}

function startSession(res: Response, userId: string): void {
  const token = crypto.randomBytes(32).toString("hex");
  authSessions.create(sha256(token), userId, Date.now() + SESSION_MS);
  const flags = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${SESSION_MS / 1000}`, isProd ? "Secure" : ""].filter(Boolean);
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; ${flags.join("; ")}`);
}

export const requireAuth: RequestHandler = (req, res, next) => {
  req.user = userFromCookieHeader(req.headers.cookie);
  if (!req.user) return res.status(401).json({ message: "Please sign in" });
  next();
};

export function registerAuthRoutes(app: Express): void {
  const limiter = rateLimit(20, 15 * 60 * 1000);

  app.post("/api/auth/signup", limiter, (req: Request, res: Response) => {
    const body = signupSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: body.error.issues[0].message });
    if (users.byEmail(body.data.email)) return res.status(409).json({ message: "An account with this email already exists" });

    const salt = crypto.randomBytes(16).toString("hex");
    const user = { id: crypto.randomUUID(), name: body.data.name, email: body.data.email, salt, passwordHash: hashPassword(body.data.password, salt) };
    users.create(user);
    startSession(res, user.id);
    res.status(201).json({ id: user.id, name: user.name, email: user.email });
  });

  app.post("/api/auth/login", limiter, (req: Request, res: Response) => {
    const body = loginSchema.safeParse(req.body);
    const user = body.success ? users.byEmail(body.data.email) : undefined;
    const expected = user ? Buffer.from(user.passwordHash, "hex") : undefined;
    const actual = user && body.success ? Buffer.from(hashPassword(body.data.password, user.salt), "hex") : undefined;
    if (!user || !expected || !actual || !crypto.timingSafeEqual(expected, actual)) {
      return res.status(401).json({ message: "Email or password is incorrect" });
    }
    startSession(res, user.id);
    res.json({ id: user.id, name: user.name, email: user.email });
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = readCookie(req.headers.cookie, COOKIE);
    if (token) authSessions.delete(sha256(token));
    res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
    res.status(204).end();
  });

  app.get("/api/me", requireAuth, (req, res) => res.json(req.user));
}
