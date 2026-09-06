import logger from '@adonisjs/core/services/logger'
import { readFileSync, existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import KVStore from '#models/kv_store'

interface UpdateStatus {
  stage: 'idle' | 'starting' | 'pulling' | 'pulled' | 'recreating' | 'complete' | 'error'
  progress: number
  message: string
  timestamp: string
}

export class SystemUpdateService {
  private static SHARED_DIR = '/app/update-shared'
  private static REQUEST_FILE = join(SystemUpdateService.SHARED_DIR, 'update-request')
  private static STATUS_FILE = join(SystemUpdateService.SHARED_DIR, 'update-status')
  private static LOG_FILE = join(SystemUpdateService.SHARED_DIR, 'update-log')

  /**
   * Requests a system update by creating a request file that the sidecar will detect.
   *
   * @param options.targetTag - Explicit Docker image tag to install (e.g. "v1.33.2").
   *   When omitted, falls back to the cached `system.latestVersion` (manual-update
   *   behavior). Auto-update passes an eligibility-vetted tag here, which may differ
   *   from `system.latestVersion` when the newest release is a major bump.
   * @param options.requester - Identifier recorded in the request file for auditing.
   */
  async requestUpdate(options?: {
    targetTag?: string
    requester?: string
  }): Promise<{ success: boolean; message: string }> {
    try {
      const currentStatus = this.getUpdateStatus()
      if (currentStatus && !['idle', 'complete', 'error'].includes(currentStatus.stage)) {
        return {
          success: false,
          message: `Обновление уже выполняется (этап: ${currentStatus.stage})`,
        }
      }

      // Determine the Docker image tag to install. Prefer an explicit caller-supplied
      // tag; otherwise use the cached latest version.
      let targetTag = options?.targetTag
      if (!targetTag) {
        const latestVersion = await KVStore.getValue('system.latestVersion')
        targetTag = latestVersion ? `v${latestVersion}` : 'latest'
      }

      const requestData = {
        requested_at: new Date().toISOString(),
        requester: options?.requester ?? 'admin-api',
        target_tag: targetTag,
      }

      await writeFile(SystemUpdateService.REQUEST_FILE, JSON.stringify(requestData, null, 2))
      logger.info(`[SystemUpdateService]: Запрошено системное обновление (целевой тег: ${requestData.target_tag}) - sidecar обработает запрос в ближайшее время`)

      return {
        success: true,
        message: 'Системное обновление запущено. Контейнер админки будет перезапущен в процессе обновления.',
      }
    } catch (error) {
      logger.error({ err: error }, '[SystemUpdateService] Не удалось запросить системное обновление')
      return {
        success: false,
        message: 'Не удалось запросить системное обновление. Подробности смотрите в журналах сервера.',
      }
    }
  }

  getUpdateStatus(): UpdateStatus | null {
    try {
      if (!existsSync(SystemUpdateService.STATUS_FILE)) {
        return {
          stage: 'idle',
          progress: 0,
          message: 'Нет выполняемых обновлений',
          timestamp: new Date().toISOString(),
        }
      }

      const statusContent = readFileSync(SystemUpdateService.STATUS_FILE, 'utf-8')
      return JSON.parse(statusContent) as UpdateStatus
    } catch (error) {
      logger.error('[SystemUpdateService]: Не удалось прочитать статус обновления:', error)
      return null
    }
  }

  getUpdateLogs(): string {
    try {
      if (!existsSync(SystemUpdateService.LOG_FILE)) {
        return 'Журналы обновления недоступны'
      }

      return readFileSync(SystemUpdateService.LOG_FILE, 'utf-8')
    } catch (error) {
      logger.error('[SystemUpdateService]: Не удалось прочитать журналы обновления:', error)
      return `Ошибка чтения журналов: ${error.message}`
    }
  }

  /**
   * Check if the update sidecar is reachable (i.e. shared volume is mounted)
   */
  isSidecarAvailable(): boolean {
    try {
      return existsSync(SystemUpdateService.SHARED_DIR)
    } catch (error) {
      return false
    }
  }
}
