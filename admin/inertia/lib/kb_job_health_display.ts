import { computeJobHealth, type JobHealthStatus } from '../../app/utils/kb_job_health.js'

export { computeJobHealth, type JobHealthStatus } from '../../app/utils/kb_job_health.js'

/**
 * Visual presentation for each health status — pill color, dot color, and the
 * short label rendered alongside the dot. Kept in one place so backend health
 * decisions (`computeJobHealth`) and frontend rendering stay in sync.
 */
export const JOB_HEALTH_DISPLAY: Record<
  JobHealthStatus,
  { dot: string; label: string; ariaLabel: string }
> = {
  waiting: {
    dot: 'bg-gray-400 dark:bg-gray-500',
    label: 'Ожидание',
    ariaLabel: 'Задача в очереди и ожидает запуска',
  },
  healthy: {
    dot: 'bg-green-500',
    label: 'Активно',
    ariaLabel: 'Задача обрабатывается с нормальной скоростью',
  },
  slow: {
    dot: 'bg-yellow-500',
    label: 'Медленно',
    ariaLabel: 'Задача не продвигалась последние 2 минуты',
  },
  stalled: {
    dot: 'bg-red-500',
    label: 'Зависло',
    ariaLabel: 'Задача не продвигалась последние 5 минут',
  },
  failed: {
    dot: 'bg-red-700',
    label: 'Ошибка',
    ariaLabel: 'Задача завершилась с ошибкой',
  },
}

/**
 * Format a relative timestamp as "Xs ago", "Xm ago", "Xh ago" with sensible
 * thresholds for the KB Processing Queue's "Last activity" line.
 */
export function formatTimeAgo(timestampMs: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestampMs) / 1000))
  if (seconds < 5) return 'только что'
  if (seconds < 60) return `${seconds} с назад`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  return `${hours} ч назад`
}

/**
 * Convenience wrapper that resolves a job's health status without the caller
 * having to remember to pass `now`. Mostly for ergonomic frontend use.
 */
export function computeJobHealthNow(
  input: Omit<Parameters<typeof computeJobHealth>[0], 'now'>
): JobHealthStatus {
  return computeJobHealth({ ...input, now: Date.now() })
}
