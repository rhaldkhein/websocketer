import WebSocket, { WebSocketServer } from 'ws'
import WebSocketer from './WebSocketer'

describe('websocketer', () => {

  let wss: WebSocketServer | undefined
  let wsserver: WebSocket | undefined
  let wsclient: WebSocket | undefined
  let wsrServer: WebSocketer | undefined
  let wsrClient: WebSocketer | undefined

  beforeAll(async () => {
    wss = new WebSocketServer({ port: 5000 })
    wss.on('connection', ws => {
      wsserver = ws
    })
    await new Promise(resolve => {
      wss?.on('listening', () => {
        wsclient = new WebSocket('ws://localhost:5000')
        wsclient.on('open', () => {
          resolve(undefined)
        })
      })
    })
  })

  afterAll(async () => {
    wsrServer?.destroy()
    wsrClient?.destroy()
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
    wsrServer = undefined
    wsrClient = undefined
  })

  test('start', async () => {
    expect(1).toBe(1)
  })

  test('should send and reply', async () => {

    wsrServer = new WebSocketer(wsserver)
    wsrClient = new WebSocketer(wsclient)
    wsrServer.on<string>('no_data', (data) => {
      expect(data).toBeUndefined()
    })
    const payload = await wsrClient.request('no_data')
    expect(payload).toBeUndefined()

  })

  test('should send and reply with payload', async () => {

    wsrServer?.on<string>('with_payload', (data) => {
      expect(data).toBe('hello')
      return 'hi'
    })
    const payload = await wsrClient?.request('with_payload', 'hello')
    expect(payload).toBe('hi')

  })

  test('should send and reply from server to client', async () => {

    wsrClient?.on<string>('server_to_client', (data) => {
      expect(data).toBe('nice')
      return 'one'
    })
    const payload = await wsrServer?.request('server_to_client', 'nice')
    expect(payload).toBe('one')

  })

  test('should send and reply all types', async () => {

    wsrServer?.on<string>('all_types', (data) => {
      return data
    })
    const str = await wsrClient?.request('all_types', 'str')
    expect(str).toBe('str')
    const num = await wsrClient?.request('all_types', 1)
    expect(num).toBe(1)
    const bool = await wsrClient?.request('all_types', true)
    expect(bool).toBe(true)
    const obj = await wsrClient?.request('all_types', { a: 1 })
    expect(obj).toStrictEqual({ a: 1 })
    const arr = await wsrClient?.request('all_types', [1, 2])
    expect(arr).toStrictEqual([1, 2])

  })

  test('should send and reply async', async () => {
    wsrServer?.on<string>('test_async', async (data) => {
      await new Promise(resolve => {
        setTimeout(() => resolve(undefined), 1000)
      })
      return data
    })
    // note! response time should only be 1 second
    const result = await Promise.all([
      wsrClient?.request('test_async', 1),
      wsrClient?.request('test_async', 2),
      wsrClient?.request('test_async', 3)
    ])
    expect(result[0]).toBe(1)
    expect(result[1]).toBe(2)
    expect(result[2]).toBe(3)
  })

  test('should ping', async () => {

    const cl = new WebSocketer(wsclient, {
      ping: 1
    })
    await new Promise(resolve => {
      setTimeout(resolve, 1500)
    })
    expect(cl.listeners('_ping_').length === 1)
    cl.destroy()
  })

  test('should error', async () => {

    wsrServer?.on('no_return', (data) => { })
    wsrServer?.on('two_replies', (data) => {
      return 1
    })
    wsrServer?.on('two_replies', (data) => {
      return 2
    })

    expect(wsrClient?.request('no_listener_on_server')).rejects
      .toMatchObject({ code: 'ERR_WSR_NO_LISTENER' })
    const noreturn = await wsrClient?.request('no_return')
    expect(noreturn).toBeUndefined()
    const tworeplies = await wsrClient?.request('two_replies')
    expect(tworeplies).toBe(2)

  })

  test('should error timeout', async () => {

    const timeoutClient = new WebSocketer(wsclient, { timeout: 2 })
    let timeoutId
    wsrServer?.on('test_timeout', async () => {
      await new Promise(resolve => {
        timeoutId = setTimeout(() => resolve(undefined), 3000)
      })
    })

    await expect(timeoutClient.request('test_timeout')).rejects
      .toMatchObject({ code: 'ERR_WSR_TIMEOUT' })
    timeoutClient.destroy()
    clearTimeout(timeoutId)
  })

  test('should destroy', async () => {

    wsrServer?.on('to_destroy', (data) => {
      return data
    })
    const data = await wsrClient?.request('to_destroy', 1)
    expect(data).toBe(1)
    const server = wsrServer as any
    server.destroy()
    expect(server._requests.size).toBe(0)
    const client = wsrClient as any
    client.destroy()
    expect(client._requests.size).toBe(0)
    expect(wsrClient?.request('to_destroy')).rejects.toThrowError()

  })

})
