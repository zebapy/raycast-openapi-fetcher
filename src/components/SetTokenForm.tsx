import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import { setToken } from "../lib/secure-storage";
import { getErrorMessage } from "../lib/toast-utils";

export interface SetTokenFormProps {
  specId: string;
  specName: string;
  /** Called after token is saved. Receives the token string if saved successfully */
  onSave: (token?: string) => void;
}

export function SetTokenForm({ specId, specName, onSave }: SetTokenFormProps) {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(values: { token: string }) {
    if (!values.token) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Token is required",
      });
      return;
    }

    setIsLoading(true);

    try {
      await setToken(specId, values.token);
      onSave(values.token);
      await showToast({
        style: Toast.Style.Success,
        title: "Token saved",
        message: `Token saved securely for ${specName}`,
      });
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
      navigationTitle={`Set Token for ${specName}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Token" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.PasswordField
        id="token"
        title="API Token"
        placeholder="Enter your API token"
        info="This token will be stored securely in your system keychain"
      />
      <Form.Description
        title="Security"
        text="Your token is stored in the macOS Keychain and will be used when generating cURL commands for this API."
      />
    </Form>
  );
}
