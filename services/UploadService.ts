import { Platform } from 'react-native';
import axios from 'axios';
import { API_BASE_URL } from '@/constants/API';

export interface UploadPayload {
  imageUri: string;
  latitude: number;
  longitude: number;
  address: string;
  userId: string;
  userName: string;
}

export const uploadGeotaggedPhoto = async (payload: UploadPayload): Promise<void> => {
  console.log('[UploadService] Preparing upload payload...');
  const { imageUri, latitude, longitude, address, userId, userName } = payload;
  
  const filename = imageUri.split('/').pop() || `photo_${Date.now()}.jpg`;
  const match = /\.(\w+)$/.exec(filename);
  const ext = match ? match[1].toLowerCase() : 'jpg';
  const type = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  const formData = new FormData();

  if (Platform.OS === 'web') {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    formData.append('file', blob, filename);
  } else {
    const decodedUri = decodeURIComponent(imageUri);
    // @ts-ignore
    formData.append('file', {
      uri: decodedUri,
      name: filename,
      type
    });
  }

  formData.append('userId', userId);
  formData.append('userName', userName);
  formData.append('latitude', String(latitude));
  formData.append('longitude', String(longitude));
  formData.append('address', address);
  formData.append('mediaType', 'image');
  formData.append('timestamp', String(Date.now()));
  formData.append('date', new Date().toISOString().split('T')[0]);

  console.log('[UploadService] Uploading to backend API...');
  
  const response = await axios.post(`${API_BASE_URL}/media`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Upload failed with status ${response.status}`);
  }
  
  console.log('[UploadService] Upload successful!');
};
