import { Color } from "@raycast/api";
import { HttpMethod } from "../types/openapi";

/**
 * Get the color for an HTTP method to use in tags and metadata
 */
export function getMethodColor(method: string): Color {
  const colors: Record<string, Color> = {
    GET: Color.Blue,
    POST: Color.Green,
    PUT: Color.Orange,
    PATCH: Color.Yellow,
    DELETE: Color.Red,
    OPTIONS: Color.Purple,
    HEAD: Color.Magenta,
  };
  return colors[method.toUpperCase()] || Color.SecondaryText;
}

/**
 * Alias for getMethodColor - used in tag displays
 */
export function getMethodTagColor(method: HttpMethod): Color {
  return getMethodColor(method);
}
