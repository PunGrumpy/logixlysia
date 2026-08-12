import { describe, expect, test } from "bun:test";
import { sanitizeLogText } from "../../src/utils/sanitize";

describe("sanitizeLogText", () => {
  test("leaves clean text unchanged", () => {
    expect(sanitizeLogText("hello world")).toBe("hello world");
  });

  test("escapes newlines as literal \\n", () => {
    expect(sanitizeLogText("line1\nline2")).toBe("line1\\nline2");
  });

  test("escapes carriage returns as literal \\r", () => {
    expect(sanitizeLogText("line1\rline2")).toBe("line1\\rline2");
  });

  test("escapes tabs as literal \\t", () => {
    expect(sanitizeLogText("a\tb")).toBe("a\\tb");
  });

  test("strips ANSI escape sequences", () => {
    const esc = String.fromCharCode(27);
    expect(sanitizeLogText(`${esc}[31mred`)).toBe("[31mred");
  });

  test("strips NUL bytes", () => {
    const nul = String.fromCharCode(0);
    expect(sanitizeLogText(`a${nul}b`)).toBe("ab");
  });

  test("truncates long strings to maxLength plus ellipsis", () => {
    const longText = "x".repeat(10_000);
    const result = sanitizeLogText(longText);
    expect(result.length).toBe(2049);
    expect(result.startsWith("x".repeat(2048))).toBe(true);
    expect(result.endsWith("…")).toBe(true);
  });

  test("respects a custom maxLength", () => {
    const result = sanitizeLogText("abcdefghij", 5);
    expect(result).toBe("abcde…");
  });
});
