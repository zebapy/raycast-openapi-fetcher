import { Action, ActionPanel, Color, Detail } from "@raycast/api";

export interface ResponseDetailProps {
  method: string;
  path: string;
  url: string;
  status: number;
  statusText: string;
  responseBody: string;
  contentType: string;
  /** Optional request body to show in the detail view */
  requestBody?: string;
  /** Optional headers to show in the detail view */
  headers?: Record<string, string>;
  /** Optional spec name */
  specName?: string;
  /** Optional timestamp */
  timestamp?: string;
  /** Optional curl command for copy action */
  curlCommand?: string;
}

export function ResponseDetail({
  method,
  path,
  url,
  status,
  statusText,
  responseBody,
  contentType,
  requestBody,
  headers,
  specName,
  timestamp,
  curlCommand,
}: ResponseDetailProps) {
  const isSuccess = status >= 200 && status < 300;
  const isJson = contentType.includes("application/json") || contentType.includes("json");

  const headersText = headers
    ? Object.entries(headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n")
    : null;

  const markdownParts: string[] = [];

  if (headersText) {
    markdownParts.push(`## Request Headers\n\`\`\`\n${headersText}\n\`\`\``);
  }

  if (requestBody) {
    markdownParts.push(`## Request Body\n\`\`\`json\n${requestBody}\n\`\`\``);
  }

  markdownParts.push(`## Response\n\`\`\`${isJson ? "json" : ""}\n${responseBody}\n\`\`\``);

  const markdown = markdownParts.join("\n\n");

  return (
    <Detail
      navigationTitle={`${method} ${path} - Response`}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          {specName && <Detail.Metadata.Label title="API" text={specName} />}
          <Detail.Metadata.Label title="Method" text={method} />
          <Detail.Metadata.Label title="Path" text={path} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item
              text={`${status} ${statusText}`}
              color={isSuccess ? Color.Green : Color.Red}
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label title="URL" text={url} />
          <Detail.Metadata.Label title="Content-Type" text={contentType || "unknown"} />
          {timestamp && <Detail.Metadata.Label title="Time" text={timestamp} />}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Response" content={responseBody} />
          {curlCommand && (
            <Action.CopyToClipboard
              title="Copy as Curl"
              content={curlCommand}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
            />
          )}
          <Action.CopyToClipboard title="Copy URL" content={url} shortcut={{ modifiers: ["cmd"], key: "u" }} />
          {requestBody && <Action.CopyToClipboard title="Copy Request Body" content={requestBody} />}
        </ActionPanel>
      }
    />
  );
}
