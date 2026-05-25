import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import { getStore } from '../models/store.js';
import { t } from '../i18n.js';
import { 
    getSessionById, 
    createSession, 
    listHostSessions, 
    updateSessionSettings,
    updateSessionPresetFile, updateSessionWorldBookFile
} from './sessionService.js';
import { readCharacterAvatar, readCharacterCard, listCharacterCards } from './characterService.js';
import { listPresets, readPreset } from './presetService.js';
import { readWorldBook, listWorldBooks } from './worldBookService.js';
import { readUserSettings } from './settingsService.js';
import { applySessionRegexByStage, buildSessionRegexState } from './regexService.js';
import { logError, logEvent } from './logService.js';
import { runSillyTavernChatCompletion } from './sillyTavernService.js';
import { readRoomUserPersona, getRawRoomUserPersona, updateRoomUserPersona, getRoomUserDisplayName, setRoomUserDisplayName } from './roomPersonaService.js';
import { publishRealtimeEvent } from '../realtime/events.js';
import { 
    activateRoom, 
    deactivateRoom, 
    getActiveRooms, 
    isMemberOnline, 
    getOnlineMembersCount, 
    getMemberLastSeenAt, 
    isRoomActive,
    getRoomIdByJoinCode,
    setMemberState,
    getMemberState,
    getAllMemberStates,
} from '../realtime/roomStateManager.js';

const processingRooms = new Set();

const DEFAULT_TAKEOVER_PROMPT = 'Let the AI decide what {{user}} would do next in this situation.';

function normalizeRoomCode(rawCode) {
    return String(rawCode || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

function validateRoomCode(rawCode) {
    const code = normalizeRoomCode(rawCode);
    if (!code) return '';
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
        throw new Error(t('room.room_code_invalid'));
    }
    return code;
}

function resolvePermanentRoomId() {
    return 'R' + Date.now().toString(36).toUpperCase();
}

function getRoomByCodeRaw(baseDir, code) {
    const store = getStore(baseDir);
    const roomCode = normalizeRoomCode(code);
    const config = store.getRoomConfig(roomCode);
    if (!config) return null;
    const hostUserid = store.getRoomHost(roomCode);
    const hostUser = store.getUser(hostUserid);
    const activeRooms = getActiveRooms();
    const activeInfo = activeRooms.find(r => r.code === roomCode);

    return {
        ...config,
        hostUserid,
        hostUsername: hostUser?.username || hostUserid,
        hostUserId: hostUser?.id,
        sessionId: config.session?.id,
        isPublic: config.public_flag,
        passwordHash: config.password_hash,
        selectedOpening: config.selected_opening,
        openingLocked: config.opening_locked,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
        status: config.status, // active or closed
        joinCode: activeInfo?.joinCode || ''
    };
}

async function ensureRoomMember(baseDir, roomCode, user) {
    const store = getStore(baseDir);
    const members = store.getRoomMembers(roomCode);
    const now = new Date().toISOString();
    
    if (!members[user.userid]) {
        members[user.userid] = {
            display_name: user.username,
            userid: user.userid,
            is_ready: false,
            last_input: '',
            updated_at: now
        };
        await store.saveRoomMembers(roomCode, members);
    }
}

function getLatestRoomFloorNo(baseDir, roomCode) {
    const store = getStore(baseDir);
    const messages = store.getRoomMessages(roomCode);
    return messages.length > 0 ? messages[messages.length - 1].floor_no : 0;
}

async function appendRoomMessage(baseDir, roomCode, payload) {
    const store = getStore(baseDir);
    const content = String(payload.content || '').trim();
    if (!content) throw new Error(t('room.floor_empty'));

    const floorNo = payload.floorNo || (getLatestRoomFloorNo(baseDir, roomCode) + 1);
    const message = {
        floor_no: floorNo,
        speaker_type: payload.speakerType || 'ai',
        user_id: payload.userId || null,
        userid: payload.userid || null,
        username: payload.username || null,
        content: content,
        meta: payload.meta || null,
        created_at: new Date().toISOString()
    };

    await store.appendRoomMessage(roomCode, message);
    return { id: floorNo, floorNo };
}

function extractFirstImageUrl(text) {
    const raw = String(text || '');
    if (!raw) return '';
    const markdownMatch = raw.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
    if (markdownMatch?.[1]) return markdownMatch[1];
    const plainMatch = raw.match(/https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)]*)?/i);
    if (plainMatch?.[0]) return plainMatch[0];
    return '';
}

function resolveCardAvatarUrl(card, openingText) {
    const candidates = [
        card?.avatar,
        card?.data?.avatar,
        card?.meta?.avatar,
    ];
    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (!value || value.toLowerCase() === 'none') continue;
        if (/^(https?:\/\/|data:image\/|\/)/i.test(value)) return value;
    }
    return extractFirstImageUrl(openingText);
}

export function getSessionNarratorProfile(baseDir, session, options = {}) {
    const fallbackName = t('room.ai_narrator');
    const fallbackAvatar = `/api/user/avatar/${encodeURIComponent(`GM_${session.id}`)}`;
    try {
        const card = readCharacterCard(baseDir, session.hostUserid, session.characterFile);
        const openings = getSessionOpeningOptions(baseDir, session);
        const opening = resolveSelectedOpening(openings, options.selectedOpening);
        const name = String(card.name || '').trim() || fallbackName;
        let avatarUrl = resolveCardAvatarUrl(card, opening);
        if (!avatarUrl) {
            const localAvatar = readCharacterAvatar(baseDir, session.hostUserid, session.characterFile);
            if (localAvatar) avatarUrl = `/api/characters/avatar/${encodeURIComponent(session.characterFile)}`;
        }
        return {
            name,
            opening,
            openingOptions: openings,
            avatarUrl: avatarUrl || fallbackAvatar,
        };
    } catch {
        return {
            name: fallbackName,
            opening: '',
            openingOptions: [],
            avatarUrl: fallbackAvatar,
        };
    }
}

