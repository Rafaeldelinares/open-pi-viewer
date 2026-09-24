import React from 'react';

export interface McpFormFieldProps {
  id?: string;
  label?: React.ReactNode;
  required?: boolean;
  subtext?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export const McpFormField: React.FC<McpFormFieldProps> = ({
  id,
  label,
  required,
  subtext,
  error,
  className,
  children,
}) => {
  return (
    <div className={`field-group${className ? ` ${className}` : ''}`}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
          {required && <span className="field-required">*</span>}
        </label>
      )}
      {children}
      {subtext && <span className="field-subtext">{subtext}</span>}
      {error && (
        <span className="field-error-text" role="alert">
          {error}
        </span>
      )}
    </div>
  );
};
