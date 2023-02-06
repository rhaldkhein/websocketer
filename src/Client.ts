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
  /** is forwarded to cluster */
  ic?: boolean
  /** local data space */
  locals?: Record<string, any>
  /** attached client */
  client?: any
}

export interface RemoteEnd {
  id: string
}

export interface Options {
  id: string
  namespace: string
  timeout: number
  errorFilter: (err: WebSocketerError) => WebSocketerError
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

export interface RequestOptions {
  noReply?: boolean
}

export interface RequestManyOptions {
  continue?: boolean
  noReply?: boolean
}

/**
 * A client class
 */
export default abstract class Client<
  T0 extends Options = any,
  T1 = any,
  T2 extends Cluster = any>
  extends EventEmitter {

  protected _options: T0
  protected _requests = new Map<string, RequestData>()
  protected _id: string
  protected _remotes = new Map<string, RemoteEnd>()
  protected _client: T1
  protected _cluster?: T2

  /**
   * Create a WebSocketer instance.
   *
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
    client: T1,
    options?: Partial<Options>) {

    super()
    options = options || {} as Options
    options.errorFilter = options.errorFilter || (err => err)
    options.namespace = options.namespace || 'websocketer'
    options.timeout = options.timeout || 60
    options.id = options.id || generateId(24)
    this._id = options.id
    this._client = client
    this._cluster = options.cluster as T2
    this._options = options as T0
    this.clear()
    this._cluster?.register(this)
    this._sendInfo()
  }

  /**
   * Remote end client information.
   */
  get options() {
    return this._remotes
  }

  /**
   * Id of this instance.
   */
  get id() {
    return this._id
  }

  /**
   * Remote end client information.
   */
  get remotes() {
    return this._remotes
  }

  /**
   * Client
   */
  get client() {
    return this._client
  }

  /**
   * Linked cluster
   */
  get cluster() {
    return this._cluster
  }

  /**
   * Disconnect and remove all listeners, requests, timeouts, and everything.
   */
  destroy() {
    this._cluster?.unregister(this)
    this.clear()
    this.removeAllListeners()
  }

  /**
   * Remove all listeners and requests and add default listeners.
   */
  clear() {
    this._requests.forEach(data => clearTimeout(data.ti))
    this._requests.clear()
    this._remotes.clear()
    this.removeAllListeners()
    this.on('_remote_', (data: RemoteEnd) => {
      if (!this._remotes.has(data.id)) {
        this._remotes.set(data.id, data)
        this.emit('@remote', data)
        this._sendInfo()
      }
    })
    this.on('_request_', (data: RequestData) => {
      return this.handleMessage(data)
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
  async request<T>(
    name: string,
    payload?: Payload,
    to?: string,
    opt?: RequestOptions):
    Promise<T> {

    if (to) {
      const replies = await this.requestMany(name, payload, [to], {
        noReply: opt?.noReply,
        continue: true
      }) as T[]
      const reply = replies.find((v: any) => {
        return v && v.name !== this._options.namespace + '_error'
      })
      if (!reply) throw new WebSocketerError('No response', 'ERR_WSR_NO_RESPONSE')
      return reply
    }
    return this._request(name, payload, to, opt)
  }

  async requestMany(
    name: string,
    payload: Payload,
    to: string[],
    opt?: RequestManyOptions) {

    const results = await Promise.allSettled(
      to.map(id => this._request(name, payload, id, { noReply: opt?.noReply }))
    )
    return results.map(result => {
      if (result.status === 'rejected') {
        if (!opt?.continue) {
          throw result.reason
        } else {
          return {
            name: this._options.namespace + '_error',
            error: result.reason
          }
        }
      }
      // @ts-ignore
      return result.value
    })
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
   * This method handles a message from client itself or from cluster.
   */
  async handleMessage(
    data: RequestData) {

    // process data
    if (data.ns !== this._options.namespace) return
    // a request or a response?
    if (data.rq) {
      // if got destination id and cluster instance, then forward to cluster
      if (this._cluster && !data.ic && data.to) {
        data.ic = true
        this._cluster?.handleRequest(data)
      } else {
        return this.handleRequest(data)
      }
    } else {
      this.handleResponse(data)
    }
    return undefined
  }

  async handleRequest<T>(
    data: RequestData):
    Promise<RequestData<T>> {

    try {
      let payload
      // copy request data as reply data to avoid mutation and pollution
      data.client = this._client
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

  handleResponse(
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

  protected abstract _send(
    message: RequestData):
    void

  protected _sendInfo() {
    // do not send client info if on server side with cluster
    if (!this._cluster) this.request('_remote_', { id: this._id })
  }

  private async _request<T>(
    name: string,
    payload?: Payload,
    to?: string,
    opt?: RequestOptions):
    Promise<T> {

    return new Promise<T>((resolve, reject) => {
      try {
        if (opt?.noReply) {
          this._dispatch(name, payload, to)
          resolve(undefined as T)
        } else {
          this._dispatch(name, payload, to, (err, resPayload, request) => {
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
        }
      } catch (error: any) {
        reject(new WebSocketerError(error.message))
      }
    })
  }

  /**
   * Internal send function using callback.
   *
   * @param name name
   * @param to client id to send to
   * @param payload payload
   * @param response response callback
   */
  private _dispatch(
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
    // send the request
    if (to && this._cluster) {
      this.handleMessage(request)
    } else {
      this._send(request)
    }
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

}
