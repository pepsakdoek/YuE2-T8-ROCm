/* Standalone WebUI only. Drafts are revisioned; credentials never enter them. */
const assistant = {config: null, defaults: {}, result: null, job: null, polling: false, originalLyrics: '', resultEdited: false, resultJobId: null,
  drafts: {}, providers: {}, localModels: [], remoteModels: {}, providerSelections: {}, providerBaseUrls: {}, providerCredentials: {}, activeProvider: null,
  ticks: {assistant: 0, create: 0, plan: 0, cover: 0}, queues: {}, timers: {}, undo: null, sending: null};
const assistantPost = (path, value) => api(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});
/* Every status string written through assistantTextKey is remembered (its key,
 * its params and the text it produced) so that a locale change can translate it
 * again. The remembered text doubles as the guard: an element whose current text
 * no longer matches was rewritten by something else and is left alone. */
const assistantStatusKeys = new Map();
const assistantText = (id, text) => { $(id).textContent = text; assistantStatusKeys.delete(id); };
function assistantTextKey(id, key, params) {
  const element = $(id); if (!element) return;
  const text = t(key, params);
  element.textContent = text; assistantStatusKeys.set(id, {key, params, text});
}
const cloneText = value => JSON.parse(JSON.stringify(value));
const formFields = form => Object.fromEntries([...form.elements].filter(el => el.name).map(el => [el.name, el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value]));
function putFields(form, fields) {
  for (const [key, value] of Object.entries(fields || {})) {
    const el = form.elements.namedItem(key); if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(value); else el.value = value ?? '';
  }
}
function assistantValues() {
  const values = {...assistant.defaults, ...formFields($('#assistant-form'))};
  if ($('#assistant-form').elements.lyrics.value === assistant.originalLyrics.replace(/\r\n?/g, '\n')) values.lyrics = assistant.originalLyrics;
  return values;
}
function readAssistantResult() {
  if (!assistant.result) return null;
  const r = {...assistant.result};
  for (const key of ['style', 'lyrics', 'abc']) {
    const text = $(`#assistant-result-${key}`).value;
    r[key] = String(r[key] || '').replace(/\r\n?/g, '\n') === text ? r[key] : text;
  }
  return r;
}
function captureDraft(panel) {
  if (panel === 'assistant') return {values: assistantValues(), result: readAssistantResult(), job_id: assistant.job?.id || null, result_edited: assistant.resultEdited, result_job_id: assistant.resultJobId};
  if (panel === 'create') return {form: formFields($('#create-form'))};
  if (panel === 'plan') return {form: formFields($('#plan-form')), abc: $('#plan-abc').value,
    exact: $('#plan-exact').checked, plan: planState ? {source: planState.source || 'saved_exact', plan_dir: planState.plan_dir || null, request: planState.request || {}} : null};
  return {abc: $('#cover-abc').value, lyrics: $('#cover-lyrics').value, style: $('#cover-style').value,
    seed: $('#cover-seed').value, mode: $('#cover-mode').value, instrumental: $('#cover').dataset.instrumental === 'true', visible: !$('#cover-review').classList.contains('hidden')};
}
function applyDraft(panel, draft) {
  if (!draft || !Object.keys(draft).length) return;
  if (panel === 'assistant') {
    putFields($('#assistant-form'), draft.values);
    assistant.originalLyrics = draft.values?.lyrics || '';
    if (draft.result) showAssistantResult(draft.result);
    assistant.resultEdited = Boolean(draft.result_edited); assistant.resultJobId = draft.result_job_id || null;
    if (draft.job_id) assistant.job = {id: draft.job_id};
  } else if (panel === 'create') {
    putFields($('#create-form'), draft.form); updateInstrumental('create');
  } else if (panel === 'plan') {
    putFields($('#plan-form'), draft.form);
    planState = draft.plan || null;
    $('#plan-abc').value = draft.abc || '';
    const imported = planState?.source === 'imported_abc';
    $('#plan-exact').checked = Boolean(draft.exact && !imported);
    $('#plan-exact').disabled = imported;
    $('#plan-abc').disabled = $('#plan-exact').checked;
    assistantTextKey('#plan-badge', imported ? 'assistant.plan.badge.imported' : 'assistant.plan.badge.original');
    $('#plan-workbench').classList.toggle('hidden', !planState);
    updateInstrumental('plan');
  } else {
    for (const key of ['abc', 'lyrics', 'style', 'seed']) if (draft[key] !== undefined) $(`#cover-${key}`).value = draft[key];
    $('#cover').dataset.instrumental = String(Boolean(draft.instrumental));
    $('#cover-review').classList.toggle('hidden', !draft.visible);
    window.setCoverMode?.(draft.mode || 'generate');
    updateInstrumental('cover');
  }
}
function savePanel(panel, value) {
  if (assistant.drafts[panel]?.error) return Promise.reject(new Error(assistant.drafts[panel].error));
  const snapshot = cloneText(value || captureDraft(panel));
  const operation = (assistant.queues[panel] || Promise.resolve()).catch(() => {}).then(async () => {
    const revision = assistant.drafts[panel]?.revision ?? 0;
    const saved = await assistantPost('/api/assistant/drafts', {panel, revision, draft: snapshot});
    assistant.drafts[panel] = saved;
    return saved;
  });
  assistant.queues[panel] = operation;
  return operation;
}
function changedDraft(panel) {
  assistant.ticks[panel]++;
  clearTimeout(assistant.timers[panel]);
  assistant.timers[panel] = setTimeout(() => savePanel(panel).then(() => {
    if (panel === 'assistant') assistantTextKey('#assistant-draft-status', 'assistant.draft.saved');
  }).catch(error => assistantTextKey('#assistant-draft-status', 'assistant.draft.unsaved', {error: error.message})), 650);
}
window.assistantDraftRevision = panel => assistant.ticks[panel];
window.assistantDraftChanged = changedDraft;
window.assistantCaptureDraft = captureDraft;
function updateInstrumental(panel) {
  if (panel === 'cover') {
    const instrumental = $('#cover').dataset.instrumental === 'true';
    $('#generate-reference-cover').disabled = instrumental || !$('#reference-file').files[0];
    $('#generate-reference-cover').title = instrumental ? t('assistant.cover.instrumentalTitle') : '';
    return;
  }
  const form = $(`#${panel}-form`);
  const instrumental = form.elements.instrumental?.checked || false;
  form.elements.lyrics.required = !instrumental;
}
function addInstrumentalControl(panel) {
  const form = $(`#${panel}-form`), label = document.createElement('label');
  label.className = 'check wide';
  label.innerHTML = `<input name="instrumental" type="checkbox">${t('assistant.field.instrumental')}`;
  form.append(label);
}
function showAssistantResult(result) {
  assistant.resultEdited = false;
  assistant.resultJobId = assistant.job?.id || null;
  assistant.result = {style: result.style || '', lyrics: result.lyrics || '', abc: result.abc || '',
    cot: result.cot || result.request?.cot || assistantValues().cot, instrumental: result.instrumental ?? result.fields?.instrumental ?? false,
    abc_status: result.abc_status || 'not_requested', outcome: result.outcome || 'in_progress',
    report: result.report || {}, requests: result.requests || 0};
  $('#assistant-result').classList.remove('hidden');
  for (const key of ['style', 'lyrics', 'abc']) $(`#assistant-result-${key}`).value = assistant.result[key];
  const partial = result.outcome === 'partial_success';
  assistantTextKey('#assistant-outcome', partial ? 'assistant.outcome.partial' : result.outcome === 'success' ? 'assistant.outcome.success' : 'assistant.outcome.saved');
  assistantTextKey('#assistant-result-note', 'assistant.resultNote.initial');
  renderAbcState();
  assistantText('#assistant-report', JSON.stringify(result.report || result, null, 2));
}
function renderAbcState() {
  /* Server abc_status values map to i18n keys; only the keys may be translated. */
  const labels = {validated: 'assistant.abcStatus.validated', failed: 'assistant.abcStatus.failed',
    downstream_yue2: 'assistant.abcStatus.downstreamYue2', off: 'assistant.abcStatus.off', pending: 'assistant.abcStatus.pending',
    not_requested: 'assistant.abcStatus.notRequested'};
  assistantTextKey('#assistant-abc-status', labels[assistant.result?.abc_status] || 'assistant.abcStatus.unknown');
}
function configFromForm() {
  const values = formFields($('#assistant-config-form'));
  values.credential_id = assistant.providerCredentials[values.provider] || '';
  values.extra_parameters = JSON.parse($('#assistant-extra').value || '{}');
  return values;
}
function renderAssistantModels() {
  const provider = $('#assistant-provider').value;
  const details = assistant.providers[provider] || {};
  const items = provider === 'local' ? assistant.localModels :
    (assistant.remoteModels[provider] || (details.models || []).map(id => ({id, label: id})));
  const seen = new Set(), options = [];
  for (const item of items) {
    const id = typeof item === 'string' ? item : item.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const opt = document.createElement('option'); opt.value = id;
    opt.label = typeof item === 'string' ? item : item.label || id;
    options.push(opt);
  }
  $('#assistant-models').replaceChildren(...options);
}
/* The texts of the channel/model block depend only on the selected provider, so
 * they can be refreshed on their own when the language changes. */
