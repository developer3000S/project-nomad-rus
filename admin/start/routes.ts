/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/
import BenchmarkController from '#controllers/benchmark_controller'
import ChatsController from '#controllers/chats_controller'
import ConditionsController from '#controllers/conditions_controller'
import DocsController from '#controllers/docs_controller'
import DrugReferenceController from '#controllers/drug_reference_controller'
import DownloadsController from '#controllers/downloads_controller'
import EasySetupController from '#controllers/easy_setup_controller'
import HomeController from '#controllers/home_controller'
import MapsController from '#controllers/maps_controller'
import NomadMdController from '#controllers/nomad_md_controller'
import OllamaController from '#controllers/ollama_controller'
import OpenApiController from '#controllers/openapi_controller'
import RagController from '#controllers/rag_controller'
import SettingsController from '#controllers/settings_controller'
import SupplyDepotController from '#controllers/supply_depot_controller'
import SystemController from '#controllers/system_controller'
import CollectionUpdatesController from '#controllers/collection_updates_controller'
import CreatorPacksController from '#controllers/creator_packs_controller'
import ZimController from '#controllers/zim_controller'
import router from '@adonisjs/core/services/router'
import transmit from '@adonisjs/transmit/services/main'
import { documented } from '#start/openapi/documented'
import {
  remoteDownloadValidator,
  remoteDownloadWithMetadataValidator,
  remoteDownloadValidatorOptional,
  filenameParamValidator,
  downloadCollectionValidator,
  downloadCategoryTierValidator,
  selectWikipediaValidator,
  applyContentUpdateValidator,
  applyAllContentUpdatesValidator,
  mapExtractPreflightValidator,
  mapExtractValidator,
} from '#validators/common'
import {
  listRemoteZimValidator,
  addCustomLibraryValidator,
  browseLibraryValidator,
  idParamValidator,
} from '#validators/zim'
import {
  getJobStatusSchema,
  deleteFileSchema,
  embedFileSchema,
  fileSourceSchema,
  estimateBatchSchema,
} from '#validators/rag'
import {
  installServiceValidator,
  affectServiceValidator,
  subscribeToReleaseNotesValidator,
  checkLatestVersionValidator,
  updateServiceValidator,
  preflightValidator,
  setServiceAutoUpdateValidator,
  preflightCustomValidator,
  customAppValidator,
  setServiceCustomUrlValidator,
  deleteCustomAppValidator,
  uninstallServiceValidator,
  serviceLogsValidator,
  updateCustomAppValidator,
} from '#validators/system'
import {
  chatSchema,
  unloadChatModelsSchema,
  getAvailableModelsSchema,
} from '#validators/ollama'
import { getSettingSchema, updateSettingSchema } from '#validators/settings'
import {
  createSessionSchema,
  updateSessionSchema,
  addMessageSchema,
} from '#validators/chat'
import { downloadJobsByFiletypeSchema, modelNameSchema } from '#validators/download'
import { runBenchmarkValidator, submitBenchmarkValidator } from '#validators/benchmark'
import { healthResponse, errorResponse } from '#validators/responses/common'
import {
  chatSessionResponse,
  chatSessionListResponse,
  chatMessageResponse,
} from '#validators/responses/chat'
import { updateNomadMdSchema } from '#validators/nomad_md'
import { searchDrugValidator, interactionsValidator } from '#validators/drug_reference'
import { conditionDrugsValidator } from '#validators/conditions'

transmit.registerRoutes()

router.get('/', [HomeController, 'index'])
router.get('/home', [HomeController, 'home'])
router.on('/about').renderInertia('about')
router.get('/chat', [ChatsController, 'inertia'])
router.get('/maps', [MapsController, 'index'])
router.get('/supply-depot', [SupplyDepotController, 'index'])
router.on('/knowledge-base').redirectToPath('/chat?knowledge_base=true') // redirect for legacy knowledge-base links

