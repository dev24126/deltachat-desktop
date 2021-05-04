import { C } from 'deltachat-node'

// @ts-ignore
import binding from 'deltachat-node/binding'
import { getLogger } from '../../shared/logger'

const log = getLogger('main/deltachat/messagelist')

import filesizeConverter from 'filesize'
import mime from 'mime-types'

import SplitOut from './splitout'
import { Message } from 'deltachat-node'
import {
  MessageType,
  MessageSearchResult,
  MessageTypeAttachment,
  Message2,
  MessageQuote,
} from '../../shared/shared-types'

import { writeFile } from 'fs-extra'
import tempy from 'tempy'
import { MessageType2 } from '../../shared/shared'
export default class DCMessageList extends SplitOut {
  sendMessage(
    chatId: number,
    {
      text,
      filename,
      location,
      quoteMessageId,
    }: {
      text?: string
      filename?: string
      location?: { lat: number; lng: number }
      quoteMessageId?: number
    }
  ): [number, Message2] {
    const viewType = filename ? C.DC_MSG_FILE : C.DC_MSG_TEXT
    const msg = this._dc.messageNew(viewType)
    if (filename) msg.setFile(filename, undefined)
    if (text) msg.setText(text)
    if (location) msg.setLocation(location.lat, location.lng)

    if (quoteMessageId) {
      const quotedMessage = this._dc.getMessage(quoteMessageId)
      if (!quotedMessage) {
        log.error('sendMessage: Message to quote not found')
      } else {
        msg.setQuote(quotedMessage)
      }
    }

    const messageId = this._dc.sendMessage(chatId, msg)
    const _msg = this._dc.getMessage(messageId)
    const message = _msg
      ? { type: MessageType2.Message, message: this._messageToJson(_msg) }
      : null
    return [messageId, message]
  }

  sendSticker(chatId: number, fileStickerPath: string) {
    const viewType = C.DC_MSG_STICKER
    const msg = this._dc.messageNew(viewType)
    const stickerPath = fileStickerPath.replace('file://', '')
    msg.setFile(stickerPath, undefined)
    this._dc.sendMessage(chatId, msg)
  }

  deleteMessage(id: number) {
    log.info(`deleting messages ${id}`)
    this._dc.deleteMessages([id])
  }

  getMessage(msgId: number) {
    return this.messageIdToJson(msgId)
  }

  getMessageInfo(msgId: number) {
    return this._dc.getMessageInfo(msgId)
  }

  getFirstUnreadMessageId(chatId: number) {
    const countFreshMessages = this._dc.getFreshMessageCount(chatId)
    const messageIds = this._dc.getChatMessages(chatId, 0, 0)

    let foundFreshMessages = 0
    let firstUnreadMessageId = -1
    for (let i = messageIds.length - 1; i >= 0; i--) {
      const messageId = messageIds[i]

      if (!this._dc.getMessage(messageId).getState().isFresh()) continue

      foundFreshMessages++
      firstUnreadMessageId = messageId

      if (foundFreshMessages >= countFreshMessages) {
        break
      }
    }

    return firstUnreadMessageId
  }

  getUnreadMessageIds(chatId: number) {
    const countFreshMessages = this._dc.getFreshMessageCount(chatId)
    log.debug(`getUnreadMessageIds: countFreshMessages: ${countFreshMessages}`)
    if (countFreshMessages === 0) return []

    const messageIds = this._dc.getChatMessages(chatId, 0, 0)

    let foundFreshMessages = 0
    const unreadMessageIds: number[] = []
    for (let i = messageIds.length - 1; i >= 0; i--) {
      const messageId = messageIds[i]

      const state = this._dc.getMessage(messageId).getState().state
      const isFresh =
        state === C.DC_STATE_IN_FRESH || state === C.DC_STATE_IN_NOTICED
      log.debug(
        `getUnreadMessageIds: messageId: ${messageId} isFresh: ${isFresh}`
      )
      if (!isFresh) continue

      foundFreshMessages++
      unreadMessageIds.unshift(messageId)

      if (foundFreshMessages >= countFreshMessages) {
        break
      }
    }

    return unreadMessageIds
  }

