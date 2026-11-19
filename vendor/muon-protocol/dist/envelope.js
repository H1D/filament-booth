/** The protocol these types describe. */
export const PROTOCOL = { major: 2, minor: 4 };
/** Engine error codes 1-8; negative codes are OrcaSlicer's CLI exit codes, passed through (see EngineError). */
export const ErrorCode = {
    /** The engine crashed (a wasm trap or abort). The host is 'fatal' afterwards. */
    Internal: 1,
    /** The engine ran out of memory. The host is 'fatal' afterwards. */
    OutOfMemory: 2,
    /** The request was cancelled before it finished. */
    Cancelled: 3,
    /** Unknown op, or an op or field this host does not support. */
    Unsupported: 4,
    /** The request is malformed: not an envelope, missing or wrong-typed params. `detail` says what. */
    BadRequest: 5,
    /** The op needs the engine, and it could not be loaded (the host is 'fatal'). */
    NotLoaded: 6,
    /** The client's protocol major is not the host's. `detail` lists the majors the host speaks, e.g. "2". */
    ProtocolMismatch: 7,
    /** A config was named by a hash the host does not hold (never sent, or evicted): send it again with the config. */
    NotCached: 8,
};