router.get('/easy-setup', [EasySetupController, 'index'])
router.get('/easy-setup/complete', [EasySetupController, 'complete'])
documented(
  router.get('/api/easy-setup/curated-categories', [EasySetupController, 'listCuratedCategories']),
  {
    summary: 'Получить список категорий быстрой настройки',
    tags: ['easy-setup'],
  }
)
documented(router.post('/api/manifests/refresh', [EasySetupController, 'refreshManifests']), {
  summary: 'Обновить манифесты контента',
  tags: ['easy-setup'],
})
router
  .group(() => {
    documented(router.post('/check', [CollectionUpdatesController, 'checkForUpdates']), {
      summary: 'Проверить доступные обновления контента',
      tags: ['content-updates'],
    })
    documented(router.post('/apply', [CollectionUpdatesController, 'applyUpdate']), {
      summary: 'Применить обновление контента',
      tags: ['content-updates'],
      request: applyContentUpdateValidator,
    })
    documented(router.post('/apply-all', [CollectionUpdatesController, 'applyAllUpdates']), {
      summary: 'Применить все доступные обновления контента',
      tags: ['content-updates'],
      request: applyAllContentUpdatesValidator,
    })
  })
  .prefix('/api/content-updates')

router
  .group(() => {
    router.get('/system', [SettingsController, 'system'])
    router.on('/apps').redirectToPath('/supply-depot') // superseded by Supply Depot
    router.get('/legal', [SettingsController, 'legal'])
    router.get('/maps', [SettingsController, 'maps'])
    router.get('/models', [SettingsController, 'models'])
    router.get('/update', [SettingsController, 'update'])
    router.get('/zim', [SettingsController, 'zim'])
    router.get('/zim/remote-explorer', [SettingsController, 'zimRemote'])
    router.get('/creator-packs', [SettingsController, 'creatorPacks'])
    router.get('/benchmark', [SettingsController, 'benchmark'])
    router.get('/support', [SettingsController, 'support'])
    router.get('/advanced', [SettingsController, 'advanced'])
  })
  .prefix('/settings')

router
  .group(() => {
    router.get('/:slug', [DocsController, 'show'])
    router.get('/', ({ response }) => {
      // redirect to /docs/home if accessing root
      response.redirect('/docs/home')
    })
  })
  .prefix('/docs')

router
  .group(() => {
    documented(router.get('/regions', [MapsController, 'listRegions']), {
      summary: 'Получить список доступных регионов карт',
      tags: ['maps'],
    })
    documented(router.get('/styles', [MapsController, 'styles']), {
      summary: 'Получить список доступных стилей карт',
      tags: ['maps'],
    })
    documented(router.get('/curated-collections', [MapsController, 'listCuratedCollections']), {
      summary: 'Получить список подборок карт',
      tags: ['maps'],
    })
    documented(router.post('/fetch-latest-collections', [MapsController, 'fetchLatestCollections']), {
      summary: 'Загрузить последние подборки карт',
      tags: ['maps'],
    })
    documented(router.post('/download-base-assets', [MapsController, 'downloadBaseAssets']), {
      summary: 'Скачать базовые ресурсы карт',
      tags: ['maps'],
      request: remoteDownloadValidatorOptional,
    })
    documented(router.post('/setup-world-basemap', [MapsController, 'setupWorldBasemap']), {
      summary: 'Подготовить базовую карту мира',
      tags: ['maps'],
    })
    documented(router.post('/download-remote', [MapsController, 'downloadRemote']), {
      summary: 'Добавить загрузку удалённой карты в очередь',
      tags: ['maps'],
      request: remoteDownloadValidator,
    })
    documented(router.post('/download-remote-preflight', [MapsController, 'downloadRemotePreflight']), {
      summary: 'Проверить возможность загрузки удалённой карты',
      tags: ['maps'],
      request: remoteDownloadValidator,
    })
    documented(router.post('/download-collection', [MapsController, 'downloadCollection']), {
      summary: 'Скачать подборку карт',
      tags: ['maps'],
      request: downloadCollectionValidator,
    })
    documented(router.get('/global-map-info', [MapsController, 'globalMapInfo']), {
      summary: 'Получить информацию о глобальной карте',
      tags: ['maps'],
    })
    documented(router.post('/download-global-map', [MapsController, 'downloadGlobalMap']), {
      summary: 'Скачать глобальную карту',
      tags: ['maps'],
    })
    documented(router.get('/countries', [MapsController, 'listCountries']), {
      summary: 'Получить список доступных стран',
      tags: ['maps'],
    })
    documented(router.get('/country-groups', [MapsController, 'listCountryGroups']), {
      summary: 'Получить список групп стран',
      tags: ['maps'],
    })
    documented(router.post('/extract-preflight', [MapsController, 'extractPreflight']), {
      summary: 'Проверить возможность извлечения региона карты',
      tags: ['maps'],
      request: mapExtractPreflightValidator,
    })
    documented(router.post('/extract', [MapsController, 'extractRegion']), {
      summary: 'Извлечь регион карты',
      tags: ['maps'],
      request: mapExtractValidator,
    })
    documented(router.get('/markers', [MapsController, 'listMarkers']), {
      summary: 'Получить список маркеров карты',
      tags: ['maps'],
    })
    documented(router.post('/markers', [MapsController, 'createMarker']), {
      summary: 'Создать маркер карты',
      tags: ['maps'],
    })
    documented(router.patch('/markers/:id', [MapsController, 'updateMarker']), {
      summary: 'Обновить маркер карты',
      tags: ['maps'],
    })
    documented(router.delete('/markers/:id', [MapsController, 'deleteMarker']), {
      summary: 'Удалить маркер карты',
      tags: ['maps'],
    })
    documented(router.delete('/:filename', [MapsController, 'delete']), {
      summary: 'Удалить файл карты',
      tags: ['maps'],
      params: filenameParamValidator,
    })
  })
  .prefix('/api/maps')

