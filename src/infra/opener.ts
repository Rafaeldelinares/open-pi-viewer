import { openExternalUrlPi } from './bridge';
import type { TranslationKey } from '@shared/i18n';
import { isSafeUrl } from '@core/markdown';
import type { OpenUrlResult, OpenUrlStatus } from '@core/types/opener';

export type { OpenUrlResult, OpenUrlStatus };

export interface OpenExternalUrlOptions {
  invokeFn?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  isSafeUrlFn?: (url: string) => boolean;
}

/**
 * Open a safe external URL via bounded Tauri command with defense-in-depth prechecks.
 * Catches all errors and returns structured OpenUrlResult.
 * Sensitive URLs (tokens/query parameters) are NEVER logged to console.
 */
export async function openExternalUrl(
  url: string,
  options?: OpenExternalUrlOptions
): Promise<OpenUrlResult> {
  const checkSafe = options?.isSafeUrlFn ?? isSafeUrl;
  if (!checkSafe(url)) {
    const errorMsg = 'Disallowed or unsafe URL scheme: only http, https, and mailto are permitted';
    console.error('[Opener] Failed to open external link:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }

  try {
    await openExternalUrlPi(url, options?.invokeFn);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Opener] Failed to open external link:', message);
    return {
      success: false,
      error: message,
    };
  }
}

export interface MouseClickEvent {
  button?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export interface KeyboardActionEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export interface LinkOpenerCallbacks {
  onStateChange: (status: OpenUrlStatus, error?: string | null) => void;
}

export interface LinkOpenerControllerOptions {
  timeoutMs?: number;
  debounceMs?: number;
  openFn?: (url: string) => Promise<OpenUrlResult>;
}

/**
 * Pure state controller managing link activation, debouncing, keyboard policy, and timeout resets.
 * Supports complete independent testing in Node without React or DOM dependencies.
 *
 * Interaction contract:
 * - Plain click: prevent default, do NOT open or show failure
 * - Ctrl+click or Meta+click: opens external URL
 * - Ctrl+Enter or Meta+Enter: keyboard activation opens
 * - Plain Enter or Space: does not open
 * - Failure states persist visibly until next eligible activation or explicit reset (not auto-cleared)
 * - Success state resets to idle after timeoutMs
 */
export class LinkOpenerController {
  private state: OpenUrlStatus = 'idle';
  private error: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private lastActivationTime = 0;
  private readonly timeoutMs: number;
  private readonly debounceMs: number;
  private readonly callbacks: LinkOpenerCallbacks;
  private readonly openFn: (url: string) => Promise<OpenUrlResult>;

  constructor(
    callbacks: LinkOpenerCallbacks,
    options?: LinkOpenerControllerOptions
  ) {
    this.callbacks = callbacks;
    this.timeoutMs = options?.timeoutMs ?? 2500;
    this.debounceMs = options?.debounceMs ?? 400;
    this.openFn = options?.openFn ?? openExternalUrl;
  }

  public getState(): OpenUrlStatus {
    return this.state;
  }

  public getError(): string | null {
    return this.error;
  }

  public async activate(href: string): Promise<OpenUrlResult> {
    if (this.disposed) {
      return { success: false, error: 'Disposed' };
    }

    // Safely ignore concurrent activation while already opening
    if (this.state === 'opening') {
      return { success: false, error: 'Activation already in progress' };
    }

    // Debounce rapid duplicate activations (e.g. keydown + synthetic click)
    const now = Date.now();
    if (now - this.lastActivationTime < this.debounceMs) {
      return { success: false, error: 'Activation debounced' };
    }
    this.lastActivationTime = now;

    this.clearTimer();
    this.setState('opening', null);

    const result = await this.openFn(href);

    if (this.disposed) {
      return result;
    }

    if (result.success) {
      this.setState('opened', null);
      this.timer = setTimeout(() => {
        if (!this.disposed) {
          this.setState('idle', null);
        }
        this.timer = null;
      }, this.timeoutMs);
    } else {
      // Visible failure persists until next eligible activation/retry (do not auto-clear after 2.5s)
      this.setState('failed', result.error ?? 'Failed to open link');
    }

    return result;
  }

  public async handleClick(
    e: MouseClickEvent,
    href: string
  ): Promise<OpenUrlResult | null> {
    // Reject non-primary mouse button (e.g. middle click, right click)
    if (e.button !== undefined && e.button !== 0) {
      return null;
    }

    // Plain click must do NOTHING: no preventDefault, no stopPropagation, no state/time change
    const hasModifier = Boolean(e.ctrlKey || e.metaKey);
    if (!hasModifier) {
      return null;
    }

    // Modified eligible click: prevent default, stop propagation, then activate
    e.preventDefault?.();
    e.stopPropagation?.();
    return this.activate(href);
  }

  public async handleKeyDown(
    e: KeyboardActionEvent,
    href: string
  ): Promise<OpenUrlResult | null> {
    const hasModifier = Boolean(e.ctrlKey || e.metaKey);

    // Keyboard: Ctrl/Meta+Enter opens
    if (e.key === 'Enter' && hasModifier) {
      e.preventDefault?.();
      e.stopPropagation?.();
      return this.activate(href);
    }

    // Plain Enter or Space does NOT open and does NOT call preventDefault
    // (allows normal browser scrolling and accessibility behavior)
    return null;
  }

  public isDisposed(): boolean {
    return this.disposed;
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

  private setState(newState: OpenUrlStatus, error: string | null = null): void {
    this.state = newState;
    this.error = error;
    if (!this.disposed) {
      this.callbacks.onStateChange(newState, error);
    }
  }
}

export type PlatformType = 'mac' | 'windows' | 'linux' | 'other';

/**
 * Detect host platform safely across browser, Tauri WebView, and Node environments.
 * Supports explicit dependency injection for deterministic unit testing.
 */
export function detectPlatform(customPlatform?: string): PlatformType {
  if (customPlatform) {
    const cp = customPlatform.toLowerCase();
    if (cp.includes('mac') || cp.includes('darwin')) return 'mac';
    if (cp.includes('win')) return 'windows';
    if (cp.includes('linux')) return 'linux';
    return 'other';
  }

  // Check navigator in browser / WebView
  if (typeof navigator !== 'undefined') {
    const navAny = navigator as unknown as { userAgentData?: { platform?: string } };
    const p = (
      navAny.userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      ''
    ).toLowerCase();
    if (p.includes('mac') || p.includes('darwin')) return 'mac';
    if (p.includes('win')) return 'windows';
    if (p.includes('linux')) return 'linux';
  }

  // Fallback to Node process.platform if running in Node
  if (typeof process !== 'undefined' && process.platform) {
    const pp = process.platform.toLowerCase();
    if (pp.includes('darwin')) return 'mac';
    if (pp.includes('win')) return 'windows';
    if (pp.includes('linux')) return 'linux';
  }

  // Safe default for desktop target (Windows is primary workstation)
  return 'windows';
}

/**
 * Get display key modifier string ('Ctrl' or 'Cmd') based on detected or injected platform.
 */
export function getLinkModifierKey(customPlatform?: string): 'Ctrl' | 'Cmd' {
  const plat = detectPlatform(customPlatform);
  return plat === 'mac' ? 'Cmd' : 'Ctrl';
}

/**
 * Get localized visible hint label for link activation (e.g. 'Ctrl+click to open' or 'Cmd+click to open').
 */
export function getLinkModifierLabel(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  customPlatform?: string
): string {
  const modifier = getLinkModifierKey(customPlatform);
  return t('markdown.link_hint', { modifier });
}

/**
 * Accessible label generator for Markdown links reflecting dynamic opening status and platform modifier.
 */
export function getLinkAriaLabel(
  status: OpenUrlStatus,
  href: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  customPlatform?: string
): string {
  if (status === 'opening') {
    return t('markdown.opening_url_aria', { url: href });
  }
  if (status === 'failed') {
    return t('markdown.open_failed_url_aria', { url: href });
  }
  const modifier = getLinkModifierKey(customPlatform);
  return t('markdown.open_url_aria', { url: href, modifier });
}

/**
 * Accessible live region announcement text for link opening transitions.
 * Returns null on idle to prevent noisy repeated announcements.
 */
export function getLinkOpenLiveStatusText(
  status: OpenUrlStatus,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  error?: string | null
): string | null {
  if (status === 'opening') {
    return t('markdown.opening');
  }
  if (status === 'failed') {
    return error
      ? `${t('markdown.open_failed')}: ${error}`
      : t('markdown.open_failed');
  }
  return null;
}
