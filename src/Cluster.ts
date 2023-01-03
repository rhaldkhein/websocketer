import type WebSocketer from './WebSocketer'
import type { RequestData } from './WebSocketer'

export interface ClusterOptions {
  origin: string | string[]
}

export interface Cluster {

  socketer: WebSocketer
  socketers: Set<WebSocketer>

  destroy(): void
  handleRequest<T>(request: RequestData): Promise<RequestData<T>>
  register(socketer: WebSocketer): void
  unregister(socketer: WebSocketer): void

}
