# filament-booth

The local bridge between a coding agent and the [Filament booth](https://booth.artems.net) tab. It is
an MCP server over stdio for the agent and a WebSocket server on `127.0.0.1` that the booth tab
dials after you turn its switch on. Nothing leaves your computer.

Open the booth, open the **Agent** section at the bottom of the rail, copy the command it shows and run it once in a terminal:

```sh
claude mcp add --scope user booth -- npx -y filament-booth --token <the token the tab shows>
```

`--scope user` gives every Claude Code session the booth, in whatever folder it starts. The bridge
takes its port on the first booth tool call, so sessions that never use the booth leave it free.
Scripts read and write the folder the session runs in.

Then start a new Claude Code session, turn on **Allow a local agent to control this
tab**, and ask the agent with the prompt the booth shows under the command. It names the
`booth_python` tool, so an agent that also has a browser tool does not click through the page
instead. Other agents run
`npx -y filament-booth --token <token>` as an MCP server.

Flags: `--token <t>`, `--port <n>` (default 47615), `--app <origin>` to accept a booth served
elsewhere, `--allow <dir>` for one more folder scripts may read and write.

The bundle in `bridge.mjs` is built from `tools/agent/cli.ts` in the booth repository with
`bun run bridge:build`. Do not edit it.