function renderProviderLabels() {
  const provider = $('#assistant-provider').value;
  const details = assistant.providers[provider] || {};
  const signup = $('#assistant-signup');
  signup.classList.toggle('hidden', !details.signup_url);
  signup.href = details.signup_url || '#';
  signup.textContent = provider === 'seedance' ? t('assistant.provider.signup.seedance') : provider === 'workshop' ? t('assistant.provider.signup.workshop') : '';
  $('#assistant-refresh-models').textContent = provider === 'local' ? t('assistant.models.refreshLocal') : t('assistant.models.fetchList');
  $('#assistant-model').placeholder = provider === 'local' ? t('assistant.models.placeholder.local') :
    provider === 'compatible' ? t('assistant.models.placeholder.compatible') : t('assistant.models.placeholder.default');
}
function providerChanged() {
  const provider = $('#assistant-provider').value;
  const previous = assistant.activeProvider;
  if (previous) {
    assistant.providerSelections[previous] = $('#assistant-model').value;
    assistant.providerBaseUrls[previous] = $('#assistant-base-url').value;
  }
  assistant.activeProvider = provider;
  const details = assistant.providers[provider] || {};
  $$('[data-api-config]').forEach(el => el.classList.toggle('hidden', provider === 'local'));
  $$('[data-local-config]').forEach(el => el.classList.toggle('hidden', provider !== 'local'));
  $('#assistant-base-url').disabled = provider !== 'compatible';
  $('#assistant-base-url').value = details.base_url || assistant.providerBaseUrls[provider] || '';
  if (previous !== provider || !$('#assistant-model').value.trim()) {
    const localDefault = assistant.localModels.find(item => item.id === details.default_model)?.id || assistant.localModels[0]?.id;
    $('#assistant-model').value = assistant.providerSelections[provider] || details.default_model || (provider === 'local' ? localDefault || '' : '');
  }
  renderProviderLabels();
  renderAssistantModels();
  assistantText('#assistant-model-list-status', '');
  if (details.models?.length && provider !== 'local') assistantTextKey('#assistant-model-list-status', 'assistant.models.status.provided', {count: details.models.length});
  if (previous && previous !== provider && assistant.config?.provider !== provider) {
    assistantTextKey('#assistant-config-status', provider === 'local' ? 'assistant.configStatus.switchedLocal' : 'assistant.configStatus.switchedProvider');
  }
}
async function saveAssistantConfig() {
  let config = configFromForm();
  const key = $('#assistant-key').value;
  if (key) {
    const saved = await assistantPost('/api/assistant/credentials', {api_key: key, config, remember: $('#assistant-remember-key').checked});
    config.credential_id = saved.credential_id;
    assistant.providerCredentials[config.provider] = saved.credential_id;
    $('#assistant-key').value = '';
  }
  const info = await assistantPost('/api/assistant/config', config);
  assistant.config = info.config;
  updateModelInfo(info);
  assistantTextKey('#assistant-config-status', config.credential_id ? 'assistant.configStatus.savedWithCredential' : 'assistant.configStatus.saved');
  return config;
}
function updateModelInfo(info) {
  assistant.providers = info.providers || assistant.providers;
  /* Kept so a locale change can rebuild the model labels and the capability text. */
  assistant.modelInfo = info;
  assistant.localModels = info.models.map(model => ({id: model.id,
    label: [model.architecture, `${(model.bytes / 2**30).toFixed(1)} GiB`, model.context_length ? t('assistant.models.contextLength', {count: model.context_length}) : '', model.shards > 1 ? t('assistant.models.shards', {count: model.shards}) : '', model.error].filter(Boolean).join(' · ')}));
  renderAssistantModels();
  assistantTextKey('#assistant-capability', info.local_runtime ? (info.local_gpu_offload ? 'assistant.capability.cudaReady' : 'assistant.capability.cpuOnly') : 'assistant.capability.noRuntime');
}
async function refreshAssistantModels() {
  const provider = $('#assistant-provider').value;
  const button = $('#assistant-refresh-models');
  button.disabled = true;
  try {
    const config = await saveAssistantConfig();
    if (provider === 'local') {
      assistantTextKey('#assistant-model-list-status', 'assistant.models.status.scanned', {count: assistant.localModels.length});
      return;
    }
    assistantTextKey('#assistant-model-list-status', 'assistant.models.status.reading');
    const result = await assistantPost('/api/assistant/models', {config});
    assistant.remoteModels[provider] = result.models.map(id => ({id, label: id}));
    renderAssistantModels();
    if (!result.models.includes($('#assistant-model').value)) $('#assistant-model').value = result.models[0];
    assistant.providerSelections[provider] = $('#assistant-model').value;
    assistantTextKey('#assistant-model-list-status', 'assistant.models.status.read', {count: result.count});
  } catch (error) {
    assistantTextKey('#assistant-model-list-status', 'assistant.models.status.error', {error: error.message});
  } finally { button.disabled = false; }
}
function updateCostHint() {
  const v = assistantValues(), score = v.abc_source?.includes('Compose') && v.cot !== 'off';
  assistantTextKey('#assistant-cost-hint', score ? 'assistant.cost.compose' : v.cot === 'off' ? 'assistant.cost.textOnly' : 'assistant.cost.plan');
  $('#assistant-generate').textContent = score ? t('assistant.generate.withAbc') : t('assistant.generate.textOnly');
}
/* Stage names are server protocol values and stay as they are; the values are
 * i18n keys resolved through t() at display time. */
