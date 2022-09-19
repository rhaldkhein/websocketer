import WebSocketer, { Options } from './WebSocketer.js'
export * from './WebSocketer.js'

export { WebSocketer }
export default function createWebSocketer(
  socket: any,
  options?: Partial<Options>) {

  return new WebSocketer(socket, options)
}
