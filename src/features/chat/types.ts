export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: 'image' | 'video' | 'audio' | 'text' | 'file' | 'other';
  mimeType: string;
  data?: string; // base64 string for images, video, audio, or binary files
  content?: string; // text content for text files
  previewUrl?: string; // for thumbnail
}

export type FileAttachmentType = 'image' | 'video' | 'audio' | 'code' | 'all';
