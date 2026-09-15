const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const TERMINAL = new Set(['complete', 'failed', 'cancelled']);
const buttonBindings = new Map();
let planState = null;
let currentJobId = null;
let workspaceRefreshing = false;
let modelSettingsInitialized = false;
let displayedTerminal = null;
let availableUpdate = null;
let updateInstalling = false;
const panelStates = new Map();
const observedJobs = new Map();
function savedValue(key, value) {
  try {
    if (value !== undefined) localStorage.setItem(`yue2:${key}`, value);
    return localStorage.getItem(`yue2:${key}`);
  } catch { return null; }
}
// Remember one editable budget across all YuE2 generation pages.
const memoryInputs = $$('[data-generation-memory]');
const rememberedBudget = Number(savedValue('generation-memory-gib'));
for (const input of memoryInputs) {
  if (Number.isFinite(rememberedBudget) && rememberedBudget > 2) input.value = String(rememberedBudget);
  input.addEventListener('input', () => {
    const value = Number(input.value);
    for (const other of memoryInputs) {
      other.value = input.value;
      other.setCustomValidity(Number.isFinite(value) && value > 2 ? '' : t('error.memoryBudgetMin'));
    }
    if (Number.isFinite(value) && value > 2) savedValue('generation-memory-gib', input.value);
  });
}
function generationMemoryBudget() {
  const input = $('.panel.active [data-generation-memory]') || memoryInputs[0];
  const budget = Number(input.value);
  if (!Number.isFinite(budget) || budget <= 2) throw new Error(t('error.memoryBudget'));
  savedValue('generation-memory-gib', String(budget));
  return budget;
}
function resultPanel(job) {
  return savedValue(`job-panel:${job.id}`) || job.result_panel ||
    (['reference_cover', 'voice_convert'].includes(job.kind) ? 'cover' : job.kind === 'render_plan' ? 'plan' : 'create');
}
function rememberResult(job, target) {
  const panel = target?.closest('.panel')?.id;
  if (panel) savedValue(`job-panel:${job.id}`, panel);
}

function renderPanelResults(jobs) {
  for (const panel of ['create', 'plan', 'cover']) {
    const job = jobs.find(item => ['generate', 'reference_cover', 'voice_convert', 'render_plan', 'decode'].includes(item.kind) && resultPanel(item) === panel);
    if (!job) continue;
    const target = $(`#${panel}-result`);
    const signature = `${job.id}:${job.status}:${job.result?.completed_candidates || 0}`;
    const previous = observedJobs.get(job.id);
    observedJobs.set(job.id, job.status);
    if (panelStates.get(panel) === signature) continue;
    panelStates.set(panel, signature);
    target.dataset.jobId = job.id;
    if (!TERMINAL.has(job.status)) {
      target.innerHTML = `<div class="result-card"><b>${t('result.pending')}</b><p class="meta">${t('result.pendingBody')}</p><button class="ghost compact" onclick="openTaskCenter()">${t('result.pendingViewProgress')}</button></div>`;
      if (job.result?.comparison && job.result?.candidates?.length) {
        const ready = document.createElement('div'); renderJob(job, ready); target.append(ready);
      }
    } else {
      if (job.status === 'complete') renderJob(job, target);
      else target.innerHTML = failureMarkup({jobId: job.id, message: job.error, job});
      if (previous && !TERMINAL.has(previous) && target.closest('.panel').classList.contains('active')) {
        target.scrollIntoView({behavior: 'smooth', block: 'center'});
      }
    }
  }
}

async function api(path, options = {}) {
  // Tell the server which language to render its own prose in -- job errors,
  // validation failures and status messages are generated in Python. Without
  // this header the server stays on its Chinese default. Every request in the
  // UI funnels through here, so one header covers the whole app.
  const headers = new Headers(options.headers || {});
  if (!headers.has('X-YuE2-Locale')) headers.set('X-YuE2-Locale', YUE2_I18N.current());
  const response = await fetch(path, {...options, headers});
  let data;
  try { data = await response.json(); } catch { data = {error: await response.text()}; }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function formObject(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  if (data.seed !== undefined) data.seed = safeSeed(data.seed);
  if (data.candidates !== undefined) data.candidates = Number(data.candidates);
  for (const key of ['cfg_scale', 'memory_budget_gib', 'nar_query_chunk_size']) if (data[key] !== undefined) data[key] = Number(data[key]);
  const offload = form.querySelector('[name=offload_ar]');
  if (offload) data.offload_ar = offload.checked;
  return data;
}

function safeSeed(value) {
  const seed = Number(value);
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error(t('error.seedRange'));
  return seed;
}

function kindLabel(kind) {
  const key = ({
    assistant: 'job.kind.assistant',
    rvc_import: 'job.kind.rvc_import', rvc_separate: 'job.kind.rvc_separate', rvc_train: 'job.kind.rvc_train',
    rvc_model_import: 'job.kind.rvc_model_import', rvc_model_export: 'job.kind.rvc_model_export',
    rvc_storage_move: 'job.kind.rvc_storage_move',
    generate: 'job.kind.generate', plan: 'job.kind.plan', render_plan: 'job.kind.render_plan',
    transcribe: 'job.kind.transcribe', semantic: 'job.kind.semantic', synthesize: 'job.kind.synthesize',
    decode: 'job.kind.decode', doctor: 'job.kind.doctor', voice_convert: 'job.kind.voice_convert', reference_cover: 'job.kind.reference_cover'
  })[kind];
  return key ? t(key) : kind;
}

function stageLabel(stage) {
  const key = ({
    queued: 'stage.queued', starting: 'stage.starting', candidate: 'stage.candidate',
    rvc_import: 'stage.rvc_import', rvc_separate: 'stage.rvc_separate',
    rvc_model_import: 'stage.rvc_model_import', rvc_model_export: 'stage.rvc_model_export',
    rvc_storage_copy: 'stage.rvc_storage_copy', rvc_storage_switch: 'stage.rvc_storage_switch',
    rvc_preflight: 'stage.rvc_preflight', rvc_preprocess: 'stage.rvc_preprocess', rvc_f0: 'stage.rvc_f0',
    rvc_features: 'stage.rvc_features', rvc_train: 'stage.rvc_train',
    rvc_index: 'stage.rvc_index', rvc_export: 'stage.rvc_export', rvc_infer: 'stage.rvc_infer',
    planning: 'stage.planning', semantic: 'stage.semantic',
    synthesis: 'stage.synthesis', decoding: 'stage.decoding',
    loading_transcriber: 'stage.loading_transcriber', transcribing: 'stage.transcribing',
    encoding: 'stage.encoding', notation: 'stage.notation',
    separating_vocals: 'stage.separating_vocals', loading_voice_model: 'stage.loading_voice_model',
    converting_voice: 'stage.converting_voice', remixing: 'stage.remixing',
    cancelling: 'stage.cancelling', complete: 'stage.complete', failed: 'stage.failed',
    cancelled: 'stage.cancelled', doctor: 'stage.doctor', running: 'stage.running'
  })[stage];
  return (key ? t(key) : null) || window.assistantStageLabel?.(stage) || stage;
}

function stageHint(job) {
  if (job.kind === 'rvc_storage_move') return t('job.hint.rvc_storage_move');
  if (job.kind === 'assistant') return t('job.hint.assistant');
  if (job.comparison_backend && ['loading_voice_model','converting_voice'].includes(job.stage)) return t('job.hint.comparison', {backend: job.comparison_backend === 'rvc' ? 'RVC' : 'Seed-VC'});
  const hints = {
    queued: 'job.hint.queued', starting: 'job.hint.starting',
    candidate: 'job.hint.candidate', planning: 'job.hint.planning',
    semantic: 'job.hint.semantic', synthesis: 'job.hint.synthesis',
    decoding: 'job.hint.decoding', loading_transcriber: 'job.hint.loading_transcriber',
    transcribing: 'job.hint.transcribing', encoding: 'job.hint.encoding',
    notation: 'job.hint.notation', doctor: 'job.hint.doctor',
    separating_vocals: 'job.hint.separating_vocals', loading_voice_model: 'job.hint.loading_voice_model',
    converting_voice: 'job.hint.converting_voice', remixing: 'job.hint.remixing',
    cancelling: 'job.hint.cancelling'
  };
  const hintKey = hints[job.stage];
  let hint = hintKey ? t(hintKey) : t('job.hint.running');
  if (job.candidate && job.candidates) hint += ` ${t('job.hint.candidateProgress', {candidate: job.candidate, candidates: job.candidates})}`;
  if (job.completed && job.total) hint += ` ${t('job.hint.stageProgress', {completed: job.completed, total: job.total})}`;
  if (job.window && job.windows) hint += ` ${t('job.hint.transcribeProgress', {window: job.window, windows: job.windows})}`;
  return hint;
}

function sourceLabel(source) {
  const key = ({webui: 'ui.source.webui', comfyui: 'ui.source.comfyui', api: 'ui.source.api'})[source];
  return key ? t(key) : t('ui.source.default');
}
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character])); }
function shortId(id = '') { return String(id).split('-').at(-1) || id; }
function formatClock(seconds) { const value = Math.max(0, Math.floor(seconds || 0)); return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function elapsed(job) { return formatClock(Date.now() / 1000 - (job.started_at || job.created_at || Date.now() / 1000)); }
function submittedAt(job) { return new Date(job.created_at * 1000).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}); }

