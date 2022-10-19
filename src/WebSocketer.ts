import { nanoid } from 'nanoid'

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

export interface Options {
  namespace: string
  timeout: number
  errorFilter: (err: WebSocketerError) => WebSocketerError
}

export class WebSocketerError extends Error {
  code: string
  payload: any
  constructor(message: string, code?: string, payload?: any) {
    super(message || 'Something went wrong')
    this.code = code || 'ERR_WSR_UNKNOWN'
    this.payload = payload
  }
}

/**
 * WebSocketer class
 */
export default class WebSocketer {

  private _options: Options
  private _socket: any
  private _requests = new Map<string, RequestData>()
  private _listeners = new Map<string, Listener[]>()
  private _messageHandler: (e: any) => Promise<void>

  /**
   * Create a WebSocketer instance.
   *
   * @param socket WebSocket instance to wrap
   * @param opt.namespace custom message namespace to avoid conflict.
   * default: "websocketer"
   * @param opt.timeout custom request timeout.
   * default: 60 (seconds)
   */
  constructor(
    socket: any,
    options?: Partial<Options>) {

    options = options || {}
    options.errorFilter = options.errorFilter || (err => err)
    options.namespace = options.namespace || 'websocketer'
    options.timeout = options.timeout || 60

    this._socket = socket
    this._options = options as Options

    socket.addEventListener('message', this._messageHandler = async (e: any) => {
      let data: RequestData
      // parse data
      try {
        data = JSON.parse(
          typeof e.data === 'string' ? e.data : e.data.toString()
        )
      } catch (error) {
        data = { ns: '', id: '', nm: '', rq: false }
      }
      // process data
      if (data.ns !== this._options.namespace) return
      // a request or a response?
      if (data.rq) await this._handleRequest(data)
      else this._handleResponse(data)
    })
  }

  /**
   * Expose the wrapped socket.
   */
  get socket() {
    return this._socket
  }

  /**
   * Return all listeners of specific name
   */
  getListeners(
    name: string) {

    return this._listeners.get(name)
  }

  /**
   * Send a request to the server and returns the reponse payload via Promise.
   *
   * @param name name
   * @param payload payload
   * @returns Promise
   */
  async send<T>(
    name: string,
    payload?: Payload) {

    return new Promise<T>((resolve, reject) => {
      try {
        this._send(name, payload, (err, resPayload) => {
          if (err) {
            return reject(
              new WebSocketerError(
                err.message,
                err.code,
                err.payload
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
   * Listens to a request and send a reply by returning a value.
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

    let listeners = this._listeners.get(name)
    if (!listeners) {
      listeners = []
      this._listeners.set(name, listeners)
    }
    listeners.push(listener)
  }

  /**
   * Removes listeners and requests.
   */
  destroy() {
    this._socket.removeEventListener('message', this._messageHandler)
    this._requests.forEach(data => clearTimeout(data.ti))
    this._requests.clear()
    this._listeners.clear()
    // @ts-ignore
    this._socket = null
  }

  /**
   * Internal send function using callback.
   *
   * @param name name
   * @param payload payload
   * @param response response callback
   */
  private _send(
    name: string,
    payload?: Payload,
    response?: ResponseHandler) {

    // build request object
    const request: RequestData = {
      ns: this._options.namespace,
      id: nanoid(24),
      nm: name,
      rq: true,
      pl: payload
    }
    // tell server that we need a response
    if (response) request.rs = true
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
            `Timeout reached for "${name}"`,
            'ERR_WSR_TIMEOUT'
          ),
          undefined,
          request
        )
      },
      1000 * this._options.timeout
    )
  }

  private async _handleRequest(data: RequestData) {
    // copy request data as reply data to avoid mutation and pollution
    let _payload
    let _error
    data.socket = this._socket
    try {
      // get the listeners
      const listeners = this._listeners.get(data.nm)
      if (!listeners || !listeners.length) {
        // if no listeners, reply with error
        throw new WebSocketerError(
          `No listener for "${data.nm}"`,
          'ERR_WSR_NO_LISTENER'
        )
      }
      // trigger listeners
      let result: any
      for (let i = 0; i < listeners.length; i++) {
        const reply: any = listeners[i](data.pl, data)
        if (reply !== undefined) {
          result = reply instanceof Promise ? await reply : reply
        }
      }
      // attach payload
      _payload = result
    } catch (error: any) {
      // attach error
      _error = this._options.errorFilter(
        {
          name: error.name,
          code: error.code || 'ERR_WSR_INTERNAL',
          message: error.message,
          payload: error.payload
        }
      )
    }
    // dispatch data
    const replyData: RequestData = {
      ns: data.ns,
      id: data.id,
      nm: data.nm,
      rq: false,
      pl: _payload,
      er: _error
    }
    this._socket.send(JSON.stringify(replyData))
  }

  private _handleResponse(data: RequestData) {
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

}
