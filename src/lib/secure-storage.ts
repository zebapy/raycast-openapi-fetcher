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

/**
 * List all stored API tokens with their spec IDs
 */
export async function listAllTokens(): Promise<Array<{ specId: string; token: string }>> {
  const allItems = await LocalStorage.allItems();
  const tokens: Array<{ specId: string; token: string }> = [];

  for (const [key, value] of Object.entries(allItems)) {
    if (key.startsWith(TOKEN_PREFIX) && typeof value === "string") {
      const specId = key.slice(TOKEN_PREFIX.length);
      tokens.push({ specId, token: value });
    }
  }

  return tokens;
}

/**
 * Clear all stored API tokens
 */
export async function clearAllTokens(): Promise<void> {
  const allItems = await LocalStorage.allItems();

  for (const key of Object.keys(allItems)) {
    if (key.startsWith(TOKEN_PREFIX)) {
      await LocalStorage.removeItem(key);
    }
  }
}
