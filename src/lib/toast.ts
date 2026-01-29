import { toast } from "sonner";

/**
 * Show a success toast notification
 * @param message - The message to display
 */
export function showSuccessToast(message: string) {
  toast.success(message);
}

/**
 * Show an error toast notification
 * @param message - The message to display
 */
export function showErrorToast(message: string) {
  toast.error(message);
}

/**
 * Show an info toast notification
 * @param message - The message to display
 */
export function showInfoToast(message: string) {
  toast.info(message);
}

/**
 * Show a warning toast notification
 * @param message - The message to display
 */
export function showWarningToast(message: string) {
  toast.warning(message);
}

/**
 * Show a loading toast that can be updated
 * @param message - The message to display
 * @returns The toast ID for updating later
 */
export function showLoadingToast(message: string) {
  return toast.loading(message);
}

/**
 * Dismiss a specific toast or all toasts
 * @param toastId - Optional toast ID to dismiss. If not provided, dismisses all toasts.
 */
export function dismissToast(toastId?: string | number) {
  toast.dismiss(toastId);
}

/**
 * Show a promise-based toast that updates automatically
 * @param promise - The promise to track
 * @param messages - Messages for loading, success, and error states
 */
export function showPromiseToast<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: Error) => string);
  }
) {
  return toast.promise(promise, messages);
}
