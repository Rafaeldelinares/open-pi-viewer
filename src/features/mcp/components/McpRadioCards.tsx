import React from 'react';

export interface McpRadioOption<T extends string> {
  value: T;
  title: string;
  desc?: string;
  disabled?: boolean;
}

export interface McpRadioCardsProps<T extends string> {
  name: string;
  label?: React.ReactNode;
  options: McpRadioOption<T>[];
  selectedValue: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

export function McpRadioCards<T extends string>({
  name,
  label,
  options,
  selectedValue,
  onChange,
  disabled = false,
  className,
}: McpRadioCardsProps<T>) {
  return (
    <div className={`field-group${className ? ` ${className}` : ''}`}>
      {label && <span className="field-label">{label}</span>}
      <div className="mcp-radio-cards-grid">
        {options.map((option) => {
          const isSelected = selectedValue === option.value;
          const isOptionDisabled = disabled || option.disabled;
          return (
            <label
              key={option.value}
              className={`mcp-radio-card${isSelected ? ' selected' : ''}${
                isOptionDisabled ? ' disabled' : ''
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={isSelected}
                onChange={() => {
                  if (!isOptionDisabled) {
                    onChange(option.value);
                  }
                }}
                disabled={isOptionDisabled}
              />
              <div className="mcp-radio-card-content">
                <span className="mcp-radio-card-title">{option.title}</span>
                {option.desc && (
                  <span className="mcp-radio-card-desc">{option.desc}</span>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
