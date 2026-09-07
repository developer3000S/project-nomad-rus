import { useState } from 'react'
import { Head, Link, router } from '@inertiajs/react'
import { IconArrowLeft } from '@tabler/icons-react'

import MapsLayout from '~/layouts/MapsLayout'
import MapComponent from '~/components/maps/MapComponent'
import StyledButton from '~/components/StyledButton'
import Alert from '~/components/Alert'

import { FileEntry } from '../../types/files'

export default function Maps(props: {
  maps: { baseAssetsExist: boolean; worldBasemapExists: boolean; regionFiles: FileEntry[] }
}) {
  const [isHoveringUI, setIsHoveringUI] = useState(false)
  const [showMapCoordinates, setShowMapCoordinates] = useState(true)

  const alertMessage = !props.maps.baseAssetsExist
    ? 'Базовые файлы карт не установлены. Пожалуйста, сначала загрузите их, чтобы включить функционал карт.'
    : !props.maps.worldBasemapExists
    ? 'Базовая карта мира ещё не загружена, поэтому за пределами загруженных регионов карта может быть пустой. Подключите этот НОМАД к интернету и загрузите её (~15 МБ) в Настройках карт.'
    : props.maps.regionFiles.length === 0
    ? 'Регионы карт ещё не загружены. Пожалуйста, загрузите несколько регионов, чтобы включить функционал карт.'
    : null

  return (
    <MapsLayout>
      <Head title="Карты" />

      <div className="relative w-full h-screen overflow-hidden">
        {/* Navbar */}
        <div
          className="absolute top-0 left-0 right-0 z-50 flex justify-between p-4 bg-surface-secondary backdrop-blur-sm shadow-sm"
          onMouseEnter={() => setIsHoveringUI(true)}
          onMouseLeave={() => setIsHoveringUI(false)}
        >
          <Link href="/home" className="flex items-center">
            <IconArrowLeft className="mr-2" size={24} />
            <p className="text-lg text-text-secondary">Назад на главную</p>
          </Link>

          <div className="flex items-center gap-3 mr-4">
            <button
              type="button"
              onClick={() => setShowMapCoordinates((prev) => !prev)}
              className="rounded px-3 py-2 text-sm bg-surface-primary text-text-secondary hover:opacity-80 transition"
            >
              {showMapCoordinates ? 'Скрыть координаты' : 'Показать координаты'}
            </button>

            <Link href="/settings/maps">
              <StyledButton variant="primary" icon="IconSettings">
                Управление регионами карт
              </StyledButton>
            </Link>
          </div>
        </div>

        {/* Alert */}
        {alertMessage && (
          <div
            className="absolute top-20 left-4 right-4 z-50"
            onMouseEnter={() => setIsHoveringUI(true)}
            onMouseLeave={() => setIsHoveringUI(false)}
          >
            <Alert
              title={alertMessage}
              type="warning"
              variant="solid"
              className="w-full"
              buttonProps={{
                variant: 'secondary',
                children: 'Перейти к настройкам карт',
                icon: 'IconSettings',
                onClick: () => router.visit('/settings/maps'),
              }}
            />
          </div>
        )}

        {/* Map */}
        <div className="absolute inset-0">
          <MapComponent
            isHoveringUI={isHoveringUI}
            showCoordinatesEnabled={showMapCoordinates}
          />
        </div>
      </div>
    </MapsLayout>
  )
}