function failureMarkup(error) {
  const id = error?.jobId;
  const job = error?.job || {};
  const oom = /out of memory/i.test(error?.message || '');
  const reason = oom ? t('error.oom') : error?.message || t('error.unknown');
  const generatedAudio = job.generated_result?.audio;
  const generatedRel = generatedAudio && id ? relativeAudio(job, generatedAudio) : null;
  const intermediate = generatedRel ? `<p>${t('result.generatedPreview')}</p><audio controls preload="metadata" src="${audioUrl(id, generatedRel)}"></audio>` : '';
  const phase = job.failed_stage ? `<p>${t('result.failedStage', {stage: escapeHtml(stageLabel(job.failed_stage))})}</p>` : '';
  const retry = id && ['generate', 'reference_cover', 'voice_convert', 'render_plan'].includes(job.kind) ? `<button class="primary compact" onclick="resumeJob('${id}', this)">${job.resumable ? t('result.resume') : t('result.rerun')}</button>` : '';
  const actions = id ? `<div class="toolbar failure-actions">${retry}<button class="ghost compact" onclick="toggleJobLog('${id}', this)">${t('ui.jobLog.view')}</button></div><pre class="job-log hidden"></pre>` : '';
  const retained = document.createElement('div');
  if (job.result?.comparison && job.result?.candidates?.length) renderJob(job, retained);
  return `<div class="result-card failure-card"><b class="status-failed">${job.status === 'cancelled' ? t('status.cancelled') : t('status.failed')}</b>${phase}<p>${escapeHtml(reason)}</p>${intermediate}${actions}</div>` + retained.innerHTML;
}

async function resumeJob(id, button) {
  button.disabled = true;
  try {
    const job = await api(`/api/jobs/${id}/resume`, {method: 'POST'});
    const panel = savedValue(`job-panel:${id}`) || button.closest('.panel')?.id;
    if (['create', 'plan', 'cover'].includes(panel)) savedValue(`job-panel:${job.id}`, panel);
    bindButton(button, job);
    await refreshWorkspace();
    $('#task-center').scrollIntoView({behavior: 'smooth', block: 'start'});
  } catch (error) { button.disabled = false; alert(error.message); }
}
window.resumeJob = resumeJob;

function renderLatestTask(jobs) {
  const job = jobs.find(item => ['generate', 'reference_cover', 'voice_convert', 'render_plan', 'decode'].includes(item.kind));
  if (!job) return;
  const target = $('#latest-task');
  if (!TERMINAL.has(job.status)) { target.classList.add('hidden'); displayedTerminal = null; return; }
  const signature = `${job.id}:${job.status}`;
  if (signature === displayedTerminal) return;
  displayedTerminal = signature;
  target.classList.remove('hidden');
  if (job.status === 'complete') renderJob(job, target);
  else target.innerHTML = failureMarkup({jobId: job.id, message: job.error, job});
}

async function toggleJobLog(id, button) {
  const target = button.closest('.failure-card, .history-card')?.querySelector('.job-log');
  if (!target) return;
  if (!target.classList.contains('hidden')) {
    target.classList.add('hidden'); button.textContent = t('ui.jobLog.view'); return;
  }
  button.disabled = true; button.textContent = t('ui.jobLog.loading');
  try {
    const data = await api(`/api/jobs/${id}/log`);
    target.textContent = data.text || t('ui.jobLog.empty'); target.classList.remove('hidden'); button.textContent = t('ui.jobLog.hide');
  } catch (error) { alert(error.message); button.textContent = t('ui.jobLog.view'); }
  finally { button.disabled = false; }
}

