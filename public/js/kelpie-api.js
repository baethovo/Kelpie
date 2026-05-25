/**
 * Kelpie Inline JS API
 * Exposes core interaction functions for sandboxed HTML blocks.
 */

// Post a message to the parent window
function postToParent(type, data) {
    try {
        window.parent.postMessage({ type, ...data }, '*');
    } catch (e) {
        console.error('[Kelpie API] Failed to post message to parent:', e);
    }
}

/**
 * Send text to the chat input box.
 * @param {string} text 
 */
export function send2input(text) {
    if (typeof text !== 'string') text = String(text ?? '');
    postToParent('__roomHtmlRenderInput', { __roomHtmlRenderInput: text });
}

/**
 * Update the player's persona content (USER.md) in the current room.
 * @param {string} content 
 */
export function writeUserMD(content) {
    if (typeof content !== 'string') content = String(content ?? '');
    postToParent('__roomHtmlRenderPersonaContent', { __roomHtmlRenderPersonaContent: content });
}
export { writeUserMD as send2UserMD };

/**
 * Update the player's display name in the current room.
 * @param {string} displayName 
 */
export function writeRN(displayName) {
    if (typeof displayName !== 'string') displayName = String(displayName ?? '');
    postToParent('__roomHtmlRenderPersonaDisplayName', { __roomHtmlRenderPersonaDisplayName: displayName });
}
export { writeRN as send2RN };

/**
 * Legacy support for SillyTavern input box format.
 */
export function getInputBox() {
    return {
        send: send2input
    };
}

// Global exposure for non-module scripts or inline event handlers
const kelpie = {
    send2input,
    writeUserMD,
    send2UserMD,
    writeRN,
    send2RN,
    getInputBox
};

if (typeof window !== 'undefined') {
    window.kelpie = kelpie;
    window.sandBox = kelpie; // also alias to sandBox for compatibility
}

export { kelpie as sandBox, kelpie };
export default kelpie;
