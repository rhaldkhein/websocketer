import WebSocket, { WebSocketServer } from 'ws'
import WebSocketer from '../src/WebSocketer'

let wss: WebSocketServer
let wsserver: WebSocket | undefined
let wsclient: WebSocket | undefined

async function init() {
  wss = new WebSocketServer({ port: 3000 })
  return new Promise((resolve, reject) => {
    wss.on('connection', ws => {
      console.log('wss connection')
      wsserver = ws
    })
    wss.on('listening', () => {
      console.log('wss listening')
      wsclient = new WebSocket('ws://localhost:3000')
      wsclient.on('open', () => {
        resolve(undefined)
      })
    })
    wss.on('close', () => {
      console.log('wss close')
    })
  })
}

async function pause(sec: number) {
  return new Promise(resolve => setTimeout(resolve, sec * 1000))
}

export async function start() {
  await init()
  const wsrServer = new WebSocketer(wsserver)
  const wsrClient = new WebSocketer(wsclient)

  await pause(6)
  wsrClient.destroy()
  wsrServer.destroy()

  wss.close()
  wsserver?.close()
  wsclient?.close()
}
