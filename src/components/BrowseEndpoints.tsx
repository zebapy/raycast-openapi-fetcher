import { Action, ActionPanel, Color, Detail, Icon, List, useNavigation } from "@raycast/api";
import { useMemo, useState } from "react";
import { CurlOptions, generateCompactCurl } from "../lib/curl-generator";
import { formatEndpointTitle, generateRequestBodyTypeScript, groupEndpointsByTag } from "../lib/openapi-parser";
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

// Generate docs URL from template and operationId
function getDocsUrl(template: string | undefined, operationId: string | undefined): string | undefined {
  if (!template || !operationId) return undefined;
  return template.replace("{operationId}", operationId);
}

// Detail view for a single endpoint
function EndpointDetail({
  endpoint,
  spec,
  openApiSpec,
  token,
  onTokenChange,
  setToken,
  getEndpointSpecJson,
}: {
  endpoint: ParsedEndpoint;
  spec: StoredSpec;
  openApiSpec: ReturnType<typeof useOpenApiSpec>["openApiSpec"];
  token: string | undefined;
  onTokenChange?: () => void;
  setToken: (token: string | undefined) => void;
  getEndpointSpecJson: () => string;
}) {
  const { push } = useNavigation();

  const requestBodyTS = useMemo(() => generateRequestBodyTypeScript(endpoint), [endpoint]);

  const curlOptions: CurlOptions = useMemo(
    () => ({
      baseUrl: spec.baseUrl || openApiSpec?.servers?.[0]?.url || "https://api.example.com",
      authToken: token,
      authType: "bearer",
      includeExampleBody: true,
    }),
    [spec.baseUrl, openApiSpec?.servers, token],
  );

  const displayCurlOptions = useMemo(
    () => ({
      ...curlOptions,
      authToken: token ? "••••••••" : undefined,
    }),
    [curlOptions, token],
  );

  const curlSample = useMemo(() => generateCompactCurl(endpoint, displayCurlOptions), [endpoint, displayCurlOptions]);

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

    const bodySection = requestBodyTS ? `\n\n### Request Body\n\n\`\`\`typescript\n${requestBodyTS}\n\`\`\`` : "";

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
  }, [endpoint, curlSample, requestBodyTS]);

  return (
    <Detail
      navigationTitle={`${endpoint.method} ${endpoint.path}`}
      markdown={detailMarkdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Method">
            <Detail.Metadata.TagList.Item text={endpoint.method} color={getMethodColor(endpoint.method)} />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label title="Path" text={endpoint.path} />
          {endpoint.operationId && <Detail.Metadata.Label title="Operation ID" text={endpoint.operationId} />}
          <Detail.Metadata.Separator />
          <Detail.Metadata.TagList title="Tags">
            {endpoint.tags.map((t) => (
              <Detail.Metadata.TagList.Item key={t} text={t} color={Color.Blue} />
            ))}
          </Detail.Metadata.TagList>
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy as Curl" content={generateCompactCurl(endpoint, curlOptions)} />
          <Action.Push
            title="Build Request"
            target={<RequestForm endpoint={endpoint} curlOptions={curlOptions} specId={spec.id} specName={spec.name} />}
            icon={Icon.Wand}
            shortcut={{ modifiers: ["cmd"], key: "b" }}
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
          {endpoint.operationId && spec.docsUrlTemplate && (
            <Action.OpenInBrowser
              title="Open in API Docs"
              url={getDocsUrl(spec.docsUrlTemplate, endpoint.operationId)!}
              icon={Icon.Book}
              shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
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
  const curlOptions: CurlOptions = useMemo(
    () => ({
      baseUrl: spec.baseUrl || openApiSpec?.servers?.[0]?.url || "https://api.example.com",
      authToken: token,
      authType: "bearer",
      includeExampleBody: true,
    }),
    [spec.baseUrl, openApiSpec?.servers, token],
  );

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
      accessories={[
        { tag: { value: endpoint.method, color: getMethodColor(endpoint.method) } },
        endpoint.hasAuth ? { icon: Icon.Lock, tooltip: "Requires Auth" } : {},
      ]}
      actions={
        <ActionPanel>
          <Action.Push
            title="View Details"
            target={
              <EndpointDetail
                endpoint={endpoint}
                spec={spec}
                openApiSpec={openApiSpec}
                token={token}
                onTokenChange={onTokenChange}
                setToken={setToken}
                getEndpointSpecJson={getEndpointSpecJson}
              />
            }
            icon={Icon.Eye}
          />
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
          {endpoint.operationId && spec.docsUrlTemplate && (
            <Action.OpenInBrowser
              title="Open in API Docs"
              url={getDocsUrl(spec.docsUrlTemplate, endpoint.operationId)!}
              icon={Icon.Book}
              shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
            />
          )}
        </ActionPanel>
      }
    />
  );
}

export function BrowseEndpoints({ spec, onTokenChange, initialSearchText }: BrowseEndpointsProps) {
  const { openApiSpec, endpoints, token, isLoading, setToken } = useOpenApiSpec(spec);
  const [selectedGroup, setSelectedGroup] = useState<string>("all");

  // Memoize grouped endpoints to avoid recomputing on every render
  const groupedEndpoints = useMemo(() => groupEndpointsByTag(endpoints), [endpoints]);

  // Get list of all groups for the dropdown
  const groups = useMemo(() => Array.from(groupedEndpoints.keys()), [groupedEndpoints]);

  // Filter groups based on selection
  const filteredGroups = useMemo(() => {
    if (selectedGroup === "all") {
      return Array.from(groupedEndpoints.entries());
    }
    const tagEndpoints = groupedEndpoints.get(selectedGroup);
    return tagEndpoints ? [[selectedGroup, tagEndpoints] as const] : [];
  }, [groupedEndpoints, selectedGroup]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search endpoints..."
      navigationTitle={spec.name}
      filtering={true}
      throttle={true}
      {...(initialSearchText ? { searchText: initialSearchText } : {})}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by Group" value={selectedGroup} onChange={setSelectedGroup}>
          <List.Dropdown.Item title="All Groups" value="all" />
          <List.Dropdown.Section title="Groups">
            {groups.map((group) => (
              <List.Dropdown.Item key={group} title={group} value={group} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {filteredGroups.map(([tag, tagEndpoints]) => (
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
