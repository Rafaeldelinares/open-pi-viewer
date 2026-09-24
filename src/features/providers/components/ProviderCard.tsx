import React from 'react';
import type { TranslationKey } from '@shared/i18n';
import type { CustomProviderConfig } from '@core/types/providers';
import type { ModelThinkingLevelsMap } from '@core/types/models';

export interface ProviderCardProps {
  provider: CustomProviderConfig;
  modelThinkingLevels: ModelThinkingLevelsMap;
  deletingId: string | null;
  isSaving: boolean;
  isBusy: boolean;
  onOpenEditModal: (provider: CustomProviderConfig, initialEditModelId?: string) => void;
  onSetDeletingId: (id: string | null) => void;
  onDeleteProvider: (id: string) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  modelThinkingLevels,
  deletingId,
  isSaving,
  isBusy,
  onOpenEditModal,
  onSetDeletingId,
  onDeleteProvider,
  t,
}) => {
  return (
    <div className="provider-card">
      <div className="provider-card-header">
        <div className="provider-title-group">
          <h3 className="provider-card-title">
            {provider.name || provider.id}
          </h3>
          <div className="provider-badges">
            <span className="provider-id-badge" title={t('providers.id_title')}>
              {provider.id}
            </span>
            <span className="provider-protocol-badge" title={t('providers.protocol_title')}>
              {provider.api}
            </span>
          </div>
        </div>

        <div className="provider-card-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onOpenEditModal(provider)}
            disabled={isSaving || isBusy}
            title={t('providers.edit_title')}
          >
            {t('action.edit')}
          </button>
          {deletingId === provider.id ? (
            <div className="provider-delete-confirm">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => onDeleteProvider(provider.id)}
                disabled={isSaving}
              >
                {t('providers.confirm_delete')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onSetDeletingId(null)}
                disabled={isSaving}
              >
                {t('action.cancel')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-delete-provider"
              onClick={() => onSetDeletingId(provider.id)}
              disabled={isSaving || isBusy}
              title={t('providers.delete_title')}
            >
              {t('action.delete')}
            </button>
          )}
        </div>
      </div>

      <div className="provider-card-meta">
        <div className="provider-meta-row">
          <span className="meta-label">{t('providers.base_url_label')}:</span>
          <span className="meta-value meta-code" title={provider.baseUrl}>
            {provider.baseUrl}
          </span>
        </div>

        <div className="provider-meta-row">
          <span className="meta-label">{t('providers.api_key_label')}:</span>
          <span className="meta-value">
            {provider.apiKey ? (
              provider.apiKey.startsWith('$') ? (
                <span className="env-var-badge">{provider.apiKey}</span>
              ) : (
                <span className="meta-key-configured">{t('providers.key_configured')}</span>
              )
            ) : (
              <span className="meta-key-none">{t('providers.key_none')}</span>
            )}
          </span>
        </div>
      </div>

      <div className="provider-models-section">
        <div className="provider-models-header">
          <span className="models-header-title">
            {t('providers.models_heading', { count: provider.models.length })}
          </span>
        </div>

        {provider.models.length === 0 ? (
          <p className="no-models-text">{t('providers.no_models_in_provider')}</p>
        ) : (
          <div className="provider-models-chips">
            {provider.models.map((m) => (
              <div key={m.id} className="model-chip" title={m.name || m.id}>
                <span className="model-chip-name">{m.name || m.id}</span>
                {m.name && m.name !== m.id && (
                  <span className="model-chip-id">({m.id})</span>
                )}
                {m.reasoning && (
                  <span className="model-tag-reasoning" title={t('prompt_controls.reasoning_supported')}>
                    Reasoning ({modelThinkingLevels[`${provider.id}/${m.id}`] || m.thinkingLevel || 'medium'})
                  </span>
                )}
                {m.contextWindow && (
                  <span className="model-tag-meta">
                    {Math.round(m.contextWindow / 1000)}k
                  </span>
                )}
                <button
                  type="button"
                  className="btn-chip-edit"
                  onClick={() => onOpenEditModal(provider, m.id)}
                  title={t('providers.edit_model')}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
