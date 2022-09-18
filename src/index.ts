import WebSocketer, { Options } from './WebSocketer'
export * from './WebSocketer'

export { WebSocketer }
export default function createWebSocketer(
  socket: any,
  options?: Partial<Options>) {

  return new WebSocketer(socket, options)
}
