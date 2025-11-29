import { showToast, Toast } from "@raycast/api";

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Show error toast with consistent formatting
 */
export async function showErrorToast(title: string, error: unknown): Promise<void> {
  await showToast({
    style: Toast.Style.Failure,
    title,
    message: getErrorMessage(error),
  });
}

/**
 * Show success toast
 */
export async function showSuccessToast(title: string, message?: string): Promise<void> {
  await showToast({
    style: Toast.Style.Success,
    title,
    message,
  });
}

/**
 * Show animated/loading toast
 */
export async function showLoadingToast(title: string): Promise<void> {
  await showToast({
    style: Toast.Style.Animated,
    title,
  });
}
