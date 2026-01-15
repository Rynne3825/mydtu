import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { sendEmail, generateVerificationEmail } from "../services/email";

import type { Env, User, ApiResponse, JwtPayload } from "../types";

const auth = new Hono<{ Bindings: Env }>();

// ============================================
// Validation Schemas
// ============================================
const registerSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  username: z.string().min(3, "Username phải có ít nhất 3 ký tự").optional(),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
});

const loginSchema = z.object({
  email: z.string().min(1, "Vui lòng nhập email hoặc username"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

// ============================================
// Helper Functions
// ============================================
async function createToken(user: User, secret: string): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);

  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
  } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey);

  return token;
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<JwtPayload | null> {
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(
  authorization: string | undefined,
  db: D1Database,
  secret: string
): Promise<User | null> {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice(7);
  const payload = await verifyToken(token, secret);

  if (!payload) {
    return null;
  }

  const user = await db
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub)
    .first<User>();

  return user;
}

// Generate 6 digit numeric code
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function createVerificationCode(
  userId: number,
  db: D1Database
): Promise<string> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

  await db
    .prepare(
      "INSERT INTO email_verification_codes (code, user_id, expires_at) VALUES (?, ?, ?)"
    )
    .bind(code, userId, expiresAt)
    .run();

  return code;
}

// ============================================
// Routes
// ============================================

// POST /api/auth/register
auth.post("/register", zValidator("json", registerSchema), async (c) => {
  const { email, username, password } = c.req.valid("json");
  const db = c.env.DB;

  try {
    // Check if email exists
    const existing = await db
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email.toLowerCase())
      .first();

    if (existing) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: "Email đã được sử dụng",
        },
        400
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await db
      .prepare(
        `
        INSERT INTO users (email, username, password_hash, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))
      `
      )
      .bind(email.toLowerCase(), username || null, passwordHash)
      .run();

    if (!result.success) {
      throw new Error("Failed to create user");
    }

    // Get created user
    const user = await db
      .prepare("SELECT * FROM users WHERE email = ?")
      .bind(email.toLowerCase())
      .first<User>();

    if (!user) {
      throw new Error("User not found after creation");
    }

    // Create token
    const token = await createToken(user, c.env.JWT_SECRET);

    // Create and send verification code
    const code = await createVerificationCode(user.id, db);
    const emailHtml = generateVerificationEmail(code);

    // Use waitUntil to send email without blocking response
    c.executionCtx.waitUntil(
      sendEmail(c.env, {
        to: user.email,
        subject: "Mã xác thực MyDTU Monitor",
        html: emailHtml,
      })
    );

    return c.json<ApiResponse>(
      {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            email_verified: Boolean(user.email_verified),
            telegram_connected: Boolean(user.telegram_chat_id),
          },
          token,
        },
        message: "Đăng ký thành công! Vui lòng kiểm tra email để xác thực.",
      },
      201
    );
  } catch (error) {
    console.error("Register error:", error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Đã có lỗi xảy ra, vui lòng thử lại",
      },
      500
    );
  } finally {
    // Send verification email in background (if we had a queue)
    // For now we await it or fire and forget if we don't block
    // Better to fire and forget for speed, but careful with Cloudflare workers lifetime
    // We'll trust ctx.executionCtx.waitUntil if using Hono with ctx, but here we just construct
    // We'll try to do it before return or use waitUntil if available in c
  }
});

// POST /api/auth/login
auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const db = c.env.DB;

  try {
    // Find user (by email or username)
    const user = await db
      .prepare("SELECT * FROM users WHERE email = ? OR username = ?")
      .bind(email.toLowerCase(), email.toLowerCase())
      .first<User>();

    if (!user) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: "Email hoặc mật khẩu không đúng",
        },
        401
      );
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: "Email hoặc mật khẩu không đúng",
        },
        401
      );
    }

    // Create token
    const token = await createToken(user, c.env.JWT_SECRET);

    return c.json<ApiResponse>({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          email_verified: Boolean(user.email_verified),
          telegram_connected: Boolean(user.telegram_chat_id),
        },
        token,
      },
      message: "Đăng nhập thành công!",
    });
  } catch (error) {
    console.error("Login error:", error);
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Đã có lỗi xảy ra, vui lòng thử lại",
      },
      500
    );
  }
});

