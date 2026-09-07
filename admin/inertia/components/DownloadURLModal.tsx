import { useState } from 'react'
import StyledModal, { StyledModalProps } from './StyledModal'
import Input from './inputs/Input'
import api from '~/lib/api'

export type DownloadURLModalProps = Omit<
  StyledModalProps,
  'onConfirm' | 'open' | 'confirmText' | 'cancelText' | 'confirmVariant' | 'children'
> & {
  suggestedURL?: string
  onPreflightSuccess?: (url: string) => void
}

const DownloadURLModal: React.FC<DownloadURLModalProps> = ({
  suggestedURL,
  onPreflightSuccess,
  ...modalProps
}) => {
  const [url, setUrl] = useState<string>('')
  const [messages, setMessages] = useState<string[]>([])
  const [loading, setLoading] = useState<boolean>(false)

  async function runPreflightCheck(downloadUrl: string) {
    try {
      setLoading(true)
      setMessages([`Выполняется предварительная проверка для URL: ${downloadUrl}`])
      const res = await api.downloadRemoteMapRegionPreflight(downloadUrl)
      if (!res) {
        throw new Error('Произошла неизвестная ошибка во время предварительной проверки.')
      }

      if ('message' in res) {
        throw new Error(res.message)
      }

      setMessages((prev) => [
        ...prev,
        `Предварительная проверка пройдена. Имя файла: ${res.filename}, размер: ${(res.size / (1024 * 1024)).toFixed(2)} МБ`,
      ])

      if (onPreflightSuccess) {
        onPreflightSuccess(downloadUrl)
      }
    } catch (error) {
      console.error('Preflight check failed:', error)
      setMessages((prev) => [...prev, `Предварительная проверка не удалась: ${error.message}`])
    } finally {
      setLoading(false)
    }
  }

  return (
    <StyledModal
      {...modalProps}
      onConfirm={() => runPreflightCheck(url)}
      open={true}
      confirmText="Скачать"
      confirmIcon="IconDownload"
      cancelText="Отмена"
      confirmVariant="primary"
      confirmLoading={loading}
      cancelLoading={loading}
      large
    >
      <div className="flex flex-col pb-4">
        <p className="text-text-secondary mb-8">
          Введите URL файла региона карты, который хотите загрузить. URL должен быть публично
          доступен и заканчиваться на .pmtiles. Будет выполнена предварительная проверка
          доступности, типа и примерного размера файла.
        </p>
        <Input
          name="download-url"
          label=""
          placeholder={suggestedURL || 'Введите URL для загрузки...'}
          className="mb-4"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="min-h-24 max-h-96 overflow-y-auto bg-surface-secondary p-4 rounded border border-border-default text-left">
          {messages.map((message, idx) => (
            <p
              key={idx}
              className="text-sm text-text-primary font-mono leading-relaxed break-words mb-3"
            >
              {message}
            </p>
          ))}
        </div>
      </div>
    </StyledModal>
  )
}

export default DownloadURLModal
