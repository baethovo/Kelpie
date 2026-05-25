import fs from 'node:fs';
import path from 'node:path';
import { logEvent } from './logService.js';

export const API_FORMATS = [
    { id: 'openai', label: 'OpenAI Chat Completions' },
    { id: 'openai_compat', label: 'OpenAI-Compatible' },
    { id: 'anthropic', label: 'Anthropic Messages' },
    { id: 'gemini', label: 'Google Gemini' },
];

function getSettingsPath(baseDir, userid) {
    return path.resolve(baseDir, 'data/users', userid, 'settings.json');
}

function createDefaultProfile() {
    return {
        id: 'default',
        name: 'Default OpenAI',
        format: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: '',
    };
}

function normalizeProfile(input, fallbackId = '') {
    const raw = input && typeof input === 'object' ? input : {};
    const id = String(raw.id || fallbackId || `api_${Date.now().toString(36)}`).trim();
    return {
        id,
        name: String(raw.name || 'Unnamed API').trim() || 'Unnamed API',
        format: normalizeFormat(raw.format),
        baseUrl: String(raw.baseUrl || '').trim() || 'https://api.openai.com/v1',
        apiKey: String(raw.apiKey || '').trim(),
        model: String(raw.model || '').trim(),
        lastTestAt: raw.lastTestAt,
        lastTestStatus: raw.lastTestStatus,
        lastTestLatencyMs: raw.lastTestLatencyMs,
        lastTestModel: raw.lastTestModel,
    };
}

function normalizeSettings(parsed) {
    const defaults = getDefaultSettings();
    const raw = parsed && typeof parsed === 'object' ? parsed : {};

    let profiles = Array.isArray(raw.apiProfiles)
        ? raw.apiProfiles.map((item, index) => normalizeProfile(item, `api_${index}`))
        : [];

    if (!profiles.length) {
        const migrated = normalizeProfile({
            id: 'default',
            name: 'Migrated API',
            format: 'openai',
            baseUrl: raw.apiBaseUrl || defaults.apiProfiles[0].baseUrl,
            apiKey: raw.apiKey || '',
            model: raw.model || defaults.apiProfiles[0].model,
        }, 'default');
        profiles = [migrated];
    }

    const selectedApiProfileId = String(raw.selectedApiProfileId || profiles[0].id);
    const selectedExists = profiles.some((item) => item.id === selectedApiProfileId);

    return {
        selectedApiProfileId: selectedExists ? selectedApiProfileId : profiles[0].id,
        apiProfiles: profiles,
        regexHtmlRenderEnabled: raw.regexHtmlRenderEnabled !== false,
        wholeHtmlBlockRenderEnabled: raw.wholeHtmlBlockRenderEnabled !== false,
        jsRenderEnabled: raw.jsRenderEnabled !== false,
    };
}

function getDefaultSettings() {
    const profile = createDefaultProfile();
    return {
        selectedApiProfileId: profile.id,
        apiProfiles: [profile],
        regexHtmlRenderEnabled: true,
        wholeHtmlBlockRenderEnabled: true,
        jsRenderEnabled: true,
    };
}

function normalizeFormat(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return API_FORMATS.some((item) => item.id === normalized) ? normalized : 'openai';
}

export function readUserSettings(baseDir, userid) {
    const settingsPath = getSettingsPath(baseDir, userid);
    if (!fs.existsSync(settingsPath)) {
        const defaults = getDefaultSettings();
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify(defaults, null, 2));
        return defaults;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        return normalizeSettings(parsed);
    } catch {
        return getDefaultSettings();
    }
}

export function updateUserSettings(baseDir, userid, payload) {
    const current = readUserSettings(baseDir, userid);
    const action = String(payload.action || '').trim();
    const profileId = String(payload.profileId || '').trim();
    let next = { ...current, apiProfiles: [...current.apiProfiles] };

    if (action === 'save_profile') {
        const id = profileId || `api_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
        const incoming = normalizeProfile({
            id,
            name: payload.profileName,
            format: payload.profileFormat,
            baseUrl: payload.profileBaseUrl,
            apiKey: payload.profileApiKey,
            model: payload.profileModel,
        }, id);

        const index = next.apiProfiles.findIndex((item) => item.id === id);
        if (index >= 0) {
            next.apiProfiles[index] = incoming;
        } else {
            next.apiProfiles.push(incoming);
        }

        if (!next.selectedApiProfileId) {
            next.selectedApiProfileId = incoming.id;
        }
    } else if (action === 'delete_profile') {
        next.apiProfiles = next.apiProfiles.filter((item) => item.id !== profileId);
        if (!next.apiProfiles.length) {
            next.apiProfiles = [createDefaultProfile()];
        }
        if (!next.apiProfiles.some((item) => item.id === next.selectedApiProfileId)) {
            next.selectedApiProfileId = next.apiProfiles[0].id;
        }
    } else if (action === 'set_default_profile') {
        if (next.apiProfiles.some((item) => item.id === profileId)) {
            next.selectedApiProfileId = profileId;
        }
    } else if (action === 'save_preferences') {
        if (Object.prototype.hasOwnProperty.call(payload, 'regexHtmlRenderEnabled')) {
            const rawValue = payload.regexHtmlRenderEnabled;
            next.regexHtmlRenderEnabled = !(rawValue === false || rawValue === 'false' || rawValue === 0 || rawValue === '0');
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'wholeHtmlBlockRenderEnabled')) {
            const rawValue = payload.wholeHtmlBlockRenderEnabled;
            next.wholeHtmlBlockRenderEnabled = !(rawValue === false || rawValue === 'false' || rawValue === 0 || rawValue === '0');
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'jsRenderEnabled')) {
            const rawValue = payload.jsRenderEnabled;
            next.jsRenderEnabled = !(rawValue === false || rawValue === 'false' || rawValue === 0 || rawValue === '0');
        }
    } else if (action === 'update_test_status') {
        const index = next.apiProfiles.findIndex((item) => item.id === profileId);
        if (index >= 0) {
            next.apiProfiles[index] = {
                ...next.apiProfiles[index],
                lastTestAt: payload.lastTestAt,
                lastTestStatus: payload.lastTestStatus,
                lastTestLatencyMs: payload.lastTestLatencyMs,
                lastTestModel: payload.lastTestModel
            };
        }
    }

    next = normalizeSettings(next);

    const settingsPath = getSettingsPath(baseDir, userid);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2));

    logEvent(baseDir, 'api_settings_updated', {
        userid,
        settingsPath,
        selectedApiProfileId: next.selectedApiProfileId,
        apiProfileCount: next.apiProfiles.length,
        action: action || 'none',
        profileId,
    });

    return next;
}
