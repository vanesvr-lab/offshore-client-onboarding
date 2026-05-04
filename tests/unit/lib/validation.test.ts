import { describe, it, expect } from "vitest";
import {
  isRequired,
  isMinLength,
  isMaxLength,
  isEmail,
  isPhone,
  isISODate,
  runAll,
} from "@/lib/validation";

describe("isRequired", () => {
  it("rejects null", () => {
    const r = isRequired(null);
    expect(r).toEqual({ valid: false, message: "This field is required." });
  });

  it("rejects undefined", () => {
    expect(isRequired(undefined)).toEqual({ valid: false, message: "This field is required." });
  });

  it("rejects empty string", () => {
    expect(isRequired("")).toEqual({ valid: false, message: "This field is required." });
  });

  it("rejects whitespace-only string", () => {
    expect(isRequired("   \t  ")).toEqual({ valid: false, message: "This field is required." });
  });

  it("accepts a non-empty string", () => {
    expect(isRequired("hello")).toEqual({ valid: true });
  });

  it("uses the custom label in the message", () => {
    const r = isRequired("", "Email");
    expect(r).toEqual({ valid: false, message: "Email is required." });
  });

  it("accepts non-string truthy values (numbers, objects)", () => {
    expect(isRequired(0)).toEqual({ valid: true });
    expect(isRequired({})).toEqual({ valid: true });
  });
});

describe("isMinLength", () => {
  it("rejects strings shorter than min (one short)", () => {
    expect(isMinLength("abc", 4)).toEqual({
      valid: false,
      message: "This field must be at least 4 characters.",
    });
  });

  it("accepts strings exactly at min", () => {
    expect(isMinLength("abcd", 4)).toEqual({ valid: true });
  });

  it("accepts strings longer than min", () => {
    expect(isMinLength("abcdef", 4)).toEqual({ valid: true });
  });

  it("trims whitespace before measuring", () => {
    expect(isMinLength("  ab  ", 3)).toEqual({
      valid: false,
      message: "This field must be at least 3 characters.",
    });
  });

  it("uses the custom label", () => {
    const r = isMinLength("", 5, "Password");
    expect(r).toEqual({
      valid: false,
      message: "Password must be at least 5 characters.",
    });
  });
});

describe("isMaxLength", () => {
  it("rejects strings one over max", () => {
    expect(isMaxLength("abcdef", 5)).toEqual({
      valid: false,
      message: "This field must be 5 characters or fewer.",
    });
  });

  it("accepts strings exactly at max", () => {
    expect(isMaxLength("abcde", 5)).toEqual({ valid: true });
  });

  it("accepts strings shorter than max", () => {
    expect(isMaxLength("a", 5)).toEqual({ valid: true });
  });

  it("uses the custom label", () => {
    const r = isMaxLength("toolong", 3, "Code");
    expect(r).toEqual({
      valid: false,
      message: "Code must be 3 characters or fewer.",
    });
  });
});

describe("isEmail", () => {
  it("returns OK for empty string (not required)", () => {
    expect(isEmail("")).toEqual({ valid: true });
  });

  it.each(["a@b.co", "name+tag@example.com", "first.last@sub.example.io"])(
    "accepts valid form %s",
    (input) => {
      expect(isEmail(input)).toEqual({ valid: true });
    },
  );

  it.each(["a@", "a.b", "no-at-sign.com", "no@tld", " spaces in@email.com"])(
    "rejects invalid form %s",
    (input) => {
      expect(isEmail(input)).toEqual({
        valid: false,
        message: "Enter a valid email like name@example.com.",
      });
    },
  );

  it("trims input before validating", () => {
    expect(isEmail("  a@b.co  ")).toEqual({ valid: true });
  });
});

describe("isPhone", () => {
  it("returns OK for empty string", () => {
    expect(isPhone("")).toEqual({ valid: true });
  });

  it.each(["+230 555 0000", "(555) 123-4567", "+1-202-555-0123"])(
    "accepts valid form %s",
    (input) => {
      expect(isPhone(input)).toEqual({ valid: true });
    },
  );

  it("rejects strings with alpha characters", () => {
    expect(isPhone("call me")).toEqual({
      valid: false,
      message: "Enter a valid phone number, e.g. +230 555 0000.",
    });
  });

  it("rejects strings with fewer than 6 digits", () => {
    expect(isPhone("12345")).toEqual({
      valid: false,
      message: "Enter a valid phone number, e.g. +230 555 0000.",
    });
  });
});

describe("isISODate", () => {
  it("returns OK for empty string", () => {
    expect(isISODate("")).toEqual({ valid: true });
  });

  it("accepts valid ISO date 2026-04-21", () => {
    expect(isISODate("2026-04-21")).toEqual({ valid: true });
  });

  it("rejects US-style format 04/21/2026", () => {
    expect(isISODate("04/21/2026")).toEqual({
      valid: false,
      message: "Enter a date in YYYY-MM-DD format.",
    });
  });

  it("rejects unreal calendar dates 2026-13-32", () => {
    const r = isISODate("2026-13-32");
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.message).toMatch(/calendar date/);
    }
  });
});

describe("runAll", () => {
  it("returns OK when every check passes", () => {
    expect(
      runAll([
        () => ({ valid: true } as const),
        () => ({ valid: true } as const),
      ]),
    ).toEqual({ valid: true });
  });

  it("returns the first failing result", () => {
    const r = runAll([
      () => ({ valid: true } as const),
      () => ({ valid: false, message: "first failure" } as const),
      () => ({ valid: false, message: "second failure" } as const),
    ]);
    expect(r).toEqual({ valid: false, message: "first failure" });
  });

  it("calls checks in order and short-circuits on the first failure", () => {
    const calls: string[] = [];
    const r = runAll([
      () => {
        calls.push("a");
        return { valid: true } as const;
      },
      () => {
        calls.push("b");
        return { valid: false, message: "stop" } as const;
      },
      () => {
        calls.push("c");
        return { valid: true } as const;
      },
    ]);
    expect(r).toEqual({ valid: false, message: "stop" });
    expect(calls).toEqual(["a", "b"]);
  });
});
