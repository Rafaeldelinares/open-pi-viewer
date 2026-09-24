import React, { useState } from 'react';
import type { TranslationKey } from '@shared/i18n';
import type { ThinkingBlock, ToolCallBlock } from '@core/types/messages';

export interface ActivityBlocksProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export interface ThinkingCardProps extends ActivityBlocksProps {
  block: ThinkingBlock;
}

export interface ToolCardProps extends ActivityBlocksProps {
  block: ToolCallBlock;
}

/**
 * Format primary argument concisely for tool header badges.
 */
export function formatToolPrimaryArg(name: string, args: unknown): string | null {
  if (!args) return null;
  if (typeof args === 'string') {
    return args.length > 60 ? args.slice(0, 57) + '...' : args;
  }
  if (typeof args !== 'object') return null;
  const obj = args as Record<string, unknown>;

  if (name === 'read' && typeof obj.path === 'string') {
    return obj.path;
  }
  if (name === 'grep') {
    if (typeof obj.pattern === 'string' && typeof obj.path === 'string') {
      return `"${obj.pattern}" in ${obj.path}`;
    }
    if (typeof obj.pattern === 'string') {
      return `"${obj.pattern}"`;
    }
  }
  if (name === 'find') {
    if (typeof obj.pattern === 'string') {
      return obj.pattern;
    }
    if (typeof obj.path === 'string') {
      return obj.path;
    }
  }
  if (name === 'ls' && typeof obj.path === 'string') {
    return obj.path;
  }
  if (typeof obj.path === 'string') {
    return obj.path;
  }
  if (typeof obj.command === 'string') {
    return obj.command.length > 60 ? obj.command.slice(0, 57) + '...' : obj.command;
  }
  if (typeof obj.pattern === 'string') {
    return `"${obj.pattern}"`;
  }
  if (typeof obj.query === 'string') {
    return obj.query;
  }

  const keys = Object.keys(obj);
  if (keys.length > 0) {
    const firstVal = obj[keys[0]];
    if (typeof firstVal === 'string') {
      return firstVal.length > 60 ? firstVal.slice(0, 57) + '...' : firstVal;
    }
  }
  return null;
}

/**
 * Format arguments object into human-readable string for expanded view.
 */
export function formatToolFullArgs(args: unknown): string {
  if (!args) return '';
  if (typeof args === 'string') return args;
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

/**
 * Collapsible Thinking Accordion component.
 * Expanded while streaming, collapsed by default when complete.
 */
export const ThinkingCard: React.FC<ThinkingCardProps> = ({ block, t }) => {
  const [userToggled, setUserToggled] = useState<boolean | null>(null);

  // If streaming and user hasn't toggled, expand by default; collapse when done
  const isStreaming = Boolean(block.isStreaming);
  const isOpen = userToggled !== null ? userToggled : isStreaming;

  const handleToggle = () => {
    setUserToggled(!isOpen);
  };

  const label = isStreaming
    ? t('activity.thinking')
    : t('activity.thought_complete');

  return (
    <div
      className={`thinking-card ${isStreaming ? 'thinking-streaming' : ''} ${
        isOpen ? 'thinking-expanded' : 'thinking-collapsed'
      }`}
    >
      <button
        type="button"
        className="thinking-header"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-label={label}
      >
        <span className="thinking-icon-wrapper" aria-hidden="true">
          <svg
            className={`thinking-icon ${isStreaming ? 'thinking-pulse' : ''}`}
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="currentColor"
          >
            <path d="M8 1.5a6.5 6.5 0 0 0-4.6 11.1c.4.4.7.9.8 1.4h7.6c.1-.5.4-1 .8-1.4A6.5 6.5 0 0 0 8 1.5ZM5.5 15a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-.5h-5v.5Z" />
          </svg>
        </span>
        <span className="thinking-title">{label}</span>
        <span className="thinking-toggle-indicator" aria-hidden="true">
          <svg
            className={`chevron-icon ${isOpen ? 'chevron-open' : ''}`}
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="currentColor"
          >
            <path d="M4.47 6.22a.75.75 0 0 1 1.06 0L8 8.69l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="thinking-body" role="region" aria-label={t('activity.reasoning')}>
          <div className="thinking-text">{block.thinking}</div>
        </div>
      )}
    </div>
  );
};

/**
 * Render appropriate icon for a given tool name.
 */
