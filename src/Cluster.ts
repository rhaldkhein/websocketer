import type { WebSocketServer } from 'ws'
import type { RequestData } from './WebSocketer'

export interface ClusterOptions {
  origin: string | string[]
  server: WebSocketServer
}

export interface Cluster {

  destroy(): void
  send<T>(request: RequestData): Promise<T>

}
