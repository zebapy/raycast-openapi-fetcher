import { Action, ActionPanel, Icon, List, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import { addSpec, fetchSpec, cacheSpec, generateSpecId } from "./lib/storage";
import { getBaseUrl } from "./lib/openapi-parser";
import { BrowseEndpoints } from "./list-specs";
import popularSpecsData from "./data/popular-specs.json";

interface PopularSpec {
  name: string;
  description: string;
  url: string;
  category: string;
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
  const [isLoading, setIsLoading] = useState(false);
  const { push } = useNavigation();

  const groupedSpecs = groupByCategory(POPULAR_SPECS);

  async function handleAddSpec(spec: PopularSpec) {
    setIsLoading(true);

    try {
      await showToast({
        style: Toast.Style.Animated,
        title: `Fetching ${spec.name} spec...`,
      });

      const openApiSpec = await fetchSpec(spec.url);
      const baseUrl = getBaseUrl(openApiSpec);
      const specId = generateSpecId();

      await cacheSpec(specId, openApiSpec);

      const savedSpec = await addSpec(
        {
          name: spec.name,
          url: spec.url,
          baseUrl,
        },
        specId,
      );

      await showToast({
        style: Toast.Style.Success,
        title: "Spec added",
        message: `${spec.name} with ${Object.keys(openApiSpec.paths).length} endpoints`,
      });

      push(<BrowseEndpoints spec={savedSpec} />);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await showToast({
        style: Toast.Style.Failure,
        title: `Failed to add ${spec.name}`,
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search popular APIs...">
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
                  <Action title="Add to Collection" icon={Icon.Plus} onAction={() => handleAddSpec(spec)} />
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
