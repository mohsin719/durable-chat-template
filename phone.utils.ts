export function normalizeE164(phone: string): string | null {
  if (typeof phone !== "string") {
    return null;
  }

  const trimmed = phone.trim();
  if (!trimmed) {
    return null;
  }

  let digitsOnly: string;
  if (trimmed.startsWith("+")) {
    digitsOnly = trimmed.slice(1).replace(/\D/g, "");
  } else {
    digitsOnly = trimmed.replace(/\D/g, "");
    // Assume US country code when a local 10-digit number is supplied.
    if (digitsOnly.length === 10) {
      digitsOnly = `1${digitsOnly}`;
    }
  }

  if (!/^[1-9]\d{9,14}$/.test(digitsOnly)) {
    return null;
  }

  return `+${digitsOnly}`;
}
