export type AppStatusState = 'idle' | 'busy' | 'waiting' | 'error' | 'disconnected';

export interface StatusConfigItem {
  color: string;
  labelKey: string;
  symbol?: string;
}

export const STATUS_CONFIG: Record<AppStatusState, StatusConfigItem> = {
  idle: {
    color: '#2da44e',
    labelKey: 'status.idle',
  },
  busy: {
    color: '#1f6feb',
    labelKey: 'status.busy',
    symbol: '●',
  },
  waiting: {
    color: '#d29922',
    labelKey: 'status.waiting',
    symbol: '!',
  },
  error: {
    color: '#cf222e',
    labelKey: 'status.error',
    symbol: '✕',
  },
  disconnected: {
    color: '#8b949e',
    labelKey: 'status.disconnected',
  },
};

/**
 * Formats the application window/tab title with contextual status symbols and localized labels.
 */
export function formatWindowTitle(
  baseTitle: string,
  status: AppStatusState,
  statusLabel?: string
): string {
  if (status === 'busy') {
    return `(● ${statusLabel || 'Busy'}) ${baseTitle}`;
  }
  if (status === 'waiting') {
    return `(! ${statusLabel || 'Waiting'}) ${baseTitle}`;
  }
  if (status === 'error') {
    return `(✕ ${statusLabel || 'Error'}) ${baseTitle}`;
  }
  return baseTitle;
}

/**
 * Generates an SVG favicon string (32x32) containing a dark badge background,
 * a stylized Pi symbol, and a status dot at the bottom right.
 */
export function generateFaviconSvg(status: AppStatusState): string {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.disconnected;
  const statusColor = config.color;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="7" fill="#0d1117"/>
  <text x="12" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="19" font-weight="bold" fill="#e6edf3" text-anchor="middle">π</text>
  <circle cx="24" cy="24" r="5" fill="${statusColor}" stroke="#0d1117" stroke-width="1.5"/>
</svg>`;
}