const assistantStages = {assistant_lyrics: 'assistant.stage.lyrics', assistant_lyrics_language_repair: 'assistant.stage.lyricsLanguageRepair', assistant_style: 'assistant.stage.style', assistant_review: 'assistant.stage.review', assistant_review_repair: 'assistant.stage.reviewRepair', assistant_abc: 'assistant.stage.abc', assistant_abc_repair: 'assistant.stage.abcRepair', assistant_connection: 'assistant.stage.connection'};
window.assistantStageLabel = stage => assistantStages[stage] ? t(assistantStages[stage]) : undefined;
async function pollAssistant(id, startingRevision) {
  if (assistant.polling) return;
  assistant.polling = true;
  $('#assistant-generate').disabled = true; $('#assistant-test').disabled = true; $('#assistant-retry').disabled = true;
  try {
    let lastResult = '';
    while (true) {
      const job = await api(`/api/jobs/${id}`);
      assistant.job = job;
      const seconds = Math.max(0, Math.round(Date.now() / 1000 - (job.started_at || job.created_at)));
      const progress = $('#assistant-progress'); progress.replaceChildren();
      const line = document.createElement('p');
      const stage = job.status === 'queued' ? t('assistant.progress.queued') : assistantStages[job.stage] ? t(assistantStages[job.stage]) : stageLabel(job.stage);
      line.textContent = job.requests ? t('assistant.progress.lineWithCalls', {stage, seconds, calls: job.requests}) : t('assistant.progress.line', {stage, seconds});
      progress.append(line);
      if (!TERMINAL.has(job.status)) {
        const cancel = document.createElement('button'); cancel.className = 'danger compact'; cancel.textContent = t('assistant.progress.cancel');
        cancel.onclick = () => assistantPost(`/api/jobs/${id}/cancel`, {}); progress.append(cancel);
      }
      const signature = JSON.stringify(job.result || {});
    if (job.result && signature !== lastResult && assistant.ticks.assistant === startingRevision && !job.result.connection) {
        showAssistantResult(job.result); lastResult = signature;
      }
      if (TERMINAL.has(job.status)) {
        if (job.error) { const error = document.createElement('p'); error.textContent = job.error; progress.append(error); }
        if (job.result?.connection) line.textContent = t('assistant.progress.connectionOk');
        if (assistant.ticks.assistant !== startingRevision && job.result && !job.result.connection) {
          const restore = document.createElement('button'); restore.className = 'ghost'; restore.textContent = t('assistant.progress.restore');
          restore.onclick = () => { if (confirm(t('assistant.confirm.replaceEditor'))) { showAssistantResult(job.result); changedDraft('assistant'); } }; progress.append(restore);
        }
        await savePanel('assistant'); refreshWorkspace(); loadHistory(); break;
      }
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  } catch (error) { assistantTextKey('#assistant-progress', 'assistant.error.connectionLost', {error: error.message}); }
  finally { assistant.polling = false; $('#assistant-generate').disabled = false; $('#assistant-test').disabled = false; $('#assistant-retry').disabled = false; }
}
async function startAssistant(test = false, retry = false) {
  if (assistant.polling) return;
  try {
    const config = await saveAssistantConfig(), values = assistantValues();
    await savePanel('assistant');
    const body = {values, config, client_request_id: crypto.randomUUID()};
    let job;
    if (retry) {
      if (!assistant.job?.id) throw new Error(t('assistant.error.noJob'));
      body.retry_stages = $('#assistant-retry-stage').value ? [$('#assistant-retry-stage').value] : [];
      const edited = readAssistantResult(), stage = $('#assistant-retry-stage').value;
      body.final_fields = {};
      if (edited && stage !== 'lyrics') {
        if (stage || edited.lyrics !== assistant.result.lyrics) Object.assign(body.final_fields, {lyrics: edited.lyrics, instrumental: edited.instrumental});
        if (stage !== 'style' && (stage || edited.style !== assistant.result.style)) body.final_fields.style = edited.style;
      }
      if (stage === 'abc') body.values.quality_mode = assistant.defaults.quality_mode;
      job = await assistantPost(`/api/jobs/${assistant.job.id}/retry-assistant`, body);
    } else job = await assistantPost('/api/jobs', {kind: 'assistant', source: 'webui', result_panel: 'assistant', client_request_id: body.client_request_id,
      request: {values, config, variant_id: crypto.randomUUID(), test_connection: test}});
    assistant.job = job;
    await savePanel('assistant');
    refreshWorkspace();
    pollAssistant(job.id, assistant.ticks.assistant);
  } catch (error) { assistantText('#assistant-progress', error.message); }
}
async function validateAssistantAbc(strip = false, cot) {
  const result = readAssistantResult();
  if (!result?.abc.trim()) throw new Error(t('assistant.error.noAbc'));
  const checked = await assistantPost('/api/assistant/validate-abc', {abc: result.abc, cot: cot || result.cot, strip_chords: strip});
  return checked;
}
/* Dialog title per target panel. Keys, not labels: the target panel names are
 * only ever shown through t(). */
const assistantSendTitles = {create: 'assistant.send.title.create', plan: 'assistant.send.title.plan', cover: 'assistant.send.title.cover'};
/* The hint depends on the target panel and on whether the result has an ABC score. */
function assistantSendDetails(panel, r) {
  return panel === 'cover' && r.abc ? t('assistant.send.details.cover') : panel === 'create' && r.abc ? t('assistant.send.details.create') : t('assistant.send.details.default');
}
function prepareTransfer(panel) {
  const r = readAssistantResult(); if (!r) return;
  assistant.sending = {panel, result: cloneText(r), sourceTick: assistant.ticks.assistant, targetTick: assistant.ticks[panel]};
  const dialog = $('#assistant-send-dialog');
  assistantText('#assistant-send-title', t(assistantSendTitles[panel]));
  for (const name of ['style', 'lyrics', 'abc']) {
    const input = dialog.querySelector(`[name=${name}]`);
    input.disabled = name === 'abc' && (panel === 'create' || !r.abc.trim());
    input.checked = !input.disabled;
  }
  $('#assistant-send-mode').value = r.cot === 'off' ? '' : panel === 'cover' ? 'melody' : r.cot;
  $('#assistant-send-mode-label').classList.toggle('hidden', panel !== 'plan');
  assistantText('#assistant-send-warning', t('assistant.send.warning'));
  assistantText('#assistant-send-details', assistantSendDetails(panel, r));
  dialog.showModal();
}
async function confirmTransfer() {
  const pending = assistant.sending; if (!pending) return;
  const {panel, result: r} = pending, dialog = $('#assistant-send-dialog');
  const selected = name => dialog.querySelector(`[name=${name}]`).checked && !dialog.querySelector(`[name=${name}]`).disabled;
  const before = captureDraft(panel), after = cloneText(before);
  const mode = panel === 'plan' ? $('#assistant-send-mode').value : panel === 'cover' ? 'melody' : r.cot;
  try {
    if (!['style', 'lyrics', 'abc'].some(selected)) throw new Error(t('assistant.error.noField'));
    if (panel === 'plan' && !mode) throw new Error(t('assistant.error.planMode'));
    let abc = null;
    if (selected('abc')) abc = (await assistantPost('/api/assistant/validate-abc', {abc: r.abc, cot: mode, strip_chords: panel === 'cover'})).abc;
    if (panel === 'cover') {
      if (selected('style')) after.style = r.style;
      if (selected('lyrics')) { after.lyrics = r.lyrics; after.instrumental = r.instrumental && !r.lyrics.trim(); }
      if (abc !== null) after.abc = abc;
      after.visible = true;
      after.mode = 'generate';
    } else {
      if (selected('style')) after.form.style = r.style;
      if (selected('lyrics')) { after.form.lyrics = r.lyrics; after.form.instrumental = r.instrumental && !r.lyrics.trim(); }
      after.form.cot = mode;
      if (panel === 'plan') {
        if (abc !== null) { after.abc = abc; after.exact = false; after.plan = {source: 'imported_abc', request: {style: after.form.style, lyrics: after.form.lyrics, cot: mode}}; }
        else if (after.plan) { after.exact = false; after.plan.source = 'imported_abc'; }
      }
    }
    if (assistant.ticks.assistant !== pending.sourceTick || assistant.ticks[panel] !== pending.targetTick) throw new Error(t('assistant.error.contentChanged'));
    clearTimeout(assistant.timers[panel]);
    await savePanel(panel, after);
    if (assistant.ticks[panel] !== pending.targetTick) { await savePanel(panel); throw new Error(t('assistant.error.targetEdited')); }
    applyDraft(panel, after); assistant.ticks[panel]++;
    assistant.undo = {panel, before, tick: assistant.ticks[panel]};
    dialog.close(); $(`.tab[data-tab=${panel}]`).click();
    const target = panel === 'cover' ? $('#cover-review') : panel === 'plan' && abc ? $('#plan-workbench') : $(`#${panel}-form`);
    target.scrollIntoView({behavior: 'smooth', block: 'start'});
    $('#assistant-transfer-notice').classList.remove('hidden');
    assistantTextKey('#assistant-transfer-notice span', 'assistant.transfer.filled');
  } catch (error) { assistantText('#assistant-send-details', error.message); }
}
function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.openAssistantJob = async id => {
  try {
    const data = await api(`/api/assistant/jobs/${id}`);
    if (assistant.result && !confirm(t('assistant.confirm.loadJob'))) return;
    putFields($('#assistant-form'), data.request.values); assistant.originalLyrics = data.request.values.lyrics || '';
    if (data.job.result) showAssistantResult(data.job.result);
    assistant.job = data.job; changedDraft('assistant'); $('.tab[data-tab=assistant]').click();
    if (!TERMINAL.has(data.job.status)) pollAssistant(id, assistant.ticks.assistant);
  } catch (error) { alert(error.message); }
};
/* Option VALUES are submitted to the backend and validated in
 * app/yue2_app/assistant_rules/engine.py, so they must stay byte-identical to
 * the strings the engine compares against ('中文', '保留 / Preserve', ...).
 * The label is therefore no longer the same string as the value: only the label
 * is translated. Values with no entry here -- notably the API-supplied
 * quality_modes -- are displayed as-is. */
const OPTION_LABELS = {
  // Language selectors.
  '中文': 'assistant.option.chinese',
  'English': 'assistant.option.english',
  '日本語': 'assistant.option.japanese',
  '한국어': 'assistant.option.korean',
  // lyrics_mode values (engine.LYRIC_MODES), supplied by /api/assistant/config.
  'AUTO（有词保留，无词创作）': 'assistant.option.lyricsAuto',
  '生成新歌词 / New lyrics': 'assistant.option.lyricsGenerate',
  '严格保留歌词 / Preserve': 'assistant.option.lyricsPreserve',
  '定向改词 / Edit section': 'assistant.option.lyricsEdit',
  '纯器乐 / Instrumental': 'assistant.option.lyricsInstrumental',
  // quality_mode values (engine.STANDARD / engine.REVIEW).
  '标准 / Standard': 'assistant.option.qualityStandard',
  '创作审校 / Reviewed': 'assistant.option.qualityReviewed',
  // abc_action and abc_source values.
  '保留 / Preserve': 'assistant.option.abcPreserve',
  '去和弦，保留双声部旋律 / Strip chords': 'assistant.option.abcStripChords',
  '自动创作 ABC（T8 LLM）/ Compose': 'assistant.option.abcCompose',
  '交给下游 YuE2 规划（ABC 留空）/ Downstream': 'assistant.option.abcDownstream',
};

function optionLabel(value) {
  const key = OPTION_LABELS[value];
  return key ? t(key) : value;
}

/* Provider labels arrive from the server. Two of them describe a kind of
 * endpoint and are translated here; the other two are brand names, which have
 * no official English form and are therefore left as the server sends them. */
const PROVIDER_LABEL_KEYS = {
  compatible: 'studio.provider.compatible',
  local: 'studio.provider.local',
};

function providerLabel(id, fallback) {
  const key = PROVIDER_LABEL_KEYS[id];
  return key ? t(key) : fallback;
}

function renderProviderOptions() {
  const select = $('#assistant-provider');
  if (!select || !assistant.providers) return;
  const previous = select.value;
  select.replaceChildren();
  for (const [id, provider] of Object.entries(assistant.providers)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = providerLabel(id, provider.label);
    select.append(option);
  }
  if (previous) select.value = previous;
}

/* Rebuilds the selects whose labels depend on the language. Their values are
 * the server's Chinese protocol strings and must not change, so the options are
 * recreated with the same values and freshly translated labels. */
function renderServerOptionLabels() {
  const options = assistant.options;
  if (!options) return;
  const sets = [['#assistant-lyrics-mode', options.lyrics_modes],
                ['#assistant-abc-source', options.abc_sources]];
  for (const [selector, values] of sets) {
    const select = $(selector);
    if (!select || !Array.isArray(values)) continue;
    const previous = select.value;
    select.replaceChildren();
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = optionLabel(value);
      select.append(option);
    }
    if (previous) select.value = previous;
  }
}

