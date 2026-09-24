import React from 'react';
import type { TranslationKey } from '@shared/i18n';
import type { ModelsConfigFile } from '@core/types/providers';

export interface RawJsonViewerProps {
  fullConfig: ModelsConfigFile;
  copiedRawJson: boolean;
  onCopyRawJson: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const RawJsonViewer: React.FC<RawJsonViewerProps> = ({
  fullConfig,
  copiedRawJson,
  onCopyRawJson,
  t,
}) => {
  return (
    <section className="settings-card-section raw-json-section">
      <div className="raw-json-header">
        <span className="raw-json-title">~/.pi/agent/models.json</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onCopyRawJson}
        >
          {copiedRawJson ? t('action.copied') : t('action.copy')}
        </button>
      </div>
      <pre className="raw-json-code">
        {JSON.stringify(fullConfig, null, 2)}
      </pre>
    </section>
  );
};
