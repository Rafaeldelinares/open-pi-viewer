import React from 'react';

export interface PopoverSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearAriaLabel?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

export const PopoverSearchBar: React.FC<PopoverSearchBarProps> = ({
  value,
  onChange,
  placeholder,
  clearAriaLabel = 'Clear search',
  className = '',
  inputClassName = '',
  autoFocus = false,
}) => {
  return (
    <div className={`popover-search-box ${className}`.trim()}>
      <svg
        className="popover-search-icon"
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
        type="text"
        className={`popover-search-input ${inputClassName}`.trim()}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
        autoFocus={autoFocus}
      />
      {value && (
        <button
          type="button"
          className="popover-search-clear"
          onClick={() => onChange('')}
          aria-label={clearAriaLabel}
        >
          ×
        </button>
      )}
    </div>
  );
};
