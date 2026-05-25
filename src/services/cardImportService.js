import { Buffer } from 'node:buffer';
import path from 'node:path';
import extract from 'png-chunks-extract';
import pngChunkText from 'png-chunk-text';
import { t } from '../i18n.js';

function parsePngCard(buffer) {
    const chunks = extract(new Uint8Array(buffer));
    const textChunks = chunks
        .filter((chunk) => chunk.name === 'tEXt')
        .map((chunk) => {
            try {
                return pngChunkText.decode(chunk.data);
            } catch {
                return null;
            }
        })
        .filter(Boolean);

    if (textChunks.length === 0) {
        throw new Error(t('characters.card_format_error'));
    }

    const findByKeyword = (key) => textChunks.find((chunk) => String(chunk.keyword || '').toLowerCase() === key);
    const ccv3 = findByKeyword('ccv3');
    const chara = findByKeyword('chara');
    const target = ccv3 || chara;

    if (!target) {
        throw new Error(t('characters.card_field_missing'));
    }

    try {
        return Buffer.from(target.text, 'base64').toString('utf8');
    } catch {
        throw new Error(t('characters.card_decode_failed'));
    }
}

function normalizeExt(fileName) {
    return path.extname(String(fileName || '')).toLowerCase();
}

export function extractCardJsonFromUploadedFile(uploadedFile) {
    if (!uploadedFile?.buffer) {
        throw new Error(t('characters.upload_empty'));
    }

    const ext = normalizeExt(uploadedFile.originalname);
    if (ext === '.png') {
        return parsePngCard(uploadedFile.buffer);
    }

    if (ext === '.json' || !ext) {
        return uploadedFile.buffer.toString('utf8');
    }

    throw new Error(t('characters.card_unsupported'));
}

