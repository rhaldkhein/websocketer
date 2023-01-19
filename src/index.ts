import WebSocketer, { Options } from './WebSocketer'
export * from './WebSocketer'
export * from './Cluster'
export * from './utils/id'

function createWebSocketer(
  socket: any,
  options?: Partial<Options>) {

  return new WebSocketer(socket, options)
}

export {
  WebSocketer,
  createWebSocketer
}