  async getDraft(chatId: number): Promise<MessageType | null> {
    const draft = this._dc.getDraft(chatId)
    return draft ? this._messageToJson(draft) : null
  }

  setDraft(
    chatId: number,
    {
      text,
      file,
      quotedMessageId,
    }: { text?: string; file?: string; quotedMessageId?: number }
  ) {
    const viewType = file ? C.DC_MSG_FILE : C.DC_MSG_TEXT
    const draft = this._dc.messageNew(viewType)
    if (file) draft.setFile(file, undefined)
    if (text) draft.setText(text)
    if (quotedMessageId) {
      const quotedMessage = this._dc.getMessage(quotedMessageId)
      if (!quotedMessage) {
        log.error('setDraftquote: Message to quote not found')
      } else {
        draft.setQuote(quotedMessage)
      }
    }

    this._dc.setDraft(chatId, draft)
  }

  messageIdToJson(id: number) {
    const msg = this._dc.getMessage(id)
    if (!msg) {
      log.warn('No message found for ID ' + id)
      const empty: { msg: null } = { msg: null }
      return empty
    }
    return this._messageToJson(msg)
  }

  _messageToJson(msg: Message): MessageType {
    const file = msg.getFile()
    const filemime = msg.getFilemime()
    const filename = msg.getFilename()
    const filesize = msg.getFilebytes()
    const viewType = msg.getViewType()
    const fromId = msg.getFromId()
    const isMe = fromId === C.DC_CONTACT_ID_SELF
    const setupCodeBegin = msg.getSetupcodebegin()
    const contact = fromId && this._controller.contacts.getContact(fromId)
    const direction = (isMe ? 'outgoing' : 'incoming') as
      | 'outgoing'
      | 'incoming'

    const attachment: MessageTypeAttachment = file && {
      url: file,
      contentType: convertContentType({
        filemime,
        viewType: (viewType as unknown) as number,
        file: file,
      }),
      fileName: filename || msg.getText(),
      fileSize: filesizeConverter(filesize),
    }

    let quote: MessageQuote = null
    const quotedMessage = msg.getQuotedMessage()
    if (quotedMessage) {
      const _contact = this._dc.getContact(quotedMessage.getFromId())
      quote = {
        messageId: quotedMessage.getId(),
        text: quotedMessage.getText(),
        displayName: _contact.getDisplayName(),
        displayColor: _contact.color,
      }
    }

    return {
      id: msg.getId(),
      msg: {
        chatId: msg.getChatId(),
        duration: msg.getDuration(),
        file: msg.getFile(),
        fromId: msg.getFromId(),
        id: msg.getId(),
        quote,
        receivedTimestamp: msg.getReceivedTimestamp(),
        sortTimestamp: msg.getSortTimestamp(),
        text: msg.getText(),
        timestamp: msg.getTimestamp(),
        hasLocation: msg.hasLocation(),
        viewType: binding.dcn_msg_get_viewtype(msg.dc_msg),
        state: binding.dcn_msg_get_state(msg.dc_msg),
        hasDeviatingTimestamp: msg.hasDeviatingTimestamp(),
        showPadlock: msg.getShowpadlock(),
        summary: msg.getSummary().toJson(),
        isSetupmessage: msg.isSetupmessage(),
        isInfo: msg.isInfo(),
        isForwarded: msg.isForwarded(),
        dimensions: {
          height: msg.getHeight(),
          width: msg.getWidth(),
        },
        videochatType: msg.getVideochatType(),
        videochatUrl: msg.getVideochatUrl(),
        sentAt: msg.getTimestamp() * 1000,
        receivedAt: msg.getReceivedTimestamp() * 1000,
        direction,
        attachment,
      },
      filemime,
      filename,
      filesize,
      viewType,
      fromId,
      isMe,
      contact: (contact ? { ...contact } : {}) as any,
      isInfo: msg.isInfo(),
      setupCodeBegin,
    }
  }

