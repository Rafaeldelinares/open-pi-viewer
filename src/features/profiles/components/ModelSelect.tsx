import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ModelInfo,
  getSupportedReasoningEffortsForModel,
} from '@core/types/models';
import { findModelInCatalog, splitQualifiedModelId } from '../lib/approvedModels';

export interface ModelSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  availableModels: ModelInfo[];
  disabled?: boolean;
  allowInherit?: boolean;
  inheritLabel?: string;
  placeholder?: string;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

export const ModelSelect: React.FC<ModelSelectProps> = ({
  id,
  value,
  onChange,
  availableModels,
  disabled = false,
  allowInherit = false,
  inheritLabel = 'predeterminado',
  placeholder = 'Selecciona un modelo...',
  size = 'md',
  className = '',
  'aria-label': ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Find model info for current value
  const matchedCurrentModel = useMemo(() => {
    if (!value) return null;
    return findModelInCatalog(availableModels, value);
  }, [availableModels, value]);

  const parsedValue = useMemo(() => splitQualifiedModelId(value), [value]);
  const currentProvider = matchedCurrentModel?.provider || parsedValue.provider;
  const currentDisplayName = matchedCurrentModel?.name || parsedValue.modelId || value;
  const currentSupportsReasoning = matchedCurrentModel
    ? getSupportedReasoningEffortsForModel(matchedCurrentModel).some((e) => e !== 'off')
    : false;

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return availableModels;
    return availableModels.filter((m) => {
      const idMatch = m.id?.toLowerCase().includes(q);
      const nameMatch = m.name?.toLowerCase().includes(q);
      const provMatch = m.provider?.toLowerCase().includes(q);
      return Boolean(idMatch || nameMatch || provMatch);
    });
  }, [availableModels, searchQuery]);

  const showSearch = availableModels.length > 6;

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus search input when popover opens
  useEffect(() => {
    if (isOpen && showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
    if (isOpen) {
      setHighlightedIndex(-1);
    } else {
      setSearchQuery('');
    }
  }, [isOpen, showSearch]);

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  };

  const handleSelect = useCallback(
    (selectedValue: string) => {
      onChange(selectedValue);
      setIsOpen(false);
    },
    [onChange]
  );

  // Total selectable items list for keyboard navigation
  const selectableItems = useMemo(() => {
    const items: Array<{ type: 'inherit' | 'model'; value: string }> = [];
    if (allowInherit && !searchQuery.trim()) {
      items.push({ type: 'inherit', value: '' });
    }
    for (const m of filteredModels) {
      if (m.id) {
        items.push({ type: 'model', value: m.id });
      }
    }
    return items;
  }, [allowInherit, searchQuery, filteredModels]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < selectableItems.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : selectableItems.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < selectableItems.length) {
        handleSelect(selectableItems[highlightedIndex].value);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`custom-select-wrapper model-select-wrapper ${size === 'sm' ? 'custom-select-sm' : ''} ${className}`}
      onKeyDown={handleKeyDown}
    >
      <button
        id={id}
        type="button"
        className={`custom-select-trigger ${isOpen ? 'open' : ''} ${size === 'sm' ? 'custom-select-trigger-sm' : ''}`}
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || 'Seleccionar modelo'}
      >
        <div className="custom-select-trigger-content">
          {allowInherit && !value ? (
            <span className="custom-select-inherit-text">
              Heredar ({inheritLabel})
            </span>
          ) : value ? (
            <span className="custom-select-value-group">
              <span className="custom-select-value-text">{currentDisplayName}</span>
              {currentProvider && (
                <span className="custom-select-badge provider-badge">
                  {currentProvider}
                </span>
              )}
              {currentSupportsReasoning && (
                <span
                  className="custom-select-reasoning-icon"
                  title="Razonamiento / Thinking soportado"
                  aria-label="Razonamiento soportado"
                >
                  ⚡
                </span>
              )}
            </span>
          ) : (
            <span className="custom-select-placeholder">{placeholder}</span>
          )}
        </div>

        <svg
          className={`custom-select-chevron ${isOpen ? 'rotated' : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="custom-select-popover model-select-popover"
          role="listbox"
          tabIndex={-1}
        >
          {showSearch && (
            <div className="custom-select-search-box">
              <svg
                className="custom-select-search-icon"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                className="custom-select-search-input"
                placeholder="Buscar modelo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          <div ref={listRef} className="custom-select-options-list">
            {allowInherit && !searchQuery.trim() && (
              <div
                role="option"
                aria-selected={!value}
                className={`custom-select-option ${!value ? 'selected' : ''} ${
                  highlightedIndex === 0 ? 'highlighted' : ''
                }`}
                onClick={() => handleSelect('')}
              >
                <span className="custom-select-option-content">
                  <span className="custom-select-inherit-text">
                    Heredar ({inheritLabel})
                  </span>
                </span>
                {!value && <span className="custom-select-checkmark">✓</span>}
              </div>
            )}

            {filteredModels.map((model, idx) => {
              if (!model.id) return null;
              const isSelected = value === model.id;
              const modelSupportsReasoning = getSupportedReasoningEffortsForModel(model).some(
                (e) => e !== 'off'
              );
              const listIdx = (allowInherit && !searchQuery.trim() ? 1 : 0) + idx;
              const isHighlighted = highlightedIndex === listIdx;

              return (
                <div
                  key={model.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`custom-select-option ${isSelected ? 'selected' : ''} ${
                    isHighlighted ? 'highlighted' : ''
                  }`}
                  onClick={() => handleSelect(model.id!)}
                >
                  <div className="custom-select-option-content">
                    <span className="custom-select-option-label">
                      {model.name || model.id}
                    </span>
                    {model.provider && (
                      <span className="custom-select-badge provider-badge">
                        {model.provider}
                      </span>
                    )}
                    {modelSupportsReasoning && (
                      <span
                        className="custom-select-reasoning-icon"
                        title="Razonamiento / Thinking soportado"
                      >
                        ⚡
                      </span>
                    )}
                  </div>
                  {isSelected && <span className="custom-select-checkmark">✓</span>}
                </div>
              );
            })}

            {filteredModels.length === 0 && (
              <div className="custom-select-empty-msg">
                No se encontraron modelos disponibles
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
