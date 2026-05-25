import {
    createPreset,
    deletePreset,
    importPresetFromFile,
    listPresets,
    listPresetTypes,
    readPreset,
    restoreDefaultPreset,
    savePreset,
} from '../services/presetService.js';
import { t } from '../i18n.js';

function formatValue(value) {
    if (value === null) {
        return 'null';
    }

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    return JSON.stringify(value, null, 2);
}

function asObject(value) {
    return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
}

const OPENAI_SETTING_KEYS = [
    'openai_model',
    'chat_completion_source',
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'top_k',
    'top_a',
    'min_p',
    'repetition_penalty',
    'openai_max_context',
    'openai_max_tokens',
    'wrap_in_quotes',
    'names_behavior',
    'send_if_empty',
    'impersonation_prompt',
    'new_chat_prompt',
    'new_group_chat_prompt',
    'new_example_chat_prompt',
    'continue_nudge_prompt',
    'bias_preset_selected',
    'max_context_unlocked',
    'wi_format',
    'scenario_format',
    'personality_format',
    'group_nudge_prompt',
    'stream_openai',
];

function toPreviewText(value, maxLen = 88) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) {
        return '(No Content)';
    }
    if (text.length <= maxLen) {
        return text;
    }
    return `${text.slice(0, maxLen)}...`;
}

function resolvePromptEnabledMap(openaiPreset) {
    const promptOrder = Array.isArray(openaiPreset?.prompt_order) ? openaiPreset.prompt_order : [];
    const preferred = promptOrder.find((item) => Number(item?.character_id) === 100000) || promptOrder[0];
    const orderList = Array.isArray(preferred?.order) ? preferred.order : [];
    const enabledMap = new Map();
    orderList.forEach((item) => {
        const identifier = String(item?.identifier || '').trim();
        if (!identifier) {
            return;
        }
        enabledMap.set(identifier, !!item.enabled);
    });
    return enabledMap;
}

function resolvePromptDisplayOrder(openaiPreset) {
    const prompts = Array.isArray(openaiPreset?.prompts) ? openaiPreset.prompts : [];
    const promptOrder = Array.isArray(openaiPreset?.prompt_order) ? openaiPreset.prompt_order : [];
    const preferred = promptOrder.find((item) => Number(item?.character_id) === 100000 && Array.isArray(item?.order))
        || promptOrder.find((item) => Array.isArray(item?.order));
    const orderList = Array.isArray(preferred?.order) ? preferred.order : [];

    const indexByIdentifier = new Map();
    prompts.forEach((prompt, index) => {
        const identifier = String(prompt?.identifier || '').trim();
        if (!identifier) return;
        if (!indexByIdentifier.has(identifier)) {
            indexByIdentifier.set(identifier, index);
        }
    });

    const orderedIndexes = [];
    const seen = new Set();
    orderList.forEach((item) => {
        const identifier = String(item?.identifier || '').trim();
        if (!identifier) return;
        const idx = indexByIdentifier.get(identifier);
        if (!Number.isInteger(idx) || seen.has(idx)) return;
        seen.add(idx);
        orderedIndexes.push(idx);
    });
    prompts.forEach((_prompt, index) => {
        if (seen.has(index)) return;
        orderedIndexes.push(index);
    });
    return orderedIndexes;
}

