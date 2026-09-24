import React from 'react';
import type { TranslationKey } from '@shared/i18n';
import type { CustomModelDefinition } from '@core/types/providers';
import type { ModelThinkingLevelsMap } from '@core/types/models';

export interface ProviderModelDraftListProps {
  models: CustomModelDefinition[];
  providerId: string;
  editingModelId: string | null;
  modelThinkingLevels: ModelThinkingLevelsMap;
  isFetchingModelsInModal: boolean;
  isAutoDiscovering: boolean;
  autoDiscoveryNotice: string | null;
  onFetchModels: () => void;
  onStartEditModel: (m: CustomModelDefinition) => void;
  onExcludeModel: (modelId: string) => void;
  onRemoveModelFromDraft: (modelId: string) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const ProviderModelDraftList: React.FC<ProviderModelDraftListProps> = ({
  models,
  providerId,
  editingModelId,
  modelThinkingLevels,
  isFetchingModelsInModal,
  isAutoDiscovering,
  autoDiscoveryNotice,
  onFetchModels,
  onStartEditModel,
  onExcludeModel,
  onRemoveModelFromDraft,
  t,
}) => {
  return (
    <>
      <div className="models-header-row">
        <legend className="form-legend">
          {t('providers.section_models', { count: models.length })}
        </legend>
        <button
          type="button"
          className="btn btn-secondary btn-sm btn-fetch-models-api"
          onClick={onFetchModels}
          disabled={isFetchingModelsInModal || isAutoDiscovering}
          title={t('providers.btn_fetch_models')}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isFetchingModelsInModal || isAutoDiscovering ? 'spin' : ''}
            aria-hidden="true"
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          <span>
            {isFetchingModelsInModal || isAutoDiscovering
              ? t('providers.fetching_models')
              : t('providers.btn_fetch_models')}
          </span>
        </button>
      </div>

      {autoDiscoveryNotice && (
        <div className="auto-discovery-banner" role="status">
          <span>✓ {autoDiscoveryNotice}</span>
        </div>
      )}

      {/* List of models currently in draft */}
      {models.length > 0 ? (
        <div className="models-draft-list">
          {models.map((m) => (
            <div
              key={m.id}
              className={`model-draft-row ${editingModelId === m.id ? 'editing-active' : ''}`}
            >
              <div className="model-draft-info">
                <span className="model-draft-id">{m.id}</span>
                {m.name && <span className="model-draft-name">({m.name})</span>}
                {m.reasoning && (
                  <span className="model-tag-reasoning" title={t('prompt_controls.reasoning_supported')}>
                    Reasoning ({modelThinkingLevels[`${providerId}/${m.id}`] || m.thinkingLevel || 'medium'})
                  </span>
                )}
                {m.contextWindow && (
                  <span className="model-tag-meta">
                    {Math.round(m.contextWindow / 1000)}k ctx
                  </span>
                )}
                {m.input?.includes('image') && (
                  <span className="model-tag-meta">Vision</span>
                )}
              </div>
              <div className="model-draft-actions">
                <button
                  type="button"
                  className="btn-icon-subtle btn-edit-model"
                  onClick={() => onStartEditModel(m)}
                  title={t('providers.edit_model')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="btn-icon-subtle btn-exclude-model"
                  onClick={() => onExcludeModel(m.id)}
                  title={t('providers.exclude_model')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="btn-remove-model"
                  onClick={() => onRemoveModelFromDraft(m.id)}
                  title={t('providers.remove_model')}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="models-empty-warning">
          {t('providers.models_required_warning')}
        </p>
      )}
    </>
  );
};
