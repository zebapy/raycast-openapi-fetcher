import { LocalStorage } from "@raycast/api";

const TOKEN_PREFIX = "api-token-";

/**
 * Save an API token securely for a spec
 * Note: Using LocalStorage with a prefix. For true secure storage,
 * you could use the system keychain via @raycast/utils useSecureStorage hook
 * in a component context, but for simplicity we use LocalStorage here.
 */
export async function setToken(specId: string, token: string): Promise<void> {
  await LocalStorage.setItem(`${TOKEN_PREFIX}${specId}`, token);
}

/**
 * Get an API token for a spec
 */
export async function getToken(specId: string): Promise<string | undefined> {
  const token = await LocalStorage.getItem<string>(`${TOKEN_PREFIX}${specId}`);
  return token || undefined;
}

/**
 * Delete an API token for a spec
 */
export async function deleteToken(specId: string): Promise<void> {
  await LocalStorage.removeItem(`${TOKEN_PREFIX}${specId}`);
}

/**
 * Check if a token exists for a spec
 */
export async function hasToken(specId: string): Promise<boolean> {
  const token = await getToken(specId);
  return Boolean(token);
}
