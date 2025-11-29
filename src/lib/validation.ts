/**
 * Validate URL format
 * @param value - URL string to validate
 * @returns Error message if invalid, undefined if valid
 */
export function validateUrl(value: string | undefined): string | undefined {
  if (!value) {
    return "URL is required";
  }
  try {
    new URL(value);
    return undefined;
  } catch {
    return "Invalid URL format";
  }
}

/**
 * Check if a string is valid URL
 */
export function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate JSON format
 * @param value - JSON string to validate
 * @returns Error message if invalid, undefined if valid
 */
export function validateJson(value: string): string | undefined {
  if (!value.trim()) {
    return undefined;
  }
  try {
    JSON.parse(value);
    return undefined;
  } catch {
    return "Invalid JSON format";
  }
}