router
  .group(() => {
    documented(router.get('/list', [DocsController, 'list']), {
      summary: 'Получить список страниц документации',
      tags: ['docs'],
    })
  })
  .prefix('/api/docs')

router
  .group(() => {
    documented(router.get('/jobs', [DownloadsController, 'index']), {
      summary: 'Получить список задач загрузки',
      tags: ['downloads'],
    })
    documented(router.get('/jobs/:filetype', [DownloadsController, 'filetype']), {
      summary: 'Получить задачи загрузки по типу файла',
      tags: ['downloads'],
      params: downloadJobsByFiletypeSchema,
    })
    documented(router.delete('/jobs/:jobId', [DownloadsController, 'removeJob']), {
      summary: 'Удалить задачу загрузки',
      tags: ['downloads'],
    })
    documented(router.post('/jobs/:jobId/cancel', [DownloadsController, 'cancelJob']), {
      summary: 'Отменить задачу загрузки',
      tags: ['downloads'],
    })
    documented(router.post('/jobs/:jobId/retry', [DownloadsController, 'retryJob']), {
      summary: 'Повторить задачу загрузки',
      tags: ['downloads'],
    })
  })
  .prefix('/api/downloads')

documented(
  router.get('/api/health', () => {
    return { status: 'ok' }
  }),
  { summary: 'Проверка работоспособности', tags: ['meta'], responses: { 200: healthResponse } }
)

// Self-generating API docs: OpenAPI spec + Scalar UI. Registered top-level so
// they stay clear of the `/docs/:slug` markdown catch-all above. The Scalar
// bundle is served from this app (not a CDN) for offline appliances.
router.get('/api/openapi.json', [OpenApiController, 'spec'])
router.get('/reference', [OpenApiController, 'reference'])
router.get('/reference/assets/standalone.js', [OpenApiController, 'standalone'])

router
  .group(() => {
    documented(router.post('/chat', [OllamaController, 'chat']), {
      summary: 'Отправить запрос завершения чата',
      tags: ['ollama'],
      request: chatSchema,
    })
    documented(router.get('/models', [OllamaController, 'availableModels']), {
      summary: 'Получить список доступных моделей',
      tags: ['ollama'],
      query: getAvailableModelsSchema,
    })
    documented(router.post('/models', [OllamaController, 'dispatchModelDownload']), {
      summary: 'Добавить загрузку модели в очередь',
      tags: ['ollama'],
      request: modelNameSchema,
    })
    documented(router.delete('/models', [OllamaController, 'deleteModel']), {
      summary: 'Удалить модель',
      tags: ['ollama'],
      request: modelNameSchema,
    })
    documented(router.get('/installed-models', [OllamaController, 'installedModels']), {
      summary: 'Получить список установленных моделей',
      tags: ['ollama'],
    })
    documented(router.post('/unload-chat-models', [OllamaController, 'unloadChatModels']), {
      summary: 'Выгрузить модели чата из памяти',
      tags: ['ollama'],
      request: unloadChatModelsSchema,
    })
    documented(router.post('/configure-remote', [OllamaController, 'configureRemote']), {
      summary: 'Настроить удалённую конечную точку Ollama',
      tags: ['ollama'],
    })
    documented(router.get('/remote-status', [OllamaController, 'remoteStatus']), {
      summary: 'Получить статус удалённой Ollama',
      tags: ['ollama'],
    })
  })
  .prefix('/api/ollama')

