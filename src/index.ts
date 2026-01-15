import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";

import type { Env } from "./types";
import { authRoutes } from "./routes/auth";
import { watchRoutes } from "./routes/watch";
import { telegramRoutes } from "./routes/telegram";
import { adminRoutes } from "./routes/admin";
import debug from "./routes/debug";
import { handleScheduled } from "./services/cron";

const app = new Hono<{ Bindings: Env }>();

// ============================================
// Middleware (only for API routes)
// ============================================
app.use("/api/*", logger());
app.use("/api/*", prettyJSON());
app.use("/api/*", secureHeaders());
app.use(
  "/api/*",
  cors({
    origin: ["https://mydtu.indevs.in", "http://localhost:5173"],
    credentials: true,
  })
);

// ============================================
// Health check (API only)
// ============================================
app.get("/api", (c) => {
  return c.json({
    name: "MyDTU Slot Monitor API",
    version: "1.0.0",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

// API Routes
app.route("/api/auth", authRoutes);
app.route("/api/watch", watchRoutes);
app.route("/api/telegram", telegramRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/debug", debug);

// ============================================
// Static assets and SPA fallback
// ============================================
app.get("*", async (c) => {
  const url = new URL(c.req.url);

  // API routes that weren't matched should return 404
  if (url.pathname.startsWith("/api")) {
    return c.json(
      {
        success: false,
        error: "Not Found",
        message: `Route ${c.req.method} ${url.pathname} not found`,
      },
      404
    );
  }

  // Try to fetch the asset
  try {
    let assetPath = url.pathname;

    // Try exact path first
    let response = await c.env.ASSETS.fetch(new Request(url.toString()));

    // If not found (404) and not a file extension, serve index.html for SPA
    if (response.status === 404 && !assetPath.includes(".")) {
      const indexUrl = new URL("/index.html", url.origin);
      response = await c.env.ASSETS.fetch(new Request(indexUrl.toString()));
    }

    return response;
  } catch (error) {
    console.error("Asset fetch error:", error);
    return c.text("Internal Server Error", 500);
  }
});

// ============================================
// Error Handler
// ============================================
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json(
    {
      success: false,
      error: "Internal Server Error",
      message:
        c.env.ENVIRONMENT === "development"
          ? err.message
          : "Something went wrong",
    },
    500
  );
});

// ============================================
// Exports
// ============================================
export default {
  // HTTP fetch handler
  fetch: app.fetch,

  // Scheduled (cron) handler - runs every 10 minutes
  scheduled: handleScheduled,
};
