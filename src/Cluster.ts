import Client, { RequestData } from './Client'

export interface ClusterOptions {
  origin: string | string[]
}

export interface Cluster {

  destroy(): void
  handleRequest(request: RequestData): void
  register(client: Client): void
  unregister(client: Client): void

}
