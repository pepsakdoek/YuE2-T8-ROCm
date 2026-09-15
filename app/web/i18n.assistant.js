/* Dictionary for the AI creation assistant panel (assistant.js) and the
 * assistant-related markup in index.html.
 *
 * The Chinese side is the ORIGINAL wording from the pre-i18n UI, preserved
 * verbatim; the English side is the translation. Keep both in sync when adding
 * a key — i18n.js falls back to `zh` and logs a console warning on a miss.
 *
 * Key namespace: assistant.*
 *   assistant.stage.*       job stage labels (the stage names themselves are
 *                           server protocol values and are never translated)
 *   assistant.field.*       labels of the advanced creation form
 *   assistant.models.*      channel/model block
 *   assistant.send.*        "send creation to another page" dialog
 *   assistant.error.*       thrown/printed error messages
 *   assistant.confirm.*     confirm() prompts
 *   assistant.export.*      downloaded / copied text
 *
 * Note: option VALUE arrays in assistant.js (quality_modes from the API,
 * ['English', '中文'], ['保留 / Preserve', ...]) are submitted to the backend and
 * validated in app/yue2_app/assistant_rules/engine.py, so they are deliberately
 * left untranslated.
 */
window.YUE2_I18N.registerLocale('zh', {
  // Job stages shown in the progress line and in the shared task views.
  'assistant.stage.lyrics': '创作歌词',
  'assistant.stage.lyricsLanguageRepair': '修正歌词语言',
  'assistant.stage.style': '创作曲风',
  'assistant.stage.review': '审校文本',
  'assistant.stage.reviewRepair': '修订文本',
  'assistant.stage.abc': '创作 ABC',
  'assistant.stage.abcRepair': '修正 ABC',
  'assistant.stage.connection': '测试模型连接',

  // Progress line.
  'assistant.progress.queued': '等待当前任务结束后开始',
  'assistant.progress.line': '{stage} · 已用 {seconds} 秒',
  'assistant.progress.lineWithCalls': '{stage} · 已用 {seconds} 秒 · {calls} 次调用',
  'assistant.progress.cancel': '取消本次创作',
  'assistant.progress.connectionOk': '模型连接测试通过；这是文本请求测试，不代表作谱或音乐生成已验收。',
  'assistant.progress.restore': '查看已完成结果（保留当前草稿前请先下载）',
  'assistant.progress.finished': '该任务已结束。当前编辑已保留，可查看任务的最新结果。',
  'assistant.progress.viewLatest': '查看最新任务结果',

  // Outcome badge and the note above the result.
  'assistant.outcome.partial': '部分完成 · 已保留可用内容',
  'assistant.outcome.success': '创作完成',
  'assistant.outcome.saved': '已保存的创作内容',
  'assistant.resultNote.initial': '文本与谱面检查不等于听感验收。发送仅填入目标页面，不会自动开始制作音频。',
  'assistant.resultNote.edited': '文本已修改；已有谱面未随文本更新，发送前请确认词谱对应。',

  // ABC score status (keys are server abc_status values).
  'assistant.abcStatus.validated': 'ABC 已通过原生格式校验；编辑后需要重新校验。',
  'assistant.abcStatus.failed': '作谱未通过，歌词与曲风已保留。可单独重试作谱，或交给 YuE2 规划。',
  'assistant.abcStatus.downstreamYue2': 'ABC 留空：将在目标页面交给 YuE2 规划。',
  'assistant.abcStatus.off': '当前选择不用谱面。',
  'assistant.abcStatus.pending': 'ABC 已修改，发送前将重新校验。',
  'assistant.abcStatus.notRequested': '尚未生成 ABC。',
  'assistant.abcStatus.unknown': '谱面状态待检查',

  // Draft saving.
  'assistant.draft.saved': '草稿已保存',
  'assistant.draft.unsaved': '草稿未保存：{error}',
  'assistant.draft.errorItem': '{panel}：{error}',
  'assistant.draft.errorSeparator': '；',

  // Score plan badge (shared with app.js states).
  'assistant.plan.badge.imported': '外部导入谱 · 重新生成',
  'assistant.plan.badge.original': '原始计划',
  'assistant.plan.badge.unavailable': '原计划不可用 · 可用当前 ABC 重新生成',

  // Cover panel.
  'assistant.cover.instrumentalTitle': '纯器乐没有可转换的人声，请使用旋律重制',

  // Advanced creation form labels.
  'assistant.field.qualityMode': '创作审校',
  'assistant.field.styleLanguage': '曲风描述语言',
  'assistant.field.structure': '歌曲结构',
  'assistant.field.genre': '曲风',
  'assistant.field.vocal': '人声',
  'assistant.field.instruments': '乐器',
  'assistant.field.bpm': 'BPM（0 为自动）',
  'assistant.field.meter': '拍号',
  'assistant.field.keyScale': '调性',
  'assistant.field.targetDuration': '时长意向（秒）',
  'assistant.field.constraints': '其他要求',
  'assistant.field.creativity': '创作自由度',
  'assistant.field.editSection': '要改写的段落',
  'assistant.field.editOccurrence': '第几次出现',
  'assistant.field.editRequest': '改词要求',
  'assistant.field.abc': '已有 ABC（优先保留）',
  'assistant.field.abcAction': '已有谱面处理',
  'assistant.field.seed': '文字随机种子',
  'assistant.field.instrumental': '纯器乐（允许歌词为空）',

  // Cost hint and the generate button.
  'assistant.cost.compose': '将调用当前 LLM 作谱，可能需要数分钟；失败最多修正一次。本地小模型的谱面可能无法通过校验。 每项流程最多 8 次模型调用；网络异常不会自动重发。',
  'assistant.cost.textOnly': '只生成文本，不使用 ABC。 每项流程最多 8 次模型调用；网络异常不会自动重发。',
  'assistant.cost.plan': '本次先生成文本；ABC 交给目标页面的 YuE2 规划。 每项流程最多 8 次模型调用；网络异常不会自动重发。',
  'assistant.generate.withAbc': '创作歌词、曲风与 ABC',
  'assistant.generate.textOnly': '创作歌词与曲风',

  // Channel and model settings.
  'assistant.provider.signup.seedance': '获取贞贞平价小屋 API Key',
  'assistant.provider.signup.workshop': '获取贞贞 AI 工坊 API Key',
  'assistant.models.refreshLocal': '刷新本地 GGUF',
  'assistant.models.fetchList': '获取模型 LIST',
  'assistant.models.placeholder.local': '选择扫描到的 GGUF 文件',
  'assistant.models.placeholder.compatible': '填写模型 ID，或获取模型 LIST',
  'assistant.models.placeholder.default': '选择默认模型，或填写其他模型 ID',
  'assistant.models.status.provided': '已提供 {count} 个渠道默认模型',
  'assistant.models.status.scanned': '已扫描到 {count} 个本地 GGUF',
  'assistant.models.status.reading': '正在读取渠道模型 LIST…',
  'assistant.models.status.read': '已读取 {count} 个模型；仍可手动填写 ID',
  'assistant.models.status.error': '{error}；已保留默认模型和手动填写',
  'assistant.models.contextLength': '上下文 {count}',
  'assistant.models.shards': '{count} 个分片',
  'assistant.configStatus.switchedLocal': '已切换为本地模式，请保存设置',
  'assistant.configStatus.switchedProvider': '已切换渠道，请填写该渠道对应的 API Key',
  'assistant.configStatus.saved': '设置已保存',
  'assistant.configStatus.savedWithCredential': '设置已保存 · 已关联凭据',
  'assistant.capability.cudaReady': '本地 CUDA 环境已就绪，需通过模型连接测试',
  'assistant.capability.cpuOnly': '本地环境仅通过 CPU 检查，需通过模型连接测试',
  'assistant.capability.noRuntime': '本地 GGUF 环境未完成安装 · API 可用',

  // "Send the creation to another page" dialog.
  'assistant.send.title.create': '发送到歌曲创作',
  'assistant.send.title.plan': '发送到乐谱计划',
  'assistant.send.title.cover': '发送到旋律重制',
  'assistant.send.warning': '将替换目标页面中选中的字段，已有种子与上传音频保留。填入后可撤销。',
  'assistant.send.details.cover': '发送谱面时会去除和弦，并验证两个声部的音高与节奏不变。只选 ABC 可能与目标已有歌词不匹配。',
  'assistant.send.details.create': '该页只接收歌词、曲风及规划模式；如需使用这份 ABC，请发送到乐谱计划。',
  'assistant.send.details.default': '有 ABC 时建议整套发送，避免谱面与目标页面的旧歌词错配。',
  'assistant.transfer.filled': '已填入草稿，尚未开始生成音频。',

  // Confirmation prompts.
  'assistant.confirm.replaceEditor': '用这个任务的结果替换当前编辑区？',
  'assistant.confirm.replaceEditorDownload': '替换当前编辑区？需要保留的内容请先下载。',
  'assistant.confirm.loadJob': '载入该任务？当前内容可先保存或下载。',

  // Error messages.
  'assistant.error.connectionLost': '连接中断：{error}。任务可能仍在运行，刷新后可恢复查看。',
  'assistant.error.initFailed': '助手初始化失败：{error}',
  'assistant.error.noJob': '请先选择一个助手任务',
  'assistant.error.noAbc': '没有可用 ABC；可以先发送歌词与曲风',
  'assistant.error.noField': '至少选择一个字段',
  'assistant.error.planMode': '乐谱页需要明确选择旋律或完整谱面；也可取消并发送到歌曲创作，保留 off',
  'assistant.error.contentChanged': '内容已发生变化，请关闭后重新发送，避免覆盖新编辑',
  'assistant.error.targetEdited': '目标页在发送期间有新编辑，已保留新编辑，请重新发送',
  'assistant.error.undoConflict': '填入后已有新编辑，不能覆盖。请手动恢复需要的字段。',
  'assistant.error.undoEdited': '撤销期间有新编辑，已保留新编辑；没有覆盖。',
  'assistant.error.validateChanged': '校验期间内容有修改，请重新校验当前 ABC',

  // Downloaded and copied text.
  'assistant.export.file': '曲风\n{style}\n\n歌词\n{lyrics}\n',
  'assistant.export.clipboard': '曲风\n{style}\n\n歌词\n{lyrics}',

  // Visible labels for option values that are submitted to the backend verbatim.
  // The values stay Chinese because app/yue2_app/assistant_rules/engine.py
  // compares against them; only the label shown in the dropdown is translated.
  // Mirrors OPTION_LABELS in assistant.js.
  'assistant.option.chinese': '中文',
  'assistant.option.english': 'English',
  'assistant.option.japanese': '日本語',
  'assistant.option.korean': '한국어',
  'assistant.option.lyricsAuto': 'AUTO（有词保留，无词创作）',
  'assistant.option.lyricsGenerate': '生成新歌词 / New lyrics',
  'assistant.option.lyricsPreserve': '严格保留歌词 / Preserve',
  'assistant.option.lyricsEdit': '定向改词 / Edit section',
  'assistant.option.lyricsInstrumental': '纯器乐 / Instrumental',
  'assistant.option.qualityStandard': '标准 / Standard',
  'assistant.option.qualityReviewed': '创作审校 / Reviewed',
  'assistant.option.abcPreserve': '保留 / Preserve',
  'assistant.option.abcStripChords': '去和弦，保留双声部旋律 / Strip chords',
  'assistant.option.abcCompose': '自动创作 ABC（T8 LLM）/ Compose',
  'assistant.option.abcDownstream': '交给下游 YuE2 规划（ABC 留空）/ Downstream',
});

