import { describe, expect, it } from "vitest";
import {
  KORIX_PRIMARY_VIEW,
  KORIX_SECONDARY_VIEW,
  getKorixViewTarget,
  supportsSecondarySidebar,
} from "./viewTarget";

describe("Korix view target", () => {
  it("should use primary sidebar before secondary sidebar support", () => {
    expect(supportsSecondarySidebar("1.105.2")).toBe(false);
    expect(getKorixViewTarget("1.105.2")).toEqual(KORIX_PRIMARY_VIEW);
  });

  it("should use secondary sidebar when VS Code supports it", () => {
    expect(supportsSecondarySidebar("1.106.0")).toBe(true);
    expect(getKorixViewTarget("1.121.0-insider")).toEqual(
      KORIX_SECONDARY_VIEW,
    );
  });

  it("should fall back to primary sidebar for unparsable versions", () => {
    expect(supportsSecondarySidebar("dev")).toBe(false);
    expect(getKorixViewTarget("dev")).toEqual(KORIX_PRIMARY_VIEW);
  });
});
