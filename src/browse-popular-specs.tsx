import { Action, ActionPanel, Icon, List, useNavigation } from "@raycast/api";
import AddOpenAPISpec from "./add-openapi-spec";
import popularSpecsData from "./data/popular-specs.json";

interface PopularSpec {
  name: string;
  description: string;
  url: string;
  category: string;
  docsUrlTemplate?: string;
}

const POPULAR_SPECS: PopularSpec[] = popularSpecsData;

// Group specs by category
function groupByCategory(specs: PopularSpec[]): Map<string, PopularSpec[]> {
  const grouped = new Map<string, PopularSpec[]>();
  for (const spec of specs) {
    const existing = grouped.get(spec.category) || [];
    existing.push(spec);
    grouped.set(spec.category, existing);
  }
  return grouped;
}

export default function BrowsePopularSpecs() {
  const { push } = useNavigation();

  const groupedSpecs = groupByCategory(POPULAR_SPECS);

  function handleSelectSpec(spec: PopularSpec) {
    push(
      <AddOpenAPISpec initialUrl={spec.url} initialName={spec.name} initialDocsUrlTemplate={spec.docsUrlTemplate} />,
    );
  }

  return (
    <List searchBarPlaceholder="Search popular APIs...">
      {Array.from(groupedSpecs.entries()).map(([category, specs]) => (
        <List.Section key={category} title={category} subtitle={`${specs.length} APIs`}>
          {specs.map((spec) => (
            <List.Item
              key={spec.name}
              title={spec.name}
              subtitle={spec.description}
              accessories={[{ tag: category }]}
              actions={
                <ActionPanel>
                  <Action title="Add to Collection" icon={Icon.Plus} onAction={() => handleSelectSpec(spec)} />
                  <Action.OpenInBrowser title="View Spec URL" url={spec.url} />
                  <Action.CopyToClipboard
                    title="Copy Spec URL"
                    content={spec.url}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
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
