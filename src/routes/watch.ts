import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import type { Env, WatchItem, WatchState, ApiResponse, User } from "../types";
import { getCurrentUser } from "./auth";
import {
  parseClassUrl,
  fetchAndParseClass,
  normalizeDtuUrl,
} from "../services/parser";

const watch = new Hono<{ Bindings: Env }>();

// ============================================
// Constants
// ============================================
const MAX_WATCH_ITEMS = 10;

// ============================================
// Middleware: Require Auth
// ============================================
watch.use("*", async (c, next) => {
  const authorization = c.req.header("Authorization");
  const user = await getCurrentUser(authorization, c.env.DB, c.env.JWT_SECRET);

  if (!user) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Vui lòng đăng nhập để tiếp tục",
      },
      401
    );
  }

  c.set("user" as never, user as never);
  await next();
});

// ============================================
// Validation Schemas
// ============================================
const addWatchSchema = z.object({
  class_url: z
    .string()
    .url("URL không hợp lệ")
    .refine(
      (url) => url.includes("courses.duytan.edu.vn") && url.includes("classid"),
      "URL phải là link chi tiết lớp học từ courses.duytan.edu.vn"
    ),
  notify_telegram: z.boolean().optional().default(true),
  notify_email: z.boolean().optional().default(true),
});

const updateWatchSchema = z.object({
  is_active: z.boolean().optional(),
  notify_telegram: z.boolean().optional(),
  notify_email: z.boolean().optional(),
});

// ============================================
// Routes
// ============================================

// GET /api/watch - Get all watch items for current user
watch.get("/", async (c) => {
  const user = c.get("user" as never) as User;
  const db = c.env.DB;

  try {
    const watchItems = await db
      .prepare(
        `
        SELECT 
          w.*,
          s.last_remaining,
          s.last_checked_at,
          s.last_event_type,
          s.last_event_at,
          s.last_error
        FROM watch_items w
        LEFT JOIN watch_state s ON w.id = s.watch_item_id
        WHERE w.user_id = ?
        ORDER BY w.created_at DESC
      `
      )
      .bind(user.id)
      .all();

    return c.json<ApiResponse>({
      success: true,
      data: {
        items: watchItems.results,
        count: watchItems.results.length,
        max: MAX_WATCH_ITEMS,
      },
    });
  } catch (error) {
    console.error("Get watch items error:", error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Không thể tải danh sách theo dõi",
      },
      500
    );
  }
});