async function openDirectory(directory) {
  try { await api('/api/open-directory', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({directory})}); }
  catch (error) { alert(error.message); }
}
window.toggleJobLog = toggleJobLog;
window.openDirectory = openDirectory;

function renderModelSettings(data) {
  $('#model-directory').value = data.model_directory || '';
  $('#model-path-summary').textContent = t(data.using_default ? 'app.model.defaultDirectory' : 'app.model.customDirectory', {directory: data.model_directory});
  if (data.error) {
    $('#model-settings-result').textContent = t('app.model.configError', {message: data.error});
    $('#model-settings').open = true;
  }
}

async function loadModelSettings() {
  try { renderModelSettings(await api('/api/settings')); }
  catch (error) { $('#model-settings-result').textContent = t('app.model.readFailed', {message: error.message}); }
}

async function saveModelDirectory(value) {
  const button = $('#save-model-directory');
  button.disabled = true;
  $('#model-settings-result').textContent = t('app.model.saving');
  try {
    const data = await api('/api/settings', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({model_directory: value})
    });
    renderModelSettings(data);
    const ready = data.ready?.capabilities || {};
    const usable = ready.generation && ready.transcription && ready.voice_conversion;
    $('#model-settings-result').textContent = usable ? t('app.model.savedUsable') : t('app.model.savedIncomplete');
    await refreshWorkspace();
  } catch (error) {
    $('#model-settings-result').textContent = t('app.model.saveFailed', {message: error.message});
  } finally { button.disabled = false; }
}

function stepsFor(job) {
  if (job.kind === 'assistant') return '';
  const steps = {
    generate: [['starting', t('ui.step.loadModel')], ['planning', t('ui.step.composeScore')], ['semantic', t('ui.step.generateStructure')], ['synthesis', t('ui.step.synthesizeVocals')], ['decoding', t('ui.step.renderAudio')]],
    render_plan: [['starting', t('ui.step.loadModel')], ['semantic', t('ui.step.generateStructure')], ['synthesis', t('ui.step.synthesizeVocals')], ['decoding', t('ui.step.renderAudio')]],
    plan: [['starting', t('ui.step.loadModel')], ['planning', t('ui.step.composeScore')]],
    transcribe: [['starting', t('ui.step.prepareAudio')], ['loading_transcriber', t('ui.step.loadModel')], ['transcribing', t('ui.step.transcribeMelody')], ['notation', t('ui.step.prepareScore')]],
    semantic: [['starting', t('ui.step.loadModel')], ['planning', t('ui.step.checkScore')], ['semantic', t('ui.step.generateStructure')]],
    synthesize: [['starting', t('ui.step.loadModel')], ['synthesis', t('ui.step.synthesizeAudio')]], decode: [['starting', t('ui.step.loadModel')], ['decoding', t('ui.step.renderAudio')]],
    doctor: [['starting', t('ui.step.startCheck')], ['doctor', t('ui.step.verifyEnvironment')]],
    reference_cover: [['starting', t('ui.step.loadModel')], ['planning', t('ui.step.checkScore')], ['semantic', t('ui.step.generateStructure')], ['synthesis', t('ui.step.synthesizeSong')], ['decoding', t('ui.step.renderSong')], ['separating_vocals', t('ui.step.separateVocals')], ['loading_voice_model', t('ui.step.loadVoice')], ['converting_voice', t('ui.step.convertVoice')], ['remixing', t('ui.step.mix')]],
    voice_convert: [['starting', t('ui.step.prepareAudio')], ['separating_vocals', t('ui.step.separateVocals')], ['loading_voice_model', t('ui.step.loadVoiceModel')], ['converting_voice', t('ui.step.convertVoice')], ['remixing', t('ui.step.remix')]]
  }[job.kind] || [['starting', t('ui.step.prepare')], [job.stage, stageLabel(job.stage)]];
  const stage = job.stage === 'candidate' ? 'starting' : job.stage;
  const current = Math.max(0, steps.findIndex(([key]) => key === stage));
  return `<ol class="task-steps" aria-label="${t('ui.taskSteps')}">${steps.map(([, label], index) => `<li class="${index < current ? 'done' : index === current ? 'current' : ''}">${escapeHtml(label)}</li>`).join('')}</ol>`;
}

function setSubmitting(button) {
  if (!button) return;
  button.dataset.idleLabel ||= button.textContent.trim();
  button.disabled = true;
  button.textContent = t('ui.submitting');
}

function bindButton(button, job) {
  if (!button) return;
  button.dataset.jobId = job.id;
  buttonBindings.set(job.id, button);
  updateButton(button, job);
}

function restoreButton(button) {
  if (!button) return;
  const id = button.dataset.jobId;
  if (id) buttonBindings.delete(id);
  delete button.dataset.jobId;
  button.textContent = button.dataset.idleLabel || button.textContent;
  button.disabled = (button.id === 'transcribe-button' && !$('#cover-file').files[0]) ||
    (button.id === 'generate-reference-cover' &&
      (($('#voice-backend').value !== 'seed-vc' && !$('#rvc-cover-model').value) ||
       ($('#voice-backend').value !== 'rvc' && !$('#reference-file').files[0]) ||
       ($('#cover-mode').value === 'direct' && !$('#cover-file').files[0])));
}

function updateButton(button, job, queuePosition = 0) {
  if (!button || !job) return;
  button.disabled = !TERMINAL.has(job.status);
  if (job.status === 'queued') button.textContent = t('ui.button.queued', {position: queuePosition || '—'});
  else if (job.status === 'cancelling') button.textContent = t('ui.cancel.cancelling');
  else if (!TERMINAL.has(job.status)) button.textContent = t('ui.button.running', {kind: kindLabel(job.kind), stage: stageLabel(job.stage).replace(/^正在/, '')});
}

function updateBoundButtons(jobs, queued) {
  const byId = new Map(jobs.map(job => [job.id, job]));
  const positions = new Map(queued.map((job, index) => [job.id, index + 1]));
  for (const [id, button] of buttonBindings) {
    const job = byId.get(id);
    if (!job) continue;
    if (TERMINAL.has(job.status)) restoreButton(button); else updateButton(button, job, positions.get(id));
  }
}

/* Job summaries are produced once in Python, when the job is queued, and stored
 * -- so the stored string is frozen in whichever language was active then. The
 * server also sends a locale-neutral summary_key plus params (app/yue2_app/
 * service.py _summary_spec) so the text can be re-rendered in the language
 * selected now. Falls back to the stored string for jobs queued before this
 * existed, and for user-supplied summaries (style prompts) which carry no key. */
