// Type definitions for Cloudflare Workers environment

export interface Env {
  // D1 Database
  DB: D1Database;

  // Assets binding for static files
  ASSETS: Fetcher;

  // Environment variables
  ENVIRONMENT: string;
  JWT_SECRET: string;

  // Telegram
  TELEGRAM_BOT_TOKEN: string;

  // Email (Resend)
  RESEND_API_KEY: string;
}

// Database types
export interface User {
  id: number;
  email: string;
  username: string | null;
  password_hash: string;
  email_verified: number;
  telegram_chat_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchItem {
  id: number;
  user_id: number;
  class_url: string;
  class_id: string | null;
  semester_id: string | null;
  timespan: string | null;
  class_name: string | null;
  class_code: string | null;
  schedule: string | null;
  is_active: number;
  notify_telegram: number;
  notify_email: number;
  created_at: string;
  updated_at: string;
}

export interface WatchState {
  watch_item_id: number;
  last_remaining: number;
  last_checked_at: string | null;
  last_event_type: string | null;
  last_event_at: string | null;
  last_error: string | null;
  consecutive_errors: number;
}

export interface NotificationLog {
  id: number;
  watch_item_id: number;
  event_type: "OPEN" | "INCREASE";
  channel: "telegram" | "email";
  remaining: number;
  sent_at: string;
  status: "success" | "fail";
  error_message: string | null;
}

export interface TelegramLinkCode {
  code: string;
  user_id: number;
  expires_at: string;
  used_at: string | null;
}

export interface Session {
  id: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

// Parsed class info from HTML
export interface ParsedClassInfo {
  remaining: number | null;
  className: string | null;
  classCode: string | null;
  registrationCode: string | null;
  semester: string | null;
  schedule: string | null;
  registrationStatus: string | null;
  parseError: string | null;
}

// Notification event types
export type EventType = "OPEN" | "INCREASE";

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// JWT payload
export interface JwtPayload {
  sub: number; // user_id
  email: string;
  iat: number;
  exp: number;
}
