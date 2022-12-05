import WebSocket, { WebSocketServer } from 'ws'
import WebSocketer from '../src/WebSocketer'

let wss: WebSocketServer = new WebSocketServer({ port: 5000 })
let wsserver: WebSocket | undefined
let wsclient: WebSocket | undefined

async function init() {
  return new Promise((resolve, reject) => {
    wss.on('connection', ws => {
      wsserver = ws
    })
    wss.on('listening', () => {
      wsclient = new WebSocket('ws://localhost:5000')
      wsclient.on('open', () => {
        resolve(undefined)
      })
    })
  })
}

async function pause(sec: number) {
  return new Promise(resolve => setTimeout(resolve, sec * 1000))
}

async function start() {
  await init()
  const wsrServer = new WebSocketer(wsserver)
  const wsrClient = new WebSocketer(wsclient, { ping: 2 })
  await pause(6)
  wsrClient.destroy()
  wsrServer.destroy()
  wss.close()
  wsserver?.close()
  wsclient?.close()
}

start()