function jobSummary(job) {
  if (job && job.summary_key) return t(job.summary_key, job.summary_params || {});
  return (job && job.summary) || '';
}

function renderRunningJob(job) {
  const text = jobSummary(job);
  const summary = text ? `<p class="task-summary">${escapeHtml(text)}</p>` : '';
  return `<article class="running-job"><div class="task-card-head"><div><span class="task-type">${escapeHtml(t('result.runningNow', {kind: kindLabel(job.kind)}))}</span><b>${escapeHtml(stageLabel(job.stage))}</b></div><button class="danger compact" type="button" data-cancel-job="${escapeHtml(job.id)}" ${job.status === 'cancelling' ? 'disabled' : ''}>${job.status === 'cancelling' ? t('ui.cancel.cancelling') : t('ui.cancel.task')}</button></div><p class="task-hint">${escapeHtml(stageHint(job))}</p>${summary}${stepsFor(job)}<div class="task-meta"><span>${escapeHtml(sourceLabel(job.source))}</span><span>${t('result.elapsed', {time: elapsed(job)})}</span><span title="${escapeHtml(job.id)}">${t('result.jobShortId', {id: escapeHtml(shortId(job.id))})}</span></div></article>`;
}

function renderQueuedJob(job, index) {
  return `<li class="queue-job"><div class="queue-position"><b>${t('result.queuePosition', {position: index + 1})}</b><span>${t('stage.queued')}</span></div><div class="queue-copy"><b>${escapeHtml(kindLabel(job.kind))}</b><p>${escapeHtml(jobSummary(job) || t('result.waitingForPrevious'))}</p><small>${escapeHtml(sourceLabel(job.source))} · ${t('result.submittedAt', {time: submittedAt(job)})} · ${escapeHtml(shortId(job.id))}</small></div><button class="danger compact" type="button" data-cancel-job="${escapeHtml(job.id)}">${t('ui.cancel.queue')}</button></li>`;
}

function renderTaskCenter(healthData, jobs) {
  const active = jobs.filter(job => !TERMINAL.has(job.status));
  const current = jobs.find(job => job.id === healthData.current_job) || active.find(job => job.status !== 'queued');
  const queued = active.filter(job => job.id !== current?.id && job.status === 'queued').sort((a, b) => a.created_at - b.created_at);
  currentJobId = current?.id || null;
  $('#task-center').classList.toggle('hidden', !current && !queued.length);
  $('#running-section').classList.toggle('hidden', !current);
  $('#queue-section').classList.toggle('hidden', !queued.length);
  $('#running-job').innerHTML = current ? renderRunningJob(current) : '';
  $('#queue-title').textContent = t('result.queueTitle', {count: queued.length});
  $('#queue-list').innerHTML = queued.map(renderQueuedJob).join('');
  const workload = $('#task-center-jump');
  workload.classList.toggle('hidden', !current && !queued.length);
  workload.textContent = current ? t('result.workloadBusy', {queued: queued.length}) : t('result.workloadIdle', {queued: queued.length});
  const cover = jobs.find(job => job.kind === 'reference_cover' && !TERMINAL.has(job.status));
  if (cover && !$('#generate-reference-cover').dataset.jobId) bindButton($('#generate-reference-cover'), cover);
  updateBoundButtons(jobs, queued);
}

function renderHealth(data) {
  const ready = data.ready.capabilities?.generation && data.ready.capabilities?.transcription;
  $('#health-dot').className = `dot ${ready ? 'ok' : 'bad'}`;
  $('#health-title').textContent = ready ? t('app.health.ready') : t('app.health.incomplete');
  const renderer = data.ready.capabilities?.score_renderer ? t('app.health.scoreRendererReady') : t('app.health.scoreRendererMissing');
  const voice = data.ready.capabilities?.voice_conversion ? t('app.health.voiceReady') : t('app.health.voiceMissing');
  const missing = [];
  if (!data.ready.capabilities?.generation) missing.push(data.ready.upstream_source ? t('app.health.songModelMissing') : t('app.health.upstreamMissing'));
  if (!data.ready.capabilities?.transcription) missing.push(t('app.health.transcriptionMissing'));
  if (data.ready.settings_error) missing.unshift(t('app.health.settingsError'));
  $('#health-detail').textContent = `${missing.length ? missing.join(' · ') : t('app.health.generationReady')} · ${voice} · ${renderer}`;
  $('#model-path-summary').textContent = t('app.health.currentDirectory', {directory: data.ready.model_directory});
  if (!modelSettingsInitialized) {
    $('#model-settings').open = Boolean(data.ready.settings_error || !data.ready.capabilities?.generation);
    modelSettingsInitialized = true;
  }
}

async function refreshWorkspace() {
  if (workspaceRefreshing) return;
  workspaceRefreshing = true;
  try {
    const [healthData, listData] = await Promise.all([api('/api/health'), api('/api/jobs?limit=100')]);
    renderHealth(healthData); renderTaskCenter(healthData, listData.jobs); renderLatestTask(listData.jobs); renderPanelResults(listData.jobs);
  } catch (error) {
    $('#health-dot').className = 'dot bad'; $('#health-title').textContent = t('app.health.offline');
    $('#health-detail').textContent = t('app.health.retrying', {message: error.message});
  } finally { workspaceRefreshing = false; }
}

async function submit(kind, request, resultTarget, button = null) {
  setSubmitting(button);
  try {
    if (['generate', 'plan', 'render_plan'].includes(kind)) request.memory_budget_gib = generationMemoryBudget();
    if (kind === 'reference_cover') request.generate.memory_budget_gib = generationMemoryBudget();
    const clientRequestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const job = await api('/api/jobs', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({kind, request, source: 'webui', client_request_id: clientRequestId, result_panel: resultTarget?.closest('.panel')?.id})});
    rememberResult(job, resultTarget);
    bindButton(button, job); await refreshWorkspace(); return await waitForJob(job.id, resultTarget);
  } catch (error) { restoreButton(button); throw error; }
}

async function waitForJob(id, resultTarget) {
  let connectionErrors = 0;
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 900));
    let job;
    try { job = await api(`/api/jobs/${id}`); connectionErrors = 0; }
    catch (error) { if (++connectionErrors >= 10) throw new Error(t('error.serviceDisconnected', {message: error.message})); continue; }
    await refreshWorkspace();
    if (job.status === 'complete') {
      restoreButton(buttonBindings.get(id));
      await Promise.all([refreshWorkspace(), loadHistory()]); return job;
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      restoreButton(buttonBindings.get(id));
      await Promise.all([refreshWorkspace(), loadHistory()]);
      const failure = new Error(job.error || stageLabel(job.status)); failure.jobId = job.id; failure.job = job; throw failure;
    }
  }
}