router
  .group(() => {
    documented(router.get('/nomad-md', [NomadMdController, 'show']), {
      summary: 'Получить системный промпт NOMAD.md',
      tags: ['ai'],
    })
    documented(router.put('/nomad-md', [NomadMdController, 'update']), {
      summary: 'Обновить системный промпт NOMAD.md',
      tags: ['ai'],
      request: updateNomadMdSchema,
    })
  })
  .prefix('/api/ai')

router
  .group(() => {
    documented(router.get('/', [ChatsController, 'index']), {
      summary: 'Получить список сессий чата',
      tags: ['chat'],
      responses: { 200: chatSessionListResponse },
    })
    documented(router.post('/', [ChatsController, 'store']), {
      summary: 'Создать сессию чата',
      tags: ['chat'],
      request: createSessionSchema,
      responses: {
        201: { description: 'Созданная сессия', schema: chatSessionResponse },
        500: errorResponse,
      },
    })
    documented(router.delete('/all', [ChatsController, 'destroyAll']), {
      summary: 'Удалить все сессии чата',
      tags: ['chat'],
      responses: { 204: { description: 'Все сессии удалены' } },
    })
    documented(router.get('/:id', [ChatsController, 'show']), {
      summary: 'Получить сессию чата',
      tags: ['chat'],
      responses: {
        200: chatSessionResponse,
        404: { description: 'Сессия не найдена', schema: errorResponse },
      },
    })
    documented(router.put('/:id', [ChatsController, 'update']), {
      summary: 'Обновить сессию чата',
      tags: ['chat'],
      request: updateSessionSchema,
      responses: { 200: chatSessionResponse, 500: errorResponse },
    })
    documented(router.delete('/:id', [ChatsController, 'destroy']), {
      summary: 'Удалить сессию чата',
      tags: ['chat'],
      responses: { 204: { description: 'Сессия удалена' } },
    })
    documented(router.post('/:id/messages', [ChatsController, 'addMessage']), {
      summary: 'Добавить сообщение в сессию чата',
      tags: ['chat'],
      request: addMessageSchema,
      responses: {
        201: { description: 'Созданное сообщение', schema: chatMessageResponse },
        500: errorResponse,
      },
    })
  })
  .prefix('/api/chat/sessions')

documented(router.get('/api/chat/suggestions', [ChatsController, 'suggestions']), {
  summary: 'Получить предложения для чата',
  tags: ['chat'],
})

