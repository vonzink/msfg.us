import { describe, expect, it, vi, afterEach } from "vitest";
import { GooglePlacesProvider } from "./googlePlaces";

const KEY = "test-key";

afterEach(() => vi.restoreAllMocks());

describe("GooglePlacesProvider.suggest", () => {
  it("maps placePrediction suggestions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        suggestions: [
          { placePrediction: { placeId: "p1", text: { text: "9035 Wadsworth Pkwy, Broomfield, CO" } } },
        ],
      }), { status: 200 }),
    );
    const p = new GooglePlacesProvider(KEY);
    expect(await p.suggest("9035 Wads")).toEqual([{ id: "p1", label: "9035 Wadsworth Pkwy, Broomfield, CO" }]);
  });
  it("returns [] on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const p = new GooglePlacesProvider(KEY);
    expect(await p.suggest("x")).toEqual([]);
  });
});

describe("GooglePlacesProvider.details", () => {
  it("maps addressComponents to StructuredAddress", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        id: "p1",
        addressComponents: [
          { types: ["street_number"], longText: "9035", shortText: "9035" },
          { types: ["route"], longText: "Wadsworth Parkway", shortText: "Wadsworth Pkwy" },
          { types: ["locality"], longText: "Broomfield", shortText: "Broomfield" },
          { types: ["administrative_area_level_1"], longText: "Colorado", shortText: "CO" },
          { types: ["postal_code"], longText: "80021", shortText: "80021" },
        ],
      }), { status: 200 }),
    );
    const p = new GooglePlacesProvider(KEY);
    expect(await p.details("p1")).toEqual({
      line1: "9035 Wadsworth Parkway",
      city: "Broomfield",
      state: "CO",
      zip: "80021",
      placeId: "p1",
    });
  });
});