function audioUrl(jobId, relative) { return `/api/files/${jobId}/${relative.split('/').map(encodeURIComponent).join('/')}`; }
function relativeAudio(job, path) {
  const normalized = String(path || '').replaceAll('\\', '/'); const marker = `/jobs/${job.id}/`;
  const jobIndex = normalized.toLowerCase().indexOf(marker.toLowerCase()); if (jobIndex >= 0) return normalized.slice(jobIndex + marker.length);
  const artifactIndex = normalized.toLowerCase().lastIndexOf('/artifacts/'); return artifactIndex >= 0 ? normalized.slice(artifactIndex + 1) : null;
}

function voiceDescription(result) {
  if (!result.backend) return '';
  if (result.backend === 'compare') return t('result.backendCompare');
  const shift = result.settings?.semi_tone_shift;
  const pitch = result.backend === 'rvc' && Number.isInteger(shift) ? ` · ${shift === 0 ? t('result.pitchOriginal') : t('result.pitchSemitones', {shift: (shift > 0 ? '+' : '') + shift})}` : '';
  return escapeHtml((result.backend === 'rvc' ? t('result.backendRvc') : t('result.backendSeedVc')) + (result.voice_name ? ` · ${result.voice_name}` : '') + pitch);
}

function stemPlayers(job, result) {
  const players = [['separated_vocal', t('result.stemSeparatedVocal')],['converted_vocal', t('result.stemConvertedVocal')],['accompaniment', t('result.stemAccompaniment')]].map(([key,label]) => {
    const relative = relativeAudio(job, result[key]);
    if (!relative) return '';
    const url = audioUrl(job.id, relative);
    return `<div class="stem-player"><b>${label}</b><audio controls preload="none" src="${url}"></audio><a class="ghost compact" href="${url}" download>${t('result.downloadStem', {stem: label})}</a></div>`;
  }).join('');
  return players ? `<details class="stem-previews"><summary>${t('result.stemPreviews')}</summary>${players}</details>` : '';
}

function renderJob(job, target) {
  const result = job.result || {}; const candidates = result.candidates || (result.audio ? [{seed: result.seed, audio: result.audio, audio_seconds: result.audio_seconds || result.audio_info?.duration_seconds, truncated: result.truncated}] : []);
  if (!candidates.length) { target.innerHTML = `<div class="result-card"><b>${t('result.complete')}</b><pre class="meta">${escapeHtml(JSON.stringify(result, null, 2))}</pre></div>`; return; }
  const partial = result.partial ? `<div class="result-card">${t(result.comparison ? 'result.partialConverted' : 'result.partialVersions', {completed: result.completed_candidates, requested: result.requested_candidates})}${result.failures?.length ? t('result.partialFailureReason', {error: escapeHtml(result.failures[0].error)}) : t('result.partialRemaining')}</div>` : '';
  target.innerHTML = partial + candidates.map((candidate, index) => {
    const rel = relativeAudio(job, candidate.audio); const truncated = candidate.truncated && Object.values(candidate.truncated).some(Boolean);
    const url = rel ? audioUrl(job.id, rel) : '';
    const player = url ? `<audio controls preload="metadata" src="${url}"></audio>` : '';
    const duration = Number(candidate.audio_seconds || candidate.audio_info?.duration_seconds);
    const details = [voiceDescription({...result,...candidate}), candidates.length > 1 ? t('result.versionNumber', {index: index + 1}) : '', Number.isFinite(duration) && duration > 0 ? t('result.durationSeconds', {seconds: duration.toFixed(1)}) : '', candidate.seed != null ? `Seed ${escapeHtml(candidate.seed)}` : '', t('result.jobShortId', {id: escapeHtml(shortId(job.id))})].filter(Boolean).join(' · ');
    const download = url ? `<a class="ghost audio-download" href="${url}" download="YuE2-${job.id}-${index + 1}.flac">${t('result.downloadAudio')}</a>` : '';
    return `<article class="result-card"><header><div><b>${escapeHtml(t('result.readyToPlay', {kind: kindLabel(job.kind)}))}</b><div class="meta">${details}</div></div><span class="badge">${truncated ? t('result.truncated') : t('result.full')}</span></header>${player}<div class="toolbar">${download}${TERMINAL.has(job.status) ? `<button class="ghost" onclick="exportJob('${job.id}')">${t('result.exportAll')}</button>` : ''}</div>${stemPlayers(job,{...result,...candidate})}</article>`;
  }).join('');
}

async function exportJob(id) {
  try { const data = await api('/api/export', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({job_id: id})}); alert(t('result.exported', {destination: data.destination})); }
  catch (error) { alert(error.message); }
}
window.exportJob = exportJob;

$$('.tab').forEach(button => button.onclick = () => {
  savedValue('active-tab', button.dataset.tab);
  $$('.tab').forEach(item => item.classList.toggle('active', item === button));
  $$('.panel').forEach(panel => panel.classList.toggle('active', panel.id === button.dataset.tab));
  if (button.dataset.tab === 'history') loadHistory();
});
const restoredTab = savedValue('active-tab');
if (['create', 'plan', 'cover', 'history', 'assistant', 'voices'].includes(restoredTab)) $(`.tab[data-tab="${restoredTab}"]`).click();

function openHistory() { $('.tab[data-tab="history"]').click(); $('#history').scrollIntoView({behavior: 'smooth', block: 'start'}); }
function openTaskCenter() { $('#task-center').scrollIntoView({behavior: 'smooth', block: 'nearest'}); }
document.addEventListener('click', event => {
  const cancel = event.target.closest('[data-cancel-job]'); if (cancel) cancelJob(cancel.dataset.cancelJob, cancel);
});
$('#open-history').onclick = openHistory;
$('#task-center-jump').onclick = openTaskCenter;
$('#model-settings-form').onsubmit = event => {
  event.preventDefault();
  saveModelDirectory($('#model-directory').value);
};
$('#default-model-directory').onclick = async () => {
  try {
    const data = await api('/api/settings');
    $('#model-directory').value = data.default_model_directory;
    await saveModelDirectory(data.default_model_directory);
  } catch (error) { $('#model-settings-result').textContent = t('app.model.restoreFailed', {message: error.message}); }
};

