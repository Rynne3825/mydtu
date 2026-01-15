import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import type { Env, ApiResponse, User, TelegramLinkCode } from "../types";
import { getCurrentUser } from "./auth";

const telegram = new Hono<{ Bindings: Env }>();

// ============================================
// Helper Functions
// ============================================
function generateLinkCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML"
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode,
        }),
      }
    );

    const result = (await response.json()) as { ok: boolean };
    return result.ok;
  } catch (error) {
    console.error("Telegram send error:", error);
    return false;
  }
}

// ============================================
// Routes
// ============================================

// POST /api/telegram/generate-code - Generate link code for current user
telegram.post("/generate-code", async (c) => {
  const authorization = c.req.header("Authorization");
  const user = await getCurrentUser(authorization, c.env.DB, c.env.JWT_SECRET);

  if (!user) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Vui lòng đăng nhập",
      },
      401
    );
  }

  const db = c.env.DB;

  try {
    // Delete old codes for this user
    await db
      .prepare("DELETE FROM telegram_link_codes WHERE user_id = ?")
      .bind(user.id)
      .run();

    // Generate new code
    const code = generateLinkCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    await db
      .prepare(
        `
        INSERT INTO telegram_link_codes (code, user_id, expires_at)
        VALUES (?, ?, ?)
      `
      )
      .bind(code, user.id, expiresAt)
      .run();

    return c.json<ApiResponse>({
      success: true,
      data: {
        code,
        expires_at: expiresAt,
        bot_username: "MyDTU_BOT",
        instructions: `Gửi mã ${code} đến @MyDTU_BOT trên Telegram để liên kết tài khoản`,
      },
    });
  } catch (error) {
    console.error("Generate code error:", error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Không thể tạo mã liên kết",
      },
      500
    );
  }
});

// POST /api/telegram/unlink - Unlink Telegram from current user
telegram.post("/unlink", async (c) => {
  const authorization = c.req.header("Authorization");
  const user = await getCurrentUser(authorization, c.env.DB, c.env.JWT_SECRET);

  if (!user) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Vui lòng đăng nhập",
      },
      401
    );
  }

  const db = c.env.DB;

  try {
    await db
      .prepare(
        "UPDATE users SET telegram_chat_id = NULL, updated_at = datetime('now') WHERE id = ?"
      )
      .bind(user.id)
      .run();

    return c.json<ApiResponse>({
      success: true,
      message: "Đã hủy liên kết Telegram",
    });
  } catch (error) {
    console.error("Unlink error:", error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Không thể hủy liên kết",
      },
      500
    );
  }
});

// POST /api/telegram/webhook - Telegram bot webhook handler
telegram.post("/webhook", async (c) => {
  const db = c.env.DB;
  const botToken = c.env.TELEGRAM_BOT_TOKEN;

  try {
    const update = (await c.req.json()) as {
      message?: {
        chat: { id: number };
        from?: { id: number; first_name?: string };
        text?: string;
      };
    };

    if (!update.message?.text) {
      return c.json({ ok: true });
    }

    const chatId = update.message.chat.id.toString();
    const text = update.message.text.trim();
    const firstName = update.message.from?.first_name || "bạn";

    // Handle /start command
    if (text === "/start") {
      await sendTelegramMessage(
        botToken,
        chatId,
        `👋 Xin chào ${firstName}!\n\n` +
          `Đây là bot thông báo slot tín chỉ MyDTU.\n\n` +
          `📌 <b>Để liên kết tài khoản:</b>\n` +
          `1. Đăng nhập vào https://mydtu.indevs.in\n` +
          `2. Vào Cài đặt → Liên kết Telegram\n` +
          `3. Lấy mã 6 chữ và gửi vào đây\n\n` +
          `💡 Ví dụ: <code>ABC123</code>`
      );
      return c.json({ ok: true });
    }

    // Handle /help command
    if (text === "/help") {
      await sendTelegramMessage(
        botToken,
        chatId,
        `📖 <b>Hướng dẫn sử dụng:</b>\n\n` +
          `• /start - Bắt đầu\n` +
          `• /status - Kiểm tra trạng thái liên kết\n` +
          `• /help - Xem hướng dẫn\n\n` +
          `🔗 Website: https://mydtu.indevs.in`
      );
      return c.json({ ok: true });
    }

    // Handle /status command
    if (text === "/status") {
      const user = await db
        .prepare("SELECT * FROM users WHERE telegram_chat_id = ?")
        .bind(chatId)
        .first<{ email: string }>();

      if (user) {
        await sendTelegramMessage(
          botToken,
          chatId,
          `✅ <b>Đã liên kết với:</b> ${user.email}\n\n` +
            `Bạn sẽ nhận thông báo khi có slot mở.`
        );
      } else {
        await sendTelegramMessage(
          botToken,
          chatId,
          `❌ Chưa liên kết tài khoản.\n\n` +
            `Vui lòng đăng nhập vào https://mydtu.indevs.in và lấy mã liên kết.`
        );
      }
      return c.json({ ok: true });
    }

    // Handle link code (6 character alphanumeric)
    if (/^[A-Z0-9]{6}$/i.test(text)) {
      const code = text.toUpperCase();

      // Find valid code
      const linkCode = await db
        .prepare(
          `
          SELECT * FROM telegram_link_codes 
          WHERE code = ? AND used_at IS NULL AND expires_at > datetime('now')
        `
        )
        .bind(code)
        .first<TelegramLinkCode>();

      if (!linkCode) {
        await sendTelegramMessage(
          botToken,
          chatId,
          `❌ Mã không hợp lệ hoặc đã hết hạn.\n\n` +
            `Vui lòng lấy mã mới từ website.`
        );
        return c.json({ ok: true });
      }

      // Check if this chat is already linked to another user
      const existingUser = await db
        .prepare(
          "SELECT email FROM users WHERE telegram_chat_id = ? AND id != ?"
        )
        .bind(chatId, linkCode.user_id)
        .first<{ email: string }>();

      if (existingUser) {
        await sendTelegramMessage(
          botToken,
          chatId,
          `⚠️ Telegram này đã liên kết với ${existingUser.email}.\n\n` +
            `Hủy liên kết tài khoản cũ trước khi liên kết tài khoản mới.`
        );
        return c.json({ ok: true });
      }

      // Link the account
      await db.batch([
        db
          .prepare(
            "UPDATE users SET telegram_chat_id = ?, updated_at = datetime('now') WHERE id = ?"
          )
          .bind(chatId, linkCode.user_id),
        db
          .prepare(
            "UPDATE telegram_link_codes SET used_at = datetime('now') WHERE code = ?"
          )
          .bind(code),
      ]);

      // Get user email for confirmation
      const user = await db
        .prepare("SELECT email FROM users WHERE id = ?")
        .bind(linkCode.user_id)
        .first<{ email: string }>();

      await sendTelegramMessage(
        botToken,
        chatId,
        `✅ <b>Liên kết thành công!</b>\n\n` +
          `📧 Tài khoản: ${user?.email}\n\n` +
          `Bạn sẽ nhận thông báo khi slot mở hoặc tăng thêm.`
      );

      return c.json({ ok: true });
    }

    // Unknown command
    await sendTelegramMessage(
      botToken,
      chatId,
      `🤔 Không hiểu lệnh.\n\n` + `Gửi /help để xem hướng dẫn.`
    );

    return c.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return c.json({ ok: true }); // Always return ok to Telegram
  }
});

export { telegram as telegramRoutes };
export { sendTelegramMessage };
