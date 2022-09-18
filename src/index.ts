import WebSocketer, { IOptions } from './WebSocketer'
export * from './WebSocketer'

export default function createWebSocketer(
  socket: any,
  options?: Partial<IOptions>) {

  return new WebSocketer(socket, options)
}