$('#create-form').onsubmit = async event => {
  event.preventDefault(); $('#create-result').innerHTML = '';
  try { await submit('generate', formObject(event.target), $('#create-result'), $('#create-button')); }
  catch (error) { $('#create-result').innerHTML = failureMarkup(error); }
};

$('#plan-form').onsubmit = async event => {
  event.preventDefault();
  const revision = window.assistantDraftRevision?.('plan');
  try {
    const request = formObject(event.target); request.backend = 'torch-eager';
    const job = await submit('plan', request, null, $('#plan-button'));
    const apply = () => {
      planState = {...job.result, request, source: 'saved_exact'};
      $('#plan-abc').value = job.result.abc || ''; $('#plan-exact').disabled = false; $('#plan-exact').checked = true; $('#plan-abc').disabled = true;
      $('#plan-badge').textContent = job.result.truncated ? t('result.planTruncated') : t('result.planOriginal'); $('#plan-workbench').classList.remove('hidden');
      window.assistantDraftChanged?.('plan');
    };
    if (window.assistantDraftRevision?.('plan') === revision) apply();
    else {
      const notice = document.createElement('div'); notice.className = 'result-card'; notice.textContent = t('result.planDraftConflict');
      const button = document.createElement('button'); button.className = 'ghost'; button.textContent = t('result.loadPlan'); button.onclick = () => { if (confirm(t('ui.confirm.replaceScoreDraft'))) apply(); };
      notice.append(button); $('#plan-result').append(notice);
    }
  } catch (error) { $('#plan-result').innerHTML = failureMarkup(error); }
};

$('#plan-exact').onchange = event => { $('#plan-abc').disabled = event.target.checked; };
$('#plan-abc').disabled = true;
$('#render-plan').onclick = async () => {
  if (!planState) return;
  if (planState.source === 'imported_abc') {
    try {
      const request = {...formObject($('#plan-form')), abc: $('#plan-abc').value, candidates: 1};
      await api('/api/assistant/validate-abc', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({abc: request.abc, cot: request.cot})});
      await submit('generate', request, $('#plan-result'), $('#render-plan'));
    } catch (error) { $('#plan-result').innerHTML = failureMarkup(error); }
    return;
  }
  const exact = $('#plan-exact').checked; const request = {plan_dir: planState.plan_dir, exact, backend: 'torch-eager'};
  if (!exact) Object.assign(request, planState.request, {abc: $('#plan-abc').value, candidates: 1});
  try { await submit('render_plan', request, $('#plan-result'), $('#render-plan')); }
  catch (error) { $('#plan-result').innerHTML = failureMarkup(error); }
};
$('#download-abc').onclick = () => { const blob = new Blob([$('#plan-abc').value], {type: 'text/plain;charset=utf-8'}); const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = 'score.abc'; anchor.click(); URL.revokeObjectURL(anchor.href); };

function bindUploadPreview(inputSelector, dropSelector, previewSelector, buttonSelector) {
  const input = $(inputSelector), drop = $(dropSelector), preview = $(previewSelector);
  const audio = preview.querySelector('audio'), status = preview.querySelector('[data-preview-status]');
  const defaultName = drop.querySelector('b').textContent, defaultStatus = status.textContent;
  let objectUrl = null;
  const release = () => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  };
  input.onchange = () => {
    release();
    const file = input.files[0], button = $(buttonSelector);
    button.disabled = !file || Boolean(button.dataset.jobId);
    drop.querySelector('b').textContent = file ? file.name : defaultName;
    preview.classList.toggle('hidden', !file);
    status.textContent = defaultStatus;
    if (file) {
      objectUrl = URL.createObjectURL(file);
      audio.src = objectUrl;
      audio.load();
    }
  };
  preview.querySelector('[data-replace]').onclick = () => input.click();
  audio.addEventListener('play', () => {
    $$('.upload-preview audio').forEach(other => { if (other !== audio) other.pause(); });
  });
  audio.addEventListener('error', () => {
    if (objectUrl && audio.error) status.textContent = t('error.previewUnsupported');
  });
  window.addEventListener('pagehide', event => { if (!event.persisted) release(); });
}

function updateMessage(message, state = '') {
  const action = $('.update-action');
  action.classList.toggle('available', state === 'available');
  action.classList.toggle('installing', state === 'installing');
  $('#update-status').textContent = message;
}

async function checkUpdate({quiet = false} = {}) {
  if (updateInstalling) return;
  const button = $('#update-button');
  button.disabled = true;
  if (!quiet) updateMessage(t('update.checking'));
  try {
    const result = await api('/api/update/check');
    availableUpdate = result.update_available ? result : null;
    if (availableUpdate) {
      button.textContent = t('update.toVersion', {version: result.latest_version});
      updateMessage(t('update.available', {version: result.current_version}), 'available');
    } else {
      button.textContent = t('update.checkAgain');
      updateMessage(t('update.upToDate', {version: result.current_version}));
    }
  } catch (error) {
    availableUpdate = null;
    button.textContent = t('update.recheck');
    updateMessage(t('update.checkFailed', {message: error.message}));
  } finally {
    button.disabled = false;
  }
}

async function waitForUpdatedService(version) {
  const deadline = Date.now() + 60 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 900));
    try {
      const health = await api('/api/health');
      const status = await api('/api/update/status');
      if (status.state === 'error') throw new Error(status.message || t('error.updateFailed'));
      if (health.version === version && status.state === 'complete') {
        updateMessage(t('update.updated', {version}), 'installing');
        setTimeout(() => location.reload(), 700);
        return;
      }
      if (status.message) updateMessage(status.message, 'installing');
      if (status.state === 'complete' && health.version !== version) {
        throw new Error(t('error.staleServiceVersion', {version: health.version}));
      }
    } catch (error) {
      const connectionLost = t('error.serviceDisconnected', {message: ''}).trim();
      if (!String(error.message).includes('Failed to fetch') && !String(error.message).includes(connectionLost)) {
        throw error;
      }
      updateMessage(t('update.installing', {version}), 'installing');
    }
  }
  throw new Error(t('error.updateIncomplete'));
}

