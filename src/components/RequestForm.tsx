import { Action, ActionPanel, Clipboard, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import { CurlOptions, generateCurl } from "../lib/curl-generator";
import { getHeaderParams, getPathParams, getQueryParams } from "../lib/openapi-parser";
import { addRequestToHistory, maskSensitiveHeaders } from "../lib/storage";
import { validateJson } from "../lib/validation";
import { getErrorMessage } from "../lib/toast-utils";
import { ParsedEndpoint } from "../types/openapi";

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

  const pathParams = getPathParams(endpoint);
  const queryParams = getQueryParams(endpoint);
  const headerParams = getHeaderParams(endpoint);

  const hasBody = endpoint.requestBody && ["POST", "PUT", "PATCH"].includes(endpoint.method);
  const allParams = [...pathParams, ...queryParams, ...headerParams];

  function updateParam(name: string, value: string) {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleBodyChange(value: string) {
    setBodyJson(value);
    setBodyError(validateJson(value));
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
    if (bodyJson.trim() && validateJson(bodyJson)) {
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

      {response && (
        <>
          <Form.Separator />
          <Form.Description title="Response" text={response} />
        </>
      )}
    </Form>
  );
}