router
  .group(() => {
    documented(router.post('/upload', [RagController, 'upload']), {
      summary: 'Загрузить файл для RAG',
      tags: ['rag'],
    })
    documented(router.get('/files', [RagController, 'getStoredFiles']), {
      summary: 'Получить список сохранённых RAG файлов',
      tags: ['rag'],
    })
    documented(router.get('/file-warnings', [RagController, 'getFileWarnings']), {
      summary: 'Получить предупреждения RAG файлов',
      tags: ['rag'],
    })
    documented(router.delete('/files', [RagController, 'deleteFile']), {
      summary: 'Удалить RAG файл',
      tags: ['rag'],
      query: deleteFileSchema,
    })
    documented(router.post('/files/embed', [RagController, 'embedFile']), {
      summary: 'Добавить RAG файл в индекс',
      tags: ['rag'],
      request: embedFileSchema,
    })
    documented(router.get('/files/content', [RagController, 'getFileContent']), {
      summary: 'Получить содержимое RAG файла',
      tags: ['rag'],
      query: fileSourceSchema,
    })
    documented(router.get('/files/download', [RagController, 'downloadFile']), {
      summary: 'Скачать RAG файл',
      tags: ['rag'],
      query: fileSourceSchema,
    })
    documented(router.get('/active-jobs', [RagController, 'getActiveJobs']), {
      summary: 'Получить список активных RAG задач',
      tags: ['rag'],
    })
    documented(router.get('/failed-jobs', [RagController, 'getFailedJobs']), {
      summary: 'Получить список неудачных RAG задач',
      tags: ['rag'],
    })
    documented(router.delete('/failed-jobs', [RagController, 'cleanupFailedJobs']), {
      summary: 'Очистить неудачные RAG задачи',
      tags: ['rag'],
    })
    documented(router.delete('/jobs', [RagController, 'cancelAllJobs']), {
      summary: 'Отменить все RAG задачи',
      tags: ['rag'],
    })
    documented(router.get('/job-status', [RagController, 'getJobStatus']), {
      summary: 'Получить статус RAG задачи',
      tags: ['rag'],
      query: getJobStatusSchema,
    })
    documented(router.post('/sync', [RagController, 'scanAndSync']), {
      summary: 'Сканировать и синхронизировать RAG файлы',
      tags: ['rag'],
    })
    documented(router.post('/re-embed-all', [RagController, 'reembedAll']), {
      summary: 'Переиндексировать все RAG файлы',
      tags: ['rag'],
    })
    documented(router.post('/reset-and-rebuild', [RagController, 'resetAndRebuild']), {
      summary: 'Сбросить и перестроить RAG индекс',
      tags: ['rag'],
    })
    documented(router.post('/estimate-batch', [RagController, 'estimateBatch']), {
      summary: 'Оценить размер RAG батча',
      tags: ['rag'],
      request: estimateBatchSchema,
    })
    documented(router.get('/policy-prompt-state', [RagController, 'policyPromptState']), {
      summary: 'Получить состояние RAG политики промптов',
      tags: ['rag'],
    })
    documented(router.get('/health', [RagController, 'health']), {
      summary: 'Проверка работоспособности RAG',
      tags: ['rag'],
    })
    documented(router.get('/collections', [RagController, 'getKnowledgeCollections']), {
      summary: 'Получить список коллекций знаний',
      tags: ['rag'],
    })
    documented(router.post('/update-collection', [RagController, 'updateFileCollection']), {
      summary: 'Обновить коллекцию знаний файла',
      tags: ['rag'],
    })
    documented(router.post('/rename-collection', [RagController, 'renameKnowledgeCollection']), {
      summary: 'Переименовать коллекцию знаний',
      tags: ['rag'],
    })
    documented(router.post('/delete-collection', [RagController, 'deleteKnowledgeCollection']), {
      summary: 'Удалить коллекцию знаний',
      tags: ['rag'],
    })
  })
  .prefix('/api/rag')

