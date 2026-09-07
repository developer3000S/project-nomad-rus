import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePage } from '@inertiajs/react'
import { IconBrain } from '@tabler/icons-react'
import api from '~/lib/api'
import StyledButton from '~/components/StyledButton'
import { useNotifications } from '~/context/NotificationContext'

/**
 * First-chat onboarding banner (RFC #883 Phase 3 task 12).
 *
 * Renders above the chat header when the scanner has seen at least one
 * embeddable file AND the user has not yet picked a global ingest policy
 * (`rag.defaultIngestPolicy` unset). Two buttons let the user decide once,
 * after which the prompt never returns:
 *
 *   - "Index existing content" → sets policy=Always and dispatches a sync so
 *     anything already on disk + in `pending_decision` gets queued for embed.
 *   - "Maybe later"            → sets policy=Manual. New content waits in
 *     `pending_decision` until the user opts in from the KB modal.
 *
 * The "dismiss without deciding" X is intentionally NOT here. Dismissing
 * without setting policy would make the banner reappear on every visit until
 * a choice is recorded — annoying. The two action buttons each set policy,
 * and the user can change their mind any time via the Always/Manual radio in
 * the KB modal.
 */
export default function KbPolicyPromptBanner() {
  const queryClient = useQueryClient()
  const { addNotification } = useNotifications()
  // Inertia injects `aiAssistantName` as a shared page prop on chat-mounted
  // pages so the banner pulls the user-set name when surfaced. Default to
  // "AI Assistant" when accessed outside that context (no-op for chat pages,
  // but keeps the component safe for future reuse elsewhere).
  const aiAssistantName =
    usePage<{ aiAssistantName?: string }>().props?.aiAssistantName || 'AI Assistant'

  const { data: promptState } = useQuery({
    queryKey: ['kbPolicyPromptState'],
    queryFn: () => api.getKbPolicyPromptState(),
    staleTime: Infinity,
  })

  const indexNowMutation = useMutation({
    mutationFn: async () => {
      await api.updateSetting('rag.defaultIngestPolicy', 'Always')
      await api.syncRAGStorage()
    },
    onSuccess: () => {
      addNotification({
        type: 'success',
        message: `${aiAssistantName} проиндексирует ваш существующий контент. Вы можете отслеживать прогресс на панели «База знаний».`,
      })
      queryClient.invalidateQueries({ queryKey: ['kbPolicyPromptState'] })
      queryClient.invalidateQueries({ queryKey: ['ingestPolicy'] })
      queryClient.invalidateQueries({ queryKey: ['embed-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['storedFiles'] })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: error?.message || 'Не удалось запустить индексацию. Попробуйте снова на панели «База знаний».',
      })
    },
  })

  const maybeLaterMutation = useMutation({
    mutationFn: () => api.updateSetting('rag.defaultIngestPolicy', 'Manual'),
    onSuccess: () => {
      addNotification({
        type: 'success',
        message: 'Ваш контент пока остаётся непроиндексированным. Вы можете включить индексацию в любой момент на панели «База знаний».',
      })
      queryClient.invalidateQueries({ queryKey: ['kbPolicyPromptState'] })
      queryClient.invalidateQueries({ queryKey: ['ingestPolicy'] })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        message: error?.message || 'Не удалось сохранить ваш выбор. Попробуйте ещё раз.',
      })
    },
  })

  if (!promptState?.shouldPrompt) return null

  const fileCount = promptState.totalFiles
  const isBusy = indexNowMutation.isPending || maybeLaterMutation.isPending

  return (
    <div className="px-6 py-3 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800 flex-shrink-0">
      <div className="flex items-center gap-3">
        <IconBrain className="h-6 w-6 text-blue-600 dark:text-blue-300 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary">
            <strong>
              {fileCount === 1
                ? `Проиндексировать существующий файл для ${aiAssistantName}?`
                : `Проиндексировать ${fileCount.toLocaleString()} существующих файлов для ${aiAssistantName}?`}
            </strong>
            {' '}После индексации {aiAssistantName} сможет ссылаться на них при ответах на ваши вопросы.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <StyledButton
            onClick={() => indexNowMutation.mutate()}
            variant="primary"
            size="sm"
            disabled={isBusy}
            loading={indexNowMutation.isPending}
          >
            Индексировать существующий контент
          </StyledButton>
          <StyledButton
            onClick={() => maybeLaterMutation.mutate()}
            variant="ghost"
            size="sm"
            disabled={isBusy}
            loading={maybeLaterMutation.isPending}
          >
            Возможно, позже
          </StyledButton>
        </div>
      </div>
    </div>
  )
}