window.YUE2_I18N.registerLocale('en', {
  // Job stages shown in the progress line and in the shared task views.
  'assistant.stage.lyrics': 'Writing lyrics',
  'assistant.stage.lyricsLanguageRepair': 'Fixing the lyrics language',
  'assistant.stage.style': 'Writing the style',
  'assistant.stage.review': 'Reviewing the text',
  'assistant.stage.reviewRepair': 'Revising the text',
  'assistant.stage.abc': 'Composing the ABC score',
  'assistant.stage.abcRepair': 'Fixing the ABC score',
  'assistant.stage.connection': 'Testing the model connection',

  // Progress line.
  'assistant.progress.queued': 'Waiting for the current task to finish',
  'assistant.progress.line': '{stage} · {seconds}s elapsed',
  'assistant.progress.lineWithCalls': '{stage} · {seconds}s elapsed · {calls} calls',
  'assistant.progress.cancel': 'Cancel this creation',
  'assistant.progress.connectionOk': 'The model connection test passed; this only tests a text request and does not validate score writing or music generation.',
  'assistant.progress.restore': 'View the finished result (download first if you want to keep the current draft)',
  'assistant.progress.finished': 'This task has finished. Your current edits were kept; you can view the latest result of the task.',
  'assistant.progress.viewLatest': 'View the latest task result',

  // Outcome badge and the note above the result.
  'assistant.outcome.partial': 'Partly finished · usable content kept',
  'assistant.outcome.success': 'Creation finished',
  'assistant.outcome.saved': 'Saved creation',
  'assistant.resultNote.initial': 'Checking the text and the score is not a listening test. Sending only fills in the target page and never starts audio generation by itself.',
  'assistant.resultNote.edited': 'The text was edited; the existing score was not updated with it, so check that lyrics and score match before sending.',

  // ABC score status (keys are server abc_status values).
  'assistant.abcStatus.validated': 'The ABC passed native format validation; edit it and it needs validating again.',
  'assistant.abcStatus.failed': 'Score writing failed; the lyrics and style were kept. Retry score writing on its own, or hand it to YuE2 planning.',
  'assistant.abcStatus.downstreamYue2': 'ABC left empty: it will be handed to YuE2 planning on the target page.',
  'assistant.abcStatus.off': 'The current selection does not use a score.',
  'assistant.abcStatus.pending': 'The ABC was changed and will be validated again before sending.',
  'assistant.abcStatus.notRequested': 'No ABC score generated yet.',
  'assistant.abcStatus.unknown': 'Score status not checked yet',

  // Draft saving.
  'assistant.draft.saved': 'Draft saved',
  'assistant.draft.unsaved': 'Draft not saved: {error}',
  'assistant.draft.errorItem': '{panel}: {error}',
  'assistant.draft.errorSeparator': '; ',

  // Score plan badge (shared with app.js states).
  'assistant.plan.badge.imported': 'Externally imported score · regenerate',
  'assistant.plan.badge.original': 'Original plan',
  'assistant.plan.badge.unavailable': 'The original plan is unavailable · regenerate from the current ABC',

  // Cover panel.
  'assistant.cover.instrumentalTitle': 'Instrumental audio has no vocals to convert; use melody remake instead',

  // Advanced creation form labels.
  'assistant.field.qualityMode': 'Creation review',
  'assistant.field.styleLanguage': 'Style description language',
  'assistant.field.structure': 'Song structure',
  'assistant.field.genre': 'Style / genre',
  'assistant.field.vocal': 'Vocals',
  'assistant.field.instruments': 'Instruments',
  'assistant.field.bpm': 'BPM (0 = automatic)',
  'assistant.field.meter': 'Meter',
  'assistant.field.keyScale': 'Key / scale',
  'assistant.field.targetDuration': 'Target duration (seconds)',
  'assistant.field.constraints': 'Other requirements',
  'assistant.field.creativity': 'Creative freedom',
  'assistant.field.editSection': 'Section to rewrite',
  'assistant.field.editOccurrence': 'Occurrence',
  'assistant.field.editRequest': 'Lyric rewrite instructions',
  'assistant.field.abc': 'Existing ABC (kept when possible)',
  'assistant.field.abcAction': 'Existing score handling',
  'assistant.field.seed': 'Text random seed',
  'assistant.field.instrumental': 'Instrumental (lyrics may be empty)',

  // Cost hint and the generate button.
  'assistant.cost.compose': 'The current LLM will compose the score, which can take several minutes; a failure is repaired at most once. Scores from small local models may fail validation. Each run makes at most 8 model calls; network errors are not retried automatically.',
  'assistant.cost.textOnly': 'Text only, no ABC score. Each run makes at most 8 model calls; network errors are not retried automatically.',
  'assistant.cost.plan': 'This run generates text first; the ABC score is left to YuE2 planning on the target page. Each run makes at most 8 model calls; network errors are not retried automatically.',
  'assistant.generate.withAbc': 'Write lyrics, style and ABC score',
  'assistant.generate.textOnly': 'Write lyrics and style',

  // Channel and model settings.
  'assistant.provider.signup.seedance': 'Get a 贞贞平价小屋 API key',
  'assistant.provider.signup.workshop': 'Get a 贞贞 AI 工坊 API key',
  'assistant.models.refreshLocal': 'Rescan local GGUF files',
  'assistant.models.fetchList': 'Fetch the model LIST',
  'assistant.models.placeholder.local': 'Pick a scanned GGUF file',
  'assistant.models.placeholder.compatible': 'Enter a model ID, or fetch the model LIST',
  'assistant.models.placeholder.default': 'Pick the default model, or enter another model ID',
  'assistant.models.status.provided': '{count} default channel models are available',
  'assistant.models.status.scanned': 'Found {count} local GGUF files',
  'assistant.models.status.reading': 'Reading the channel model LIST…',
  'assistant.models.status.read': '{count} models read; you can still type an ID manually',
  'assistant.models.status.error': '{error}; the default model and manual entry were kept',
  'assistant.models.contextLength': 'Context {count}',
  'assistant.models.shards': '{count} shards',
  'assistant.configStatus.switchedLocal': 'Switched to local mode; save the settings',
  'assistant.configStatus.switchedProvider': 'Channel switched; enter the API key for this channel',
  'assistant.configStatus.saved': 'Settings saved',
  'assistant.configStatus.savedWithCredential': 'Settings saved · credential linked',
  'assistant.capability.cudaReady': 'The local CUDA environment is ready; a model connection test is still required',
  'assistant.capability.cpuOnly': 'The local environment passed a CPU-only check; a model connection test is still required',
  'assistant.capability.noRuntime': 'The local GGUF environment is not fully installed · API is available',

  // "Send the creation to another page" dialog.
  'assistant.send.title.create': 'Send to song creation',
  'assistant.send.title.plan': 'Send to the score plan',
  'assistant.send.title.cover': 'Send to melody remake',
  'assistant.send.warning': 'The selected fields on the target page will be replaced; the existing seed and uploaded audio are kept. You can undo after filling in.',
  'assistant.send.details.cover': 'Sending the score strips the chords and verifies that the pitch and rhythm of both voices stay unchanged. Sending ABC on its own may not match the existing lyrics on the target page.',
  'assistant.send.details.create': 'That page only accepts lyrics, style and the planning mode; to use this ABC, send it to the score plan.',
  'assistant.send.details.default': 'When an ABC is available, send the whole set to avoid mismatching the score with older lyrics on the target page.',
  'assistant.transfer.filled': 'Filled into the draft; audio generation has not started.',

  // Confirmation prompts.
  'assistant.confirm.replaceEditor': 'Replace the current editor with the result of this task?',
  'assistant.confirm.replaceEditorDownload': 'Replace the current editor? Download anything you want to keep first.',
  'assistant.confirm.loadJob': 'Load this task? You can save or download the current content first.',

  // Error messages.
  'assistant.error.connectionLost': 'Connection lost: {error}. The task may still be running; refresh to resume watching it.',
  'assistant.error.initFailed': 'Assistant initialization failed: {error}',
  'assistant.error.noJob': 'Select an assistant task first',
  'assistant.error.noAbc': 'No usable ABC; you can send the lyrics and style first',
  'assistant.error.noField': 'Select at least one field',
  'assistant.error.planMode': 'The score page needs an explicit melody or full-score choice; you can also cancel and send to song creation with off',
  'assistant.error.contentChanged': 'The content changed; close the dialog and send again so that newer edits are not overwritten',
  'assistant.error.targetEdited': 'The target page gained new edits while sending; those edits were kept, please send again',
  'assistant.error.undoConflict': 'New edits appeared after the fill-in, so they cannot be overwritten. Restore the fields you need by hand.',
  'assistant.error.undoEdited': 'New edits appeared during the undo; they were kept and nothing was overwritten.',
  'assistant.error.validateChanged': 'The content changed during validation; validate the current ABC again',

  // Downloaded and copied text.
  'assistant.export.file': 'Style\n{style}\n\nLyrics\n{lyrics}\n',
  'assistant.export.clipboard': 'Style\n{style}\n\nLyrics\n{lyrics}',

  // Visible labels for option values that are submitted to the backend verbatim.
  'assistant.option.chinese': 'Chinese',
  'assistant.option.english': 'English',
  'assistant.option.japanese': 'Japanese',
  'assistant.option.korean': 'Korean',
  'assistant.option.lyricsAuto': 'Auto (keep existing lyrics, write if none)',
  'assistant.option.lyricsGenerate': 'Write new lyrics',
  'assistant.option.lyricsPreserve': 'Strictly preserve the lyrics',
  'assistant.option.lyricsEdit': 'Edit selected lines',
  'assistant.option.lyricsInstrumental': 'Instrumental only',
  'assistant.option.qualityStandard': 'Standard',
  'assistant.option.qualityReviewed': 'Reviewed',
  'assistant.option.abcPreserve': 'Preserve',
  'assistant.option.abcStripChords': 'Strip chords, keep the two-voice melody',
  'assistant.option.abcCompose': 'Compose ABC (T8 LLM)',
  'assistant.option.abcDownstream': 'Let downstream YuE2 plan it (ABC blank)',
});