export function ToolIcon({ name }: { name: string }) {
  switch (name) {
    case 'read':
      return (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V4.5H10.5A1.5 1.5 0 0 1 9 3V1.5Zm6.75.621V3a.5.5 0 0 0 .5.5h1.379Z" />
        </svg>
      );
    case 'grep':
      return (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm-.82 4.74a6 6 0 1 0-1.06 1.06l3.66 3.66a.75.75 0 1 0 1.06-1.06l-3.66-3.66ZM4 6.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Zm0 2a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z" />
        </svg>
      );
    case 'find':
      return (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2A1.75 1.75 0 0 0 5 1Zm0 1.5h3.25a.25.25 0 0 1 .2.1l.9 1.2c.33.44.84.7 1.4.7h6.75a.25.25 0 0 1 .25.25v8.5a.25.25 0 0 1-.25.25H1.75a.25.25 0 0 1-.25-.25V2.75a.25.25 0 0 1 .25-.25Z" />
        </svg>
      );
    case 'ls':
      return (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4A.75.75 0 0 1 2.75 7h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 7.75Zm0 4A.75.75 0 0 1 2.75 11h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 11.75Z" />
        </svg>
      );
    case 'edit':
      return (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25a1.75 1.75 0 0 1 .445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM9.75 4.81 2.81 11.75l-.657 2.3 2.3-.657 6.94-6.94L9.75 4.81Z" />
        </svg>
      );
    case 'write':
      return (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V4.5H10.5A1.5 1.5 0 0 1 9 3V1.5Zm6.75.621V3a.5.5 0 0 0 .5.5h1.379ZM8 7a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 8 7Z" />
        </svg>
      );
    case 'bash':
    case 'powershell':
      return (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25Zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM3.72 4.97a.75.75 0 0 1 1.06 0l2.5 2.5a.75.75 0 0 1 0 1.06l-2.5 2.5a.75.75 0 1 1-1.06-1.06L5.94 8 3.72 5.78a.75.75 0 0 1 0-1.06ZM8.75 10.25h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1 0-1.5Z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M10.72 1.28a.75.75 0 0 1 1.06 0l2.94 2.94a.75.75 0 0 1 0 1.06l-6.47 6.47a.75.75 0 0 1-.53.22H5.25a.75.75 0 0 1-.75-.75V8.75a.75.75 0 0 1 .22-.53l6-6Zm.53 1.59L6 8.16v1.59h1.59l5.25-5.25-1.59-1.63Z" />
        </svg>
      );
  }
}

/**
 * Collapsible Tool Execution Card.
 * Displays tool name, primary argument badge, status pill, and expandable output with copy button.
 */
export const ToolCard: React.FC<ToolCardProps> = ({ block, t }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const primaryArg = formatToolPrimaryArg(block.name, block.args);
  const fullArgs = formatToolFullArgs(block.args);
  const output = block.output || '';
  const status = block.status;

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleCopyOutput = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = output || fullArgs;
    if (!textToCopy) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        setCopyFeedback(t('activity.copied_output'));
      } else {
        setCopyFeedback(t('activity.copy_output_failed'));
      }
    } catch {
      setCopyFeedback(t('activity.copy_output_failed'));
    }

    setTimeout(() => {
      setCopyFeedback(null);
    }, 2000);
  };

  const statusLabel =
    status === 'running'
      ? t('activity.tool_status_running')
      : status === 'error'
        ? t('activity.tool_status_failed')
        : t('activity.tool_status_completed');

  return (
    <div
      className={`tool-card tool-card-${status} ${
        isOpen ? 'tool-card-expanded' : 'tool-card-collapsed'
      }`}
    >
      <button
        type="button"
        className="tool-card-header"
        onClick={handleToggle}
        aria-expanded={isOpen}
      >
        <div className="tool-header-left">
          <span className="tool-icon-wrapper" aria-hidden="true">
            <ToolIcon name={block.name} />
          </span>
          <span className="tool-name">{block.name}</span>
          {primaryArg && (
            <span className="tool-arg-badge" title={primaryArg}>
              {primaryArg}
            </span>
          )}
        </div>

        <div className="tool-header-right">
          <span className={`tool-status-badge tool-badge-${status}`}>
            {status === 'running' && (
              <span className="tool-running-spinner" aria-hidden="true" />
            )}
            {statusLabel}
          </span>
          <span className="tool-toggle-indicator" aria-hidden="true">
            <svg
              className={`chevron-icon ${isOpen ? 'chevron-open' : ''}`}
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="currentColor"
            >
              <path d="M4.47 6.22a.75.75 0 0 1 1.06 0L8 8.69l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="tool-card-body" role="region" aria-label={`${block.name} ${t('activity.output')}`}>
          {fullArgs && (
            <div className="tool-section tool-section-args">
              <span className="tool-section-label">{t('activity.arguments')}</span>
              <pre className="tool-args-pre">{fullArgs}</pre>
            </div>
          )}

          <div className="tool-section tool-section-output">
            <div className="tool-output-header">
              <span className="tool-section-label">{t('activity.output')}</span>
              {(output.length > 0 || fullArgs.length > 0) && (
                <button
                  type="button"
                  className="tool-copy-btn"
                  onClick={handleCopyOutput}
                  aria-label={t('activity.copy_output')}
                >
                  {copyFeedback ? (
                    <span className="tool-copied-text">{copyFeedback}</span>
                  ) : (
                    <>
                      <svg
                        viewBox="0 0 16 16"
                        width="12"
                        height="12"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
                        <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
                      </svg>
                      <span>{t('activity.copy_output')}</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="tool-output-container">
              {output.length > 0 ? (
                <pre className="tool-output-pre">{output}</pre>
              ) : status === 'running' ? (
                <span className="tool-output-empty running">
                  {t('activity.tool_status_running')}...
                </span>
              ) : (
                <span className="tool-output-empty">
                  {t('activity.no_output')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
