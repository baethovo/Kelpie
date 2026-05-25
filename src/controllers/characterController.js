import { Buffer } from 'node:buffer';
import {
    createCharacterCard,
    importCharacterCard,
    listCharacterCards,
    readCharacterAvatar,
    readCharacterCard,
    saveCharacterAvatar,
    updateCharacterCard,
    deleteCharacterCard,
} from '../services/characterService.js';
import { extractCardJsonFromUploadedFile } from '../services/cardImportService.js';
import { listWorldBooks } from '../services/worldBookService.js';
import { t } from '../i18n.js';

function buildCharactersViewModel(req, extra = {}) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    const cards = listCharacterCards(baseDir, userid);
    const worldBooks = listWorldBooks(baseDir, userid);
    const selectedFile = String(req.query.card || extra.selectedFile || '').trim();
    let selectedCard = null;

    if (selectedFile) {
        try {
            const detail = readCharacterCard(baseDir, userid, selectedFile);
            selectedCard = {
                ...detail,
                hasAvatar: !!detail?.hasAvatar,
                avatarUrl: detail?.avatarUrl || null,
            };
        } catch {
            selectedCard = null;
        }
    }

    return {
        user: req.currentUser,
        cards,
        worldBooks,
        selectedFile,
        selectedCard,
        error: null,
        success: null,
        ...extra,
    };
}

export function renderCharacters(req, res) {
    res.render('characters', buildCharactersViewModel(req));
}

export function postCreateCharacter(req, res) {
    const { cardName, description, worldBook } = req.body;
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;

    try {
        const created = createCharacterCard(baseDir, userid, cardName, description, worldBook);
        return res.render('characters', buildCharactersViewModel(req, {
            selectedFile: created.fileName,
            success: `${t('characters.create_success')}：${created.displayName}`,
        }));
    } catch (error) {
        return res.status(400).render('characters', buildCharactersViewModel(req, {
            error: error.message,
        }));
    }
}

export function postUpdateCharacter(req, res) {
    const {
        fileName,
        cardName,
        description,
        worldBook,
        embeddedLoreJson,
        cardJson,
        firstMessage,
        alternateGreetings,
        personality,
        scenario,
        messageExample,
        systemPrompt,
        postHistoryInstructions,
        creatorNotes,
        tags,
    } = req.body;
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;

    try {
        const updated = updateCharacterCard(baseDir, userid, fileName, {
            cardName,
            description,
            worldBook,
            embeddedLoreJson,
            cardJson,
            firstMessage,
            alternateGreetings,
            personality,
            scenario,
            messageExample,
            systemPrompt,
            postHistoryInstructions,
            creatorNotes,
            tags,
        });

        return res.render('characters', buildCharactersViewModel(req, {
            selectedFile: updated.fileName,
            success: `${t('characters.update_success')}：${updated.displayName}`,
        }));
    } catch (error) {
        return res.status(400).render('characters', buildCharactersViewModel(req, {
            selectedFile: fileName,
            error: error.message,
        }));
    }
}

export function getCharacterApi(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    const fileName = req.params.filename;
    try {
        const detail = readCharacterCard(baseDir, userid, fileName);
        if (!detail) {
            return res.status(404).json({ ok: false, error: t('characters.not_found') });
        }
        return res.json({
            ok: true,
            data: {
                ...detail,
                hasAvatar: !!detail?.hasAvatar,
                avatarUrl: detail?.avatarUrl || null,
            }
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
}

export function postUpdateCharacterApi(req, res) {
    const {
        fileName, cardName, description, worldBook, embeddedLoreJson, cardJson,
        firstMessage, alternateGreetings, personality, scenario, messageExample,
        systemPrompt, postHistoryInstructions, creatorNotes, tags,
    } = req.body;
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    
    try {
        const updated = updateCharacterCard(baseDir, userid, fileName, {
            cardName, description, worldBook, embeddedLoreJson, cardJson,
            firstMessage, alternateGreetings, personality, scenario, messageExample,
            systemPrompt, postHistoryInstructions, creatorNotes, tags,
        });

        return res.json({
            ok: true,
            message: `${t('characters.update_success')}：${updated.displayName}`,
            character: {
                fileName: updated.fileName,
                displayName: updated.displayName,
                hasAvatar: !!updated.hasAvatar,
            }
        });
    } catch (error) {
        return res.status(400).json({ ok: false, error: Math.max(error.message, t('common.error')) });
    }
}

export function postImportCharacter(req, res) {
    const { cardName, cardJson } = req.body;
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;

    try {
        const imported = importCharacterCard(baseDir, userid, cardName, cardJson);
        const worldBookText = imported.importedWorldBookFile ? `，${t('characters.import_worldbook')}：${imported.importedWorldBookFile}` : '';

        return res.render('characters', buildCharactersViewModel(req, {
            selectedFile: imported.fileName,
            success: `${t('characters.import_success')}：${imported.displayName} (${imported.fileName})${worldBookText}`,
        }));
    } catch (error) {
        return res.status(400).render('characters', buildCharactersViewModel(req, {
            error: error.message,
        }));
    }
}

export function postImportCharacterFile(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    const uploadedFile = req.file;

    if (!uploadedFile) {
        return res.status(400).render('characters', buildCharactersViewModel(req, {
            error: t('characters.select_file'),
        }));
    }

    try {
        const originalName = Buffer.from(uploadedFile.originalname, 'latin1').toString('utf8');
        const normalizedName = originalName || uploadedFile.originalname;
        const rawText = extractCardJsonFromUploadedFile({
            ...uploadedFile,
            originalname: normalizedName,
        });
        const fileBaseName = normalizedName.replace(/\.[^.]+$/, '');
        const imported = importCharacterCard(baseDir, userid, fileBaseName, rawText);

        if (uploadedFile.mimetype === 'image/png' || normalizedName.toLowerCase().endsWith('.png')) {
            saveCharacterAvatar(baseDir, userid, imported.fileName, uploadedFile.buffer);
        }

        const worldBookText = imported.importedWorldBookFile ? `，${t('characters.import_worldbook')}：${imported.importedWorldBookFile}` : '';

        return res.render('characters', buildCharactersViewModel(req, {
            selectedFile: imported.fileName,
            success: `${t('characters.import_success')}：${imported.displayName} (${imported.fileName})${worldBookText}`,
        }));
    } catch (error) {
        return res.status(400).render('characters', buildCharactersViewModel(req, {
            error: `${t('characters.card_parse_failed')}：${error.message}`,
        }));
    }
}

export function getCharacterAvatar(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    const fileName = req.params.filename;

    try {
        const buffer = readCharacterAvatar(baseDir, userid, fileName);
        if (buffer) {
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
        }
        return res.status(404).send('Avatar not found');
    } catch {
        return res.status(500).send('Avatar load failed');
    }
}

export function postDeleteCharacter(req, res) {
    const { fileName } = req.body;
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;

    try {
        deleteCharacterCard(baseDir, userid, fileName);
        return res.redirect('/characters');
    } catch (error) {
        return res.status(400).render('characters', buildCharactersViewModel(req, {
            error: `${t('characters.delete_failed')}：${error.message}`,
        }));
    }
}
