import React from 'react';
import type { TranslationKey } from '@shared/i18n';
import type { ThinkingLevel } from '@core/types/models';
import { ProviderSelect } from './ProviderSelect';

export interface ModelSubformProps {
  isAddModelOpen: boolean;
  setIsAddModelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  editingModelId: string | null;
  modelError: string | null;
  newModelId: string;
  newModelName: string;
  setNewModelName: (val: string) => void;
  newModelContext: string;
  setNewModelContext: (val: string) => void;
  newModelMaxTokens: string;
  setNewModelMaxTokens: (val: string) => void;
  newModelReasoning: boolean;
  setNewModelReasoning: (val: boolean) => void;
  newModelThinkingLevel: ThinkingLevel;
  setNewModelThinkingLevel: (val: ThinkingLevel) => void;
  newModelSupportsImage: boolean;
  setNewModelSupportsImage: (val: boolean) => void;
  supportedThinkingLevels: ThinkingLevel[];
  onModelIdChange: (val: string) => void;
  onSaveEditedModel: (e: React.FormEvent) => void;
  onCancelEditModel: () => void;
  onAddModelToDraft: (e: React.FormEvent) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const ModelSubform: React.FC<ModelSubformProps> = ({
  isAddModelOpen,
  setIsAddModelOpen,
  editingModelId,
  modelError,
  newModelId,
  newModelName,
  setNewModelName,
  newModelContext,
  setNewModelContext,
  newModelMaxTokens,
  setNewModelMaxTokens,
  newModelReasoning,
  setNewModelReasoning,
  newModelThinkingLevel,
  setNewModelThinkingLevel,
  newModelSupportsImage,
  setNewModelSupportsImage,
  supportedThinkingLevels,
  onModelIdChange,
  onSaveEditedModel,
  onCancelEditModel,
  onAddModelToDraft,
  t,
}) => {
  return (
    <div className="modal-spoiler-container">
      <button
        type="button"
        className="modal-spoiler-header"
        onClick={() => setIsAddModelOpen((prev) => !prev)}
        aria-expanded={isAddModelOpen}
      >
        <div className="modal-spoiler-title-wrap">
          <span>
            {editingModelId
              ? t('providers.edit_model_title', { id: editingModelId })
              : t('providers.add_model_manually')}
          </span>
        </div>
        <svg
          className={`chevron-icon ${isAddModelOpen ? 'chevron-open' : ''}`}
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M4.47 6.22a.75.75 0 0 1 1.06 0L8 8.69l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>

      {isAddModelOpen && (
        <div className="modal-spoiler-body add-model-subform">
          {modelError && (
            <div className="validation-error-subbanner" role="alert">
              <span>{modelError}</span>
            </div>
          )}

          <div className="form-row-grid">
            <div className="field-group">
              <label htmlFor="new-model-id" className="field-label">
                {t('providers.model_id_label')} *
              </label>
              <input
                id="new-model-id"
                type="text"
                className="field-input"
                value={newModelId}
                onChange={(e) => onModelIdChange(e.target.value)}
                placeholder="e.g. llama3.1:8b"
              />
            </div>

            <div className="field-group">
              <label htmlFor="new-model-name" className="field-label">
                {t('providers.model_name_label')}
              </label>
              <input
                id="new-model-name"
                type="text"
                className="field-input"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="e.g. Llama 3.1 8B"
              />
            </div>
          </div>

          <div className="form-row-grid">
            <div className="field-group">
              <label htmlFor="new-model-context" className="field-label">
                {t('providers.context_window_label')}
              </label>
              <input
                id="new-model-context"
                type="number"
                min="1"
                className="field-input"
                value={newModelContext}
                onChange={(e) => setNewModelContext(e.target.value)}
                placeholder="128000"
              />
            </div>

            <div className="field-group">
              <label htmlFor="new-model-max-tokens" className="field-label">
                {t('providers.max_tokens_label')}
              </label>
              <input
                id="new-model-max-tokens"
                type="number"
                min="1"
                className="field-input"
                value={newModelMaxTokens}
                onChange={(e) => setNewModelMaxTokens(e.target.value)}
                placeholder="4096"
              />
            </div>
          </div>

          <div className="form-checkboxes-row">
            <label className="checkbox-label" htmlFor="new-model-reasoning">
              <input
                id="new-model-reasoning"
                type="checkbox"
                className="field-checkbox"
                checked={newModelReasoning}
                onChange={(e) => setNewModelReasoning(e.target.checked)}
              />
              <span className="checkbox-text">{t('providers.supports_reasoning')}</span>
            </label>

            <label className="checkbox-label" htmlFor="new-model-image">
              <input
                id="new-model-image"
                type="checkbox"
                className="field-checkbox"
                checked={newModelSupportsImage}
                onChange={(e) => setNewModelSupportsImage(e.target.checked)}
              />
              <span className="checkbox-text">{t('providers.supports_image')}</span>
            </label>
          </div>

          {newModelReasoning && (
            <div className="form-row-grid">
              <div className="field-group">
                <label htmlFor="new-model-thinking-level" className="field-label">
                  {t('providers.default_thinking_level_label')}
                </label>
                <ProviderSelect
                  id="new-model-thinking-level"
                  value={newModelThinkingLevel}
                  onChange={(val) => setNewModelThinkingLevel(val as ThinkingLevel)}
                  options={supportedThinkingLevels.map((lvl) => ({
                    value: lvl,
                    label: t(`thinking_level.${lvl}` as TranslationKey),
                  }))}
                  aria-label={t('providers.default_thinking_level_label')}
                />
              </div>
            </div>
          )}

          <div className="add-model-btn-row">
            {editingModelId ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onSaveEditedModel}
                >
                  ✓ {t('providers.btn_update_model')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onCancelEditModel}
                >
                  {t('action.cancel')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onAddModelToDraft}
              >
                + {t('providers.btn_add_model_to_list')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
