import {
  formatWindowTitle,
  generateFaviconSvg,
  type AppStatusState,
} from '@core/icon-status';
import { isTauri } from '@tauri-apps/api/core';

/**
 * Updates the document favicon dynamically with a status-colored SVG badge.
 */
export function updateFavicon(status: AppStatusState): void {
  if (typeof document === 'undefined') return;

  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.id = 'app-favicon';
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  link.href = 'data:image/svg+xml,' + encodeURIComponent(generateFaviconSvg(status));
}

/**
 * Updates document.title with the contextual status symbol and label prefix.
 */
export function updateWindowTitle(status: AppStatusState, statusLabel?: string): void {
  if (typeof document === 'undefined') return;
  document.title = formatWindowTitle('Pi Viewer', status, statusLabel);
}

/**
 * Requests user attention on the desktop window (dock bounce on macOS, taskbar flash on Windows)
 * via Tauri window APIs when the agent finishes work or is waiting for human input.
 */
export async function triggerTauriWindowAttention(status: AppStatusState): Promise<void> {
  if (!isTauri()) return;
  if (status !== 'waiting' && status !== 'idle') return;

  try {
    const { getCurrentWindow, UserAttentionType } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const attentionType =
      status === 'waiting'
        ? UserAttentionType.Critical
        : UserAttentionType.Informational;
    await win.requestUserAttention(attentionType);
  } catch {
    // Gracefully ignore window attention failures in unsupported environments
  }
}
