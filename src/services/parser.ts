import { parseHTML } from "linkedom";
import type { ParsedClassInfo } from "../types";

// ============================================
// URL Parser
// ============================================
export interface UrlParams {
  classid: string | null;
  semesterid: string | null;
  timespan: string | null;
}

export function normalizeDtuUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    if (
      urlObj.hostname === "courses.duytan.edu.vn" &&
      urlObj.pathname.includes("Home_ChuongTrinhDaoTao.aspx")
    ) {
      if (!urlObj.searchParams.has("p")) {
        urlObj.searchParams.set("p", "home_listclassdetail");
      }
    }
    return urlObj.toString();
  } catch (e) {
    return url;
  }
}

export function parseClassUrl(url: string): UrlParams {
  try {
    const urlObj = new URL(url);
    return {
      classid: urlObj.searchParams.get("classid"),
      semesterid: urlObj.searchParams.get("semesterid"),
      timespan: urlObj.searchParams.get("timespan"),
    };
  } catch {
    return { classid: null, semesterid: null, timespan: null };
  }
}

// ============================================
// HTML Parser
// ============================================

/**
 * Parse the "Còn trống" (remaining slots) value from HTML
 * Examples:
 * - "0" (with red color) -> 0
 * - "5" -> 5
 * - "Hết chỗ" -> 0
 */
function parseRemaining(html: string): number | null {
  // Pattern 1: Number inside a div with color style
  // <span><div style="color: Red">0</div></span>
  const divPattern =
    /Còn trống:\s*<\/td>\s*<td[^>]*>\s*<span>\s*(?:<div[^>]*>)?\s*(\d+)\s*(?:<\/div>)?/i;
  const divMatch = html.match(divPattern);
  if (divMatch) {
    return parseInt(divMatch[1], 10);
  }

  // Pattern 2: Just a number in span
  // <span>5</span>
  const spanPattern = /Còn trống:\s*<\/td>\s*<td[^>]*>\s*<span>\s*(\d+)/i;
  const spanMatch = html.match(spanPattern);
  if (spanMatch) {
    return parseInt(spanMatch[1], 10);
  }

  // Pattern 3: "Hết chỗ" text
  if (/Còn trống:.*Hết chỗ/i.test(html)) {
    return 0;
  }

  return null;
}

/**
 * Parse class name from the page
 * Example: "Lập Trình Ứng Dụng .NET"
 */
function parseClassName(document: any): string | null {
  // Look for the span inside ico-namnganhhoc
  const titleCell = document.querySelector(".ico-namnganhhoc span");
  if (titleCell?.textContent) {
    return titleCell.textContent.trim();
  }

  // Fallback: look in title-1 div
  const title1 = document.querySelector(".title-1");
  if (title1?.textContent) {
    const match = title1.textContent.match(
      /^([A-Z]{2,}\s*\d+)\s*[–-]\s*(.+?)(?:\s*\/|$)/i
    );
    if (match) {
      return match[2].trim();
    }
  }

  return null;
}

/**
 * Parse class code from the page
 * Example: "CS 464" or "CS 403"
 */
function parseClassCode(document: any, html: string): string | null {
  // Try DOM first
  const title1 = document.querySelector(".title-1");
  if (title1?.textContent) {
    // Pattern: "CS 464 – Lập Trình..." or "CS 403 – Công Nghệ..."
    const match = title1.textContent.match(/^([A-Z]{2,}\s*\d+)/i);
    if (match) {
      return match[1].trim();
    }
  }

  // Fallback: regex on raw HTML
  const htmlMatch = html.match(/class="title-1"[^>]*>\s*([A-Z]{2,}\s*\d+)/i);
  if (htmlMatch) {
    return htmlMatch[1].trim();
  }

  return null;
}

/**
 * Parse registration code from the page
 * Example: "CS464202502029"
 */
function parseRegistrationCode(document: any): string | null {
  const cells = document.querySelectorAll("td.td-title");
  for (const cell of cells) {
    if (cell.textContent?.includes("Mã đăng ký:")) {
      const nextCell = cell.nextElementSibling as any;
      const span = nextCell?.querySelector("span");
      if (span?.textContent) {
        return span.textContent.trim();
      }
    }
  }
  return null;
}