export function getSessionOpeningOptions(baseDir, session) {
    try {
        const card = readCharacterCard(baseDir, session.hostUserid, session.characterFile);
        const candidates = [
            String(card?.metaFields?.firstMessage || '').trim(),
            String(card?.parsed?.data?.first_mes || '').trim(),
            String(card?.parsed?.data?.firstMessage || '').trim(),
            String(card?.parsed?.data?.greeting || '').trim(),
            ...(Array.isArray(card?.metaFields?.alternateGreetings) ? card.metaFields.alternateGreetings : []),
            ...(Array.isArray(card?.parsed?.data?.alternate_greetings) ? card.parsed.data.alternate_greetings : []),
        ].map(s => String(s || '').trim()).filter(Boolean);
        return Array.from(new Set(candidates));
    } catch {
        return [];
    }
}

function resolveSelectedOpening(openings, selectedOpening) {
    if (!openings.length) return '';
    if (selectedOpening && openings.includes(selectedOpening)) return selectedOpening;
    return openings[0];
}

function hasRoomDialogueStarted(baseDir, roomCode) {
    const store = getStore(baseDir);
    const messages = store.getRoomMessages(roomCode);
    return messages.some(m => {
        const meta = m.meta || {};
        return m.speaker_type !== 'system' || !['character_opening', 'system_join', 'system_leave'].includes(meta.source || '');
    });
}

async function lockRoomOpeningIfNeeded(baseDir, roomCode) {
    const store = getStore(baseDir);
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room || room.openingLocked === 1) return;
    if (!hasRoomDialogueStarted(baseDir, roomCode)) return;

    await store.saveRoomConfig(roomCode, room.hostUserid, { opening_locked: 1, updated_at: new Date().toISOString() });
}

async function upsertRoomOpeningMessage(baseDir, roomCode, narrator) {
    const store = getStore(baseDir);
    const opening = String(narrator?.opening || '').trim();
    if (!opening) return;

    const messages = store.getRoomMessages(roomCode);
    const existingIndex = messages.findIndex(m => m.speaker_type === 'ai' && m.meta?.source === 'character_opening');
    
    const meta = { source: 'character_opening', avatarUrl: narrator.avatarUrl };
    if (existingIndex !== -1) {
        messages[existingIndex].content = opening;
        messages[existingIndex].username = narrator.name;
        messages[existingIndex].meta = meta;
        const filePath = path.join(store.getRoomPath(roomCode), 'messages.jsonl');
        const content = messages.map(m => JSON.stringify(m)).join('\n') + '\n';
        await fs.promises.writeFile(filePath, content, 'utf-8');
        return;
    }

    await appendRoomMessage(baseDir, roomCode, {
        floorNo: 1,
        speakerType: 'ai',
        username: narrator.name,
        content: opening,
        meta
    });
}

