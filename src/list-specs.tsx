import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  deleteSpec,
  duplicateSpec,
  fetchSpec,
  getCachedSpec,
  getSpecs,
  updateSpec,
  addRequestToHistory,
  maskSensitiveHeaders,
} from "./lib/storage";
import { formatEndpointTitle, getMethodColor, groupEndpointsByTag, parseEndpoints } from "./lib/openapi-parser";
import { generateCompactCurl, CurlOptions, generateCurl } from "./lib/curl-generator";
import { StoredSpec, OpenAPISpec, ParsedEndpoint } from "./types/openapi";
import { getToken, hasToken } from "./lib/secure-storage";
import AddOpenAPISpec from "./add-openapi-spec";
import { getPathParams, getQueryParams, getHeaderParams } from "./lib/openapi-parser";

export default function ListSpecs() {
  const [specs, setSpecs] = useState<StoredSpec[]>([]);
  const [specsWithToken, setSpecsWithToken] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  async function loadSpecs() {
    setIsLoading(true);
    const loadedSpecs = await getSpecs();
    setSpecs(loadedSpecs);

    // Check which specs have tokens
    const tokenSet = new Set<string>();
    for (const spec of loadedSpecs) {
      if (await hasToken(spec.id)) {
        tokenSet.add(spec.id);
      }
    }
    setSpecsWithToken(tokenSet);

    setIsLoading(false);
  }

  useEffect(() => {
    loadSpecs();
  }, []);

  async function handleDelete(spec: StoredSpec) {
    const confirmed = await confirmAlert({
      title: "Delete Spec",
      message: `Are you sure you want to delete "${spec.name}"?`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      await deleteSpec(spec.id);
      await loadSpecs();
      await showToast({
        style: Toast.Style.Success,
        title: "Spec deleted",
      });
    }
  }

  async function handleDuplicate(spec: StoredSpec) {
    const duplicated = await duplicateSpec(spec.id);
    if (duplicated) {
      await loadSpecs();
      await showToast({
        style: Toast.Style.Success,
        title: "Spec duplicated",
        message: duplicated.name,
      });
    }
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search API specs...">
      {specs.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No API Specs"
          description="Add an OpenAPI specification to get started"
          actions={
            <ActionPanel>
              <Action.Push title="Add Spec" target={<AddOpenAPISpec />} icon={Icon.Plus} />
            </ActionPanel>
          }
        />
      ) : (
        specs.map((spec) => (
          <List.Item
            key={spec.id}
            title={spec.name}
            subtitle={spec.baseUrl}
            accessories={[
              specsWithToken.has(spec.id)
                ? { icon: Icon.Key, tooltip: "Token Set", tag: { value: "Auth", color: Color.Green } }
                : { tag: { value: "No Auth", color: Color.SecondaryText } },
              { date: new Date(spec.addedAt), tooltip: "Added" },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Browse Endpoints"
                  target={<BrowseEndpoints spec={spec} onTokenChange={loadSpecs} />}
                  icon={Icon.List}
                />
                <Action.Push
                  title="Set API Token"
                  target={<SetTokenForm specId={spec.id} specName={spec.name} onSave={loadSpecs} />}
                  icon={Icon.Key}
                  shortcut={{ modifiers: ["cmd"], key: "t" }}
                />
                <Action.Push
                  title="Edit Spec"
                  target={<EditSpecForm spec={spec} onSave={loadSpecs} />}
                  icon={Icon.Pencil}
                  shortcut={{ modifiers: ["cmd"], key: "e" }}
                />
                <Action.Push title="Add New Spec" target={<AddOpenAPISpec />} icon={Icon.Plus} />
                <Action.OpenInBrowser title="Open Spec URL" url={spec.url} />
                <Action
                  title="Duplicate Spec"
                  icon={Icon.CopyClipboard}
                  shortcut={{ modifiers: ["cmd"], key: "d" }}
                  onAction={() => handleDuplicate(spec)}
                />
                <Action
                  title="Delete Spec"
                  style={Action.Style.Destructive}
                  icon={Icon.Trash}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={() => handleDelete(spec)}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

interface BrowseEndpointsProps {
  spec: StoredSpec;
  onTokenChange?: () => void;
  initialSearchText?: string;
}

export function BrowseEndpoints({ spec, onTokenChange, initialSearchText }: BrowseEndpointsProps) {
  const [openApiSpec, setOpenApiSpec] = useState<OpenAPISpec | null>(null);
  const [endpoints, setEndpoints] = useState<ParsedEndpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | undefined>();
  const [searchText, setSearchText] = useState(initialSearchText || "");
  const { push } = useNavigation();

  useEffect(() => {
    async function load() {
      setIsLoading(true);

      try {
        // Try cache first, then fetch
        let loadedSpec = await getCachedSpec(spec.id);

        if (!loadedSpec) {
          await showToast({
            style: Toast.Style.Animated,
            title: "Fetching spec...",
          });
          loadedSpec = await fetchSpec(spec.url, spec.id);
        }

        setOpenApiSpec(loadedSpec);
        setEndpoints(parseEndpoints(loadedSpec));

        // Load token if available
        const savedToken = await getToken(spec.id);
        setToken(savedToken);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to load spec",
          message,
        });
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [spec.id, spec.url]);

  const groupedEndpoints = groupEndpointsByTag(endpoints);

  function getCurlOptions(): CurlOptions {
    return {
      baseUrl: spec.baseUrl || openApiSpec?.servers?.[0]?.url || "https://api.example.com",
      authToken: token,
      authType: "bearer",
      includeExampleBody: true,
    };
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search endpoints..."
      navigationTitle={spec.name}
      searchText={searchText}
      onSearchTextChange={setSearchText}
    >
      {Array.from(groupedEndpoints.entries()).map(([tag, tagEndpoints]) => (
        <List.Section key={tag} title={tag} subtitle={`${tagEndpoints.length} endpoints`}>
          {tagEndpoints.map((endpoint) => (
            <List.Item
              key={`${endpoint.method}-${endpoint.path}`}
              title={formatEndpointTitle(endpoint)}
              subtitle={endpoint.path}
              icon={{ source: Icon.Circle, tintColor: getMethodColor(endpoint.method) }}
              accessories={[
                {
                  tag: {
                    value: endpoint.method,
                    color: getMethodColorTag(endpoint.method),
                  },
                },
                endpoint.hasAuth ? { icon: Icon.Lock, tooltip: "Requires Auth" } : {},
              ]}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard
                    title="Copy as Curl"
                    content={generateCompactCurl(endpoint, getCurlOptions())}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                  <Action.Push
                    title="Build Request"
                    target={
                      <RequestForm
                        endpoint={endpoint}
                        curlOptions={getCurlOptions()}
                        specId={spec.id}
                        specName={spec.name}
                      />
                    }
                    icon={Icon.Wand}
                    shortcut={{ modifiers: ["cmd"], key: "b" }}
                  />
                  <Action.Push
                    title="View Details"
                    target={<EndpointDetail endpoint={endpoint} curlOptions={getCurlOptions()} />}
                    icon={Icon.Eye}
                  />
                  <Action
                    title="Set API Token"
                    icon={Icon.Key}
                    shortcut={{ modifiers: ["cmd"], key: "t" }}
                    onAction={() => {
                      push(
                        <SetTokenForm
                          specId={spec.id}
                          specName={spec.name}
                          onSave={(newToken) => {
                            setToken(newToken);
                            onTokenChange?.();
                          }}
                        />,
                      );
                    }}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}

interface EndpointDetailProps {
  endpoint: ParsedEndpoint;
  curlOptions: CurlOptions;
}

function EndpointDetail({ endpoint, curlOptions }: EndpointDetailProps) {
  const curl = generateCompactCurl(endpoint, curlOptions);

  const markdown = `
# ${endpoint.method} ${endpoint.path}

${endpoint.summary || ""}

${endpoint.description || ""}

## cURL Command

\`\`\`bash
${curl}
\`\`\`

## Parameters

${
  endpoint.parameters.length > 0
    ? endpoint.parameters
        .map((p) => `- **${p.name}** (${p.in})${p.required ? " *required*" : ""}: ${p.description || "No description"}`)
        .join("\n")
    : "No parameters"
}

${endpoint.hasAuth ? "\n⚠️ **This endpoint requires authentication**" : ""}
  `.trim();

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy as Curl" content={curl} />
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Method" text={endpoint.method} />
          <Detail.Metadata.Label title="Path" text={endpoint.path} />
          {endpoint.operationId && <Detail.Metadata.Label title="Operation ID" text={endpoint.operationId} />}
          <Detail.Metadata.Separator />
          <Detail.Metadata.TagList title="Tags">
            {endpoint.tags.map((tag) => (
              <Detail.Metadata.TagList.Item key={tag} text={tag} color={Color.Blue} />
            ))}
          </Detail.Metadata.TagList>
        </Detail.Metadata>
      }
    />
  );
}

import { Detail, Form, Clipboard } from "@raycast/api";
import { setToken } from "./lib/secure-storage";

interface RequestFormProps {
  endpoint: ParsedEndpoint;
  curlOptions: CurlOptions;
  specId: string;
  specName: string;
}

function RequestForm({ endpoint, curlOptions, specId, specName }: RequestFormProps) {
  const { pop } = useNavigation();
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [bodyJson, setBodyJson] = useState<string>("");
  const [bodyError, setBodyError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const pathParams = getPathParams(endpoint);
  const queryParams = getQueryParams(endpoint);
  const headerParams = getHeaderParams(endpoint);

  const hasBody = endpoint.requestBody && ["POST", "PUT", "PATCH"].includes(endpoint.method);
  const allParams = [...pathParams, ...queryParams, ...headerParams];

  function updateParam(name: string, value: string) {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  }

  function validateJson(value: string) {
    if (!value.trim()) {
      setBodyError(undefined);
      return;
    }
    try {
      JSON.parse(value);
      setBodyError(undefined);
    } catch {
      setBodyError("Invalid JSON format");
    }
  }

  function getCurlWithValues(): string {
    return generateCurl(endpoint, {
      ...curlOptions,
      paramValues,
      bodyJson: bodyJson.trim() || undefined,
    });
  }

  function buildRequestUrl(): string {
    let url = `${curlOptions.baseUrl}${endpoint.path}`;

    // Replace path parameters
    for (const param of pathParams) {
      const value = paramValues[param.name];
      if (value) {
        url = url.replace(`{${param.name}}`, encodeURIComponent(value));
      }
    }

    // Add query parameters
    const queryParts: string[] = [];
    for (const param of queryParams) {
      const value = paramValues[param.name];
      if (value) {
        queryParts.push(`${param.name}=${encodeURIComponent(value)}`);
      }
    }
    if (queryParts.length > 0) {
      url += `?${queryParts.join("&")}`;
    }

    return url;
  }

  async function executeRequest() {
    // Validate body JSON if provided
    if (bodyJson.trim()) {
      try {
        JSON.parse(bodyJson);
      } catch {
        await showToast({
          style: Toast.Style.Failure,
          title: "Invalid JSON",
          message: "Please fix the request body JSON",
        });
        return;
      }
    }

    setIsLoading(true);
    setResponse(null);

    try {
      const url = buildRequestUrl();
      const headers: Record<string, string> = {};

      // Add auth header
      if (curlOptions.authToken) {
        switch (curlOptions.authType) {
          case "bearer":
            headers["Authorization"] = `Bearer ${curlOptions.authToken}`;
            break;
          case "api-key":
            headers[curlOptions.authHeader || "X-API-Key"] = curlOptions.authToken;
            break;
          case "basic":
            headers["Authorization"] = `Basic ${curlOptions.authToken}`;
            break;
        }
      }

      // Add custom header parameters
      for (const param of headerParams) {
        const value = paramValues[param.name];
        if (value) {
          headers[param.name] = value;
        }
      }

      // Add Content-Type for body requests
      if (hasBody) {
        headers["Content-Type"] = "application/json";
      }

      const fetchOptions: RequestInit = {
        method: endpoint.method,
        headers,
      };

      if (hasBody && bodyJson.trim()) {
        fetchOptions.body = bodyJson.trim();
      }

      const res = await fetch(url, fetchOptions);
      const contentType = res.headers.get("content-type") || "";

      let responseText: string;
      if (contentType.includes("application/json")) {
        const json = await res.json();
        responseText = JSON.stringify(json, null, 2);
      } else {
        responseText = await res.text();
      }

      // Save to request history (with masked headers)
      await addRequestToHistory({
        specId,
        specName,
        method: endpoint.method,
        path: endpoint.path,
        url,
        headers: maskSensitiveHeaders(headers),
        body: hasBody && bodyJson.trim() ? bodyJson.trim() : undefined,
        timestamp: new Date().toISOString(),
        response: {
          status: res.status,
          statusText: res.statusText,
          body: responseText,
          contentType,
        },
      });

      const statusEmoji = res.ok ? "✅" : "❌";
      setResponse(`${statusEmoji} Status: ${res.status} ${res.statusText}\n\n${responseText}`);

      await showToast({
        style: res.ok ? Toast.Style.Success : Toast.Style.Failure,
        title: `${res.status} ${res.statusText}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setResponse(`❌ Error: ${message}`);
      await showToast({
        style: Toast.Style.Failure,
        title: "Request failed",
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy() {
    const curl = getCurlWithValues();
    await Clipboard.copy(curl);
    await showToast({
      style: Toast.Style.Success,
      title: "Copied to clipboard",
    });
    pop();
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={`${endpoint.method} ${endpoint.path}`}
      actions={
        <ActionPanel>
          <Action title="Execute Request" onAction={executeRequest} icon={Icon.Play} />
          <Action
            title="Copy as Curl"
            onAction={handleCopy}
            icon={Icon.Clipboard}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          <Action.CopyToClipboard
            title="Copy Curl Without Closing"
            content={getCurlWithValues()}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
          {response && (
            <Action.CopyToClipboard
              title="Copy Response"
              content={response}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
            />
          )}
        </ActionPanel>
      }
    >
      <Form.Description title="Endpoint" text={`${endpoint.method} ${endpoint.path}`} />

      {pathParams.length > 0 && (
        <>
          <Form.Separator />
          <Form.Description title="Path Parameters" text="Required parameters in the URL path" />
          {pathParams.map((param) => (
            <Form.TextField
              key={param.name}
              id={`path_${param.name}`}
              title={param.name}
              placeholder={param.description || `Enter ${param.name}`}
              info={param.required ? "Required" : undefined}
              onChange={(value) => updateParam(param.name, value)}
            />
          ))}
        </>
      )}

      {queryParams.length > 0 && (
        <>
          <Form.Separator />
          <Form.Description title="Query Parameters" text="Parameters appended to the URL" />
          {queryParams.map((param) => (
            <Form.TextField
              key={param.name}
              id={`query_${param.name}`}
              title={`${param.name}${param.required ? " *" : ""}`}
              placeholder={param.description || `Enter ${param.name}`}
              info={param.required ? "Required" : "Optional"}
              onChange={(value) => updateParam(param.name, value)}
            />
          ))}
        </>
      )}

      {headerParams.length > 0 && (
        <>
          <Form.Separator />
          <Form.Description title="Header Parameters" text="Custom headers for the request" />
          {headerParams.map((param) => (
            <Form.TextField
              key={param.name}
              id={`header_${param.name}`}
              title={`${param.name}${param.required ? " *" : ""}`}
              placeholder={param.description || `Enter ${param.name}`}
              info={param.required ? "Required" : "Optional"}
              onChange={(value) => updateParam(param.name, value)}
            />
          ))}
        </>
      )}

      {hasBody && (
        <>
          <Form.Separator />
          <Form.Description title="Request Body" text="JSON body for the request" />
          <Form.TextArea
            id="body"
            title="Body (JSON)"
            placeholder='{"key": "value"}'
            error={bodyError}
            onChange={(value) => {
              setBodyJson(value);
              validateJson(value);
            }}
            info="Enter valid JSON for the request body"
          />
        </>
      )}

      {allParams.length === 0 && !hasBody && (
        <Form.Description title="No Parameters" text="This endpoint has no configurable parameters." />
      )}

      {response && (
        <>
          <Form.Separator />
          <Form.Description title="Response" text={response} />
        </>
      )}
    </Form>
  );
}

interface SetTokenFormProps {
  specId: string;
  specName: string;
  onSave: (token: string) => void;
}

function SetTokenForm({ specId, specName, onSave }: SetTokenFormProps) {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(values: { token: string }) {
    if (!values.token) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Token is required",
      });
      return;
    }

    setIsLoading(true);

    try {
      await setToken(specId, values.token);
      onSave(values.token);
      await showToast({
        style: Toast.Style.Success,
        title: "Token saved",
        message: `Token saved securely for ${specName}`,
      });
      pop();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to save token",
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={`Set Token for ${specName}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Token" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.PasswordField
        id="token"
        title="API Token"
        placeholder="Enter your API token"
        info="This token will be stored securely in your system keychain"
      />
      <Form.Description
        title="Security"
        text="Your token is stored in the macOS Keychain and will be used when generating cURL commands for this API."
      />
    </Form>
  );
}

interface EditSpecFormProps {
  spec: StoredSpec;
  onSave: () => void;
}

function EditSpecForm({ spec, onSave }: EditSpecFormProps) {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | undefined>();

  async function handleSubmit(values: { name: string; url: string }) {
    if (!values.name.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Name is required",
      });
      return;
    }

    if (!values.url.trim()) {
      setUrlError("URL is required");
      return;
    }

    try {
      new URL(values.url);
    } catch {
      setUrlError("Invalid URL format");
      return;
    }

    setIsLoading(true);

    try {
      // If URL changed, validate the new spec
      if (values.url !== spec.url) {
        await showToast({
          style: Toast.Style.Animated,
          title: "Validating spec...",
        });
        const newSpec = await fetchSpec(values.url, spec.id);
        await updateSpec(spec.id, {
          name: values.name.trim(),
          url: values.url.trim(),
          baseUrl: newSpec.servers?.[0]?.url || spec.baseUrl,
        });
      } else {
        await updateSpec(spec.id, {
          name: values.name.trim(),
        });
      }

      onSave();
      await showToast({
        style: Toast.Style.Success,
        title: "Spec updated",
      });
      pop();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to update spec",
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  function validateUrl(value: string | undefined) {
    if (!value) {
      setUrlError("URL is required");
      return;
    }
    try {
      new URL(value);
      setUrlError(undefined);
    } catch {
      setUrlError("Invalid URL format");
    }
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={`Edit ${spec.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Changes" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" defaultValue={spec.name} placeholder="API Name" />
      <Form.TextField
        id="url"
        title="OpenAPI Spec URL"
        defaultValue={spec.url}
        placeholder="https://api.example.com/openapi.json"
        error={urlError}
        onChange={validateUrl}
        onBlur={(event) => validateUrl(event.target.value)}
      />
      <Form.Description title="Base URL" text={spec.baseUrl || "Not set"} />
      <Form.Description title="Added" text={new Date(spec.addedAt).toLocaleString()} />
    </Form>
  );
}

function getMethodColorTag(method: string): Color {
  const colors: Record<string, Color> = {
    GET: Color.Blue,
    POST: Color.Green,
    PUT: Color.Orange,
    PATCH: Color.Yellow,
    DELETE: Color.Red,
    OPTIONS: Color.Purple,
    HEAD: Color.Magenta,
  };
  return colors[method] || Color.SecondaryText;
}