async function installUpdate() {
  if (!availableUpdate) return checkUpdate();
  const button = $('#update-button');
  updateInstalling = true;
  button.disabled = true;
  button.textContent = t('update.downloading');
  updateMessage(t('update.downloadingVersion', {version: availableUpdate.latest_version}), 'installing');
  try {
    const result = await api('/api/update/install', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    button.textContent = t('update.restarting');
    await waitForUpdatedService(result.target_version);
  } catch (error) {
    updateInstalling = false;
    button.disabled = false;
    button.textContent = t('update.recheck');
    availableUpdate = null;
    updateMessage(t('update.incomplete', {message: error.message}));
  }
}
bindUploadPreview('#cover-file', '#drop-zone', '#cover-preview', '#transcribe-button');
function setCoverMode(mode) {
  const direct = mode === 'direct';
  $('#cover-mode').value = direct ? 'direct' : 'generate';
  $('#transcribe-button').classList.toggle('hidden', direct);
  $('#cover-generation-fields').classList.toggle('hidden', direct);
  $('#cover-regenerate-choice').classList.toggle('hidden', direct);
  $('#cover .creation-options').style.gridTemplateColumns = direct ? '1fr' : '';
  if (direct) $('#cover-review').classList.remove('hidden');
  $('#cover-mode-hint').textContent = t(direct ? 'ui.coverModeHint.direct' : 'ui.coverModeHint.generate');
  $('#cover-voice-hint').textContent = t(direct ? 'ui.coverVoiceHint.direct' : 'ui.coverVoiceHint.generate');
  const button = $('#generate-reference-cover');
  button.dataset.idleLabel = t(direct ? 'ui.coverAction.direct' : 'ui.coverAction.generate');
  if (!button.dataset.jobId) restoreButton(button);
  savedValue('cover-mode', $('#cover-mode').value);
}
window.setCoverMode = setCoverMode;
$('#cover-mode').onchange = () => { setCoverMode($('#cover-mode').value); window.assistantDraftChanged?.('cover'); };
setCoverMode(savedValue('cover-mode') || 'generate');
$('#cover-file').addEventListener('change', () => {
  if (!$('#generate-reference-cover').dataset.jobId) restoreButton($('#generate-reference-cover'));
});
$('#transcribe-button').onclick = async () => {
  const file = $('#cover-file').files[0]; if (!file) return; const button = $('#transcribe-button');
  const revision = window.assistantDraftRevision?.('cover');
  try {
    setSubmitting(button); button.textContent = t('ui.uploading');
    const upload = await api(`/api/uploads?filename=${encodeURIComponent(file.name)}`, {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: file});
    const job = await submit('transcribe', {source_path: upload.path, melody_only: true, dtype: 'bf16', preset: 'default'}, null, button);
    if (window.assistantDraftRevision?.('cover') === revision) {
      $('#cover-abc').value = job.result.abc || ''; $('#cover-review').classList.remove('hidden'); window.assistantDraftChanged?.('cover');
    } else {
      const notice = document.createElement('div'); notice.className = 'result-card'; notice.textContent = t('result.transcribeDraftConflict');
      const apply = document.createElement('button'); apply.className = 'ghost'; apply.textContent = t('result.loadTranscription'); apply.onclick = () => { if (confirm(t('ui.confirm.replaceMelodyAbc'))) { $('#cover-abc').value = job.result.abc || ''; $('#cover-review').classList.remove('hidden'); window.assistantDraftChanged?.('cover'); } };
      notice.append(apply); $('#cover-result').append(notice);
    }
  } catch (error) { restoreButton(button); $('#cover-result').innerHTML = failureMarkup(error); }
};
$('#generate-cover').onclick = async () => {
  let seed; try { seed = safeSeed($('#cover-seed').value); } catch (error) { return alert(error.message); }
  const request = {style: $('#cover-style').value, lyrics: $('#cover-lyrics').value, abc: $('#cover-abc').value, cot: 'melody', seed, cfg_scale: 1, backend: 'torch-eager', candidates: 1};
  if (!request.lyrics.trim() && $('#cover').dataset.instrumental !== 'true') return alert(t('error.lyricsRequired'));
  if (!request.abc.trim()) return alert(t('error.abcRequired'));
  try { await submit('generate', request, $('#cover-result'), $('#generate-cover')); }
  catch (error) { $('#cover-result').innerHTML = failureMarkup(error); }
};

bindUploadPreview('#reference-file', '#reference-drop-zone', '#reference-preview', '#generate-reference-cover');
$('#reference-file').addEventListener('change', () => {
  if (!$('#generate-reference-cover').dataset.jobId) restoreButton($('#generate-reference-cover'));
});

$('#generate-reference-cover').onclick = async () => {
  const direct = $('#cover-mode').value === 'direct', source = $('#cover-file').files[0];
  if (direct && !source) return alert(t('error.sourceSongRequired'));
  if (!direct && $('#cover').dataset.instrumental === 'true') return alert(t('error.instrumentalNoVoice'));
  const reference = $('#reference-file').files[0];
  const backend = $('#voice-backend').value;
  if (backend !== 'rvc' && !reference) return alert(t('error.referenceVoiceRequired'));
  if (backend !== 'seed-vc' && !$('#rvc-cover-model').value) return alert(t('error.rvcModelRequired'));
  let seed;
  try { if (!direct) { seed = safeSeed($('#cover-seed').value); generationMemoryBudget(); } } catch (error) { return alert(error.message); }
  const generate = {style: $('#cover-style').value, lyrics: $('#cover-lyrics').value, abc: $('#cover-abc').value, cot: 'melody', seed, cfg_scale: 1, backend: 'torch-eager', candidates: 1, offload_ar: true, nar_query_chunk_size: 256, nar_attention: 'sdpa'};
  if (!direct && !generate.lyrics.trim()) return alert(t('error.lyricsRequired'));
  if (!direct && !generate.abc.trim()) return alert(t('error.abcRequired'));
  const button = $('#generate-reference-cover');
  setSubmitting(button);
  try {
    $('#cover-result').innerHTML = '';
    const upload = backend !== 'rvc' ? await api(`/api/uploads?filename=${encodeURIComponent(reference.name)}`, {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: reference}) : null;
    const voice = {backend, reference_path: upload?.path,
      voice_id: $('#rvc-cover-model').value, speaker_id: Number($('#rvc-cover-speaker').value),
      index_rate: Number($('#rvc-index-rate').value), protect: Number($('#rvc-protect').value),
      rvc_pitch_shift: Number($('#rvc-pitch-shift').value),
      diffusion_steps: Number($('#voice-steps').value), cfg_rate: Number($('#voice-cfg').value),
      semi_tone_shift: Number($('#voice-shift').value), auto_f0_adjust: $('#voice-auto-f0').checked,
      vocal_gain_db: Number($('#voice-gain').value), accompaniment_gain_db: Number($('#backing-gain').value)};
    if (direct) {
      const uploaded = await api(`/api/uploads?filename=${encodeURIComponent(source.name)}`, {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: source});
      await submit('voice_convert', {...voice, source_path: uploaded.path}, $('#cover-result'), button);
    } else await submit('reference_cover', {generate, voice}, $('#cover-result'), button);
  } catch (error) { restoreButton(button); $('#cover-result').innerHTML = failureMarkup(error); }
};

function firstResultAudio(job) {
  return job.result?.audio || job.result?.candidates?.[0]?.audio;
}

async function loadHistory() {
  try {
    const {jobs} = await api('/api/jobs?limit=100');
    $('#history-list').innerHTML = jobs.map(job => {
      const result = job.result || {}; const audio = relativeAudio(job, result.audio || result.candidates?.[0]?.audio);
      const exportButton = (job.status === 'complete' || (TERMINAL.has(job.status) && result.comparison && result.candidates?.length)) && job.result ? `<button class="ghost" onclick="exportJob('${job.id}')">${t('result.export')}</button>` : '';
      const retryButton = ['failed', 'cancelled'].includes(job.status) && ['generate', 'reference_cover', 'voice_convert', 'render_plan', 'rvc_train', 'rvc_import', 'rvc_separate', 'rvc_storage_move'].includes(job.kind) ? `<button class="ghost compact" onclick="resumeJob('${job.id}', this)">${job.resumable || ['rvc_train','rvc_storage_move'].includes(job.kind) ? t('result.resume') : t('result.rerun')}</button>` : '';
      const logButtons = (job.kind === 'assistant' ? `<button class="ghost compact" onclick="openAssistantJob('${job.id}')">${t('result.openAssistant')}</button>` : '') + (job.status === 'failed' ? `<button class="ghost compact" onclick="toggleJobLog('${job.id}', this)">${t('ui.jobLog.view')}</button><button class="ghost compact" onclick="openDirectory('logs')">${t('ui.openLogsDirectory')}</button>` : '');
      const comparison = result.comparison ? (result.candidates || []).map(candidate => {
        const rel = relativeAudio(job, candidate.audio);
        return `<div class="comparison-result"><p class="meta">${voiceDescription(candidate)}</p>${rel ? `<audio controls preload="none" src="${audioUrl(job.id,rel)}"></audio><a class="ghost compact" href="${audioUrl(job.id,rel)}" download>${t('result.downloadAudio')}</a>` : ''}${stemPlayers(job,candidate)}</div>`;
      }).join('') : '';
      return `<article class="history-card"><header><div><b>${escapeHtml(kindLabel(job.kind))}</b><div class="meta">${escapeHtml(job.id)} · ${new Date(job.created_at * 1000).toLocaleString()} · ${escapeHtml(sourceLabel(job.source))}</div></div></header><b class="status-${job.status}">${escapeHtml(job.status === 'running' ? stageLabel(job.stage) : stageLabel(job.status))}</b>${job.error ? `<div class="meta">${escapeHtml(job.error)}</div>` : ''}${!result.comparison && audio ? `<audio controls preload="none" src="${audioUrl(job.id, audio)}"></audio>` : ''}<p class="meta">${voiceDescription(result)}</p>${comparison || stemPlayers(job,result)}<div class="toolbar">${exportButton}${retryButton}${logButtons}</div><pre class="job-log hidden"></pre></article>`;
    }).join('') || `<p class="meta">${t('result.historyEmpty')}</p>`;
  } catch (error) { $('#history-list').innerHTML = `<p class="status-failed">${escapeHtml(error.message)}</p>`; }
}

async function loadRetention() {
  try {
    const data = await api('/api/retention'); const total = ['jobs', 'uploads', 'logs'].reduce((sum, key) => sum + (data.usage[key]?.gib || 0), 0);
    $('#storage-usage').textContent = t('result.storageUsage', {total: total.toFixed(2)});
  } catch (error) { $('#storage-usage').textContent = t('error.storageStatus', {message: error.message}); }
}

async function cleanupStorage() {
  try {
    const report = await api('/api/retention/cleanup', {method: 'POST'}); const deleted = Object.values(report.deleted || {}).reduce((sum, items) => sum + items.length, 0);
    alert(t('result.cleanupDone', {count: deleted})); await Promise.all([loadHistory(), loadRetention()]);
  } catch (error) { alert(error.message); }
}

async function cancelJob(id, button = null, force = false) {
  if (!id) return;
  if (button) { button.disabled = true; button.textContent = t('ui.cancel.cancelling'); }
  try { await api(`/api/jobs/${id}/cancel`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({force})}); await refreshWorkspace(); }
  catch (error) { if (button) button.disabled = false; alert(error.message); }
}
window.cancelJob = cancelJob;

