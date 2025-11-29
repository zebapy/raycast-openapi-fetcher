import { ParsedEndpoint } from "../types/openapi";
import { getPathParams, getQueryParams, getHeaderParams, getRequestBodyContentType } from "./openapi-parser";

export interface CurlOptions {
  baseUrl: string;
  authToken?: string;
  authType?: "bearer" | "api-key" | "basic";
  authHeader?: string; // Custom header name for API key auth
  includeExampleBody?: boolean;
  paramValues?: Record<string, string>; // Actual values for parameters
  bodyJson?: string; // Custom JSON body for the request
}

/**
 * Generate a cURL command for an endpoint
 */
export function generateCurl(endpoint: ParsedEndpoint, options: CurlOptions): string {
  const { baseUrl, authToken, authType = "bearer", authHeader = "X-API-Key", paramValues = {} } = options;

  const parts: string[] = ["curl"];

  // Add method (skip for GET as it's default)
  if (endpoint.method !== "GET") {
    parts.push(`-X ${endpoint.method}`);
  }

  // Build the URL with path parameters
  let url = `${baseUrl}${endpoint.path}`;
  const pathParams = getPathParams(endpoint);
  for (const param of pathParams) {
    const value = paramValues[param.name];
    if (value) {
      url = url.replace(`{${param.name}}`, encodeURIComponent(value));
    } else {
      url = url.replace(`{${param.name}}`, `{${param.name}}`);
    }
  }

  // Add query parameters - only include those with values or required ones
  const queryParams = getQueryParams(endpoint);
  const queryParts: string[] = [];
  for (const param of queryParams) {
    const value = paramValues[param.name];
    if (value) {
      queryParts.push(`${param.name}=${encodeURIComponent(value)}`);
    } else if (param.required) {
      queryParts.push(`${param.name}={${param.name}}`);
    }
    // Skip optional params without values
  }
  if (queryParts.length > 0) {
    url += `?${queryParts.join("&")}`;
  }

  // Add auth header
  if (authToken) {
    switch (authType) {
      case "bearer":
        parts.push(`-H "Authorization: Bearer ${authToken}"`);
        break;
      case "api-key":
        parts.push(`-H "${authHeader}: ${authToken}"`);
        break;
      case "basic":
        parts.push(`-H "Authorization: Basic ${authToken}"`);
        break;
    }
  } else if (endpoint.hasAuth) {
    // Add placeholder for auth
    parts.push('-H "Authorization: Bearer <YOUR_TOKEN>"');
  }

  // Add custom header parameters - only include those with values or required ones
  const headerParams = getHeaderParams(endpoint);
  for (const param of headerParams) {
    const value = paramValues[param.name];
    if (value) {
      parts.push(`-H "${param.name}: ${value}"`);
    } else if (param.required) {
      parts.push(`-H "${param.name}: {${param.name}}"`);
    }
  }

  // Add Content-Type for requests with body (use spec-defined content type or default to application/json)
  if (endpoint.requestBody && ["POST", "PUT", "PATCH"].includes(endpoint.method)) {
    const contentType = getRequestBodyContentType(endpoint) || "application/json";
    parts.push(`-H "Content-Type: ${contentType}"`);

    // Use custom body JSON if provided, otherwise use example or placeholder
    if (options.bodyJson) {
      // Escape single quotes in the JSON for shell safety
      const escapedBody = options.bodyJson.replace(/'/g, "'\\''");
      parts.push(`-d '${escapedBody}'`);
    } else if (options.includeExampleBody) {
      const exampleBody = generateExampleBody(endpoint);
      parts.push(`-d '${exampleBody}'`);
    } else {
      parts.push("-d '<REQUEST_BODY>'");
    }
  }

  // Add the URL (quoted to handle special chars)
  parts.push(`"${url}"`);

  return parts.join(" \\\n  ");
}

/**
 * Generate a simple example request body based on the endpoint's requestBody schema
 */
function generateExampleBody(endpoint: ParsedEndpoint): string {
  if (!endpoint.requestBody?.content) {
    return "{}";
  }

  const jsonContent = endpoint.requestBody.content["application/json"];
  if (!jsonContent?.schema) {
    return "{}";
  }

  const schema = jsonContent.schema;

  // Generate a simple example object
  if (schema.type === "object" && schema.properties) {
    const example: Record<string, unknown> = {};

    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.example !== undefined) {
        example[key] = prop.example;
      } else if (prop.default !== undefined) {
        example[key] = prop.default;
      } else {
        example[key] = getDefaultValue(prop.type, prop.format);
      }
    }

    return JSON.stringify(example, null, 2);
  }

  return "{}";
}

/**
 * Get a default placeholder value for a schema type
 */
function getDefaultValue(type?: string, format?: string): unknown {
  switch (type) {
    case "string":
      if (format === "email") return "user@example.com";
      if (format === "date") return "2024-01-01";
      if (format === "date-time") return "2024-01-01T00:00:00Z";
      if (format === "uuid") return "00000000-0000-0000-0000-000000000000";
      return "string";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return null;
  }
}

/**
 * Generate a compact single-line cURL for quick copy
 */
export function generateCompactCurl(endpoint: ParsedEndpoint, options: CurlOptions): string {
  const fullCurl = generateCurl(endpoint, options);
  return fullCurl.replace(/\s*\\\n\s*/g, " ");
}
