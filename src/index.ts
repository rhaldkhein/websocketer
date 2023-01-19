import Client from './Client'
import WebSocketer, { WebSocketerOptions } from './WebSocketer'
export * from './WebSocketer'
export * from './Client'
export * from './Cluster'
export * from './utils/id'

function createWebSocketer(
  socket: any,
  options?: Partial<WebSocketerOptions>) {

  return new WebSocketer(socket, options)
}

export {
  Client,
  WebSocketer,
  createWebSocketer
}
