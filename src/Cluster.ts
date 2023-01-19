import Client, { RequestData } from './Client'

export interface ClusterOptions {
  origin: string | string[]
}

export interface Cluster {

  destroy(): void
  handleRequest<T>(request: RequestData): Promise<RequestData<T>>
  register(client: Client): void
  unregister(client: Client): void

}
