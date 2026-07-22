export type LoadOptions<L> = {
  setLoading?: (v: boolean) => void;
  onLoaded?: (content: L) => void;
  onError?: (err: unknown) => void;
  checkMounted?: () => boolean;
};

/**
 * Centralized logic for the "Load Devices" button.
 * - call this from the button's onClick handler
 * - pass setLoading to toggle UI loading state while the promise is pending
 * - pass onDevicesLoaded to receive devices when fulfilled
 * - pass checkMounted to prevent state updates if component unmounts
 */
export async function handleLoadingAction<L>(
  opts: LoadOptions<L> = {},
  loadFunction: () => Promise<L>,
): Promise<L> {
  const { setLoading, onLoaded, onError, checkMounted } = opts;

  if (!checkMounted || checkMounted()) {
    setLoading?.(true);
  }

  try {
    const content: L = await loadFunction();
    if (!checkMounted || checkMounted()) {
      onLoaded?.(content);
    }
    return content;
  } catch (err) {
    if (!checkMounted || checkMounted()) {
      onError?.(err);
    }
    return Promise.reject(err);
  } finally {
    if (!checkMounted || checkMounted()) {
      setLoading?.(false);
    }
  }
}
