// src/services/settingsService.ts
import { prisma } from '../lib/prisma';
import { getSettingConfig } from '../data/settings-config';

export class SettingsService {
  static async getSettingValue<T>(key: string): Promise<T | undefined> {
    const config = getSettingConfig(key);
    const setting = await prisma.setting.findUnique({ where: { key } });

    if (!setting || setting.value === null || setting.value === undefined) {
      return config?.defaultValue as T | undefined;
    }

    if (typeof setting.value === 'string' && setting.value.trim() === '*') {
      return config?.defaultValue as T | undefined;
    }

    return setting.value as T;
  }
}