// POST /api/watch - Add new watch item
watch.post("/", zValidator("json", addWatchSchema), async (c) => {
  const user = c.get("user" as never) as User;
  const { class_url, notify_telegram, notify_email } = c.req.valid("json");
  const db = c.env.DB;

  try {
    // Check limit
    const countResult = await db
      .prepare("SELECT COUNT(*) as count FROM watch_items WHERE user_id = ?")
      .bind(user.id)
      .first<{ count: number }>();

    if (countResult && countResult.count >= MAX_WATCH_ITEMS) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: `Bạn chỉ có thể theo dõi tối đa ${MAX_WATCH_ITEMS} lớp`,
        },
        400
      );
    }

    // Check duplicate
    const existing = await db
      .prepare("SELECT id FROM watch_items WHERE user_id = ? AND class_url = ?")
      .bind(user.id, class_url)
      .first();

    if (existing) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: "Bạn đã theo dõi lớp này rồi",
        },
        400
      );
    }

    // Normalize URL first
    const normalizedUrl = normalizeDtuUrl(class_url);

    // Parse URL to extract class info
    const urlParams = parseClassUrl(normalizedUrl);

    // Fetch and parse class info from the page
    const classInfo = await fetchAndParseClass(normalizedUrl);

    if (classInfo.parseError) {
      console.warn("Parse warning:", classInfo.parseError);
    }

    // Insert watch item
    const result = await db
      .prepare(
        `
        INSERT INTO watch_items (
          user_id, class_url, class_id, semester_id, timespan,
          class_name, class_code, registration_code, schedule,
          is_active, notify_telegram, notify_email,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'))
      `
      )
      .bind(
        user.id,
        normalizedUrl,
        urlParams.classid,
        urlParams.semesterid,
        urlParams.timespan,
        classInfo.className,
        classInfo.classCode,
        classInfo.registrationCode,
        classInfo.schedule,
        notify_telegram ? 1 : 0,
        notify_email ? 1 : 0
      )
      .run();

    if (!result.success) {
      throw new Error("Failed to insert watch item");
    }

    // Get inserted item
    const newItem = await db
      .prepare("SELECT * FROM watch_items WHERE id = ?")
      .bind(result.meta.last_row_id)
      .first<WatchItem>();

    // Initialize watch state
    await db
      .prepare(
        `
        INSERT INTO watch_state (watch_item_id, last_remaining, last_checked_at)
        VALUES (?, ?, datetime('now'))
      `
      )
      .bind(result.meta.last_row_id, classInfo.remaining ?? 0)
      .run();

    return c.json<ApiResponse>(
      {
        success: true,
        data: {
          item: newItem,
          initial_remaining: classInfo.remaining,
        },
        message: classInfo.className
          ? `Đã thêm theo dõi: ${classInfo.className}`
          : "Đã thêm lớp vào danh sách theo dõi",
      },
      201
    );
  } catch (error) {
    console.error("Add watch item error:", error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Không thể thêm lớp vào danh sách theo dõi",
      },
      500
    );
  }
});

// GET /api/watch/:id - Get single watch item
watch.get("/:id", async (c) => {
  const user = c.get("user" as never) as User;
  const id = parseInt(c.req.param("id"));
  const db = c.env.DB;

  if (isNaN(id)) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: "ID không hợp lệ",
      },
      400
    );
  }

  try {
    const item = await db
      .prepare(
        `
        SELECT 
          w.*,
          s.last_remaining,
          s.last_checked_at,
          s.last_event_type,
          s.last_event_at,
          s.last_error
        FROM watch_items w
        LEFT JOIN watch_state s ON w.id = s.watch_item_id
        WHERE w.id = ? AND w.user_id = ?
      `
      )
      .bind(id, user.id)
      .first();

    if (!item) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: "Không tìm thấy lớp theo dõi",
        },
        404
      );
    }

    return c.json<ApiResponse>({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error("Get watch item error:", error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Không thể tải thông tin lớp",
      },
      500
    );
  }
});

