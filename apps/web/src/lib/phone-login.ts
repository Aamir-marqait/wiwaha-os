import { normalisePhone } from "@wiwaha/db";

/**
 * Families sign in with their phone number and a 6-digit PIN (D44). Under the
 * hood each phone is an ordinary account with an internal address made from
 * the number (the ".invalid" domain never receives mail), so row-level
 * security, the audit log and portal expiry work exactly as for email logins.
 */
export const PHONE_LOGIN_DOMAIN = "phone.wiwaha.invalid";

export function phoneLoginEmail(phone: string): string | null {
  const e164 = normalisePhone(phone);
  return e164 ? `p${e164.replace(/\D/g, "")}@${PHONE_LOGIN_DOMAIN}` : null;
}

export function isPhoneLogin(email: string | null | undefined): boolean {
  return !!email && email.endsWith(`@${PHONE_LOGIN_DOMAIN}`);
}

/** "+919845012345" from the internal address, for showing to the team. */
export function phoneFromLogin(email: string): string {
  return `+${email.slice(1, email.indexOf("@"))}`;
}
