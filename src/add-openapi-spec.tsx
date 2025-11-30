import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import { addSpec, fetchSpec, cacheSpec, generateSpecId } from "./lib/storage";
import { getBaseUrl, parseAndValidateSpec } from "./lib/openapi-parser";
import { validateUrl } from "./lib/validation";
import { showErrorToast } from "./lib/toast-utils";
import { readFile } from "fs/promises";
import { BrowseEndpoints } from "./components";
import { OpenAPISpec } from "./types/openapi";

type SourceType = "url" | "paste" | "file";

interface FormValues {
  sourceType: SourceType;
  url: string;
  content: string;
  filePath: string[];
  name: string;
}

export interface AddOpenAPISpecProps {
  initialUrl?: string;
  initialName?: string;
}

export default function AddOpenAPISpec({ initialUrl, initialName }: AddOpenAPISpecProps = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("url");
  const [urlError, setUrlError] = useState<string | undefined>();
  const [contentError, setContentError] = useState<string | undefined>();
  const [fileError, setFileError] = useState<string | undefined>();
  const { push, pop } = useNavigation();

  async function handleSubmit(values: FormValues) {
    setIsLoading(true);

    try {
      let spec: OpenAPISpec;
      let sourceUrl: string | undefined;

      switch (values.sourceType) {
        case "url": {
          if (!values.url) {
            setUrlError("URL is required");
            setIsLoading(false);
            return;
          }
          try {
            new URL(values.url);
          } catch {
            setUrlError("Invalid URL format");
            setIsLoading(false);
            return;
          }

          await showToast({
            style: Toast.Style.Animated,
            title: "Fetching OpenAPI spec...",
          });

          spec = await fetchSpec(values.url);
          sourceUrl = values.url;
          break;
        }

        case "paste": {
          if (!values.content?.trim()) {
            setContentError("Spec content is required");
            setIsLoading(false);
            return;
          }

          await showToast({
            style: Toast.Style.Animated,
            title: "Parsing spec...",
          });

          spec = await parseAndValidateSpec(values.content);
          break;
        }

        case "file": {
          if (!values.filePath || values.filePath.length === 0) {
            setFileError("Please select a file");
            setIsLoading(false);
            return;
          }

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
    } finally {
      setIsLoading(false);
    }
  }

  function handleUrlChange(value: string | undefined) {
    setUrlError(validateUrl(value));
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Spec" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="sourceType"
        title="Source"
        value={sourceType}
        onChange={(value) => {
          setSourceType(value as SourceType);
          setUrlError(undefined);
          setContentError(undefined);
          setFileError(undefined);
        }}
      >
        <Form.Dropdown.Item value="url" title="Fetch from URL" icon="🌐" />
        <Form.Dropdown.Item value="paste" title="Paste JSON/YAML Content" icon="📋" />
        <Form.Dropdown.Item value="file" title="Read from File" icon="📁" />
      </Form.Dropdown>

      {sourceType === "url" && (
        <Form.TextField
          id="url"
          title="OpenAPI Spec URL"
          placeholder="https://api.example.com/openapi.json"
          defaultValue={initialUrl}
          error={urlError}
          onChange={handleUrlChange}
          onBlur={(event) => handleUrlChange(event.target.value)}
        />
      )}

      {sourceType === "paste" && (
        <Form.TextArea
          id="content"
          title="Spec Content"
          placeholder='Paste your OpenAPI JSON or YAML here...\n\n{"openapi": "3.0.0", ...}\n\nor\n\nopenapi: "3.0.0"\ninfo:\n  title: My API'
          error={contentError}
          onChange={() => setContentError(undefined)}
          enableMarkdown={false}
        />
      )}

      {sourceType === "file" && (
        <Form.FilePicker
          id="filePath"
          title="Spec File"
          allowMultipleSelection={false}
          canChooseDirectories={false}
          error={fileError}
          onChange={() => setFileError(undefined)}
        />
      )}

      <Form.TextField
        id="name"
        title="Name (optional)"
        placeholder="Leave empty to use spec title"
        defaultValue={initialName}
        info="A friendly name for this API spec. If left empty, the title from the spec will be used."
      />

      <Form.Description
        title="Supported Formats"
        text="JSON and YAML OpenAPI 3.x specs are supported. The spec will be validated before saving."
      />
    </Form>
  );
}
