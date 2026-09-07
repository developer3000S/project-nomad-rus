import { Head, router } from '@inertiajs/react'
import AppLayout from '~/layouts/AppLayout'
import StyledButton from '~/components/StyledButton'
import Alert from '~/components/Alert'
import useInternetStatus from '~/hooks/useInternetStatus'
import useServiceInstallationActivity from '~/hooks/useServiceInstallationActivity'
import InstallActivityFeed from '~/components/InstallActivityFeed'
import ActiveDownloads from '~/components/ActiveDownloads'
import StyledSectionHeader from '~/components/StyledSectionHeader'

export default function EasySetupWizardComplete() {
  const { isOnline } = useInternetStatus()
  const installActivity = useServiceInstallationActivity()

  return (
    <AppLayout>
      <Head title="Мастер настройки завершён" />
      {!isOnline && (
        <Alert
          title="Нет подключения к интернету"
          message="Похоже, вы не подключены к интернету. Установка приложений и загрузка контента потребуют подключения к интернету."
          type="warning"
          variant="solid"
          className="mb-8"
        />
      )}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-surface-primary rounded-md shadow-md p-6">
          <StyledSectionHeader title="Активность установки приложений" className=" mb-4" />
          <InstallActivityFeed
            activity={installActivity}
            className="!shadow-none border-desert-stone-light border"
          />
          <ActiveDownloads withHeader />
          <Alert
            title="Работает в фоновом режиме"
            message='Можете свободно покинуть эту страницу в любое время — установка приложений и загрузка контента продолжатся в фоновом режиме! Обратите внимание, что Библиотека информации (если установлена) может быть недоступна до завершения начальных загрузок.'
            type="info"
            variant="solid"
            className='mt-12'
          />
          <div className="flex justify-center mt-8 pt-4 border-t border-desert-stone-light">
            <div className="flex space-x-4">
              <StyledButton onClick={() => router.visit('/home')} icon="IconHome">
                Перейти на главную
              </StyledButton>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
