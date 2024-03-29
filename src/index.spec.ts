import WebSocket, { WebSocketServer } from 'ws'
import { createWebSocketer, WebSocketer } from './index'

describe('index', () => {

  let wss: WebSocketServer | undefined
  let wsserver: WebSocket | undefined
  let wsclient: WebSocket | undefined

  beforeAll(async () => {
    await new Promise(resolve => {
      wss = new WebSocketServer({ port: 5001 })
      wss.on('connection', ws => {
        wsserver = ws
      })
      wss.on('listening', () => {
        wsclient = new WebSocket('ws://localhost:5001')
        wsclient.on('open', () => {
          resolve(undefined)
        })
      })
    })
  })

  afterAll(async () => {
    await new Promise(resolve => {
      if (!wsserver) return resolve(undefined)
      wsserver?.on('close', () => {
        resolve(undefined)
      })
      wsserver?.close()
    })
    await new Promise(resolve => {
      if (!wsclient) return resolve(undefined)
      wsclient?.on('close', () => {
        resolve(undefined)
      })
      wsclient?.close()
    })
    await new Promise(resolve => {
      if (!wss) return resolve(undefined)
      wss?.on('close', () => {
        resolve(undefined)
      })
      wss?.close()
    })
    wsserver?.removeAllListeners()
    wsclient?.removeAllListeners()
    wss?.removeAllListeners()
    wss = undefined
    wsserver = undefined
    wsclient = undefined
  })

  test('should work createWebSocketer', async () => {

    const wsrServer: WebSocketer = createWebSocketer(wsserver)
    const wsrClient: WebSocketer = createWebSocketer(wsclient)

    wsrServer.on('test_request', (data) => data)
    const payload = await wsrClient.request('test_request', 1)
    expect(payload).toBe(1)

    wsrServer.destroy()
    wsrClient.destroy()

  })

})
