import React from 'react';
import type { CopyStatus } from '@shared/clipboard';
import type { TranslationKey } from '@shared/i18n';
import {
  parseMarkdown,
  sanitizeLanguage,
  shouldRenderAsMarkdown,
  type BlockNode,
  type InlineNode,
  type ListItemNode,
} from '@core/markdown';
import {
  getLinkAriaLabel,
  getLinkModifierLabel,
  getLinkOpenLiveStatusText,
} from '@infra/opener';
import { useCopyFeedback } from '@features/chat/hooks/useCopyFeedback';
import { useLinkOpener } from '@features/chat/hooks/useLinkOpener';

export {
  getLinkAriaLabel,
  getLinkModifierLabel,
  getLinkOpenLiveStatusText,
  shouldRenderAsMarkdown,
};

/**
 * Computes dynamic accessible aria-label for code block copy buttons.
 * Changes to "Copied..." or "Failed..." when active so screen readers announce the outcome.
 */
export function getCodeCopyAriaLabel(
  status: CopyStatus,
  displayLang: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  if (status === 'copied') {
    return t('markdown.copied_code_aria', { lang: displayLang });
  }
  if (status === 'failed') {
    return t('markdown.copy_failed_code_aria', { lang: displayLang });
  }
  return t('markdown.copy_code_aria', { lang: displayLang });
}

/**
 * Computes dynamic accessible aria-label for link copy buttons.
 * Announces copy success/failure dynamically to screen readers.
 */
export function getLinkCopyAriaLabel(
  status: CopyStatus,
  href: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  if (status === 'copied') {
    return t('markdown.copied_url_aria');
  }
  if (status === 'failed') {
    return t('markdown.copy_failed_url_aria');
  }
  return `${t('markdown.copy_url_aria')}: ${href}`;
}

/**
 * Returns accessible live region announcement text for copy status transitions.
 * Returns null on idle to prevent noisy repeated announcements when mounted or idle.
 */
export function getCopyLiveStatusText(
  status: CopyStatus,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string | null {
  if (status === 'copied') {
    return t('markdown.copied');
  }
  if (status === 'failed') {
    return t('markdown.copy_failed');
  }
  return null;
}

export interface MarkdownContentProps {
  content: string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

/**
 * Fenced code block with header, sanitized language indicator, and localized copy button.
 * The copy button resides strictly in the header outside <pre><code> to prevent capturing
 * button text during user text selection of code.
 */
export const CodeBlock: React.FC<{
  code: string;
  language?: string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}> = ({ code, language, t }) => {
  const { status, triggerCopy } = useCopyFeedback();

  const sanitizedLang = sanitizeLanguage(language);
  const displayLang = sanitizedLang || t('markdown.code_plain');

  const copyLabel =
    status === 'copied'
      ? t('markdown.copied')
      : status === 'failed'
        ? t('markdown.copy_failed')
        : t('markdown.copy_code');

  const ariaLabel = getCodeCopyAriaLabel(status, displayLang, t);
  const liveStatus = getCopyLiveStatusText(status, t);

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <span className="markdown-code-language">{displayLang}</span>
        <button
          type="button"
          className="markdown-code-copy-btn"
          onClick={() => void triggerCopy(code)}
          aria-label={ariaLabel}
          title={copyLabel}
        >
          {copyLabel}
        </button>
        {liveStatus && (
          <span
            role="status"
            aria-live="polite"
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              padding: 0,
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {liveStatus}
          </span>
        )}
      </div>
      <pre className="markdown-code-pre">
        <code className="markdown-code-text">{code}</code>
      </pre>
    </div>
  );
};

/**
 * Safe link component:
 * - Never sets a navigable href that could navigate the Tauri WebView
 * - Prevents default on every user action
 * - Displays destination URL explicitly
 * - Provides an independent Copy URL button with localized feedback
 */
export const MarkdownLink: React.FC<{
  href: string;
  children: React.ReactNode;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}> = ({ href, children, t }) => {
  const errorId = React.useId();
  const { status: copyStatus, triggerCopy } = useCopyFeedback();
  const {
    status: openStatus,
    error: openError,
    handleClick,
    handleKeyDown,
  } = useLinkOpener(href);

  const copyLabel =
    copyStatus === 'copied'
      ? t('markdown.copied')
      : copyStatus === 'failed'
        ? t('markdown.copy_failed')
        : t('markdown.copy_url');

  const copyAriaLabel = getLinkCopyAriaLabel(copyStatus, href, t);
  const copyLiveStatus = getCopyLiveStatusText(copyStatus, t);

  const linkHint = getLinkModifierLabel(t);
  const linkAriaLabel = getLinkAriaLabel(openStatus, href, t);
  const openLiveStatus = getLinkOpenLiveStatusText(openStatus, t, openError);

  const linkClass = [
    'markdown-link',
    openStatus === 'opening' && 'markdown-link-opening',
    openStatus === 'failed' && 'markdown-link-failed',
  ]
    .filter(Boolean)
    .join(' ');

  const linkTitle =
    openStatus === 'failed' && openError
      ? `${href} (${linkHint}) — ${t('markdown.open_failed')}: ${openError}`
      : `${href} (${linkHint})`;

  return (
    <span className="markdown-link-wrapper">
      <span
        role="link"
        tabIndex={0}
        className={linkClass}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        title={linkTitle}
        aria-label={linkAriaLabel}
        aria-describedby={openStatus === 'failed' && openError ? errorId : undefined}
        aria-busy={openStatus === 'opening'}
      >
        {children}
      </span>
      <span
        className="markdown-link-destination"
        title={linkTitle}
        onClick={handleClick}
      >
        ({href})
      </span>
      <span
        className="markdown-link-hint"
        title={linkTitle}
        onClick={handleClick}
      >
        [{linkHint}]
      </span>
      <button
        type="button"
        className="markdown-link-copy-btn"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void triggerCopy(href);
        }}
        aria-label={copyAriaLabel}
        title={copyLabel}
      >
        {copyLabel}
      </button>
      {openStatus === 'failed' && (
        <span id={errorId} className="markdown-link-error" role="none">
          {t('markdown.open_failed')}{openError ? `: ${openError}` : ''}
        </span>
      )}
      {(copyLiveStatus || openLiveStatus) && (
        <span
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {openLiveStatus || copyLiveStatus}
        </span>
      )}
    </span>
  );
};

