import * as FileSystem from 'expo-file-system/legacy';
import type { ImageAttachment } from '@termbridge/shared';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export function getMediaTypeFromUri(uri: string): ImageMediaType {
  const lowerUri = uri.toLowerCase();

  if (lowerUri.includes('.png')) {
    return 'image/png';
  }
  if (lowerUri.includes('.gif')) {
    return 'image/gif';
  }
  if (lowerUri.includes('.webp')) {
    return 'image/webp';
  }

  // Default to JPEG for unknown extensions
  return 'image/jpeg';
}

export async function convertImageToBase64(uri: string): Promise<ImageAttachment> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });

  const mediaType = getMediaTypeFromUri(uri);

  return {
    type: 'image',
    mediaType,
    data: base64,
  };
}
