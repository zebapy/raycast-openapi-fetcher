import { Action, ActionPanel, Color, Icon, List, useNavigation } from "@raycast/api";
import { useState } from "react";
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

export function BrowseEndpoints({ spec, onTokenChange, initialSearchText }: BrowseEndpointsProps) {
  const { openApiSpec, endpoints, token, isLoading, setToken } = useOpenApiSpec(spec);
  const [searchText, setSearchText] = useState(initialSearchText || "");
  const { push } = useNavigation();

  const groupedEndpoints = groupEndpointsByTag(endpoints);

  function getCurlOptions(): CurlOptions {
    return {
      baseUrl: spec.baseUrl || openApiSpec?.servers?.[0]?.url || "https://api.example.com",
      authToken: token,
      authType: "bearer",
      includeExampleBody: true,
    };
  }

  function getEndpointDetailMarkdown(endpoint: ParsedEndpoint): string {
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

    // Generate curl with obfuscated token for display
    const displayCurlOptions = {
      ...getCurlOptions(),
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
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search endpoints..."
      navigationTitle={spec.name}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      isShowingDetail
      filtering={true}
    >
      {Array.from(groupedEndpoints.entries()).map(([tag, tagEndpoints]) => (
        <List.Section key={tag} title={tag} subtitle={`${tagEndpoints.length} endpoints`}>
          {tagEndpoints.map((endpoint) => (
            <List.Item
              key={`${endpoint.method}-${endpoint.path}`}
              title={formatEndpointTitle(endpoint)}
              subtitle={endpoint.path}
              icon={{ source: Icon.Circle, tintColor: getMethodColor(endpoint.method) }}
              accessories={[endpoint.hasAuth ? { icon: Icon.Lock, tooltip: "Requires Auth" } : {}]}
              detail={
                <List.Item.Detail
                  markdown={getEndpointDetailMarkdown(endpoint)}
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
                    target={
                      <RequestForm
                        endpoint={endpoint}
                        curlOptions={getCurlOptions()}
                        specId={spec.id}
                        specName={spec.name}
                      />
                    }
                    icon={Icon.Wand}
                  />
                  <Action.CopyToClipboard
                    title="Copy as Curl"
                    content={generateCompactCurl(endpoint, getCurlOptions())}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
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
          ))}
        </List.Section>
      ))}
    </List>
  );
}
