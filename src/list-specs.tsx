import { Action, ActionPanel, Alert, Color, confirmAlert, Icon, List, showToast, Toast } from "@raycast/api";
import AddOpenAPISpec from "./add-openapi-spec";
import { deleteSpec, duplicateSpec } from "./lib/storage";
import { useSpecs } from "./hooks";
import { BrowseEndpoints, EditSpecForm, SetTokenForm } from "./components";
import { StoredSpec } from "./types/openapi";

// Re-export BrowseEndpoints for use in other commands
export { BrowseEndpoints } from "./components";

export default function ListSpecs() {
  const { specs, specsWithToken, isLoading, refresh } = useSpecs();

  async function handleDelete(spec: StoredSpec) {
    const confirmed = await confirmAlert({
      title: "Delete Spec",
      message: `Are you sure you want to delete "${spec.name}"?`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      await deleteSpec(spec.id);
      await refresh();
      await showToast({
        style: Toast.Style.Success,
        title: "Spec deleted",
      });
    }
  }

  async function handleDuplicate(spec: StoredSpec) {
    const duplicated = await duplicateSpec(spec.id);
    if (duplicated) {
      await refresh();
      await showToast({
        style: Toast.Style.Success,
        title: "Spec duplicated",
        message: duplicated.name,
      });
    }
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search API specs...">
      {specs.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No API Specs"
          description="Add an OpenAPI specification to get started"
          actions={
            <ActionPanel>
              <Action.Push title="Add Spec" target={<AddOpenAPISpec />} icon={Icon.Plus} />
            </ActionPanel>
          }
        />
      ) : (
        specs.map((spec) => (
          <List.Item
            key={spec.id}
            title={spec.name}
            subtitle={spec.baseUrl}
            accessories={[
              specsWithToken.has(spec.id)
                ? { icon: Icon.Key, tooltip: "Token Set", tag: { value: "Auth", color: Color.Green } }
                : { tag: { value: "No Auth", color: Color.SecondaryText } },
              { date: new Date(spec.addedAt), tooltip: "Added" },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Browse Endpoints"
                  target={<BrowseEndpoints spec={spec} onTokenChange={refresh} />}
                  icon={Icon.List}
                />
                <Action.Push
                  title="Set API Token"
                  target={<SetTokenForm specId={spec.id} specName={spec.name} onSave={refresh} />}
                  icon={Icon.Key}
                  shortcut={{ modifiers: ["cmd"], key: "t" }}
                />
                <Action.Push
                  title="Edit Spec"
                  target={<EditSpecForm spec={spec} onSave={refresh} />}
                  icon={Icon.Pencil}
                  shortcut={{ modifiers: ["cmd"], key: "e" }}
                />
                <Action.Push title="Add New Spec" target={<AddOpenAPISpec />} icon={Icon.Plus} />
                <Action.OpenInBrowser title="Open Spec URL" url={spec.url} />
                <Action
                  title="Duplicate Spec"
                  icon={Icon.CopyClipboard}
                  shortcut={{ modifiers: ["cmd"], key: "d" }}
                  onAction={() => handleDuplicate(spec)}
                />
                <Action
                  title="Delete Spec"
                  style={Action.Style.Destructive}
                  icon={Icon.Trash}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={() => handleDelete(spec)}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
