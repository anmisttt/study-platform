type Listener = ((event: unknown) => void) | null;

/**
 * Minimal controllable WebSocket stand-in for hook tests. Instances are
 * recorded so tests can drive the connection lifecycle (open/message/close)
 * and inspect what the hook sent.
 */
export class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readonly CONNECTING = MockWebSocket.CONNECTING;
  readonly OPEN = MockWebSocket.OPEN;
  readonly CLOSING = MockWebSocket.CLOSING;
  readonly CLOSED = MockWebSocket.CLOSED;

  readonly url: string;
  readyState: number = MockWebSocket.CONNECTING;
  readonly sent: string[] = [];

  onopen: Listener = null;
  onmessage: Listener = null;
  onclose: Listener = null;
  onerror: Listener = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ type: "close" });
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({ type: "open" });
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data });
  }

  simulateServerClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ type: "close" });
  }

  /** Parsed messages the hook sent to the server. */
  sentMessages(): Array<Record<string, unknown>> {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
  }

  sentMessagesOfType(type: string): Array<Record<string, unknown>> {
    return this.sentMessages().filter((message) => message.type === type);
  }
}

export function installMockWebSocket(): void {
  MockWebSocket.instances = [];
  (globalThis as { WebSocket: unknown }).WebSocket = MockWebSocket;
}

export function latestMockWebSocket(): MockWebSocket {
  const instance = MockWebSocket.instances.at(-1);
  if (!instance) {
    throw new Error("No MockWebSocket instance was created.");
  }
  return instance;
}