async function generateAiReply(baseDir, room, session, roundNo, playerInputs, options = {}) {
    const store = getStore(baseDir);
    const messages = store.getRoomMessages(room.code);
    const hostSettings = readUserSettings(baseDir, session.hostUserid);
    const apiProfile = hostSettings.apiProfiles.find(p => p.id === session.apiProfileId) || hostSettings.apiProfiles[0];
    
    let characterCard;
    try {
        characterCard = readCharacterCard(baseDir, session.hostUserid, session.characterFile);
    } catch (e) {
        const cards = listCharacterCards(baseDir, session.hostUserid);
        if (cards && cards.length > 0) {
            const fallbackFile = cards[0].fileName;
            logError(baseDir, 'room_character_fallback', new Error(`Configured character card ${session.characterFile} not found for room ${room.code}. Falling back to ${fallbackFile}`));
            
            characterCard = readCharacterCard(baseDir, session.hostUserid, fallbackFile);
            
            // Auto-heal session configuration
            session.characterFile = fallbackFile;
            const updates = {
                updated_at: new Date().toISOString(),
                session: {
                    ...room.session,
                    character_file: fallbackFile
                }
            };
            await store.saveRoomConfig(room.code, session.hostUserid, updates);
        } else {
            throw e;
        }
    }

    const narrator = getSessionNarratorProfile(baseDir, session, { selectedOpening: room.selectedOpening });
    
    let presetRaw = null;
    if (session.presetFile) {
        try {
            const presetData = readPreset(baseDir, session.hostUserid, 'api', session.presetFile);
            presetRaw = presetData.parsed;
        } catch (e) {}
    }

    const context = messages.slice(-30).filter(m => !m.deleted).map(m => ({
        speakerType: m.speaker_type,
        username: m.username,
        content: m.content,
        meta: m.meta
    }));
    
    return await runSillyTavernChatCompletion({
        settings: { ...hostSettings, apiFormat: apiProfile.format, model: apiProfile.model },
        presetRaw,
        characterCard,
        worldBook: (() => {
            const mainFileName = session.worldBookFile || characterCard.worldBook;
            const additionalFileNames = Array.isArray(session.additionalWorldBooks) ? session.additionalWorldBooks : [];
            const allEntries = [];
            let mainDisplayName = 'Combined_WorldBook';
            
            if (mainFileName) {
                try {
                    const wb = readWorldBook(baseDir, session.hostUserid, mainFileName);
                    if (wb && wb.entriesList) {
                        allEntries.push(...wb.entriesList);
                        mainDisplayName = wb.displayName;
                    }
                } catch (e) {
                    logError(baseDir, 'load_worldbook_failed', e);
                }
            }

            for (const additionalFileName of additionalFileNames) {
                try {
                    const wb = readWorldBook(baseDir, session.hostUserid, additionalFileName);
                    if (wb && wb.entriesList) {
                        allEntries.push(...wb.entriesList);
                    }
                } catch (e) {
                    logError(baseDir, 'load_additional_worldbook_failed', e);
                }
            }

            if (allEntries.length > 0) {
                const rawEntries = {};
                allEntries.forEach((entry, i) => {
                    const keys = Array.isArray(entry.keys) ? entry.keys : [];
                    const secondaryKeys = Array.isArray(entry.secondaryKeys) ? entry.secondaryKeys : [];
                    rawEntries[String(i)] = {
                        uid: entry.uid ?? i,
                        key: keys,
                        keysecondary: secondaryKeys,
                        comment: entry.comment || '',
                        content: entry.content || '',
                        constant: !!entry.constant,
                        selective: false,
                        order: Number(entry.order ?? 100),
                        disable: !entry.enabled,
                        position: Number(entry.position ?? 1),
                        role: Number(entry.role ?? 0),
                        outletName: entry.outletName || '',
                        depth: Number(entry.depth ?? 0),
                        extensions: {
                            position: Number(entry.position ?? 1),
                            depth: Number(entry.depth ?? 0),
                            role: Number(entry.role ?? 0),
                            selectiveLogic: Number(entry.selectiveLogic ?? 0),
                            probability: Number(entry.probability ?? 100),
                            scan_depth: entry.scanDepth !== '' ? Number(entry.scanDepth) : 999,
                            case_sensitive: entry.caseSensitive === true,
                            match_whole_words: entry.matchWholeWords === true,
                            use_group_scoring: entry.useGroupScoring === true,
                            group: entry.group || '',
                            group_override: !!entry.groupOverride,
                            group_weight: Number(entry.groupWeight ?? 100),
                            sticky: Number(entry.sticky ?? 0),
                            cooldown: Number(entry.cooldown ?? 0),
                            delay: Number(entry.delay ?? 0),
                            filter: entry.filterExpression || '',
                            automation_id: entry.automationId || '',
                            trigger_type: entry.triggerType || '',
                        },
                        excludeRecursion: !!entry.excludeRecursion,
                        delayUntilRecursion: !!entry.delayUntilRecursion,
                        preventRecursion: !!entry.preventRecursion,
                        ignoreBudget: !!entry.ignoreBudget,
                    };
                });
                return {
                    fileName: mainFileName || 'combined.json',
                    displayName: mainDisplayName,
                    entriesList: allEntries,
                    jsonText: '{}',
                    parsed: { name: mainDisplayName, entries: rawEntries }
                };
            }

            return null;
        })(),

        narratorName: narrator.name,
        history: context,
        roundNo,
        roundPlayerInputs: playerInputs.map(i => ({ username: i.username, lastInput: i.lastInput })),
        roundSystemPrompts: options.roundSystemPrompts || [],
        endpointBase: apiProfile.baseUrl,
        apiKey: apiProfile.apiKey,
        onToken: options.onToken,
        combinedPersona: options.combinedPersona
    });
}

function publishRoomStreamEvent(baseDir, roomCode, event) {
    publishRealtimeEvent({ baseDir, roomCode, streamEvent: event });
}

async function resetRoundMemberStates(baseDir, roomCode) {
    const store = getStore(baseDir);
    const members = store.getRoomMembers(roomCode);
    const now = new Date().toISOString();
    for (const uid in members) {
        setMemberState(roomCode, uid, {
            isReady: false,
            lastInput: '',
            isLeft: false,
            updatedAt: now,
        });
    }
}

