export declare class FrameError extends Error {
}
/** One message as one frame. */
export declare function encodeFrame(message: unknown): Uint8Array;
/** The message of one whole frame. Throws FrameError for anything that is not one. */
export declare function decodeFrame(frame: Uint8Array): unknown;
/**
 * Splits a byte stream into frames: push() the bytes as they arrive (in chunks of any size); it returns
 * the messages completed so far, in order.
 */
export declare class FrameReader {
    private chunks;
    private buffered;
    push(chunk: Uint8Array): unknown[];
    private peek;
    private take;
}