function isSystemVariableEntry({ role, marker, content }) {
    if (marker) {
        return true;
    }
    if (String(role || '').toLowerCase() !== 'system') {
        return false;
    }

    const text = String(content || '');
    if (!text.trim()) {
        return false;
    }

    return /\{\{[^}]+\}\}/.test(text) || /\{\{setvar::/i.test(text);
}

function resolveEnabledByRule(item, enabledMap, identifier) {
    if (typeof item?.enabled === 'boolean') {
        return item.enabled;
    }
    if (enabledMap.has(identifier)) {
        return enabledMap.get(identifier);
    }
    return true;
}

function toPresetSections(parsed) {
    const openai = asObject(parsed?.openai);
    const context = asObject(parsed?.context);
    const instruct = asObject(parsed?.instruct);
    const sysprompt = asObject(parsed?.sysprompt);
    const promptEnabledMap = resolvePromptEnabledMap(openai);
    const prompts = Array.isArray(openai.prompts) ? openai.prompts : [];
    const promptDisplayOrder = resolvePromptDisplayOrder(openai);

    const openaiItems = promptDisplayOrder.map((index) => {
        const prompt = prompts[index] || {};
        const identifier = String(prompt?.identifier || `prompt_${index + 1}`).trim();
        const title = String(prompt?.name || identifier || `Prompt ${index + 1}`).trim();
        const enabled = resolveEnabledByRule(prompt, promptEnabledMap, identifier);
        const role = String(prompt?.role || '').trim() || (prompt?.system_prompt ? 'system' : 'assistant');
        const marker = !!prompt?.marker;
        const content = String(prompt?.content || '');
        const contentPreview = toPreviewText(content);
        const placeholder = isSystemVariableEntry({ role, marker, content });

        return {
            id: identifier,
            title,
            enabled,
            role,
            injectionDepth: Number.isFinite(Number(prompt?.injection_depth)) ? Number(prompt.injection_depth) : null,
            meta: [identifier, marker ? 'marker' : ''].filter(Boolean).join(' | '),
            placeholder,
            preview: contentPreview,
            detail: JSON.stringify(prompt, null, 2),
        };
    });

    const openaiSettingItems = OPENAI_SETTING_KEYS
        .filter((key) => Object.prototype.hasOwnProperty.call(openai, key))
        .map((key) => {
            const value = openai[key];
            return {
                id: `openai.${key}`,
                title: key,
                enabled: typeof value === 'boolean' ? value : true,
                role: 'system',
                injectionDepth: null,
                meta: 'openai setting',
                placeholder: false,
                preview: toPreviewText(formatValue(value)),
                detail: JSON.stringify({ [key]: value }, null, 2),
            };
        });

    return [
        {
            key: 'openai_settings',
            title: 'openai.settings',
            items: openaiSettingItems,
        },
        {
            key: 'openai',
            title: 'openai.prompts',
            items: openaiItems,
        },
        {
            key: 'context',
            title: 'context',
            items: [{
                id: 'context',
                title: String(context.name || 'Context Template').trim(),
                enabled: typeof context.enabled === 'boolean' ? context.enabled : true,
                role: String(context.role || 'system'),
                injectionDepth: Number.isFinite(Number(context.injection_depth)) ? Number(context.injection_depth) : null,
                meta: 'story_string',
                placeholder: isSystemVariableEntry({ role: 'system', marker: false, content: context.story_string }),
                preview: toPreviewText(context.story_string),
                detail: JSON.stringify(context, null, 2),
            }],
        },
        {
            key: 'instruct',
            title: 'instruct',
            items: [{
                id: 'instruct',
                title: String(instruct.name || 'Instruct Template').trim(),
                enabled: !!instruct.enabled,
                role: String(instruct.role || 'system'),
                injectionDepth: Number.isFinite(Number(instruct.injection_depth)) ? Number(instruct.injection_depth) : null,
                meta: 'instruct mode',
                placeholder: false,
                preview: toPreviewText([
                    instruct.system_sequence,
                    instruct.input_sequence,
                    instruct.output_sequence,
                ].filter(Boolean).join(' ')),
                detail: JSON.stringify(instruct, null, 2),
            }],
        },
        {
            key: 'sysprompt',
            title: 'sysprompt',
            items: [{
                id: 'sysprompt',
                title: String(sysprompt.name || 'System Prompt').trim(),
                enabled: !!sysprompt.enabled,
                role: String(sysprompt.role || 'system'),
                injectionDepth: Number.isFinite(Number(sysprompt.injection_depth)) ? Number(sysprompt.injection_depth) : null,
                meta: 'system prompt',
                placeholder: isSystemVariableEntry({ role: 'system', marker: false, content: sysprompt.content }),
                preview: toPreviewText(sysprompt.content),
                detail: JSON.stringify(sysprompt, null, 2),
            }],
        },
    ];
}

function toPresetStats(sections) {
    const safeSections = Array.isArray(sections) ? sections : [];
    let total = 0;
    let enabled = 0;
    let placeholders = 0;

    safeSections.forEach((section) => {
        // Skip internal openai_settings from the stats display
        if (section.key === 'openai_settings') return;
        
        const items = Array.isArray(section?.items) ? section.items : [];
        const sectionTotal = items.length;
        const sectionEnabled = items.filter((item) => !!item?.enabled).length;
        const sectionPlaceholders = items.filter((item) => !!item?.placeholder).length;
        const sectionDisabled = sectionTotal - sectionEnabled;

        section.total = sectionTotal;
        section.enabled = sectionEnabled;
        section.disabled = sectionDisabled;
        section.placeholders = sectionPlaceholders;

        total += sectionTotal;
        enabled += sectionEnabled;
        placeholders += sectionPlaceholders;
    });

    return {
        total,
        enabled,
        disabled: total - enabled,
        placeholders,
    };
}

function buildPresetsViewModel(req, extra = {}) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    const presetTypes = listPresetTypes();
    const fallbackType = presetTypes[0]?.id || 'api';
    const requestedType = String(req.query.type || extra.selectedType || fallbackType).trim().toLowerCase();
    const selectedType = presetTypes.some((item) => item.id === requestedType) ? requestedType : fallbackType;

    const presets = listPresets(baseDir, userid, selectedType);
    const requestedFile = String(req.query.preset || extra.selectedFile || '').trim();
    const selectedFile = requestedFile;
    let selectedPreset = null;
    let presetSections = [];
    let presetStats = { total: 0, enabled: 0, disabled: 0, placeholders: 0 };

    if (selectedFile) {
        try {
            selectedPreset = readPreset(baseDir, userid, selectedType, selectedFile);
            presetSections = toPresetSections(selectedPreset.parsed);
            presetStats = toPresetStats(presetSections);
        } catch {
            selectedPreset = null;
            presetSections = [];
            presetStats = { total: 0, enabled: 0, disabled: 0, placeholders: 0 };
        }
    }

    return {
        user: req.currentUser,
        presetTypes,
        selectedType,
        presets,
        selectedFile,
        selectedPreset,
        presetSections,
        presetStats,
        error: null,
        success: null,
        ...extra,
    };
}