async function maybeProcessRound(baseDir, roomCode, force = false) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room || !isRoomActive(roomCode)) return;
    
    await lockRoomOpeningIfNeeded(baseDir, roomCode);
    if (processingRooms.has(roomCode)) return;

    const store = getStore(baseDir);
    const members = store.getRoomMembers(roomCode);
    const memStates = getAllMemberStates(roomCode);
    const usernames = Object.keys(members);
    if (!usernames.length) return;

    const allReady = usernames.every((uid) => {
        if (!isMemberOnline(roomCode, uid)) return true;
        const ms = memStates.get(uid) || {};
        return ms.isReady && String(ms.lastInput || '').trim();
    });

    if (!allReady && !force) return;

    processingRooms.add(roomCode);
    publishRealtimeEvent({ baseDir, roomCode });

    try {
        const session = getSessionById(baseDir, room.sessionId);
        if (!session) throw new Error(t('room.session_not_found'));
        
        const narrator = getSessionNarratorProfile(baseDir, session, { selectedOpening: room.selectedOpening });
        const regexState = buildSessionRegexState(baseDir, session);
        const roundNo = (getLatestRoomFloorNo(baseDir, roomCode) || 0) + 1;

        // Ensure the character's first message is refreshed and persisted
        await upsertRoomOpeningMessage(baseDir, roomCode, narrator);

        const playerInputs = [];
        const systemPrompts = [];
        const personas = [];

        for (const uid of usernames) {
            const m = members[uid];
            const ms = memStates.get(uid) || {};
            const isAuto = !isMemberOnline(roomCode, uid) || ms.isLeft || !ms.isReady || !String(ms.lastInput).trim();
            const input = isAuto ? 'system:自动托管中' : String(ms.lastInput).trim();
            
            // Resolve room display name from info.yaml, fallback to members.json display_name
            const user = store.getUser(uid);
            const userId = user?.id;
            let roomDisplayName = '';
            try {
                roomDisplayName = await getRoomUserDisplayName(baseDir, roomCode, userId, uid);
            } catch {}
            if (!roomDisplayName) roomDisplayName = m.display_name || uid;
            
            // Add participant persona for this round
            let personaRaw = '';
            try { personaRaw = await getRawRoomUserPersona(baseDir, roomCode, userId, uid); } catch {}
            if (personaRaw && personaRaw.trim()) {
                personas.push(`${roomDisplayName}: ${personaRaw.trim()}`);
            }

            const floorNo = getLatestRoomFloorNo(baseDir, roomCode) + 1;
            if (isAuto) {
                const takeoverPrompt = (room.takeover_prompt || DEFAULT_TAKEOVER_PROMPT).replace(/{{user}}/g, roomDisplayName);
                systemPrompts.push(`[代行: ${roomDisplayName}] ${takeoverPrompt}`);
                // Auto player uses takeover prompt as their history contribution
                const outgoing = applySessionRegexByStage(takeoverPrompt, regexState, 'outgoing');
                await appendRoomMessage(baseDir, roomCode, {
                    floorNo,
                    speakerType: 'player',
                    username: roomDisplayName,
                    userId: userId,
                    userid: uid,
                    content: outgoing.content || takeoverPrompt,
                    meta: { source: isMemberOnline(roomCode, uid) ? 'ai_takeover' : 'offline_takeover', roundNo }
                });
                playerInputs.push({ username: roomDisplayName, lastInput: takeoverPrompt });
            } else {
                const outgoing = applySessionRegexByStage(input, regexState, 'outgoing');
                await appendRoomMessage(baseDir, roomCode, {
                    floorNo,
                    speakerType: 'player',
                    username: roomDisplayName,
                    userId: userId,
                    userid: uid,
                    content: outgoing.content || input,
                    meta: { source: 'player_submit', roundNo }
                });
                playerInputs.push({ username: roomDisplayName, lastInput: outgoing.content || input });
            }
        }

        publishRoomStreamEvent(baseDir, roomCode, { phase: 'start', roundNo, narrator: { name: narrator.name, avatarUrl: narrator.avatarUrl } });

        let sequence = 0;
        const combinedPersona = personas.join('\n\n');
        
        const startTime = Date.now();
        const generation = await generateAiReply(baseDir, room, session, roundNo, playerInputs, {
            roundSystemPrompts: systemPrompts,
            combinedPersona,
            onToken: (chunk) => {
                sequence++;
                publishRoomStreamEvent(baseDir, roomCode, { phase: 'chunk', roundNo, sequence, delta: chunk });
            }
        });

        const durationSeconds = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
        const usedTokens = generation.diagnostics?.tokenUsed || 0;

        const regexResult = applySessionRegexByStage(generation.content, regexState, 'incoming');
        const finalContent = regexResult.content || generation.content;
        
        const appendedAi = await appendRoomMessage(baseDir, roomCode, {
            speakerType: 'ai',
            username: narrator.name,
            content: finalContent,
            meta: { 
                avatarUrl: narrator.avatarUrl, 
                source: 'round_reply', 
                roundNo,
                seconds: durationSeconds,
                tokens: usedTokens
            }
        });

        publishRoomStreamEvent(baseDir, roomCode, { phase: 'done', roundNo, messageId: appendedAi.id, floorNo: appendedAi.floorNo, content: finalContent, seconds: durationSeconds, tokens: usedTokens });

        await resetRoundMemberStates(baseDir, roomCode);
        publishRealtimeEvent({ baseDir, roomCode });
    } catch (err) {
        logError(baseDir, 'process_round_failed', err);
        const roundNo = (getLatestRoomFloorNo(baseDir, roomCode) || 0) + 1;
        publishRoomStreamEvent(baseDir, roomCode, { phase: 'error', roundNo, error: err.message });
        await resetRoundMemberStates(baseDir, roomCode);
    } finally {
        processingRooms.delete(roomCode);
        publishRealtimeEvent({ baseDir, roomCode });
    }
}

export async function createRoom(baseDir, hostUser, payload) {
    const store = getStore(baseDir);
    const mode = String(payload.mode || 'new').trim();
    const now = new Date().toISOString();
    let session;

    if (mode === 'continue') {
        const sid = String(payload.sessionId || '').trim().toUpperCase();
        session = getSessionById(baseDir, sid);
        if (!session || session.hostUserId !== hostUser.id) throw new Error(t('room.session_not_found'));
        
        let existingRoomId = sid;
        const roomConfig = store.getRoomConfig(existingRoomId);
        
        if (roomConfig) {
            roomConfig.updated_at = now;
            roomConfig.status = 'active'; 
            await store.saveRoomConfig(existingRoomId, hostUser.userid, roomConfig);
            activateRoom(roomConfig, hostUser.userid);
            publishRealtimeEvent({ baseDir, roomCode: existingRoomId, includePresets: true, lobbyChanged: true });
            return { roomId: roomConfig.id, roomCode: existingRoomId };
        }
    } else {
        const name = String(payload.roomTitle || '').trim() || '新房间';
        session = createSession(baseDir, hostUser.id, name, payload.characterFile, payload.presetFile, payload.apiProfileId);
    }

    const roomId = resolvePermanentRoomId();
    session.id = roomId; // Unify session.id with roomId
    session.hostUserid = hostUser.userid; // Add this
    session.hostUsername = hostUser.username; // alias
    const roomPassword = String(payload.roomPassword || '').trim();
    const isPublic = String(payload.isPublic || 'on') === 'on' ? 1 : 0;
    const passwordHash = roomPassword ? bcrypt.hashSync(roomPassword, 10) : null;

    const roomConfig = {
        id: Date.now(), // Internal numeric ID (legacy)
        code: roomId,   // Permanent String ID
        title: String(payload.roomTitle || '').trim() || session.name,
        status: 'active',
        public_flag: isPublic,
        password_hash: passwordHash,
        selected_opening: '', 
        opening_locked: 0,
        takeover_prompt: DEFAULT_TAKEOVER_PROMPT,
        created_at: now,
        updated_at: now,
        session: session
    };

    await store.saveRoomConfig(roomId, hostUser.userid, roomConfig);
    await ensureRoomMember(baseDir, roomId, hostUser);
    
    const narrator = getSessionNarratorProfile(baseDir, session);
    await upsertRoomOpeningMessage(baseDir, roomId, narrator);

    activateRoom(roomConfig, hostUser.userid);
    publishRealtimeEvent({ baseDir, roomCode: roomId, includePresets: true, lobbyChanged: true });

    return { roomId: roomConfig.id, roomCode: roomId };
}

