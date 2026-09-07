import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import FileUploader from '~/components/file-uploader'
import StyledButton from '~/components/StyledButton'
import type { DynamicIconName } from '~/lib/icons'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import StyledTable from '~/components/StyledTable'
import { useNotifications } from '~/context/NotificationContext'
import api from '~/lib/api'
import {
  groupAndSortKbFiles,
  type KbFileGroup,
  type KbFileSort,
  type KbFileSortKey,
} from '~/lib/kb_file_grouping'
import type { KbIngestStateValue } from '../../../types/kb_ingest_state'
import { formatBytes } from '~/lib/util'
import {
  IconArrowsSort,
  IconDownload,
  IconEye,
  IconSortAscending,
  IconSortDescending,
  IconX,
} from '@tabler/icons-react'
import { useModals } from '~/context/ModalContext'
import StyledModal from '../StyledModal'
import ActiveEmbedJobs from '~/components/ActiveEmbedJobs'
import { SERVICE_NAMES } from '../../../constants/service_names'
import CollectionsManager from './CollectionsManager'
import { KB_COLLECTIONS } from '../../../constants/kb_collections'
import CollectionCombobox from './CollectionCombobox'

interface KnowledgeBaseModalProps {
  aiAssistantName?: string
  onClose: () => void
}

// File extensions the in-browser viewer can render. Must stay in sync with
// `RagService.VIEWABLE_TEXT_EXTENSIONS` -- anything outside this set falls back
// to Download.
const VIEWABLE_EXTENSIONS = new Set(['md', 'txt', 'csv', 'json', 'yaml', 'yml', 'toml', 'xml', 'html'])

function isViewableExtension(filename: string): boolean {
  const ext = filename.split('.').at(-1)?.toLowerCase() ?? ''
  return VIEWABLE_EXTENSIONS.has(ext)
}

function renderSortHeader(
  label: string,
  key: KbFileSortKey,
  sort: KbFileSort,
  setSort: (s: KbFileSort) => void
): React.ReactNode {
  const active = sort.key === key
  const Icon = !active ? IconArrowsSort : sort.direction === 'asc' ? IconSortAscending : IconSortDescending
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-left hover:text-text-primary transition-colors"
      onClick={() => {
        if (!active) {
          setSort({ key, direction: 'asc' })
        } else {
          setSort({ key, direction: sort.direction === 'asc' ? 'desc' : 'asc' })
        }
      }}
    >
      <span>{label}</span>
      <Icon size={14} className={active ? 'text-text-primary' : 'text-text-muted'} aria-hidden="true" />
    </button>
  )
}

/**
 * Compact label for the per-row ingestion state. Files that exist in Qdrant
 * with no `kb_ingest_state` row (`state === null`) are legacy/pre-RFC-883
 * installs whose chunks are real, so we display them as "Indexed" rather than
 * surfacing the absent-row detail. Admin-docs group has no pill (the "Managed
 * by NOMAD" message in the action column carries the same signal).
 */
function renderStatePill(record: KbFileGroup): React.ReactNode {
  if (record.bucket === 'admin_docs') return null
  const effective: KbIngestStateValue = record.state ?? 'indexed'

  const base = 'inline-flex items-center text-xs font-medium rounded px-2 py-0.5 border'
  switch (effective) {
    case 'indexed':
      return (
        <span className={`${base} text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950/40 dark:border-green-800`}>
          Проиндексировано
        </span>
      )
    case 'pending_decision':
    case 'browse_only':
      return (
        <span className={`${base} text-text-secondary bg-surface-secondary border-border-subtle`}>
          Не проиндексировано
        </span>
      )
    case 'failed':
      return (
        <span className={`${base} text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800`}>
          Ошибка
        </span>
      )
    case 'stalled':
      return (
        <span className={`${base} text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800`}>
          Зависло
        </span>
      )
  }
}

type RowAction =
  | { kind: 'index'; label: string; force: boolean; variant: 'primary'; icon: DynamicIconName }
  | { kind: 'reembed'; label: string; force: true; variant: 'secondary'; icon: DynamicIconName }

/**
 * Pick the single adaptive per-row action button. Returns null when no action
 * makes sense for the current state (e.g. healthy indexed file with no
 * warnings -- bulk Re-embed All covers that case). `hasWarnings` lets us
 * surface a Re-embed affordance specifically when a file *looks* indexed but
 * has zero chunks or a stalled-mid-ingestion warning attached.
 */
