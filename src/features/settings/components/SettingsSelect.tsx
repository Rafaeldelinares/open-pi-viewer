import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface SettingsSelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

export interface SettingsSelectProps<T extends string = string> {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: SettingsSelectOption<T>[];
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function SettingsSelect<T extends string = string>({
  id,
  value,
  onChange,
  options,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: SettingsSelectProps<T>): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value) || null;
  }, [options, value]);

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
    (selectedValue: T) => {
      onChange(selectedValue);
      setIsOpen(false);
    },
    [onChange]
  );

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
        prev < options.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : options.length - 1
      );
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < options.length) {
        handleSelect(options[highlightedIndex].value);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`custom-select-wrapper settings-select-wrapper ${className}`}
      onKeyDown={handleKeyDown}
    >
      <button
        id={id}
        type="button"
        className={`custom-select-trigger settings-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || selectedOption?.label || 'Select'}
      >
        <span className="custom-select-trigger-content">
          <span className="custom-select-value-text">
            {selectedOption ? selectedOption.label : String(value)}
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
          className="custom-select-popover settings-select-popover"
          role="listbox"
          tabIndex={-1}
        >
          <div className="custom-select-options-list">
            {options.map((opt, idx) => {
              const isSelected = value === opt.value;
              const isHighlighted = highlightedIndex === idx;

              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  className={`custom-select-option ${isSelected ? 'selected' : ''} ${
                    isHighlighted ? 'highlighted' : ''
                  }`}
                  onClick={() => handleSelect(opt.value)}
                >
                  <div className="custom-select-option-content">
                    <span className="custom-select-option-label">{opt.label}</span>
                    {opt.description && (
                      <span className="custom-select-option-desc">
                        {opt.description}
                      </span>
                    )}
                  </div>
                  {isSelected && <span className="custom-select-checkmark">✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