export async function joinRoomByCode(baseDir, user, joinCode) {
    const roomId = getRoomIdByJoinCode(joinCode);
    if (!roomId) throw new Error(t('room.join_code_invalid'));

    const room = getRoomByCodeRaw(baseDir, roomId);
    if (!room) throw new Error(t('room.room_not_found'));

    await ensureRoomMember(baseDir, roomId, user);
    publishRealtimeEvent({ baseDir, roomCode: roomId, lobbyChanged: true });
    return room;
}

export function listLobbyRooms(baseDir) {
    const active = getActiveRooms();
    const store = getStore(baseDir);
    const rooms = [];
    for (const item of active) {
        if (item.isPublic === 1) {
            const hostUser = store.getUser(item.hostUserid);
            rooms.push({
                code: item.code, // Internal ID
                joinCode: item.joinCode, // Temporary 6-digit code
                title: item.title,
                hostUserid: item.hostUserid,
                hostUsername: hostUser?.username || item.hostUserid,
                isPublic: item.isPublic,
                hasPassword: item.hasPassword,
                memberCount: getOnlineMembersCount(item.code),
                updatedAt: item.updatedAt
            });
        }
    }
    return rooms.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 50);
}

export function listUserSessionsForStart(baseDir, hostUserId) {
    return listHostSessions(baseDir, hostUserId);
}

export function verifyRoomJoin(baseDir, joinCode, roomPassword) {
    const roomId = getRoomIdByJoinCode(joinCode);
    if (!roomId) throw new Error(t('room.join_code_invalid'));

    const room = getRoomByCodeRaw(baseDir, roomId);
    if (!room) throw new Error(t('room.room_not_found'));

    // verifyRoomJoin
    if (room.passwordHash) {
        const pass = String(roomPassword || '');
        if (!bcrypt.compareSync(pass, room.passwordHash)) throw new Error(t('room.password_incorrect'));
    }
    return room;
}

export async function submitMemberInput(baseDir, roomCode, user, content, ready) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room || !isRoomActive(roomCode)) throw new Error(t('room.room_not_found'));

    const store = getStore(baseDir);
    const members = store.getRoomMembers(roomCode);
    if (!members[user.userid]) throw new Error(t('room.member_not_joined'));

    const now = new Date().toISOString();
    // Use in-memory state for real-time per-round data (no disk write)
    setMemberState(roomCode, user.userid, {
        isReady: !!ready,
        lastInput: String(content || ''),
        updatedAt: now,
    });

    // Keep members.json in sync for persistent fields only (not round state)
    await store.saveRoomConfig(roomCode, room.hostUserid, { updated_at: now });

    publishRealtimeEvent({ baseDir, roomCode, lobbyChanged: true });
    if (ready) {
        maybeProcessRound(baseDir, roomCode).catch(err => logError(baseDir, 'round_failed', err));
    }
}

export async function leaveRoom(baseDir, roomCode, currentUser) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room || !isRoomActive(roomCode)) throw new Error(t('room.room_not_found'));

    if (currentUser.userid === room.hostUserid) {
        const store = getStore(baseDir);
        await store.saveRoomConfig(roomCode, room.hostUserid, { status: 'closed', updated_at: new Date().toISOString() });
        deactivateRoom(roomCode);
        publishRealtimeEvent({ baseDir, roomCode, lobbyChanged: true, roomClosedEvent: { error: t('room.host_disband') } });
        return { roomCode, roomClosed: true, isHost: true };
    }

    const store = getStore(baseDir);
    const members = store.getRoomMembers(roomCode);
    if (!members[currentUser.userid]) throw new Error(t('room.member_not_joined'));

    setMemberState(roomCode, currentUser.userid, { isLeft: true });
    
    publishRealtimeEvent({ baseDir, roomCode, lobbyChanged: true });
    return { roomCode, roomClosed: false, isHost: false };
}

export async function updateRoom(baseDir, roomCode, user, payload) {
    const store = getStore(baseDir);
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room) throw new Error(t('room.room_not_found'));
    if (Number(room.hostUserId) !== Number(user.id)) throw new Error(t('room.only_host_modify'));

    const updates = { updated_at: new Date().toISOString() };
    if (payload.roomTitle !== undefined) updates.title = String(payload.roomTitle).trim();
    if (payload.takeoverPrompt !== undefined) updates.takeover_prompt = String(payload.takeoverPrompt).trim();
    if (payload.isPublic !== undefined) updates.public_flag = (payload.isPublic === true || payload.isPublic === 'on' || payload.isPublic === 1) ? 1 : 0;
    if (payload.roomPassword !== undefined) {
        const password = String(payload.roomPassword).trim();
        if (password && !password.startsWith('********')) updates.password_hash = bcrypt.hashSync(password, 10);
        else if (password === '') updates.password_hash = null;
    }

    if (payload.presetFile !== undefined || payload.apiProfileId !== undefined || payload.worldBookFile !== undefined || payload.additionalWorldBooks !== undefined) {
        const session = { ...room.session };
        if (payload.presetFile !== undefined) session.preset_file = payload.presetFile;
        if (payload.apiProfileId !== undefined) session.api_profile_id = payload.apiProfileId;
        if (payload.worldBookFile !== undefined) session.world_book_file = payload.worldBookFile;
        if (payload.additionalWorldBooks !== undefined) {
            session.additional_world_books = Array.isArray(payload.additionalWorldBooks) ? payload.additionalWorldBooks : [];
        }
        updates.session = session;
    }

    await store.saveRoomConfig(roomCode, room.hostUserid, updates);
    publishRealtimeEvent({ baseDir, roomCode, lobbyChanged: true });
    return getRoomByCodeRaw(baseDir, roomCode);
}

