import { Env } from "../types";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(
  env: Env,
  options: EmailOptions
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "MyDTU Monitor <onboarding@resend.dev>", // Default Resend testing domain
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!res.ok) {
      const error = await res.json();
      console.error("Resend API Error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Send Email Error:", error);
    return false;
  }
}

export function generateVerificationEmail(code: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Xác thực tài khoản MyDTU Monitor</h2>
      <p>Chào bạn,</p>
      <p>Cảm ơn bạn đã đăng ký tài khoản. Mã xác thực của bạn là:</p>
      <div style="background: #f4f4f5; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; border-radius: 8px; letter-spacing: 5px;">
        ${code}
      </div>
      <p>Mã này sẽ hết hạn sau 15 phút.</p>
      <p>Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
    </div>
  `;
}
