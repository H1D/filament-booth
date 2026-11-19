// SPDX-License-Identifier: Apache-2.0
// A small RPC client for protocol v2 over any Transport: request ids, one promise per request, progress
// and warnings routed to the request's callbacks, the host's state to a listener, cancellation. It holds
// no engine policy (when to start, stop or replace a host is the app's business).
import { ErrorCode, PROTOCOL } from "./envelope.js";
import { configHash, negotiate, transferablesOf } from "./helpers.js";
/** A request the host answered with an error. */
export class EngineRequestError extends Error {
    code;
    objects;
    detail;
    log;
    conflict;
    toolpaths;
    toolpathExtras;
    constructor(error) {
        super(error.message);
        this.name = 'EngineRequestError';
        this.code = error.code;
        if (error.objects)
            this.objects = error.objects;
        if (error.detail !== undefined)
            this.detail = error.detail;
        if (error.log !== undefined)
            this.log = error.log;
        if (error.conflict)
            this.conflict = error.conflict;
        if (error.toolpaths)
            this.toolpaths = error.toolpaths;
        if (error.toolpathExtras)
            this.toolpathExtras = error.toolpathExtras;
    }
}
export class EngineConnection {
    transport;
    pending = new Map();
    stop;
    nextId = 1;
    closed = null;
    helloResult = null;
    options;
    constructor(transport, options = {}) {
        this.transport = transport;
        this.options = options;
        this.stop = transport.listen((message) => this.receive(message), (error) => this.fail(error ?? new Error('The engine connection closed.')));
    }
    /** The host's hello answer, once open() has run. */
    get hello() {
        return this.helloResult;
    }
    /**
     * Says hello and checks the answer: rejects (with ProtocolMismatch) when the host does not speak this
     * protocol at `minMinor` or lacks a `required` capability.
     */
    async open(client, want = {}) {
        const hello = await this.request('hello', { protocol: { major: PROTOCOL.major, minMinor: want.minMinor ?? 0 }, client });
        const n = negotiate(hello, want);
        if (!n.ok)
            throw new EngineRequestError({ code: ErrorCode.ProtocolMismatch, message: `The engine does not suit this app: ${n.reason}.` });
        this.helloResult = hello;
        return hello;
    }
    /** Whether the host listed `capability` in hello (false before open()). */
    has(capability) {
        return this.helloResult?.capabilities.includes(capability) ?? false;
    }
    call(op, params, options = {}) {
        const id = this.nextId++;
        const result = new Promise((resolve, reject) => {
            if (this.closed) {
                reject(this.closed);
                return;
            }
            if (options.signal?.aborted) {
                reject(new EngineRequestError({ code: ErrorCode.Cancelled, message: 'Cancelled.' }));
                return;
            }
            this.pending.set(id, { resolve: resolve, reject, options });
            options.signal?.addEventListener('abort', () => {
                const p = this.pending.get(id);
                if (!p)
                    return;
                this.pending.delete(id);
                p.reject(new EngineRequestError({ code: ErrorCode.Cancelled, message: 'Cancelled.' }));
                this.sendCancel(id).catch(() => undefined);
            }, { once: true });
            const transfer = options.transfer === 'auto' ? transferablesOf(params) : (options.transfer ?? []);
            try {
                this.transport.send({ v: 2, id, op, params }, transfer);
            }
            catch (err) {
                this.pending.delete(id);
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        });
        return { id, result, cancel: () => this.sendCancel(id) };
    }
    request(op, params, options) {
        return this.call(op, params, options).result;
    }
    async sendCancel(target) {
        if (this.closed)
            return false;
        const { accepted } = await this.request('cancel', { target });
        return accepted;
    }
    /** Stops listening and closes the transport (terminating a worker); open requests are rejected. */
    close() {
        this.fail(new Error('The engine connection was closed.'));
        this.transport.close();
    }
    fail(error) {
        if (this.closed)
            return;
        this.closed = error;
        this.stop();
        const pending = [...this.pending.values()];
        this.pending.clear();
        for (const p of pending)
            p.reject(error);
        this.options.onClose?.(error);
    }
    receive(message) {
        if (!message || typeof message !== 'object')
            return;
        const m = message;
        if (m.v !== 2 || typeof m.id !== 'number')
            return;
        if (m.kind === 'state') {
            this.options.onState?.(m.state);
            return;
        }
        const p = this.pending.get(m.id);
        if (!p)
            return;
        switch (m.kind) {
            case 'progress':
                safely(() => p.options.onProgress?.(m.progress));
                break;
            case 'warning':
                safely(() => p.options.onWarning?.(m.warning));
                break;
            case 'result':
                this.pending.delete(m.id);
                p.resolve(m.result);
                break;
            case 'error':
                this.pending.delete(m.id);
                p.reject(new EngineRequestError(m.error));
                break;
        }
    }
}
function safely(callback) {
    try {
        callback();
    }
    catch (err) {
        console.error('Engine callback failed:', err);
    }
}
/**
 * settings.view and settings.edit with the bookkeeping done: presets are sent once and then by hash
 * (again when the host has dropped one), and each scope's form is cached, so the host sends it once and
 * every document returned here has its `form`.
 */
export class SettingsClient {
    connection;
    sent = new Set();
    forms = new Map();
    constructor(connection) {
        this.connection = connection;
    }
    async view(params) {
        const run = (full) => {
            const { form: _form, ...rest } = params;
            return this.connection.request('settings.view', { ...rest, presets: this.refs(params.presets, full), ...this.formOption(params.scope, params.omit) });
        };
        return this.withForm(await this.retry(run));
    }
    async edit(params) {
        const view = params.view === undefined || params.view === false ? undefined : params.view === true ? {} : params.view;
        const run = (full) => this.connection.request('settings.edit', {
            ...params,
            presets: this.refs(params.presets, full),
            ...(view ? { view: { ...view, ...this.formOption(params.scope, view.omit) } } : {}),
        });
        const result = await this.retry(run);
        return result.view ? { ...result, view: this.withForm(result.view) } : result;
    }
    formOption(scope, omit) {
        const form = this.forms.get(`${scope}\n${[...(omit ?? [])].sort().join(',')}`);
        return form ? { form: form.id } : {};
    }
    withForm(view) {
        if (view.form) {
            this.forms.set(`${view.scope}\n${omitKey(view.form)}`, view.form);
            return view;
        }
        for (const form of this.forms.values())
            if (form.id === view.formId)
                return { ...view, form };
        return view;
    }
    refs(presets, full) {
        const ref = (config) => {
            const hash = configHash(config);
            if (!full && this.sent.has(hash))
                return { hash };
            this.sent.add(hash);
            return { hash, config };
        };
        return { machine: ref(presets.machine), process: ref(presets.process), filament: ref(presets.filament) };
    }
    async retry(run) {
        try {
            return await run(false);
        }
        catch (err) {
            if (err instanceof EngineRequestError && err.code === ErrorCode.NotCached)
                return run(true);
            throw err;
        }
    }
}
/** The omit list a form was built for, as the cache key uses it. */
function omitKey(form) {
    return [...form.omit].sort().join(',');
}
