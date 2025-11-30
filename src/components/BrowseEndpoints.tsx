import { Action, ActionPanel, Color, Icon, List, useNavigation } from "@raycast/api";
import { useMemo } from "react";
import { CurlOptions, generateCompactCurl } from "../lib/curl-generator";
import { formatEndpointTitle, getBodyParams, groupEndpointsByTag } from "../lib/openapi-parser";
import { getMethodColor } from "../lib/colors";
import { useOpenApiSpec } from "../hooks/useOpenApiSpec";
import { ParsedEndpoint, StoredSpec } from "../types/openapi";
import { SetTokenForm } from "./SetTokenForm";
import { RequestForm } from "./RequestForm";

export interface BrowseEndpointsProps {
  spec: StoredSpec;
  onTokenChange?: () => void;
  initialSearchText?: string;
}

// Separate component for endpoint item to prevent re-renders
function EndpointListItem({
  endpoint,
  spec,
  openApiSpec,
  token,
  onTokenChange,
  setToken,
}: {
  endpoint: ParsedEndpoint;
  spec: StoredSpec;
  openApiSpec: ReturnType<typeof useOpenApiSpec>["openApiSpec"];
  token: string | undefined;
  onTokenChange?: () => void;
  setToken: (token: string | undefined) => void;
}) {
  const { push } = useNavigation();

  const curlOptions: CurlOptions = useMemo(
    () => ({
      baseUrl: spec.baseUrl || openApiSpec?.servers?.[0]?.url || "https://api.example.com",
      authToken: token,
      authType: "bearer",
      includeExampleBody: true,
    }),
    [spec.baseUrl, openApiSpec?.servers, token],
  );

  // Memoize the detail markdown - only compute when endpoint or token changes
  const detailMarkdown = useMemo(() => {
    const paramsList =
      endpoint.parameters.length > 0
        ? endpoint.parameters
            .map(
              (p) =>
                `• **${p.name}** (${p.in})${p.required ? " *required*" : ""}: ${p.description || "No description"}`,
            )
            .join("\n")
        : "No parameters";

    const bodyParams = getBodyParams(endpoint);
    const bodyParamsList =
      bodyParams.length > 0
        ? bodyParams
            .map(
              (p) =>
                `• **${p.name}** (${p.type})${p.required ? " *required*" : ""}: ${p.description || "No description"}`,
            )
            .join("\n")
        : null;

    const bodySection = bodyParamsList ? `\n\n### Request Body\n${bodyParamsList}` : "";

    const displayCurlOptions = {
      ...curlOptions,
      authToken: token ? "••••••••" : undefined,
    };
    const curlSample = generateCompactCurl(endpoint, displayCurlOptions);

    return `
## ${endpoint.summary || formatEndpointTitle(endpoint)}

${endpoint.description || ""}

### Parameters
${paramsList}${bodySection}

${endpoint.hasAuth ? "🔒 **Requires authentication**" : ""}

### Example
\`\`\`bash
${curlSample}
\`\`\`
    `.trim();
  }, [endpoint, token, curlOptions]);

  // Memoize spec JSON - only compute on demand via action
  const getEndpointSpecJson = useMemo(() => {
    return () => {
      if (!openApiSpec?.paths) return "{}";
      const pathItem = openApiSpec.paths[endpoint.path];
      if (!pathItem) return "{}";
      const methodKey = endpoint.method.toLowerCase() as keyof typeof pathItem;
      const operation = pathItem[methodKey];
      return JSON.stringify({ path: endpoint.path, method: endpoint.method, operation }, null, 2);
    };
  }, [openApiSpec, endpoint.path, endpoint.method]);

  return (
    <List.Item
      key={`${endpoint.method}-${endpoint.path}`}
      title={formatEndpointTitle(endpoint)}
      subtitle={endpoint.path}
      keywords={[
        endpoint.method,
        endpoint.path,
        endpoint.operationId || "",
        endpoint.summary || "",
        endpoint.description || "",
        ...endpoint.tags,
      ]}
      icon={{ source: Icon.Circle, tintColor: getMethodColor(endpoint.method) }}
      accessories={[endpoint.hasAuth ? { icon: Icon.Lock, tooltip: "Requires Auth" } : {}]}
      detail={
        <List.Item.Detail
          markdown={detailMarkdown}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.TagList title="Method">
                <List.Item.Detail.Metadata.TagList.Item
                  text={endpoint.method}
                  color={getMethodColor(endpoint.method)}
                />
              </List.Item.Detail.Metadata.TagList>
              <List.Item.Detail.Metadata.Label title="Path" text={endpoint.path} />
              {endpoint.operationId && (
                <List.Item.Detail.Metadata.Label title="Operation ID" text={endpoint.operationId} />
              )}
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.TagList title="Tags">
                {endpoint.tags.map((t) => (
                  <List.Item.Detail.Metadata.TagList.Item key={t} text={t} color={Color.Blue} />
                ))}
              </List.Item.Detail.Metadata.TagList>
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <Action.Push
            title="Build Request"
            target={<RequestForm endpoint={endpoint} curlOptions={curlOptions} specId={spec.id} specName={spec.name} />}
            icon={Icon.Wand}
          />
          <Action.CopyToClipboard
            title="Copy as Curl"
            content={generateCompactCurl(endpoint, curlOptions)}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          <Action.CopyToClipboard
            title="Copy Spec JSON"
            content={getEndpointSpecJson()}
            icon={Icon.CodeBlock}
            shortcut={{ modifiers: ["cmd", "shift"], key: "j" }}
          />
          {endpoint.operationId && (
            <Action.CopyToClipboard
              title="Copy Deeplink"
              content={`raycast://extensions/zebapy/openapi-fetcher/list-specs?context=${encodeURIComponent(JSON.stringify({ specId: spec.id, operationId: endpoint.operationId }))}`}
              icon={Icon.Link}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            />
          )}
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
  );
}

export function BrowseEndpoints({ spec, onTokenChange, initialSearchText }: BrowseEndpointsProps) {
  const { openApiSpec, endpoints, token, isLoading, setToken } = useOpenApiSpec(spec);

  // Memoize grouped endpoints to avoid recomputing on every render
  const groupedEndpoints = useMemo(() => groupEndpointsByTag(endpoints), [endpoints]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search endpoints..."
      navigationTitle={spec.name}
      isShowingDetail
      filtering={true}
      throttle={true}
      {...(initialSearchText ? { searchText: initialSearchText } : {})}
    >
      {Array.from(groupedEndpoints.entries()).map(([tag, tagEndpoints]) => (
        <List.Section key={tag} title={tag} subtitle={`${tagEndpoints.length} endpoints`}>
          {tagEndpoints.map((endpoint) => (
            <EndpointListItem
              key={`${endpoint.method}-${endpoint.path}`}
              endpoint={endpoint}
              spec={spec}
              openApiSpec={openApiSpec}
              token={token}
              onTokenChange={onTokenChange}
              setToken={setToken}
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}