router
  .group(() => {
    documented(router.get('/debug-info', [SystemController, 'getDebugInfo']), {
      summary: 'Получить отладочную информацию системы',
      tags: ['system'],
    })
    documented(router.get('/info', [SystemController, 'getSystemInfo']), {
      summary: 'Получить информацию о системе',
      tags: ['system'],
    })
    documented(router.get('/internet-status', [SystemController, 'getInternetStatus']), {
      summary: 'Получить статус подключения к интернету',
      tags: ['system'],
    })
    documented(router.get('/services', [SystemController, 'getServices']), {
      summary: 'Получить список сервисов',
      tags: ['system'],
    })
    documented(router.post('/services/affect', [SystemController, 'affectService']), {
      summary: 'Запустить, остановить или перезапустить сервис',
      tags: ['system'],
      request: affectServiceValidator,
    })
    documented(router.post('/services/install', [SystemController, 'installService']), {
      summary: 'Установить сервис',
      tags: ['system'],
      request: installServiceValidator,
    })
    documented(router.post('/services/force-reinstall', [SystemController, 'forceReinstallService']), {
      summary: 'Принудительно переустановить сервис',
      tags: ['system'],
      request: installServiceValidator,
    })
    documented(router.post('/services/uninstall', [SystemController, 'uninstallService']), {
      summary: 'Удалить сервис',
      tags: ['system'],
      request: uninstallServiceValidator,
    })
    documented(router.post('/services/check-updates', [SystemController, 'checkServiceUpdates']), {
      summary: 'Проверить обновления сервиса',
      tags: ['system'],
    })
    documented(router.get('/services/preflight', [SystemController, 'preflightCheck']), {
      summary: 'Проверить возможность установки сервиса',
      tags: ['system'],
      query: preflightValidator,
    })
    documented(router.get('/services/suggest-port', [SystemController, 'suggestCustomPort']), {
      summary: 'Предложить доступный пользовательский порт',
      tags: ['system'],
    })
    documented(router.post('/services/preflight-custom', [SystemController, 'preflightCustomApp']), {
      summary: 'Проверить возможность установки пользовательского приложения',
      tags: ['system'],
      request: preflightCustomValidator,
    })
    documented(router.post('/services/custom', [SystemController, 'createCustomApp']), {
      summary: 'Создать пользовательское приложение',
      tags: ['system'],
      request: customAppValidator,
    })
    documented(router.put('/services/custom', [SystemController, 'updateCustomApp']), {
      summary: 'Обновить пользовательское приложение',
      tags: ['system'],
      request: updateCustomAppValidator,
    })
    documented(router.post('/services/custom/update', [SystemController, 'updateCustomApp_pullLatest']), {
      summary: 'Загрузить последнюю версию пользовательского приложения',
      tags: ['system'],
      request: installServiceValidator,
    })
    documented(router.delete('/services/custom', [SystemController, 'deleteCustomApp']), {
      summary: 'Удалить пользовательское приложение',
      tags: ['system'],
      request: deleteCustomAppValidator,
    })
    documented(router.get('/services/custom/:name', [SystemController, 'getCustomApp']), {
      summary: 'Получить пользовательское приложение',
      tags: ['system'],
    })
    documented(router.put('/services/custom-url', [SystemController, 'setServiceCustomUrl']), {
      summary: 'Установить пользовательский URL сервиса',
      tags: ['system'],
      request: setServiceCustomUrlValidator,
    })
    documented(router.get('/services/:name/logs', [SystemController, 'getServiceLogs']), {
      summary: 'Получить логи сервиса',
      tags: ['system'],
      query: serviceLogsValidator,
    })
    documented(router.get('/services/:name/stats', [SystemController, 'getServiceStats']), {
      summary: 'Получить статистику сервиса',
      tags: ['system'],
    })
    documented(router.get('/services/:name/available-versions', [SystemController, 'getAvailableVersions']), {
      summary: 'Получить список доступных версий сервиса',
      tags: ['system'],
    })
    documented(router.post('/services/update', [SystemController, 'updateService']), {
      summary: 'Обновить сервис',
      tags: ['system'],
      request: updateServiceValidator,
    })
    documented(router.post('/services/auto-update', [SystemController, 'setServiceAutoUpdate']), {
      summary: 'Установить автообновление сервиса',
      tags: ['system'],
      request: setServiceAutoUpdateValidator,
    })
    documented(router.get('/apps/auto-update/status', [SystemController, 'getAppAutoUpdateStatus']), {
      summary: 'Получить статус автообновления приложений',
      tags: ['system'],
    })
    documented(router.get('/content/auto-update/status', [SystemController, 'getContentAutoUpdateStatus']), {
      summary: 'Получить статус автообновления контента',
      tags: ['system'],
    })
    documented(router.post('/subscribe-release-notes', [SystemController, 'subscribeToReleaseNotes']), {
      summary: 'Подписаться на заметки о выпуске',
      tags: ['system'],
      request: subscribeToReleaseNotesValidator,
    })
    documented(router.get('/latest-version', [SystemController, 'checkLatestVersion']), {
      summary: 'Проверить последнюю доступную версию',
      tags: ['system'],
      query: checkLatestVersionValidator,
    })
    documented(router.post('/update', [SystemController, 'requestSystemUpdate']), {
      summary: 'Запросить обновление системы',
      tags: ['system'],
    })
    documented(router.get('/update/status', [SystemController, 'getSystemUpdateStatus']), {
      summary: 'Получить статус обновления системы',
      tags: ['system'],
    })
    documented(router.get('/update/logs', [SystemController, 'getSystemUpdateLogs']), {
      summary: 'Получить логи обновления системы',
      tags: ['system'],
    })
    documented(router.get('/auto-update/status', [SystemController, 'getAutoUpdateStatus']), {
      summary: 'Получить статус автообновления системы',
      tags: ['system'],
    })
    documented(router.get('/settings', [SettingsController, 'getSetting']), {
      summary: 'Получить системную настройку',
      tags: ['system'],
      query: getSettingSchema,
    })
    documented(router.patch('/settings', [SettingsController, 'updateSetting']), {
      summary: 'Обновить системную настройку',
      tags: ['system'],
      request: updateSettingSchema,
    })
  })
  .prefix('/api/system')

