export type OpenUrlStatus = 'idle' | 'opening' | 'opened' | 'failed';

export interface OpenUrlResult {
  success: boolean;
  error?: string;
}
