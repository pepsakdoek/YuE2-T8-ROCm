(() => {
  let project = null, lastJob = savedValue('rvc-job'), lastStatus = '', polling = false, voices = [];
  let storageDirty = false, storagePlan = null, lastPreflight = null;
  const storageDirectories = () => Object.fromEntries(['projects','datasets','voices'].map(kind => [kind,$(`#rvc-directory-${kind}`).value.trim()]));
  const e = escapeHtml;
  const post = (path, value) => api(path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  const notice = (text, bad = false) => { $('#rvc-result').innerHTML = `<div class="result-card${bad ? ' status-failed' : ''}">${e(text)}</div>`; };
  async function update(value) {
    if (!project) throw new Error(t('rvc.error.noProjectSelected'));
    project = await post(`/api/rvc/projects/${project.id}`, value); renderProject();
  }
  function renderProject() {
    $('#rvc-workbench').classList.toggle('hidden', !project);
    if (!project) return;
    for (const [id, field] of Object.entries({epochs:'epochs',batch:'batch_size',version:'version',rate:'sample_rate',f0:'f0_method',save:'save_every',gpu:'gpu',workers:'num_workers'})) $(`#rvc-${id}`).value = project.options[field];
    $('#rvc-import-speaker').innerHTML = project.speakers.map(s => `<option value="${s.id}">${e(t('rvc.label.speakerOption',{name:s.name,id:s.id}))}</option>`).join('');
    $('#rvc-speakers').innerHTML = project.speakers.map(s => `<span>${e(t('rvc.label.speakerEntry',{id:s.id,name:s.name}))} <button class="ghost compact" data-remove-speaker="${s.id}" ${project.speakers.length < 2 ? 'disabled' : ''}>${e(t('rvc.action.removeSpeaker'))}</button></span>`).join(' ');
    const chosen = project.materials.filter(m => m.enabled), seconds = chosen.reduce((sum,m) => sum + m.duration, 0);
    $('#rvc-duration').textContent = t(seconds < 300 ? 'rvc.material.summaryShort' : 'rvc.material.summaryReview',{count:chosen.length,minutes:(seconds / 60).toFixed(1)});
    $('#rvc-materials').innerHTML = project.materials.map(m => `<article class="rvc-material" data-material="${m.id}">
      <div class="rvc-material-title"><b>${e(m.name)}</b><button class="ghost compact" data-remove="${m.id}">${e(t('rvc.action.remove'))}</button></div>
      <div class="meta">${e(t('rvc.material.meta',{duration:m.duration.toFixed(1),rate:m.sample_rate,channels:m.channels}))}${m.warnings.length ? ' · ' + e(m.warnings.join(t('rvc.listSeparator'))) : ''}</div>
      <audio controls preload="metadata" src="/api/rvc/projects/${project.id}/audio/${m.id}/original"></audio>
      ${m.separated_path ? `<label>${e(t('rvc.material.separatedVocal'))}<audio controls preload="metadata" src="/api/rvc/projects/${project.id}/audio/${m.id}/vocal"></audio></label><p class="meta">${e(t('rvc.material.accompanimentEnergy',{percent:(100 * m.accompaniment_energy_ratio).toFixed(1)}))}</p>` : ''}
      <div class="toolbar"><label class="rvc-check"><input type="checkbox" data-field="enabled" ${m.enabled ? 'checked' : ''}>${e(t('rvc.material.useForTraining'))}</label><label class="rvc-check"><input type="checkbox" data-field="reviewed" ${m.reviewed ? 'checked' : ''}>${e(t('rvc.material.reviewed'))}</label>
      <label>${e(t('rvc.field.speaker'))}<select data-field="speaker_id">${project.speakers.map(s => `<option value="${s.id}" ${s.id === m.speaker_id ? 'selected' : ''}>${e(s.name)}</option>`).join('')}</select></label></div>
      ${m.accompaniment === 'present' && !m.separated_path ? `<p class="meta">${e(t('rvc.material.hasAccompaniment'))}</p>` : ''}</article>`).join('') || `<p class="meta">${e(t('rvc.material.empty'))}</p>`;
  }
  async function refresh() {
    const data = await api('/api/rvc'), selected = project?.id || savedValue('rvc-project');
    voices = data.voices;
    if (!storageDirty) for (const kind of ['projects','datasets','voices']) $(`#rvc-directory-${kind}`).value = data.locations[kind];
    $('#rvc-project').innerHTML = data.projects.map(p => `<option value="${p.id}">${e(p.name)}</option>`).join('');
    project = data.projects.find(p => p.id === selected) || data.projects[0] || null;
    if (project) { $('#rvc-project').value = project.id; savedValue('rvc-project',project.id); }
    renderProject();
    renderCoverModels();
    $('#rvc-library').innerHTML = data.voices.map(v => `<article class="result-card"><b>${e(v.name)}</b><p class="meta">${e(t('rvc.voice.meta',{version:v.version,rate:v.sample_rate / 1000,count:v.speakers.length}))}</p>${v.preview ? `<audio controls preload="metadata" src="/api/rvc/voices/${v.id}/preview"></audio>` : `<p class="meta">${e(t('rvc.voice.noPreview'))}</p>`}<div class="toolbar"><button class="ghost" data-use-voice="${v.id}">${e(t('rvc.voice.useForCover'))}</button>${[['export','rvc.voice.export'],['rename','rvc.voice.rename'],['open','rvc.voice.open'],['remove','rvc.action.remove']].map(([action,key]) => `<button class="ghost compact" data-voice-action="${action}" data-voice-id="${v.id}">${e(t(key))}</button>`).join('')}</div></article>`).join('') || `<div class="result-card"><b>${e(t('rvc.library.emptyTitle'))}</b><p class="meta">${e(t('rvc.library.emptyHint'))}</p></div>`;
  }
  function renderCoverModels() {
    const selected = $('#rvc-cover-model').value || savedValue('rvc-voice');
    $('#rvc-cover-model').innerHTML = `<option value="">${e(t('rvc.cover.selectVoice'))}</option>` + voices.map(v => `<option value="${v.id}">${e(v.name)}</option>`).join('');
    if (voices.some(v => v.id === selected)) $('#rvc-cover-model').value = selected;
    renderCoverSpeakers();
  }
  function renderCoverSpeakers() {
    const voice = voices.find(v => v.id === $('#rvc-cover-model').value), selected = $('#rvc-cover-speaker').value;
    $('#rvc-cover-speaker').innerHTML = (voice?.speakers || []).map(s => `<option value="${s.id}">${e(t('rvc.label.speakerOption',{name:s.name,id:s.id}))}</option>`).join('');
    if (voice?.speakers.some(s => String(s.id) === selected)) $('#rvc-cover-speaker').value = selected;
    updateCover();
  }
  function updateCover() {
    const rvc = $('#voice-backend').value === 'rvc', compare = $('#voice-backend').value === 'compare';
    $('#rvc-cover-settings').classList.toggle('hidden', !(rvc || compare));
    const selectedVoice = voices.find(v => v.id === $('#rvc-cover-model').value);
    const profile = selectedVoice?.training?.pitch_profiles?.[$('#rvc-cover-speaker').value];
    const range = profile && profile.basis === 'training_continuous_f0' &&
      [profile.p5_hz,profile.median_hz,profile.p95_hz].every(Number.isFinite) &&
      profile.p5_hz >= 50 && profile.p5_hz <= profile.median_hz && profile.median_hz <= profile.p95_hz && profile.p95_hz <= 1100;
    $('#rvc-pitch-profile').textContent = !selectedVoice ? t('rvc.pitch.selectVoice') : selectedVoice.f0 === false ? t('rvc.pitch.noF0') : range ? t('rvc.pitch.range',{low:Math.round(profile.p5_hz),high:Math.round(profile.p95_hz)}) : t('rvc.pitch.unknown');
    $('#rvc-pitch-shift').disabled = selectedVoice?.f0 === false;
    for (const button of document.querySelectorAll('[data-rvc-pitch]')) button.disabled = selectedVoice?.f0 === false;
    if (selectedVoice?.f0 === false) $('#rvc-pitch-shift').value = '0';
    $('#voice-compare-hint').classList.toggle('hidden', !compare);
    $('#reference-drop-zone').classList.toggle('hidden', rvc);
    $('#reference-preview').classList.toggle('hidden', rvc || !$('#reference-file').files[0]);
    if (rvc) $('#reference-preview audio').pause();
    for (const id of ['voice-steps','voice-cfg','voice-auto-f0','voice-shift']) $(`#${id}`).closest('label').classList.toggle('hidden', rvc);
    if (!$('#generate-reference-cover').dataset.jobId) restoreButton($('#generate-reference-cover'));
    savedValue('voice-backend', $('#voice-backend').value);
  }
  async function start(kind, request) {
    const modelJob = kind.startsWith('rvc_model_') || kind === 'rvc_storage_move';
    if (!project && !modelJob) throw new Error(t('rvc.error.noProject'));
    const job = await post('/api/jobs',{kind,request:{...(modelJob ? {} : {project_id:project.id}),...request},source:'webui',result_panel:'voices',client_request_id:crypto.randomUUID()});
    lastJob = job.id; lastStatus = ''; savedValue('rvc-job',job.id); await poll(); await refreshWorkspace();
  }
  async function poll() {
    if (!lastJob || polling) return;
    polling = true;
    try {
      const job = await api(`/api/jobs/${lastJob}`), active = !TERMINAL.has(job.status);
      $('#rvc-job-tools').classList.remove('hidden');
      $('#rvc-resume').classList.toggle('hidden',!(['failed','cancelled'].includes(job.status) && ['rvc_train','rvc_import','rvc_separate','rvc_storage_move'].includes(job.kind)));
      $('#rvc-cancel').classList.toggle('hidden',!active);
      for (const id of ['rvc-import','rvc-separate','rvc-train','rvc-check-training','rvc-create','rvc-add-speaker','rvc-model-import']) $(`#${id}`).disabled = active;
      $('#rvc-storage-preview').disabled = active;
      $('#rvc-storage-apply').disabled = active || !storagePlan?.changes.length;
      if (active) {
        const loss = job.stage === 'rvc_train' && job.losses ? Object.entries(job.losses).map(([key,value]) => `${key}: ${Number(value).toFixed(3)}`).join(' · ') : '';
        const epoch = job.epoch ? t(job.epochs ? 'rvc.job.epochPartTotal' : 'rvc.job.epochPart',{epoch:job.epoch,total:job.epochs}) : '';
        const progress = job.completed != null && job.total ? (job.kind === 'rvc_storage_move' ? t('rvc.job.progressSize',{done:(job.completed/1024**3).toFixed(2),total:(job.total/1024**3).toFixed(2)}) : t('rvc.job.progressCount',{completed:job.completed,total:job.total})) : '';
        const parts = `${epoch}${progress}${loss ? t('rvc.job.lossPart',{loss}) : ''}`;
        notice(t('rvc.job.running',{kind:kindLabel(job.kind),stage:stageLabel(job.stage),parts,message:job.message || t('rvc.job.defaultMessage')}));
      }
      else if (lastStatus !== job.status) {
        if (job.status === 'complete') {
          if (job.kind === 'rvc_storage_move') { storageDirty = false; storagePlan = null; $('#rvc-storage-apply').disabled = true; }
          const result = job.result || {}, extra = result.errors?.length ? t('rvc.job.importErrors',{count:result.errors.length,items:result.errors.map(x => t('rvc.job.importErrorItem',{name:x.name,error:x.error})).join(t('rvc.listSeparator'))}) : '';
          notice(t('rvc.job.done',{kind:kindLabel(job.kind),extra,review:result.review_required ? t('rvc.job.reviewRequired') : ''})); await refresh();
          if (result.backups?.length) $('#rvc-result').insertAdjacentHTML('beforeend',`<div class="result-card">${e(t('rvc.job.backups'))}${result.backups.map(path => `<p>${e(path)}</p>`).join('')}</div>`);
          if (result.download_url && /^\/api\/rvc\/download\/[a-f0-9-]+\.zip$/.test(result.download_url)) $('#rvc-result').insertAdjacentHTML('beforeend',`<a class="ghost" href="${result.download_url}" download>${e(t('rvc.job.downloadZip'))}</a>`);
          if (result.voice?.id && savedValue('rvc-applied-job') !== job.id) {
            savedValue('rvc-voice',result.voice.id);
            savedValue('rvc-applied-job',job.id);
            window.dispatchEvent(new CustomEvent('rvc-voice-selected',{detail:{id:result.voice.id}}));
            if (job.kind === 'rvc_train') $('.tab[data-tab="cover"]').click();
          }
        } else notice(job.error || stageLabel(job.status),true);
      }
      lastStatus = job.status;
    } catch (error) { notice(error.message,true); }
    finally { polling = false; }
  }
  const handle = fn => async event => { try { await fn(event); } catch (error) { notice(error.message,true); } };
  for (const kind of ['projects','datasets','voices']) $(`#rvc-directory-${kind}`).oninput = () => { storageDirty = true; storagePlan = null; $('#rvc-storage-apply').disabled = true; renderStoragePlan(); };
  function renderStoragePlan() {
    if (storagePlan) {
      $('#rvc-storage-plan').innerHTML = storagePlan.changes.map(item => `<p>${e(item.source)} → ${e(item.target)}<br>${e(t('rvc.storage.planItem',{files:item.files,size:(item.bytes / 1024**3).toFixed(2)}))}</p>`).join('') || e(t('rvc.storage.noChanges'));
      return;
    }
    if (storageDirty) $('#rvc-storage-plan').textContent = t('rvc.storage.pathsChanged');
  }
  function renderPreflight() {
    if (!lastPreflight) return;
    const result = lastPreflight, gib = value => (value / 1024**3).toFixed(1);
    $('#rvc-preflight').textContent = t('rvc.preflight.summary',{required:gib(result.required_free_bytes_estimate),disk:gib(result.disk_free_bytes),ram:gib(result.ram_available_bytes),gpu:result.gpu ? t('rvc.preflight.gpu',{id:result.gpu.id,vram:(result.gpu.free_mib / 1024).toFixed(1)}) : '',issues:[...result.errors,...result.warnings].join(t('rvc.listSeparator'))});
  }
  $('#rvc-storage-preview').onclick = handle(async () => {
    storagePlan = await post('/api/rvc/storage/preview',{directories:storageDirectories()});
    renderStoragePlan();
    $('#rvc-storage-apply').disabled = !storagePlan.changes.length;
  });
  $('#rvc-storage-apply').onclick = handle(async () => {
    if (!storagePlan?.changes.length) throw new Error(t('rvc.error.previewFirst'));
    await start('rvc_storage_move',{directories:storageDirectories()});
  });
  $('#rvc-create').onclick = handle(async () => { project = await post('/api/rvc/projects',{name:$('#rvc-new-name').value || '我的音色'}); await refresh(); });
  $('#rvc-project').onchange = handle(async () => { project = await api(`/api/rvc/projects/${$('#rvc-project').value}`); savedValue('rvc-project',project.id); renderProject(); });
  $('#rvc-refresh').onclick = handle(refresh);
  $('#rvc-open').onclick = handle(() => post('/api/rvc/open',{kind:'projects'}));
  $('#rvc-add-speaker').onclick = handle(() => update({speakers:[...project.speakers,{id:Number($('#rvc-speaker-id').value),name:$('#rvc-speaker-name').value}]}));
  $('#rvc-speakers').onclick = handle(event => { const button = event.target.closest('[data-remove-speaker]'); if (button) return update({speakers:project.speakers.filter(s => s.id !== Number(button.dataset.removeSpeaker))}); });
  $('#rvc-import').onclick = handle(async () => {
    if (!project) throw new Error(t('rvc.error.selectProject'));
    const paths = [], names = {};
    for (const file of $('#rvc-files').files) {
      notice(t('rvc.upload.uploading',{name:file.name}));
      const upload = await api(`/api/uploads?filename=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file}); paths.push(upload.path); names[upload.path] = file.name;
    }
    await start('rvc_import',{paths,names,folder:$('#rvc-folder').value.trim(),speaker_id:Number($('#rvc-import-speaker').value),source_type:$('#rvc-source-type').value});
  });
  $('#rvc-materials').onchange = handle(async event => {
    const field = event.target.dataset.field, id = event.target.closest('[data-material]')?.dataset.material;
    if (id && field) await update({materials:[{id,[field]:field === 'speaker_id' ? Number(event.target.value) : event.target.checked}]});
  });
  $('#rvc-materials').onclick = handle(event => { const id = event.target.closest('[data-remove]')?.dataset.remove; if (id) return update({remove_material_ids:[id]}); });
  $('#rvc-separate').onclick = handle(() => start('rvc_separate',{material_ids:project.materials.filter(m => m.enabled).map(m => m.id)}));
  async function checkTraining() {
    const options = {epochs:Number($('#rvc-epochs').value),batch_size:Number($('#rvc-batch').value),version:$('#rvc-version').value,sample_rate:$('#rvc-rate').value,f0_method:$('#rvc-f0').value,save_every:Number($('#rvc-save').value),gpu:Number($('#rvc-gpu').value),num_workers:Number($('#rvc-workers').value)};
    await update({options});
    const result = await api(`/api/rvc/projects/${project.id}/preflight`);
    lastPreflight = result;
    renderPreflight();
    if (!result.ready) throw new Error(result.errors.join(t('rvc.listSeparator')));
  }
  $('#rvc-check-training').onclick = handle(checkTraining);
  $('#rvc-train').onclick = handle(async () => { await checkTraining(); await start('rvc_train',{}); });
  $('#rvc-cancel').onclick = handle(() => cancelJob(lastJob));
  $('#rvc-show-log').onclick = handle(async () => {
    const value = await api(`/api/jobs/${lastJob}/log`);
    $('#rvc-job-log').textContent = value.text || t('rvc.job.emptyLog');
    $('#rvc-job-log').classList.remove('hidden');
  });
  $('#rvc-resume').onclick = handle(async () => {
    const job = await post(`/api/jobs/${lastJob}/resume`,{});
    lastJob = job.id; lastStatus = ''; savedValue('rvc-job',job.id);
    $('#rvc-job-log').classList.add('hidden');
    await poll(); await refreshWorkspace();
  });
  $('#rvc-model-import').onclick = handle(async () => {
    const files = [...$('#rvc-model-files').files], zip = files.filter(f => /\.zip$/i.test(f.name)), models = files.filter(f => /\.pth$/i.test(f.name)), indexes = files.filter(f => /\.index$/i.test(f.name));
    if (!(zip.length === 1 && files.length === 1) && !(zip.length === 0 && models.length === 1 && indexes.length > 0)) throw new Error(t('rvc.error.modelFileChoice'));
    if (new Set(files.map(f => f.name)).size !== files.length) throw new Error(t('rvc.error.duplicateFileNames'));
    let mapping = {};
    if (!zip.length) {
      const value = $('#rvc-model-indices').value.trim();
      if (value) mapping = JSON.parse(value);
      else if (indexes.length === 1) mapping = {'0':indexes[0].name};
      else throw new Error(t('rvc.error.mappingRequired'));
      if (!mapping || Array.isArray(mapping) || typeof mapping !== 'object' || !Object.keys(mapping).length || Object.entries(mapping).some(([sid,name]) => !/^\d+$/.test(sid) || !indexes.some(f => f.name === name))) throw new Error(t('rvc.error.mappingInvalid'));
    }
    const uploaded = {};
    for (const file of files) {
      notice(t('rvc.upload.uploadingModel',{name:file.name}));
      uploaded[file.name] = (await api(`/api/rvc-upload?filename=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file})).path;
    }
    await start('rvc_model_import',{name:$('#rvc-model-name').value.trim() || undefined,...(zip.length ? {archive:uploaded[zip[0].name]} : {model:uploaded[models[0].name],indices:Object.fromEntries(Object.entries(mapping).map(([sid,name]) => [sid,uploaded[name]]))})});
  });
  $('#rvc-library').onclick = handle(async event => {
    const id = event.target.closest('[data-use-voice]')?.dataset.useVoice;
    if (id) { savedValue('rvc-voice',id); window.dispatchEvent(new CustomEvent('rvc-voice-selected',{detail:{id}})); $('.tab[data-tab="cover"]').click(); }
    const button = event.target.closest('[data-voice-action]');
    if (!button) return;
    const voiceId = button.dataset.voiceId, action = button.dataset.voiceAction, voice = voices.find(v => v.id === voiceId);
    if (action === 'export') return start('rvc_model_export',{voice_id:voiceId});
    let data = {};
    if (action === 'rename') { const name = prompt(t('rvc.voice.renamePrompt'),voice.name); if (name === null) return; data = {name}; }
    if (action === 'remove' && !confirm(t('rvc.voice.removeConfirm',{name:voice.name}))) return;
    const result = await post(`/api/rvc/voices/${voiceId}/${action}`,data);
    if (result.recovery_directory) notice(t('rvc.voice.removed',{directory:result.recovery_directory}));
    await refresh();
  });
  $('#voice-backend').value = ['rvc','compare'].includes(savedValue('voice-backend')) ? savedValue('voice-backend') : 'seed-vc';
  $('#voice-backend').onchange = updateCover;
  $('#rvc-cover-model').onchange = () => { savedValue('rvc-voice',$('#rvc-cover-model').value); renderCoverSpeakers(); };
  $('#rvc-cover-speaker').onchange = updateCover;
  for (const button of document.querySelectorAll('[data-rvc-pitch]')) button.onclick = () => { $('#rvc-pitch-shift').value = button.dataset.rvcPitch; };
  $('#rvc-disable-index').onclick = () => { $('#rvc-index-rate').value = '0'; };
  $('#rvc-cover-train').onclick = () => $('.tab[data-tab="voices"]').click();
  window.addEventListener('rvc-voice-selected', event => {
    $('#voice-backend').value = 'rvc'; $('#rvc-cover-model').value = event.detail.id;
    if (!$('#cover-abc').value.trim()) window.setCoverMode?.('direct');
    renderCoverSpeakers();
  });
  $('.tab[data-tab="voices"]').addEventListener('click',handle(refresh));
  refresh().catch(error => notice(error.message,true));
  setInterval(() => { if ($('#voices').classList.contains('active') || (lastStatus && !TERMINAL.has(lastStatus))) poll(); },1500);
  // Markup built by this file does not refresh itself, so re-render the panel's
  // dynamic content when the language changes. renderProject/renderCoverModels
  // update from cached state immediately; refresh() then re-reads the server and
  // also repaints the voice library.
  document.addEventListener('yue2:locale', () => {
    try { renderProject(); renderCoverModels(); renderStoragePlan(); renderPreflight(); }
    catch { /* panel not initialised yet */ }
    refresh().catch(() => { /* keep the cached rendering if the refresh fails */ });
    if (lastJob) poll();
  });
})();
