import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import KVStore from '#models/kv_store'
import Service from '#models/service'
import { DockerService } from '#services/docker_service'
import { DownloadService } from '#services/download_service'
import { SystemService } from '#services/system_service'
import { ContainerRegistryService } from '#services/container_registry_service'
import { isNewerVersion, parseMajorVersion } from '../utils/version.js'
import { isWithinWindow } from '../utils/update_window.js'
import {
  checkImageDiskSpace,
  type Blocker,
  type PreflightResult,
} from '../utils/image_disk_preflight.js'

/**
 * Defaults shared with the core auto-update. App auto-updates intentionally reuse
 * the SAME window/cool-off settings (`autoUpdate.windowStart/windowEnd/cooloffHours`);
 * only the enable flag (`appAutoUpdate.enabled`) is separate.
 */
const DEFAULT_WINDOW_START = '02:00'
const DEFAULT_WINDOW_END = '05:00'
const DEFAULT_COOLOFF_HOURS = 72

/** Per-app genuine failures before that app self-disables (others keep running). */
const MAX_CONSECUTIVE_FAILURES = 3

export interface AppAutoUpdateConfig {
  /** Global master switch (`appAutoUpdate.enabled`). */
  enabled: boolean
  windowStart: string
  windowEnd: string
  cooloffHours: number
}

/** An installed app that should be auto-updated this run. */
export interface AppUpdateTarget {
  service: Service
  /** Exact registry tag to update to (the value in `available_update_version`). */
  targetVersion: string
}

/** Per-app eligibility verdict (drives both selection and the status UI). */
export interface AppEligibility {
  eligible: boolean
  reason: string
  cooloffRemainingHours: number | null
}

export interface AppAutoUpdateAppStatus {
  service_name: string
  friendly_name: string | null
  auto_update_enabled: boolean
  current_version: string
  available_update_version: string | null
  first_seen_at: string | null
  eligible: boolean
  reason: string
  cooloff_remaining_hours: number | null
  consecutive_failures: number
  auto_disabled_reason: string | null
}

export interface AppAutoUpdateStatus extends AppAutoUpdateConfig {
  withinWindow: boolean
  lastAttemptAt: string | null
  lastResult: string | null
  apps: AppAutoUpdateAppStatus[]
}

/**
 * Decision + safety layer for automatic updates of installed sibling apps (the
 * containers NOMAD deploys via the Docker socket and manages in Supply Depot).
 *
 * This is the app-side counterpart to {@link AutoUpdateService} and intentionally
 * reuses its generic window/disk pre-flight helpers. Unlike the core update, an
 * app update needs no sidecar — the admin container recreates its siblings directly
 * via {@link DockerService.updateContainer} (in-process pull → rename → health-check
 * → rollback). Auto-update only decides *whether* each opted-in app should update now
 * (master switch on + per-app toggle on + in window + an eligible minor/patch past
 * its cool-off + pre-flight passes) and then drives the existing update path.
 *
 * Minor/patch-only is already guaranteed upstream by
 * {@link ContainerRegistryService.getAvailableUpdates} (same-major filter); the
 * major-version check here is defense-in-depth.
 */
@inject()
export class AppAutoUpdateService {
  constructor(
    private dockerService: DockerService,
    private downloadService: DownloadService,
    private systemService: SystemService,
    private containerRegistryService: ContainerRegistryService
  ) {}

  /** Read the global master switch plus the shared window/cool-off settings. */
  async getConfig(): Promise<AppAutoUpdateConfig> {
    const [enabled, windowStart, windowEnd, cooloffHours] = await Promise.all([
      KVStore.getValue('appAutoUpdate.enabled'),
      KVStore.getValue('autoUpdate.windowStart'),
      KVStore.getValue('autoUpdate.windowEnd'),
      KVStore.getValue('autoUpdate.cooloffHours'),
    ])

    const parsedCooloff = Number(cooloffHours)
    return {
      enabled: enabled ?? false,
      windowStart: windowStart || DEFAULT_WINDOW_START,
      windowEnd: windowEnd || DEFAULT_WINDOW_END,
      // `Number(null) === 0`, so an unset value must fall through to the default
      // rather than silently resolving to a zero cool-off. An explicit 0 is honored.
      cooloffHours:
        cooloffHours !== null && Number.isFinite(parsedCooloff) && parsedCooloff >= 0
          ? parsedCooloff
          : DEFAULT_COOLOFF_HOURS,
    }
  }

