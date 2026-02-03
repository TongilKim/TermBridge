import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import type { ImageAttachment } from '@termbridge/shared';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

// Max size for Supabase Realtime (leave buffer for message overhead)
const MAX_IMAGE_SIZE_KB = 800;
const MAX_IMAGE_DIMENSION = 1920;

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

async function resizeImageIfNeeded(uri: string): Promise<string> {
  console.log('[Mobile] resizeImageIfNeeded: Checking image...');

  // First, resize to max dimension
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_IMAGE_DIMENSION } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );

  console.log('[Mobile] resizeImageIfNeeded: Resized to', resized.uri);
  return resized.uri;
}

export async function convertImageToBase64(uri: string): Promise<ImageAttachment> {
  console.log('[Mobile] convertImageToBase64: Starting for URI:', uri);

  try {
    // Resize image first
    const resizedUri = await resizeImageIfNeeded(uri);

    const base64 = await FileSystem.readAsStringAsync(resizedUri, {
      encoding: 'base64',
    });

    const sizeKB = Math.round(base64.length / 1024);
    console.log('[Mobile] convertImageToBase64: After resize - size:', sizeKB, 'KB');

    // If still too large, compress more
    if (sizeKB > MAX_IMAGE_SIZE_KB) {
      console.log('[Mobile] convertImageToBase64: Still too large, compressing more...');
      const moreCompressed = await ImageManipulator.manipulateAsync(
        resizedUri,
        [{ resize: { width: 1280 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
      );

      const compressedBase64 = await FileSystem.readAsStringAsync(moreCompressed.uri, {
        encoding: 'base64',
      });

      const finalSizeKB = Math.round(compressedBase64.length / 1024);
      console.log('[Mobile] convertImageToBase64: Final size after extra compression:', finalSizeKB, 'KB');

      return {
        type: 'image',
        mediaType: 'image/jpeg',
        data: compressedBase64,
      };
    }

    return {
      type: 'image',
      mediaType: 'image/jpeg',
      data: base64,
    };
  } catch (error) {
    console.log('[Mobile] convertImageToBase64: Error:', error);
    throw error;
  }
}