router
  .group(() => {
    documented(router.get('/list', [ZimController, 'list']), {
      summary: 'Получить список установленных ZIM файлов',
      tags: ['zim'],
    })
    documented(router.get('/list-remote', [ZimController, 'listRemote']), {
      summary: 'Получить список удалённых ZIM файлов',
      tags: ['zim'],
      query: listRemoteZimValidator,
    })
    documented(router.get('/curated-categories', [ZimController, 'listCuratedCategories']), {
      summary: 'Получить список курируемых ZIM категорий',
      tags: ['zim'],
    })
    documented(router.post('/download-remote', [ZimController, 'downloadRemote']), {
      summary: 'Добавить загрузку удалённого ZIM файла в очередь',
      tags: ['zim'],
      request: remoteDownloadWithMetadataValidator,
    })
    documented(router.post('/download-category-tier', [ZimController, 'downloadCategoryTier']), {
      summary: 'Скачать уровень категории ZIM',
      tags: ['zim'],
      request: downloadCategoryTierValidator,
    })

    documented(router.post('/upload', [ZimController, 'upload']), {
      summary: 'Загрузить ZIM файл',
      tags: ['zim'],
    })
    documented(router.get('/wikipedia', [ZimController, 'getWikipediaState']), {
      summary: 'Получить состояние Wikipedia ZIM',
      tags: ['zim'],
    })
    documented(router.post('/wikipedia/select', [ZimController, 'selectWikipedia']), {
      summary: 'Выбрать выпуск Wikipedia ZIM',
      tags: ['zim'],
      request: selectWikipediaValidator,
    })

    documented(router.get('/custom-libraries', [ZimController, 'listCustomLibraries']), {
      summary: 'Получить список пользовательских ZIM библиотек',
      tags: ['zim'],
    })
    documented(router.post('/custom-libraries', [ZimController, 'addCustomLibrary']), {
      summary: 'Добавить пользовательскую ZIM библиотеку',
      tags: ['zim'],
      request: addCustomLibraryValidator,
    })
    documented(router.delete('/custom-libraries/:id', [ZimController, 'removeCustomLibrary']), {
      summary: 'Удалить пользовательскую ZIM библиотеку',
      tags: ['zim'],
      params: idParamValidator,
    })
    documented(router.get('/browse-library', [ZimController, 'browseLibrary']), {
      summary: 'Просмотреть ZIM библиотеку',
      tags: ['zim'],
      query: browseLibraryValidator,
    })

    documented(router.post('/rescan-library', [ZimController, 'rescanLibrary']), {
      summary: 'Пересканировать ZIM библиотеку',
      tags: ['zim'],
    })

    documented(router.delete('/:filename', [ZimController, 'delete']), {
      summary: 'Удалить ZIM файл',
      tags: ['zim'],
      params: filenameParamValidator,
    })
  })
  .prefix('/api/zim')

router
  .group(() => {
    documented(router.get('/', [CreatorPacksController, 'index']), {
      summary: 'Получить список наборов автора',
      tags: ['creator-packs'],
    })
    documented(router.post('/:id/install', [CreatorPacksController, 'install']), {
      summary: 'Установить набор автора',
      tags: ['creator-packs'],
    })
    documented(router.delete('/:id', [CreatorPacksController, 'uninstall']), {
      summary: 'Удалить набор автора',
      tags: ['creator-packs'],
    })
  })
  .prefix('/api/creator-packs')

