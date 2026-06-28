import { telDigits } from "@/content/officers";

/**
 * tel:/sms: href builders that refuse to emit a bare "+" for an empty phone.
 * The DB officer projection maps a missing phone to "" (src/server/officers/map.ts),
 * and telDigits("") returns "+", which is a dead deep link. Returning null lets the
 * caller hide/disable the Call/Text channel instead.
 */
export function telHref(phone: string): string | null {
  if (phone.trim() === "") return null;
  return `tel:${telDigits(phone)}`;
}

export function smsHref(phone: string): string | null {
  if (phone.trim() === "") return null;
  return `sms:${telDigits(phone)}`;
}
