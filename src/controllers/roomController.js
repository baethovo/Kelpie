import {
    createRoom,
    deleteRoomMessage,
    forceStartRound,
    getRoomPresetState,
    getRoomRealtimeState,
    getRoomViewModel,
    regenerateRound,
    setRoomOpeningSelection,
    joinRoomByCode,
    leaveRoom,
    listLobbyRooms,
    setRoomSessionPreset,
    listUserSessionsForStart,
    verifyRoomJoin,
    submitMemberInput,
    getRoomRegexState,
    updateRoomMessage,
    getRoomUserPersonaState,
    setRoomUserPersonaState,
    updateRoom,
} from '../services/roomService.js';
import { listCharacterCards, readCharacterCard, readCharacterAvatar } from '../services/characterService.js';
import { listPresets } from '../services/presetService.js';
import { readWorldBook, listWorldBooks } from '../services/worldBookService.js';
import { readUserSettings } from '../services/settingsService.js';
import { getStore } from '../models/store.js';

function renderHomeWithMessage(req, res, extra = {}, status = 400) {
    const baseDir = req.app.locals.config.baseDir;
    const user = req.currentUser;
    const settings = readUserSettings(baseDir, user.userid);
    let presets = [];
    try {
        presets = listPresets(baseDir, user.userid, 'api');
    } catch {
        presets = [];
    }

    const flash = req.session.flash || {};
    if (req.session.flash) delete req.session.flash;

    return res.status(status).render('index', {
        user,
        cards: listCharacterCards(baseDir, user.userid),
        presets,
        worldBooks: listWorldBooks(baseDir, user.userid),
        apiProfiles: settings.apiProfiles || [],
        selectedApiProfileId: settings.selectedApiProfileId || '',
        rooms: listLobbyRooms(baseDir),
        error: extra.error || flash.error || null,
        success: extra.success || flash.success || null,
    });
}

function isAjaxRequest(req) {
    return String(req.get('X-Requested-With') || '').toLowerCase() === 'xmlhttprequest';
}

export async function postCreateRoom(req, res) {
    const baseDir = req.app.locals.config.baseDir;

    try {
        const room = await createRoom(baseDir, req.currentUser, req.body);
        if (isAjaxRequest(req)) {
            return res.json({ ok: true, redirect: `/rooms/${encodeURIComponent(room.roomCode)}` });
        }
        return res.redirect(`/rooms/${encodeURIComponent(room.roomCode)}`);
    } catch (error) {
        if (isAjaxRequest(req)) {
            return res.status(400).json({ ok: false, error: error.message });
        }
        return renderHomeWithMessage(req, res, { error: error.message });
    }
}

export async function postJoinRoom(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.body.roomCode || '').trim().toUpperCase();
    const roomPassword = String(req.body.roomPassword || '');

    try {
        verifyRoomJoin(baseDir, roomCode, roomPassword);
        const room = await joinRoomByCode(baseDir, req.currentUser, roomCode);
        const redirectUrl = `/rooms/${encodeURIComponent(room.code)}`;
        if (isAjaxRequest(req)) {
            return res.json({ ok: true, redirect: redirectUrl });
        }
        return res.redirect(redirectUrl);
    } catch (error) {
        if (isAjaxRequest(req)) {
            return res.status(400).json({ ok: false, error: error.message });
        }
        return renderHomeWithMessage(req, res, { error: error.message });
    }
}

export async function renderRoom(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();

    try {
        const store = getStore(baseDir);
        const roomConfig = store.getRoomConfig(roomCode);
        if (roomConfig && roomConfig.session && roomConfig.session.character_file) {
            const hostUserid = roomConfig.session.hostUserid;
            const characterFile = roomConfig.session.character_file;
            try {
                readCharacterCard(baseDir, hostUserid, characterFile);
            } catch (cardErr) {
                // Character file is missing! Let's self-heal if possible.
                const cards = listCharacterCards(baseDir, hostUserid);
                if (cards && cards.length > 0) {
                    const fallbackFile = cards[0].fileName;
                    console.warn(`[Room Self-Heal] Character card ${characterFile} is missing in room ${roomCode}. Falling back to ${fallbackFile}.`);
                    
                    roomConfig.session.character_file = fallbackFile;
                    await store.saveRoomConfig(roomCode, hostUserid, { session: roomConfig.session });
                }
            }
        }

        const model = getRoomViewModel(baseDir, roomCode, req.currentUser);
        const presets = listPresets(baseDir, model.session.hostUserid, 'api');
        const settings = readUserSettings(baseDir, model.session.hostUserid);
        return res.render('room/room', {
            user: req.currentUser,
            room: model.room,
            session: model.session,
            narrator: model.narrator,
            members: model.members,
            messages: model.messages,
            presets,
            worldBooks: listWorldBooks(baseDir, model.session.hostUserid),
            apiProfiles: settings.apiProfiles || [],
            preferences: {
                regexHtmlRenderEnabled: settings.regexHtmlRenderEnabled !== false,
                wholeHtmlBlockRenderEnabled: settings.wholeHtmlBlockRenderEnabled !== false,
                jsRenderEnabled: settings.jsRenderEnabled === true,
            },
        });
    } catch (error) {
        return res.redirect('/');
    }
}

