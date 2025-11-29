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

export default function ListTokens() {
  const [tokens, setTokens] = useState<TokenWithSpec[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function loadTokens() {
    setIsLoading(true);
    try {
      const [allTokens, specs] = await Promise.all([listAllTokens(), getSpecs()]);

      // Map tokens to their specs
      const tokensWithSpecs: TokenWithSpec[] = allTokens.map((t) => ({
        ...t,
        spec: specs.find((s) => s.id === t.specId),
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
    <List isLoading={isLoading} searchBarPlaceholder="Search API tokens...">
      {tokens.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No API Tokens"
          description="No API tokens have been stored yet. Add a token from an API spec."
          icon={Icon.Key}
        />
      ) : (
        tokens.map((tokenInfo) => {
          const specName = tokenInfo.spec?.name || "Unknown Spec";
          const isOrphan = !tokenInfo.spec;

          return (
            <List.Item
              key={tokenInfo.specId}
              title={specName}
              subtitle={obfuscateToken(tokenInfo.token)}
              icon={{ source: Icon.Key, tintColor: isOrphan ? Color.Orange : Color.Green }}
              accessories={[
                isOrphan
                  ? { tag: { value: "Orphaned", color: Color.Orange }, tooltip: "Spec no longer exists" }
                  : { tag: { value: "Active", color: Color.Green } },
                tokenInfo.spec?.baseUrl ? { text: tokenInfo.spec.baseUrl, tooltip: "Base URL" } : {},
              ]}
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <Action.Push
                      title="Update Token"
                      target={<SetTokenForm specId={tokenInfo.specId} specName={specName} onSave={loadTokens} />}
                      icon={Icon.Pencil}
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
