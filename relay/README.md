# Caption Ninja private relay

An optional caption-text relay for people running their own caption.ninja setup.
It is a new implementation of the browser message protocol, not the source of
the public `api.caption.ninja` service. It needs no GPU, speech model, cloud API
account or Caption Local Python environment. It runs separately from inference.

Use Node.js 22 or newer and this directory's pinned `ws` dependency. Windows 11
and WSL/Linux results are recorded in [Caption Local's relay evidence](https://github.com/steveseguin/caption-local/tree/main/evidence/private-relay).
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
3. Enable sharing and open the generated editor link. The editor asks for the
   source room's **read** token and the output room's **write** token.
4. Open the editor's overlay link. Enter the output room's **read** token.
5. Start captions. Review incoming text in the editor, then send it to the overlay.
6. Stop capture, let audio finish, and download your transcript before closing.

The token for Caption Local inference is separate from all relay tokens. A viewer
cannot publish using a read token, and credentials for one room cannot join another.
The editor output room must exist in the relay configuration and differ from its
source. Add rooms and restart the relay when provisioning another event.

The supported custom-relay pages in this first version are **capture-local.html,
editor.html and overlay.html**. Other capture/translation/overlay pages retain
their existing public-relay behavior. Use this workflow when private routing is
required. Optional cloud translation/TTS can still make external requests; leave
those features off when you need all processing to stay private.

For OBS, where a browser prompt is inconvenient, append the **view-only** token
to the overlay URL fragment: `#relayReadToken=YOUR_OUTPUT_READ_TOKEN`. The page
reads it into memory and removes it from the address bar. Fragments are not sent
in HTTP requests, but the original link is still a credential: OBS settings,
clipboard and browser history may retain it. Never use a write token in an
audience link. Editor automation also supports `relayReadToken` and
`relayWriteToken` fragment fields; normal use can enter them at the prompts.
Generated links carry the relay address but never copy credentials.

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
Docker/TLS examples need verification on your host; native loopback tests do not
validate public deployment or Docker Desktop. No Docker installation is required.

## Bounds, privacy and recovery

Defaults: 512 WebSockets total, 128 per direct peer IP, 256 per room; 40 messages
per connection per second including join; 8 KiB messages; 4,000-character captions;
64 KiB pending output per viewer; 10-second join deadline; 30-second heartbeat.
HTTP connections are also bounded. Rooms must be provisioned in the configuration
(at most 1,000). Limits are implementation defaults, not guaranteed host capacity.
Overload rejects clients or disconnects slow viewers instead of growing buffers.

The server forwards captions only to authenticated readers in the same room. It
keeps no caption history, writes no captions/tokens/room names to logs, and stores
no audio. Startup logs and `/health` contain operational data only. A private
relay failure **never falls back to the public relay**.

The browser publisher retains a bounded queue while disconnected and waits for
join authorization before flushing it. **There is no per-caption acknowledgement,
durable delivery, replay or exactly-once guarantee.** Captions sent while a viewer
is disconnected, including a viewer that rejoins after the publisher on restart,
are lost to that viewer. Have the editor and audience reconnect before resuming
capture after an outage. Authentication denial stops publisher automatic retries;
turn sharing off, correct the token, and enable it again. Viewer/editor tokens stay
in tab memory; reload to enter different tokens. Restart with changed configuration
to revoke credentials and disconnect existing clients.

## Tests and protocol

```sh
npm test
node benchmark.cjs 60 /path/to/new-results.json
```

The benchmark uses 32 independent synthetic producers and two viewers per room,
at five captions/second each. It measures loopback delivery, ordering, isolation,
CPU and memory in one Node process containing both clients and server. It does
not establish WAN latency or a sustained maximum capacity. The integration probe
is `scripts/browser_private_relay.py` in Caption Local; it uses a synthetic
microphone, fake inference and this real relay with public traffic blocked.

Clients join using `{"join":"ROOM","role":"read|write","token":"TOKEN"}`.
The server replies `{"joined":"ROOM","role":"read|write"}`. Writers then send
`{"msg":true,"final":"text","id":1}` or `interm` instead of `final`; optional
`label` and `ln` fields are preserved. IDs are forwarded, not treated as delivery
acknowledgements. One socket has one immutable room/role; viewers cannot publish.
