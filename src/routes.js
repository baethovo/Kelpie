import { Router } from 'express';
import multer from 'multer';
import { postLogin, postLogout, postRegister, renderLogin, renderRegister, postUpdateProfile, getUserAvatar, postUploadAvatar, getUserPersona, postUpdateUserPersona } from './controllers/authController.js';
import { postApiConfig, postSettingsPreferences, renderApiConfig, renderIndex, renderSessions, renderSettings } from './controllers/pageController.js';
import { getModels, testApi, postTestProfile } from './controllers/apiProxyController.js';
import {
    postCreateCharacter,
    postImportCharacterFile,
    postImportCharacter,
    postUpdateCharacter,
    postDeleteCharacter,
    renderCharacters,
    getCharacterAvatar,
    getCharacterApi,
    postUpdateCharacterApi,
} from './controllers/characterController.js';
import {
    postCreateWorldBook,
    postImportWorldBook,
    postUpdateWorldBook,
    renderWorldBooks,
    apiListWorldBooks,
    apiGetWorldBook,
    apiSaveWorldBook,
    apiCreateWorldBook,
    apiDeleteWorldBook,
} from './controllers/worldBookController.js';
import {
    postCreatePreset,
    postDeletePreset,
    postImportPreset,
    postRestorePreset,
    postSavePreset,
    renderPresets,
    apiGetPreset,
} from './controllers/presetController.js';
import { requireAuth, requireGuest } from './middleware/auth.js';
import { 
    getRoomNarratorAvatar, 
    getRoomPersona, 
    getRoomPresets, 
    getRoomRegex, 
    getRoomState, 
    postCreateRoom, 
    postJoinRoom, 
    postRoomInput, 
    postRoomLeave, 
    postRoomOpening, 
    postRoomPersona, 
    postRoomPreset, 
    renderRoom, 
    postUpdateMessage,
    postDeleteMessage,
    postForceStart,
    postRegenerate,
    postRoomUpdate, getRoomWorldBook, postRoomWorldBook 
} from './controllers/roomController.js';
import { postDeleteSession, postUpdateSession } from './controllers/pageController.js';


export function buildRouter() {
    const router = Router();
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 20 * 1024 * 1024,
        },
    });

    router.get('/login', requireGuest, renderLogin);
    router.post('/login', requireGuest, postLogin);
    router.get('/register', requireGuest, renderRegister);
    router.post('/register', requireGuest, postRegister);
    router.post('/logout', requireAuth, postLogout);
    
    // User Profile & Avatar
    router.post('/api/user/profile', requireAuth, postUpdateProfile);
    router.get('/api/user/avatar/:userid', requireAuth, getUserAvatar);
    router.post('/api/user/avatar', requireAuth, upload.single('avatarFile'), postUploadAvatar);
    router.get('/api/user/persona', requireAuth, getUserPersona);
    router.post('/api/user/persona', requireAuth, postUpdateUserPersona);

    router.get('/', requireAuth, renderIndex);
    router.post('/rooms/create', requireAuth, postCreateRoom);
    router.post('/rooms/join', requireAuth, postJoinRoom);
    router.get('/rooms/:code', requireAuth, renderRoom);
    router.get('/api/rooms/:code/state', requireAuth, getRoomState);
    router.get('/api/rooms/:code/narrator-avatar', requireAuth, getRoomNarratorAvatar);
    router.post('/api/rooms/:code/input', requireAuth, postRoomInput);
    router.get('/api/rooms/:code/presets', requireAuth, getRoomPresets);
    router.get('/api/rooms/:code/regex', requireAuth, getRoomRegex);
    router.post('/api/rooms/:code/preset', requireAuth, postRoomPreset);
    router.get('/api/rooms/:code/worldbook', requireAuth, getRoomWorldBook);
    router.post('/api/rooms/:code/worldbook', requireAuth, postRoomWorldBook);
    router.post('/api/rooms/:code/opening', requireAuth, postRoomOpening);
    router.post('/api/rooms/:code/leave', requireAuth, postRoomLeave);
    router.post('/api/rooms/:code/update-message', requireAuth, postUpdateMessage);
    router.post('/api/rooms/:code/delete-message', requireAuth, postDeleteMessage);
    router.post('/api/rooms/:code/force-start', requireAuth, postForceStart);
    router.post('/api/rooms/:code/regenerate', requireAuth, postRegenerate);
    router.post('/api/rooms/:code/update', requireAuth, postRoomUpdate, getRoomWorldBook, postRoomWorldBook);
    router.get('/api/rooms/:code/persona', requireAuth, getRoomPersona);
    router.post('/api/rooms/:code/persona', requireAuth, postRoomPersona);
    router.get('/sessions', requireAuth, renderSessions);
    router.post('/sessions/delete', requireAuth, postDeleteSession);
    router.post('/sessions/update', requireAuth, postUpdateSession);

    router.get('/characters', requireAuth, renderCharacters);
    router.get('/api/characters/avatar/:filename', requireAuth, getCharacterAvatar);
    router.post('/characters/create', requireAuth, postCreateCharacter);
    router.post('/characters/import', requireAuth, postImportCharacter);
    router.post('/characters/import-file', requireAuth, upload.single('cardFile'), postImportCharacterFile);
    router.post('/characters/update', requireAuth, postUpdateCharacter);
    router.post('/characters/delete', requireAuth, postDeleteCharacter);
    
    // SPA API endpoints
    router.get('/api/characters/:filename', requireAuth, getCharacterApi);
    router.post('/api/characters/update', requireAuth, postUpdateCharacterApi);
    router.get('/worldbooks', requireAuth, renderWorldBooks);
    router.post('/worldbooks/create', requireAuth, postCreateWorldBook);
    router.post('/worldbooks/import', requireAuth, postImportWorldBook);
    router.post('/worldbooks/update', requireAuth, postUpdateWorldBook);
    // API endpoints for world book sidebar (JSON, not page renders)
    router.get('/api/worldbooks/list', requireAuth, apiListWorldBooks);
    router.get('/api/worldbooks/detail/:fileName', requireAuth, apiGetWorldBook);
    router.post('/api/worldbooks/save', requireAuth, apiSaveWorldBook);
    router.post('/api/worldbooks/create', requireAuth, apiCreateWorldBook);
    router.post('/api/worldbooks/delete', requireAuth, apiDeleteWorldBook);
    router.get('/api/presets/detail/:fileName', requireAuth, apiGetPreset);
    router.get('/presets', requireAuth, renderPresets);
    router.post('/presets/create', requireAuth, postCreatePreset);
    router.post('/presets/import', requireAuth, upload.single('presetFile'), postImportPreset);
    router.post('/presets/save', requireAuth, postSavePreset);
    router.post('/presets/delete', requireAuth, postDeletePreset);
    router.post('/presets/restore', requireAuth, postRestorePreset);
    router.get('/api-config', requireAuth, renderApiConfig);
    router.post('/api-config', requireAuth, postApiConfig);
    router.post('/api/api-config/fetch-models', requireAuth, getModels);
    router.post('/api/api-config/test-api', requireAuth, testApi);
    router.post('/api/api-config/test-profile', requireAuth, postTestProfile);
    router.get('/settings', requireAuth, renderSettings);
    router.post('/api/settings/preferences', requireAuth, postSettingsPreferences);

    return router;
}
