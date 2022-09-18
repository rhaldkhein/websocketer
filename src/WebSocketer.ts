import { nanoid } from 'nanoid'

export type TPayload = any

export type TReply = (
  payload?: TPayload,
  error?: WebSocketerError) => void

export type TListener<T = TPayload> = (
  payload: T,
  replay: TReply,
  request: IRequest) => void

export type TResponseHandler = (
  error: WebSocketerError | null,
  payload: TPayload,
  request: IRequest) => void

export interface IRequest<T = any> {
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
  rs?: true | TResponseHandler
  /** timeout id */
  ti?: any
  /** local data space */
  locals?: Record<string, any>
}

export interface IOptions {
  namespace: string
  timeout: number
  errorFilter: (err: WebSocketerError) => WebSocketerError
}

export class WebSocketerError extends Error {
  code: string
  constructor(message: string, code?: string) {
    super(message || 'Something went wrong')
    this.code = code || 'ERR_WSR_UNKNOWN'
  }
}

export default class WebSocketer {

  private _options: IOptions
  private _socket: any
  private _requests = new Map<string, IRequest>()
  private _listeners = new Map<string, TListener[]>()
  private _messageHandler: (e: any) => Promise<void>

  /**
   * WebSocketer
   * @param socket WebSocket instance to wrap
   * @param opt.namespace custom message namespace to avoid conflict.
   * default: "websocketer"
   * @param opt.timeout custom request timeout.
   * default: 60 (seconds)
   */
  constructor(
    socket: any,
    options?: Partial<IOptions>) {

    options = options || {}
    options.errorFilter = options.errorFilter || (err => err)
    options.namespace = options.namespace || 'websocketer'
    options.timeout = options.timeout || 60

    this._socket = socket
    this._options = options as IOptions

    socket.addEventListener('message', this._messageHandler = async (e: any) => {
      let data: IRequest
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
   * Send a request to the server and returns the reponse payload via Promise.
   * @param name name
   * @param payload payload
   * @returns Promise
   */
  async send<T>(
    name: string,
    payload?: TPayload) {

    return new Promise<T>((resolve, reject) => {
      try {
        this._send(name, payload, (err, resPayload) => {
          if (err) return reject(new WebSocketerError(err.message, err.code))
          resolve(resPayload)
        })
      } catch (error: any) {
        reject(new WebSocketerError(error.message))
      }
    })
  }

  /**
   * Listens to a request and send a reply by calling `reply` function passed
   * into the listener.
   * ```js
   * websocketer.listen('name', async (payload, reply) => {
   *   const result = await heavyFunction(payload)
   *   reply(result)
   * })
   * ```
   * @param name name
   * @param listener function listener
   */
  listen<T>(
    name: string,
    listener: TListener<T>) {

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
    this._requests.clear()
    this._listeners.clear()
    // @ts-ignore
    this._socket = null
  }

  /**
   * Internal send function using callback.
   * @param name name
   * @param payload payload
   * @param response response callback
   */
  private _send(
    name: string,
    payload?: TPayload,
    response?: TResponseHandler) {

    // build request object
    const request: IRequest = {
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

  private async _handleRequest(data: IRequest) {
    // create replay function to be passed to listeners
    const reply: TReply = (payload, error) => {
      if (!data.rs) {
        throw new WebSocketerError(
          `Too many reply for "${data.nm}"`,
          'ERR_WSR_TOO_MANY_REPLY'
        )
      }
      // copy data to avoid mutation and pollution
      const replayData: IRequest = {
        ns: data.ns,
        id: data.id,
        nm: data.nm,
        rq: data.rq,
        er: data.er,
        pl: data.pl,
        rs: data.rs,
        ti: data.ti
      }
      // flag data as response (not request)
      replayData.rq = false
      // attach payload
      replayData.pl = payload
      // attach error if provided
      if (error) {
        replayData.er = {
          name: error.name,
          code: error.code,
          message: error.message
        } as any
      }
      // dispatch data
      this._socket.send(JSON.stringify(replayData))
      // reset response flag to avoid multiple reply
      data.rs = undefined
    }
    // get the listeners
    const listeners = this._listeners.get(data.nm)
    if (!listeners || !listeners.length) {
      // if no listeners, reply with error
      reply(
        undefined,
        new WebSocketerError(
          `No listener for "${data.nm}"`,
          'ERR_WSR_NO_LISTENER'
        )
      )
      return
    }
    // trigger the listeners
    try {
      for (let i = 0; i < listeners.length; i++) {
        const ret: any = listeners[i](data.pl, reply, data)
        if (ret instanceof Promise) await ret
      }
      // if reply is not called, reply with error
      if (data.rs) {
        reply(
          undefined,
          new WebSocketerError(
            `No reply for "${data.nm}"`,
            'ERR_WSR_NO_REPLY'
          )
        )
      }
    } catch (error: any) {
      // handle error and reply with error
      if (error.code === 'ERR_WSR_TOO_MANY_REPLY') throw error
      if (!data.rs) return
      if (error instanceof WebSocketerError) {
        reply(undefined, error)
      } else {
        reply(
          undefined,
          this._options.errorFilter(
            new WebSocketerError(error.message, error.code)
          )
        )
      }
    }
  }

  private _handleResponse(data: IRequest) {
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
  }

}
