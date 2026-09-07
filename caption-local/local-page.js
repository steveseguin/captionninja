'use strict';
const connection = window.captionLocalConnection;
$('endpoint').value = captureAssetBase.pathname === '/static/'
  ? location.origin : 'http://localhost:8765';
if (captureAssetBase.pathname === '/static/') $('endpoint').readOnly = true;
$('capabilities').textContent = 'Connect to check the model and supported languages.';
$('status').textContent = 'Not connected';
$('connection').onsubmit = async event => {
  event.preventDefault();
  if (connection.busy || connection.checking) return;
  $('connectionError').textContent = '';
  try {
    connection.configure($('endpoint').value.trim(), $('connectionToken').value.trim());
    $('endpoint').value = connection.endpoint;
    $('connectionToken').value = ''; ready = false; fail('');
    connection.checking = true; controls();
    await health();
    if (!ready) {
      const message = 'Connection not ready. Check the service, token and allowed origin. If browser local-network permission is denied, open the local capture page instead.';
      fail(message); $('connectionError').textContent = message;
    } else {
      $('status').textContent = 'Ready to capture';
      $('connectionTitle').textContent = '1. Service connected — edit connection';
      $('serviceConnection').open = false;
      $('microphone').focus({preventScroll: true});
    }
  } catch (error) {
    connection.connected = false; connection.token = ''; connection.revision = (connection.revision || 0) + 1;
    ready = false; fail(error.message); $('connectionError').textContent = error.message;
  }
  finally { connection.checking = false; controls(); }
};
// The separate connection form owns credentials on this page.
$('auth').onsubmit = event => { event.preventDefault(); $('connectionToken').focus(); };
setInterval(() => {
  const requests = connection.metrics.filter(m => m.route === '/transcribe');
  const latest = requests.at(-1);
  const inference = connection.lastInference;
  $('diagnostics').textContent = `Buffered audio: ${(buffer.length / 16000).toFixed(1)} s. ` +
    `Pending audio: ${pending ? 'yes' : 'no'}. Failed audio retained: ${failed ? 'yes' : 'no'}. ` +
    `Recent requests: ${requests.length}; unsuccessful attempts: ${requests.filter(m => m.status !== 200).length}. ` +
    (latest ? `Last response: HTTP ${latest.status || 'network error'}, ${latest.milliseconds} ms (network + queue + inference).` : 'No inference request yet.') +
    (inference ? ` Server inference: ${inference.inference_seconds} s; queue: ${inference.queue_seconds} s.` : '');
}, 1000);
$('downloadDiagnostics').onclick = () => {
  const blob = new Blob([JSON.stringify({schema: 1, requests: connection.metrics, last_inference: connection.lastInference,
    buffered_seconds: buffer.length / 16000, pending: !!pending, failed}, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = 'caption-local-diagnostics.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const settingIds = ['language', 'mode', 'captionInterval', 'sensitivity', 'relayOutput'];
$('saveSettings').onclick = () => {
  if (!connection.connected || !ready) { fail('Connect successfully before saving settings.'); return; }
  const settings = {schema: 1, endpoint: connection.endpoint};
  for (const id of settingIds) settings[id] = $(id).value;
  const url = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'caption-local-settings.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('loadSettings').onchange = async () => {
  try {
    const file = $('loadSettings').files[0];
    if (!file || connection.busy || connection.checking) return;
    if (file.size > 4096) throw new Error('Settings file is too large.');
    const settings = JSON.parse(await file.text());
    if (connection.busy || connection.checking) return;
    if (settings.schema !== 1) throw new Error('Unsupported settings format.');
    for (const id of settingIds) {
      if (![...$(id).options].some(option => option.value === settings[id] && (id === 'relayOutput' || !option.disabled)))
        throw new Error('Connect first to load settings compatible with this model.');
    }
    // Imports never change connection, microphone, token, room or sharing state.
    if (settings.endpoint !== $('endpoint').value) throw new Error('Connect to the saved service address before loading these settings.');
    for (const id of settingIds) $(id).value = settings[id];
    updateOutputChoice(); fail('');
  } catch (error) { fail(error.message); }
  finally { $('loadSettings').value = ''; }
};
