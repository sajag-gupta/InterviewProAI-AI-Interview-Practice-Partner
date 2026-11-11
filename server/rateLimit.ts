import type { RequestHandler } from "express";

/** Fixed-window limiter per IP. In-memory is fine for one process; swap for Redis when scaling out. */
export function rateLimit(max: number, windowMs: number): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (++entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ message: "Too many requests. Try again shortly." });
    }
    next();
  };
}
