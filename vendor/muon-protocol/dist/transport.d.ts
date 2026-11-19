export interface Transport {
    /** Sends a message. `transfer`: buffers to move rather than copy (ignored by byte streams). */
    send(message: unknown, transfer?: readonly ArrayBuffer[]): void;
    /**
     * Receives messages; `onClose` is called once when the other end goes away or fails (with the error).
     * Returns a function that stops listening.
     */
    listen(onMessage: (message: unknown) => void, onClose?: (error?: Error) => void): () => void;
    /** Ends the transport (terminates a worker the client started, closes a socket). */
    close(): void;
}
/** What the endpoints' events carry (a MessageEvent, an ErrorEvent): structural, so no DOM types are needed. */
export interface EndpointEvent {
    readonly type: string;
    readonly data?: unknown;
    readonly message?: string;
}
/** A Web Worker, a MessagePort, or a DedicatedWorkerGlobalScope. */
export interface PostMessageEndpoint {
    postMessage(message: unknown, transfer: ArrayBuffer[]): void;
    addEventListener(type: string, listener: (event: EndpointEvent) => void): void;
    removeEventListener(type: string, listener: (event: EndpointEvent) => void): void;
    terminate?(): void;
    close?(): void;
    start?(): void;
}
export declare function workerTransport(endpoint: PostMessageEndpoint): Transport;
/** A Node worker_threads Worker, MessagePort or parentPort (EventEmitter style). */
export interface NodeMessageEndpoint {
    postMessage(message: unknown, transferList?: readonly ArrayBuffer[]): void;
    on(event: 'message', listener: (message: unknown) => void): unknown;
    on(event: 'error', listener: (error: Error) => void): unknown;
    on(event: 'exit', listener: (code: number) => void): unknown;
    off(event: string, listener: (...args: never[]) => void): unknown;
    terminate?(): unknown;
    close?(): unknown;
}
export declare function nodeWorkerTransport(endpoint: NodeMessageEndpoint): Transport;
/** Anything that carries bytes both ways. */
export interface ByteChannel {
    write(bytes: Uint8Array): void;
    /** Receives bytes in chunks of any size (a WebSocket message may hold one or more frames). */
    onBytes(listener: (bytes: Uint8Array) => void): () => void;
    onClose?(listener: (error?: Error) => void): () => void;
    close(): void;
}
export declare function byteStreamTransport(channel: ByteChannel): Transport;
/** A WebSocket (browser, or Node >= 22), structurally. */
export interface WebSocketLike {
    binaryType: string;
    send(data: Uint8Array): void;
    addEventListener(type: string, listener: (event: {
        readonly data?: unknown;
        readonly code?: number;
        readonly reason?: string;
    }) => void): void;
    removeEventListener(type: string, listener: (event: {
        readonly data?: unknown;
        readonly code?: number;
        readonly reason?: string;
    }) => void): void;
    close(code?: number): void;
}
/** A WebSocket as a byte channel: binary messages, each one or more frames. */
export declare function webSocketChannel(socket: WebSocketLike): ByteChannel;
/** Two connected in-memory byte channels (tests, and a host in the same process). */
export declare function byteChannelPair(): [ByteChannel, ByteChannel];
