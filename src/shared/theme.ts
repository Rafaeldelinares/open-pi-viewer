export type AppTheme = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const DEFAULT_THEME: AppTheme = 'dark';

export const SUPPORTED_THEMES: readonly AppTheme[] = [
  'dark',
  'light',
  'system',
] as const;

/**
 * Type guard for supported application theme settings.
 */
export function isAppTheme(value: unknown): value is AppTheme {
  return value === 'dark' || value === 'light' || value === 'system';
}

/**
 * Inspects system media query for OS dark mode preference.
 * Defaults to 'dark' if media queries are unavailable.
 */
export function getSystemPreferredTheme(
  targetWindow?: Pick<Window, 'matchMedia'>
): ResolvedTheme {
  const win =
    targetWindow ??
    (typeof window !== 'undefined' ? window : undefined);

  if (!win || typeof win.matchMedia !== 'function') {
    return 'dark';
  }

  try {
    const mql = win.matchMedia('(prefers-color-scheme: dark)');
    return mql.matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

/**
 * Resolves an AppTheme ('dark', 'light', or 'system') to a concrete 'dark' or 'light' palette.
 * Default is 'dark' regardless of OS unless 'system' is explicitly chosen.
 */
export function resolveTheme(
  theme: AppTheme,
  systemPreferred?: ResolvedTheme
): ResolvedTheme {
  if (theme === 'system') {
    return systemPreferred ?? getSystemPreferredTheme();
  }
  return theme === 'light' ? 'light' : 'dark';
}

/**
 * Applies the resolved theme to the root HTML document element.
 * Sets both `data-theme` attribute and native `color-scheme` CSS property without arbitrary CSS injection.
 */
export function applyTheme(
  resolvedTheme: ResolvedTheme,
  targetElement?: { setAttribute: (name: string, value: string) => void; style: { colorScheme: string } } | null
): void {
  const root =
    targetElement ??
    (typeof document !== 'undefined' ? document.documentElement : null);

  if (!root) {
    return;
  }

  root.setAttribute('data-theme', resolvedTheme);
  root.style.colorScheme = resolvedTheme;
}

/**
 * Sets up a StrictMode-safe media query listener for system color scheme changes.
 * Returns an idempotent cleanup function to remove the listener.
 */
export function watchSystemTheme(
  onChange: (theme: ResolvedTheme) => void,
  targetWindow?: Window
): () => void {
  const win =
    targetWindow ??
    (typeof window !== 'undefined' ? window : undefined);

  if (!win || typeof win.matchMedia !== 'function') {
    return () => {};
  }

  try {
    const mql = win.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: { matches: boolean }) => {
      onChange(event.matches ? 'dark' : 'light');
    };

    if (typeof mql.addEventListener === 'function') {
      const eventListener = handler as unknown as EventListener;
      mql.addEventListener('change', eventListener);
      return () => {
        mql.removeEventListener('change', eventListener);
      };
    } else if (typeof (mql as unknown as { addListener?: (cb: (e: { matches: boolean }) => void) => void }).addListener === 'function') {
      const legacyMql = mql as unknown as {
        addListener: (cb: (e: { matches: boolean }) => void) => void;
        removeListener: (cb: (e: { matches: boolean }) => void) => void;
      };
      legacyMql.addListener(handler);
      return () => {
        legacyMql.removeListener(handler);
      };
    }
  } catch {
    // Media query listener not supported
  }

  return () => {};
}