// PUT /api/watch/:id - Update watch item
watch.put("/:id", zValidator("json", updateWatchSchema), async (c) => {
  const user = c.get("user" as never) as User;
  const id = parseInt(c.req.param("id"));
  const updates = c.req.valid("json");
  const db = c.env.DB;

  if (isNaN(id)) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: "ID không hợp lệ",
      },
      400
    );
  }

  try {
    // Check ownership
    const existing = await db
      .prepare("SELECT id FROM watch_items WHERE id = ? AND user_id = ?")
      .bind(id, user.id)
      .first();

    if (!existing) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: "Không tìm thấy lớp theo dõi",
        },
        404
      );
    }

    // Build update query dynamically
    const setClauses: string[] = ["updated_at = datetime('now')"];
    const values: (string | number)[] = [];

    if (updates.is_active !== undefined) {
      setClauses.push("is_active = ?");
      values.push(updates.is_active ? 1 : 0);
    }
    if (updates.notify_telegram !== undefined) {
      setClauses.push("notify_telegram = ?");
      values.push(updates.notify_telegram ? 1 : 0);
    }
    if (updates.notify_email !== undefined) {
      setClauses.push("notify_email = ?");
      values.push(updates.notify_email ? 1 : 0);
    }

    values.push(id);

    await db
      .prepare(`UPDATE watch_items SET ${setClauses.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();

    // Get updated item
    const updatedItem = await db
      .prepare("SELECT * FROM watch_items WHERE id = ?")
      .bind(id)
      .first<WatchItem>();

    return c.json<ApiResponse>({
      success: true,
      data: updatedItem,
      message: "Đã cập nhật cài đặt",
    });
  } catch (error) {
    console.error("Update watch item error:", error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Không thể cập nhật cài đặt",
      },
      500
    );
  }
});

// DELETE /api/watch/:id - Delete watch item
watch.delete("/:id", async (c) => {
  const user = c.get("user" as never) as User;
  const id = parseInt(c.req.param("id"));
  const db = c.env.DB;

  if (isNaN(id)) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: "ID không hợp lệ",
      },
      400
    );
  }

  try {
    // Check ownership and get item for response
    const item = await db
      .prepare("SELECT * FROM watch_items WHERE id = ? AND user_id = ?")
      .bind(id, user.id)
      .first<WatchItem>();

    if (!item) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: "Không tìm thấy lớp theo dõi",
        },
        404
      );
    }

    // Delete (cascade will handle watch_state)
    await db.prepare("DELETE FROM watch_items WHERE id = ?").bind(id).run();

    return c.json<ApiResponse>({
      success: true,
      message: item.class_name
        ? `Đã xóa: ${item.class_name}`
        : "Đã xóa khỏi danh sách theo dõi",
    });
  } catch (error) {
    console.error("Delete watch item error:", error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Không thể xóa lớp theo dõi",
      },
      500
    );
  }
});

// POST /api/watch/:id/refresh - Manually refresh a watch item
watch.post("/:id/refresh", async (c) => {
  const user = c.get("user" as never) as User;
  const id = parseInt(c.req.param("id"));
  const db = c.env.DB;

  if (isNaN(id)) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: "ID không hợp lệ",
      },
      400
    );
  }

  try {
    const item = await db
      .prepare("SELECT * FROM watch_items WHERE id = ? AND user_id = ?")
      .bind(id, user.id)
      .first<WatchItem>();

    if (!item) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: "Không tìm thấy lớp theo dõi",
        },
        404
      );
    }

    // Normalize URL first (self-healing)
    const normalizedUrl = normalizeDtuUrl(item.class_url);
    if (normalizedUrl !== item.class_url) {
      await db
        .prepare("UPDATE watch_items SET class_url = ? WHERE id = ?")
        .bind(normalizedUrl, id)
        .run();
    }

    // Fetch fresh data
    const classInfo = await fetchAndParseClass(normalizedUrl);

    if (classInfo.parseError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: `Không thể đọc thông tin: ${classInfo.parseError}`,
        },
        400
      );
    }

    // Update watch_items with fresh class info (in case it was missing before)
    await db
      .prepare(
        `
        UPDATE watch_items 
        SET class_name = COALESCE(?, class_name),
            class_code = COALESCE(?, class_code),
            registration_code = COALESCE(?, registration_code),
            schedule = COALESCE(?, schedule),
            updated_at = datetime('now')
        WHERE id = ?
      `
      )
      .bind(
        classInfo.className,
        classInfo.classCode,
        classInfo.registrationCode,
        classInfo.schedule,
        id
      )
      .run();

    // Update state
    await db
      .prepare(
        `
        UPDATE watch_state 
        SET last_remaining = ?, last_checked_at = datetime('now'), last_error = NULL
        WHERE watch_item_id = ?
      `
      )
      .bind(classInfo.remaining ?? 0, id)
      .run();

    return c.json<ApiResponse>({
      success: true,
      data: {
        remaining: classInfo.remaining,
        className: classInfo.className,
        classCode: classInfo.classCode,
        schedule: classInfo.schedule,
        registrationStatus: classInfo.registrationStatus,
      },
      message: `Còn trống: ${classInfo.remaining} chỗ`,
    });
  } catch (error) {
    console.error("Refresh watch item error:", error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Không thể làm mới thông tin",
      },
      500
    );
  }
});

export { watch as watchRoutes };
