import { describe, expect, it } from "vitest";
import { decodePobCode, encodePobCode } from "./codec.js";

describe("PoB codec", () => {
  it("round-trips XML through encode → decode", () => {
    const xml =
      '<PathOfBuilding><Build version="2_1" level="98" className="Sorceress" ascendClassName="Stormweaver" /></PathOfBuilding>';
    const code = encodePobCode(xml);
    expect(code).not.toContain("+");
    expect(code).not.toContain("/");
    expect(decodePobCode(code)).toBe(xml);
  });

  it("handles whitespace in pasted codes", () => {
    const xml = "<PathOfBuilding><Build /></PathOfBuilding>";
    const code = encodePobCode(xml);
    const padded = "  " + code.slice(0, 20) + "\n" + code.slice(20) + "\n\n";
    expect(decodePobCode(padded)).toBe(xml);
  });

  it("rejects empty input", () => {
    expect(() => decodePobCode("")).toThrow();
  });
});
