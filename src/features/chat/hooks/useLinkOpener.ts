import { useCallback, useEffect, useRef, useState } from 'react';
import { LinkOpenerController, type OpenUrlResult, type OpenUrlStatus } from '@infra/opener';

export interface UseLinkOpenerOptions {
  timeoutMs?: number;
  debounceMs?: number;
  openFn?: (url: string) => Promise<OpenUrlResult>;
}

/**
 * React hook wrapping LinkOpenerController with unmount cleanup and StrictMode safety.
 *
 * Lifted out of `infra/opener.ts` (T5e, observation carried forward from T3b): the
 * controller is framework-agnostic and belongs in `infra/`; this hook is React glue and
 * belongs on the UI side. Moved verbatim, including the pre-existing duplication between
 * the render-time and effect-time controller (re)creation below - not redesigned in this
 * slice.
 */
export function useLinkOpener(
  href: string,
  options?: UseLinkOpenerOptions
) {
  const [status, setStatus] = useState<OpenUrlStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const controllerRef = useRef<LinkOpenerController | null>(null);

  const getController = useCallback(() => {
    if (!controllerRef.current || controllerRef.current.isDisposed()) {
      controllerRef.current = new LinkOpenerController(
        {
          onStateChange: (newStatus, newError) => {
            setStatus(newStatus);
            setError(newError ?? null);
          },
        },
        options
      );
    }
    return controllerRef.current;
  }, [options]);

  if (!controllerRef.current || controllerRef.current.isDisposed()) {
    controllerRef.current = new LinkOpenerController(
      {
        onStateChange: (newStatus, newError) => {
          setStatus(newStatus);
          setError(newError ?? null);
        },
      },
      options
    );
  }

  useEffect(() => {
    // If controller was disposed by an earlier unmount cleanup (e.g. React StrictMode), recreate it
    if (!controllerRef.current || controllerRef.current.isDisposed()) {
      controllerRef.current = new LinkOpenerController(
        {
          onStateChange: (newStatus, newError) => {
            setStatus(newStatus);
            setError(newError ?? null);
          },
        },
        options
      );
    }

    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [options]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      void getController().handleClick(e, href);
    },
    [getController, href]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      void getController().handleKeyDown(e, href);
    },
    [getController, href]
  );

  const triggerOpen = useCallback(
    () => getController().activate(href),
    [getController, href]
  );

  return {
    status,
    error,
    handleClick,
    handleKeyDown,
    triggerOpen,
  };
}
