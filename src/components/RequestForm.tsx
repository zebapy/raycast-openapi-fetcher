import { Action, ActionPanel, Clipboard, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import { CurlOptions, generateCurl } from "../lib/curl-generator";
import { getHeaderParams, getPathParams, getQueryParams, getRequestBodyContentType } from "../lib/openapi-parser";
import { addRequestToHistory, maskSensitiveHeaders } from "../lib/storage";
import { validateJson } from "../lib/validation";
import { getErrorMessage } from "../lib/toast-utils";
import { ParsedEndpoint } from "../types/openapi";
import { ResponseDetail } from "./ResponseDetail";

type AuthSource = "stored" | "custom";

export interface RequestFormProps {
  endpoint: ParsedEndpoint;
  curlOptions: CurlOptions;
  specId: string;
  specName: string;
}

export function RequestForm({ endpoint, curlOptions, specId, specName }: RequestFormProps) {
  const { push } = useNavigation();
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [bodyJson, setBodyJson] = useState<string>("");
  const [bodyError, setBodyError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [authSource, setAuthSource] = useState<AuthSource>(curlOptions.authToken ? "stored" : "custom");
  const [customToken, setCustomToken] = useState<string>("");

  const activeToken = authSource === "stored" ? curlOptions.authToken : customToken;

  const pathParams = getPathParams(endpoint);
  const queryParams = getQueryParams(endpoint);
  const headerParams = getHeaderParams(endpoint);

  const hasBody = endpoint.requestBody && ["POST", "PUT", "PATCH"].includes(endpoint.method);
  const allParams = [...pathParams, ...queryParams, ...headerParams];

  function updateParam(name: string, value: string) {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  }

  function getEffectiveBody(): string {
    return bodyJson.trim();
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

      await showToast({
        style: res.ok ? Toast.Style.Success : Toast.Style.Failure,
        title: `${res.status} ${res.statusText}`,
      });

      push(
        <ResponseDetail
          method={endpoint.method}
          path={endpoint.path}
          url={url}
          status={res.status}
          statusText={res.statusText}
          responseBody={responseText}
          contentType={contentType}
        />,
      );
    } catch (error) {
      const message = getErrorMessage(error);
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
          <Form.Description title="Request Body" text="JSON body for the request" />
          <Form.TextArea
            id="body"
            title="Body (JSON)"
            placeholder='{"key": "value"}'
            error={bodyError}
            onChange={handleBodyChange}
            info="Enter valid JSON for the request body"
          />
        </>
      )}

      {allParams.length === 0 && !hasBody && (
        <Form.Description title="No Parameters" text="This endpoint has no configurable parameters." />
      )}
    </Form>
  );
}