export function getRoomState(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();

    try {
        const state = getRoomRealtimeState(baseDir, roomCode, req.currentUser);
        return res.json({ ok: true, state });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export function getRoomNarratorAvatar(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();

    try {
        const model = getRoomViewModel(baseDir, roomCode, req.currentUser);
        const presets = listPresets(baseDir, model.session.hostUserid, 'api');
        const hostUserid = String(model?.session?.hostUserid || '').trim();
        const characterFile = String(model?.session?.characterFile || '').trim();
        if (!hostUserid || !characterFile) {
            return res.status(404).send('Avatar not found');
        }
        const buffer = readCharacterAvatar(baseDir, hostUserid, characterFile);
        if (!buffer) {
            return res.status(404).send('Avatar not found');
        }

        const isPng = buffer.length > 8
            && buffer[0] === 0x89
            && buffer[1] === 0x50
            && buffer[2] === 0x4E
            && buffer[3] === 0x47;
        const isJpeg = buffer.length > 3
            && buffer[0] === 0xFF
            && buffer[1] === 0xD8
            && buffer[2] === 0xFF;
        const isWebp = buffer.length > 12
            && String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]) === 'RIFF'
            && String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]) === 'WEBP';

        if (isPng) {
            res.set('Content-Type', 'image/png');
        } else if (isJpeg) {
            res.set('Content-Type', 'image/jpeg');
        } else if (isWebp) {
            res.set('Content-Type', 'image/webp');
        } else {
            res.set('Content-Type', 'application/octet-stream');
        }
        return res.send(buffer);
    } catch {
        return res.status(404).send('Avatar not found');
    }
}

export async function postRoomInput(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();
    const content = String(req.body.content || '');
    const ready = String(req.body.ready || '') === 'true';

    try {
        await submitMemberInput(baseDir, roomCode, req.currentUser, content, ready);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export function getRoomPresets(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();

    try {
        const state = getRoomPresetState(baseDir, roomCode, req.currentUser);
        return res.json({ ok: true, state });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export function getRoomRegex(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();

    try {
        const state = getRoomRegexState(baseDir, roomCode, req.currentUser);
        return res.json({ ok: true, state });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export function postRoomPreset(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();
    const presetFile = String(req.body.presetFile || '');

    try {
        const result = setRoomSessionPreset(baseDir, roomCode, req.currentUser, presetFile);
        return res.json({ ok: true, presetFile: result.presetFile });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export function postRoomOpening(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();
    const openingText = String(req.body.openingText || '');

    try {
        const result = setRoomOpeningSelection(baseDir, roomCode, req.currentUser, openingText);
        return res.json({ ok: true, ...result });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export async function postRoomLeave(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();

    try {
        const result = await leaveRoom(baseDir, roomCode, req.currentUser);
        return res.json({ ok: true, ...result });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export async function postUpdateMessage(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();
    const { messageId, content } = req.body;

    try {
        await updateRoomMessage(baseDir, roomCode, req.currentUser, messageId, content);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export async function getRoomPersona(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').toUpperCase();
    const userId = req.currentUser.id;

    try {
        const state = await getRoomUserPersonaState(baseDir, roomCode, userId, req.currentUser.userid);
        return res.json({ ok: true, content: state.content, displayName: state.displayName });
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
}

export async function postRoomPersona(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').toUpperCase();
    const userId = req.currentUser.id;
    const { content, displayName } = req.body;

    try {
        await setRoomUserPersonaState(baseDir, roomCode, userId, req.currentUser.userid, content, displayName);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
}

export async function postRoomUpdate(req, res) {
    try {
        const { code } = req.params;
        const baseDir = req.app.locals.config.baseDir;
        const result = await updateRoom(baseDir, code, req.currentUser, req.body);
        res.json({ ok: true, room: result });
    } catch (e) {
        res.status(400).json({ ok: false, error: e.message });
    }
}

export function getRoomWorldBook(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();

    try {
        const state = getRoomWorldBookState(baseDir, roomCode, req.currentUser);
        return res.json({ ok: true, state });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export async function postRoomWorldBook(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();
    const worldBookFile = String(req.body.worldBookFile || '');

    try {
        const result = await updateRoom(baseDir, roomCode, req.currentUser, { worldBookFile });
        return res.json({ ok: true, room: result });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export async function postDeleteMessage(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();
    const messageId = String(req.body.messageId || '').trim();

    try {
        await deleteRoomMessage(baseDir, roomCode, req.currentUser, messageId);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export async function postForceStart(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();

    try {
        await forceStartRound(baseDir, roomCode, req.currentUser);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export async function postRegenerate(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const roomCode = String(req.params.code || '').trim().toUpperCase();

    try {
        await regenerateRound(baseDir, roomCode, req.currentUser);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}
