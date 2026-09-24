import React from 'react';
import type { TranslationKey } from '@shared/i18n';

export interface ExcludedModelsSectionProps {
  excludedModels: string[];
  isExcludedOpen: boolean;
  setIsExcludedOpen: React.Dispatch<React.SetStateAction<boolean>>;
  excludedSectionRef: React.RefObject<HTMLDivElement>;
  newExcludedInput: string;
  setNewExcludedInput: (val: string) => void;
  onRemoveExcludedModel: (pattern: string) => void;
  onAddExcludedPattern: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const ExcludedModelsSection: React.FC<ExcludedModelsSectionProps> = ({
  excludedModels,
  isExcludedOpen,
  setIsExcludedOpen,
  excludedSectionRef,
  newExcludedInput,
  setNewExcludedInput,
  onRemoveExcludedModel,
  onAddExcludedPattern,
  t,
}) => {
  return (
    <div className="modal-spoiler-container excluded-models-spoiler" ref={excludedSectionRef}>
      <button
        type="button"
        className="modal-spoiler-header"
        onClick={() => setIsExcludedOpen((prev) => !prev)}
        aria-expanded={isExcludedOpen}
      >
        <div className="modal-spoiler-title-wrap">
          <span>
            {t('providers.excluded_models_heading', { count: excludedModels.length })}
          </span>
        </div>
        <svg
          className={`chevron-icon ${isExcludedOpen ? 'chevron-open' : ''}`}
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M4.47 6.22a.75.75 0 0 1 1.06 0L8 8.69l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>

      {isExcludedOpen && (
        <div className="modal-spoiler-body">
          <span className="field-subtext">{t('providers.excluded_models_hint')}</span>

          {excludedModels.length > 0 ? (
            <div className="excluded-models-chips">
              {excludedModels.map((pattern) => (
                <div key={pattern} className="excluded-model-chip">
                  <span className="excluded-model-pattern">{pattern}</span>
                  <button
                    type="button"
                    className="btn-remove-excluded"
                    onClick={() => onRemoveExcludedModel(pattern)}
                    title={t('providers.unexclude_model', { id: pattern })}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-excluded-text">{t('providers.no_excluded_models')}</p>
          )}

          <div className="add-excluded-row">
            <input
              type="text"
              className="field-input excluded-input"
              value={newExcludedInput}
              onChange={(e) => setNewExcludedInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddExcludedPattern();
                }
              }}
              placeholder={t('providers.add_excluded_placeholder')}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-add-excluded"
              onClick={onAddExcludedPattern}
              disabled={!newExcludedInput.trim()}
            >
              {t('providers.btn_add_excluded')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