  /**
   * Pure per-app eligibility verdict. An app is eligible when it has a detected
   * update that is the same major (defense-in-depth), strictly newer, not self-
   * disabled, and past its cool-off (measured from first-detected).
   */
  appEligibility(service: Service, cooloffHours: number, now: DateTime): AppEligibility {
    if (!service.available_update_version) {
      return { eligible: false, reason: 'Актуальная версия', cooloffRemainingHours: null }
    }
    if (service.auto_update_disabled_reason) {
      return {
        eligible: false,
        reason: 'Автообновление отключено после повторных сбоев',
        cooloffRemainingHours: null,
      }
    }

    const currentTag = this.containerRegistryService.parseImageReference(
      service.container_image
    ).tag
    if (currentTag === 'latest') {
      return {
        eligible: false,
        reason: 'Закреплено за :latest — проверка версии невозможна',
        cooloffRemainingHours: null,
      }
    }
    if (parseMajorVersion(service.available_update_version) !== parseMajorVersion(currentTag)) {
      return {
        eligible: false,
        reason: 'Мажорная версия — требуется ручное обновление',
        cooloffRemainingHours: null,
      }
    }
    if (!isNewerVersion(service.available_update_version, currentTag)) {
      return { eligible: false, reason: 'Актуальная версия', cooloffRemainingHours: null }
    }
    if (!service.available_update_first_seen_at) {
      return { eligible: false, reason: 'Ожидание периода охлаждения', cooloffRemainingHours: cooloffHours }
    }

    const ageHours = now.diff(service.available_update_first_seen_at, 'hours').hours
    const remaining = cooloffHours - ageHours
    if (remaining > 0) {
      const rounded = Math.ceil(remaining)
      return {
        eligible: false,
        reason: `Период охлаждения (осталось ${rounded} ч)`,
        cooloffRemainingHours: rounded,
      }
    }

    return {
      eligible: true,
      reason: `Доступно обновление → ${service.available_update_version}`,
      cooloffRemainingHours: 0,
    }
  }

  /** Installed, opted-in apps that are eligible to update right now. */
  async getEligibleApps(config: AppAutoUpdateConfig, now: DateTime): Promise<AppUpdateTarget[]> {
    const apps = await Service.query().where('installed', true).where('auto_update_enabled', true)
    const targets: AppUpdateTarget[] = []
    for (const service of apps) {
      const verdict = this.appEligibility(service, config.cooloffHours, now)
      if (verdict.eligible) {
        targets.push({ service, targetVersion: service.available_update_version! })
      }
    }
    return targets
  }

  /**
   * Run-wide pre-flight checked once per attempt (independent of any single app):
   * never auto-update while content/model downloads are running. Transient → `skip`.
   */
  async runGlobalPreflight(): Promise<PreflightResult> {
    const blockers: Blocker[] = []
    try {
      const downloads = await this.downloadService.listDownloadJobs()
      const active = downloads.filter(
        (d) => !!d.status && ['waiting', 'active', 'delayed'].includes(d.status)
      )
      if (active.length > 0) {
        blockers.push({ reason: `${active.length} загрузка(и) выполняется`, severity: 'skip' })
      }
    } catch (error) {
      logger.warn(`[AppAutoUpdateService] Не удалось проверить активные загрузки: ${error.message}`)
    }
    return { ok: blockers.length === 0, blockers }
  }

  /** Per-app pre-flight: not already mid-operation (`skip`) and enough disk (`failure`). */
  async runAppPreflight(target: AppUpdateTarget): Promise<PreflightResult> {
    const blockers: Blocker[] = []
    const service = target.service

    if (service.installation_status !== 'idle') {
      blockers.push({
        reason: `Приложение выполняет операцию (статус: ${service.installation_status})`,
        severity: 'skip',
      })
    }

    const hostArch = await this.getHostArch()
    const targetImage = `${this.imageBase(service.container_image)}:${target.targetVersion}`
    const diskBlocker = await checkImageDiskSpace({
      image: targetImage,
      hostArch,
      containerRegistryService: this.containerRegistryService,
      systemService: this.systemService,
    })
    if (diskBlocker) blockers.push(diskBlocker)

    return { ok: blockers.length === 0, blockers }
  }

  /**
   * Entry point invoked by AppAutoUpdateJob. Gates on the master switch + window,
   * then runs each eligible app through pre-flight and {@link DockerService.updateContainer}.
   * A failing app self-disables after repeated failures without affecting the others.
   */
  async attempt(): Promise<{ updated: number; reason: string }> {
    const config = await this.getConfig()
    const now = DateTime.now()

    if (!config.enabled) {
      return { updated: 0, reason: 'Автообновление приложений отключено' }
    }
    if (!isWithinWindow(config.windowStart, config.windowEnd, now)) {
      const reason = `Вне окна обновления (${config.windowStart}-${config.windowEnd})`
      await this.recordRun(reason)
      return { updated: 0, reason }
    }

    const eligible = await this.getEligibleApps(config, now)
    if (eligible.length === 0) {
      const reason = 'Нет доступных обновлений приложений (все актуальны, в периоде охлаждения или только мажорные)'
      await this.recordRun(reason)
      return { updated: 0, reason }
    }

    const global = await this.runGlobalPreflight()
    if (!global.ok) {
      const reason = `Заблокировано предварительной проверкой: ${global.blockers.map((b) => b.reason).join('; ')}`
      await this.recordRun(reason)
      return { updated: 0, reason }
    }

    let updated = 0
    let failed = 0
    let skipped = 0

    for (const target of eligible) {
      const name = target.service.service_name
      const preflight = await this.runAppPreflight(target)
      if (!preflight.ok) {
        const summary = preflight.blockers.map((b) => b.reason).join('; ')
        if (preflight.blockers.some((b) => b.severity === 'failure')) {
          await this.recordAppFailure(target.service, summary)
          failed++
        } else {
          logger.info(`[AppAutoUpdateService] Пропущено ${name}: ${summary}`)
          skipped++
        }
        continue
      }

      logger.info(`[AppAutoUpdateService] Обновление ${name} → ${target.targetVersion}`)
      const result = await this.dockerService.updateContainer(name, target.targetVersion)
      if (result.success) {
        await this.recordAppSuccess(target.service)
        updated++
      } else {
        await this.recordAppFailure(target.service, result.message)
        failed++
      }
    }

    const reason = `${updated} обновлено, ${failed} с ошибкой, ${skipped} пропущено`
    await this.recordRun(reason)
    logger.info(`[AppAutoUpdateService] Запуск завершён: ${reason}`)
    return { updated, reason }
  }

