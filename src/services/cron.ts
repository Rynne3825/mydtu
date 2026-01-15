import type { Env, WatchItem, WatchState, User, EventType } from "../types";
import { fetchAndParseClass, normalizeDtuUrl } from "./parser";
import { sendTelegramMessage } from "../routes/telegram";

// ============================================
// Cron Handler
// ============================================
export async function handleScheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  console.log(`[Cron] Starting scheduled check at ${new Date().toISOString()}`);

  try {
    await checkWatchItems(env);
    console.log("[Cron] Completed successfully");
  } catch (error) {
    console.error("[Cron] Error:", error);
  }
}

// ============================================
// Main Check Logic
// ============================================
export async function checkWatchItems(env: Env): Promise<any> {
  const db = env.DB;

  // Get all active watch items with their state and user info
  const result = await db
    .prepare(
      `
      SELECT 
        w.id,
        w.user_id,
        w.class_url,
        w.class_name,
        w.class_code,
        w.notify_telegram,
        w.notify_email,
        s.last_remaining,
        s.consecutive_errors,
        u.email,
        u.telegram_chat_id
      FROM watch_items w
      JOIN watch_state s ON w.id = s.watch_item_id
      JOIN users u ON w.user_id = u.id
      WHERE w.is_active = 1
    `
    )
    .all<WatchItemWithUserState>();

  console.log(`[Cron] Checking ${result.results.length} active watch items`);

  // Process each item
  for (const item of result.results) {
    try {
      await checkSingleItem(item, env);
    } catch (error) {
      console.error(`[Cron] Error checking item ${item.id}:`, error);

      // Update error state
      await db
        .prepare(
          `
          UPDATE watch_state 
          SET 
            last_error = ?,
            consecutive_errors = consecutive_errors + 1,
            last_checked_at = datetime('now')
          WHERE watch_item_id = ?
        `
        )
        .bind(error instanceof Error ? error.message : "Unknown error", item.id)
        .run();
    }
  }
}

// ============================================
// Single Item Check
// ============================================
interface WatchItemWithUserState {
  id: number;
  user_id: number;
  class_url: string;
  class_name: string | null;
  class_code: string | null;
  notify_telegram: number;
  notify_email: number;
  last_remaining: number;
  consecutive_errors: number;
  email: string;
  telegram_chat_id: string | null;
}

async function checkSingleItem(
  item: WatchItemWithUserState,
  env: Env
): Promise<void> {
  const db = env.DB;

  // Fetch and parse current state
  const classInfo = await fetchAndParseClass(normalizeDtuUrl(item.class_url));

  if (classInfo.parseError || classInfo.remaining === null) {
    console.warn(
      `[Cron] Parse error for item ${item.id}: ${classInfo.parseError}`
    );

    // Update error state
    await db
      .prepare(
        `
        UPDATE watch_state 
        SET 
          last_error = ?,
          consecutive_errors = consecutive_errors + 1,
          last_checked_at = datetime('now')
        WHERE watch_item_id = ?
      `
      )
      .bind(classInfo.parseError || "Unknown parse error", item.id)
      .run();

    return;
  }

  const currentRemaining = classInfo.remaining;
  const lastRemaining = item.last_remaining;

  // Detect event
  let eventType: EventType | null = null;

  if (lastRemaining <= 0 && currentRemaining > 0) {
    eventType = "OPEN";
  } else if (lastRemaining > 0 && currentRemaining > lastRemaining) {
    eventType = "INCREASE";
  }

  // Update state
  await db
    .prepare(
      `
      UPDATE watch_state 
      SET 
        last_remaining = ?,
        last_checked_at = datetime('now'),
        last_error = NULL,
        consecutive_errors = 0
        ${
          eventType
            ? ", last_event_type = ?, last_event_at = datetime('now')"
            : ""
        }
      WHERE watch_item_id = ?
    `
    )
    .bind(currentRemaining, ...(eventType ? [eventType] : []), item.id)
    .run();

  // Send notifications if event detected
  if (eventType) {
    console.log(
      `[Cron] Event ${eventType} detected for item ${item.id}: ${lastRemaining} -> ${currentRemaining}`
    );

    await sendNotifications(item, eventType, currentRemaining, env);
  }
}