// GET /api/auth/me
auth.get("/me", async (c) => {
  const authorization = c.req.header("Authorization");
  const user = await getCurrentUser(authorization, c.env.DB, c.env.JWT_SECRET);

  if (!user) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: "Unauthorized",
      },
      401
    );
  }

  return c.json<ApiResponse>({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      username: user.username,
      email_verified: Boolean(user.email_verified),
      telegram_connected: Boolean(user.telegram_chat_id),
      created_at: user.created_at,
    },
  });
});

// POST /api/auth/logout
auth.post("/logout", async (c) => {
  // With JWT, logout is handled client-side by removing the token
  // Optionally, we could implement a token blacklist here

  return c.json<ApiResponse>({
    success: true,
    message: "Đăng xuất thành công",
  });
});

// POST /api/auth/verify
auth.post(
  "/verify",
  zValidator("json", z.object({ code: z.string() })),
  async (c) => {
    const { code } = c.req.valid("json");
    const authorization = c.req.header("Authorization");
    const user = await getCurrentUser(
      authorization,
      c.env.DB,
      c.env.JWT_SECRET
    );
    const db = c.env.DB;

    if (!user) {
      return c.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        401
      );
    }

    // Check code
    const record = await db
      .prepare(
        "SELECT * FROM email_verification_codes WHERE code = ? AND user_id = ?"
      )
      .bind(code, user.id)
      .first();

    if (!record) {
      return c.json<ApiResponse>(
        { success: false, error: "Mã xác thực không đúng" },
        400
      );
    }

    const expiresAt = new Date(record.expires_at as string);
    if (expiresAt < new Date()) {
      return c.json<ApiResponse>(
        { success: false, error: "Mã xác thực đã hết hạn" },
        400
      );
    }

    // Update user
    await db
      .prepare("UPDATE users SET email_verified = 1 WHERE id = ?")
      .bind(user.id)
      .run();

    // Delete used code
    await db
      .prepare("DELETE FROM email_verification_codes WHERE code = ?")
      .bind(code)
      .run();

    return c.json<ApiResponse>({
      success: true,
      message: "Xác thực email thành công!",
    });
  }
);

// POST /api/auth/resend-verification
auth.post("/resend-verification", async (c) => {
  const authorization = c.req.header("Authorization");
  const user = await getCurrentUser(authorization, c.env.DB, c.env.JWT_SECRET);
  const db = c.env.DB;

  if (!user) {
    return c.json<ApiResponse>({ success: false, error: "Unauthorized" }, 401);
  }

  if (user.email_verified) {
    return c.json<ApiResponse>(
      { success: false, message: "Email đã được xác thực trước đó" },
      400
    );
  }

  // Create and send verification code
  const code = await createVerificationCode(user.id, db);
  const emailHtml = generateVerificationEmail(code);

  c.executionCtx.waitUntil(
    sendEmail(c.env, {
      to: user.email,
      subject: "Mã xác thực MyDTU Monitor",
      html: emailHtml,
    })
  );

  return c.json<ApiResponse>({
    success: true,
    message: "Đã gửi lại mã xác thực",
  });
});

// PUT /api/auth/username
auth.put(
  "/username",
  zValidator(
    "json",
    z.object({
      username: z
        .string()
        .min(3, "Username phải có ít nhất 3 ký tự")
        .max(20, "Username không được quá 20 ký tự")
        .regex(
          /^[a-zA-Z0-9_]+$/,
          "Username chỉ được chứa chữ cái, số và dấu gạch dưới. không chứa ký tự đặc biệt"
        ),
    })
  ),
  async (c) => {
    const { username } = c.req.valid("json");
    const authorization = c.req.header("Authorization");
    const db = c.env.DB;

    const user = await getCurrentUser(authorization, db, c.env.JWT_SECRET);
    if (!user) {
      return c.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        401
      );
    }

    try {
      // Check if username already taken
      const existing = await db
        .prepare("SELECT id FROM users WHERE username = ? AND id != ?")
        .bind(username, user.id)
        .first();

      if (existing) {
        return c.json<ApiResponse>(
          { success: false, error: "Username đã được sử dụng" },
          400
        );
      }

      await db
        .prepare("UPDATE users SET username = ? WHERE id = ?")
        .bind(username, user.id)
        .run();

      return c.json<ApiResponse>({
        success: true,
        message: "Cập nhật username thành công",
      });
    } catch (error) {
      console.error("Update Username Error:", error);
      return c.json<ApiResponse>(
        { success: false, error: "Lỗi cập nhật username" },
        500
      );
    }
  }
);

export { auth as authRoutes };
