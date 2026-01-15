import { Hono } from "hono";
import { Env } from "../types";
import { checkWatchItems } from "../services/cron";
// import { fetchAndParseClass, parseClassHtml } from "../services/parser";
import { fetchAndParseClass, parseClassHtml } from "../services/parser";

const debug = new Hono<{ Bindings: Env }>();

// Trigger cron job manually
debug.post("/trigger-cron", async (c) => {
  try {
    const result = await checkWatchItems(c.env);
    return c.json(result);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Inspect parser output for a URL
debug.get("/parser", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.text("Missing url", 400);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });
    const html = await response.text();
    const info = parseClassHtml(html);

    return c.json({
      url,
      info,
      html_preview: html.substring(0, 500),
      html_length: html.length,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export default debug;
