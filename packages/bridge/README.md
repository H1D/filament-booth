# filament-booth

The local bridge between a coding agent and the [Filament booth](https://booth.artems.net) tab. It is
an MCP server over stdio for the agent and a WebSocket server on `127.0.0.1` that the booth tab
dials after you turn its switch on. Nothing leaves your computer.

Open the booth, go to **Setup → Agent**, copy the command it shows and run it in the folder you work
in:

```sh
claude mcp add booth -- npx -y filament-booth --token <the token the tab shows>
```

Then turn on **Allow a local agent to control this tab**. Other agents run
`npx -y filament-booth --token <token>` as an MCP server.

Flags: `--token <t>`, `--port <n>` (default 47615), `--app <origin>` to accept a booth served
elsewhere, `--allow <dir>` for one more folder scripts may read and write.

The bundle in `bridge.mjs` is built from `tools/agent/cli.ts` in the booth repository with
`bun run bridge:build`. Do not edit it.
