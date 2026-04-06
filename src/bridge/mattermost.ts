import WebSocket from 'ws';

export interface Post {
  id: string;
  user_id: string;
  channel_id: string;
  message: string;
  root_id: string;
  type: string;
  create_at: number;
}

export interface PostedEvent {
  post: Post;
  channel_type: string; // "D" (DM), "O" (open), "P" (private), "G" (group)
  sender_name: string;
}

export type EventHandler = (event: PostedEvent) => void;

export class MattermostClient {
  private ws: WebSocket | null = null;
  private seq = 0;
  private reconnectBackoff = 1000;
  private shouldReconnect = true;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private url: string,
    private token: string,
  ) {}

  /** Bot user info (fetched on connect) */
  botUserId = '';
  botUsername = '';

  async connect(onPost: EventHandler): Promise<void> {
    // Fetch bot identity
    const me = await this.api<{ id: string; username: string }>('/api/v4/users/me');
    this.botUserId = me.id;
    this.botUsername = me.username;
    console.log(`[mm] Bot: @${this.botUsername} (${this.botUserId})`);

    this.shouldReconnect = true;
    await this.connectWs(onPost);
  }

  private async connectWs(onPost: EventHandler): Promise<void> {
    const wsUrl = this.url.replace(/^http/, 'ws') + '/api/v4/websocket';

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.on('open', () => {
        // Authenticate
        this.seq++;
        ws.send(JSON.stringify({
          seq: this.seq,
          action: 'authentication_challenge',
          data: { token: this.token },
        }));
      });

      let authenticated = false;

      ws.on('message', (data) => {
        let msg: any;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return; // Invalid JSON from server — skip
        }

        // Handle auth response
        if (!authenticated && msg.seq_reply) {
          if (msg.status === 'OK') {
            authenticated = true;
            this.reconnectBackoff = 1000;
            console.log('[mm] WebSocket authenticated');
            // Ping every 15s to keep the connection alive
            this.pingInterval = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
              }
            }, 15_000);
            resolve();
          } else {
            reject(new Error(`Auth failed: ${msg.error?.message ?? 'unknown'}`));
          }
          return;
        }

        // Handle posted events
        if (msg.event === 'posted' && msg.data?.post) {
          try {
            const post: Post = JSON.parse(msg.data.post);
            const event: PostedEvent = {
              post,
              channel_type: msg.data.channel_type,
              sender_name: msg.data.sender_name,
            };
            onPost(event);
          } catch (e) {
            console.error('[mm] Failed to parse posted event:', e);
          }
        }
      });

      ws.on('close', () => {
        console.log('[mm] WebSocket disconnected');
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        if (this.shouldReconnect) {
          setTimeout(() => {
            console.log(`[mm] Reconnecting (backoff: ${this.reconnectBackoff}ms)...`);
            this.connectWs(onPost).catch(console.error);
            this.reconnectBackoff = Math.min(this.reconnectBackoff * 2, 30000);
          }, this.reconnectBackoff);
        }
      });

      ws.on('error', (err) => {
        console.error('[mm] WebSocket error:', err.message);
      });
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  async createPost(channelId: string, message: string, rootId?: string): Promise<Post> {
    return this.api<Post>('/api/v4/posts', {
      method: 'POST',
      body: { channel_id: channelId, message, root_id: rootId ?? '' },
    });
  }

  async updatePost(postId: string, message: string): Promise<void> {
    await this.api(`/api/v4/posts/${postId}`, {
      method: 'PUT',
      body: { id: postId, message },
    });
  }

  async deletePost(postId: string): Promise<void> {
    await this.api(`/api/v4/posts/${postId}`, { method: 'DELETE' });
  }

  async addReaction(postId: string, emojiName: string): Promise<void> {
    await this.api('/api/v4/reactions', {
      method: 'POST',
      body: { user_id: this.botUserId, post_id: postId, emoji_name: emojiName },
    });
  }

  async removeReaction(postId: string, emojiName: string): Promise<void> {
    await this.api(`/api/v4/users/${this.botUserId}/posts/${postId}/reactions/${emojiName}`, {
      method: 'DELETE',
    });
  }

  /** Send typing indicator via WebSocket. */
  sendTyping(channelId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.seq++;
      this.ws.send(JSON.stringify({
        action: 'user_typing',
        seq: this.seq,
        data: { channel_id: channelId, parent_id: '' },
      }));
    }
  }

  async api<T = unknown>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
    const resp = await fetch(`${this.url}${path}`, {
      method: opts?.method ?? 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`MM API ${resp.status}: ${text.slice(0, 500)}`);
    }

    if (resp.status === 204) return undefined as T;
    return resp.json() as Promise<T>;
  }
}
