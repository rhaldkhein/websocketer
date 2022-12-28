import WebSocketer, { Options } from './WebSocketer'
export * from './WebSocketer'
export * from './Cluster'

function createWebSocketer(
  socket: any,
  options?: Partial<Options>) {

  return new WebSocketer(socket, options)
}

export {
  WebSocketer,
  createWebSocketer
}