// ============================================
// Send Notifications
// ============================================
async function sendNotifications(
  item: WatchItemWithUserState,
  eventType: EventType,
  remaining: number,
  env: Env
): Promise<void> {
  const db = env.DB;
  const className = item.class_name || item.class_code || "Lớp học";

  // Send Telegram notification
  if (item.notify_telegram && item.telegram_chat_id) {
    const emoji = eventType === "OPEN" ? "🔔" : "📈";
    const title = eventType === "OPEN" ? "SLOT MỞ!" : "SLOT TĂNG!";

    const message =
      `${emoji} <b>${title}</b>\n\n` +
      `📚 ${className}\n` +
      (item.class_code ? `📋 Mã: ${item.class_code}\n` : "") +
      `\n✅ <b>Còn trống: ${remaining} chỗ</b>\n\n` +
      `🔗 <a href="${item.class_url}">Xem chi tiết</a>`;

    const success = await sendTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      item.telegram_chat_id,
      message
    );

    // Log notification
    await db
      .prepare(
        `
        INSERT INTO notification_log (watch_item_id, event_type, channel, remaining, status, error_message)
        VALUES (?, ?, 'telegram', ?, ?, ?)
      `
      )
      .bind(
        item.id,
        eventType,
        remaining,
        success ? "success" : "fail",
        success ? null : "Failed to send"
      )
      .run();
  }

  // Send Email notification
  if (item.notify_email && env.RESEND_API_KEY) {
    const subject =
      eventType === "OPEN"
        ? `[MyDTU] Slot mở: ${className} - Còn ${remaining} chỗ`
        : `[MyDTU] Slot tăng: ${className} - Còn ${remaining} chỗ`;

    const success = await sendEmail(
      env.RESEND_API_KEY,
      item.email,
      subject,
      buildEmailHtml(
        className,
        item.class_code,
        remaining,
        item.class_url,
        eventType
      )
    );

    // Log notification
    await db
      .prepare(
        `
        INSERT INTO notification_log (watch_item_id, event_type, channel, remaining, status, error_message)
        VALUES (?, ?, 'email', ?, ?, ?)
      `
      )
      .bind(
        item.id,
        eventType,
        remaining,
        success ? "success" : "fail",
        success ? null : "Failed to send"
      )
      .run();
  }
}

// ============================================
// Email Service
// ============================================
async function sendEmail(
  apiKey: string,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MyDTU Slot Monitor <notify@mydtu.indevs.in>",
        to: [to],
        subject,
        html,
      }),
    });

    const result = (await response.json()) as { id?: string; error?: string };

    if (!response.ok) {
      console.error("Resend error:", result);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Email send error:", error);
    return false;
  }
}

function buildEmailHtml(
  className: string,
  classCode: string | null,
  remaining: number,
  url: string,
  eventType: EventType
): string {
  const emoji = eventType === "OPEN" ? "🔔" : "📈";
  const title = eventType === "OPEN" ? "Slot Mở!" : "Slot Tăng!";
  const color = eventType === "OPEN" ? "#22c55e" : "#3b82f6";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="margin: 0 0 24px; font-size: 24px; color: ${color};">
      ${emoji} ${title}
    </h1>
    
    <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #111827;">
        ${className}
      </p>
      ${
        classCode
          ? `<p style="margin: 0; color: #6b7280;">Mã: ${classCode}</p>`
          : ""
      }
    </div>
    
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px; font-weight: bold; color: ${color};">
        ${remaining}
      </div>
      <div style="color: #6b7280;">chỗ còn trống</div>
    </div>
    
    <a href="${url}" style="display: block; text-align: center; background: ${color}; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-weight: 600;">
      Xem chi tiết & Đăng ký ngay
    </a>
    
    <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af; text-align: center;">
      Thông báo từ MyDTU Slot Monitor<br>
      <a href="https://mydtu.indevs.in" style="color: #6b7280;">mydtu.indevs.in</a>
    </p>
  </div>
</body>
</html>
  `.trim();
}
