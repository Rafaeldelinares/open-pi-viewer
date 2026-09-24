import React from 'react';

export interface ExtensionSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearAriaLabel?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export const ExtensionSearchBar: React.FC<ExtensionSearchBarProps> = ({
  value,
  onChange,
  placeholder,
  clearAriaLabel = 'Clear search',
  className = '',
  autoFocus = false,
  disabled = false,
}) => {
  return (
    <div className={`ext-search-box ${className}`.trim()}>
      <svg
        className="ext-search-icon"
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
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        className="ext-search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
      />
      {value && !disabled && (
        <button
          type="button"
          className="ext-search-clear"
          onClick={() => onChange('')}
          aria-label={clearAriaLabel}
        >
          ×
        </button>
      )}
    </div>
  );
};
