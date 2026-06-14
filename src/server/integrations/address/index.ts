import { serverEnv } from "@/lib/env";
import type { AddressProvider } from "./types";
import { GooglePlacesProvider } from "./googlePlaces";

/** The configured address provider, or null when no key is set (→ text field). */
export function getAddressProvider(): AddressProvider | null {
  const key = serverEnv.GOOGLE_PLACES_API_KEY;
  return key ? new GooglePlacesProvider(key) : null;
}
