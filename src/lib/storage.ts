import { LocalStorage } from "@raycast/api";
import { StoredSpec, OpenAPISpec } from "../types/openapi";

const SPECS_KEY = "openapi-specs";
const SPEC_CACHE_PREFIX = "spec-cache-";

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
export async function fetchSpec(url: string, specId?: string): Promise<OpenAPISpec> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("yaml") || url.endsWith(".yaml") || url.endsWith(".yml")) {
    // For YAML specs, we'd need a YAML parser - for now, assume JSON
    throw new Error("YAML specs are not supported yet. Please use a JSON spec URL.");
  }

  const spec: OpenAPISpec = (await response.json()) as OpenAPISpec;

  // Validate it looks like an OpenAPI spec
  if (!spec.paths || (!spec.openapi && !spec.swagger)) {
    throw new Error("Invalid OpenAPI specification: missing paths or version field");
  }

  // Cache if we have a spec ID
  if (specId) {
    await cacheSpec(specId, spec);
  }

  return spec;
}
