/**
 * In-memory only. The raw QR credential is never written to AsyncStorage,
 * SecureStore, or any other persistent client store.
 */
const issuedTokens = new Map<string, string>();

export function rememberIssuedRecurringPassQrToken(
  passId: string,
  token: string,
): void {
  issuedTokens.set(passId, token);
}

export function peekIssuedRecurringPassQrToken(passId: string): string | null {
  return issuedTokens.get(passId) ?? null;
}

export function forgetIssuedRecurringPassQrToken(passId: string): void {
  issuedTokens.delete(passId);
}
