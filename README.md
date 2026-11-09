# Pi Herdr Mesh

Connect local Pi sessions to discover collaborators, send steering requests, and ask questions without interrupting their work. Mesh communicates through Unix-domain sockets between Pi processes owned by the same OS user; it opens no network ports. It works across panes in a Herdr workspace and can also find sessions outside Herdr.

## Install

```sh
pi install git:github.com/dardT/pi-herdr-mesh
```

`@dardt/pi-herdr-mesh` is reserved for a future npm release; it is not published. If upgrading from `pi-mesh`, remove the old package or standalone extension first.

## Get started

1. Run `/mesh on` in each Pi session that should participate.
2. Run `/mesh:catalog` to find another listening session in your Herdr workspace.
3. Run `/mesh:btw` to ask a question, or `/mesh:steer` to give the other session a lasting instruction.
4. Select a recipient, write your request, then choose **Send & wait** or **Send in background**. Use `/mesh:requests` to inspect background requests.

Run `/mesh off` to leave. A session outside the mesh can still list the catalog but cannot send or receive requests.

### Choose the right request

| Request | What happens at the recipient | When to use it |
| --- | --- | --- |
| **BTW** (`/mesh:btw`, `mesh_btw`) | Waits until the recipient is idle, then obtains a tool-free answer from its current context. The question and answer appear in its transcript but do **not** enter its working context. | Ask for a quick assessment without changing the recipient's task. |
| **Steer** (`/mesh:steer`, `mesh_steer`) | Starts an ordinary agent turn. The instruction and response remain in the recipient's conversation; its usual tools are available. | Assign work or change the recipient's direction. |

The BTW answer appears as a compact preview in the recipient's transcript. Pi's tool-output expansion shortcut (`Ctrl+O` by default) reveals the full answer; this toggle applies to the transcript, not just one entry. BTW requests are answered one at a time. Waiting BTWs take priority over queued steers, so a steady stream of BTWs can delay them.

## Configure participation and steering

Joining is opt-in. To join automatically, create `~/.pi/agent/mesh/settings.json`:

```json
{
  "joinByDefault": true
}
```

You can also select how a **recipient** handles incoming steers. For example, to group requests from the same sender:

```json
{
  "joinByDefault": true,
  "steeringMode": "sender-group",
  "groupWindowMs": 500
}
```

| `steeringMode` | Behavior when a steer arrives | Collection window |
| --- | --- | --- |
| `"exclusive"` **(default)** | Start immediately if idle; reject competing steers. | None |
| `"fifo"` | Queue steers and execute them individually in arrival order. | None |
| `"sender-group"` | Queue steers; collect requests from the same sender and execute up to 10 in one turn. | `groupWindowMs` |
| `"batch"` | Queue steers from any sender and execute up to 10 in one turn. There is **no negotiation** before execution. | `batchWindowMs` |

Both windows default to **500 ms** and accept integers from **100 to 10,000 ms**. They apply only to their respective modes. In grouped and batched turns, each request keeps its own ID and receives its own answer. If the recipient does not produce a valid answer for every ID, the entire group fails rather than assigning an answer to the wrong request. In `"batch"` mode, the recipient's model sees requests from multiple senders together, and its answers may disclose information across requests. Use `"sender-group"` or `"fifo"` when requests must stay separate.

For project-specific settings, create `.mesh/settings.json` in the project or a parent directory. Each setting is resolved independently: the nearest project value wins, followed by the user-wide value, then the default (`false` for `joinByDefault`, `"exclusive"` for `steeringMode`). Settings take effect when the session joins or reloads. Invalid values prevent automatic joining and produce a warning.

## Commands

| Command | Purpose |
| --- | --- |
| `/mesh` or `/mesh on` | Join and begin listening. |
| `/mesh off` | Leave, clear incoming queues, and attempt to cancel pending outgoing requests. Started work cannot be undone. |
| `/mesh status` | Show your mesh ID, steering mode, active BTW, and incoming queues. |
| `/mesh:catalog [--all]` | List sessions in the current Herdr workspace, or all local sessions with `--all`. |
| `/mesh:btw` | Ask a context-only, tool-free question using the recipient picker. |
| `/mesh:steer` | Send a lasting request using the recipient picker. Admission follows the recipient's steering mode. |
| `/mesh:requests [request-id]` | Inspect background requests; wait, show a reply, or cancel/dismiss tracking. |

The picker starts with sessions in your Herdr workspace and can expand to all workspaces. Outside Herdr, it lists all local sessions. Each recipient shows its name (or folder), mesh ID, branch, activity, and any recorded purpose. Stale purposes are labelled “last known.” Opening the picker does not call a model to refresh them.

## Agent tools

| Tool | Purpose |
| --- | --- |
| `mesh_catalog({ all? })` | List local mesh sessions; `all: true` includes other Herdr workspaces. |
| `mesh_find({ query, all? })` | Rank relevant recipients. It may refresh up to three stale purposes with model calls; it never chooses a recipient automatically. |
| `mesh_btw({ id, text, delayed? })` | Ask an isolated question. |
| `mesh_steer({ id, text, delayed? })` | Send a lasting steering request. |
| `mesh_wait({ id, requestId })` | Wait up to 30 seconds for a background reply; may return pending. |
| `mesh_requests({ requestId? })` | List tracked requests or retrieve a saved result. |
| `mesh_cancel({ requestId })` | Cancel a queued BTW or steer where possible; otherwise dismiss local tracking. |

`id` is the recipient's mesh ID from `mesh_catalog` or `mesh_find`. Sends wait for completion by default. Set `delayed: true` to get a request ID immediately; the sender watches for the reply in the background. For example:

```text
mesh_steer({ id: "recipient-id", text: "Review the current design and report any risks.", delayed: true })
mesh_wait({ id: "recipient-id", requestId: "returned-request-id" })
```

Background replies are delivered to the sender automatically while tracking is active. `mesh_requests` can retrieve the saved result later. Tracking is in-memory and ends when the sender reloads, leaves the mesh, or exits. Cancelling a request only stops it at the recipient if it is **still queued**; running work continues even if the sender dismisses its local record. For workflows where two agents might wait on each other, send in the background rather than blocking both sides.

## Limits and security

- Both sessions must load the extension and join before they can exchange requests. Mesh does not scan system processes. Mesh IDs are stable for a saved Pi session and unique among running instances.
- Incoming queues and completed results are held in memory. The recipient retains up to 100 requests/results at a time; when its capacity is exhausted by unfinished work, new requests are rejected. Leaving the mesh clears incoming queues.
- Transport uses a private `0700` directory and `0600` Unix sockets under `pi-mesh-<uid>` in the system temporary directory. Requests and replies are limited to 1 MiB.
- Isolation is between OS users, **not** between untrusted processes running as the same user. Use the mesh only with Pi sessions you trust.
