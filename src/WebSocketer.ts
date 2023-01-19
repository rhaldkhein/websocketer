import EventEmitter from 'eventemitter3'
import { Cluster } from './Cluster'
import { generateId } from './utils/id'

export type Payload = any

export type Reply = (
  payload?: Payload,
  error?: unknown) => void

export type Listener<T = Payload> = (
  payload: T,
  request: RequestData) => void

export type ResponseHandler = (
  error: WebSocketerError | null,
  payload: Payload,
  request: RequestData) => void

export interface RequestData<T = any> {
  /** namespace */
  ns: string
  /** id */
  id: string
  /** name */
  nm: string
  /** request - is it a request or a response */
  rq: boolean
  /** origin client id */
  fr: string
  /** destination client id */
  to?: string
  /** error */
  er?: WebSocketerError
  /** payload */
  pl?: T
  /** response - `true` on server, `function` on client to call when replied */
  rs?: true | ResponseHandler
  /** timeout id */
  ti?: any
  /** local data space */
  locals?: Record<string, any>
  /** attached socket */
  socket?: any
}

export interface RemoteEnd {
  id: string
}

export interface Options {
  id: string
  namespace: string
  timeout: number
  errorFilter: (err: WebSocketerError) => WebSocketerError
  ping?: number
  cluster?: Cluster
  debug?: boolean
}

export class WebSocketerError extends Error {
  code: string
  payload: any
  constructor(message: string, code?: string, payload?: any, name?: string) {
    super(message || 'Something went wrong')
    this.name = name || 'WebSocketerError'
    this.code = code || 'ERR_WSR_UNKNOWN'
    this.payload = payload
  }
}

export interface Client {
  handleRequest<T>(data: RequestData): Promise<RequestData<T>>
  send<T>(name: string, payload?: Payload, to?: string): Promise<T>
}

/**
 * WebSocketer class
 */