/* The advanced selects are built once by addAdvanced, so their option labels
 * keep the language that was active at load. Rewrite the labels in place --
 * values and the current selection are untouched. */
function renderAdvancedOptionLabels() {
  if (!assistant.advancedFields) return;
  for (const [name, , type] of assistant.advancedFields) {
    if (!Array.isArray(type)) continue;
    const select = $(`#assistant-advanced [name="${name}"]`);
    if (!select) continue;
    const previous = select.value;
    for (const option of select.options) option.textContent = optionLabel(option.value);
    select.value = previous;
  }
}

function addAdvanced(defaults, options) {
  /* The second element of each entry is an i18n key for the field label. The
   * option value arrays hold values that are submitted to the backend and
   * validated there ('中文', quality_modes, abc_action), so they must stay
   * byte-identical; only the labels are translated. */
  const fields = [['quality_mode', 'assistant.field.qualityMode', options.quality_modes], ['style_language', 'assistant.field.styleLanguage', ['English', '中文']],
    ['structure', 'assistant.field.structure'], ['genre', 'assistant.field.genre'], ['vocal', 'assistant.field.vocal'], ['instruments', 'assistant.field.instruments'], ['bpm', 'assistant.field.bpm', 'number'],
    ['meter', 'assistant.field.meter'], ['key_scale', 'assistant.field.keyScale'], ['target_duration_seconds', 'assistant.field.targetDuration', 'number'],
    ['constraints', 'assistant.field.constraints'], ['creativity', 'assistant.field.creativity', ['strict', 'balanced', 'creative']], ['edit_section', 'assistant.field.editSection'],
    ['edit_occurrence', 'assistant.field.editOccurrence', 'number'], ['edit_request', 'assistant.field.editRequest'], ['abc', 'assistant.field.abc', 'textarea'],
    ['abc_action', 'assistant.field.abcAction', ['保留 / Preserve', '去和弦，保留双声部旋律 / Strip chords']], ['seed', 'assistant.field.seed', 'number']];
  const target = $('#assistant-advanced');
  assistant.advancedFields = fields;
  for (const [name, caption, type] of fields) {
    const label = document.createElement('label'); label.textContent = t(caption);
    const input = document.createElement(Array.isArray(type) ? 'select' : type === 'textarea' ? 'textarea' : 'input'); input.name = name;
    if (Array.isArray(type)) for (const text of type) { const opt = document.createElement('option'); opt.value = text; opt.textContent = optionLabel(text); input.append(opt); }
    else if (input.tagName === 'INPUT') input.type = type || 'text';
    if (type === 'textarea') { input.rows = 7; label.className = 'wide'; }
    input.value = defaults[name] ?? ''; label.append(input); target.append(label);
  }
}
async function initAssistant() {
  for (const panel of ['create', 'plan']) addInstrumentalControl(panel);
  try {
    const [info, drafts] = await Promise.all([api('/api/assistant/config'), api('/api/assistant/drafts')]);
    assistant.config = info.config; assistant.defaults = info.defaults; assistant.drafts = drafts; assistant.providers = info.providers;
    // Cached so the selects can be rebuilt when the language changes: their
    // VALUES are Chinese protocol strings the server validates, while their
    // LABELS are translated, so only a rebuild can flip the visible text.
    assistant.options = info.options;
    assistant.providerSelections[info.config.provider] = info.config.model;
    assistant.providerBaseUrls[info.config.provider] = info.config.base_url;
    assistant.providerCredentials[info.config.provider] = info.config.credential_id || '';
    renderProviderOptions();
    renderServerOptionLabels();
    addAdvanced(info.defaults, info.options); putFields($('#assistant-form'), info.defaults);
    putFields($('#assistant-config-form'), info.config); $('#assistant-extra').value = JSON.stringify(info.config.extra_parameters || {});
    updateModelInfo(info); providerChanged();
    for (const panel of ['create', 'plan', 'cover', 'assistant']) applyDraft(panel, drafts[panel]?.draft);
    const draftErrors = Object.entries(drafts).filter(([, draft]) => draft.error);
    if (draftErrors.length) assistantText('#assistant-draft-status', draftErrors.map(([panel, draft]) => t('assistant.draft.errorItem', {panel, error: draft.error})).join(t('assistant.draft.errorSeparator')));
    if (planState?.source === 'saved_exact' && planState.plan_dir) {
      const state = await assistantPost('/api/assistant/check-plan', {plan_dir: planState.plan_dir}).catch(() => ({available: false}));
      if (!state.available) {
        planState.source = 'imported_abc'; $('#plan-exact').checked = false; $('#plan-exact').disabled = true; $('#plan-abc').disabled = false;
        assistantTextKey('#plan-badge', 'assistant.plan.badge.unavailable');
        await savePanel('plan');
      }
    }
    for (const panel of ['create', 'plan', 'cover', 'assistant']) {
      $(`#${panel}`).addEventListener('input', event => {
        if (event.target.closest('#assistant-config-form') || event.target.type === 'file') return;
        if (event.target.type === 'checkbox') updateInstrumental(panel);
        if (panel === 'cover' && event.target.id === 'cover-lyrics' && event.target.value.trim()) { $('#cover').dataset.instrumental = 'false'; updateInstrumental('cover'); }
        if (panel === 'assistant') {
          if (event.target.id.startsWith('assistant-result-')) assistant.resultEdited = true;
          if (event.target.id === 'assistant-result-abc' && assistant.result) { assistant.result.abc_status = 'pending'; renderAbcState(); }
          if (['assistant-result-lyrics', 'assistant-result-style'].includes(event.target.id)) assistantTextKey('#assistant-result-note', 'assistant.resultNote.edited');
          updateCostHint();
        }
        changedDraft(panel);
      });
    }
    updateCostHint();
    if (!assistant.job?.id) {
      const recent = await api('/api/jobs?limit=100');
      /* '测试 LLM 连接' is the summary the backend writes for connection tests
       * (app/yue2_app/service.py), so it is server data and stays untranslated. */
      assistant.job = recent.jobs.find(job => job.kind === 'assistant' && !job.result?.connection && job.summary !== '测试 LLM 连接') || null;
    }
    if (assistant.job?.id) {
      const current = await api(`/api/jobs/${assistant.job.id}`).catch(() => null);
      if (current && !TERMINAL.has(current.status)) pollAssistant(current.id, assistant.ticks.assistant);
      else if (current) {
        assistant.job = current;
        if (current.result && !current.result.connection) {
          if (!assistant.resultEdited) { showAssistantResult(current.result); await savePanel('assistant'); }
          else {
            const notice = $('#assistant-progress'); notice.textContent = t('assistant.progress.finished');
            const button = document.createElement('button'); button.className = 'ghost'; button.textContent = t('assistant.progress.viewLatest');
            button.onclick = () => { if (confirm(t('assistant.confirm.replaceEditorDownload'))) { showAssistantResult(current.result); changedDraft('assistant'); } }; notice.append(button);
          }
        }
        if (current.error) { const error = document.createElement('p'); error.textContent = current.error; $('#assistant-progress').append(error); }
      }
    }
  } catch (error) { assistantTextKey('#assistant-progress', 'assistant.error.initFailed', {error: error.message}); }
}
$('#assistant-config-form').onsubmit = event => { event.preventDefault(); saveAssistantConfig().catch(error => assistantText('#assistant-config-status', error.message)); };
$('#assistant-provider').onchange = providerChanged;
$('#assistant-model').oninput = () => { assistant.providerSelections[$('#assistant-provider').value] = $('#assistant-model').value; };
$('#assistant-refresh-models').onclick = refreshAssistantModels;
$('#assistant-delete-key').onclick = async () => { try { const provider = $('#assistant-provider').value, credential = assistant.providerCredentials[provider] || ''; await assistantPost('/api/assistant/credentials', {delete: true, credential_id: credential}); assistant.providerCredentials[provider] = ''; if (assistant.config?.provider === provider) assistant.config.credential_id = ''; await saveAssistantConfig(); } catch (error) { assistantText('#assistant-config-status', error.message); } };
$('#assistant-form').onsubmit = event => { event.preventDefault(); startAssistant(); };
$('#assistant-test').onclick = () => startAssistant(true);
$('#assistant-retry').onclick = () => startAssistant(false, true);
$('#assistant-save-draft').onclick = () => savePanel('assistant').then(() => assistantTextKey('#assistant-draft-status', 'assistant.draft.saved')).catch(error => assistantText('#assistant-draft-status', error.message));
$('#assistant-validate').onclick = async () => { const revision = assistant.ticks.assistant; try { await validateAssistantAbc(); if (assistant.ticks.assistant !== revision) throw new Error(t('assistant.error.validateChanged')); assistant.result.abc_status = 'validated'; renderAbcState(); changedDraft('assistant'); } catch (error) { assistantText('#assistant-abc-status', error.message); } };
$$('[data-assistant-send]').forEach(button => button.onclick = () => prepareTransfer(button.dataset.assistantSend));
$('#assistant-send-confirm').onclick = confirmTransfer;
$('#assistant-dismiss').onclick = () => $('#assistant-transfer-notice').classList.add('hidden');
$('#assistant-undo').onclick = async () => { const undo = assistant.undo; if (!undo) return; try {
  if (assistant.ticks[undo.panel] !== undo.tick) throw new Error(t('assistant.error.undoConflict'));
  await savePanel(undo.panel, undo.before);
  if (assistant.ticks[undo.panel] !== undo.tick) { await savePanel(undo.panel); throw new Error(t('assistant.error.undoEdited')); }
  applyDraft(undo.panel, undo.before); assistant.ticks[undo.panel]++;
  assistant.undo = null; $('#assistant-transfer-notice').classList.add('hidden');
} catch (error) { $('#assistant-transfer-notice span').textContent = error.message; } };
$('#assistant-download').onclick = () => { const r = readAssistantResult(); if (!r) return; const request = {style: r.style, lyrics: r.lyrics, cot: r.cot, seed: assistantValues().yue2_seed}; if (r.abc && r.abc_status === 'validated') request.abc = r.abc;
  downloadText('YuE2-creation.txt', t('assistant.export.file', {style: r.style, lyrics: r.lyrics})); downloadText('YuE2-request.json', JSON.stringify(request, null, 2)); };