  forwardMessage(msgId: number, chatId: number) {
    this._dc.forwardMessages([msgId], chatId)
    this._controller.chatList.selectChat(chatId)
  }

  getMessageIds(chatId: number, marker1Before?: number) {
    log.debug(
      `getMessageIds: chatId: ${chatId} marker1Before: ${marker1Before}`
    )
    const messageIds = this._dc.getChatMessages(
      chatId,
      C.DC_GCM_ADDDAYMARKER,
      marker1Before || 0
    )
    return messageIds
  }
  async getMessages(
    chatId: number,
    indexStart: number,
    indexEnd: number,
    marker1Before?: number
  ): Promise<Message2[]> {
    log.debug(`getMessages: chatId: ${chatId} marker1Before: ${marker1Before}`)
    const messageIds = this.getMessageIds(chatId, marker1Before)

    const length = indexEnd - indexStart
    const messages: Message2[] = new Array(length + 1)
    for (let i = 0; i <= length; i++) {
      const messageIndex = indexStart + i
      const messageId = messageIds[messageIndex]

      let messageObject: Message2 = null
      if (messageId == C.DC_MSG_ID_DAYMARKER) {
        const nextMessageIndex = messageIndex + 1
        const nextMessageId = messageIds[nextMessageIndex]
        const nextMessageTimestamp = this._dc
          .getMessage(nextMessageId)
          .getTimestamp()
        messageObject = {
          type: MessageType2.DayMarker,
          message: {
            timestamp: nextMessageTimestamp,
          },
        }
      } else if (messageId === C.DC_MSG_ID_MARKER1) {
        messageObject = {
          type: MessageType2.MarkerOne,
          message: null,
        }
      } else if (messageId <= C.DC_MSG_ID_LAST_SPECIAL) {
        log.debug(
          `getMessages: not sure what do with this messageId: ${messageId}, skipping`
        )
      } else {
        const msg = this._dc.getMessage(messageId)
        if (msg) {
          const message = this._messageToJson(msg)
          messageObject = {
            type: MessageType2.Message,
            message,
          }
        }
      }

      messages[i] = messageObject
    }
    return messages
  }

  markSeenMessages(messageIds: number[]) {
    this._dc.markSeenMessages(messageIds)
  }

  searchMessages(query: string, chatId = 0): number[] {
    return this._dc.searchMessages(chatId, query)
  }

  private _msgId2SearchResultItem(msgId: number): MessageSearchResult {
    const message = this._dc.getMessage(msgId)
    const chat = this._dc.getChat(message.getChatId())
    const author = this._dc.getContact(message.getFromId())

    return {
      id: msgId,
      authorProfileImage: author.getProfileImage(),
      author_name: author.getDisplayName(),
      author_color: author.color,
      chat_name: chat.isSingle() ? null : chat.getName(),
      message: message.getText(),
      timestamp: message.getTimestamp(),
    }
  }

  msgIds2SearchResultItems(ids: number[]) {
    const result: { [id: number]: MessageSearchResult } = {}
    for (const id of ids) {
      result[id] = this._msgId2SearchResultItem(id)
    }
    return result
  }

  /** @returns file path to html file */
  async saveMessageHTML2Disk(messageId: number): Promise<string> {
    const message_html_content = this._dc.getMessageHTML(messageId)
    const pathToFile = tempy.file({ extension: 'html' })
    await writeFile(pathToFile, message_html_content, { encoding: 'utf-8' })
    return pathToFile
  }
}

function convertContentType({
  filemime,
  viewType,
  file,
}: {
  filemime: string
  viewType: number
  file: string
}) {
  if (!filemime) return 'application/octet-stream'
  if (filemime !== 'application/octet-stream') return filemime

  switch (viewType) {
    case C.DC_MSG_IMAGE:
      return 'image/jpg'
    case C.DC_MSG_VOICE:
      return 'audio/ogg'
    case C.DC_MSG_FILE:
      return mime.lookup(file) || 'application/octet-stream'
    default:
      return 'application/octet-stream'
  }
}
