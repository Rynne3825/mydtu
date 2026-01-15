import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { Env, User, ApiResponse } from "../types";
import { getCurrentUser } from "./auth";

const admin = new Hono<{ Bindings: Env }>();

const ADMIN_EMAILS = ["rinroblox365@gmail.com"];

// Middleware: Require Admin Auth
admin.use("*", async (c, next) => {
  const authorization = c.req.header("Authorization");
  const user = await getCurrentUser(authorization, c.env.DB, c.env.JWT_SECRET);

  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Forbidden: Admin access only",
      },
      403
    );
  }

  c.set("user" as never, user as never);
  await next();
});

// GET /api/admin/users
admin.get("/users", async (c) => {
  const db = c.env.DB;
  try {
    const users = await db
      .prepare(
        `
        SELECT id, email, username, email_verified, telegram_chat_id, created_at 
        FROM users 
        ORDER BY created_at DESC
      `
      )
      .all<User>();
    return c.json<ApiResponse>({
      success: true,
      data: {
        users: users.results,
        count: users.results.length,
      },
    });
  } catch (error) {
    return c.json<ApiResponse>(
      { success: false, error: "Failed to list users" },
      500
    );
  }
});

// DELETE /api/admin/users/:id
admin.delete("/users/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  try {
    await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
    return c.json<ApiResponse>({ success: true, message: "Đã xóa người dùng" });
  } catch (error) {
    return c.json<ApiResponse>(
      { success: false, error: "Lỗi xóa người dùng" },
      500
    );
  }
});

// PUT /api/admin/users/:id
admin.put(
  "/users/:id",
  zValidator(
    "json",
    z.object({
      username: z.string().optional(),
      email: z.string().email().optional(),
      password: z.string().min(6).optional(),
    })
  ),
  async (c) => {
    const id = c.req.param("id");
    const { username, email, password } = c.req.valid("json");
    const db = c.env.DB;

    try {
      const user = await db
        .prepare("SELECT * FROM users WHERE id = ?")
        .bind(id)
        .first<User>();
      if (!user)
        return c.json<ApiResponse>(
          { success: false, error: "Users not found" },
          404
        );

      let newPasswordHash = user.password_hash;
      if (password) {
        newPasswordHash = await bcrypt.hash(password, 10);
      }

      await db
        .prepare(
          `
        UPDATE users 
        SET username = ?, email = ?, password_hash = ?
        WHERE id = ?
      `
        )
        .bind(
          username || user.username,
          email || user.email,
          newPasswordHash,
          id
        )
        .run();

      return c.json<ApiResponse>({
        success: true,
        message: "Cập nhật thành công",
      });
    } catch (error) {
      return c.json<ApiResponse>(
        { success: false, error: "Lỗi cập nhật" },
        500
      );
    }
  }
);

// POST /api/admin/test-telegram
admin.post("/test-telegram", async (c) => {
  const user = c.get("user" as never) as User;
  if (!user.telegram_chat_id) {
    return c.json<ApiResponse>(
      { success: false, error: "Tài khoản chưa liên kết Telegram" },
      400
    );
  }

  try {
    const telegramUrl = `https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: user.telegram_chat_id,
        text: "🔔 *Test thông báo thành công!*\n\nĐây là tin nhắn test từ MyDTU Slot Monitor.",
        parse_mode: "Markdown",
      }),
    });
    return c.json<ApiResponse>({
      success: true,
      message: "Đã gửi thông báo Telegram!",
    });
  } catch (error) {
    return c.json<ApiResponse>(
      { success: false, error: "Lỗi gửi Telegram" },
      500
    );
  }
});

// POST /api/admin/test-email
admin.post("/test-email", async (c) => {
  const user = c.get("user" as never) as User;

  if (!user.email_verified) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Email chưa được xác thực. Vui lòng xác thực email trước.",
      },
      400
    );
  }

  try {
    console.log("Sending test email to:", user.email);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MyDTU Monitor <onboarding@resend.dev>",
        to: user.email,
        subject: "🔔 Test thông báo Email",
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2>Test thông báo thành công!</h2>
            <p>Đây là email test từ MyDTU Slot Monitor.</p>
            <p>Nếu bạn nhận được email này, hệ thống thông báo đang hoạt động bình thường.</p>
          </div>
        `,
      }),
    });

    const responseBody = await res.json();
    console.log("Resend API response:", res.status, responseBody);

    if (!res.ok) {
      console.error("Resend error:", responseBody);
      return c.json<ApiResponse>(
        {
          success: false,
          error: `Lỗi gửi Email: ${
            (responseBody as { message?: string })?.message || res.status
          }`,
        },
        500
      );
    }

    return c.json<ApiResponse>({
      success: true,
      message: "Đã gửi email test!",
    });
  } catch (error) {
    console.error("Email send error:", error);
    return c.json<ApiResponse>({ success: false, error: "Lỗi gửi Email" }, 500);
  }
});

export { admin as adminRoutes };