$('#assistant-download-abc').onclick = () => { const r = readAssistantResult(); if (r?.abc) downloadText('score.abc', r.abc); };
$('#assistant-copy').onclick = () => { const r = readAssistantResult(); if (r) navigator.clipboard.writeText(t('assistant.export.clipboard', {style: r.style, lyrics: r.lyrics})).catch(error => assistantText('#assistant-result-note', error.message)); };
initAssistant();

/* Markup built by this file does not refresh itself, so a locale change
 * re-renders the assistant panel's dynamic content from the state already in
 * memory: remembered status strings, cost hint and generate button, ABC state,
 * model labels, the generated field labels and an open send dialog. Every step
 * tolerates a panel that has not been initialised yet or has no data. */
function renderAssistantLocale() {
  if (!$('#assistant-form')) return;
  for (const [id, entry] of assistantStatusKeys) {
    const element = $(id);
    if (!element || element.textContent !== entry.text) continue;
    entry.text = t(entry.key, entry.params);
    element.textContent = entry.text;
  }
  updateCostHint();
  if (assistant.result) renderAbcState();
  if ($('#cover')) updateInstrumental('cover');
  if ($('#assistant-provider')) { renderProviderOptions(); renderProviderLabels(); }
  renderServerOptionLabels();
  renderAdvancedOptionLabels();
  if (assistant.modelInfo && $('#assistant-provider')) updateModelInfo(assistant.modelInfo);
  // Labels built by addInstrumentalControl end with the text node after the input.
  for (const input of $$('input[name="instrumental"]')) {
    const node = input.nextSibling;
    if (node && node.nodeType === Node.TEXT_NODE) node.nodeValue = t('assistant.field.instrumental');
  }
  // Labels built by addAdvanced: the caption is the label's leading text node.
  const advanced = $('#assistant-advanced');
  if (advanced && assistant.advancedFields) {
    [...advanced.children].forEach((label, index) => {
      const caption = assistant.advancedFields[index]?.[1];
      const node = label.firstChild;
      if (caption && node && node.nodeType === Node.TEXT_NODE) node.nodeValue = t(caption);
    });
  }
  const sending = assistant.sending, sendDialog = $('#assistant-send-dialog');
  if (sending && sendDialog?.open) {
    assistantText('#assistant-send-title', t(assistantSendTitles[sending.panel]));
    assistantText('#assistant-send-warning', t('assistant.send.warning'));
    assistantText('#assistant-send-details', assistantSendDetails(sending.panel, sending.result));
  }
}
document.addEventListener('yue2:locale', () => {
  try { renderAssistantLocale(); } catch { /* panel not initialised yet */ }
});