function pickRowAction(record: KbFileGroup, hasWarnings: boolean): RowAction | null {
  if (record.bucket === 'admin_docs') return null
  const effective: KbIngestStateValue = record.state ?? 'indexed'
  switch (effective) {
    case 'indexed':
      return hasWarnings
        ? { kind: 'reembed', label: 'Переиндексировать', force: true, variant: 'secondary', icon: 'IconRefreshAlert' }
        : null
    case 'pending_decision':
      return { kind: 'index', label: 'Индексировать', force: false, variant: 'primary', icon: 'IconDownload' }
    case 'browse_only':
      return { kind: 'index', label: 'Индексировать', force: true, variant: 'primary', icon: 'IconDownload' }
    case 'failed':
    case 'stalled':
      return { kind: 'index', label: 'Повторить', force: true, variant: 'primary', icon: 'IconRefresh' }
  }
}

export default function KnowledgeBaseModal({ aiAssistantName = "AI Assistant", onClose }: KnowledgeBaseModalProps) {
  const { addNotification } = useNotifications()
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadCollection, setUploadCollection] = useState<string>('')
  const [collectionFilter, setCollectionFilter] = useState<string>('All')
  const [manageCollectionsOpen, setManageCollectionsOpen] = useState(false)
  const [confirmDeleteSource, setConfirmDeleteSource] = useState<string | null>(null)
  const [confirmReembed, setConfirmReembed] = useState<{ source: string; displayName: string } | null>(null)
  const [bulkMode, setBulkMode] = useState<null | 'reembed' | 'reset'>(null)
  const [resetTyped, setResetTyped] = useState('')
  const [sort, setSort] = useState<KbFileSort>({ key: 'name', direction: 'asc' })
  const [viewerSource, setViewerSource] = useState<string | null>(null)
  const fileUploaderRef = useRef<React.ComponentRef<typeof FileUploader>>(null)
  const { openModal, closeModal } = useModals()
  const queryClient = useQueryClient()

  const [isStartingQdrant, setIsStartingQdrant] = useState(false)

  const { data: healthStatus } = useQuery({
    queryKey: ['qdrantHealth'],
    queryFn: () => api.checkRAGHealth(),
    refetchInterval: isStartingQdrant ? 3_000 : 30_000,
  })
  const qdrantOffline = healthStatus?.online === false

  useEffect(() => {
    if (!qdrantOffline) setIsStartingQdrant(false)
  }, [qdrantOffline])

  const { data: storedFiles = [], isLoading: isLoadingFiles } = useQuery({
    queryKey: ['storedFiles'],
    queryFn: () => api.getStoredRAGFiles(),
    select: (data) => data || [],
  })

  const { data: knownCollections = [] } = useQuery({
    queryKey: ['kbCollections'],
    queryFn: () => api.getKnowledgeCollections(),
    select: (data) => data?.collections ?? [],
  })

  const comboboxOptions = useMemo(() => {
    return Array.from(new Set([...KB_COLLECTIONS, ...knownCollections])).sort()
  }, [knownCollections])

  // Per-file conditional warnings (RFC #883 section 6). `ok: false` means the
  // computation itself failed (Qdrant/DB/FS) -- distinct from `ok: true` with
  // an empty map, which means everything is healthy. We surface the failure
  // explicitly so a silent backend failure doesn't masquerade as health.
  const { data: warningsResult } = useQuery({
    queryKey: ['kbFileWarnings'],
    queryFn: () => api.getKbFileWarnings(),
    refetchInterval: 30_000,
  })
  const fileWarnings = warningsResult?.warnings ?? {}
  const warningsUnavailable = warningsResult !== undefined && warningsResult.ok === false

  // Global auto-index policy. KVStore returns `null` for an unset key, which
  // we treat as 'Always' for backward compatibility with installs that predate
  // this UI. The user can opt into Manual mode from the toggle below.
  const { data: ingestPolicySetting } = useQuery({
    queryKey: ['ingestPolicy'],
    queryFn: () => api.getSetting('rag.defaultIngestPolicy'),
  })
  const ingestPolicy: 'Always' | 'Manual' =
    ingestPolicySetting?.value === 'Manual' ? 'Manual' : 'Always'

  const updateIngestPolicyMutation = useMutation({
    mutationFn: (policy: 'Always' | 'Manual') =>
      api.updateSetting('rag.defaultIngestPolicy', policy),
    onSuccess: (_data, policy) => {
      queryClient.invalidateQueries({ queryKey: ['ingestPolicy'] })
      addNotification({
        type: 'success',
        message:
          policy === 'Always'
            ? 'Новый контент будет автоматически индексироваться для ИИ.'
            : 'Новый контент будет ждать вашего согласия на индексирование.',
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: error?.message || 'Не удалось обновить политику индексирования.',
      })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadDocument(file, uploadCollection || undefined),
  })

  const updateCollectionMutation = useMutation({
    mutationFn: ({ source, collection }: { source: string; collection: string }) =>
      api.updateFileCollection(source, collection || null),
    onSuccess: (data) => {
      addNotification({ type: 'success', message: data?.message || 'Коллекция обновлена.' })
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['kbCollections'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || 'Не удалось обновить коллекцию.' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (source: string) => api.deleteRAGFile(source),
    onSuccess: () => {
      addNotification({ type: 'success', message: 'Файл удалён из базы знаний.' })
      setConfirmDeleteSource(null)
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || 'Не удалось удалить файл.' })
      setConfirmDeleteSource(null)
    },
  })

  const embedMutation = useMutation({
    mutationFn: ({ source, force }: { source: string; force: boolean }) =>
      api.embedSingleRAGFile(source, force),
    onSuccess: (data) => {
      addNotification({
        type: 'success',
        message: data?.message || 'Файл поставлен в очередь на индексацию.',
      })
      setConfirmReembed(null)
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['kbFileWarnings'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || 'Не удалось поставить файл в очередь.' })
      setConfirmReembed(null)
    },
  })

  const cleanupFailedMutation = useMutation({
    mutationFn: () => api.cleanupFailedEmbedJobs(),
    onSuccess: (data) => {
      addNotification({ type: 'success', message: data?.message || 'Неудачные задания очищены.' })
      queryClient.invalidateQueries({ queryKey: ['failedEmbedJobs'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || 'Не удалось очистить задания.' })
    },
  })

  const cancelAllMutation = useMutation({
    mutationFn: () => api.cancelAllEmbedJobs(),
    onSuccess: (data) => {
      addNotification({ type: 'success', message: data?.message || 'Все задания индексации отменены.' })
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['failedEmbedJobs'] })
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['kbFileWarnings'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || 'Не удалось отменить задания.' })
    },
  })

  const startQdrantMutation = useMutation({
    mutationFn: () => api.affectService(SERVICE_NAMES.QDRANT, 'start'),
    onSuccess: () => {
      setIsStartingQdrant(true)
      queryClient.invalidateQueries({ queryKey: ['qdrantHealth'] })
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || 'Не удалось запустить Qdrant.' })
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => api.syncRAGStorage(),
    onSuccess: (data) => {
      addNotification({
        type: 'success',
        message: data?.message || 'Хранилище синхронизировано. Если найдены новые файлы, они поставлены в очередь на обработку.',
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: error?.message || 'Не удалось синхронизировать хранилище',
      })
    },
  })

  const reembedMutation = useMutation({
    mutationFn: () => api.reembedAllRAG(),
    onSuccess: (data) => {
      addNotification({
        type: data?.success ? 'success' : 'error',
        message: data?.message || 'Переиндексация завершена.',
      })
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
      setBulkMode(null)
      setResetTyped('')
    },
    onError: () => {
      addNotification({ type: 'error', message: 'Не удалось переиндексировать базу знаний.' })
      setBulkMode(null)
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => api.resetAndRebuildRAG(),
    onSuccess: (data) => {
      addNotification({
        type: data?.success ? 'success' : 'error',
        message: data?.message || 'Сброс завершён.',
      })
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
      setBulkMode(null)
      setResetTyped('')
    },
    onError: () => {
      addNotification({ type: 'error', message: 'Не удалось сбросить базу знаний.' })
      setBulkMode(null)
    },
  })

  const bulkBusy = reembedMutation.isPending || resetMutation.isPending

  const handleUpload = async () => {
    if (files.length === 0) return
    setIsUploading(true)
    let successCount = 0
    const failedNames: string[] = []

    for (const file of files) {
      try {
        await uploadMutation.mutateAsync(file)
        successCount++
      } catch (error: any) {
        failedNames.push(file.name)
      }
    }

    setIsUploading(false)
    setFiles([])
    fileUploaderRef.current?.clear()
    queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })

    if (successCount > 0) {
      addNotification({
        type: 'success',
        message: `${successCount} файл(ов) поставлено в очередь на обработку.`,
      })
    }
    for (const name of failedNames) {
      addNotification({ type: 'error', message: `Не удалось загрузить: ${name}` })
    }
  }

  const handleConfirmCancelAll = () => {
    openModal(
      <StyledModal
        title='Отменить все задания индексации?'
        onConfirm={() => {
          cancelAllMutation.mutate()
          closeModal('confirm-cancel-all-modal')
        }}
        onCancel={() => closeModal('confirm-cancel-all-modal')}
        open={true}
        confirmText='Отменить все задания'
        cancelText='Оставить задания'
        confirmVariant='danger'
      >
        <p className='text-text-primary'>
          Это остановит <strong>все</strong> задания индексации — включая выполняющиеся и
          зависшие — и очистит очередь обработки. Исходные файлы для этих заданий будут удалены,
          поэтому вам нужно будет повторно загрузить всё, что ещё хотите проиндексировать.
          Сохранённые файлы, индексация которых уже завершена, не пострадают. Вы уверены, что
          хотите продолжить?
        </p>
      </StyledModal>,
      'confirm-cancel-all-modal'
    )
  }

  const handleConfirmSync = () => {
    openModal(
      <StyledModal
        title='Подтвердить синхронизацию?'
        onConfirm={() => {
          syncMutation.mutate()
          closeModal(
            "confirm-sync-modal"
          )
        }}
        onCancel={() => closeModal("confirm-sync-modal")}
        open={true}
        confirmText='Подтвердить синхронизацию'
        cancelText='Отмена'
        confirmVariant='primary'
      >
        <p className='text-text-primary'>
          Будет выполнено сканирование каталогов хранения NOMAD на наличие новых файлов, и они
          будут поставлены в очередь на обработку. Это полезно, если вы вручную добавили файлы в
          хранилище или хотите убедиться, что всё актуально. При наличии новых файлов может
          временно возрасти потребление ресурсов. Вы уверены, что хотите продолжить?
        </p>
      </StyledModal>,
      "confirm-sync-modal"
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm transition-opacity">
      <div className="bg-surface-primary rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border-subtle shrink-0">
          <h2 className="text-2xl font-semibold text-text-primary">База знаний</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-secondary rounded-lg transition-colors"
          >
            <IconX className="h-6 w-6 text-text-muted" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">
          {qdrantOffline && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300 flex items-center justify-between gap-4">
              <span>
                <strong>База знаний недоступна:</strong> Векторная база данных Qdrant не в сети.
              </span>
              <StyledButton
                variant="danger"
                size="sm"
                onClick={() => startQdrantMutation.mutate()}
                loading={startQdrantMutation.isPending || isStartingQdrant}
                disabled={startQdrantMutation.isPending || isStartingQdrant}
              >
                {isStartingQdrant ? 'Запуск…' : 'Запустить Qdrant'}
              </StyledButton>
            </div>
          )}
          <div className="bg-surface-primary rounded-lg border shadow-md overflow-hidden">
            <div className="p-6">
              <FileUploader
                ref={fileUploaderRef}
                minFiles={1}
                maxFiles={5}
                onUpload={(uploadedFiles) => {
                  setFiles(Array.from(uploadedFiles))
                }}
              />
              <div className="flex justify-center items-center gap-4 my-6">
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  Коллекция:
                  <CollectionCombobox
                    value={uploadCollection}
                    onChange={setUploadCollection}
                    options={comboboxOptions}
                    className="w-48"
                  />
                </label>
                <StyledButton
                  variant="primary"
                  size="lg"
                  icon="IconUpload"
                  onClick={handleUpload}
                  disabled={files.length === 0 || isUploading || qdrantOffline}
                  loading={isUploading}
                >
                  Загрузить
                </StyledButton>
              </div>
            </div>
            <div className="border-t bg-surface-primary p-6">
              <h3 className="text-lg font-semibold text-desert-green mb-4">
                Зачем загружать документы в базу знаний?
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">
                      Интеграция базы знаний с {aiAssistantName}
                    </p>
                    <p className="text-sm text-desert-stone">
                      Когда вы загружаете документы в базу знаний, NOMAD обрабатывает и индексирует
                      их содержимое, делая его напрямую доступным для {aiAssistantName}. Это
                      позволяет {aiAssistantName} ссылаться на ваши конкретные документы во время
                      бесед, обеспечивая более точные и персонализированные ответы на основе
                      загруженных данных.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">
                      Улучшенная обработка документов с OCR
                    </p>
                    <p className="text-sm text-desert-stone">
                      NOMAD включает встроенные возможности оптического распознавания символов
                      (OCR), позволяющие извлекать текст из документов в виде изображений, таких как
                      отсканированные PDF-файлы или фотографии. Это означает, что даже если ваши
                      документы не в стандартном текстовом формате, NOMAD всё равно сможет
                      обработать и проиндексировать их содержимое для доступа ИИ.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div>
                    <p className="font-medium text-desert-stone-dark">
                      Интеграция с информационной библиотекой
                    </p>
                    <p className="text-sm text-desert-stone">
                      NOMAD автоматически обнаружит и извлечёт любой контент, который вы
                      сохраняете в своей информационной библиотеке (если она установлена), делая
                      его мгновенно доступным для {aiAssistantName} без каких-либо дополнительных
                      действий.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="my-8 p-4 rounded-lg border border-border-subtle bg-surface-secondary">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[14rem]">
                <p className="text-sm font-medium text-text-primary">
                  Автоиндексация нового контента для ИИ?
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Проиндексированный контент обычно занимает в 5–10 раз больше места на диске.
                  Изменения применяются к новому контенту, добавленному после изменения этой настройки.
                </p>
              </div>
              <div
                role="radiogroup"
                aria-label="Ingest policy"
                className="inline-flex rounded-md overflow-hidden border border-border-subtle"
              >
                {(['Always', 'Manual'] as const).map((option) => {
                  const isActive = ingestPolicy === option
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() =>
                        !isActive && updateIngestPolicyMutation.mutate(option)
                      }
                      disabled={updateIngestPolicyMutation.isPending}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-desert-green text-white'
                          : 'bg-surface-primary text-text-secondary hover:bg-surface-tertiary'
                      } ${updateIngestPolicyMutation.isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="my-8">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <StyledSectionHeader title="Очередь обработки" className="!mb-0" />
              <div className="flex items-center gap-2 flex-wrap">
                <StyledButton
                  variant="danger"
                  size="md"
                  icon="IconTrash"
                  onClick={() => cleanupFailedMutation.mutate()}
                  loading={cleanupFailedMutation.isPending}
                  disabled={cleanupFailedMutation.isPending || qdrantOffline}
                >
                  Очистить неудавшиеся
                </StyledButton>
                <StyledButton
                  variant="danger"
                  size="md"
                  icon="IconPlayerStop"
                  onClick={handleConfirmCancelAll}
                  loading={cancelAllMutation.isPending}
                  disabled={cancelAllMutation.isPending}
                  title="Остановить и очистить все задания индексации независимо от состояния, включая зависшие или выполняющиеся. Удаляет загруженные исходные файлы для этих заданий."
                >
                  Отменить все задания
                </StyledButton>
              </div>
            </div>
            <ActiveEmbedJobs withHeader={false} />
          </div>

          <div className="my-12">
            <div className='flex items-center justify-between mb-6 gap-2 flex-wrap'>
              <StyledSectionHeader title="Сохранённые файлы базы знаний" className='!mb-0' />
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  Искать в:
                  <select
                    value={collectionFilter}
                    onChange={(e) => setCollectionFilter(e.target.value)}
                    className="rounded border border-border-subtle bg-surface-primary px-3 py-2 text-text-primary"
                  >
                    <option value="All">Все</option>
                    {knownCollections.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <StyledButton
                  variant="secondary"
                  size="md"
                  icon="IconSettings"
                  onClick={() => setManageCollectionsOpen(true)}
                >
                  Управление коллекциями
                </StyledButton>
                <StyledButton
                  variant="danger"
                  size="md"
                  icon='IconAlertTriangle'
                  onClick={() => { setResetTyped(''); setBulkMode('reset') }}
                  disabled={isUploading || qdrantOffline || bulkBusy}
                  loading={resetMutation.isPending}
                  title="Удалить всю коллекцию эмбеддингов и пересоздать с нуля. Безвозвратно удаляет векторы для файлов, которых больше нет на диске. Деструктивно: требуется ввести RESET для подтверждения."
                >
                  Сброс и перестройка
                </StyledButton>
                <StyledButton
                  variant="secondary"
                  size="md"
                  icon='IconRefreshAlert'
                  onClick={() => setBulkMode('reembed')}
                  disabled={isUploading || qdrantOffline || bulkBusy || storedFiles.length === 0}
                  loading={reembedMutation.isPending}
                  title="Переиндексировать каждый файл на диске, заменяя существующие векторы. Векторы для файлов, которых больше нет на диске, сохраняются. Используйте, если изменился чанкер или модель эмбеддинга."
                >
                  Переиндексировать всё
                </StyledButton>
                <StyledButton
                  variant="secondary"
                  size="md"
                  icon='IconRefresh'
                  onClick={handleConfirmSync}
                  disabled={syncMutation.isPending || isUploading || qdrantOffline || bulkBusy}
                  loading={syncMutation.isPending || isUploading}
                  title="Сканировать хранилище на наличие новых файлов и ставить в очередь те, которые ещё не были проиндексированы. Безопасно запускать в любой момент; не затрагивает уже проиндексированный контент."
                >
                  Синхронизировать хранилище
                </StyledButton>

              </div>
            </div>
            {warningsUnavailable && (
              <div className="mb-4 inline-flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                <span aria-hidden="true">⚠</span>
                <span>
                  Предупреждения о файлах недоступны — не удалось прочитать состояние хранилища. Повтор…
                </span>
              </div>
            )}
            <StyledTable<KbFileGroup>
              className="font-semibold"
              rowLines={true}
              columns={[
                {
                  accessor: 'source',
                  title: renderSortHeader('Имя файла', 'name', sort, setSort),
                  render(record) {
                    const warnings = fileWarnings[record.source] ?? []
                    const pill = renderStatePill(record)
                    return (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-text-primary">
                          {record.displayName}
                        </span>
                        {(pill || warnings.length > 0) && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {pill}
                            {warnings.map((w, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1.5 self-start text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-2 py-0.5"
                              >
                                <span aria-hidden="true">⚠</span>
                                {w.kind === 'zero_chunks' && (
                                  <span>
                                    Проиндексировано 0 фрагментов — этот файл не содержит текста.
                                    ИИ-ассистент не может на него ссылаться.
                                  </span>
                                )}
                                {w.kind === 'partial_stall' && (
                                  <span>
                                    Проиндексировано только {w.chunksEmbedded.toLocaleString()} из{' '}
                                    {w.chunksExpected.toLocaleString()} ожидаемых фрагментов —
                                    возможно, обработка зависла.
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  },
                },
                {
                  accessor: 'size',
                  title: renderSortHeader('Размер', 'size', sort, setSort),
                  className: 'whitespace-nowrap',
                  render(record) {
                    if (record.bucket === 'admin_docs' || record.size === null) {
                      return <span className="text-text-muted">—</span>
                    }
                    return <span className="text-text-secondary">{formatBytes(record.size)}</span>
                  },
                },
                {
                  accessor: 'uploadedAt',
                  title: renderSortHeader('Загружено', 'uploadedAt', sort, setSort),
                  className: 'whitespace-nowrap',
                  render(record) {
                    if (record.bucket === 'admin_docs' || !record.uploadedAt) {
                      return <span className="text-text-muted">—</span>
                    }
                    const d = new Date(record.uploadedAt)
                    return (
                      <span className="text-text-secondary" title={d.toISOString()}>
                        {d.toLocaleDateString()}
                      </span>
                    )
                  },
                },
                {
                  accessor: 'collection',
                  title: 'Коллекция',
                  className: 'whitespace-nowrap',
                  render(record) {
                    if (record.bucket === 'admin_docs') {
                      return <span className="text-text-muted">—</span>
                    }
                    const isSaving =
                      updateCollectionMutation.isPending &&
                      updateCollectionMutation.variables?.source === record.source
                    return (
                      <CollectionCombobox
                        value={record.collection ?? ''}
                        onChange={(val) => updateCollectionMutation.mutate({ source: record.source, collection: val })}
                        options={comboboxOptions}
                        disabled={isSaving}
                        className="w-40"
                      />
                    )
                  },
                },
                {
                  accessor: 'source',
                  title: '',
                  render(record) {
                    if (record.bucket === 'admin_docs') {
                      return (
                        <div className="flex justify-end">
                          <span className="text-sm text-text-muted italic">
                            Управляется NOMAD
                          </span>
                        </div>
                      )
                    }

                    const isConfirming = confirmDeleteSource === record.source
                    const isDeleting = deleteMutation.isPending && confirmDeleteSource === record.source
                    if (isConfirming) {
                      return (
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-sm text-text-secondary">Удалить из базы знаний?</span>
                          <StyledButton
                            variant='danger'
                            size='sm'
                            onClick={() => deleteMutation.mutate(record.source)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? 'Удаление…' : 'Подтвердить'}
                          </StyledButton>
                          <StyledButton
                            variant='ghost'
                            size='sm'
                            onClick={() => setConfirmDeleteSource(null)}
                            disabled={isDeleting}
                          >
                            Отмена
                          </StyledButton>
                        </div>
                      )
                    }

                    const warnings = fileWarnings[record.source] ?? []
                    const action = pickRowAction(record, warnings.length > 0)
                    const actionPendingForThisRow =
                      embedMutation.isPending && embedMutation.variables?.source === record.source

                    const canView = record.isUserUpload && isViewableExtension(record.displayName) && record.size !== null
                    const canDownload = record.isUserUpload && record.size !== null

                    return (
                      <div className="flex justify-end items-center gap-2">
                        {action && (
                          <StyledButton
                            variant={action.variant}
                            size="sm"
                            icon={action.icon}
                            onClick={() => {
                              if (action.kind === 'reembed') {
                                setConfirmReembed({ source: record.source, displayName: record.displayName })
                              } else {
                                embedMutation.mutate({ source: record.source, force: action.force })
                              }
                            }}
                            disabled={qdrantOffline || deleteMutation.isPending || embedMutation.isPending}
                            loading={actionPendingForThisRow}
                          >
                            {action.label}
                          </StyledButton>
                        )}
                        {canView && (
                          <StyledButton
                            variant="ghost"
                            size="sm"
                            icon="IconEye"
                            onClick={() => setViewerSource(record.source)}
                          >Просмотр</StyledButton>
                        )}
                        {canDownload && (
                          <StyledButton
                            variant="ghost"
                            size="sm"
                            icon="IconDownload"
                            onClick={() => {
                              window.location.href = `/api/rag/files/download?source=${encodeURIComponent(record.source)}`
                            }}
                          >Скачать</StyledButton>
                        )}
                        <StyledButton
                          variant="danger"
                          size="sm"
                          icon="IconTrash"
                          onClick={() => setConfirmDeleteSource(record.source)}
                          disabled={deleteMutation.isPending || embedMutation.isPending}
                          loading={deleteMutation.isPending && confirmDeleteSource === record.source}
                        >Удалить</StyledButton>
                      </div>
                    )
                  },
                },
              ]}
              data={groupAndSortKbFiles(
                collectionFilter === 'All'
                  ? storedFiles
                  : storedFiles.filter((f) => f.collection === collectionFilter),
                sort
              )}
              loading={isLoadingFiles}
            />
          </div>
        </div>
      </div>

      {bulkMode === 'reembed' && (
        <StyledModal
          title='Переиндексировать все документы?'
          open={true}
          confirmText={reembedMutation.isPending ? 'Переиндексация…' : 'Переиндексировать всё'}
          cancelText='Отмена'
          confirmVariant='primary'
          confirmLoading={reembedMutation.isPending}
          onConfirm={() => reembedMutation.mutate()}
          onCancel={() => setBulkMode(null)}
        >
          <div className='text-text-primary text-sm space-y-3 text-left'>
            <p>
              Будет повторно обработан каждый документ в вашей базе знаний — около
              <strong> {storedFiles.length} файл(ов)</strong>.
              Для каждого файла NOMAD удалит существующие эмбеддинги из Qdrant и поставит в
              очередь новую задачу индексации с использованием текущей модели.
            </p>
            <div className='rounded border border-border-subtle bg-surface-secondary p-3'>
              <p className='font-semibold mb-1'>Для чего это нужно</p>
              <p className='text-text-secondary'>
                Используйте, когда модель эмбеддинга или логика разбиения изменилась, или когда вы
                подозреваете, что сохранённые векторы устарели. Файлы на диске <em>не</em> удаляются,
                а любые осиротевшие точки, чей исходный файл больше не существует, останутся
                нетронутыми (см. <em>Сброс и перестройка</em>, если нужен полностью чистый старт).
              </p>
            </div>
            <div className='rounded border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 text-amber-900 dark:text-amber-200'>
              <p className='font-semibold mb-1'>Обратите внимание</p>
              <ul className='list-disc pl-5 space-y-1'>
                <li>Индексация {storedFiles.length} файла(ов) может занять много времени, особенно для больших PDF или ZIM-архивов.</li>
                <li>На системах без GPU-ускорения ожидайте высокую нагрузку на CPU на протяжении всего процесса.</li>
                <li>Результаты поиска в базе знаний могут быть неполными, пока все файлы не завершат переиндексацию.</li>
                <li>Если задачи индексации уже выполняются, это действие будет отклонено — дождитесь завершения очереди.</li>
              </ul>
            </div>
          </div>
        </StyledModal>
      )}

      {bulkMode === 'reset' && (
        <StyledModal
          title='Сбросить и перестроить базу знаний?'
          open={true}
          confirmText={resetMutation.isPending ? 'Сброс…' : 'Очистить и перестроить'}
          cancelText='Отмена'
          confirmVariant='danger'
          confirmLoading={resetMutation.isPending}
          onConfirm={() => {
            if (resetTyped === 'RESET') resetMutation.mutate()
          }}
          onCancel={() => { setBulkMode(null); setResetTyped('') }}
        >
          <div className='text-text-primary text-sm space-y-3 text-left'>
            <p>
              <strong>Безвозвратно удалит каждую точку</strong> в коллекции
              <code> nomad_knowledge_base </code>Qdrant и пересоберёт из
              <strong> {storedFiles.length} файл(ов)</strong>, сейчас находящихся на диске.
              Коллекция будет удалена, пересоздана, и каждый файл заново поставлен в очередь на
              индексацию.
            </p>
            <div className='rounded border border-border-subtle bg-surface-secondary p-3'>
              <p className='font-semibold mb-1'>Чем это отличается от «Переиндексировать всё»</p>
              <ul className='list-disc pl-5 space-y-1 text-text-secondary'>
                <li><strong>Переиндексировать всё</strong> заменяет векторы пофайлово. Осиротевшие точки (векторы, чей исходный файл был когда-то удалён) сохраняются.</li>
                <li><strong>Сброс и перестройка</strong> полностью удаляет коллекцию. Осиротевшие точки <strong>исчезают навсегда</strong>. В Qdrant останутся только файлы, которые сейчас есть на диске.</li>
              </ul>
            </div>
            <div className='rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-900 dark:text-red-200'>
              <p className='font-semibold mb-1'>Это действие разрушительно и не может быть отменено</p>
              <ul className='list-disc pl-5 space-y-1'>
                <li>Поиск в базе знаний будет пуст, пока индексация не завершится (потенциально несколько часов на системах без GPU).</li>
                <li>На несколько секунд во время сброса коллекция Qdrant не существует — любые запросы чата с RAG в этом окне могут вернуть ошибку «коллекция не найдена». Избегайте использования чата до начала перестройки.</li>
                <li>Если задачи индексации уже выполняются, это действие будет отклонено — дождитесь завершения очереди.</li>
              </ul>
            </div>
            <div>
              <label className='block text-sm font-semibold mb-1'>
                Введите <code>RESET</code> для подтверждения:
              </label>
              <input
                type='text'
                value={resetTyped}
                onChange={(e) => setResetTyped(e.target.value)}
                placeholder='RESET'
                autoFocus
                className='w-full rounded border border-border-subtle bg-surface-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-red-500'
              />
              {resetTyped.length > 0 && resetTyped !== 'RESET' && (
                <p className='text-xs text-red-600 mt-1'>Введите RESET точно (заглавными, без пробелов), чтобы активировать кнопку подтверждения.</p>
              )}
            </div>
          </div>
        </StyledModal>
      )}

      {confirmReembed && (
        <StyledModal
          title='Переиндексировать этот файл?'
          open={true}
          confirmText={embedMutation.isPending ? 'Постановка в очередь…' : 'Переиндексировать'}
          cancelText='Отмена'
          confirmVariant='primary'
          confirmLoading={embedMutation.isPending}
          onConfirm={() =>
            embedMutation.mutate({ source: confirmReembed.source, force: true })
          }
          onCancel={() => setConfirmReembed(null)}
        >
          <div className='text-text-primary text-sm space-y-3 text-left'>
            <p>
              Существующие эмбеддинги для{' '}
              <strong>{confirmReembed.displayName}</strong> будут удалены и поставлено новое
              задание индексации. Файл на диске не затрагивается.
            </p>
            <div className='rounded border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 text-amber-900 dark:text-amber-200'>
              <p className='font-semibold mb-1'>Обратите внимание</p>
              <ul className='list-disc pl-5 space-y-1'>
                <li>Для больших ZIM-архивов это может занять много времени, особенно на системах без GPU.</li>
                <li>Результаты поиска, ссылающиеся на этот файл, будут неполными, пока новая индексация не завершится.</li>
                <li>Если для этого файла уже выполняется задание, переиндексация будет отклонена — дождитесь её завершения.</li>
              </ul>
            </div>
          </div>
        </StyledModal>
      )}

      {viewerSource && (
        <FileViewerModal
          source={viewerSource}
          onClose={() => setViewerSource(null)}
        />
      )}

      {manageCollectionsOpen && (
        <CollectionsManager onClose={() => setManageCollectionsOpen(false)} />
      )}
    </div>
  )
}

function FileViewerModal({ source, onClose }: { source: string; onClose: () => void }) {
  const { data, isLoading, isFetched } = useQuery({
    queryKey: ['rag', 'file-content', source],
    queryFn: () => api.getFileContent(source),
    staleTime: 60_000,
  })

  // Title falls back to the trailing path segment so the modal still has a
  // useful header while the fetch is in-flight or if it failed.
  const fallbackName = source.split(/[/\\]/).at(-1) ?? source
  const title = data?.fileName ?? fallbackName
  // `catchInternal` swallows errors and resolves to undefined, surfacing a
  // toast -- so the "couldn't load" branch is gated on a finished-but-empty
  // fetch rather than on react-query's `isError`.
  const showError = isFetched && !data

  return (
    <StyledModal
      title={title}
      open={true}
      onClose={onClose}
      onCancel={onClose}
      cancelText="Закрыть"
      large
    >
      <div className="text-left text-sm">
        {isLoading && (
          <div className="text-text-secondary">Загрузка…</div>
        )}
        {showError && (
          <div className="text-amber-700 dark:text-amber-300">
            Не удалось загрузить файл. Возможно, он был перемещён или его тип не поддерживается для просмотра.
          </div>
        )}
        {data && (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border border-border-subtle bg-surface-secondary p-3 font-mono text-xs text-text-primary">
            {data.content}
          </pre>
        )}
      </div>
    </StyledModal>
  )
}