function wantsJson(req) {
    const accept = String(req.headers?.accept || '').toLowerCase();
    const requestedWith = String(req.headers?.['x-requested-with'] || '').toLowerCase();
    return accept.includes('application/json') || requestedWith === 'xmlhttprequest';
}

export function renderPresets(req, res) {
    res.render('presets', buildPresetsViewModel(req));
}

export function apiGetPreset(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    const fileName = String(req.params.fileName || '').trim();
    const apiId = String(req.query.type || 'api').trim().toLowerCase();

    try {
        const preset = readPreset(baseDir, userid, apiId, fileName);
        return res.json({
            ok: true,
            preset: {
                fileName: preset.fileName,
                displayName: preset.displayName,
                jsonText: preset.jsonText,
            },
        });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export function postImportPreset(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    const apiId = String(req.body.apiId || 'api').trim().toLowerCase();
    const presetFile = req.file;

    if (!presetFile) {
        if (wantsJson(req)) {
            return res.status(400).json({ ok: false, error: t('presets.no_preset_file') });
        }
        return res.status(400).render('presets', buildPresetsViewModel(req, {
            selectedType: apiId,
            error: t('presets.no_preset_file'),
        }));
    }

    try {
        // Fix filename encoding (latin1 -> utf8)
        const originalName = Buffer.from(presetFile.originalname, 'latin1').toString('utf8');
        const imported = importPresetFromFile(
            baseDir,
            userid,
            apiId,
            originalName || 'preset.json',
            presetFile.buffer.toString('utf8'),
        );

        if (wantsJson(req)) {
            return res.json({
                ok: true,
                imported,
                presets: listPresets(baseDir, userid, imported.apiId),
                selectedType: imported.apiId,
                selectedFile: imported.fileName,
                message: `${t('presets.import_success')}：${imported.displayName}`,
                redirect: `/presets?type=${encodeURIComponent(imported.apiId)}&preset=${encodeURIComponent(imported.fileName)}`,
            });
        }

        return res.render('presets', buildPresetsViewModel(req, {
            selectedType: imported.apiId,
            selectedFile: imported.fileName,
            success: `${t('presets.import_success')}：${imported.displayName}`,
        }));
    } catch (error) {
        if (wantsJson(req)) {
            return res.status(400).json({ ok: false, error: error.message });
        }
        return res.status(400).render('presets', buildPresetsViewModel(req, {
            selectedType: apiId,
            error: error.message,
        }));
    }
}

export function postCreatePreset(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    const apiId = String(req.body.apiId || 'api').trim().toLowerCase();
    const presetName = String(req.body.presetName || '').trim();

    try {
        const created = createPreset(baseDir, userid, apiId, presetName);
        if (wantsJson(req)) {
            return res.json({
                ok: true,
                saved: created,
                presets: listPresets(baseDir, userid, created.apiId),
                selectedType: created.apiId,
                selectedFile: created.fileName,
                message: `${t('presets.create_success')}：${created.displayName}`,
            });
        }
        return res.render('presets', buildPresetsViewModel(req, {
            selectedType: created.apiId,
            selectedFile: created.fileName,
            success: `${t('presets.create_success')}：${created.displayName}`,
        }));
    } catch (error) {
        if (wantsJson(req)) {
            return res.status(400).json({ ok: false, error: error.message });
        }
        return res.status(400).render('presets', buildPresetsViewModel(req, {
            selectedType: apiId,
            error: error.message,
        }));
    }
}

export function postSavePreset(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    const apiId = String(req.body.apiId || 'api').trim().toLowerCase();
    const presetName = String(req.body.presetName || '').trim();
    const presetJson = String(req.body.presetJson || '').trim();

    try {
        const saved = savePreset(baseDir, userid, apiId, presetName, presetJson);
        if (wantsJson(req)) {
            return res.json({
                ok: true,
                saved,
                presets: listPresets(baseDir, userid, saved.apiId),
                selectedType: saved.apiId,
                selectedFile: saved.fileName,
                message: `${t('presets.save_success')}：${saved.displayName}`,
            });
        }
        return res.render('presets', buildPresetsViewModel(req, {
            selectedType: saved.apiId,
            selectedFile: saved.fileName,
            success: `${t('presets.save_success')}：${saved.displayName}`,
        }));
    } catch (error) {
        if (wantsJson(req)) {
            return res.status(400).json({ ok: false, error: error.message });
        }
        return res.status(400).render('presets', buildPresetsViewModel(req, {
            selectedType: apiId,
            selectedFile: String(req.body.presetFile || '').trim(),
            error: error.message,
        }));
    }
}

export function postDeletePreset(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    const apiId = String(req.body.apiId || 'api').trim().toLowerCase();
    const presetFile = String(req.body.presetFile || '').trim();

    try {
        deletePreset(baseDir, userid, apiId, presetFile);
        if (wantsJson(req)) {
            return res.json({
                ok: true,
                presets: listPresets(baseDir, userid, apiId),
                selectedType: apiId,
                selectedFile: '',
                message: `${t('presets.delete_success')}：${presetFile}`,
            });
        }
        return res.render('presets', buildPresetsViewModel(req, {
            selectedType: apiId,
            selectedFile: '',
            success: `${t('presets.delete_success')}：${presetFile}`,
        }));
    } catch (error) {
        if (wantsJson(req)) {
            return res.status(400).json({ ok: false, error: error.message });
        }
        return res.status(400).render('presets', buildPresetsViewModel(req, {
            selectedType: apiId,
            selectedFile: presetFile,
            error: error.message,
        }));
    }
}

export function postRestorePreset(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    const apiId = String(req.body.apiId || 'api').trim().toLowerCase();
    const presetFile = String(req.body.presetFile || '').trim();

    try {
        const restored = restoreDefaultPreset(baseDir, userid, apiId, presetFile);
        if (wantsJson(req)) {
            const preset = readPreset(baseDir, userid, restored.apiId, restored.fileName);
            return res.json({
                ok: true,
                restored,
                preset: {
                    fileName: preset.fileName,
                    displayName: preset.displayName,
                    jsonText: preset.jsonText,
                },
                presets: listPresets(baseDir, userid, restored.apiId),
                selectedType: restored.apiId,
                selectedFile: restored.fileName,
                message: `${t('presets.restore_success')}：${restored.displayName}`,
            });
        }
        return res.render('presets', buildPresetsViewModel(req, {
            selectedType: restored.apiId,
            selectedFile: restored.fileName,
            success: `${t('presets.restore_success')}：${restored.displayName}`,
        }));
    } catch (error) {
        if (wantsJson(req)) {
            return res.status(400).json({ ok: false, error: error.message });
        }
        return res.status(400).render('presets', buildPresetsViewModel(req, {
            selectedType: apiId,
            selectedFile: presetFile,
            error: error.message,
        }));
    }
}
