# websocketer
Simple and easy message passing for WebSocket

### Usage

```js
import { WebSocketer } from 'websocketer'

// server
const server = new WebSocketer(socket)
server.listen('hello', async (data, reply) => {
  // data is { nice: 1 }
  const result = await heavyFunction(data)
  // suppose result is { hello: 'world' }
  reply(result)
})


// client
const client = new WebSocketer(socket)
const data = await client.send('hello', { nice: 1 })
// data is { hello: 'world' }
```
