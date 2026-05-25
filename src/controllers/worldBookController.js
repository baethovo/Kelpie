import {
    createWorldBook,
    importWorldBook,
    listWorldBooks,
    readWorldBook,
    updateWorldBook,
} from '../services/worldBookService.js';
import fs from 'node:fs';
import path from 'node:path';
import { t } from '../i18n.js';

function buildWorldBookViewModel(req, extra = {}) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    const worldBooks = listWorldBooks(baseDir, userid);
    const selectedFile = String(req.query.book || extra.selectedFile || '').trim();
    let selectedWorldBook = null;

    if (selectedFile) {
        try {
            selectedWorldBook = readWorldBook(baseDir, userid, selectedFile);
        } catch {
            selectedWorldBook = null;
        }
    }

    return {
        user: req.currentUser,
        worldBooks,
        selectedFile,
        selectedWorldBook,
        error: null,
        success: null,
        ...extra,
    };
}

export function renderWorldBooks(req, res) {
    res.render('worldbooks', buildWorldBookViewModel(req));
}

export function postCreateWorldBook(req, res) {
    const { worldBookName, worldBookJson } = req.body;
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;

    try {
        const created = createWorldBook(baseDir, userid, worldBookName, worldBookJson);
        return res.render('worldbooks', buildWorldBookViewModel(req, {
            selectedFile: created.fileName,
            success: `${t('worldbooks.create_success')}：${created.displayName}`,
        }));
    } catch (error) {
        return res.status(400).render('worldbooks', buildWorldBookViewModel(req, {
            error: error.message,
        }));
    }
}

export function postImportWorldBook(req, res) {
    const { worldBookName, worldBookJson } = req.body;
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;

    try {
        const imported = importWorldBook(baseDir, userid, worldBookName, worldBookJson);
        return res.render('worldbooks', buildWorldBookViewModel(req, {
            selectedFile: imported.fileName,
            success: `${t('worldbooks.import_success')}：${imported.displayName}`,
        }));
    } catch (error) {
        return res.status(400).render('worldbooks', buildWorldBookViewModel(req, {
            error: error.message,
        }));
    }
}

export function postUpdateWorldBook(req, res) {
    const { fileName, worldBookJson } = req.body;
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;

    try {
        const updated = updateWorldBook(baseDir, userid, fileName, worldBookJson);
        return res.render('worldbooks', buildWorldBookViewModel(req, {
            selectedFile: updated.fileName,
            success: `${t('worldbooks.save_success')}：${updated.displayName}`,
        }));
    } catch (error) {
        return res.status(400).render('worldbooks', buildWorldBookViewModel(req, {
            selectedFile: fileName,
            error: error.message,
        }));
    }
}

export function apiListWorldBooks(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.currentUser.userid;
    try {
        const worldBooks = listWorldBooks(baseDir, userid);
        return res.json({ ok: true, worldBooks });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export function apiGetWorldBook(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const userid = req.query.userid || req.currentUser.userid;
    const fileName = String(req.params.fileName || '').trim();
    try {
        const worldBook = readWorldBook(baseDir, userid, fileName);
        return res.json({ ok: true, worldBook });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export function apiSaveWorldBook(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const { fileName, worldBookJson, userid: bodyUserid } = req.body;
    const userid = bodyUserid || req.currentUser.userid;
    try {
        const updated = updateWorldBook(baseDir, userid, fileName || '', worldBookJson || '');
        return res.json({ ok: true, fileName: updated.fileName, displayName: updated.displayName });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export function apiCreateWorldBook(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const { worldBookName, worldBookJson, userid: bodyUserid } = req.body;
    const userid = bodyUserid || req.currentUser.userid;
    try {
        const created = createWorldBook(baseDir, userid, worldBookName || '', worldBookJson || '');
        return res.json({ ok: true, fileName: created.fileName, displayName: created.displayName });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export function apiDeleteWorldBook(req, res) {
    const baseDir = req.app.locals.config.baseDir;
    const { fileName, userid: bodyUserid } = req.body;
    const userid = bodyUserid || req.currentUser.userid;
    try {
        const wb = readWorldBook(baseDir, userid, fileName || '');
        const safeName = path.basename(String(fileName || '')).replace(/[^a-z0-9_.-]/gi, '');
        const wbPath = path.resolve(baseDir, 'data/users', userid, 'worldbooks', safeName);
        if (fs.existsSync(wbPath)) {
            fs.unlinkSync(wbPath);
        }
        return res.json({ ok: true });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}
