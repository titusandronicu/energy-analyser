import { describe, expect, it } from "vitest";
import { LOAD_FAILED, statusText } from "./status";

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

describe("LOAD_FAILED", () => {
  it("is a problem that says the card could not load", () => {
    expect(LOAD_FAILED).toEqual({ tone: "problem", label: "nie udało się wczytać" });
    expect(statusText(LOAD_FAILED)).toBe("Problem · nie udało się wczytać");
  });
});