function renderInline(
  nodes: InlineNode[],
  keyPrefix: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-in-${index}`;
    switch (node.type) {
      case 'text':
        return <React.Fragment key={key}>{node.value}</React.Fragment>;
      case 'code_inline':
        return (
          <code key={key} className="markdown-inline-code">
            {node.value}
          </code>
        );
      case 'strong':
        return (
          <strong key={key}>
            {renderInline(node.children, key, t)}
          </strong>
        );
      case 'emphasis':
        return (
          <em key={key}>
            {renderInline(node.children, key, t)}
          </em>
        );
      case 'link':
        return (
          <MarkdownLink key={key} href={node.href} t={t}>
            {renderInline(node.label, `${key}-lbl`, t)}
          </MarkdownLink>
        );
    }
  });
}

function renderListItem(
  item: ListItemNode,
  index: number,
  keyPrefix: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): React.ReactNode {
  const key = `${keyPrefix}-li-${index}`;
  return (
    <li key={key} className="markdown-li">
      {renderInline(item.children, key, t)}
      {item.subList && renderBlock(item.subList, 0, `${key}-sub`, t)}
    </li>
  );
}

function renderBlock(
  block: BlockNode,
  index: number,
  keyPrefix: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): React.ReactNode {
  const key = `${keyPrefix}-blk-${index}`;
  switch (block.type) {
    case 'heading': {
      const children = renderInline(block.children, key, t);
      switch (block.level) {
        case 1:
          return <h1 key={key} className="markdown-h markdown-h1">{children}</h1>;
        case 2:
          return <h2 key={key} className="markdown-h markdown-h2">{children}</h2>;
        case 3:
          return <h3 key={key} className="markdown-h markdown-h3">{children}</h3>;
        case 4:
          return <h4 key={key} className="markdown-h markdown-h4">{children}</h4>;
        case 5:
          return <h5 key={key} className="markdown-h markdown-h5">{children}</h5>;
        case 6:
          return <h6 key={key} className="markdown-h markdown-h6">{children}</h6>;
      }
      break;
    }
    case 'paragraph':
      return (
        <p key={key} className="markdown-p">
          {renderInline(block.children, key, t)}
        </p>
      );
    case 'code_block':
      return (
        <CodeBlock
          key={key}
          code={block.code}
          language={block.language}
          t={t}
        />
      );
    case 'list': {
      const items = block.items.map((item, itemIdx) =>
        renderListItem(item, itemIdx, key, t)
      );
      if (block.ordered) {
        return (
          <ol key={key} className="markdown-ol" start={block.start}>
            {items}
          </ol>
        );
      }
      return (
        <ul key={key} className="markdown-ul">
          {items}
        </ul>
      );
    }
  }
}

/**
 * Pure React component rendering a safe Markdown subset.
 * Raw HTML is escaped automatically by React JSX; no dangerouslySetInnerHTML is ever used.
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, t }) => {
  const ast = parseMarkdown(content);

  return (
    <div className="markdown-body">
      {ast.children.map((block, idx) => renderBlock(block, idx, 'md', t))}
    </div>
  );
};