/**
 * Parse semester from the page
 * Example: "Học Kỳ II"
 */
function parseSemester(document: any): string | null {
  const cells = document.querySelectorAll("td.td-title");
  for (const cell of cells) {
    if (cell.textContent?.includes("Học kỳ:")) {
      const nextCell = cell.nextElementSibling as any;
      const span = nextCell?.querySelector("span");
      if (span?.textContent) {
        return span.textContent.trim();
      }
    }
  }
  return null;
}

/**
 * Parse schedule from the page
 * Example: "Thứ 3 - 09:15 AM-11:15 AM, Thứ 6 - 09:15 AM-11:15 AM"
 */
function parseSchedule(document: any, html: string): string | null {
  // Try DOM first
  const scheduleList = document.querySelector("ul.thugio");
  if (scheduleList) {
    const items = scheduleList.querySelectorAll("li");
    const schedules: string[] = [];
    for (const item of items) {
      const text = item.textContent?.trim();
      if (text) {
        // Clean up the text
        schedules.push(text.replace(/\s+/g, " "));
      }
    }
    if (schedules.length > 0) {
      return schedules.join(", ");
    }
  }

  // Fallback: regex on raw HTML for schedule items
  const scheduleMatch = html.match(/<ul class="thugio">([\s\S]*?)<\/ul>/i);
  if (scheduleMatch) {
    const liMatches = scheduleMatch[1].match(/<li>([\s\S]*?)<\/li>/gi);
    if (liMatches) {
      const schedules = liMatches
        .map((li) => {
          return li
            .replace(/<\/?li>/gi, "")
            .replace(/&nbsp;/g, " ")
            .replace(/<[^>]+>/g, "")
            .replace(/\s+/g, " ")
            .trim();
        })
        .filter((s) => s.length > 0);
      if (schedules.length > 0) {
        return schedules.join(", ");
      }
    }
  }

  return null;
}

/**
 * Parse registration status from the page
 * Example: "Còn Hạn Đăng Ký"
 */
function parseRegistrationStatus(document: any): string | null {
  const cells = document.querySelectorAll("td.td-title");
  for (const cell of cells) {
    if (cell.textContent?.includes("Tình trạng đăng ký:")) {
      const nextCell = cell.nextElementSibling as any;
      const font = nextCell?.querySelector("font");
      if (font?.textContent) {
        return font.textContent.trim();
      }
      // Fallback to direct text
      if (nextCell?.textContent) {
        return nextCell.textContent.trim();
      }
    }
  }
  return null;
}

// ============================================
// Main Parser Function
// ============================================
export function parseClassHtml(html: string): ParsedClassInfo {
  try {
    // Parse remaining using regex (more reliable for this specific field)
    const remaining = parseRemaining(html);

    // Parse DOM for other fields
    const { document } = parseHTML(html);

    return {
      remaining,
      className: parseClassName(document),
      classCode: parseClassCode(document, html),
      registrationCode: parseRegistrationCode(document),
      semester: parseSemester(document),
      schedule: parseSchedule(document, html),
      registrationStatus: parseRegistrationStatus(document),
      parseError:
        remaining === null ? 'Không tìm thấy trường "Còn trống"' : null,
    };
  } catch (error) {
    console.error("Parse error:", error);
    return {
      remaining: null,
      className: null,
      classCode: null,
      registrationCode: null,
      semester: null,
      schedule: null,
      registrationStatus: null,
      parseError:
        error instanceof Error ? error.message : "Unknown parse error",
    };
  }
}

// ============================================
// Fetch and Parse
// ============================================
export async function fetchAndParseClass(
  url: string
): Promise<ParsedClassInfo> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return {
        remaining: null,
        className: null,
        classCode: null,
        registrationCode: null,
        semester: null,
        schedule: null,
        registrationStatus: null,
        parseError: `HTTP error: ${response.status}`,
      };
    }

    const html = await response.text();
    return parseClassHtml(html);
  } catch (error) {
    console.error("Fetch error:", error);
    return {
      remaining: null,
      className: null,
      classCode: null,
      registrationCode: null,
      semester: null,
      schedule: null,
      registrationStatus: null,
      parseError: error instanceof Error ? error.message : "Fetch failed",
    };
  }
}
