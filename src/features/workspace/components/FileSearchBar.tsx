import React from 'react';

export interface FileSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearAriaLabel?: string;
  className?: string;
  autoFocus?: boolean;
}

export const FileSearchBar: React.FC<FileSearchBarProps> = ({
  value,
  onChange,
  placeholder,
  clearAriaLabel = 'Clear search',
  className = '',
  autoFocus = false,
}) => {
  return (
    <div className={`search-input-wrapper ${className}`.trim()}>
      <svg
        className="search-icon"
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
        className="sidebar-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
      />
      {value.length > 0 && (
        <button
          type="button"
          className="search-clear-btn"
          onClick={() => onChange('')}
          aria-label={clearAriaLabel}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
};
