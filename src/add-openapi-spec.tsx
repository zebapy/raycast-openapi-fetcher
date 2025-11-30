import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@raycast/api";
import { useForm } from "@raycast/utils";
import { addSpec, fetchSpec, cacheSpec, generateSpecId } from "./lib/storage";
import { getBaseUrl, parseAndValidateSpec } from "./lib/openapi-parser";
import { validateUrl } from "./lib/validation";
import { showErrorToast } from "./lib/toast-utils";
import { readFile } from "fs/promises";
import { BrowseEndpoints } from "./components";
import { OpenAPISpec } from "./types/openapi";
import popularSpecs from "./data/popular-specs.json";

type SourceType = "popular" | "url" | "paste" | "file";

interface PopularSpec {
  name: string;
  description: string;
  url: string;
  category: string;
  siteUrl: string;
  docsUrlTemplate?: string;
}

interface FormValues {
  sourceType: SourceType;
  popularSpec: string;
  url: string;
  content: string;
  filePath: string[];
  name: string;
}

export interface AddOpenAPISpecProps {
  initialUrl?: string;
  initialName?: string;
  initialDocsUrlTemplate?: string;
}

export default function AddOpenAPISpec({ initialUrl, initialName, initialDocsUrlTemplate }: AddOpenAPISpecProps = {}) {
  const { push, pop } = useNavigation();

  const { handleSubmit, itemProps, values } = useForm<FormValues>({
    async onSubmit(values) {
      try {
        let spec: OpenAPISpec;
        let sourceUrl: string | undefined;
        let docsUrlTemplate: string | undefined = initialDocsUrlTemplate;

        switch (values.sourceType) {
          case "popular": {
            const selected = (popularSpecs as PopularSpec[]).find((s) => s.url === values.popularSpec);
            if (!selected) {
              throw new Error("Please select a popular spec");
            }

            await showToast({
              style: Toast.Style.Animated,
              title: `Fetching ${selected.name} spec...`,
            });

            spec = await fetchSpec(selected.url);
            sourceUrl = selected.url;
            docsUrlTemplate = selected.docsUrlTemplate;
            break;
          }

          case "url": {
            await showToast({
              style: Toast.Style.Animated,
              title: "Fetching OpenAPI spec...",
            });

            spec = await fetchSpec(values.url);
            sourceUrl = values.url;
            break;
          }

          case "paste": {
            await showToast({
              style: Toast.Style.Animated,
              title: "Parsing spec...",
            });

            spec = await parseAndValidateSpec(values.content);
            break;
          }

          case "file": {
            await showToast({
              style: Toast.Style.Animated,
              title: "Reading file...",
            });

            const fileContent = await readFile(values.filePath[0], "utf-8");
            spec = await parseAndValidateSpec(fileContent);
            sourceUrl = `file://${values.filePath[0]}`;
            break;
          }
        }

        const baseUrl = getBaseUrl(spec);
        const specName = values.name || spec.info.title || "Untitled API";

        // Generate ID and cache the spec
        const specId = generateSpecId();
        await cacheSpec(specId, spec);

        // Save the spec metadata
        const savedSpec = await addSpec(
          {
            name: specName,
            url: sourceUrl || `pasted:${Date.now()}`,
            baseUrl,
            docsUrlTemplate,
          },
          specId,
        );

        await showToast({
          style: Toast.Style.Success,
          title: "Spec added successfully",
          message: `${savedSpec.name} with ${Object.keys(spec.paths || {}).length} paths`,
        });

        // If we came from popular specs (has initialUrl), pop first so back navigation
        // returns to the list specs view instead of the add form
        if (initialUrl) {
          pop();
        }
        push(<BrowseEndpoints spec={savedSpec} />);
      } catch (error) {
        await showErrorToast("Failed to add spec", error);
      }
    },
    initialValues: {
      sourceType: "url",
      popularSpec: "",
      url: initialUrl || "",
      content: "",
      filePath: [],
      name: initialName || "",
    },
    validation: {
      popularSpec: (value) => {
        if (values.sourceType !== "popular") return undefined;
        if (!value) return "Please select a popular spec";
        return undefined;
      },
      url: (value) => {
        if (values.sourceType !== "url") return undefined;
        if (!value) return "URL is required";
        return validateUrl(value);
      },
      content: (value) => {
        if (values.sourceType !== "paste") return undefined;
        if (!value?.trim()) return "Spec content is required";
        return undefined;
      },
      filePath: (value) => {
        if (values.sourceType !== "file") return undefined;
        if (!value || value.length === 0) return "Please select a file";
        return undefined;
      },
    },
  });

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Spec" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id={itemProps.sourceType.id}
        title="Source"
        value={values.sourceType}
        onChange={(newValue) => itemProps.sourceType.onChange?.(newValue as SourceType)}
      >
        <Form.Dropdown.Item value="url" title="Fetch from URL" icon="🌐" />
        <Form.Dropdown.Item value="paste" title="Paste JSON/YAML Content" icon="📋" />
        <Form.Dropdown.Item value="file" title="Read from File" icon="📁" />
        <Form.Dropdown.Item value="popular" title="Popular APIs" icon="⭐" />
      </Form.Dropdown>

      {values.sourceType === "url" && (
        <Form.TextField
          {...itemProps.url}
          title="OpenAPI Spec URL"
          placeholder="https://api.example.com/openapi.json"
        />
      )}

      {values.sourceType === "paste" && (
        <Form.TextArea
          {...itemProps.content}
          title="Spec Content"
          placeholder='Paste your OpenAPI JSON or YAML here...\n\n{"openapi": "3.0.0", ...}\n\nor\n\nopenapi: "3.0.0"\ninfo:\n  title: My API'
          enableMarkdown={false}
        />
      )}

      {values.sourceType === "file" && (
        <Form.FilePicker
          {...itemProps.filePath}
          title="Spec File"
          allowMultipleSelection={false}
          canChooseDirectories={false}
        />
      )}

      {values.sourceType === "popular" && (
        <Form.Dropdown
          {...itemProps.popularSpec}
          title="Popular API"
          info="Choose from a curated list of popular API specs"
        >
          <Form.Dropdown.Item value="" title="Select an API..." />
          {(popularSpecs as PopularSpec[]).map((spec) => (
            <Form.Dropdown.Item
              key={spec.url}
              value={spec.url}
              title={spec.name}
              icon={
                spec.category === "AI & ML"
                  ? "🤖"
                  : spec.category === "Developer Tools"
                    ? "🛠️"
                    : spec.category === "Communication"
                      ? "💬"
                      : spec.category === "Payments & Finance"
                        ? "💳"
                        : spec.category === "Cloud & Infrastructure"
                          ? "☁️"
                          : spec.category === "Security"
                            ? "🔒"
                            : spec.category === "Media & Entertainment"
                              ? "🎵"
                              : spec.category === "Games"
                                ? "🎮"
                                : "📦"
              }
            />
          ))}
        </Form.Dropdown>
      )}

      <Form.TextField
        {...itemProps.name}
        title="Name (optional)"
        placeholder="Leave empty to use spec title"
        info="A friendly name for this API spec. If left empty, the title from the spec will be used."
      />

      <Form.Description
        title="Supported Formats"
        text="JSON and YAML OpenAPI 3.x specs are supported. The spec will be validated before saving."
      />
    </Form>
  );
}
