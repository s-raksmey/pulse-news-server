// src/services/settingsService.ts
import { prisma } from '../lib/prisma';
import { getSettingConfig } from '../data/settings-config';

export class SettingsService {
  static async getSettingValue<T>(key: string): Promise<T | undefined> {
    try {
      const config = getSettingConfig(key);
      const setting = await prisma.setting.findUnique({ where: { key } });

      if (!setting || setting.value === null || setting.value === undefined) {
        return config?.defaultValue as T | undefined;
      }

      if (typeof setting.value === 'string' && setting.value.trim() === '*') {
        return config?.defaultValue as T | undefined;
      }

      return setting.value as T;
    } catch (error) {
      // If database is unavailable, return undefined to allow fallback to environment variables
      console.warn(`Failed to get setting '${key}' from database, falling back to environment variables:`, error instanceof Error ? error.message : 'Unknown error');
      const config = getSettingConfig(key);
      return config?.defaultValue as T | undefined;
    }
  }
}
