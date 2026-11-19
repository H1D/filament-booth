import { type EngineError, type EngineWarning, type HostState, type Progress } from './envelope.ts';
import type { HelloResult, OpName, OpParams, OpResult } from './ops.ts';
import type { Config } from './data.ts';
import type { SettingsEditParams, SettingsEditResult, SettingsView, SettingsViewParams } from './settings.ts';
import type { Transport } from './transport.ts';
/** A request the host answered with an error. */
export declare class EngineRequestError extends Error implements EngineError {
    readonly code: number;
    readonly objects?: string[];
    readonly detail?: string;
    readonly log?: string;
    readonly conflict?: EngineError['conflict'];
    readonly toolpaths?: EngineError['toolpaths'];
    readonly toolpathExtras?: EngineError['toolpathExtras'];
    constructor(error: EngineError);
}
export interface CallOptions {
    onProgress?: (progress: Progress) => void;
    onWarning?: (warning: EngineWarning) => void;
    /** Buffers to move to the host instead of copying: 'auto' = every typed array in the params. Default none. */
    transfer?: readonly ArrayBuffer[] | 'auto';
    /** Aborting cancels the request (see EngineConnection.cancel) and rejects it with Cancelled at once. */
    signal?: AbortSignal;
}
export interface Call<R> {
    id: number;
    result: Promise<R>;
    /** Asks the host to cancel; resolves with whether it could (a running slice cannot, without 'cancel.cooperative'). */
    cancel(): Promise<boolean>;
}
export interface ConnectionOptions {
    /** The host's state messages. */
    onState?: (state: HostState) => void;
    /** The transport closed or failed; every open request has been rejected. */
    onClose?: (error?: Error) => void;
}
export declare class EngineConnection {
    private readonly transport;
    private readonly pending;
    private readonly stop;
    private nextId;
    private closed;
    private helloResult;
    private readonly options;
    constructor(transport: Transport, options?: ConnectionOptions);
    /** The host's hello answer, once open() has run. */
    get hello(): HelloResult | null;
    /**
     * Says hello and checks the answer: rejects (with ProtocolMismatch) when the host does not speak this
     * protocol at `minMinor` or lacks a `required` capability.
     */
    open(client: {
        name: string;
        version: string;
    }, want?: {
        minMinor?: number;
        required?: readonly string[];
    }): Promise<HelloResult>;
    /** Whether the host listed `capability` in hello (false before open()). */
    has(capability: string): boolean;
    call<K extends OpName>(op: K, params: OpParams<K>, options?: CallOptions): Call<OpResult<K>>;
    request<K extends OpName>(op: K, params: OpParams<K>, options?: CallOptions): Promise<OpResult<K>>;
    private sendCancel;
    /** Stops listening and closes the transport (terminating a worker); open requests are rejected. */
    close(): void;
    private fail;
    private receive;
}
export interface SettingsPresets {
    machine: Config;
    process: Config;
    filament: Config;
}
type Plain<P> = Omit<P, 'presets'> & {
    presets: SettingsPresets;
};
/**
 * settings.view and settings.edit with the bookkeeping done: presets are sent once and then by hash
 * (again when the host has dropped one), and each scope's form is cached, so the host sends it once and
 * every document returned here has its `form`.
 */
export declare class SettingsClient {
    private readonly connection;
    private readonly sent;
    private readonly forms;
    constructor(connection: EngineConnection);
    view(params: Plain<SettingsViewParams>): Promise<SettingsView>;
    edit(params: Plain<SettingsEditParams>): Promise<SettingsEditResult>;
    private formOption;
    private withForm;
    private refs;
    private retry;
}
export {};
