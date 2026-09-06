import vine from "@vinejs/vine";
import { SETTINGS_KEYS } from "../../constants/kv_store.js";
import type { KVStoreKey } from "../../types/kv_store.js";

export const getSettingSchema = vine.compile(vine.object({
    key: vine.enum(SETTINGS_KEYS),
}))

export const updateSettingSchema = vine.compile(vine.object({
    key: vine.enum(SETTINGS_KEYS),
    value: vine.any().optional(),
}))

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Validate the *value* for keys that have format constraints beyond the generic
 * enum/any check (the generic validator only constrains the key). Returns an
 * error message string when invalid, or null when the value is acceptable.
 */
export function validateSettingValue(key: KVStoreKey, value: unknown): string | null {
    switch (key) {
        case 'autoUpdate.windowStart':
        case 'autoUpdate.windowEnd':
        case 'contentAutoUpdate.windowStart':
        case 'contentAutoUpdate.windowEnd':
            if (typeof value !== 'string' || !HHMM_PATTERN.test(value)) {
                return 'Значения временного окна должны быть в 24-часовом формате ЧЧ:ММ (например, "20:00").'
            }
            return null
        case 'autoUpdate.cooloffHours':
        case 'contentAutoUpdate.cooloffHours': {
            const num = Number(value)
            if (!Number.isInteger(num) || num < 0 || num > 8760) {
                return 'Период охлаждения должен быть целым числом часов от 0 до 8760.'
            }
            return null
        }
        case 'system.internetStatusTestUrl': {
            // Empty clears the setting (reverts to env var / built-in defaults).
            if (value === '' || value === undefined || value === null) {
                return null
            }
            if (typeof value !== 'string') {
                return 'Тестовый URL должен быть строкой.'
            }
            try {
                const url = new URL(value)
                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    return 'Тестовый URL должен использовать схему http или https.'
                }
            } catch {
                return 'Тестовый URL должен быть корректным URL (например, "https://example.com").'
            }
            return null
        }
        case 'contentAutoUpdate.maxBytesPerWindow': {
            // Per-window download budget in bytes. 0 = unlimited.
            const num = Number(value)
            if (!Number.isInteger(num) || num < 0) {
                return 'Лимит данных за окно должен быть целым числом байт (0 = без ограничений).'
            }
            return null
        }
        default:
            return null
    }
}