export async function updateRoomMessage(baseDir, roomCode, currentUser, messageId, content) {
    const store = getStore(baseDir);
    const messages = store.getRoomMessages(roomCode);
    const msg = messages.find(m => m.floor_no === Number(messageId));
    if (!msg) throw new Error(t('room.message_not_found'));

    const room = getRoomByCodeRaw(baseDir, roomCode);
    const isSelf = Number(msg.user_id) === Number(currentUser.id);
    const isHost = currentUser.userid === room.hostUserid;
    const isAi = msg.speaker_type === 'ai';

    if (!isSelf && !(isHost && isAi)) throw new Error(t('room.no_permission'));

    msg.content = content;
    msg.meta = { ...msg.meta, edited: true, editedAt: new Date().toISOString() };

    const filePath = path.join(store.getRoomPath(roomCode), 'messages.jsonl');
    const newContent = messages.map(m => JSON.stringify(m)).join('\n') + '\n';
    await fs.promises.writeFile(filePath, newContent, 'utf-8');

    publishRealtimeEvent({ baseDir, roomCode });
}

export async function deleteRoomMessage(baseDir, roomCode, currentUser, messageId) {
    const store = getStore(baseDir);
    const messages = store.getRoomMessages(roomCode);
    const msg = messages.find(m => m.floor_no === Number(messageId));
    if (!msg) throw new Error(t('room.message_not_found'));

    const room = getRoomByCodeRaw(baseDir, roomCode);
    const isHost = currentUser.userid === room.hostUserid;
    if (!isHost) throw new Error(t('room.only_host_delete'));

    msg.deleted = true;
    msg.content = '[消息已删除]';
    msg.meta = { ...msg.meta, deleted: true, deletedAt: new Date().toISOString() };

    const filePath = path.join(store.getRoomPath(roomCode), 'messages.jsonl');
    const newContent = messages.map(m => JSON.stringify(m)).join('\n') + '\n';
    await fs.promises.writeFile(filePath, newContent, 'utf-8');

    publishRealtimeEvent({ baseDir, roomCode });
}

export async function forceStartRound(baseDir, roomCode, currentUser) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room || !isRoomActive(roomCode)) throw new Error(t('room.room_not_found'));
    if (currentUser.userid !== room.hostUserid) throw new Error(t('room.only_host_force_start'));

    await maybeProcessRound(baseDir, roomCode, true);
}

export async function regenerateRound(baseDir, roomCode, currentUser) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room || !isRoomActive(roomCode)) throw new Error(t('room.room_not_found'));
    if (currentUser.userid !== room.hostUserid) throw new Error(t('room.only_host_regenerate'));

    const store = getStore(baseDir);
    const messages = store.getRoomMessages(roomCode);
    const lastAiIdx = messages.findLastIndex(m => m.speaker_type === 'ai');
    if (lastAiIdx < 0) return;
    if (messages[lastAiIdx].deleted) return;

    const roundNo = messages[lastAiIdx].meta?.roundNo || 1;
    messages[lastAiIdx].deleted = true;
    messages[lastAiIdx].content = '[消息已重新生成]';
    messages[lastAiIdx].meta = { ...messages[lastAiIdx].meta, deleted: true, deletedAt: new Date().toISOString(), regenerated: true };

    const filePath = path.join(store.getRoomPath(roomCode), 'messages.jsonl');
    const newContent = messages.map(m => JSON.stringify(m)).join('\n') + '\n';
    await fs.promises.writeFile(filePath, newContent, 'utf-8');

    await resetRoundMemberStates(baseDir, roomCode);
    
    if (processingRooms.has(roomCode)) return;
    processingRooms.add(roomCode);
    publishRealtimeEvent({ baseDir, roomCode });

    (async () => {
        try {
            const session = getSessionById(baseDir, room.sessionId);
            if (!session) throw new Error('Session not found');

            const narrator = getSessionNarratorProfile(baseDir, session, { selectedOpening: room.selectedOpening });
            const regexState = buildSessionRegexState(baseDir, session);

            const roundPlayerMessages = messages.filter(m => !m.deleted && m.meta?.roundNo === roundNo && m.speaker_type !== 'ai');
            const playerInputs = roundPlayerMessages.map(m => ({ username: m.username, lastInput: m.content }));
            
            const personas = [];
            for (const msg of roundPlayerMessages) {
                const uid = msg.userid || msg.userId || '';
                const userId = msg.userId || ''; 
                if (uid) {
                    let personaRaw = '';
                    try { personaRaw = await getRawRoomUserPersona(baseDir, roomCode, userId, uid); } catch {}
                    if (personaRaw && personaRaw.trim()) {
                        personas.push(`${msg.username}: ${personaRaw.trim()}`);
                    }
                }
            }

            publishRoomStreamEvent(baseDir, roomCode, { phase: 'start', roundNo, narrator: { name: narrator.name, avatarUrl: narrator.avatarUrl } });

            let sequence = 0;
            const combinedPersona = personas.join('\n\n');
            const startTime = Date.now();

            const generation = await generateAiReply(baseDir, room, session, roundNo, playerInputs, {
                roundSystemPrompts: [], 
                combinedPersona,
                onToken: (chunk) => {
                    sequence++;
                    publishRoomStreamEvent(baseDir, roomCode, { phase: 'chunk', roundNo, sequence, delta: chunk });
                }
            });

            const durationSeconds = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
            const usedTokens = generation.diagnostics?.tokenUsed || 0;

            const regexResult = applySessionRegexByStage(generation.content, regexState, 'incoming');
            const finalContent = regexResult.content || generation.content;
            
            const appendedAi = await appendRoomMessage(baseDir, roomCode, {
                speakerType: 'ai',
                username: narrator.name,
                content: finalContent,
                meta: { 
                    avatarUrl: narrator.avatarUrl, 
                    source: 'round_reply', 
                    roundNo,
                    seconds: durationSeconds,
                    tokens: usedTokens
                }
            });

            publishRoomStreamEvent(baseDir, roomCode, { phase: 'done', roundNo, messageId: appendedAi.id, floorNo: appendedAi.floorNo, content: finalContent, seconds: durationSeconds, tokens: usedTokens });
            publishRealtimeEvent({ baseDir, roomCode });
        } catch (err) {
            logError(baseDir, 'regenerate_round_failed', err);
            publishRoomStreamEvent(baseDir, roomCode, { phase: 'error', roundNo, error: err.message });
        } finally {
            processingRooms.delete(roomCode);
            publishRealtimeEvent({ baseDir, roomCode });
        }
    })();
}

