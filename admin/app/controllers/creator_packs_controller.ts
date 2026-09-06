import { CreatorPackService } from '#services/creator_pack_service'
import { DownloadService } from '#services/download_service'
import { QueueService } from '#services/queue_service'
import logger from '@adonisjs/core/services/logger'
import type { HttpContext } from '@adonisjs/core/http'

export default class CreatorPacksController {
  private creatorPackService = new CreatorPackService()

  /**
   * Catalog with per-pack status, plus live progress for any in-flight pack
   * downloads (ZIM download jobs — filtered client-side by collection_ref once
   * the UI needs it; for now the raw zim job list is enough for progress).
   */
  async index({ response }: HttpContext) {
    try {
      const configured = this.creatorPackService.isConfigured()
      const packs = await this.creatorPackService.listPacksWithStatus()
      const downloadService = new DownloadService(QueueService.getInstance())
      const downloads = await downloadService.listDownloadJobs('zim')
      return { configured, packs, downloads }
    } catch (error: any) {
      logger.error('[CreatorPacksController] Не удалось получить список creator-паков:', error?.message || error)
      return response.status(500).send({ message: 'Не удалось загрузить creator-паки' })
    }
  }

  async install({ params, response }: HttpContext) {
    const packId = params.id as string
    const result = await this.creatorPackService.installPack(packId)

    switch (result.code) {
      case 'dispatched':
        return response.status(202).send({
          message: 'Загрузка пака началась',
          filename: result.filename,
        })
      case 'already_installed':
        return { message: 'Пак уже установлен' }
      case 'already_downloading':
        return { message: 'Загрузка пака уже выполняется' }
      case 'not_found':
        return response.status(404).send({ message: `Creator-пак не найден: ${packId}` })
      case 'not_configured':
        return response.status(503).send({
          message: 'Creator Packs не настроены на этом сервере',
        })
    }
  }

  async uninstall({ params, response }: HttpContext) {
    const packId = params.id as string
    const result = await this.creatorPackService.uninstallPack(packId)

    switch (result.code) {
      case 'uninstalled':
        return { message: 'Пак удалён', filename: result.filename }
      case 'not_installed':
        return response.status(404).send({ message: `Creator-пак не установлен: ${packId}` })
    }
  }
}
