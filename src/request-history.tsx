import { Action, ActionPanel, Alert, Color, confirmAlert, Detail, Icon, List, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { getRequestHistory, deleteRequestHistoryEntry, clearRequestHistory, getSpec } from "./lib/storage";
import { RequestHistoryEntry, HttpMethod, StoredSpec } from "./types/openapi";
import { BrowseEndpoints } from "./list-specs";

function generateCurlFromHistory(entry: RequestHistoryEntry): string {
  const parts: string[] = ["curl"];

  // Add method (skip for GET as it's default)
  if (entry.method !== "GET") {
    parts.push(`-X ${entry.method}`);
  }

  // Add headers
  for (const [key, value] of Object.entries(entry.headers)) {
    parts.push(`-H "${key}: ${value}"`);
  }

  // Add body if present
  if (entry.body) {
    const escapedBody = entry.body.replace(/'/g, "'\\''");
    parts.push(`-d '${escapedBody}'`);
  }

  // Add URL
  parts.push(`"${entry.url}"`);

  return parts.join(" \\\n  ");
}

export default function RequestHistory() {
  const [history, setHistory] = useState<RequestHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function loadHistory() {
    setIsLoading(true);
    const loadedHistory = await getRequestHistory();
    setHistory(loadedHistory);
    setIsLoading(false);
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleDelete(entry: RequestHistoryEntry) {
    const confirmed = await confirmAlert({
      title: "Delete Request",
      message: `Are you sure you want to delete this request?`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      await deleteRequestHistoryEntry(entry.id);
      await loadHistory();
      await showToast({
        style: Toast.Style.Success,
        title: "Request deleted",
      });
    }
  }

  async function handleClearAll() {
    const confirmed = await confirmAlert({
      title: "Clear All History",
      message: "Are you sure you want to delete all request history? This cannot be undone.",
      primaryAction: {
        title: "Clear All",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      await clearRequestHistory();
      await loadHistory();
      await showToast({
        style: Toast.Style.Success,
        title: "History cleared",
      });
    }
  }

  // Group history by date
  const groupedHistory = new Map<string, RequestHistoryEntry[]>();
  for (const entry of history) {
    const date = new Date(entry.timestamp).toLocaleDateString();
    if (!groupedHistory.has(date)) {
      groupedHistory.set(date, []);
    }
    groupedHistory.get(date)!.push(entry);
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search request history...">
      {history.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No Request History"
          description="Execute API requests to see them here"
          icon={Icon.Clock}
        />
      ) : (
        Array.from(groupedHistory.entries()).map(([date, entries]) => (
          <List.Section key={date} title={date} subtitle={`${entries.length} requests`}>
            {entries.map((entry) => (
              <List.Item
                key={entry.id}
                title={`${entry.method} ${entry.path}`}
                subtitle={entry.specName}
                icon={{ source: Icon.Circle, tintColor: getMethodColor(entry.method) }}
                accessories={[
                  {
                    tag: {
                      value: `${entry.response.status}`,
                      color: entry.response.status < 400 ? Color.Green : Color.Red,
                    },
                  },
                  {
                    text: new Date(entry.timestamp).toLocaleTimeString(),
                    tooltip: new Date(entry.timestamp).toLocaleString(),
                  },
                ]}
                actions={
                  <ActionPanel>
                    <Action.Push title="View Details" target={<RequestDetail entry={entry} />} icon={Icon.Eye} />
                    <Action.Push
                      title="View Endpoint in Spec"
                      target={<ViewEndpointInSpec entry={entry} />}
                      icon={Icon.ArrowRight}
                      shortcut={{ modifiers: ["cmd"], key: "o" }}
                    />
                    <Action.CopyToClipboard
                      title="Copy as Curl"
                      content={generateCurlFromHistory(entry)}
                      shortcut={{ modifiers: ["cmd"], key: "c" }}
                    />
                    <Action.CopyToClipboard
                      title="Copy Response"
                      content={entry.response.body}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                    />
                    <Action.CopyToClipboard title="Copy Request URL" content={entry.url} />
                    <Action
                      title="Delete Request"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["ctrl"], key: "x" }}
                      onAction={() => handleDelete(entry)}
                    />
                    <Action
                      title="Clear All History"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      onAction={handleClearAll}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ))
      )}
    </List>
  );
}

interface RequestDetailProps {
  entry: RequestHistoryEntry;
}

function RequestDetail({ entry }: RequestDetailProps) {
  const headersText = Object.entries(entry.headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const markdown = `
# ${entry.method} ${entry.path}

**API:** ${entry.specName}  
**Time:** ${new Date(entry.timestamp).toLocaleString()}

## Request

**URL:** \`${entry.url}\`

### Headers
\`\`\`
${headersText || "No custom headers"}
\`\`\`

${entry.body ? `### Body\n\`\`\`json\n${entry.body}\n\`\`\`` : ""}

## Response

**Status:** ${entry.response.status} ${entry.response.statusText}  
**Content-Type:** ${entry.response.contentType || "unknown"}

\`\`\`${entry.response.contentType?.includes("json") ? "json" : ""}
${entry.response.body}
\`\`\`
  `.trim();

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy as Curl"
            content={generateCurlFromHistory(entry)}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          <Action.CopyToClipboard
            title="Copy Response"
            content={entry.response.body}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
          <Action.CopyToClipboard title="Copy Request URL" content={entry.url} />
          {entry.body && <Action.CopyToClipboard title="Copy Request Body" content={entry.body} />}
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="API" text={entry.specName} />
          <Detail.Metadata.Label title="Method" text={entry.method} />
          <Detail.Metadata.Label title="Path" text={entry.path} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item
              text={`${entry.response.status} ${entry.response.statusText}`}
              color={entry.response.status < 400 ? Color.Green : Color.Red}
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label title="Time" text={new Date(entry.timestamp).toLocaleString()} />
        </Detail.Metadata>
      }
    />
  );
}

function getMethodColor(method: HttpMethod): Color {
  const colors: Record<HttpMethod, Color> = {
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

interface ViewEndpointInSpecProps {
  entry: RequestHistoryEntry;
}

function ViewEndpointInSpec({ entry }: ViewEndpointInSpecProps) {
  const [spec, setSpec] = useState<StoredSpec | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const storedSpec = await getSpec(entry.specId);
        if (!storedSpec) {
          setError("API spec not found. It may have been deleted.");
        } else {
          setSpec(storedSpec);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(`Failed to load spec: ${message}`);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [entry.specId]);

  if (isLoading) {
    return <Detail isLoading={true} markdown="Loading spec..." />;
  }

  if (error || !spec) {
    return <Detail markdown={`# Error\n\n${error || "Failed to load spec"}`} />;
  }

  // Use the path as the search text to filter to the specific endpoint
  const searchText = `${entry.method} ${entry.path}`;

  return <BrowseEndpoints spec={spec} initialSearchText={searchText} />;
}
