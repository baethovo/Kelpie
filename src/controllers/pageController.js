import { listCharacterCards } from '../services/characterService.js';
import { readCharacterCard } from '../services/characterService.js';
import { listPresets } from '../services/presetService.js';
import { listLobbyRooms, listUserSessionsForStart } from '../services/roomService.js';
import { deleteHostSession, listHostSessions } from '../services/sessionService.js';
import { API_FORMATS, readUserSettings, updateUserSettings } from '../services/settingsService.js';
import { t } from '../i18n.js';

function pullFlash(req) {
    const flash = req.session.flash || {};
    delete req.session.flash;
    return flash;
}

export function renderIndex(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const user = req.currentUser;
    const settings = readUserSettings(baseDir, user.userid);
    const cards = listCharacterCards(baseDir, user.userid);
    let presets = [];
    try {
        presets = listPresets(baseDir, user.userid, 'api');
    } catch {
        presets = [];
    }

    const flash = pullFlash(req);
    res.render('index', {
        user,
        cards,
        presets,
        rooms: listLobbyRooms(baseDir),
        apiProfiles: settings.apiProfiles || [],
        selectedApiProfileId: settings.selectedApiProfileId || '',
        error: flash.error || null,
        success: flash.success || null,
    });
}

export function renderSessions(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const formatDateTime = (isoText) => {
        const raw = String(isoText || '').trim();
        if (!raw) return '暂无';
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return raw;
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const sessions = listHostSessions(baseDir, req.currentUser.id).map((session) => {
        let characterName = String(session.characterFile || '');
        try {
            const card = readCharacterCard(baseDir, req.currentUser.userid, session.characterFile);
            characterName = String(card?.name || '').trim() || characterName;
        } catch {
            characterName = String(session.characterFile || '');
        }

        const lastDialogueAt = String(session.lastMessageAt || '').trim() || String(session.updatedAt || '').trim();
        return {
            ...session,
            characterName,
            lastDialogueAt,
            lastDialogueAtText: formatDateTime(lastDialogueAt),
        };
    });

    const flash = pullFlash(req);
    const success = String(req.query.success || '').trim() || flash.success || null;
    const error = String(req.query.error || '').trim() || flash.error || null;

    let presets = [];
    try {
        presets = listPresets(baseDir, req.currentUser.userid, 'api');
    } catch {
        presets = [];
    }

    res.render('sessions', {
        user: req.currentUser,
        sessions,
        presets,
        success,
        error,
    });
}

export function postDeleteSession(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const sessionId = String(req.body.sessionId || '').trim();

    try {
        deleteHostSession(baseDir, req.currentUser.id, sessionId);
        req.session.flash = { success: t('sessions.session_deleted') };
        return res.redirect('/sessions');
    } catch (error) {
        req.session.flash = { error: error.message || t('common.error') };
        return res.redirect('/sessions');
    }
}

export function postUpdateSession(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const sessionId = String(req.body.sessionId || '').trim();
    const { name, presetFile } = req.body;

    try {
        const session = getSessionById(baseDir, sessionId);
        if (!session || String(session.hostUserId) !== String(req.currentUser.id)) {
            throw new Error(t('sessions.not_found_or_unauthorized'));
        }

        updateSessionSettings(baseDir, sessionId, { name, presetFile });
        req.session.flash = { success: t('sessions.session_updated') };
        return res.redirect('/sessions');
    } catch (error) {
        req.session.flash = { error: error.message || t('common.error') };
        return res.redirect('/sessions');
    }
}

export function renderApiConfig(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const user = req.currentUser;
    const settings = readUserSettings(baseDir, user.userid);
    
    const flash = pullFlash(req);
    res.render('api-config', {
        user,
        settings,
        apiFormats: API_FORMATS,
        error: flash.error || null,
        success: flash.success || null,
    });
}

export function postApiConfig(req, res) {
    const baseDir = req.app.locals.config.baseDir;

    try {
        const settings = updateUserSettings(baseDir, req.currentUser.userid, req.body);
        if (isAjaxRequest(req)) {
            return res.json({ ok: true, settings });
        }
        req.session.flash = { success: t('api.config_saved') };
        return res.redirect('/api-config');
    } catch (error) {
        if (isAjaxRequest(req)) {
            return res.status(400).json({ ok: false, error: error.message || '保存失败' });
        }
        req.session.flash = { error: error.message || t('common.save_failed') };
        return res.redirect('/api-config');
    }
}

function isAjaxRequest(req) {
    return String(req.get('X-Requested-With') || '').toLowerCase() === 'xmlhttprequest';
}

export function renderSettings(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const settings = readUserSettings(baseDir, req.currentUser.userid);
    res.render('settings', {
        user: req.currentUser,
        settings,
    });
}

export function postSettingsPreferences(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    try {
        const settings = updateUserSettings(baseDir, req.currentUser.userid, {
            action: 'save_preferences',
            regexHtmlRenderEnabled: req.body.regexHtmlRenderEnabled,
            wholeHtmlBlockRenderEnabled: req.body.wholeHtmlBlockRenderEnabled,
            jsRenderEnabled: req.body.jsRenderEnabled,
        });
        return res.json({
            ok: true,
            settings: {
                regexHtmlRenderEnabled: settings.regexHtmlRenderEnabled !== false,
                wholeHtmlBlockRenderEnabled: settings.wholeHtmlBlockRenderEnabled !== false,
                jsRenderEnabled: settings.jsRenderEnabled === true,
            },
        });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}
