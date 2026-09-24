import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReasoningEffort } from '@core/types/profiles';
import type { ThinkingLevel } from '@core/types/models';
import { translate, type SupportedLocale, type TranslationKey } from '@shared/i18n';

const getActiveLocale = (): SupportedLocale => {
  if (typeof document !== 'undefined' && document.documentElement.lang === 'es') {
    return 'es';
  }
  return 'en';
};

export interface EffortSelectProps {
  id?: string;
  value: ReasoningEffort | '' | string;
  onChange: (value: ReasoningEffort | '') => void;
  supportedEfforts?: readonly ThinkingLevel[] | readonly ReasoningEffort[];
  disabled?: boolean;
  allowInherit?: boolean;
  inheritLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

export const EffortSelect: React.FC<EffortSelectProps> = ({
  id,
  value,
  onChange,
  supportedEfforts,
  disabled = false,
  allowInherit = false,
  inheritLabel = 'defecto',
  size = 'md',
  className = '',
  'aria-label': ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fallback if supportedEfforts is missing or empty
  const effectiveEfforts = useMemo(() => {
    if (supportedEfforts && supportedEfforts.length > 0) {
      return supportedEfforts;
    }
    return ['low', 'medium', 'high'] as const;
  }, [supportedEfforts]);

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

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  };

  const handleSelect = useCallback(
    (selectedValue: ReasoningEffort | '') => {
      onChange(selectedValue);
      setIsOpen(false);
    },
    [onChange]
  );

  // Option list
  const optionsList = useMemo(() => {
    const locale = getActiveLocale();
    const list: Array<{ value: ReasoningEffort | ''; label: string; isDefault?: boolean }> = [];
    if (allowInherit) {
      list.push({
        value: '',
        label: locale === 'es' ? `Heredar (${inheritLabel})` : `Inherit (${inheritLabel})`,
        isDefault: true,
      });
    } else {
      list.push({
        value: '',
        label:
          locale === 'es'
            ? 'Por defecto del modelo (sin especificar)'
            : 'Model default (unspecified)',
        isDefault: true,
      });
    }

    for (const effort of effectiveEfforts) {
      let localized: string = effort;
      try {
        localized = translate(locale, `thinking_level.${effort}` as TranslationKey) || effort;
      } catch {
        localized = effort;
      }

      list.push({
        value: effort as ReasoningEffort,
        label: localized,
      });
    }
    return list;
  }, [allowInherit, inheritLabel, effectiveEfforts]);

  const displayLabel = useMemo(() => {
    const locale = getActiveLocale();
    if (!value) {
      return allowInherit
        ? locale === 'es' ? `Heredar (${inheritLabel})` : `Inherit (${inheritLabel})`
        : locale === 'es' ? 'Por defecto del modelo (sin especificar)' : 'Model default (unspecified)';
    }
    const matchingOption = optionsList.find((opt) => opt.value === value);
    if (matchingOption) return matchingOption.label;
    try {
      return translate(locale, `thinking_level.${value}` as TranslationKey) || value;
    } catch {
      return value;
    }
  }, [value, allowInherit, inheritLabel, optionsList]);

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
        prev < optionsList.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : optionsList.length - 1
      );
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < optionsList.length) {
        handleSelect(optionsList[highlightedIndex].value);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`custom-select-wrapper effort-select-wrapper ${size === 'sm' ? 'custom-select-sm' : ''} ${className}`}
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
        aria-label={ariaLabel || 'Seleccionar nivel de razonamiento'}
      >
        <span className="custom-select-trigger-content">
          <span className={`custom-select-value-text ${!value ? 'custom-select-muted-text' : ''}`}>
            {displayLabel}
          </span>
        </span>

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
          className="custom-select-popover effort-select-popover"
          role="listbox"
          tabIndex={-1}
        >
          <div className="custom-select-options-list">
            {optionsList.map((opt, idx) => {
              const isSelected = value === opt.value;
              const isHighlighted = highlightedIndex === idx;

              return (
                <div
                  key={opt.value || '__default__'}
                  role="option"
                  aria-selected={isSelected}
                  className={`custom-select-option ${isSelected ? 'selected' : ''} ${
                    isHighlighted ? 'highlighted' : ''
                  }`}
                  onClick={() => handleSelect(opt.value)}
                >
                  <span className="custom-select-option-content">
                    <span
                      className={`custom-select-option-label ${
                        opt.isDefault ? 'custom-select-muted-text' : ''
                      }`}
                    >
                      {opt.label}
                    </span>
                  </span>
                  {isSelected && <span className="custom-select-checkmark">✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
