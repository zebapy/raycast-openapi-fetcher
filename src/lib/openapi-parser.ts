import { OpenAPISpec, ParsedEndpoint, HttpMethod, PathItem, Operation, Parameter, Schema } from "../types/openapi";
import SwaggerParser from "@apidevtools/swagger-parser";

const HTTP_METHODS: Array<keyof PathItem> = ["get", "post", "put", "patch", "delete", "options", "head"];

/**
 * Parse and validate a JSON or YAML string as an OpenAPI spec.
 * Also dereferences all $refs so they're resolved inline.
 */
export async function parseAndValidateSpec(content: string): Promise<OpenAPISpec> {
  try {
    // SwaggerParser can parse from a string by using a data URI or by parsing the object
    // First try to parse as JSON/YAML, then dereference
    const parsed = await SwaggerParser.parse(content);
    const spec = (await SwaggerParser.dereference(parsed)) as OpenAPISpec;

    // Validate it looks like an OpenAPI spec
    if (!spec.paths) {
      throw new Error("Invalid OpenAPI specification: missing paths field");
    }

    if (!spec.openapi && !spec.swagger) {
      throw new Error("Invalid OpenAPI specification: missing openapi or swagger version field");
    }

    return spec;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid OpenAPI")) {
      throw error;
    }
    throw new Error("Invalid format: Could not parse the spec content as JSON or YAML");
  }
}

/**
 * Parse an OpenAPI spec and extract all endpoints.
 * Assumes the spec has already been dereferenced (no $refs).
 */
export function parseEndpoints(spec: OpenAPISpec): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = [];

  if (!spec.paths) {
    return endpoints;
  }

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation) {
        endpoints.push(parseOperation(path, method.toUpperCase() as HttpMethod, operation));
      }
    }
  }

  // Sort by path, then by method
  return endpoints.sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) return pathCompare;
    return a.method.localeCompare(b.method);
  });
}

/**
 * Parse a single operation into a ParsedEndpoint
 */
function parseOperation(path: string, method: HttpMethod, operation: Operation): ParsedEndpoint {
  return {
    path,
    method,
    operationId: operation.operationId,
    summary: operation.summary,
    description: operation.description,
    tags: operation.tags || [],
    parameters: operation.parameters || [],
    requestBody: operation.requestBody,
    hasAuth: Boolean(operation.security && operation.security.length > 0),
  };
}

/**
 * Get the base URL from an OpenAPI spec
 */
export function getBaseUrl(spec: OpenAPISpec): string {
  if (spec.servers && spec.servers.length > 0) {
    return spec.servers[0].url;
  }
  // Default fallback
  return "https://api.example.com";
}

/**
 * Group endpoints by tag
 */
export function groupEndpointsByTag(endpoints: ParsedEndpoint[]): Map<string, ParsedEndpoint[]> {
  const grouped = new Map<string, ParsedEndpoint[]>();

  for (const endpoint of endpoints) {
    const tags = endpoint.tags.length > 0 ? endpoint.tags : ["Untagged"];

    for (const tag of tags) {
      const existing = grouped.get(tag) || [];
      existing.push(endpoint);
      grouped.set(tag, existing);
    }
  }

  return grouped;
}

/**
 * Get required parameters for an endpoint
 */
export function getRequiredParams(endpoint: ParsedEndpoint): Parameter[] {
  return endpoint.parameters.filter((p) => p.required);
}

/**
 * Get path parameters for an endpoint
 */
export function getPathParams(endpoint: ParsedEndpoint): Parameter[] {
  return endpoint.parameters.filter((p) => p.in === "path");
}

/**
 * Get query parameters for an endpoint
 */
export function getQueryParams(endpoint: ParsedEndpoint): Parameter[] {
  return endpoint.parameters.filter((p) => p.in === "query");
}

/**
 * Get header parameters for an endpoint
 */
export function getHeaderParams(endpoint: ParsedEndpoint): Parameter[] {
  return endpoint.parameters.filter((p) => p.in === "header");
}

export interface BodyParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  example?: unknown;
}

/**
 * Get formatted type string for a schema
 */
function getSchemaTypeString(schema: Schema): string {
  if (schema.type === "array" && schema.items) {
    const itemType = getSchemaTypeString(schema.items);
    return `${itemType}[]`;
  }

  if (schema.enum) {
    return `enum(${schema.enum.slice(0, 3).join("|")}${schema.enum.length > 3 ? "|..." : ""})`;
  }

  if (schema.format) {
    return `${schema.type || "string"}(${schema.format})`;
  }

  return schema.type || "object";
}

/**
 * Extract body parameters from request body schema.
 * Assumes the spec has been dereferenced (no $refs to resolve).
 */
export function getBodyParams(endpoint: ParsedEndpoint): BodyParameter[] {
  if (!endpoint.requestBody?.content) {
    return [];
  }

  // Try to get schema from application/json first, then any other content type
  const mediaType =
    endpoint.requestBody.content["application/json"] ||
    endpoint.requestBody.content["application/merge-patch+json"] ||
    Object.values(endpoint.requestBody.content)[0];

  if (!mediaType?.schema) {
    return [];
  }

  const schema = mediaType.schema;
  const properties = schema.properties;

  // If no properties but has a type, return a single body parameter representing the whole body
  if (!properties) {
    if (schema.type) {
      return [
        {
          name: "(body)",
          type: getSchemaTypeString(schema),
          required: endpoint.requestBody.required || false,
          description: schema.description,
          example: schema.example ?? mediaType.example,
        },
      ];
    }
    return [];
  }

  const requiredFields = schema.required || [];

  return Object.entries(properties).map(([name, propSchema]) => ({
    name,
    type: getSchemaTypeString(propSchema),
    required: requiredFields.includes(name),
    description: propSchema.description,
    example: propSchema.example ?? propSchema.default,
  }));
}

/**
 * Get the preferred content type for request body
 * Handles application/json, application/merge-patch+json, etc.
 */
export function getRequestBodyContentType(endpoint: ParsedEndpoint): string | null {
  if (!endpoint.requestBody?.content) {
    return null;
  }

  const contentTypes = Object.keys(endpoint.requestBody.content);

  // Prefer these content types in order
  const preferredTypes = [
    "application/json",
    "application/merge-patch+json",
    "application/json-patch+json",
    "text/json",
  ];

  for (const preferred of preferredTypes) {
    if (contentTypes.includes(preferred)) {
      return preferred;
    }
  }

  // Return first available content type if no preferred match
  return contentTypes[0] || null;
}

/**
 * Format endpoint for display
 */
export function formatEndpointTitle(endpoint: ParsedEndpoint): string {
  return endpoint.summary || endpoint.operationId || `${endpoint.method} ${endpoint.path}`;
}

/**
 * Get method color for display
 */
export function getMethodColor(method: HttpMethod): string {
  const colors: Record<HttpMethod, string> = {
    GET: "#61affe",
    POST: "#49cc90",
    PUT: "#fca130",
    PATCH: "#50e3c2",
    DELETE: "#f93e3e",
    OPTIONS: "#0d5aa7",
    HEAD: "#9012fe",
  };
  return colors[method] || "#666";
}
