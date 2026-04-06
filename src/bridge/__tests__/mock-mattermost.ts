/**
 * Mock Mattermost server for integration testing.
 * Emulates REST API v4 + WebSocket just enough to test the bridge.
 */
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const BOT_USER_ID = 'bot-test-id';
const BOT_USERNAME = 'test-bot';
const OWNER_USER_ID = 'test-owner-id';

export interface ReceivedPost {
  channel_id: string;
  message: string;
  root_id: string;
}

export class MockMattermost {
  private server: http.Server;
  private wss: WebSocketServer;
  private wsClients: WebSocket[] = [];
  /** Posts created by the bridge (replies) */
  postedMessages: ReceivedPost[] = [];
  /** Reactions added by the bridge */
  reactions: { post_id: string; emoji_name: string }[] = [];
  port = 0;

  constructor() {
    this.server = http.createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('connection', (ws) => {
      this.wsClients.push(ws);
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        // Auth challenge → reply OK
        if (msg.action === 'authentication_challenge') {
          ws.send(JSON.stringify({ status: 'OK', seq_reply: msg.seq }));
        }
      });
    });
  }

  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(0, () => {
        const addr = this.server.address() as { port: number };
        this.port = addr.port;
        resolve(this.port);
      });
    });
  }

  async stop(): Promise<void> {
    for (const ws of this.wsClients) ws.close();
    this.wss.close();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  /** Simulate a user posting a message via WebSocket event. */
  simulatePost(message: string, opts?: { userId?: string; channelId?: string; senderName?: string; rootId?: string }): void {
    const post = {
      id: `post-${Date.now()}`,
      user_id: opts?.userId ?? OWNER_USER_ID,
      channel_id: opts?.channelId ?? 'test-channel',
      message,
      root_id: opts?.rootId ?? '',
      type: '',
      create_at: Date.now(),
    };
    const event = {
      event: 'posted',
      data: {
        post: JSON.stringify(post),
        channel_type: 'D',
        sender_name: opts?.senderName ?? 'benjamin-chalande',
      },
      seq: Date.now(),
    };
    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    }
  }

  get url(): string {
    return `http://localhost:${this.port}`;
  }

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const path = req.url ?? '';

      // GET /api/v4/users/me
      if (req.method === 'GET' && path === '/api/v4/users/me') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: BOT_USER_ID, username: BOT_USERNAME }));
        return;
      }

      // POST /api/v4/posts
      if (req.method === 'POST' && path === '/api/v4/posts') {
        const data = JSON.parse(body);
        this.postedMessages.push({
          channel_id: data.channel_id,
          message: data.message,
          root_id: data.root_id ?? '',
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: `reply-${Date.now()}`, ...data }));
        return;
      }

      // POST /api/v4/reactions
      if (req.method === 'POST' && path === '/api/v4/reactions') {
        const data = JSON.parse(body);
        this.reactions.push({ post_id: data.post_id, emoji_name: data.emoji_name });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }

      // DELETE reactions
      if (req.method === 'DELETE' && path.includes('/reactions/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }

      // Default 404
      res.writeHead(404);
      res.end('Not found');
    });
  }
}

export { BOT_USER_ID, BOT_USERNAME, OWNER_USER_ID };
