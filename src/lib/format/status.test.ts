import { describe, expect, it } from "vitest";
import { statusText } from "./status";

describe("statusText", () => {
  it("joins the tone word and the label, capitalised", () => {
    expect(statusText({ tone: "good", label: "w normie" })).toBe("Dobrze · w normie");
    expect(statusText({ tone: "watch", label: "dane sprzed 40 min" })).toBe("Warto sprawdzić · dane sprzed 40 min");
    expect(statusText({ tone: "problem", label: "rekomendacja z 25 września" })).toBe(
      "Problem · rekomendacja z 25 września",
    );
  });

  it("shows only the tone word when the label is empty", () => {
    expect(statusText({ tone: "insufficient", label: "" })).toBe("Za mało danych");
  });
});
