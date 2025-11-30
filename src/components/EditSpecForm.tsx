import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import { fetchSpec, updateSpec } from "../lib/storage";
import { validateUrl } from "../lib/validation";
import { getErrorMessage } from "../lib/toast-utils";
import { StoredSpec } from "../types/openapi";

export interface EditSpecFormProps {
  spec: StoredSpec;
  onSave: () => void;
}

export function EditSpecForm({ spec, onSave }: EditSpecFormProps) {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | undefined>();

  async function handleSubmit(values: { name: string; url: string; docsUrlTemplate: string }) {
    if (!values.name.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Name is required",
      });
      return;
    }

    const urlValidationError = validateUrl(values.url);
    if (urlValidationError) {
      setUrlError(urlValidationError);
      return;
    }

    setIsLoading(true);

    try {
      // If URL changed, validate the new spec
      if (values.url !== spec.url) {
        await showToast({
          style: Toast.Style.Animated,
          title: "Validating spec...",
        });
        const newSpec = await fetchSpec(values.url, spec.id);
        await updateSpec(spec.id, {
          name: values.name.trim(),
          url: values.url.trim(),
          baseUrl: newSpec.servers?.[0]?.url || spec.baseUrl,
          docsUrlTemplate: values.docsUrlTemplate.trim() || undefined,
        });
      } else {
        await updateSpec(spec.id, {
          name: values.name.trim(),
          docsUrlTemplate: values.docsUrlTemplate.trim() || undefined,
        });
      }

      onSave();
      await showToast({
        style: Toast.Style.Success,
        title: "Spec updated",
      });
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to update spec",
        message: getErrorMessage(error),
      });
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
      navigationTitle={`Edit ${spec.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Changes" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" defaultValue={spec.name} placeholder="API Name" />
      <Form.TextField
        id="url"
        title="OpenAPI Spec URL"
        defaultValue={spec.url}
        placeholder="https://api.example.com/openapi.json"
        error={urlError}
        onChange={handleUrlChange}
        onBlur={(event) => handleUrlChange(event.target.value)}
      />
      <Form.TextField
        id="docsUrlTemplate"
        title="Docs URL Template"
        defaultValue={spec.docsUrlTemplate || ""}
        placeholder="https://docs.example.com/api/{operationId}"
        info="Optional URL template for API documentation. Use {operationId} as placeholder."
      />
      <Form.Description title="Base URL" text={spec.baseUrl || "Not set"} />
      <Form.Description title="Added" text={new Date(spec.addedAt).toLocaleString()} />
    </Form>
  );
}
