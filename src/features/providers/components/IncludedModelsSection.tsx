import React from 'react';
import type { TranslationKey } from '@shared/i18n';

export interface IncludedModelsSectionProps {
  includedModels: string[];
  isIncludedOpen: boolean;
  setIsIncludedOpen: React.Dispatch<React.SetStateAction<boolean>>;
  includedSectionRef: React.RefObject<HTMLDivElement>;
  newIncludedInput: string;
  setNewIncludedInput: (val: string) => void;
  onRemoveIncludedModel: (pattern: string) => void;
  onAddIncludedPattern: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const IncludedModelsSection: React.FC<IncludedModelsSectionProps> = ({
  includedModels,
  isIncludedOpen,
  setIsIncludedOpen,
  includedSectionRef,
  newIncludedInput,
  setNewIncludedInput,
  onRemoveIncludedModel,
  onAddIncludedPattern,
  t,
}) => {
  return (
    <div className="modal-spoiler-container included-models-spoiler" ref={includedSectionRef}>
      <button
        type="button"
        className="modal-spoiler-header"
        onClick={() => setIsIncludedOpen((prev) => !prev)}
        aria-expanded={isIncludedOpen}
      >
        <div className="modal-spoiler-title-wrap">
          <span>
            {t('providers.included_models_heading', { count: includedModels.length })}
          </span>
        </div>
        <svg
          className={`chevron-icon ${isIncludedOpen ? 'chevron-open' : ''}`}
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M4.47 6.22a.75.75 0 0 1 1.06 0L8 8.69l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>

      {isIncludedOpen && (
        <div className="modal-spoiler-body">
          <span className="field-subtext">{t('providers.included_models_hint')}</span>

          {includedModels.length > 0 ? (
            <div className="included-models-chips">
              {includedModels.map((pattern) => (
                <div key={pattern} className="included-model-chip">
                  <span className="included-model-pattern">{pattern}</span>
                  <button
                    type="button"
                    className="btn-remove-included"
                    onClick={() => onRemoveIncludedModel(pattern)}
                    title={t('providers.uninclude_model', { id: pattern })}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-included-text">{t('providers.no_included_models')}</p>
          )}

          <div className="add-included-row">
            <input
              type="text"
              className="field-input included-input"
              value={newIncludedInput}
              onChange={(e) => setNewIncludedInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddIncludedPattern();
                }
              }}
              placeholder={t('providers.add_included_placeholder')}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-add-included"
              onClick={onAddIncludedPattern}
              disabled={!newIncludedInput.trim()}
            >
              {t('providers.btn_add_included')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
