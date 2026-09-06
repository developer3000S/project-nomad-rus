import { MapService } from '#services/map_service'
import MapMarker from '#models/map_marker'
import {
  assertNotPrivateUrl,
  downloadCollectionValidator,
  filenameParamValidator,
  mapExtractPreflightValidator,
  mapExtractValidator,
  remoteDownloadValidator,
  remoteDownloadValidatorOptional,
} from '#validators/common'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'

@inject()
export default class MapsController {
  constructor(private mapService: MapService) {}

  async index({ inertia }: HttpContext) {
    const baseAssetsCheck = await this.mapService.ensureBaseAssets()
    const [regionFiles, worldBasemapExists] = await Promise.all([
      this.mapService.listRegions(),
      this.mapService.checkWorldBasemapExists(),
    ])
    return inertia.render('maps', {
      maps: {
        baseAssetsExist: baseAssetsCheck,
        worldBasemapExists,
        regionFiles: regionFiles.files,
      },
    })
  }

  async downloadBaseAssets({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidatorOptional)
    if (payload.url) assertNotPrivateUrl(payload.url)
    await this.mapService.downloadBaseAssets(payload.url)
    return { success: true }
  }

  async setupWorldBasemap({ response }: HttpContext) {
    try {
      const ready = await this.mapService.provisionWorldBasemap()
      if (!ready) {
        return response.status(500).send({
          message:
            'Не удалось загрузить базовую карту. Подключите NOMAD к интернету и попробуйте снова.',
        })
      }
      return { success: true }
    } catch {
      return response.status(500).send({
        message:
          'Не удалось загрузить базовую карту. Подключите NOMAD к интернету и попробуйте снова.',
      })
    }
  }

  async downloadRemote({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidator)
    assertNotPrivateUrl(payload.url)
    const filename = await this.mapService.downloadRemote(payload.url)
    return {
      message: 'Загрузка успешно началась',
      filename,
      url: payload.url,
    }
  }

  async downloadCollection({ request }: HttpContext) {
    const payload = await request.validateUsing(downloadCollectionValidator)
    const resources = await this.mapService.downloadCollection(payload.slug)
    return {
      message: 'Загрузка подборки успешно началась',
      slug: payload.slug,
      resources,
    }
  }

  // For providing a "preflight" check in the UI before actually starting a background download
  async downloadRemotePreflight({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidator)
    assertNotPrivateUrl(payload.url)
    const info = await this.mapService.downloadRemotePreflight(payload.url)
    return info
  }

  async fetchLatestCollections({}: HttpContext) {
    const success = await this.mapService.fetchLatestCollections()
    return { success }
  }

  async listCuratedCollections({}: HttpContext) {
    return await this.mapService.listCuratedCollections()
  }

  async listRegions({}: HttpContext) {
    return await this.mapService.listRegions()
  }

  async globalMapInfo({}: HttpContext) {
    return await this.mapService.getGlobalMapInfo()
  }

  async downloadGlobalMap({}: HttpContext) {
    const result = await this.mapService.downloadGlobalMap()
    return {
      message: 'Загрузка успешно началась',
      ...result,
    }
  }

  async listCountries({}: HttpContext) {
    return { countries: await this.mapService.listCountries() }
  }

  async listCountryGroups({}: HttpContext) {
    return { groups: await this.mapService.listCountryGroups() }
  }

  async extractPreflight({ request }: HttpContext) {
    const payload = await request.validateUsing(mapExtractPreflightValidator)
    return await this.mapService.extractPreflight(payload)
  }

  async extractRegion({ request }: HttpContext) {
    const payload = await request.validateUsing(mapExtractValidator)
    const result = await this.mapService.extractRegion(payload)
    return {
      message: 'Извлечение успешно началось',
      ...result,
    }
  }

  async styles({ request, response }: HttpContext) {
    // Automatically ensure base assets are present before generating styles
    const baseAssetsExist = await this.mapService.ensureBaseAssets()
    if (!baseAssetsExist) {
      return response.status(500).send({
        message:
          'Ресурсы базовой карты отсутствуют и не могут быть загружены. Проверьте подключение и попробуйте снова.',
      })
    }

    const forwardedProto = request.headers()['x-forwarded-proto'];

    const protocol: string = forwardedProto
      ? (typeof forwardedProto === 'string' ? forwardedProto : request.protocol())
      : request.protocol();

    const styles = await this.mapService.generateStylesJSON(request.host(), protocol)
    return response.json(styles)
  }

  async delete({ request, response }: HttpContext) {
    const payload = await request.validateUsing(filenameParamValidator)

    try {
      await this.mapService.delete(payload.params.filename)
    } catch (error) {
      if (error.message === 'not_found') {
        return response.status(404).send({
          message: `Файл карты с ключом ${payload.params.filename} не найден`,
        })
      }
      throw error // Re-throw any other errors and let the global error handler catch
    }

    return {
      message: 'Файл карты успешно удалён',
    }
  }

  // --- Map Markers ---

  async listMarkers({}: HttpContext) {
    return await MapMarker.query().orderBy('created_at', 'asc')
  }

  async createMarker({ request }: HttpContext) {
    const payload = await request.validateUsing(
      vine.compile(
        vine.object({
          name: vine.string().trim().minLength(1).maxLength(255),
          longitude: vine.number().min(-180).max(180),
          latitude: vine.number().min(-90).max(90),
          color: vine.string().trim().maxLength(20).optional(),
          notes: vine.string().trim().nullable().optional(),
          marker_type: vine.string().trim().maxLength(20).optional(),
        })
      )
    )
    const marker = await MapMarker.create({
      name: payload.name,
      longitude: payload.longitude,
      latitude: payload.latitude,
      color: payload.color ?? 'orange',
      notes: payload.notes ?? null,
      marker_type: payload.marker_type ?? 'pin',
    })
    return marker
  }

  async updateMarker({ request, response }: HttpContext) {
    const { id } = request.params()
    const marker = await MapMarker.find(id)
    if (!marker) {
      return response.status(404).send({ message: 'Маркер не найден' })
    }
    const payload = await request.validateUsing(
      vine.compile(
        vine.object({
          name: vine.string().trim().minLength(1).maxLength(255).optional(),
          color: vine.string().trim().maxLength(20).optional(),
          longitude: vine.number().min(-180).max(180).optional(),
          latitude: vine.number().min(-90).max(90).optional(),
          notes: vine.string().trim().nullable().optional(),
          marker_type: vine.string().trim().maxLength(20).optional(),
        })
      )
    )
    if (payload.name !== undefined) marker.name = payload.name
    if (payload.color !== undefined) marker.color = payload.color
    if (payload.longitude !== undefined) marker.longitude = payload.longitude
    if (payload.latitude !== undefined) marker.latitude = payload.latitude
    if (payload.notes !== undefined) marker.notes = payload.notes
    if (payload.marker_type !== undefined) marker.marker_type = payload.marker_type
    await marker.save()
    return marker
  }

  async deleteMarker({ request, response }: HttpContext) {
    const { id } = request.params()
    const marker = await MapMarker.find(id)
    if (!marker) {
      return response.status(404).send({ message: 'Маркер не найден' })
    }
    await marker.delete()
    return { message: 'Маркер удалён' }
  }
}