export async function closeRoomsByHostUserId(baseDir, hostUserId) {
    const store = getStore(baseDir);
    const host = store.getUserById(hostUserId);
    if (!host) return 0;

    let count = 0;
    const active = getActiveRooms();
    for (const item of active) {
        if (item.hostUserid === host.userid) {
            await store.saveRoomConfig(item.code, host.userid, { status: 'closed', updated_at: new Date().toISOString() });
            deactivateRoom(item.code);
            count++;
            publishRealtimeEvent({ baseDir, roomCode: item.code, lobbyChanged: true, roomClosedEvent: { error: t('room.host_left') } });
        }
    }
    return count;
}

export function getRoomViewModel(baseDir, roomCode, currentUser) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room || !isRoomActive(roomCode)) throw new Error(t('room.room_not_found'));

    const store = getStore(baseDir);
    const session = getSessionById(baseDir, room.sessionId);
    if (!session) throw new Error(t('room.session_not_found'));

    const membersData = store.getRoomMembers(roomCode);
    const memStates = getAllMemberStates(roomCode);
    const members = Object.entries(membersData).map(([uid, data]) => {
        const user = store.getUser(uid);
        const memState = memStates.get(uid) || {};
        let roomDisplayName = data.display_name || '';
        try {
            const infoPath = path.join(path.dirname(getRoomUserPersonaPath(baseDir, roomCode, user?.id, uid)), 'info.yaml');
            if (fs.existsSync(infoPath)) {
                const raw = fs.readFileSync(infoPath, 'utf-8');
                const match = raw.match(/^displayName:\s*(.+)$/m);
                if (match) roomDisplayName = match[1].trim();
            }
        } catch {}
        if (!roomDisplayName) roomDisplayName = user?.username || data.display_name || uid;
        return {
            username: user?.username || data.display_name || uid,
            userid: uid,
            userId: user?.id,
            displayName: roomDisplayName,
            isReady: !!memState.isReady || !!data.is_ready,
            isLeft: !!memState.isLeft || !!data.is_left,
            isOnline: isMemberOnline(roomCode, uid),
            lastInput: memState.lastInput || data.last_input || '',
            updatedAt: memState.updatedAt || data.updated_at
        };
    });

    return {
        room,
        session,
        narrator: getSessionNarratorProfile(baseDir, session, { selectedOpening: room.selectedOpening }),
        members,
        messages: store.getRoomMessages(roomCode).map(m => ({ ...m, id: m.floor_no }))
    };
}

export function getRoomRealtimeState(baseDir, roomCode, currentUser) {
    const model = getRoomViewModel(baseDir, roomCode, currentUser);
    const members = model.members.map((m) => {
        return {
            username: m.username,
            userid: m.userid,
            displayName: m.displayName,
            isReady: m.isReady,
            isOnline: m.isOnline,
            isLeft: m.isLeft,
            lastInput: (m.isReady || m.userid === currentUser.userid) ? m.lastInput : '',
            isSelf: m.userid === currentUser.userid,
            updatedAt: m.updatedAt,
        };
    });

    return {
        room: {
            code: model.room.code,
            title: model.room.title,
            hostUserid: model.room.hostUserid,
            hostUsername: model.room.hostUsername,
            sessionId: model.room.sessionId,
            isHost: currentUser.userid === model.room.hostUserid,
            isProcessing: processingRooms.has(roomCode),
            openingLocked: model.room.openingLocked === 1,
            selectedOpening: model.room.selectedOpening || model.narrator?.opening || '',
            takeoverPrompt: model.room.takeover_prompt || DEFAULT_TAKEOVER_PROMPT,
        },
        session: model.session,
        narrator: model.narrator,
        members,
        messages: model.messages.map(m => ({
            ...m,
            id: m.floor_no,
            floorNo: m.floor_no,
            speakerType: m.speaker_type,
            metaJson: JSON.stringify(m.meta)
        })),
    };
}

export async function setRoomOpeningSelection(baseDir, roomCode, currentUser, openingText) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room || !isRoomActive(roomCode)) throw new Error(t('room.room_not_found'));
    if (currentUser.userid !== room.hostUserid) throw new Error(t('room.only_host_switch_open'));
    if (room.openingLocked === 1 || hasRoomDialogueStarted(baseDir, roomCode)) {
        await lockRoomOpeningIfNeeded(baseDir, roomCode);
        throw new Error(t('room.dialogue_started'));
    }

    const session = getSessionById(baseDir, room.sessionId);
    const openingOptions = getSessionOpeningOptions(baseDir, session);
    const selected = resolveSelectedOpening(openingOptions, openingText);

    const store = getStore(baseDir);
    await store.saveRoomConfig(roomCode, room.hostUserid, { selected_opening: selected, updated_at: new Date().toISOString() });
    
    const narrator = getSessionNarratorProfile(baseDir, session, { selectedOpening: selected });
    await upsertRoomOpeningMessage(baseDir, roomCode, narrator);
    
    publishRealtimeEvent({ baseDir, roomCode });
    return { selectedOpening: selected, openingOptions };
}

