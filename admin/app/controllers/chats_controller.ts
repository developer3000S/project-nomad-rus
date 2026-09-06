import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ChatService } from '#services/chat_service'
import { createSessionSchema, updateSessionSchema, addMessageSchema } from '#validators/chat'
import KVStore from '#models/kv_store'
import { SystemService } from '#services/system_service'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import logger from '@adonisjs/core/services/logger'

@inject()
export default class ChatsController {
  constructor(private chatService: ChatService, private systemService: SystemService) {}

  async inertia({ inertia, response }: HttpContext) {
    const aiAssistantInstalled = await this.systemService.checkServiceInstalled(SERVICE_NAMES.OLLAMA)
    if (!aiAssistantInstalled) {
      return response.status(404).json({ error: 'Сервис AI-помощника не установлен' })
    }
    
    const chatSuggestionsEnabled = await KVStore.getValue('chat.suggestionsEnabled')
    return inertia.render('chat', {
      settings: {
        chatSuggestionsEnabled: chatSuggestionsEnabled ?? false,
      },
    })
  }

  async index({}: HttpContext) {
    return await this.chatService.getAllSessions()
  }

  async show({ params, response }: HttpContext) {
    const sessionId = parseInt(params.id)
    const session = await this.chatService.getSession(sessionId)

    if (!session) {
      return response.status(404).json({ error: 'Сессия не найдена' })
    }

    return session
  }

  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createSessionSchema)
      const session = await this.chatService.createSession(data.title, data.model)
      return response.status(201).json(session)
    } catch (error) {
      logger.error({ err: error }, '[ChatsController] Не удалось создать сессию')
      return response.status(500).json({
        error: 'Не удалось создать сессию',
      })
    }
  }

  async suggestions({ response }: HttpContext) {
    try {
      const suggestions = await this.chatService.getChatSuggestions()
      return response.status(200).json({ suggestions })
    } catch (error) {
      logger.error({ err: error }, '[ChatsController] Не удалось получить предложения')
      return response.status(500).json({
        error: 'Не удалось получить предложения',
      })
    }
  }

  async update({ params, request, response }: HttpContext) {
    try {
      const sessionId = parseInt(params.id)
      const data = await request.validateUsing(updateSessionSchema)
      const session = await this.chatService.updateSession(sessionId, data)
      return session
    } catch (error) {
      logger.error({ err: error }, '[ChatsController] Не удалось обновить сессию')
      return response.status(500).json({
        error: 'Не удалось обновить сессию',
      })
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      const sessionId = parseInt(params.id)
      await this.chatService.deleteSession(sessionId)
      return response.status(204)
    } catch (error) {
      logger.error({ err: error }, '[ChatsController] Не удалось удалить сессию')
      return response.status(500).json({
        error: 'Не удалось удалить сессию',
      })
    }
  }

  async addMessage({ params, request, response }: HttpContext) {
    try {
      const sessionId = parseInt(params.id)
      const data = await request.validateUsing(addMessageSchema)
      const message = await this.chatService.addMessage(sessionId, data.role, data.content)
      return response.status(201).json(message)
    } catch (error) {
      logger.error({ err: error }, '[ChatsController] Не удалось добавить сообщение')
      return response.status(500).json({
        error: 'Не удалось добавить сообщение',
      })
    }
  }

  async destroyAll({ response }: HttpContext) {
    try {
      const result = await this.chatService.deleteAllSessions()
      return response.status(200).json(result)
    } catch (error) {
      logger.error({ err: error }, '[ChatsController] Не удалось удалить все сессии')
      return response.status(500).json({
        error: 'Не удалось удалить все сессии',
      })
    }
  }
}
