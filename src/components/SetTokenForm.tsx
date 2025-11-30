import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import { saveToken, updateToken, StoredToken } from "../lib/secure-storage";
import { getErrorMessage } from "../lib/toast-utils";
import { StoredSpec } from "../types/openapi";

export interface SetTokenFormProps {
  /** Called after token is saved */
  onSave: () => void;
  /** Available specs to choose from as default spec */
  availableSpecs: StoredSpec[];
  /** Existing token data (for editing) */
  existingToken?: StoredToken;
  /** Mode: 'new' for adding a new token, 'edit' for editing existing */
  mode?: "new" | "edit";
  /** Pre-select a spec ID (useful when adding token from a spec context) */
  preselectedSpecId?: string;
}

export function SetTokenForm({
  onSave,
  availableSpecs,
  existingToken,
  mode = existingToken ? "edit" : "new",
  preselectedSpecId,
}: SetTokenFormProps) {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);

  const [tokenName, setTokenName] = useState(existingToken?.name || "");
  const [selectedSpecId, setSelectedSpecId] = useState(existingToken?.defaultSpecId || preselectedSpecId || "");

  async function handleSubmit(values: { token: string }) {
    if (!tokenName.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Name required",
        message: "Please enter a name for this token",
      });
      return;
    }

    if (!selectedSpecId) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Default spec required",
        message: "Please select a default spec for this token",
      });
      return;
    }

    if (!values.token) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Token is required",
      });
      return;
    }

    setIsLoading(true);

    try {
      if (mode === "edit" && existingToken) {
        await updateToken(existingToken.id, {
          name: tokenName.trim(),
          token: values.token,
          defaultSpecId: selectedSpecId,
        });
      } else {
        await saveToken({
          name: tokenName.trim(),
          token: values.token,
          defaultSpecId: selectedSpecId,
        });
      }

      const specName = availableSpecs.find((s) => s.id === selectedSpecId)?.name || selectedSpecId;
      await showToast({
        style: Toast.Style.Success,
        title: mode === "edit" ? "Token updated" : "Token saved",
        message: `"${tokenName.trim()}" will be used for ${specName}`,
      });
      onSave();
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to save token",
        message: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={mode === "new" ? "Add New Token" : "Edit Token"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Token" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="tokenName"
        title="Token Name"
        placeholder="e.g., Production API Key, Dev Token"
        value={tokenName}
        onChange={setTokenName}
        info="A descriptive name to identify this token"
      />
      <Form.Dropdown
        id="defaultSpecId"
        title="Default Spec"
        value={selectedSpecId}
        onChange={setSelectedSpecId}
        info="This token will be automatically used when making requests to this spec"
      >
        <Form.Dropdown.Item value="" title="Select a spec..." icon={Icon.Document} />
        {availableSpecs.map((spec) => (
          <Form.Dropdown.Item key={spec.id} value={spec.id} title={spec.name} icon={Icon.Document} />
        ))}
      </Form.Dropdown>
      <Form.PasswordField
        id="token"
        title="API Token"
        placeholder="Enter your API token"
        defaultValue={existingToken?.token}
      />
      <Form.Description
        title="Security"
        text="Tokens are stored in Raycast's local encrypted database and can only be accessed by this extension. To clear all data, use 'Clear Local Storage' in Raycast Preferences → Extensions → OpenAPI Fetcher."
      />
    </Form>
  );
}
