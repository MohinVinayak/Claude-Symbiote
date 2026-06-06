const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 7429 });

console.log('[Test Server] WebSocket relay listening on ws://127.0.0.1:7429');

wss.on('connection', function connection(ws) {
  console.log('[Test Server] New client connected');
  
  ws.on('message', function message(data) {
    const text = data.toString();
    console.log('[Test Server] Received:', text);
    
    // Broadcast to everyone else
    wss.clients.forEach(function each(client) {
      if (client !== ws && client.readyState === 1) { // 1 is WebSocket.OPEN
        client.send(text);
      }
    });
  });

  ws.on('close', () => {
    console.log('[Test Server] Client disconnected');
  });
});
