import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const PORT = parseInt(process.env.WS_PORT || '8080');

interface Client {
  ws: WebSocket;
  type: string;
  connectedAt: number;
}

const clients: Map<string, Client> = new Map();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      clients: Object.fromEntries(
        [...clients.entries()].map(([id, c]) => [id, c.type])
      ),
    }));
    return;
  }

  // HTTP broadcast endpoint — lets API routes push messages without maintaining WS clients
  if (req.url === '/broadcast' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        const source = msg.source || 'unknown';

        // Route like a normal WS message
        if (source === 'votes') {
          broadcast('agent', msg);
          broadcast('viz', msg);
          broadcast('dashboard', msg);
        } else if (source === 'agent') {
          broadcast('viz', msg);
          broadcast('cv', msg);
          broadcast('dashboard', msg);
        } else if (source === 'cv') {
          broadcast('viz', msg);
          broadcast('dashboard', msg);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const clientType = url.searchParams.get('type') || 'unknown';
  const clientId = `${clientType}-${Date.now()}`;

  clients.set(clientId, { ws, type: clientType, connectedAt: Date.now() });
  console.log(`[WS] Client connected: ${clientId} (${clientType})`);

  ws.on('message', (rawData: Buffer) => {
    try {
      const msg = JSON.parse(rawData.toString());
      const source = msg.source || clientType;

      switch (source) {
        case 'cv':
          // Forward gesture params to viz + dashboard clients
          broadcast('viz', msg);
          broadcast('dashboard', msg);
          break;

        case 'agent':
          // Forward agent decisions to viz + audio + dashboard clients
          broadcast('viz', msg);
          broadcast('cv', msg);
          broadcast('dashboard', msg);
          // Also store latest decision for the API to read
          latestAgentDecision = msg;
          break;

        case 'votes':
          // Forward vote updates to agent, viz, and dashboard
          broadcast('agent', msg);
          broadcast('viz', msg);
          broadcast('dashboard', msg);
          break;

        default:
          console.log(`[WS] Unrouted message from ${source}:`, msg.type);
      }
    } catch (e) {
      console.error('[WS] Invalid message:', e);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`[WS] Client disconnected: ${clientId}`);
  });

  ws.on('error', (err: Error) => {
    console.error(`[WS] Client error (${clientId}):`, err.message);
    clients.delete(clientId);
  });
});

let latestAgentDecision: unknown = null;

function broadcast(targetType: string, msg: unknown) {
  const payload = typeof msg === 'string' ? msg : JSON.stringify(msg);
  let sent = 0;
  for (const [, client] of clients) {
    if (client.type === targetType && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
      sent++;
    }
  }
  return sent;
}

server.listen(PORT, () => {
  console.log(`[WS Server] Running on ws://localhost:${PORT}`);
  console.log(`[WS Server] Health check: http://localhost:${PORT}/health`);
});
