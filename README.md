# Pi Herdr Mesh

**Local discovery and communication for Pi sessions owned by the same OS user.**

Pi Herdr Mesh lets independent Pi processes find one another, exchange lasting steering requests, and ask isolated context-only questions. It uses Unix-domain sockets, opens no network ports, and works across panes in a Herdr workspace.

## Install

Install directly from GitHub:

```sh
pi install git:github.com/dardT/pi-herdr-mesh
```


> `@dardt/pi-herdr-mesh` is reserved for a future npm release and is not yet published. If upgrading from `pi-mesh`, remove the old package or standalone extension first.

## Quick start

1. Run `/mesh on` in each session you want to connect (if not already set in default settings).
2. Use `/mesh:catalog` to see listening sessions in the current Herdr workspace.
3. Send `/mesh:steer` for a durable instruction or `/mesh:btw` for a tool-free, context-only question.
4. Choose **Send & wait** or **Send in background**; track background work with `/mesh:requests`.

Use `/mesh off` to leave. While off, a session can list the catalog but cannot send or receive requests.

## Participation settings

Participation is opt-in by default. Enable automatic joining for all your Pi sessions with `~/.pi/agent/mesh/settings.json`:

```json
{ "joinByDefault": true }
```

A project can override it with `.mesh/settings.json`. Pi uses the nearest setting found while searching upward, then the user-wide value, then `false`. Settings are read at session start or reload; invalid settings warn and prevent automatic joining.

## Commands

| Command | Description |
| --- | --- |
| `/mesh` or `/mesh on` | Join the mesh and begin listening. |
| `/mesh off` | Leave the mesh and cancel queued outgoing BTW requests when possible. |
| `/mesh status` | Show membership, session ID, and incoming BTW queue state. |
| `/mesh:catalog [--all]` | List listening sessions. By default, scope to the current Herdr workspace; use `--all` for every local workspace. |
| `/mesh:steer` | Send a lasting request to a listening session. Busy recipients reject steer requests. |
| `/mesh:btw` | Queue a context-only, tool-free question until the recipient is idle. |
| `/mesh:requests [request-id]` | Inspect background requests, wait for a response, or cancel/dismiss local tracking. |

The picker starts in the current Herdr workspace and can expand to all workspaces. Outside Herdr, it lists all local sessions.

## Agent tools and routing

| Tool | Description |
| --- | --- |
| `mesh_catalog({ all? })` | List listening sessions in the current Herdr workspace, or all local workspaces. |
| `mesh_find({ query, all? })` | Rank task-relevant sessions before sending; it never selects one automatically. |
| `mesh_steer({ id, text, delayed? })` | Send a lasting request that changes the target conversation and can use its usual tools. |
| `mesh_btw({ id, text, delayed? })` | Ask an isolated, tool-free question. It is visible in the target transcript but does not enter its working context. |
| `mesh_wait({ id, requestId })` | Wait for a delayed request's result. |
| `mesh_requests({ requestId? })` | List locally tracked delayed requests or retrieve a saved result. |
| `mesh_cancel({ requestId })` | Cancel a queued BTW request where possible, or dismiss local tracking. |

BTW requests run one at a time when the target is idle. Pass `delayed: true` to send in the background: it returns a request ID and delivers the reply to the sender. Tracking is in-memory and ends if the sender reloads, leaves, or exits.

## Operational notes

Mesh IDs are stable for a saved Pi session and unique among running instances. A session must load the extension and join before it appears in the catalog; Mesh does not scan system processes. Membership is limited to the current OS user.

Transport uses a private `0700` temporary directory and `0600` Unix sockets under `pi-mesh-<uid>`. Messages and replies are limited to 1 MiB. It protects against other OS users, not malicious processes under the same account.

Avoid circular blocking workflows: use a background request, then retrieve it with `/mesh:requests` or `mesh_wait`. Cancellation can remove a queued BTW request; running BTW and steer requests continue while local tracking is dismissed.
