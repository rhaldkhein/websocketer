import type WebSocketer from './WebSocketer'
import type { RequestData } from './WebSocketer'

export interface ClusterOptions {
  origin: string | string[]
}

export interface Cluster {

  destroy(): void
  send<T>(request: RequestData): Promise<T>
  register(socketer: WebSocketer): void
  unregister(socketer: WebSocketer): void

}