  /** Clear an app's failure backoff after a successful auto-update. */
  private async recordAppSuccess(service: Service): Promise<void> {
    // updateContainer already advanced container_image and cleared
    // available_update_version on its own (fresh) row; here we only touch the
    // backoff fields, so Lucid persists just those dirty columns.
    service.auto_update_consecutive_failures = 0
    service.auto_update_disabled_reason = null
    await service.save()
  }

  /** Record an app failure and self-disable it once the threshold is reached. */
  private async recordAppFailure(service: Service, reason: string): Promise<void> {
    const failures = (service.auto_update_consecutive_failures || 0) + 1
    service.auto_update_consecutive_failures = failures
    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      service.auto_update_disabled_reason = `Автообновление отключено после ${failures} последовательных сбоев. Последняя ошибка: ${reason}`
      logger.error(
        `[AppAutoUpdateService] ${service.service_name} автообновление отключено после ${failures} сбоев`
      )
    }
    await service.save()
    logger.error(
      `[AppAutoUpdateService] ${service.service_name} сбой ${failures}/${MAX_CONSECUTIVE_FAILURES}: ${reason}`
    )
  }

  /** Record the global last-attempt summary for the settings UI. */
  private async recordRun(reason: string): Promise<void> {
    await KVStore.setValue('appAutoUpdate.lastAttemptAt', DateTime.now().toISO()!)
    await KVStore.setValue('appAutoUpdate.lastResult', reason)
  }

  /** Full state snapshot for the settings UI (opted-in apps + their eligibility). */
  async getStatus(): Promise<AppAutoUpdateStatus> {
    const config = await this.getConfig()
    const now = DateTime.now()

    const apps = await Service.query().where('installed', true).where('auto_update_enabled', true)
    const appStatuses: AppAutoUpdateAppStatus[] = apps.map((service) => {
      const verdict = this.appEligibility(service, config.cooloffHours, now)
      return {
        service_name: service.service_name,
        friendly_name: service.friendly_name,
        auto_update_enabled: service.auto_update_enabled,
        current_version: this.containerRegistryService.parseImageReference(service.container_image)
          .tag,
        available_update_version: service.available_update_version,
        first_seen_at: service.available_update_first_seen_at?.toISO() ?? null,
        eligible: verdict.eligible,
        reason: verdict.reason,
        cooloff_remaining_hours: verdict.cooloffRemainingHours,
        consecutive_failures: service.auto_update_consecutive_failures || 0,
        auto_disabled_reason: service.auto_update_disabled_reason,
      }
    })

    const [lastAttemptAt, lastResult] = await Promise.all([
      KVStore.getValue('appAutoUpdate.lastAttemptAt'),
      KVStore.getValue('appAutoUpdate.lastResult'),
    ])

    return {
      ...config,
      withinWindow: isWithinWindow(config.windowStart, config.windowEnd, now),
      lastAttemptAt: lastAttemptAt || null,
      lastResult: lastResult || null,
      apps: appStatuses,
    }
  }

  /** Strip the tag from an image reference, leaving "registry/namespace/repo". */
  private imageBase(image: string): string {
    return image.includes(':') ? image.substring(0, image.lastIndexOf(':')) : image
  }

  /** Map the Docker daemon's architecture string to OCI naming (amd64/arm64/...). */
  private async getHostArch(): Promise<string> {
    try {
      const info = await this.dockerService.docker.info()
      const arch = info.Architecture || ''
      const archMap: Record<string, string> = {
        x86_64: 'amd64',
        aarch64: 'arm64',
        armv7l: 'arm',
        amd64: 'amd64',
        arm64: 'arm64',
      }
      return archMap[arch] || arch.toLowerCase()
    } catch {
      return 'amd64'
    }
  }
}
