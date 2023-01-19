import type { RequestData, Client } from './WebSocketer'

export interface ClusterOptions {
  origin: string | string[]
}

export interface Cluster {

  destroy(): void
  handleRequest<T>(request: RequestData): Promise<RequestData<T>>
  register(socketer: Client): void
  unregister(socketer: Client): void

}
