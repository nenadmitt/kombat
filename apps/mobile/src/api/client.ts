import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiClient } from '@gaming-platform/core';

import { env } from '../config/env';
import { ACCESS_TOKEN_STORAGE_KEY } from '../storage/storage-keys';

/**
 * Shared API client singleton. Reads the persisted JWT directly from
 * AsyncStorage (rather than importing the auth store) so this module has no
 * dependency on store state - avoids a store <-> api-client import cycle.
 */
export const apiClient = new ApiClient({
  baseUrl: env.apiBaseUrl,
  getAccessToken: () => AsyncStorage.getItem(ACCESS_TOKEN_STORAGE_KEY),
});
