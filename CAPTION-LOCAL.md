# Use your own speech recognition server

`capture-local.html` is a separate capture page for
[Caption Local](https://github.com/steveseguin/caption-local). It does not require a
cloud transcription account, and does not load into the existing capture pages.
Run the service on your Windows/Linux computer or reach it through an SSH tunnel.

This is draft integration work. The matching Caption Local development branch is
`windows-rtx-validation`; the published v1.1.0 does not include hosted-page CORS.
Start with the service's bundled **http://localhost:8765/capture-local.html** page.
See its [setup and requirements guide](https://github.com/steveseguin/caption-local/blob/windows-rtx-validation/docs/CAPTION-NINJA-LOCAL.md)
for exact commands, private hosting, tokens, hardware choices and measured limits.

On this site's page, enter the service address and local-service token, then click
Connect. The service must explicitly allow this site's origin. Browser local-network
access may also need permission; use the bundled localhost page if blocked.
Do not disable browser security or expose an unauthenticated inference port.

Choose a microphone, spoken language and transcription/English translation mode.
Start capture, then Stop and let buffered speech finish before downloading text.
Expect several seconds of delay and recognition mistakes, especially with noise.
The diagnostics panel shows buffering, response duration, queue/inference time
and errors. Settings/diagnostic downloads exclude tokens and room names.

Sharing is off by default. Enable it only to send text to an editor's private
source room or explicitly to a direct overlay room. The existing overlay/editor
and downstream TTS features consume ordinary caption messages. No Google/Gemini/
OpenAI STT or TTS engines are bundled in this page. Models, CUDA, authentication
and concurrency configuration remain in the Caption Local repository.

## Maintaining the copy

The `caption-local/` directory is an MPL-2.0 bundle copied from Caption Local's
canonical `static/` directory. Its LICENSE and SHA-256 manifest are included.
There is no runtime CDN dependency. Update from a reviewed Caption Local checkout:

```sh
python scripts/sync_capture_page.py /path/to/captionninja
python scripts/sync_capture_page.py /path/to/captionninja --check
```

Commit the page, assets and manifest together. Test with a local mock relay; never
send synthetic test captions to a real room. The separate page adds one navigation
link to the main capture page and no new dependencies to existing pages.
