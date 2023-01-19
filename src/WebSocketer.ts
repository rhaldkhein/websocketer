import Client, { Options as OptionsBase, RequestData } from './Client'
import { Cluster } from './Cluster'

export interface WebSocketerOptions extends OptionsBase {
  ping: number
}

/**
 * WebSocketer class
 */
export default class WebSocketer<
  T1 = any,
  T2 extends Cluster = any>
  extends Client<WebSocketerOptions, T1, T2> {

  private _pingIntervalId: any
  private _messageHandler: (e: any) => Promise<void>
  private _openHandler: () => void = () => undefined

  constructor(
    socket: T1,
    options?: Partial<WebSocketerOptions>) {

    options = options || {}
    super(socket, options)
    this._options.ping = options.ping || 0

    // trigger interval pings
    if (this._options.ping) {
      this._pingIntervalId = setInterval(
        async () => {
          try {
            await this.request('_ping_')
          } catch (error) {
            // do nothing
          }
        },
        1000 * this._options.ping
      )
    }
    const client = this._client as any
    client.addEventListener(
      'message',
      this._messageHandler = async (e: any) => {
        let data: RequestData
        try {
          data = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString())
        } catch (error) {
          data = { ns: '', id: '', nm: '', fr: '', rq: false }
        }
        await this.handleMessage(data)
      }
    )

    // share client info to remote end
    if (client.readyState === 1) {
      this._sendInfo()
    } else {
      client.addEventListener(
        'open',
        this._openHandler = () => {
          this._sendInfo()
        }
      )
    }

  }

  destroy(): void {
    const client = this._client as any
    client.removeEventListener('open', this._openHandler)
    client.removeEventListener('message', this._messageHandler)
    clearInterval(this._pingIntervalId)
    super.destroy()
  }

  clear(): void {
    super.clear()
    this.on('_ping_', (data) => data)
  }

  protected _send(
    message: RequestData):
    void {

    (this._client as any).send(JSON.stringify(message))
  }

}
