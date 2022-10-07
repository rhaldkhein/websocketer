import WebSocketer, { Options } from './WebSocketer'
export * from './WebSocketer'

function createWebSocketer(
  socket: any,
  options?: Partial<Options>) {

  return new WebSocketer(socket, options)
}

export {
  WebSocketer,
  createWebSocketer
}
