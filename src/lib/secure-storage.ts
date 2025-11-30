import { LocalStorage } from "@raycast/api";

const TOKEN_PREFIX = "api-token-v2-";

/**
 * Token data structure with name and default spec association
 */
export interface StoredToken {
  id: string; // Unique identifier for the token
  name: string; // User-provided name for the token
  token: string; // The actual token value
  defaultSpecId: string; // The spec this token is auto-used for
  createdAt: string; // ISO timestamp
}

/**
 * Generate a unique token ID
 */
function generateTokenId(): string {
  return `token-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Save a token with name and default spec
 */
export async function saveToken(data: {
  name: string;
  token: string;
  defaultSpecId: string;
  id?: string;
}): Promise<StoredToken> {
  const id = data.id || generateTokenId();
  const storedToken: StoredToken = {
    id,
    name: data.name,
    token: data.token,
    defaultSpecId: data.defaultSpecId,
    createdAt: new Date().toISOString(),
  };
  await LocalStorage.setItem(`${TOKEN_PREFIX}${id}`, JSON.stringify(storedToken));
  return storedToken;
}

/**
 * Get a token by its ID
 */
export async function getTokenById(tokenId: string): Promise<StoredToken | undefined> {
  const data = await LocalStorage.getItem<string>(`${TOKEN_PREFIX}${tokenId}`);
  if (!data) return undefined;
  try {
    return JSON.parse(data) as StoredToken;
  } catch {
    return undefined;
  }
}

/**
 * Get the token for a spec (finds the token with matching defaultSpecId)
 */
export async function getTokenForSpec(specId: string): Promise<string | undefined> {
  const allTokens = await listAllTokens();
  const matchingToken = allTokens.find((t) => t.defaultSpecId === specId);
  return matchingToken?.token;
}

/**
 * Legacy function for backward compatibility - get token by spec ID
 * @deprecated Use getTokenForSpec instead
 */
export async function getToken(specId: string): Promise<string | undefined> {
  return getTokenForSpec(specId);
}

/**
 * Delete a token by its ID
 */
export async function deleteToken(tokenId: string): Promise<void> {
  await LocalStorage.removeItem(`${TOKEN_PREFIX}${tokenId}`);
}

/**
 * Check if a token exists for a spec
 */
export async function hasTokenForSpec(specId: string): Promise<boolean> {
  const token = await getTokenForSpec(specId);
  return Boolean(token);
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use hasTokenForSpec instead
 */
export async function hasToken(specId: string): Promise<boolean> {
  return hasTokenForSpec(specId);
}

/**
 * List all stored tokens
 */
export async function listAllTokens(): Promise<StoredToken[]> {
  const allItems = await LocalStorage.allItems();
  const tokens: StoredToken[] = [];

  for (const [key, value] of Object.entries(allItems)) {
    if (key.startsWith(TOKEN_PREFIX) && typeof value === "string") {
      try {
        const tokenData = JSON.parse(value) as StoredToken;
        tokens.push(tokenData);
      } catch {
        // Skip invalid entries
      }
    }
  }

  // Sort by creation date, newest first
  return tokens.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Update an existing token
 */
export async function updateToken(
  tokenId: string,
  updates: Partial<Pick<StoredToken, "name" | "token" | "defaultSpecId">>,
): Promise<StoredToken | undefined> {
  const existing = await getTokenById(tokenId);
  if (!existing) return undefined;

  const updated: StoredToken = {
    ...existing,
    ...updates,
  };

  await LocalStorage.setItem(`${TOKEN_PREFIX}${tokenId}`, JSON.stringify(updated));
  return updated;
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
