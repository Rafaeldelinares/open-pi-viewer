import { useCallback, useEffect, useRef, useState } from 'react';
import { CopyController, type CopyStatus } from '@shared/clipboard';

export interface UseCopyFeedbackOptions {
  timeoutMs?: number;
  copyFn?: (text: string) => Promise<boolean>;
}

/**
 * React hook wrapping CopyController with unmount cleanup and StrictMode safety.
 *
 * Lifted out of `shared/clipboard.ts` (T5e, observation carried forward from T3b): the
 * controller is framework-agnostic and belongs in `shared/`; this hook is React glue and
 * belongs on the UI side.
 */
export function useCopyFeedback(options?: UseCopyFeedbackOptions) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const controllerRef = useRef<CopyController | null>(null);

  useEffect(() => {
    const controller = new CopyController(
      { onStateChange: (newState) => setStatus(newState) },
      options
    );
    controllerRef.current = controller;

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [options?.timeoutMs, options?.copyFn]);

  const triggerCopy = useCallback(async (text: string): Promise<boolean> => {
    return controllerRef.current ? controllerRef.current.copy(text) : false;
  }, []);

  return { status, triggerCopy };
}