export default class WebSocketer<T extends Cluster = any>
  extends EventEmitter
  implements Client {

  private _options: Options
  private _id: string
  private _socket: any
  private _requests = new Map<string, RequestData>()
  private _messageHandler: (e: any) => Promise<void>
  private _openHandler: () => void = () => undefined
  private _pingIntervalId: any
  private _cluster?: T
  private _remotes = new Map<string, RemoteEnd>()

  /**
   * Create a WebSocketer instance.
   *
   * @param socket WebSocket instance to wrap
   * @param opt.id id of client.
   * default: (auto generated string)
   * @param opt.namespace custom message namespace to avoid conflict.
   * default: `"websocketer"`
   * @param opt.timeout custom request timeout in seconds.
   * default: `60`
   * @param opt.ping ping connection in seconds.
   * default: `0` (disabled)
   * @param opt.cluster server side only, the cluster broadcast server.
   * default: `undefined`
   */
  constructor(
    socket: any,
    options?: Partial<Options>) {

    super()
    options = options || {} as Options
    options.errorFilter = options.errorFilter || (err => err)
    options.namespace = options.namespace || 'websocketer'
    options.timeout = options.timeout || 60
    options.ping = options.ping || 0
    options.id = options.id || generateId(24)

    this._socket = socket
    this._id = options.id
    this._cluster = options.cluster as T
    this._options = options as Options
    this.clear()

    this._cluster?.register(this)

    // trigger interval pings
    if (options.ping) {
      this._pingIntervalId = setInterval(
        async () => {
          try {
            await this.send('_ping_')
          } catch (error) {
            // do nothing
          }
        },
        1000 * options.ping
      )
    }

    // listen to message event
    socket.addEventListener('message', this._messageHandler = async (e: any) => {
      let data: RequestData
      // parse data
      try {
        data = JSON.parse(
          typeof e.data === 'string' ? e.data : e.data.toString()
        )
      } catch (error) {
        data = { ns: '', id: '', nm: '', fr: '', rq: false }
      }
      // process data
      if (data.ns !== this._options.namespace) return
      // a request or a response?
      if (data.rq) {
        // if got destination id and cluster instance, then forward to cluster
        const reply = await ((data.to && this._cluster)
          ? this._cluster?.handleRequest(data)
          : this._handleRequest(data))
        this._socket.send(JSON.stringify(reply))
      } else {
        this._handleResponse(data)
      }
    })

    // share client info to remote end
    if (socket.readyState === 1) {
      this._sendInfo()
    } else {
      socket.addEventListener('open', this._openHandler = () => {
        this._sendInfo()
      })
    }
  }

  /**
   * Id of the WebSocketer instance.
   */
  get id() {
    return this._id
  }

  /**
   * Expose the wrapped socket.
   */
  get socket() {
    return this._socket
  }

  /**
   * Remote end client information.
   */
  get remotes() {
    return this._remotes
  }

  get cluster() {
    return this._cluster
  }

  /**
   * Disconnect from socket and remove all listeners, requests, timeouts, and
   * everything else.
   */
  destroy() {
    this._cluster?.unregister(this)
    this._socket?.removeEventListener('message', this._messageHandler)
    this._socket?.removeEventListener('open', this._openHandler)
    this.clear()
    this.removeAllListeners()
    clearInterval(this._pingIntervalId)
    // @ts-ignore
    this._socket = null
    // @ts-ignore
    this._options = {}
    // @ts-ignore
    this._messageHandler = null
    // @ts-ignore
    this._cluster = null
  }

  /**
   * Remove all listeners and requests.
   */
  clear() {
    this._requests.forEach(data => clearTimeout(data.ti))
    this._requests.clear()
    this.removeAllListeners()
    this.on('_ping_', (data) => data)
    this.on('_remote_', (data: RemoteEnd) => {
      if (!this._remotes.has(data.id)) {
        this._remotes.set(data.id, data)
        this.emit('@remote', data)
        this._sendInfo()
      }
    })
    this.on('_request_', (data: RequestData) => {
      return this._handleRequest(data)
    })
  }

  /**
   * Send a request to the server and returns the reponse payload via Promise.
   *
   * @param name name
   * @param payload payload object.
   * default: `undefined`
   * @param to destination client id to send to
   * default: `undefined`
   * @returns Promise
   */
  async send<T>(
    name: string,
    payload?: Payload,
    to?: string):
    Promise<T> {

    return new Promise<T>((resolve, reject) => {
      try {
        this._send(name, payload, to, (err, resPayload, request) => {
          if (err) {
            return reject(
              new WebSocketerError(
                `${err.message}${this._options.debug ? ` -> ${request.nm}` : ''}`,
                err.code,
                err.payload,
                'RemoteWebSocketerError'
              )
            )
          }
          resolve(resPayload)
        })
      } catch (error: any) {
        reject(new WebSocketerError(error.message))
      }
    })
  }

  /**
   * Listen to a request and send a reply by returning a value.
   * ```js
   * websocketer.listen('name', async (payload) => {
   *   const result = await heavyFunction(payload)
   *   return result
   * })
   * ```
   *
   * @param name name
   * @param listener function listener
   */
  listen<T>(
    name: string,
    listener: Listener<T>) {

    this.on(name, listener)
  }

  /**
   * Remove all specific listeners.
   */
  forget(
    name: string) {

    this.off(name)
  }

  async handleRequest<T>(
    data: RequestData) {

    return this._handleRequest<T>(data)
  }

  endRequestData(
    request: RequestData,
    opt?: {
      error?: any
      payload?: any
      from?: string
      to?: string
    }):
    RequestData {

    // do not change request data if it's already a response
    if (!request.rq) return request
    // update request data
    return {
      ns: request.ns,
      id: request.id,
      nm: request.nm,
      rq: false,
      pl: opt?.payload,
      er: opt?.error,
      fr: opt?.from || (request.rq ? request.to : request.fr) || '',
      to: opt?.to || (request.rq ? request.fr : request.to) || ''
    }
  }

  /**
   * Internal send function using callback.
   *
   * @param name name
   * @param to client id to send to
   * @param payload payload
   * @param response response callback
   */
  private _send(
    name: string,
    payload?: Payload,
    to?: string,
    response?: ResponseHandler) {

    // build request object
    const request: RequestData = {
      ns: this._options.namespace,
      id: generateId(24),
      nm: name,
      rq: true,
      pl: payload,
      fr: this._id,
      to
    }
    // tell server that we need a response
    if (response) request.rs = true
    // socket must be open
    if (this._socket.readyState !== 1) {
      const error = new WebSocketerError(
        'No connection',
        'ERR_WSR_NO_CONNECTION'
      )
      if (response) response(error, undefined, request)
      else throw error
      return
    }
    // send the request
    this._socket.send(JSON.stringify(request))
    // save the request in order to handle response
    if (!response) return
    // attach response function to request object
    request.rs = response
    // add to request pool
    this._requests.set(request.id, request)
    // create a timeout to cleanup the request when reached and throw error
    request.ti = setTimeout(
      () => {
        request.ti = null
        this._requests.delete(request.id)
        response(
          new WebSocketerError(
            'Timeout reached',
            'ERR_WSR_TIMEOUT'
          ),
          undefined,
          request
        )
      },
      1000 * this._options.timeout
    )
  }

  private async _handleRequest<T>(
    data: RequestData):
    Promise<RequestData<T>> {

    try {
      let payload
      // copy request data as reply data to avoid mutation and pollution
      data.socket = this._socket
      // get the listeners
      const listeners = this.listeners(data.nm)
      if (!listeners || !listeners.length) {
        // if no listeners, reply with error
        throw new WebSocketerError(
          'No listener',
          'ERR_WSR_NO_LISTENER'
        )
      }
      // trigger listeners
      for (let i = 0; i < listeners.length; i++) {
        payload = await listeners[i](data.pl, data)
      }
      // end request data
      return this.endRequestData(
        data,
        {
          payload,
          from: this._id,
          to: data.fr
        }
      )
    } catch (error: any) {
      // attach any error and end request data
      return this.endRequestData(
        data,
        {
          error: this._options.errorFilter(
            {
              name: error.name,
              code: error.code || 'ERR_WSR_INTERNAL',
              message: error.message,
              payload: error.payload
            }
          ),
          from: this._id,
          to: data.fr
        }
      )
    }
  }

  private _handleResponse(
    data: RequestData) {

    // get the request object
    const request = this._requests.get(data.id)
    if (!request) return
    // handle the response data
    if (typeof request.rs === 'function') {
      request.rs(
        data.er || null,
        data.pl,
        request
      )
    }
    // delete the request and timeout because it's already handled
    this._requests.delete(request.id)
    clearTimeout(request.ti)
    request.ti = null
  }

  private _sendInfo() {
    // do not send client info if on server side with cluster
    if (!this._cluster) this.send('_remote_', { id: this._id })
  }

}
