import fs from 'node:fs';
import path from 'node:path';
import { createUser, verifyUser, updateUsername, getRawPlayerPersona, updatePlayerPersona } from '../services/userService.js';
import { closeRoomsByHostUserId } from '../services/roomService.js';
import { getStore } from '../models/store.js';
import { t } from '../i18n.js';

function applySessionPolicy(req, rememberMe) {
    if (rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        return;
    }

    req.session.cookie.expires = false;
}

// Generates an SVG string containing the first letter of the name
function generateInitialsSvg(name) {
    const letter = (name || '?').charAt(0).toUpperCase();
    const colors = [
        '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', 
        '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', 
        '#8bc34a', '#ff9800', '#ff5722', '#795548', '#607d8b'
    ];
    // deterministically pick color based on string char code
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const bg = colors[Math.abs(hash) % colors.length];
    
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<rect width="100" height="100" fill="' + bg + '"/>' +
        '<text x="50" y="50" dominant-baseline="central" text-anchor="middle" font-family="sans-serif" font-size="50" font-weight="bold" fill="#ffffff">' + letter + '</text>' +
    '</svg>';
}

export function renderLogin(req, res) {
    res.render('login', {
        error: null,
    });
}

export function renderRegister(req, res) {
    const config = req.app.locals.config;
    if (config.allowRegistration === false) {
        return res.redirect('/login');
    }
    res.render('register', {
        error: null,
    });
}

export function postLogin(req, res) {
    const { userid, password, remember } = req.body;
    const user = verifyUser(req.app.locals.config.baseDir, userid, password);

    if (!user) {
        return res.status(401).render('login', {
            error: t('auth.login_failed'),
        });
    }

    req.session.userId = user.id;
    applySessionPolicy(req, remember === 'on');
    return res.redirect('/');
}

export async function postRegister(req, res) {
    const config = req.app.locals.config;
    if (config.allowRegistration === false) {
        return res.status(403).json({ ok: false, error: 'Registration is disabled' });
    }
    try {
        const { userid, password, remember } = req.body;
        const user = await createUser(req.app.locals.config.baseDir, userid, password);
        req.session.userId = user.id;
        applySessionPolicy(req, remember === 'on');
        return res.redirect('/');
    } catch (error) {
        return res.status(400).render('register', {
            error: error.message,
        });
    }
}

export async function postLogout(req, res) {
    if (req.currentUser?.id) {
        await closeRoomsByHostUserId(req.app.locals.config.baseDir, req.currentUser.id);
    }

    req.session.destroy(() => {
        res.redirect('/login');
    });
}

export function postUpdateProfile(req, res) {
    try {
        const { username } = req.body; // alias
        if (!req.currentUser || !req.currentUser.id) {
            return res.status(401).json({ ok: false, error: t('auth.unauthorized') });
        }

        const updatedUser = updateUsername(req.app.locals.config.baseDir, req.currentUser.id, username);

        return res.json({ ok: true, user: updatedUser });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
}

export function getUserAvatar(req, res) {
    try {
        const userid = req.params.userid || req.params.username;
        if (!userid) return res.status(400).send('Missing userid');

        const baseDir = req.app.locals.config.baseDir;
        const userFolder = path.join(baseDir, 'data/users', userid);
        
        // Define accepted avatar extensions
        const exts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
        let avatarFile = null;
        
        if (fs.existsSync(userFolder)) {
            for (const ext of exts) {
                const tempPath = path.join(userFolder, 'avatar' + ext);
                if (fs.existsSync(tempPath)) {
                    avatarFile = tempPath;
                    break;
                }
            }
        }

        if (avatarFile) {
            return res.sendFile(avatarFile);
        }

        // Fallback to SVG (try to get the user's alias for the letter)
        const store = getStore(baseDir);
        const user = store.getUser(userid);
        const displayName = user?.username || userid;

        const svg = generateInitialsSvg(displayName);
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(svg);

    } catch (error) {
        return res.status(500).send('Internal Error');
    }
}

export function postUploadAvatar(req, res) {
    try {
        if (!req.currentUser) {
            return res.status(401).json({ ok: false, error: t('auth.unauthorized') });
        }
        
        if (!req.file) {
            return res.status(400).json({ ok: false, error: t('characters.no_file') });
        }

        const userid = req.currentUser.userid;
        const baseDir = req.app.locals.config.baseDir;
        const userFolder = path.join(baseDir, 'data/users', userid);
        
        if (!fs.existsSync(userFolder)) {
            return res.status(404).json({ ok: false, error: t('characters.user_dir_not_found') });
        }

        // Cleanup old avatars first
        const exts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
        for (const ext of exts) {
            const oldPath = path.join(userFolder, 'avatar' + ext);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        // Save new avatar based on original extension or default to .png
        const origExt = path.extname(req.file.originalname).toLowerCase() || '.png';
        const finalExt = exts.includes(origExt) ? origExt : '.png';
        const targetPath = path.join(userFolder, 'avatar' + finalExt);

        fs.writeFileSync(targetPath, req.file.buffer);

        return res.json({ ok: true, avatarUrl: '/api/user/avatar/' + encodeURIComponent(userid) });
    } catch (error) {
        console.error('Avatar upload failed:', error);
        return res.status(500).json({ ok: false, error: t('characters.upload_failed') });
    }
}

export async function getUserPersona(req, res) {
    try {
        if (!req.currentUser) {
            return res.status(401).json({ ok: false, error: t('auth.unauthorized') });
        }
        const userid = req.currentUser.userid;
        const baseDir = req.app.locals.config.baseDir;
        const rawContent = await getRawPlayerPersona(baseDir, userid);
        return res.json({ ok: true, persona: rawContent });
    } catch (error) {
        return res.status(500).json({ ok: false, error: t('common.internal_error') });
    }
}

export async function postUpdateUserPersona(req, res) {
    try {
        if (!req.currentUser) {
            return res.status(401).json({ ok: false, error: t('auth.unauthorized') });
        }
        const { persona } = req.body;
        const userid = req.currentUser.userid;
        const baseDir = req.app.locals.config.baseDir;
        await updatePlayerPersona(baseDir, userid, persona);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(500).json({ ok: false, error: t('common.save_failed') });
    }
}