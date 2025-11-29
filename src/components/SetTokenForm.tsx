import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import { setToken, deleteToken } from "../lib/secure-storage";
import { getErrorMessage } from "../lib/toast-utils";
import { StoredSpec } from "../types/openapi";

const UNASSIGNED_SPEC_VALUE = "__unassigned__";

export interface SetTokenFormProps {
  /** Called after token is saved. Receives the token string if saved successfully */
  onSave: (token?: string) => void;
  /** Current spec ID (for editing or fixed spec context) */
  specId?: string;
  /** Current spec name (for fixed spec context display) */
  specName?: string;
  /** Current token value (for editing) */
  currentToken?: string;
  /** Available specs to choose from (enables spec selection dropdown) */
  availableSpecs?: StoredSpec[];
  /** Set of spec IDs that already have tokens (to filter out from new token dropdown) */
  existingTokenSpecIds?: Set<string>;
  /** Mode: 'new' for adding a new token, 'edit' for editing existing */
  mode?: "new" | "edit";
  /** Allow creating tokens without assigning to a spec */
  allowUnassigned?: boolean;
}

export function SetTokenForm({
  onSave,
  specId,
  specName,
  currentToken,
  availableSpecs,
  existingTokenSpecIds,
  mode = specId ? "edit" : "new",
  allowUnassigned = true,
}: SetTokenFormProps) {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);

  // Determine if this is a fixed spec context (spec provided without available specs to choose from)
  const isFixedSpec = Boolean(specId && !availableSpecs);

  // For fixed spec, don't allow unassigned
  const effectiveAllowUnassigned = allowUnassigned && !isFixedSpec;

  const [selectedSpecId, setSelectedSpecId] = useState(
    specId || (effectiveAllowUnassigned ? UNASSIGNED_SPEC_VALUE : ""),
  );
  const [tokenName, setTokenName] = useState("");

  const isUnassigned = selectedSpecId === UNASSIGNED_SPEC_VALUE;

  // For new tokens, filter out specs that already have tokens
  const selectableSpecs =
    mode === "new" && existingTokenSpecIds
      ? availableSpecs?.filter((s) => !existingTokenSpecIds.has(s.id))
      : availableSpecs;

  // Find the selected spec name for display
  const selectedSpecName = availableSpecs?.find((s) => s.id === selectedSpecId)?.name || specName || "Unknown Spec";

  // Determine if we should show a dropdown or fixed spec
  const showSpecDropdown =
    !isFixedSpec && ((selectableSpecs && selectableSpecs.length > 0) || effectiveAllowUnassigned);

  async function handleSubmit(values: { token: string; specId?: string; tokenName?: string }) {
    let targetSpecId = values.specId || selectedSpecId;

    // If unassigned, generate a unique ID using the token name
    if (targetSpecId === UNASSIGNED_SPEC_VALUE) {
      const name = values.tokenName?.trim() || tokenName.trim();
      if (!name) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Token name required",
          message: "Please enter a name for this token",
        });
        return;
      }
      // Create a unique ID for unassigned tokens
      targetSpecId = `unassigned-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    }

    if (!targetSpecId) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Please select a spec",
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
      // If editing and spec changed, delete the old token
      if (mode === "edit" && specId && targetSpecId !== specId && currentToken) {
        await deleteToken(specId);
      }

      await setToken(targetSpecId, values.token);
      onSave(values.token);

      const displayName =
        isUnassigned && (values.tokenName?.trim() || tokenName.trim())
          ? values.tokenName?.trim() || tokenName.trim()
          : availableSpecs?.find((s) => s.id === targetSpecId)?.name || specName || targetSpecId;
      await showToast({
        style: Toast.Style.Success,
        title: "Token saved",
        message: `Token saved securely${isUnassigned ? "" : ` for ${displayName}`}`,
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

  // Determine navigation title
  const getNavigationTitle = () => {
    if (mode === "new") return "Add New Token";
    if (isFixedSpec) return `Set Token for ${specName}`;
    return "Edit Token";
  };

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={getNavigationTitle()}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Token" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      {showSpecDropdown ? (
        <Form.Dropdown
          id="specId"
          title="API Spec"
          value={selectedSpecId}
          onChange={setSelectedSpecId}
          info="Select which API spec this token should be used for, or leave unassigned"
        >
          {effectiveAllowUnassigned && (
            <Form.Dropdown.Item value={UNASSIGNED_SPEC_VALUE} title="No spec (save for later)" icon={Icon.Clock} />
          )}
          {selectableSpecs?.map((spec) => (
            <Form.Dropdown.Item key={spec.id} value={spec.id} title={spec.name} icon={Icon.Document} />
          ))}
        </Form.Dropdown>
      ) : isFixedSpec ? (
        <Form.Description title="API Spec" text={specName || ""} />
      ) : null}
      {isUnassigned && (
        <Form.TextField
          id="tokenName"
          title="Token Name"
          placeholder="e.g., My API Token, Production Key"
          value={tokenName}
          onChange={setTokenName}
          info="Give this token a name so you can identify it later"
        />
      )}
      <Form.PasswordField
        id="token"
        title="API Token"
        placeholder="Enter your API token"
        defaultValue={currentToken}
        info="This token will be stored securely in your system keychain"
      />
      <Form.Description
        title="Security"
        text="Your token is stored in the macOS Keychain and will be used when generating cURL commands for this API."
      />
    </Form>
  );
}
