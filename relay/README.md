# Caption Ninja private relay

An optional caption-text relay for people running their own caption.ninja setup.
It is a new implementation of the browser message protocol, not the source of
the public `api.caption.ninja` service. It needs no GPU, speech model, cloud API
account or Caption Local Python environment. It runs separately from inference.

[See the visual workflow and hosting options](https://github.com/steveseguin/caption-local/blob/main/docs/SELF-HOSTING.md)
for how recognition, the relay, the editor and audience displays fit together.

Use Node.js 22 or newer and this directory's pinned `ws` dependency. Windows 11
and WSL/Linux results are recorded in [Caption Local's relay evidence](https://github.com/steveseguin/caption-local/tree/main/evidence/relay-recovery).
Plan for 128 MiB RAM for a small private installation and measure your workload;
this is an allowance, not a proven minimum. Text relay capacity does not establish
speech recognition capacity. Internet hosting needs a domain and a TLS reverse
proxy; local testing uses loopback without system changes.

The relay and browser helper use the repository's MPL-2.0 license. The only
runtime npm dependency is `ws`; existing capture pages need no Node installation.

## Install and start

In a captionninja checkout, run these commands from `relay`.

Windows PowerShell:

```powershell
npm.cmd ci --ignore-scripts
node init-config.cjs
$env:CAPTION_RELAY_CONFIG = "$env:USERPROFILE\.caption-ninja-relay.private.json"
node server.cjs
```

Linux or WSL:

```sh
npm ci --ignore-scripts
node init-config.cjs
export CAPTION_RELAY_CONFIG="$HOME/.caption-ninja-relay.private.json"
node server.cjs
```

The configuration generator creates **new random tokens** and refuses to overwrite
an existing file. It creates `source` and `output` rooms, with separate `read` and
`write` credentials for each. Open that private JSON file locally to obtain them.
Keep it outside the website directory and restrict access to the service operator.
Never commit it, upload it with the site, or paste tokens into support logs.

The relay listens on **127.0.0.1:8787**. Visit `http://127.0.0.1:8787/health` for
aggregate connection/message counters. It serves no files. Stop with **Ctrl+C**.
Set process environment `PORT` to choose a different port; `HOST` is intended for
container binding or an explicitly secured deployment. This program installs no
background service and changes no firewall or system settings.

## Connect capture, editor and overlay

Use the updated Caption Local source on `main`, and its bundled
`http://localhost:8765/capture-local.html`. Start inference using its
[getting-started guide](https://github.com/steveseguin/caption-local/blob/main/docs/GETTING-STARTED.md).

For local caption.ninja pages, serve the **captionninja checkout** in another terminal:

```sh
python -m http.server 8080 --bind 127.0.0.1
```

On Windows use `py -3.12 -m http.server 8080 --bind 127.0.0.1`. This static web
server exposes files in that checkout; private relay configuration must stay
outside it. Do not use this development file server as a public hosting server.

1. Open **Send captions to caption.ninja → Use a private relay** in Caption Local.
2. Enter relay address `ws://127.0.0.1:8787`, caption website address
   `http://127.0.0.1:8080/`, source room `source`, its **write** token, and editor
   output room `output`.
3. Enable sharing and open the generated editor link. Its setup panel labels the
   source room's **read** token and the output room's **write** token. Check the
   room names and click **Connect private relay**.
4. Open the editor's overlay link. Its setup panel needs the output room's **read**
   token. Connection errors and unrecoverable delivery gaps appear on the page.
5. Start captions. Review incoming text in the editor, then send it to the overlay.
6. Stop capture, let audio finish, and download your transcript before closing.

You can use `https://steveseguin.github.io/captionninja/` as the caption website
address instead of serving the editor/overlay yourself. Add the exact origin
`https://steveseguin.github.io` to the relay configuration's `origins` list. The
actual hosted-page workflow passed in Edge with local-network permission granted
through automation. On 2026-09-07, `caption.ninja/capture-local.html` still served
the main capture page; a GitHub Pages deployment does not update that separate host.
For hosted microphone capture, follow Caption Local's
[service-token and allowed-origin instructions](https://github.com/steveseguin/caption-local/blob/main/docs/CAPTION-NINJA-LOCAL.md).

The token for Caption Local inference is separate from all relay tokens. A viewer
cannot publish using a read token, and credentials for one room cannot join another.
The editor output room must exist in the relay configuration and differ from its
source. Add rooms and restart the relay when provisioning another event.

The supported custom-relay pages in this first version are **capture-local.html,
editor.html and overlay.html**. Other capture/translation/overlay pages retain
their existing public-relay behavior. Use this workflow when private routing is
required. Optional cloud translation/TTS can still make external requests; leave
those features off when you need all processing to stay private.

For OBS, expand **Create a view-only OBS link** in the editor. Enter the output
viewing token, create the link and copy it into OBS. The helper verifies read
access against the relay before generating a link and rejects publishing tokens.
The link uses the fragment
`#relayReadToken=YOUR_OUTPUT_READ_TOKEN`. The page
reads it into memory and removes it from the address bar. Fragments are not sent
in HTTP requests, but the original link is still a credential: OBS settings,
clipboard and browser history may retain it. Never use a write token in an
audience link. Editor automation also supports `relayReadToken` and
`relayWriteToken` fragment fields; normal use enters them in the setup panel.
Ordinary generated links carry the relay address and no credentials. The explicit
OBS helper includes only the viewing credential you supply. A page with complete
fragment credentials connects automatically; the setup panel stays out of the
overlay once connected. Tokens remain in tab memory; reload to change them.

## Internet hosting and Docker

Host the static caption.ninja pages over HTTPS. Put a TLS reverse proxy in front
of the loopback relay. For example, a Caddy site can use:

```caddyfile
relay.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

See the [Caddy reverse-proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
for WebSocket proxy behavior and TLS deployment options.

Use `wss://relay.example.com/` in every participant's page. Configure the exact
HTTPS website origins in the private JSON `origins` list. Origin checks supplement
tokens; they are not authentication. Native clients without Origin still need
valid room credentials. Avoid proxy access logging of sensitive URLs and apply
host-level connection/rate limits for public deployments. Forwarded IP headers
are deliberately ignored: clients behind one proxy share the per-IP limit.

Docker alternative, from this directory after generating the config:

```sh
docker build -t caption-ninja-relay:local .
docker run --name caption-ninja-relay --rm --read-only --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit 64 --memory 128m \
  -p 127.0.0.1:8787:8787 \
  --mount "type=bind,src=$HOME/.caption-ninja-relay.private.json,dst=/run/rooms.json,readonly" \
  caption-ninja-relay:local
```

Ensure the container's unprivileged `node` user can read the mounted config without
making it world-readable. On Linux, use an appropriate owner/group or run the
container with your numeric UID/GID using `--user "$(id -u):$(id -g)"`.
Use `docker stop caption-ninja-relay` from another terminal to stop it.
Linux CI has built the image and verified authenticated delivery and shutdown in
an unprivileged, read-only container. A Windows test also verified real Caddy
HTTPS/WSS delivery with an explicit temporary CA and rejection of invalid
certificates/tokens. These checks do not validate a public domain, WAN performance
or Docker Desktop; rehearse the deployment on your host. No Docker installation
is required for the native setup.

## Bounds, privacy and recovery

Defaults: 512 WebSockets total, 128 per direct peer IP, 256 per room; 40 messages
per connection per second including join; 8 KiB messages; 4,000-character captions;
64 KiB pending transport output per connection; 10-second join deadline;
30-second heartbeat. Slow reliable viewers have a 10-second backpressure grace
period before disconnection. Publishers retain at most 100 unacknowledged captions
in the browser; the newest caption is rejected visibly if that queue fills.
HTTP connections are also bounded. Rooms must be provisioned in the configuration
(at most 1,000). Limits are implementation defaults, not guaranteed host capacity.
Overload rejects clients or disconnects slow viewers instead of growing buffers.

An optional `limits` object in the private configuration can set these bounds.
For example, `"limits": {"perIp": 512}` admits larger audiences behind one reverse
proxy or on one test computer. The default is 128 per IP, so 32 producers plus
100 viewers sharing a proxy need an explicit increase. This raises admission
capacity; it does not enlarge caption buffers or guarantee host throughput.
Unknown limit names or nonpositive/noninteger values are rejected.

The server forwards captions only to authenticated readers in the same room.
It now keeps a **short replay history in RAM**, along with delivery receipts:
at most 120 seconds and 256 messages per room, bounded globally by 8,192 messages
and a 16 MiB accounting budget. The oldest records expire first; the accounting
budget is not a process RSS limit. Text never goes to disk or logs; no audio is
stored. Startup logs and `/health` contain operational data only, including replay
counts, duplicate receipts and gaps. A private relay failure **never falls back
to the public relay**.

The private publisher keeps each caption until the relay acknowledges it, retrying
the same identity if the acknowledgement is lost. Receipts suppress duplicate
delivery within the retained history. Returning viewers resume from their last
caption cursor, even when the producer reconnects first. New viewers start live.
Each room's viewing token authorizes its retained history as well as live captions.

**This is bounded recovery, not durable or exactly-once delivery.** If the buffer
expires or is evicted, the viewer shows a gap warning. Restarting the relay clears
history and receipts; current-process captions can be replayed after restart,
but earlier captions may be missing and an unacknowledged retry can repeat.
Restart/gap warnings make this visible. A crashed or reloaded browser also loses
its in-memory queue/cursor. The editor's existing 100-caption review queue remains
bounded; if it overflows, private-mode users get an explicit dropped-caption warning.

Authentication denial stops publisher automatic retries. Turn sharing off,
correct the token and enable it again. Reload viewers/editors to enter corrected
tokens. Restart with changed configuration to revoke credentials and disconnect
existing clients. Rehearse outages before relying on a deployment at an event.
Invalid format or oversized frames also stop retries and show an error. The
8 KiB limit counts UTF-8 bytes, so a long multilingual caption can exceed it
before reaching 4,000 characters. Copy the text, shorten it and start a new
publishing session before resending. A denied publisher retains its queue in
memory until that session is closed; reconnecting the same invalid payload will
not repair it.

## Tests and protocol

Measured on Windows 11, a Core Ultra 7 265K and Node 22.19.0, using short captions
in six languages and five captions/second per producer:

| Text producers | Total viewers | Test duration | p95 relay delay | Result |
| ---: | ---: | ---: | ---: | --- |
| 32 | 100 | 1 hour | 5.7 ms | 1.8 million deliveries; no errors, duplicates or gaps |
| 32 | 400 | 1 minute | 10.3 ms | 120,000 deliveries; no errors, duplicates or gaps |

Both tests injected disconnects; the maximum observed delay was about two seconds,
including an intentional two-second viewer outage. Server and simulated browser
clients shared one Node process on loopback. The hour used the initial recovery
client; the later short probe and targeted tests cover the invalid-frame retry fix.
These are text delivery measurements, not speech recognition or public-network
capacity. The 400-viewer probe is too short to establish sustained capacity.
See the linked evidence for exact versions, memory/CPU, recovery limits and
unsuccessful configurations. Admission was explicitly 512 per IP for loopback.

```sh
npm test
node benchmark.cjs 60 /path/to/new-results.json
node soak.cjs 3600 /path/to/new-hour-results.json 100
```

The benchmark uses 32 independent synthetic producers and two viewers per room,
at five captions/second each. It measures loopback delivery, ordering, isolation,
CPU and memory in one Node process containing both clients and server. It does
not establish WAN latency or a sustained maximum capacity. The separate soak uses
the actual reliable browser client with 32 producers, the requested total viewer
count, periodic forced disconnects and fixed-size latency histograms. Its results
include errors, gaps, duplicates, queue/retention bounds and memory samples.
The integration probe
is `scripts/browser_private_relay.py` in Caption Local; it uses a synthetic
microphone, fake inference and this real relay with public traffic blocked.

Reliable clients join using `{"protocol":2,"join":"ROOM","role":"read|write","token":"TOKEN"}`.
Returning readers include `"cursor":{"epoch":"PREVIOUS_EPOCH","sequence":123}`.
The join response includes the process epoch, next sequence and any gap reason.
Writers send `{"msg":true,"final":"text","id":1,"delivery":{"client":"UNIQUE_PRODUCER_ID","sequence":1}}`.
The relay acknowledges that delivery identity and adds an epoch/sequence cursor
to forwarded captions. `interm` can replace `final`; optional `label` and `ln`
are preserved. Original caption IDs remain distinct from delivery identities.
The legacy private join without `protocol` is still supported but has no reliable
client acknowledgements or resume cursor. One socket has one immutable room/role;
viewers cannot publish. Update both server and private pages to use recovery.
