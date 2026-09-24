/**
 * Host interfaces enabling complete dependency injection for clipboard operations in Node.
 */
export interface ClipboardHost {
  clipboard?: {
    writeText: (text: string) => Promise<void>;
  };
  document?: {
    createElement: (tagName: string) => any;
    body: {
      appendChild: (child: any) => void;
      removeChild: (child: any) => void;
      contains?: (child: any) => boolean;
    };
    execCommand?: (commandId: string) => boolean;
    activeElement?: any;
    getSelection?: () => any;
  };
  window?: {
    getSelection?: () => any;
  };
}

export interface CopyTextOptions {
  host?: ClipboardHost;
}

/**
 * Copies text using standard Web Clipboard API when available with transient textarea fallback.
 * Restores previous selection and focus, guarantees DOM node removal, and avoids logging payload text.
 */
export async function copyText(text: string, options?: CopyTextOptions): Promise<boolean> {
  const host = options?.host ?? {
    clipboard: typeof navigator !== 'undefined' && navigator.clipboard ? navigator.clipboard : undefined,
    document: typeof document !== 'undefined' ? document : undefined,
    window: typeof window !== 'undefined' ? window : undefined,
  };

  // Primary: Navigator Clipboard API
  if (host.clipboard && typeof host.clipboard.writeText === 'function') {
    try {
      await host.clipboard.writeText(text);
      return true;
    } catch {
      // Permission rejected, headless context, or insecure origin; fall through to textarea fallback
    }
  }

  // Fallback: transient textarea with execCommand('copy')
  const doc = host.document;
  if (!doc || !doc.body) {
    return false;
  }

  const prevActive = doc.activeElement;
  const win = host.window;
  const selection = doc.getSelection ? doc.getSelection() : (win?.getSelection ? win.getSelection() : undefined);

  const prevRanges: any[] = [];
  if (selection && typeof selection.rangeCount === 'number' && selection.rangeCount > 0) {
    for (let i = 0; i < selection.rangeCount; i++) {
      if (typeof selection.getRangeAt === 'function') {
        prevRanges.push(selection.getRangeAt(i));
      }
    }
  }

  const textarea = doc.createElement('textarea');
  textarea.value = text;
  if (typeof textarea.setAttribute === 'function') {
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');
  }
  if (textarea.style) {
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
  }

  let success = false;
  try {
    doc.body.appendChild(textarea);
    if (typeof textarea.select === 'function') {
      textarea.select();
    }
    if (typeof textarea.setSelectionRange === 'function') {
      textarea.setSelectionRange(0, text.length);
    }
    if (typeof doc.execCommand === 'function') {
      success = doc.execCommand('copy') === true;
    }
  } catch {
    success = false;
  } finally {
    // Ensure transient node is removed
    try {
      if (textarea.parentNode && typeof textarea.parentNode.removeChild === 'function') {
        textarea.parentNode.removeChild(textarea);
      } else if (doc.body.contains && doc.body.contains(textarea)) {
        doc.body.removeChild(textarea);
      } else if (typeof doc.body.removeChild === 'function') {
        doc.body.removeChild(textarea);
      }
    } catch {
      // Ignore removal failure
    }

    // Restore selection
    if (selection) {
      try {
        if (typeof selection.removeAllRanges === 'function') {
          selection.removeAllRanges();
        }
        if (typeof selection.addRange === 'function') {
          for (const range of prevRanges) {
            selection.addRange(range);
          }
        }
      } catch {
        // Ignore restore selection failure
      }
    }

    // Restore focus
    if (prevActive && typeof prevActive.focus === 'function') {
      try {
        prevActive.focus();
      } catch {
        // Ignore focus restoration failure
      }
    }
  }

  return success;
}

export type CopyStatus = 'idle' | 'copied' | 'failed';

export interface CopyControllerCallbacks {
  onStateChange: (state: CopyStatus) => void;
}

/**
 * Unmount-safe and StrictMode-safe controller managing copy feedback status and timeout reset.
 * Supports complete independent testing in Node without React or DOM dependencies.
 */
export class CopyController {
  private state: CopyStatus = 'idle';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly timeoutMs: number;
  private readonly callbacks: CopyControllerCallbacks;
  private readonly copyFn: (text: string) => Promise<boolean>;

  constructor(
    callbacks: CopyControllerCallbacks,
    options?: {
      timeoutMs?: number;
      copyFn?: (text: string) => Promise<boolean>;
    }
  ) {
    this.callbacks = callbacks;
    this.timeoutMs = options?.timeoutMs ?? 2000;
    this.copyFn = options?.copyFn ?? copyText;
  }

  public getState(): CopyStatus {
    return this.state;
  }

  public async copy(text: string): Promise<boolean> {
    if (this.disposed) return false;
    this.clearTimer();

    const success = await this.copyFn(text);
    if (this.disposed) return success;

    this.setState(success ? 'copied' : 'failed');

    this.timer = setTimeout(() => {
      if (!this.disposed) {
        this.setState('idle');
      }
      this.timer = null;
    }, this.timeoutMs);

    return success;
  }

  public dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setState(newState: CopyStatus): void {
    this.state = newState;
    if (!this.disposed) {
      this.callbacks.onStateChange(newState);
    }
  }
}

