import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useForm, FormValidation } from "@raycast/utils";
import { saveToken, updateToken, StoredToken } from "../lib/secure-storage";
import { getErrorMessage } from "../lib/toast-utils";
import { StoredSpec } from "../types/openapi";

interface FormValues {
  tokenName: string;
  defaultSpecId: string;
  token: string;
}

export interface SetTokenFormProps {
  /** Called after token is saved */
  onSave: () => void;
  /** Available specs to choose from as default spec */
  availableSpecs?: StoredSpec[];
  /** Existing token data (for editing) */
  existingToken?: StoredToken;
  /** Mode: 'new' for adding a new token, 'edit' for editing existing */
  mode?: "new" | "edit";
  /** Pre-select a spec ID (useful when adding token from a spec context) */
  preselectedSpecId?: string;
}

export function SetTokenForm({
  onSave,
  availableSpecs = [],
  existingToken,
  mode = existingToken ? "edit" : "new",
  preselectedSpecId,
}: SetTokenFormProps) {
  const { pop } = useNavigation();

  const { handleSubmit, itemProps } = useForm<FormValues>({
    async onSubmit(values) {
      try {
        if (mode === "edit" && existingToken) {
          await updateToken(existingToken.id, {
            name: values.tokenName.trim(),
            token: values.token,
            defaultSpecId: values.defaultSpecId || undefined,
          });
        } else {
          await saveToken({
            name: values.tokenName.trim(),
            token: values.token,
            defaultSpecId: values.defaultSpecId || undefined,
          });
        }

        const specName = values.defaultSpecId
          ? availableSpecs.find((s) => s.id === values.defaultSpecId)?.name || values.defaultSpecId
          : null;
        await showToast({
          style: Toast.Style.Success,
          title: mode === "edit" ? "Token updated" : "Token saved",
          message: specName
            ? `"${values.tokenName.trim()}" will be used for ${specName}`
            : `"${values.tokenName.trim()}" saved`,
        });
        onSave();
        pop();
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to save token",
          message: getErrorMessage(error),
        });
      }
    },
    initialValues: {
      tokenName: existingToken?.name || "",
      defaultSpecId: existingToken?.defaultSpecId || preselectedSpecId || "",
      token: existingToken?.token || "",
    },
    validation: {
      tokenName: FormValidation.Required,
      token: FormValidation.Required,
    },
  });

  return (
    <Form
      navigationTitle={mode === "new" ? "Add New Token" : "Edit Token"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Token" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        {...itemProps.tokenName}
        title="Token Name"
        placeholder="e.g., Production API Key, Dev Token"
        info="A descriptive name to identify this token"
      />
      <Form.Dropdown
        {...itemProps.defaultSpecId}
        title="Default Spec"
        info="Optionally link this token to a spec for automatic use"
      >
        <Form.Dropdown.Item value="" title="None (no default spec)" icon={Icon.MinusCircle} />
        {availableSpecs.map((spec) => (
          <Form.Dropdown.Item key={spec.id} value={spec.id} title={spec.name} icon={Icon.Document} />
        ))}
      </Form.Dropdown>
      <Form.PasswordField {...itemProps.token} title="API Token" placeholder="Enter your API token" />
      <Form.Description
        title="Security"
        text="Tokens are stored in Raycast's local encrypted database and can only be accessed by this extension. To clear all data, use 'Clear Local Storage' in Raycast Preferences → Extensions → OpenAPI Fetcher."
      />
    </Form>
  );
}