router
  .group(() => {
    documented(router.post('/run', [BenchmarkController, 'run']), {
      summary: 'Запустить бенчмарк',
      tags: ['benchmark'],
      request: runBenchmarkValidator,
    })
    documented(router.post('/run/system', [BenchmarkController, 'runSystem']), {
      summary: 'Запустить системный бенчмарк',
      tags: ['benchmark'],
    })
    documented(router.post('/run/ai', [BenchmarkController, 'runAI']), {
      summary: 'Запустить AI бенчмарк',
      tags: ['benchmark'],
    })
    documented(router.get('/results', [BenchmarkController, 'results']), {
      summary: 'Получить список результатов бенчмарка',
      tags: ['benchmark'],
    })
    documented(router.get('/results/latest', [BenchmarkController, 'latest']), {
      summary: 'Получить последний результат бенчмарка',
      tags: ['benchmark'],
    })
    documented(router.get('/results/:id', [BenchmarkController, 'show']), {
      summary: 'Получить результат бенчмарка',
      tags: ['benchmark'],
    })
    documented(router.post('/submit', [BenchmarkController, 'submit']), {
      summary: 'Отправить результат бенчмарка',
      tags: ['benchmark'],
      request: submitBenchmarkValidator,
    })
    documented(router.post('/builder-tag', [BenchmarkController, 'updateBuilderTag']), {
      summary: 'Обновить тег сборки',
      tags: ['benchmark'],
    })
    documented(router.get('/comparison', [BenchmarkController, 'comparison']), {
      summary: 'Получить данные сравнения бенчмарков',
      tags: ['benchmark'],
    })
    documented(router.get('/status', [BenchmarkController, 'status']), {
      summary: 'Получить статус бенчмарка',
      tags: ['benchmark'],
    })
    documented(router.get('/rerun-banner', [BenchmarkController, 'rerunBanner']), {
      summary: 'Получить состояние баннера повтора бенчмарка',
      tags: ['benchmark'],
    })
    documented(router.get('/settings', [BenchmarkController, 'settings']), {
      summary: 'Получить настройки бенчмарка',
      tags: ['benchmark'],
    })
    documented(router.post('/settings', [BenchmarkController, 'updateSettings']), {
      summary: 'Обновить настройки бенчмарка',
      tags: ['benchmark'],
    })
  })
  .prefix('/api/benchmark')

// Drug Reference v1 — offline FDA drug-label search.
// Page GETs ungated (read-only views). The /api/drug-reference group mirrors
// the /api/maps posture — no localNetworkOnly gate because the only disk write
// is the background ingest job (server-side, triggered but not executed inline).
// /drug-reference/interactions must precede /drug-reference/:id so the literal
// path wins over the param route.
router.get('/drug-reference', [DrugReferenceController, 'index'])
router.get('/drug-reference/interactions', [DrugReferenceController, 'interactions'])
router.get('/drug-reference/:id', [DrugReferenceController, 'show'])
router
  .group(() => {
    documented(router.get('/search', [DrugReferenceController, 'search']), {
      summary: 'Поиск по аннотациям лекарств',
      tags: ['drug-reference'],
      query: searchDrugValidator,
    })
    documented(router.get('/status', [DrugReferenceController, 'status']), {
      summary: 'Получить статус загрузки справочника лекарств',
      tags: ['drug-reference'],
    })
    documented(router.get('/interactions', [DrugReferenceController, 'interactionsApi']), {
      summary: 'Проверить взаимодействия лекарств',
      tags: ['drug-reference'],
      query: interactionsValidator,
    })
    documented(router.post('/download', [DrugReferenceController, 'download']), {
      summary: 'Скачать набор аннотаций лекарств',
      tags: ['drug-reference'],
    })
    documented(router.post('/ingest', [DrugReferenceController, 'ingest']), {
      summary: 'Загрузить аннотации лекарств',
      tags: ['drug-reference'],
    })
    documented(router.post('/reset-ingest', [DrugReferenceController, 'resetIngest']), {
      summary: 'Сбросить загрузку аннотаций лекарств',
      tags: ['drug-reference'],
    })
    documented(router.post('/uninstall', [DrugReferenceController, 'uninstall']), {
      summary: 'Удалить набор данных справочника лекарств',
      tags: ['drug-reference'],
    })
    documented(router.get('/ingest-log', [DrugReferenceController, 'ingestLog']), {
      summary: 'Получить журнал загрузки справочника лекарств',
      tags: ['drug-reference'],
    })
  })
  .prefix('/api/drug-reference')

// "When to use what" — condition-first medical reference (Phase 1).
// Browse a curated grid of first-aid situations (or free-text search a
// situation) and see the matching OTC drugs, each linking to its Drug Reference
// detail. Read-only page GETs, ungated like the /drug-reference page GETs; the
// /api/conditions group only reads drug_labels (no disk write), so it mirrors
// the ungated /api/drug-reference posture.
router.get('/conditions', [ConditionsController, 'index'])
router.get('/conditions/:slug', [ConditionsController, 'show'])
router
  .group(() => {
    documented(router.get('/drugs', [ConditionsController, 'drugsApi']), {
      summary: 'Получить список безрецептурных лекарств для состояния',
      tags: ['conditions'],
      query: conditionDrugsValidator,
    })
  })
  .prefix('/api/conditions')
