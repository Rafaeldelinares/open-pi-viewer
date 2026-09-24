import React from 'react';
import type { McpKeyValuePair } from '../types';

export interface McpKeyValueEditorProps {
  title: string;
  addButtonLabel: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
  keyColumnLabel?: string;
  valueColumnLabel?: string;
  emptyNotice?: string;
  entries: McpKeyValuePair[];
  onAdd: () => void;
  onUpdate: (id: string, field: 'key' | 'value', val: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  className?: string;
  removeButtonTitle?: string;
}

export const McpKeyValueEditor: React.FC<McpKeyValueEditorProps> = ({
  title,
  addButtonLabel,
  keyPlaceholder,
  valuePlaceholder,
  keyColumnLabel,
  valueColumnLabel,
  emptyNotice,
  entries,
  onAdd,
  onUpdate,
  onRemove,
  disabled = false,
  className,
  removeButtonTitle = 'Delete',
}) => {
  return (
    <div className={`mcp-kv-editor${className ? ` ${className}` : ''}`}>
      <div className="mcp-kv-header">
        <span className="field-label">{title}</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm mcp-add-kv-btn"
          onClick={onAdd}
          disabled={disabled}
        >
          + {addButtonLabel}
        </button>
      </div>

      {entries.length > 0 && (keyColumnLabel || valueColumnLabel) && (
        <div className="mcp-kv-columns-header">
          <span className="mcp-kv-col-key-label">{keyColumnLabel}</span>
          <span className="mcp-kv-col-val-label">{valueColumnLabel}</span>
          <span className="mcp-kv-col-spacer" aria-hidden="true" />
        </div>
      )}

      {entries.length > 0 ? (
        <div className="mcp-key-value-list">
          {entries.map((entry) => (
            <div key={entry.id} className="mcp-key-value-row">
              <input
                type="text"
                className="field-input mcp-kv-key"
                value={entry.key}
                placeholder={keyPlaceholder}
                onChange={(e) => onUpdate(entry.id, 'key', e.target.value)}
                disabled={disabled}
                aria-label={keyPlaceholder}
              />
              <input
                type="text"
                className="field-input mcp-kv-value"
                value={entry.value}
                placeholder={valuePlaceholder}
                onChange={(e) => onUpdate(entry.id, 'value', e.target.value)}
                disabled={disabled}
                aria-label={valuePlaceholder}
              />
              <button
                type="button"
                className="btn-icon-subtle mcp-kv-remove-btn"
                onClick={() => onRemove(entry.id)}
                disabled={disabled}
                title={removeButtonTitle}
                aria-label={removeButtonTitle}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        emptyNotice && <div className="mcp-kv-empty-hint">{emptyNotice}</div>
      )}
    </div>
  );
};
