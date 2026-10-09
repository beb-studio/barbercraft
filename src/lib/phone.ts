/**
 * Normalizes a phone number to digits and leading +.
 * This is a basic implementation to satisfy the normalizedPhone constraint.
 */
export function normalizePhone(phone: string): string {
  // Extract leading plus if exists, then remove all non-digits
  const hasLeadingPlus = phone.trim().startsWith("+");
  const digitsOnly = phone.replace(/\D/g, "");
  return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}

/**
 * Pure comparison helper used for duplicate candidate detection only.
 * Does not mutate authoritative database fields or change existing normalizePhone rules.
 * Maps formatting variations of the same underlying phone number to a common comparison key.
 */
export function customerPhoneComparisonKey(phone: string): string {
  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");

  if (!digitsOnly) {
    return "";
  }

  // Turkish national number patterns (Turkey country code 90, 10-digit mobile starting with 5)
  // Format 1: +905XXXXXXXXX or 905XXXXXXXXX (digitsOnly starts with 90, length 12)
  if (digitsOnly.length === 12 && digitsOnly.startsWith("905")) {
    return `+90${digitsOnly.slice(2)}`;
  }

  // Format 2: 05XXXXXXXXX (digitsOnly starts with 05, length 11)
  if (digitsOnly.length === 11 && digitsOnly.startsWith("05")) {
    return `+90${digitsOnly.slice(1)}`;
  }

  // Format 3: 5XXXXXXXXX (digitsOnly starts with 5, length 10)
  if (digitsOnly.length === 10 && digitsOnly.startsWith("5")) {
    return `+90${digitsOnly}`;
  }

  // Generic international with leading +: preserve E.164 +digits
  if (trimmed.startsWith("+")) {
    return `+${digitsOnly}`;
  }

  // Generic fallback without +
  return digitsOnly;
}
