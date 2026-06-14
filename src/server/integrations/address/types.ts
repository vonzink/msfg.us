import type { StructuredAddress } from "@/lib/leads";

export type AddressSuggestion = {
  /** Provider place id (opaque). */
  id: string;
  /** Human-readable single-line suggestion. */
  label: string;
};

/** Swappable address-autocomplete provider (Google now; Mapbox later). */
export interface AddressProvider {
  suggest(query: string, sessionToken?: string): Promise<AddressSuggestion[]>;
  details(id: string, sessionToken?: string): Promise<StructuredAddress | null>;
}

export type { StructuredAddress };
