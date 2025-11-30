import { Action, ActionPanel, Alert, Color, confirmAlert, Icon, List, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { getSpecs } from "./lib/storage";
import { listAllTokens, deleteToken, clearAllTokens, StoredToken } from "./lib/secure-storage";
import { getErrorMessage } from "./lib/toast-utils";
import { SetTokenForm } from "./components";
import { StoredSpec } from "./types/openapi";

interface TokenWithSpec extends StoredToken {
  spec?: StoredSpec;
}

/**
 * Obfuscate a token for display, showing only first few characters
 */
function obfuscateToken(token: string): string {
  if (token.length <= 8) {
    return "••••••••";
  }
  const visibleChars = 4;
  const start = token.slice(0, visibleChars);
  const middle = "•".repeat(Math.min(token.length - visibleChars, 12));
  return `${start}${middle}`;
}

export default function ListTokens() {
  const [tokens, setTokens] = useState<TokenWithSpec[]>([]);
  const [specs, setSpecs] = useState<StoredSpec[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function loadTokens() {
    setIsLoading(true);
    try {
      const [allTokens, allSpecs] = await Promise.all([listAllTokens(), getSpecs()]);

      // Store specs for the Add Token form
      setSpecs(allSpecs);

      // Map tokens to their specs
      const tokensWithSpecs: TokenWithSpec[] = allTokens.map((t) => ({
        ...t,
        spec: allSpecs.find((s) => s.id === t.defaultSpecId),
      }));

      setTokens(tokensWithSpecs);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to load tokens",
        message: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTokens();
  }, []);

  async function handleDelete(tokenInfo: TokenWithSpec) {
    const confirmed = await confirmAlert({
      title: "Delete Token",
      message: `Are you sure you want to delete "${tokenInfo.name}"?`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      await deleteToken(tokenInfo.id);
      await loadTokens();
      await showToast({
        style: Toast.Style.Success,
        title: "Token deleted",
        message: `"${tokenInfo.name}" has been removed`,
      });
    }
  }

  async function handleClearAll() {
    const confirmed = await confirmAlert({
      title: "Clear All Tokens",
      message: `Are you sure you want to delete all ${tokens.length} stored tokens? This cannot be undone.`,
      primaryAction: {
        title: "Clear All",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      await clearAllTokens();
      await loadTokens();
      await showToast({
        style: Toast.Style.Success,
        title: "All tokens cleared",
      });
    }
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search API tokens..."
      actions={
        <ActionPanel>
          <Action.Push
            title="Add New Token"
            target={<SetTokenForm mode="new" availableSpecs={specs} onSave={loadTokens} />}
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
          />
        </ActionPanel>
      }
    >
      {tokens.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No API Tokens"
          description="No API tokens have been stored yet. Press ⌘N to add a new token."
          icon={Icon.Key}
          actions={
            <ActionPanel>
              <Action.Push
                title="Add New Token"
                target={<SetTokenForm mode="new" availableSpecs={specs} onSave={loadTokens} />}
                icon={Icon.Plus}
              />
            </ActionPanel>
          }
        />
      ) : (
        tokens.map((tokenInfo) => {
          const hasSpec = Boolean(tokenInfo.spec);
          const specName = tokenInfo.spec?.name || "No spec assigned";

          // Determine status
          let statusTag: { value: string; color: Color };
          let statusTooltip: string;
          if (!tokenInfo.defaultSpecId) {
            statusTag = { value: "No Spec", color: Color.Orange };
            statusTooltip = "Not linked to any spec";
          } else if (!hasSpec) {
            statusTag = { value: "Orphaned", color: Color.Orange };
            statusTooltip = "Assigned spec no longer exists";
          } else {
            statusTag = { value: "Active", color: Color.Green };
            statusTooltip = `Auto-used for ${specName}`;
          }

          return (
            <List.Item
              key={tokenInfo.id}
              title={tokenInfo.name}
              subtitle={obfuscateToken(tokenInfo.token)}
              icon={{
                source: Icon.Key,
                tintColor: hasSpec ? Color.Green : Color.Orange,
              }}
              accessories={[
                { tag: statusTag, tooltip: statusTooltip },
                hasSpec ? { text: specName, tooltip: "Default Spec" } : {},
                tokenInfo.spec?.baseUrl ? { text: tokenInfo.spec.baseUrl, tooltip: "Base URL" } : {},
              ]}
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <Action.Push
                      title="Edit Token"
                      target={
                        <SetTokenForm
                          mode="edit"
                          existingToken={tokenInfo}
                          availableSpecs={specs}
                          onSave={loadTokens}
                        />
                      }
                      icon={Icon.Pencil}
                    />
                    <Action.Push
                      title="Add New Token"
                      target={<SetTokenForm mode="new" availableSpecs={specs} onSave={loadTokens} />}
                      icon={Icon.Plus}
                      shortcut={{ modifiers: ["cmd"], key: "n" }}
                    />
                    <Action
                      title="Delete Token"
                      style={Action.Style.Destructive}
                      icon={Icon.Trash}
                      shortcut={{ modifiers: ["ctrl"], key: "x" }}
                      onAction={() => handleDelete(tokenInfo)}
                    />
                  </ActionPanel.Section>
                  <ActionPanel.Section>
                    <Action.CopyToClipboard
                      title="Copy Token"
                      content={tokenInfo.token}
                      shortcut={{ modifiers: ["cmd"], key: "c" }}
                    />
                    <Action.CopyToClipboard
                      title="Copy Token ID"
                      content={tokenInfo.id}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                    />
                  </ActionPanel.Section>
                  {tokens.length > 0 && (
                    <ActionPanel.Section>
                      <Action
                        title="Clear All Tokens"
                        style={Action.Style.Destructive}
                        icon={Icon.XMarkCircle}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
                        onAction={handleClearAll}
                      />
                    </ActionPanel.Section>
                  )}
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
