// Types for OpenAPI specification structures
// We use our own simplified types because:
// 1. After dereferencing, $refs are resolved so we don't need ReferenceObject unions
// 2. We primarily support OpenAPI v3, not the full v2/v3/v3.1 union
// 3. Our types are simpler and more ergonomic for our use cases

export interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    description?: string;
    version: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths?: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, Schema>;
    securitySchemes?: Record<string, unknown>;
  };
}

export interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  options?: Operation;
  head?: Operation;
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  security?: SecurityRequirement[];
}

export interface Parameter {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  description?: string;
  required?: boolean;
  schema?: Schema;
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, MediaType>;
}

export interface MediaType {
  schema?: Schema;
  example?: unknown;
}

export interface Schema {
  type?: string;
  format?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  example?: unknown;
  description?: string;
  // After dereferencing, these should be resolved, but keeping for compatibility
  $ref?: string;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
}

export interface Response {
  description?: string;
  content?: Record<string, MediaType>;
}

export interface SecurityRequirement {
  [name: string]: string[];
}

// Types for stored spec metadata

export interface StoredSpec {
  id: string;
  name: string;
  url: string;
  addedAt: string;
  baseUrl?: string;
  docsUrlTemplate?: string; // Template URL with {operationId} placeholder, e.g. "https://docs.example.com/api/{operationId}"
}

// Types for parsed endpoints

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export interface ParsedEndpoint {
  path: string;
  method: HttpMethod;
  operationId?: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: Parameter[];
  requestBody?: RequestBody;
  hasAuth: boolean;
}

// Types for request history

export interface RequestHistoryEntry {
  id: string;
  specId: string;
  specName: string;
  method: HttpMethod;
  path: string;
  url: string;
  headers: Record<string, string>; // Auth token value will be masked
  body?: string;
  timestamp: string;
  response: {
    status: number;
    statusText: string;
    body: string;
    contentType: string;
  };
}
