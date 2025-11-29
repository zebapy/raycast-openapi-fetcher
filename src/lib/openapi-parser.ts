import { OpenAPISpec, ParsedEndpoint, HttpMethod, PathItem, Operation, Parameter } from "../types/openapi";

const HTTP_METHODS: Array<keyof PathItem> = ["get", "post", "put", "patch", "delete", "options", "head"];

/**
 * Parse and validate a JSON string as an OpenAPI spec
 */
export function parseAndValidateSpec(content: string): OpenAPISpec {
  let spec: OpenAPISpec;

  try {
    spec = JSON.parse(content) as OpenAPISpec;
  } catch {
    throw new Error("Invalid JSON: Could not parse the spec content");
  }

  // Validate it looks like an OpenAPI spec
  if (!spec.paths) {
    throw new Error("Invalid OpenAPI specification: missing paths field");
  }

  if (!spec.openapi && !spec.swagger) {
    throw new Error("Invalid OpenAPI specification: missing openapi or swagger version field");
  }

  return spec;
}

/**
 * Parse an OpenAPI spec and extract all endpoints
 */
export function parseEndpoints(spec: OpenAPISpec): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = [];

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
