import { jest } from '@jest/globals'
import WebSocket, { WebSocketServer } from 'ws'
import WebSocketer, { TListener } from './WebSocketer'

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

    wsrServer.listen<string>('no_data', (data, reply) => {
      expect(data).toBeUndefined()
      reply()
    })
    const payload = await wsrClient.send('no_data')
    expect(payload).toBeUndefined()

  })

  test('should send and reply with payload', async () => {

    wsrServer?.listen<string>('with_payload', (data, reply) => {
      expect(data).toBe('hello')
      reply('hi')
    })
    const payload = await wsrClient?.send('with_payload', 'hello')
    expect(payload).toBe('hi')

  })

  test('should send and reply from server to client', async () => {

    wsrClient?.listen<string>('server_to_client', (data, reply) => {
      expect(data).toBe('nice')
      reply('one')
    })
    const payload = await wsrServer?.send('server_to_client', 'nice')
    expect(payload).toBe('one')

  })

  test('should send and reply all types', async () => {

    wsrServer?.listen<string>('all_types', (data, reply) => {
      reply(data)
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
    wsrServer?.listen<string>('test_async', async (data, reply, req) => {
      await new Promise(resolve => {
        setTimeout(() => resolve(undefined), 1000)
      })
      reply(data)
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

    wsrServer?.listen('no_reply', (data, reply) => { })
    wsrServer?.listen('two_replies', (data, reply) => {
      reply(1)
    })
    // #TODO test multiple replies error
    // const secondListener = jest.fn((data, reply) => {
    //   reply(2)
    // })
    // wsrServer?.listen('two_replies', secondListener)
    expect(wsrClient?.send('no_listener_on_server')).rejects
      .toMatchObject({ code: 'ERR_WSR_NO_LISTENER' })
    expect(wsrClient?.send('no_reply')).rejects
      .toMatchObject({ code: 'ERR_WSR_NO_REPLY' })
    expect(wsrClient?.send('two_replies')).resolves
      .toEqual(1)
    // expect(secondListener).toHaveBeenCalled()
    // expect(secondListener.).toHaveBeenCalled()

  })

  test('should error timeout', async () => {

    const timeoutClient = new WebSocketer(wsclient, { timeout: 1 })

    wsrServer?.listen('test_timeout', async (data, reply) => {
      await new Promise(resolve => {
        setTimeout(() => resolve(undefined), 2000)
      })
      reply()
    })

    await expect(timeoutClient.send('test_timeout')).rejects
      .toMatchObject({ code: 'ERR_WSR_TIMEOUT' })
    timeoutClient.destroy()

  })

  test('should destroy', async () => {

    wsrServer?.listen('to_destroy', (data, reply) => {
      reply(data)
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
