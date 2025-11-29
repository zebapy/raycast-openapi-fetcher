import { Action, ActionPanel, Alert, Color, confirmAlert, Icon, List, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { getSpecs } from "./lib/storage";
import { listAllTokens, deleteToken, clearAllTokens } from "./lib/secure-storage";
import { getErrorMessage } from "./lib/toast-utils";
import { SetTokenForm } from "./components";
import { StoredSpec } from "./types/openapi";

interface TokenWithSpec {
  specId: string;
  token: string;
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

/**
 * Check if a token is unassigned (not linked to a spec)
 */
function isUnassignedToken(specId: string): boolean {
  return specId.startsWith("unassigned-");
}

/**
 * Extract the display name from an unassigned token ID
 */
function getUnassignedTokenName(specId: string): string {
  // Format: unassigned-{name}-{timestamp}
  const parts = specId.replace("unassigned-", "").split("-");
  // Remove the timestamp (last part)
  parts.pop();
  // Convert back to readable name
  return parts.join(" ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Unnamed Token";
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
        spec: allSpecs.find((s) => s.id === t.specId),
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

  // Get set of spec IDs that already have tokens
  const existingTokenSpecIds = new Set(tokens.map((t) => t.specId));

  async function handleDelete(tokenInfo: TokenWithSpec) {
    const specName = tokenInfo.spec?.name || tokenInfo.specId;
    const confirmed = await confirmAlert({
      title: "Delete Token",
      message: `Are you sure you want to delete the token for "${specName}"?`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      await deleteToken(tokenInfo.specId);
      await loadTokens();
      await showToast({
        style: Toast.Style.Success,
        title: "Token deleted",
        message: `Token for ${specName} has been removed`,
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
            target={
              <SetTokenForm
                mode="new"
                availableSpecs={specs}
                existingTokenSpecIds={existingTokenSpecIds}
                onSave={loadTokens}
              />
            }
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
                target={
                  <SetTokenForm
                    mode="new"
                    availableSpecs={specs}
                    existingTokenSpecIds={existingTokenSpecIds}
                    onSave={loadTokens}
                  />
                }
                icon={Icon.Plus}
              />
            </ActionPanel>
          }
        />
      ) : (
        tokens.map((tokenInfo) => {
          const isUnassigned = isUnassignedToken(tokenInfo.specId);
          const isOrphan = !tokenInfo.spec && !isUnassigned;
          const specName = isUnassigned
            ? getUnassignedTokenName(tokenInfo.specId)
            : tokenInfo.spec?.name || "Unknown Spec";

          // Determine status
          let statusTag: { value: string; color: Color };
          let statusTooltip: string;
          if (isUnassigned) {
            statusTag = { value: "Unassigned", color: Color.Blue };
            statusTooltip = "Not linked to any spec yet";
          } else if (isOrphan) {
            statusTag = { value: "Orphaned", color: Color.Orange };
            statusTooltip = "Spec no longer exists";
          } else {
            statusTag = { value: "Active", color: Color.Green };
            statusTooltip = "Linked to spec";
          }

          return (
            <List.Item
              key={tokenInfo.specId}
              title={specName}
              subtitle={obfuscateToken(tokenInfo.token)}
              icon={{
                source: Icon.Key,
                tintColor: isUnassigned ? Color.Blue : isOrphan ? Color.Orange : Color.Green,
              }}
              accessories={[
                { tag: statusTag, tooltip: statusTooltip },
                tokenInfo.spec?.baseUrl ? { text: tokenInfo.spec.baseUrl, tooltip: "Base URL" } : {},
              ]}
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <Action.Push
                      title="Update Token"
                      target={
                        <SetTokenForm
                          mode="edit"
                          specId={tokenInfo.specId}
                          specName={specName}
                          onSave={loadTokens}
                          currentToken={tokenInfo.token}
                          availableSpecs={specs}
                        />
                      }
                      icon={Icon.Pencil}
                    />
                    <Action.Push
                      title="Add New Token"
                      target={
                        <SetTokenForm
                          mode="new"
                          availableSpecs={specs}
                          existingTokenSpecIds={existingTokenSpecIds}
                          onSave={loadTokens}
                        />
                      }
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
                      title="Copy Spec ID"
                      content={tokenInfo.specId}
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