$('#cancel-active').onclick = () => cancelJob(currentJobId);
$('#refresh-history').onclick = () => { loadHistory(); loadRetention(); };
$('#cleanup-storage').onclick = cleanupStorage;
$('#doctor-button').onclick = async () => {
  const button = $('#doctor-button'); const action = $('.doctor-action');
  try { const job = await submit('doctor', {verify_hashes: true}, null, button); action.dataset.result = t('result.doctorOk', {gpu: job.result.gpu, cuda: job.result.torch_cuda}); }
  catch (error) { action.dataset.result = t('result.doctorFailed', {message: error.message}); }
};
$('#update-button').onclick = () => availableUpdate ? installUpdate() : checkUpdate();

refreshWorkspace(); loadModelSettings(); loadHistory(); loadRetention();
setTimeout(() => checkUpdate({quiet: true}), 500);
setInterval(refreshWorkspace, 1200);

// Language switch: JS-built cards keep the strings they were rendered with, so
// the renderers have to run again. The render signatures are cleared first,
// otherwise the cached result panels and the latest-task card would be skipped.
// Every call below is async and tolerates data that has not loaded yet, and the
// elements setCoverMode() touches are static markup, so this cannot throw.
document.addEventListener('yue2:locale', () => {
  panelStates.clear();
  displayedTerminal = null;
  // Submit buttons remember the label they had before the job started; for the
  // ones whose label comes from the dictionary, re-derive it so restoreButton()
  // does not put the previous language back.
  for (const button of $$('button[data-idle-label]')) {
    const key = button.getAttribute('data-i18n');
    if (key) button.dataset.idleLabel = t(key);
  }
  setCoverMode($('#cover-mode').value || 'generate');
  refreshWorkspace();
  loadHistory();
  loadRetention();
  // Rebuilds the update button and status line, which i18n.apply() has just
  // reset to the static markup text.
  checkUpdate({quiet: true});
});
