import type { StructuredAddress } from "@/lib/leads";
import type { AddressProvider, AddressSuggestion } from "./types";

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_BASE = "https://places.googleapis.com/v1/places/";

type Component = { types: string[]; longText?: string; shortText?: string };

function pick(components: Component[], type: string, prefer: "long" | "short" = "long"): string {
  const c = components.find((x) => x.types.includes(type));
  if (!c) return "";
  return (prefer === "short" ? c.shortText : c.longText) ?? c.longText ?? c.shortText ?? "";
}

/** Google Places API (New) provider. US-biased; address-typed predictions. */
export class GooglePlacesProvider implements AddressProvider {
  constructor(private readonly apiKey: string) {}

  async suggest(query: string, sessionToken?: string): Promise<AddressSuggestion[]> {
    if (query.trim().length < 3) return [];
    try {
      const res = await fetch(AUTOCOMPLETE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey },
        body: JSON.stringify({
          input: query,
          includedRegionCodes: ["us"],
          includedPrimaryTypes: ["street_address", "premise", "subpremise"],
          ...(sessionToken ? { sessionToken } : {}),
        }),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        suggestions?: { placePrediction?: { placeId: string; text?: { text?: string } } }[];
      };
      return (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is { placeId: string; text?: { text?: string } } => Boolean(p?.placeId))
        .map((p) => ({ id: p.placeId, label: p.text?.text ?? "" }));
    } catch {
      return [];
    }
  }

  async details(id: string, sessionToken?: string): Promise<StructuredAddress | null> {
    try {
      const url = new URL(DETAILS_BASE + encodeURIComponent(id));
      if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
      const res = await fetch(url, {
        headers: {
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": "id,addressComponents",
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { id?: string; addressComponents?: Component[] };
      const c = data.addressComponents ?? [];
      const num = pick(c, "street_number");
      const route = pick(c, "route");
      return {
        line1: [num, route].filter(Boolean).join(" "),
        city: pick(c, "locality") || pick(c, "sublocality") || pick(c, "postal_town"),
        state: pick(c, "administrative_area_level_1", "short"),
        zip: pick(c, "postal_code"),
        placeId: data.id ?? id,
      };
    } catch {
      return null;
    }
  }
}
