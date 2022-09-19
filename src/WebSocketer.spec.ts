import WebSocket, { WebSocketServer } from 'ws'
import WebSocketer from './WebSocketer'

describe('cache service', () => {

  let wss: WebSocketServer | undefined
  let wsserver: WebSocket | undefined
  let wsclient: WebSocket | undefined
  let wsrServer: WebSocketer | undefined
  let wsrClient: WebSocketer | undefined

  beforeAll(async () => {
    await new Promise(resolve => {
      wss = new WebSocketServer({ port: 5000 })
      wss.on('connection', ws => {
        wsserver = ws
      })
      wss.on('listening', () => {
        wsclient = new WebSocket('ws://localhost:5000')
        wsclient.on('open', () => {
          resolve(undefined)
        })
      })
    })
  })

  afterAll(async () => {
    await new Promise(resolve => {
      wsclient?.on('close', () => {
        resolve(undefined)
      })
      wsclient?.close()
    })
    await new Promise(resolve => {
      wss?.on('close', () => {
        resolve(undefined)
      })
      wss?.close()
    })
  })

  test('should send and reply', async () => {

    wsrServer = new WebSocketer(wsserver)
    wsrClient = new WebSocketer(wsclient)

    wsrServer.listen<string>('no_data', (data) => {
      expect(data).toBeUndefined()
    })
    const payload = await wsrClient.send('no_data')
    expect(payload).toBeUndefined()

  })

  test('should send and reply with payload', async () => {

    wsrServer?.listen<string>('with_payload', (data) => {
      expect(data).toBe('hello')
      return 'hi'
    })
    const payload = await wsrClient?.send('with_payload', 'hello')
    expect(payload).toBe('hi')

  })

  test('should send and reply from server to client', async () => {

    wsrClient?.listen<string>('server_to_client', (data) => {
      expect(data).toBe('nice')
      return 'one'
    })
    const payload = await wsrServer?.send('server_to_client', 'nice')
    expect(payload).toBe('one')

  })

  test('should send and reply all types', async () => {

    wsrServer?.listen<string>('all_types', (data) => {
      return data
    })
    const str = await wsrClient?.send('all_types', 'str')
    expect(str).toBe('str')
    const num = await wsrClient?.send('all_types', 1)
    expect(num).toBe(1)
    const bool = await wsrClient?.send('all_types', true)
    expect(bool).toBe(true)
    const obj = await wsrClient?.send('all_types', { a: 1 })
    expect(obj).toStrictEqual({ a: 1 })
    const arr = await wsrClient?.send('all_types', [1, 2])
    expect(arr).toStrictEqual([1, 2])

  })

  test('should send and reply async', async () => {
    wsrServer?.listen<string>('test_async', async (data) => {
      await new Promise(resolve => {
        setTimeout(() => resolve(undefined), 1000)
      })
      return data
    })
    // note! response time should only be 1 second
    const result = await Promise.all([
      wsrClient?.send('test_async', 1),
      wsrClient?.send('test_async', 2),
      wsrClient?.send('test_async', 3)
    ])
    expect(result[0]).toBe(1)
    expect(result[1]).toBe(2)
    expect(result[2]).toBe(3)
  })

  test('should error', async () => {

    wsrServer?.listen('no_return', (data) => { })
    wsrServer?.listen('two_replies', (data) => {
      return 1
    })
    wsrServer?.listen('two_replies', (data) => {
      return 2
    })

    expect(wsrClient?.send('no_listener_on_server')).rejects
      .toMatchObject({ code: 'ERR_WSR_NO_LISTENER' })
    const noreturn = await wsrClient?.send('no_return')
    expect(noreturn).toBeUndefined()
    const tworeplies = await wsrClient?.send('two_replies')
    expect(tworeplies).toBe(2)

  })

  test('should error timeout', async () => {

    const timeoutClient = new WebSocketer(wsclient, { timeout: 1 })

    wsrServer?.listen('test_timeout', async () => {
      await new Promise(resolve => {
        setTimeout(() => resolve(undefined), 2000)
      })
    })

    await expect(timeoutClient.send('test_timeout')).rejects
      .toMatchObject({ code: 'ERR_WSR_TIMEOUT' })
    timeoutClient.destroy()

  })

  test('should destroy', async () => {

    wsrServer?.listen('to_destroy', (data) => {
      return data
    })
    const data = await wsrClient?.send('to_destroy', 1)
    expect(data).toBe(1)
    const server = wsrServer as any
    server.destroy()
    expect(server._requests.size).toBe(0)
    expect(server._listeners.size).toBe(0)
    const client = wsrClient as any
    client.destroy()
    expect(client._requests.size).toBe(0)
    expect(client._listeners.size).toBe(0)
    expect(wsrClient?.send('to_destroy')).rejects.toThrowError()

  })

})
