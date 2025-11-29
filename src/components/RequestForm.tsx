import { Action, ActionPanel, Clipboard, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useState, useMemo } from "react";
import { CurlOptions, generateCurl } from "../lib/curl-generator";
import {
  BodyParameter,
  getBodyParams,
  getHeaderParams,
  getPathParams,
  getQueryParams,
  getRequestBodyContentType,
} from "../lib/openapi-parser";
import { addRequestToHistory, maskSensitiveHeaders } from "../lib/storage";
import { validateJson } from "../lib/validation";
import { getErrorMessage } from "../lib/toast-utils";
import { ParsedEndpoint } from "../types/openapi";

type AuthSource = "stored" | "custom";

export interface RequestFormProps {
  endpoint: ParsedEndpoint;
  curlOptions: CurlOptions;
  specId: string;
  specName: string;
}

export function RequestForm({ endpoint, curlOptions, specId, specName }: RequestFormProps) {
  const { pop } = useNavigation();
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [bodyJson, setBodyJson] = useState<string>("");
  const [bodyError, setBodyError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [authSource, setAuthSource] = useState<AuthSource>(curlOptions.authToken ? "stored" : "custom");
  const [customToken, setCustomToken] = useState<string>("");
  const [bodyParamValues, setBodyParamValues] = useState<Record<string, string>>({});

  const activeToken = authSource === "stored" ? curlOptions.authToken : customToken;

  const pathParams = getPathParams(endpoint);
  const queryParams = getQueryParams(endpoint);
  const headerParams = getHeaderParams(endpoint);
  const bodyParams = useMemo(() => getBodyParams(endpoint), [endpoint]);

  const hasBody = endpoint.requestBody && ["POST", "PUT", "PATCH"].includes(endpoint.method);
  const allParams = [...pathParams, ...queryParams, ...headerParams];

  function updateParam(name: string, value: string) {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  }

  function updateBodyParam(name: string, value: string) {
    setBodyParamValues((prev) => ({ ...prev, [name]: value }));
  }

  // Build JSON body from individual body parameters
  function buildBodyFromParams(): string {
    if (Object.keys(bodyParamValues).length === 0) {
      return "";
    }
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(bodyParamValues)) {
      if (value.trim()) {
        // Try to parse as JSON for objects/arrays/numbers/booleans
        try {
          body[key] = JSON.parse(value);
        } catch {
          // If not valid JSON, use as string
          body[key] = value;
        }
      }
    }
    return Object.keys(body).length > 0 ? JSON.stringify(body, null, 2) : "";
  }

  // Get effective body: use raw JSON if provided, otherwise build from params
  function getEffectiveBody(): string {
    return bodyJson.trim() || buildBodyFromParams();
  }

  function handleBodyChange(value: string) {
    setBodyJson(value);
    setBodyError(validateJson(value));
  }

  function getCurlWithValues(): string {
    return generateCurl(endpoint, {
      ...curlOptions,
      authToken: activeToken,
      paramValues,
      bodyJson: getEffectiveBody() || undefined,
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
    const effectiveBody = getEffectiveBody();

    // Validate body JSON if provided
    if (effectiveBody && validateJson(effectiveBody)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid JSON",
        message: "Please fix the request body JSON",
      });
      return;
    }

    setIsLoading(true);
    setResponse(null);

    try {
      const url = buildRequestUrl();
      const headers: Record<string, string> = {};

      // Add auth header
      if (activeToken) {
        switch (curlOptions.authType) {
          case "bearer":
            headers["Authorization"] = `Bearer ${activeToken}`;
            break;
          case "api-key":
            headers[curlOptions.authHeader || "X-API-Key"] = activeToken;
            break;
          case "basic":
            headers["Authorization"] = `Basic ${activeToken}`;
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

      // Add Content-Type for body requests (use spec-defined content type or default to application/json)
      if (hasBody) {
        const contentType = getRequestBodyContentType(endpoint) || "application/json";
        headers["Content-Type"] = contentType;
      }

      const fetchOptions: RequestInit = {
        method: endpoint.method,
        headers,
      };

      if (hasBody && effectiveBody) {
        fetchOptions.body = effectiveBody;
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
        body: hasBody && effectiveBody ? effectiveBody : undefined,
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
      const message = getErrorMessage(error);
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

      <Form.Separator />
      <Form.Description title="Authentication" text="Choose authentication method" />
      <Form.Dropdown
        id="authSource"
        title="Token Source"
        value={authSource}
        onChange={(value) => setAuthSource(value as AuthSource)}
      >
        <Form.Dropdown.Item
          value="stored"
          title={curlOptions.authToken ? "Stored Token" : "Stored Token (Not Set)"}
          icon={curlOptions.authToken ? Icon.Key : Icon.ExclamationMark}
        />
        <Form.Dropdown.Item value="custom" title="Custom Token" icon={Icon.Pencil} />
      </Form.Dropdown>
      {authSource === "custom" && (
        <Form.TextField
          id="customToken"
          title="Custom Token"
          placeholder="Enter your API token"
          value={customToken}
          onChange={setCustomToken}
          info="Enter a custom token to use for this request"
        />
      )}

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
          <Form.Description title="Request Body" text="Fill in body parameters or use raw JSON below" />
          {bodyParams.length > 0 && (
            <>
              {bodyParams.map((param) => (
                <Form.TextField
                  key={param.name}
                  id={`body_${param.name}`}
                  title={`${param.name}${param.required ? " *" : ""}`}
                  placeholder={
                    param.example !== undefined
                      ? `e.g. ${JSON.stringify(param.example)}`
                      : param.description || `Enter ${param.name} (${param.type})`
                  }
                  info={`${param.type}${param.required ? " - Required" : " - Optional"}${param.description ? ` - ${param.description}` : ""}`}
                  onChange={(value) => updateBodyParam(param.name, value)}
                />
              ))}
              <Form.Separator />
              <Form.Description title="Raw JSON (Optional)" text="Override body parameters with raw JSON" />
            </>
          )}
          <Form.TextArea
            id="body"
            title="Body (JSON)"
            placeholder={bodyParams.length > 0 ? "Leave empty to use parameters above" : '{"key": "value"}'}
            error={bodyError}
            onChange={handleBodyChange}
            info={
              bodyParams.length > 0
                ? "If provided, this overrides the individual body parameters"
                : "Enter valid JSON for the request body"
            }
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
