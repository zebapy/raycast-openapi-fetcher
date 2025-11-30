import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@raycast/api";
import { useForm, FormValidation } from "@raycast/utils";
import { fetchSpec, updateSpec } from "../lib/storage";
import { validateUrl } from "../lib/validation";
import { getErrorMessage } from "../lib/toast-utils";
import { StoredSpec } from "../types/openapi";

interface FormValues {
  name: string;
  url: string;
  docsUrlTemplate: string;
}

export interface EditSpecFormProps {
  spec: StoredSpec;
  onSave: () => void;
}

export function EditSpecForm({ spec, onSave }: EditSpecFormProps) {
  const { pop } = useNavigation();

  const { handleSubmit, itemProps } = useForm<FormValues>({
    async onSubmit(values) {
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
      }
    },
    initialValues: {
      name: spec.name,
      url: spec.url,
      docsUrlTemplate: spec.docsUrlTemplate || "",
    },
    validation: {
      name: FormValidation.Required,
      url: (value) => {
        if (!value) return "URL is required";
        return validateUrl(value);
      },
    },
  });

  return (
    <Form
      navigationTitle={`Edit ${spec.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Changes" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField {...itemProps.name} title="Name" placeholder="API Name" />
      <Form.TextField {...itemProps.url} title="OpenAPI Spec URL" placeholder="https://api.example.com/openapi.json" />
      <Form.TextField
        {...itemProps.docsUrlTemplate}
        title="Docs URL Template"
        placeholder="https://docs.example.com/api/{operationId}"
        info="Optional URL template for API documentation. Use {operationId} as placeholder."
      />
      <Form.Description title="Base URL" text={spec.baseUrl || "Not set"} />
      <Form.Description title="Added" text={new Date(spec.addedAt).toLocaleString()} />
    </Form>
  );
}
