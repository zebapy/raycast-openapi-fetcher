import { LocalStorage } from "@raycast/api";
import { StoredSpec, OpenAPISpec, RequestHistoryEntry } from "../types/openapi";
import SwaggerParser from "@apidevtools/swagger-parser";

const SPECS_KEY = "openapi-specs";
const SPEC_CACHE_PREFIX = "spec-cache-";
const REQUEST_HISTORY_KEY = "request-history";
const MAX_HISTORY_ENTRIES = 100;

// Generate a unique ID for specs
export function generateSpecId(): string {
  return `spec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Get all stored specs
export async function getSpecs(): Promise<StoredSpec[]> {
  const specsJson = await LocalStorage.getItem<string>(SPECS_KEY);
  if (!specsJson) return [];
  try {
    return JSON.parse(specsJson);
  } catch {
    return [];
  }
}

// Get a single spec by ID
export async function getSpec(id: string): Promise<StoredSpec | undefined> {
  const specs = await getSpecs();
  return specs.find((s) => s.id === id);
}

// Add a new spec
export async function addSpec(spec: Omit<StoredSpec, "id" | "addedAt">, specId?: string): Promise<StoredSpec> {
  const specs = await getSpecs();

  const newSpec: StoredSpec = {
    ...spec,
    id: specId || generateSpecId(),
    addedAt: new Date().toISOString(),
  };

  specs.push(newSpec);
  await LocalStorage.setItem(SPECS_KEY, JSON.stringify(specs));

  return newSpec;
}

// Update an existing spec
export async function updateSpec(id: string, updates: Partial<Omit<StoredSpec, "id">>): Promise<StoredSpec | null> {
  const specs = await getSpecs();
  const index = specs.findIndex((s) => s.id === id);

  if (index === -1) return null;

  specs[index] = { ...specs[index], ...updates };
  await LocalStorage.setItem(SPECS_KEY, JSON.stringify(specs));

  return specs[index];
}

// Duplicate a spec
export async function duplicateSpec(id: string): Promise<StoredSpec | null> {
  const specs = await getSpecs();
  const original = specs.find((s) => s.id === id);

  if (!original) return null;

  const duplicated: StoredSpec = {
    ...original,
    id: generateSpecId(),
    name: `${original.name} (Copy)`,
    addedAt: new Date().toISOString(),
  };

  specs.push(duplicated);
  await LocalStorage.setItem(SPECS_KEY, JSON.stringify(specs));

  return duplicated;
}

// Delete a spec
export async function deleteSpec(id: string): Promise<boolean> {
  const specs = await getSpecs();
  const filtered = specs.filter((s) => s.id !== id);

  if (filtered.length === specs.length) return false;

  await LocalStorage.setItem(SPECS_KEY, JSON.stringify(filtered));
  // Also clear the cached spec content
  await LocalStorage.removeItem(`${SPEC_CACHE_PREFIX}${id}`);

  return true;
}

// Cache a fetched spec
export async function cacheSpec(specId: string, spec: OpenAPISpec): Promise<void> {
  await LocalStorage.setItem(`${SPEC_CACHE_PREFIX}${specId}`, JSON.stringify(spec));
}

// Get cached spec
export async function getCachedSpec(specId: string): Promise<OpenAPISpec | null> {
  const cached = await LocalStorage.getItem<string>(`${SPEC_CACHE_PREFIX}${specId}`);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

// Fetch and optionally cache an OpenAPI spec from URL
// Uses swagger-parser to dereference all $refs
export async function fetchSpec(url: string, specId?: string): Promise<OpenAPISpec> {
  try {
    // SwaggerParser.dereference fetches, parses, and resolves all $refs
    const spec = (await SwaggerParser.dereference(url)) as OpenAPISpec;

    // Validate it looks like an OpenAPI spec
    if (!spec.paths || (!spec.openapi && !spec.swagger)) {
      throw new Error("Invalid OpenAPI specification: missing paths or version field");
    }

    // Cache if we have a spec ID
    if (specId) {
      await cacheSpec(specId, spec);
    }

    return spec;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch/parse spec: ${error.message}`);
    }
    throw new Error("Failed to fetch/parse spec");
  }
}

// Generate a unique ID for request history entries
export function generateHistoryId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Get all request history entries
export async function getRequestHistory(): Promise<RequestHistoryEntry[]> {
  const historyJson = await LocalStorage.getItem<string>(REQUEST_HISTORY_KEY);
  if (!historyJson) return [];
  try {
    return JSON.parse(historyJson);
  } catch {
    return [];
  }
}

// Add a new request to history
export async function addRequestToHistory(entry: Omit<RequestHistoryEntry, "id">): Promise<RequestHistoryEntry> {
  const history = await getRequestHistory();

  const newEntry: RequestHistoryEntry = {
    ...entry,
    id: generateHistoryId(),
  };

  // Add to beginning (most recent first)
  history.unshift(newEntry);

  // Limit history size
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.splice(MAX_HISTORY_ENTRIES);
  }

  await LocalStorage.setItem(REQUEST_HISTORY_KEY, JSON.stringify(history));

  return newEntry;
}

// Delete a request history entry
export async function deleteRequestHistoryEntry(id: string): Promise<boolean> {
  const history = await getRequestHistory();
  const filtered = history.filter((h) => h.id !== id);

  if (filtered.length === history.length) return false;

  await LocalStorage.setItem(REQUEST_HISTORY_KEY, JSON.stringify(filtered));
  return true;
}

// Clear all request history
export async function clearRequestHistory(): Promise<void> {
  await LocalStorage.removeItem(REQUEST_HISTORY_KEY);
}

// Mask sensitive values in headers (like auth tokens)
export function maskSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const masked = { ...headers };
  const sensitiveHeaders = ["authorization", "x-api-key", "api-key", "token", "bearer"];

  for (const key of Object.keys(masked)) {
    if (sensitiveHeaders.some((h) => key.toLowerCase().includes(h))) {
      const value = masked[key];
      if (value.length > 8) {
        masked[key] = value.substring(0, 4) + "****" + value.substring(value.length - 4);
      } else {
        masked[key] = "****";
      }
    }
  }

  return masked;
}
