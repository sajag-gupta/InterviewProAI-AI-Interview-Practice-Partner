import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "../../server/db";
import { registerRoutes } from "../../server/routes";

let base = "";
let server: Awaited<ReturnType<typeof registerRoutes>>;
let cookie = "";

const call = async (method: string, path: string, body?: unknown, withCookie = true) => {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(withCookie && cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
};

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  closeDb();
});

describe("auth API", () => {
  it("rejects protected routes without a session", async () => {
    expect((await call("GET", "/api/stats", undefined, false)).status).toBe(401);
  });

  it("validates sign-up input", async () => {
    expect((await call("POST", "/api/auth/signup", { name: "A", email: "nope", password: "12345678" })).status).toBe(400);
    expect((await call("POST", "/api/auth/signup", { name: "A", email: "a@example.com", password: "short" })).status).toBe(400);
  });

  it("signs up, reads the session, rejects duplicates and bad passwords", async () => {
    const created = await call("POST", "/api/auth/signup", { name: "Ada", email: "ada@example.com", password: "correct-horse" });
    expect(created.status).toBe(201);
    expect(cookie).toContain("ipai_session=");
    expect((await call("GET", "/api/me")).data.email).toBe("ada@example.com");
    expect((await call("POST", "/api/auth/signup", { name: "Ada", email: "ada@example.com", password: "correct-horse" })).status).toBe(409);
    expect((await call("POST", "/api/auth/login", { email: "ada@example.com", password: "wrong-password" })).status).toBe(401);
  });

  it("logs out and invalidates the session", async () => {
    const old = cookie;
    await call("POST", "/api/auth/logout");
    cookie = old;
    expect((await call("GET", "/api/me")).status).toBe(401);
  });
});

describe("data API", () => {
  it("returns an empty dashboard for a new user and 404 for unknown interviews", async () => {
    await call("POST", "/api/auth/login", { email: "ada@example.com", password: "correct-horse" });
    const stats = await call("GET", "/api/stats");
    expect(stats.data.sessions).toBe(0);
    expect(stats.data.averageScore).toBeNull();
    expect((await call("GET", "/api/interviews/does-not-exist")).status).toBe(404);
  });

  it("extracts document insights with the mock provider", async () => {
    const res = await call("POST", "/api/extract", { jdText: "Looking for an engineer", resumeText: "I am an engineer" });
    expect(res.status).toBe(200);
    expect(res.data.requiredSkills.length).toBeGreaterThan(0);
  });
});
