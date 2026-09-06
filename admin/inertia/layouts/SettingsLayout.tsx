import {
  IconAdjustments,
  IconArrowBigUpLines,
  IconBox,
  IconChartBar,
  IconCode,
  IconDashboard,
  IconFolder,
  IconGavel,
  IconHeart,
  IconMapRoute,
  IconMovie,
  IconSettings,
  IconWand,
  IconZoom
} from '@tabler/icons-react'
import { usePage } from '@inertiajs/react'
import StyledSidebar from '~/components/StyledSidebar'
import { getServiceLink } from '~/lib/navigation'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import useCreatorPacks from '~/hooks/useCreatorPacks'
import { SERVICE_NAMES } from '../../constants/service_names'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const aiAssistantInstallStatus = useServiceInstalledStatus(SERVICE_NAMES.OLLAMA)
  // Only show the Creator Packs entry on builds that can actually install packs
  // (release-injected key present) — a fork built from source has no key.
  const { configured: creatorPacksConfigured } = useCreatorPacks()

  const navigation = [
    ...(aiAssistantInstallStatus.isInstalled ? [{ name: aiAssistantName, href: '/settings/models', icon: IconWand, current: false }] : []),
    { name: 'Склад снаряжения', href: '/supply-depot', icon: IconBox, current: false },
    { name: 'Тест производительности', href: '/settings/benchmark', icon: IconChartBar, current: false },
    { name: 'Обзор контента', href: '/settings/zim/remote-explorer', icon: IconZoom, current: false },
    { name: 'Менеджер контента', href: '/settings/zim', icon: IconFolder, current: false },
    ...(creatorPacksConfigured ? [{ name: 'Пакеты создателей', href: '/settings/creator-packs', icon: IconMovie, current: false }] : []),
    { name: 'Менеджер карт', href: '/settings/maps', icon: IconMapRoute, current: false },
    {
      name: 'Логи и метрики сервисов',
      href: getServiceLink('9999'),
      icon: IconDashboard,
      current: false,
      target: '_blank',
    },
    {
      name: 'Проверить обновления',
      href: '/settings/update',
      icon: IconArrowBigUpLines,
      current: false,
    },
    { name: 'Система', href: '/settings/system', icon: IconSettings, current: false },
    { name: 'Расширенные', href: '/settings/advanced', icon: IconAdjustments, current: false },
    { name: 'Справочник API', href: '/reference', icon: IconCode, current: false },
    { name: 'Поддержать проект', href: '/settings/support', icon: IconHeart, current: false },
    { name: 'Правовые уведомления', href: '/settings/legal', icon: IconGavel, current: false },
  ]

  return (
    <div className="min-h-screen flex flex-row bg-surface-secondary/90">
      <StyledSidebar title="Настройки" items={navigation} />
      {children}
    </div>
  )
}