export function getRoomPresetState(baseDir, roomCode, currentUser) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room) throw new Error(t('room.room_not_found'));
    const session = getSessionById(baseDir, room.sessionId);
    const presets = listPresets(baseDir, session.hostUserid, 'api');
    return {
        roomCode,
        isHost: currentUser.userid === room.hostUserid,
        currentPresetFile: session.presetFile || '',
        presets
    };
}

export function getRoomRegexState(baseDir, roomCode, currentUser) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    const session = getSessionById(baseDir, room.sessionId);
    const regexState = buildSessionRegexState(baseDir, session);
    return {
        roomCode,
        isHost: currentUser.userid === room.hostUserid,
        currentPresetFile: regexState.currentPresetFile,
        rules: regexState.ruleViews
    };
}

export async function setRoomSessionPreset(baseDir, roomCode, currentUser, presetFile) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (currentUser.userid !== room.hostUserid) throw new Error(t('room.only_host_switch_preset'));

    await updateSessionPresetFile(baseDir, room.sessionId, presetFile);
    publishRealtimeEvent({ baseDir, roomCode, includePresets: true });
    return { presetFile };
}

export async function getRoomUserPersonaState(baseDir, roomCode, userId, username) {
    const content = await getRawRoomUserPersona(baseDir, roomCode, userId, username);
    const displayName = await getRoomUserDisplayName(baseDir, roomCode, userId, username);
    return { content, displayName };
}

export async function setRoomUserPersonaState(baseDir, roomCode, userId, username, content, displayName) {
    if (content !== undefined) {
        await updateRoomUserPersona(baseDir, roomCode, userId, username, content);
    }
    if (displayName !== undefined) {
        await setRoomUserDisplayName(baseDir, roomCode, userId, username, displayName);
    }
    publishRealtimeEvent({ baseDir, roomCode });
}

export function touchRoomMemberPresence() {
}

export async function autoCloseRoom(baseDir, roomCode, reason) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room || !isRoomActive(roomCode)) return;
    
    const store = getStore(baseDir);
    await store.saveRoomConfig(roomCode, room.hostUserid, { status: 'closed', updated_at: new Date().toISOString() });
    deactivateRoom(roomCode);
    publishRealtimeEvent({ baseDir, roomCode, lobbyChanged: true, roomClosedEvent: { error: reason || t('room.auto_disband') } });
}

export async function handleImplicitLeave(baseDir, roomCode, user) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room || !isRoomActive(roomCode)) return;

    const store = getStore(baseDir);
    const members = store.getRoomMembers(roomCode);
    if (!members[user.userid]) return;

    setMemberState(roomCode, user.userid, { isLeft: true });
    
    publishRealtimeEvent({ baseDir, roomCode, lobbyChanged: true });
}

export async function cleanupIdleRooms(baseDir) {
    const active = getActiveRooms();
    const now = Date.now();
    const threshold = 5 * 60 * 1000;
    let count = 0;

    for (const item of active) {
        const updatedAt = new Date(item.updatedAt).getTime();
        const onlineCount = getOnlineMembersCount(item.code);
        if (onlineCount === 0 && (now - updatedAt > threshold)) {
            const store = getStore(baseDir);
            await store.saveRoomConfig(item.code, item.hostUserid, { status: 'closed', updated_at: new Date().toISOString() });
            deactivateRoom(item.code);
            count++;
            publishRealtimeEvent({ baseDir, roomCode: item.code, lobbyChanged: true, roomClosedEvent: { error: t('room.idle_disband') } });
        }
    }
    return count;
}

export function discoverActiveRooms(baseDir) {
    const store = getStore(baseDir);
    const now = Date.now();
    const threshold = 24 * 60 * 60 * 1000; // 24 hours
    let count = 0;

    for (const [code, hostUserid] of store.roomIndex.entries()) {
        try {
            const config = store.getRoomConfig(code);
            if (!config || config.status === 'closed') continue;
            
            const updatedAt = new Date(config.updated_at).getTime();
            if (now - updatedAt < threshold) {
                activateRoom(config, hostUserid);
                count++;
            }
        } catch (err) {
        }
    }
    return count;
}

export function startCleanupTask(baseDir) {
    discoverActiveRooms(baseDir);

    setInterval(() => {
        cleanupIdleRooms(baseDir).catch(err => logError(baseDir, 'cleanup_failed', err));
    }, 60 * 1000);
}

export function getRoomWorldBookState(baseDir, roomCode, currentUser) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (!room) throw new Error(t('room.room_not_found'));
    const session = getSessionById(baseDir, room.sessionId);
    const worldBooks = listWorldBooks(baseDir, session.hostUserid);
    return {
        roomCode,
        isHost: currentUser.userid === room.hostUserid,
        currentWorldBookFile: session.worldBookFile || '',
        worldBooks
    };
}

export async function setRoomSessionWorldBook(baseDir, roomCode, currentUser, worldBookFile) {
    const room = getRoomByCodeRaw(baseDir, roomCode);
    if (currentUser.userid !== room.hostUserid) throw new Error(t('room.only_host_switch_worldbook'));

    await updateSessionWorldBookFile(baseDir, room.sessionId, worldBookFile);
    publishRealtimeEvent({ baseDir, roomCode, includePresets: true });
    return { worldBookFile };
}
