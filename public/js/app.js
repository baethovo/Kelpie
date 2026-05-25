if (!window.__spa_initialized) {
    window.__spa_initialized = true;

        window.registerWinGlobal = (obj, type, fn, options) => {
        if (!window.__turbo_globals) window.__turbo_globals = [];
        obj.addEventListener(type, fn, options);
        window.__turbo_globals.push({obj, type, fn, options});
    };
    window.registerGlobal = (type, fn) => {
        if (!window.__turbo_globals) window.__turbo_globals = [];
        document.addEventListener(type, fn);
        window.__turbo_globals.push({type, fn});
    };

    document.addEventListener('turbo:before-render', () => {
        // Force cleanup of all MDUI locks and overlays before render
        document.body.classList.remove('mdui-lock-screen');
        document.documentElement.classList.remove('mdui-lock-screen');
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        
        // Close and remove all dynamic UI elements
        document.querySelectorAll('mdui-dialog, mdui-bottom-sheet, mdui-menu, mdui-tooltip, mdui-snackbar').forEach(el => {
            try { el.open = false; el.remove(); } catch (e) {}
        });
        document.querySelectorAll('mdui-overlay, .mdui-overlay').forEach(el => el.remove());
    });

        
    // Intercept all forms dynamically at the capture phase to ensure Turbo ignores them.
    // This allows Kelpie's native fetch endpoints and 200 OK forms to behave normally (via native submit or JS handling).
    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (form && form.tagName === 'FORM' && !form.hasAttribute('data-turbo')) {
            form.setAttribute('data-turbo', 'false');
        }
    }, { capture: true });

    document.addEventListener('click', (e) => {
        const form = e.target.closest('form');
        if (form && !form.hasAttribute('data-turbo')) {
            form.setAttribute('data-turbo', 'false');
        }
    }, { capture: true });

    // Close permanent drawer on mobile upon navigation
    document.addEventListener('click', (e) => {
        const item = e.target.closest('#app-drawer mdui-list-item');
        if (item && window.matchMedia('(max-width: 1024px)').matches) {
            const drawer = document.querySelector('#app-drawer');
            if (drawer) drawer.open = false;
        }
    }, { passive: true });

document.addEventListener('turbo:load', () => {
        if (window.Turbo) window.Turbo.setProgressBarDelay(50);

        // Sync persistent drawer active state
        const currentPath = new URL(window.location.href).pathname;
        document.querySelectorAll('#app-drawer mdui-list-item').forEach(item => {
            const href = item.getAttribute('href');
            if (href) {
                if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
                    item.setAttribute('active', '');
                } else {
                    item.removeAttribute('active');
                }
            }
        });
        if (window.__turbo_globals) {
            window.__turbo_globals.forEach(l => {
                try {
                    if (l.obj && typeof l.obj.removeEventListener === 'function') {
                        l.obj.removeEventListener(l.type, l.fn, l.options);
                    } else if (typeof document.removeEventListener === 'function') {
                        document.removeEventListener(l.type, l.fn);
                    }
                } catch(e) {}
            });
            window.__turbo_globals = [];
        }

        // Global Flash Message (Snackbar) Handler
        // Check for common error/success containers or attributes
        const flashContainer = document.querySelector('[data-error], [data-success], .worldbooks-page[data-error], .worldbooks-page[data-success], .dashboard[data-error], .dashboard[data-success]');
        if (flashContainer) {
            const error = flashContainer.getAttribute('data-error');
            const success = flashContainer.getAttribute('data-success');
            if (error) window.showSnackbar(error, 'error');
            else if (success) window.showSnackbar(success, 'success');
            // Clear to prevent re-triggering on history navigation if necessary
            flashContainer.removeAttribute('data-error')
            flashContainer.removeAttribute('data-success');
        }


    window.showSnackbar = (() => {
        const host = document.createElement('div');
        host.id = 'global-snackbar-host';
        document.body.appendChild(host);

        let lastMessage = '';
        let lastTime = 0;
        let currentItem = null;
        let hideTimer = null;
        let removeTimer = null;
        const DEDUP_MS = 300;

        return function (message, type) {
            type = type || 'info';
            const text = String(message || '');
            const now = Date.now();
            if (text === lastMessage && now - lastTime < DEDUP_MS) return;
            lastMessage = text;
            lastTime = now;

            const prev = currentItem;
            if (prev) {
                prev.classList.remove('show');
                clearTimeout(hideTimer);
                clearTimeout(removeTimer);
                setTimeout(() => { if (prev.parentNode) prev.remove(); }, 220);
            }

            const item = document.createElement('div');
            item.className = 'global-snackbar global-snackbar--' + type;
            item.textContent = text;
            host.appendChild(item);
            requestAnimationFrame(() => item.classList.add('show'));
            currentItem = item;

            const duration = type === 'error' ? 4000 : 2800;
            hideTimer = setTimeout(() => item.classList.remove('show'), duration - 300);
            removeTimer = setTimeout(() => {
                item.remove();
                if (currentItem === item) currentItem = null;
            }, duration);
        };
    })();

    function applyAntiAutofill(root = document) {
        root.querySelectorAll('form').forEach((form) => {
            if (!form.hasAttribute('autocomplete')) form.setAttribute('autocomplete', 'off');
        });
        root.querySelectorAll('mdui-text-field, input:not([type="hidden"]), textarea').forEach((el) => {
            if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
        });
    }

    function applyAppearance(theme, color, quoteColor) {
        const nextTheme = ['auto', 'light', 'dark'].includes(String(theme || '').trim()) ? String(theme || '').trim() : 'auto';
        const nextColor = String(color || '').trim() || '#3f51b5';
        const nextQuoteColor = String(quoteColor || '').trim();
        mdui.setTheme(nextTheme);
        mdui.setColorScheme(nextColor);
        localStorage.setItem('theme', nextTheme);
        localStorage.setItem('seed-color', nextColor);
        if (nextQuoteColor) {
            localStorage.setItem('quote-color', nextQuoteColor);
            document.documentElement.style.setProperty('--quote-color', nextQuoteColor);
        } else {
            localStorage.removeItem('quote-color');
            document.documentElement.style.removeProperty('--quote-color');
        }
        const themeToggle = document.querySelector('#theme-toggle');
        if (themeToggle) {
            themeToggle.icon = nextTheme === 'dark' ? 'dark_mode' : (nextTheme === 'light' ? 'light_mode' : 'brightness_auto');
        }
    }

    function applyDrawerPushMode() {
        const isPush = localStorage.getItem('drawer-push') !== 'false';
        const drawer = document.querySelector('#app-drawer');
        if (isPush) {
            document.body.classList.remove('drawer-overlay-mode');
            if (drawer) drawer.placement = 'left';
        } else {
            document.body.classList.add('drawer-overlay-mode');
        }
        return !isPush; // Return whether it should be treated as overlay
    }

    function initBaseUi() {
        applyAntiAutofill();
        const syncDynamicViewportHeight = () => {
            const viewportHeight = window.visualViewport && Number(window.visualViewport.height)
                ? Math.round(window.visualViewport.height)
                : Math.round(window.innerHeight || 0);
            if (viewportHeight > 0) {
                document.documentElement.style.setProperty('--app-vh', `${viewportHeight}px`);
            }
        };
        syncDynamicViewportHeight();
        registerWinGlobal(window, 'resize', syncDynamicViewportHeight, { passive: true });
        registerWinGlobal(window, 'orientationchange', syncDynamicViewportHeight, { passive: true });
        if (window.visualViewport) {
            registerWinGlobal(window.visualViewport, 'resize', syncDynamicViewportHeight, { passive: true });
            registerWinGlobal(window.visualViewport, 'scroll', syncDynamicViewportHeight, { passive: true });
        }

        // Global Event Delegation for Dynamic UI
        registerGlobal('click', (e) => {
            // MDUI style confirmation for session deletion
            const deleteBtn = e.target.closest('.delete-session-btn');
            if (deleteBtn) {
                const form = deleteBtn.closest('form');
                if (form) {
                    const confirmDialog = mdui.confirm({
                        title: __('sessions.confirm_delete_session'),
                        description: __('sessions.confirm_delete_session_msg'),
                        confirmText: __('common.delete_confirm'),
                        cancelText: __('common.cancel'),
                        onConfirm: () => {
                            // Close dialog immediately to clear overlay
                            confirmDialog.open = false;
                            // Set a small delay to ensure cleanup before navigation starts
                            setTimeout(() => {
                                if (window.Turbo) {
                                    // Use Turbo for a smoother SPA transition if possible
                                    const formData = new FormData(form);
                                    const params = new URLSearchParams(formData);
                                    fetch(form.action, {
                                        method: 'POST',
                                        body: params,
                                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                                    }).then(res => {
                                        if (res.redirected) window.Turbo.visit(res.url);
                                        else window.location.reload();
                                    }).catch(() => form.submit());
                                } else {
                                    form.submit();
                                }
                            }, 50);
                        }
                    });
                }
            }
        });

        if (window.mdui && typeof window.mdui.mutation === 'function') {
            window.mdui.mutation();
        }

        const media = window.matchMedia('(max-width: 1024px)');
        const drawers = Array.from(document.querySelectorAll('mdui-navigation-drawer'));
        const drawer = document.querySelector('#app-drawer');
        const drawerToggle = document.querySelector('#drawer-toggle');
        const drawerClose = document.querySelector('#drawer-close');

        const syncBodyModalState = () => {
            const isMobile = media.matches;
            const isOverlayMode = applyDrawerPushMode();
            const isModalOpen = drawers.some((item) => Boolean(item && item.open && (item.modal || isMobile || isOverlayMode)));
            document.body.classList.toggle('drawer-modal-open', isModalOpen);
        };

        if (drawerToggle && drawer) drawerToggle.onclick = () => { drawer.open = !drawer.open; };
        if (drawerClose && drawer) drawerClose.onclick = () => { drawer.open = false; };
        drawers.forEach((item) => {
            item.addEventListener('opened', syncBodyModalState);
            item.addEventListener('closed', syncBodyModalState);
            item.addEventListener('overlay-click', syncBodyModalState);
        });

        if (drawers.length > 0) {
            const syncDrawerMode = () => {
                const isOverlayMode = applyDrawerPushMode();
                drawers.forEach((d) => {
                    d.modal = media.matches || isOverlayMode;
                });
                syncBodyModalState();
            };
            syncDrawerMode();
            // Bind settings switch click to update drawer mode dynamically
            const drawerModeSwitch = document.querySelector('#settings-drawer-push-switch');
            if (drawerModeSwitch) {
                drawerModeSwitch.addEventListener('change', () => { setTimeout(syncDrawerMode, 50); });
            }
            if (typeof media.addEventListener === 'function') {
                registerWinGlobal(media, 'change', syncDrawerMode);
            } else if (typeof media.addListener === 'function') {
                media.addListener(syncDrawerMode);
            }
        } else if (typeof media.addEventListener === 'function') {
            registerWinGlobal(media, 'change', syncBodyModalState);
            syncBodyModalState();
        } else if (typeof media.addListener === 'function') {
            media.addListener(syncBodyModalState);
            syncBodyModalState();
        }

        applyAppearance(localStorage.getItem('theme') || 'auto', localStorage.getItem('seed-color') || '#3f51b5', localStorage.getItem('quote-color') || '');

        const themeToggle = document.querySelector('#theme-toggle');
        if (themeToggle) {
            themeToggle.onclick = () => {
                const current = mdui.getTheme();
                const next = current === 'light' ? 'dark' : (current === 'dark' ? 'auto' : 'light');
                applyAppearance(next, localStorage.getItem('seed-color') || '#3f51b5', localStorage.getItem('quote-color') || '');
                window.showSnackbar(__('common.theme_switched', { theme: next }), "success");
            };
        }

        document.querySelectorAll('form[data-save-snackbar]').forEach((form) => {
            form.onsubmit = () => { window.showSnackbar(form.dataset.saveSnackbar || __('common.saving'), "success"); };
        });
    }

    function buildWsUrl(scope, code = '') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const query = new URLSearchParams({ scope: String(scope || '').trim() });
        if (code) query.set('code', String(code || '').trim().toUpperCase());
        return `${protocol}//${window.location.host}/ws?${query.toString()}`;
    }

    function initIndexPage() {
        const createRoomDialog = document.querySelector('#create-room-dialog');
        const joinRoomDialog = document.querySelector('#join-room-dialog');
        const openCreateRoomDialog = document.querySelector('#open-create-room-dialog');
        const openJoinRoomDialog = document.querySelector('#open-join-room-dialog');
        const quickJoinForm = document.querySelector('#quick-join-form');
        const quickJoinRoomCode = document.querySelector('#quick-join-room-code');
        const createRoomForm = document.querySelector('#create-room-form');
        const joinRoomForm = document.querySelector('#join-room-form');
        const joinRoomCode = document.querySelector('#join-room-code');
        const joinRoomPassword = document.querySelector('#join-room-password');
        const roomGrid = document.querySelector('#lobby-room-grid');
        const emptyState = document.querySelector('#lobby-empty-state');
        const roomsTitle = document.querySelector('#lobby-rooms-title');
        const escapeHtml = (value) => String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        if (!quickJoinForm || !quickJoinRoomCode) {
            return;
        }

        if (openCreateRoomDialog && createRoomDialog) openCreateRoomDialog.onclick = () => { createRoomDialog.open = true; };
        if (openJoinRoomDialog && joinRoomDialog) openJoinRoomDialog.onclick = () => { joinRoomDialog.open = true; };

        const postForm = async (url, payload) => {
            const body = new URLSearchParams();
            Object.entries(payload || {}).forEach(([key, value]) => {
                body.set(key, String(value ?? ''));
            });

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: body.toString(),
            });
            const data = await res.json();
            return { res, data };
        };

        const joinRoomByCode = async (roomCode, hasPassword) => {
            const cleanCode = String(roomCode || '').trim().toUpperCase();
            if (!cleanCode) return;
            if (hasPassword && joinRoomDialog) {
                joinRoomDialog.open = true;
                if (joinRoomCode) joinRoomCode.value = cleanCode;
                if (joinRoomPassword) {
                    joinRoomPassword.value = '';
                    joinRoomPassword.focus();
                }
                return;
            }
            try {
                const { data } = await postForm('/rooms/join', { roomCode: cleanCode, roomPassword: '' });
                if (!data.ok) {
                    window.showSnackbar(data.error || __('index.join_failed'), "error");
                    return;
                }
                window.location.href = data.redirect || `/rooms/${encodeURIComponent(cleanCode)}`;
            } catch {
                window.showSnackbar(__('index.network_join_fail'), "error");
            }
        };

        const renderLobbyRooms = (rooms) => {
            if (!roomGrid || !emptyState || !roomsTitle) return;
            const safeRooms = Array.isArray(rooms) ? rooms : [];
            roomGrid.innerHTML = safeRooms.map((room) => `
                <mdui-card class="stat-card" clickable data-room-card data-room-code="${escapeHtml(String(room.joinCode || ''))}" data-has-password="${room.hasPassword ? '1' : '0'}">
                    <div class="card-icon">
                        <mdui-icon name="${room.hasPassword ? 'lock' : 'public'}"></mdui-icon>
                    </div>
                    <div class="card-title">${escapeHtml(String(room.title || __('index.no_title_room')))}</div>
                    <div class="card-desc">
                        ${__('index.room_code_label')}: <strong>${escapeHtml(String(room.joinCode || ''))}</strong><br>
                        ${__('index.host_label')}: ${escapeHtml(String(room.hostUsername || ''))}<br>
                        ${__('index.member_count')}: ${Number(room.memberCount || 0)}
                    </div>
                </mdui-card>
            `).join('');

            const hasRooms = safeRooms.length > 0;
            roomGrid.style.display = hasRooms ? '' : 'none';
            roomsTitle.style.display = hasRooms ? '' : 'none';
            emptyState.style.display = hasRooms ? 'none' : '';
        };

        registerGlobal('click', (event) => {
            const card = event.target.closest('[data-room-card]');
            if (!card) return;
            joinRoomByCode(card.dataset.roomCode, String(card.dataset.hasPassword || '') === '1');
        });

        if (createRoomForm) {
            createRoomForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const formData = new FormData(createRoomForm);
                const payload = Object.fromEntries(formData.entries());
                if (!('isPublic' in payload)) payload.isPublic = '';
                try {
                    const { data } = await postForm('/rooms/create', payload);
                    if (!data.ok) {
                        window.showSnackbar(data.error || __('index.create_failed'), "error");
                        return;
                    }
                    window.location.href = data.redirect || '/';
                } catch {
                    window.showSnackbar(__('index.network_create_fail'), "error");
                }
            });
        }

        if (joinRoomForm) {
            joinRoomForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const formData = new FormData(joinRoomForm);
                const payload = Object.fromEntries(formData.entries());
                try {
                    const { data } = await postForm('/rooms/join', payload);
                    if (!data.ok) {
                    window.showSnackbar(data.error || __('index.join_failed'), "error");
                        return;
                    }
                    if (joinRoomDialog) joinRoomDialog.open = false;
                    window.location.href = data.redirect || '/';
                } catch {
                window.showSnackbar(__('index.network_join_fail'), "error");
                }
            });
        }

        let lobbySocket = null;
        let reconnectTimer = null;
        const connectLobbySocket = () => {
            if (!roomGrid) return;
            if (lobbySocket && (lobbySocket.readyState === WebSocket.OPEN || lobbySocket.readyState === WebSocket.CONNECTING)) {
                return;
            }
            lobbySocket = new WebSocket(buildWsUrl('lobby'));
            lobbySocket.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data || '{}');
                    if (payload.type === 'lobby.rooms') {
                        renderLobbyRooms(payload.rooms || []);
                    }
                } catch {
                    // Ignore malformed payload.
                }
            };
            lobbySocket.onclose = () => {
                if (reconnectTimer) clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(connectLobbySocket, 1600);
            };
            lobbySocket.onerror = () => {
                try {
                    lobbySocket.close();
                } catch {
                    // Ignore close errors.
                }
            };
        };

        connectLobbySocket();
        const cleanLobby = () => {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (lobbySocket) {
                try {
                    lobbySocket.close(1000, 'Page unload');
                } catch {}
                lobbySocket = null;
            }
        };
        window.addEventListener('beforeunload', cleanLobby);
        document.addEventListener('turbo:before-render', cleanLobby, { once: true });
    }

    function initCharacterPage() {
        const charImportTrigger = document.querySelector('#import-character-file-trigger');
        const charFileInput = document.querySelector('#character-file-input');
        const charImportForm = document.querySelector('#character-file-import-form');
        const openCreateCharDialog = document.querySelector('#open-create-character-dialog');
        const createCharDialog = document.querySelector('#create-character-dialog');
        const charGallerySearch = document.querySelector('#char-gallery-search');

        if (charImportTrigger && charFileInput) charImportTrigger.onclick = () => charFileInput.click();
        if (charFileInput && charImportForm) {
            charFileInput.onchange = () => {
                if (charFileInput.files.length) {
                    window.showSnackbar(__('characters.importing'), "info");
                    charImportForm.submit();
                }
            };
        }
        if (openCreateCharDialog && createCharDialog) openCreateCharDialog.onclick = () => { createCharDialog.open = true; };

        const deleteCharConfirmDialog = document.querySelector('#delete-character-confirm-dialog');
        const deleteCharFilenameInput = document.querySelector('#delete-character-filename');
        const deleteCharConfirmText = document.querySelector('#delete-character-confirm-text');
        document.querySelectorAll('.delete-card-btn').forEach((btn) => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (deleteCharFilenameInput) deleteCharFilenameInput.value = String(btn.dataset.filename || '').trim();
                if (deleteCharConfirmText) deleteCharConfirmText.textContent = __('common.delete_char_confirm', { name: String(btn.dataset.displayname || '').trim() });
                if (deleteCharConfirmDialog) deleteCharConfirmDialog.open = true;
            };
        });

        if (charGallerySearch) {
            charGallerySearch.addEventListener('input', () => {
                const keyword = String(charGallerySearch.value || '').trim().toLowerCase();
                document.querySelectorAll('.char-gallery-grid .char-item-card').forEach((card) => {
                    const text = String(card.textContent || '').toLowerCase();
                    card.style.display = !keyword || text.includes(keyword) ? '' : 'none';
                });
            });
        }

        // --- SPA Character Editor Logic ---
        const modal = document.querySelector('#char-editor-modal');
        const editorForm = document.querySelector('#modal-char-editor-form');
        const closeBtn = document.querySelector('#close-char-editor-btn');
        const loreContainer = document.querySelector('#modal-char-lore-container');
        const loreTemplate = document.querySelector('#char-lore-template');
        const addLoreBtn = document.querySelector('#modal-add-lore-btn');
        const loreJsonInput = document.querySelector('#modal-embedded-lore-json');
        
        let currentLoreEntries = [];
        let isDirty = false;

        const positionLabels = [
            'Before Character', 'After Character', 'At Depth', 
            'Author Note Top', 'Author Note Bottom', 
            'Chat Top', 'Chat Bottom'
        ];

        const renderLoreEntries = () => {
            if (!loreContainer || !loreTemplate) return;
            loreContainer.innerHTML = '';
            
            if (currentLoreEntries.length === 0) {
                loreContainer.innerHTML = `
                    <div class="char-empty-block" style="text-align: center; padding: 40px 0; color: rgb(var(--mdui-color-on-surface-variant));">
                        <mdui-icon name="auto_stories" style="font-size: 48px; opacity: 0.5; margin-bottom: 16px;"></mdui-icon>
                        <p style="margin: 0;">${__('worldbooks.no_lore_entries')}</p>
                    </div>
                `;
                return;
            }

            currentLoreEntries.forEach((entry, index) => {
                const clone = loreTemplate.content.cloneNode(true);
                const details = clone.querySelector('details');
                
                details.dataset.loreUid = entry.uid || Date.now() + index;
                details.querySelector('[data-tpl-title]').textContent = entry.comment || __('characters.unnamed_entry');
                const posIndex = Number(entry.position) || 1;
                details.querySelector('[data-tpl-meta]').textContent = positionLabels[posIndex] || positionLabels[1];
                
                const setVal = (name, val) => {
                    const el = details.querySelector(`[data-lore-field="${name}"]`);
                    if (el) el.value = String(val ?? '');
                };
                
                setVal('comment', entry.comment);
                setVal('keys', Array.isArray(entry.keys) ? entry.keys.join(', ') : '');
                setVal('secondaryKeys', Array.isArray(entry.secondaryKeys) ? entry.secondaryKeys.join(', ') : '');
                setVal('position', posIndex);
                setVal('order', entry.order ?? 100);
                setVal('depth', entry.depth ?? 0);
                setVal('content', entry.content);
                
                const toggle = details.querySelector('[data-lore-field="enabled"]');
                if (toggle) toggle.checked = entry.enabled !== false;
                
                // Live binding for UI updates
                const commentInput = details.querySelector('[data-lore-field="comment"]');
                if (commentInput) {
                    commentInput.addEventListener('input', (e) => {
                        details.querySelector('[data-tpl-title]').textContent = e.target.value.trim() || __('characters.unnamed_entry');
                        entry.comment = e.target.value;
                        isDirty = true;
                    });
                }
                const positionSelect = details.querySelector('[data-lore-field="position"]');
                if (positionSelect) {
                    positionSelect.addEventListener('change', (e) => {
                        const idx = Number(e.target.value) || 1;
                        details.querySelector('[data-tpl-meta]').textContent = positionLabels[idx] || positionLabels[1];
                        entry.position = idx;
                        isDirty = true;
                    });
                }
                
                // Track dirtiness on all lore inputs
                details.querySelectorAll('input, textarea, mdui-text-field, mdui-select, mdui-switch').forEach(el => {
                    el.addEventListener('input', () => { isDirty = true; });
                    el.addEventListener('change', () => { isDirty = true; });
                });

                // Delete entry
                const delBtn = details.querySelector('.lore-delete-btn');
                if (delBtn) {
                    delBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        currentLoreEntries = currentLoreEntries.filter(e => e !== entry);
                        isDirty = true;
                        renderLoreEntries();
                    });
                }

                loreContainer.appendChild(clone);
            });
        };

        if (addLoreBtn) {
            addLoreBtn.addEventListener('click', () => {
                currentLoreEntries.push({
                    uid: Date.now(),
                    comment: __('worldbooks.new_entry'),
                    keys: [],
                    secondaryKeys: [],
                    position: 1,
                    order: 100,
                    depth: 0,
                    enabled: true,
                    content: ''
                });
                isDirty = true;
                renderLoreEntries();
                // Find the newly added entry and open it
                setTimeout(() => {
                    const detailsElements = loreContainer.querySelectorAll('details');
                    if (detailsElements.length > 0) {
                        const lastDetails = detailsElements[detailsElements.length - 1];
                        lastDetails.open = true;
                        lastDetails.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 10);
            });
        }

        const openEditorModal = async (filename) => {
            if (!modal) return;
            try {
                window.showSnackbar(__('characters.loading'), 'info');
                const res = await fetch(`/api/characters/${encodeURIComponent(filename)}`);
                const { ok, data, error } = await res.json();
                if (!ok) throw new Error(error || __('characters.load_failed'));

                // Populate fields
                document.querySelector('#modal-char-filename-display').textContent = data.fileName;
                document.querySelector('#modal-char-name-display').textContent = data.name;
                document.querySelector('#modal-char-filename').value = data.fileName;
                
                const avatarImg = document.querySelector('#modal-char-avatar');
                const avatarPlaceholder = document.querySelector('#modal-char-avatar-placeholder');
                if (data.hasAvatar && data.avatarUrl) {
                    avatarImg.src = data.avatarUrl;
                    avatarImg.style.display = 'block';
                    avatarPlaceholder.style.display = 'none';
                } else {
                    avatarImg.style.display = 'none';
                    avatarPlaceholder.style.display = 'block';
                }

                const setFormVal = (id, val) => {
                    const el = document.querySelector(`#${id}`);
                    if (el) el.value = String(val ?? '');
                };

                setFormVal('modal-input-cardName', data.name);
                setFormVal('modal-input-description', data.description);
                setFormVal('modal-input-firstMessage', data.metaFields?.firstMessage);
                setFormVal('modal-input-alternateGreetings', (data.metaFields?.alternateGreetings || []).join('\n'));
                setFormVal('modal-input-scenario', data.metaFields?.scenario);
                setFormVal('modal-input-personality', data.metaFields?.personality);
                setFormVal('modal-input-messageExample', data.metaFields?.messageExample);
                setFormVal('modal-input-systemPrompt', data.metaFields?.systemPrompt);
                setFormVal('modal-input-postHistoryInstructions', data.metaFields?.postHistoryInstructions);
                setFormVal('modal-input-creatorNotes', data.metaFields?.creatorNotes);
                setFormVal('modal-input-tags', (data.metaFields?.tags || []).join(', '));

                // Handle lore entries
                currentLoreEntries = JSON.parse(JSON.stringify(data.embeddedLoreEntries || []));
                renderLoreEntries();

                // Set world book selector
                const wbSelector = document.querySelector('#modal-char-worldbook');
                const wbHidden = document.querySelector('#modal-char-worldbook-hidden');
                if (wbSelector && data.worldBook !== undefined) {
                    wbSelector.value = data.worldBook || '';
                    if (wbHidden) wbHidden.value = data.worldBook || '';
                }
                // Sync world book selector to hidden input
                if (wbSelector && wbHidden) {
                    wbSelector.addEventListener('change', () => {
                        wbHidden.value = wbSelector.value;
                        isDirty = true;
                    });
                }
                
                // Reset dirty tracking
                isDirty = false;
                
                // Track dirtiness on all root form inputs
                editorForm.querySelectorAll('mdui-text-field, input, textarea, mdui-select, mdui-switch').forEach(el => {
                    // Only add once to avoid duplicates if called multiple times, but this is fine since it's a small app
                    el.addEventListener('input', () => { isDirty = true; });
                    el.addEventListener('change', () => { isDirty = true; });
                });

                // Select first tab
                const tabs = document.querySelector('.char-editor-tabs');
                if (tabs) tabs.value = 'char-basic';

                // Open modal
                modal.open = true;
                
                // Add active state to gallery card
                document.querySelectorAll('.char-item-card').forEach(c => c.classList.remove('active'));
                const activeCard = document.querySelector(`.char-item-card[data-edit-character="${filename}"]`);
                if (activeCard) activeCard.classList.add('active');

            } catch (err) {
                window.showSnackbar(err.message, 'error');
            }
        };

        // Bind clicks to open modal
        document.querySelectorAll('.char-item-card[data-edit-character]').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.delete-card-btn')) return;
                const filename = decodeURIComponent(card.dataset.editCharacter);
                openEditorModal(filename);
            });
        });

        const handleModalCloseRequest = () => {
            if (isDirty) {
                if (confirm(__('common.unsaved_confirm'))) {
                    isDirty = false;
                    modal.open = false;
                    document.querySelectorAll('.char-item-card').forEach(c => c.classList.remove('active'));
                }
            } else {
                modal.open = false;
                document.querySelectorAll('.char-item-card').forEach(c => c.classList.remove('active'));
            }
        };

        if (modal) {
            modal.addEventListener('cancel', (e) => {
                if (isDirty) {
                    e.preventDefault();
                    handleModalCloseRequest();
                }
            });
        }

        if (closeBtn && modal) {
            closeBtn.addEventListener('click', () => {
                handleModalCloseRequest();
            });
        }

        if (editorForm) {
            editorForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                // Synchronize Lore UI back to currentLoreEntries just in case
                if (loreContainer) {
                    const entries = [];
                    loreContainer.querySelectorAll('[data-lore-entry]').forEach((entryEl, index) => {
                        const getField = (name) => entryEl.querySelector(`[data-lore-field="${name}"]`);
                        const textValue = (name) => String(getField(name)?.value || '').trim();
                        const numberValue = (name, fallback = 0) => {
                            const value = Number(getField(name)?.value);
                            return Number.isFinite(value) ? value : fallback;
                        };
                        const boolValue = (name) => !!getField(name)?.checked;
                        const uid = Number(entryEl.dataset.loreUid);
                        entries.push({
                            uid: Number.isFinite(uid) ? uid : index,
                            comment: textValue('comment'),
                            keys: textValue('keys').split(',').map((item) => item.trim()).filter(Boolean),
                            secondaryKeys: textValue('secondaryKeys').split(',').map((item) => item.trim()).filter(Boolean),
                            position: numberValue('position', 1),
                            order: numberValue('order', 100 + index),
                            depth: numberValue('depth', 0),
                            enabled: boolValue('enabled'),
                            content: textValue('content'),
                        });
                    });
                    if (loreJsonInput) loreJsonInput.value = JSON.stringify(entries);
                }

                const formData = new FormData(editorForm);
                const payload = Object.fromEntries(formData.entries());
                
                const saveBtn = document.querySelector('#modal-save-btn');
                if (saveBtn) saveBtn.loading = true;

                try {
                    const bodyParams = new URLSearchParams();
                    Object.entries(payload).forEach(([k, v]) => bodyParams.set(k, String(v ?? '')));

                    const res = await fetch('/api/characters/update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            Accept: 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        body: bodyParams.toString()
                    });
                    
                    const data = await res.json();
                    if (!res.ok || !data.ok) throw new Error(data.error || __('common.save_failed'));
                    
                    isDirty = false;
                    window.showSnackbar(data.message || __('common.save_success'), 'success');
                    
                    // Update gallery card name quickly
                    if (data.character) {
                        const card = document.querySelector(`.char-item-card[data-edit-character="${encodeURIComponent(data.character.fileName)}"]`);
                        if (card) {
                            const nameEl = card.querySelector('.char-card-name');
                            if (nameEl) nameEl.textContent = data.character.displayName;
                            document.querySelector('#modal-char-name-display').textContent = data.character.displayName;
                        }
                    }
                } catch (err) {
                    window.showSnackbar(err.message, 'error');
                } finally {
                    if (saveBtn) saveBtn.loading = false;
                }
            });
        }
    }

    function initPresetPage() {
        const presetSelector = document.querySelector('#preset-selector');
        const presetImportTrigger = document.querySelector('#preset-import-trigger');
        const presetImportFileInput = document.querySelector('#preset-import-file-input');
        const presetImportForm = document.querySelector('#preset-import-form');

        if (presetImportTrigger && presetImportFileInput) presetImportTrigger.onclick = () => presetImportFileInput.click();
        if (presetImportFileInput && presetImportForm) {
            presetImportFileInput.onchange = async () => {
                if (!presetImportFileInput.files.length) return;
                window.showSnackbar(__('presets.importing'), "info");
                try {
                    const formData = new FormData(presetImportForm);
                    const res = await fetch('/presets/import', {
                        method: 'POST',
                        headers: { 'X-Requested-With': 'XMLHttpRequest' },
                        body: formData,
                    });
                    const data = await res.json();
                    if (!data.ok) {
                        window.showSnackbar(data.error || __('presets.import_failed'), "error");
                        return;
                    }
                    window.showSnackbar(data.message || __('presets.import_success'), "success");
                    if (data.redirect) Turbo.visit(data.redirect, { action: 'replace' });
                } catch {
                    window.showSnackbar(__('common.network_error'), "error");
                }
            };
        }

        // Export preset
        const exportBtn = document.querySelector('#preset-export-btn');
        const presetJsonEditor = document.querySelector('#preset-json-editor');
        if (exportBtn && presetJsonEditor) {
            exportBtn.onclick = () => {
                const raw = String(presetJsonEditor.value || '').trim();
                if (!raw) { window.showSnackbar(__('common.content_empty'), 'error'); return; }
                const name = document.querySelector('[name="presetName"]')?.value?.trim() || 'preset';
                const blob = new Blob([raw], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `${name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')}.json`;
                a.click();
                URL.revokeObjectURL(url);
                window.showSnackbar(__('presets.export_success'), 'success');
            };
        }

        // Create preset dialog
        const createBtn = document.querySelector('#preset-create-btn');
        const createDialog = document.querySelector('#create-preset-dialog');
        if (createBtn && createDialog) {
            createBtn.onclick = () => createDialog.open = true;
            const confirmCreate = document.querySelector('#confirm-create-preset-btn');
            if (confirmCreate) {
                confirmCreate.onclick = async () => {
                    const name = String(document.querySelector('#create-preset-name')?.value || '').trim();
                    if (!name) { window.showSnackbar(__('common.file_name_empty'), 'error'); return; }
                    confirmCreate.loading = true;
                    try {
                        const res = await fetch('/presets/create', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                            body: new URLSearchParams({ apiId: 'api', presetName: name, presetJson: '{}' }).toString(),
                        });
                        const data = await res.json();
                        if (!data.ok) { window.showSnackbar(data.error || __('presets.create_failed'), 'error'); return; }
                        createDialog.open = false;
                        window.showSnackbar(__('presets.create_success'), 'success');
                        if (data.selectedFile) {
                            Turbo.visit(`/presets?preset=${encodeURIComponent(data.selectedFile)}`, { action: 'replace' });
                        }
                    } catch { window.showSnackbar(__('common.network_error'), 'error'); }
                    finally { confirmCreate.loading = false; }
                };
            }
        }

        const presetJsonValidate = document.querySelector('#preset-json-validate');
        const presetJsonFormat = document.querySelector('#preset-json-format');
        if (presetJsonEditor && presetJsonValidate) {
            presetJsonValidate.onclick = () => {
                try {
                    JSON.parse(presetJsonEditor.value);
                    window.showSnackbar(__('presets.json_valid'), "success");
                } catch (error) {
                    window.showSnackbar(__('presets.json_validate_failed', { message: error.message }), "error");
                }
            };
        }
        if (presetJsonEditor && presetJsonFormat) {
            presetJsonFormat.onclick = () => {
                try {
                    const parsed = JSON.parse(presetJsonEditor.value);
                    presetJsonEditor.value = JSON.stringify(parsed, null, 2);
                    window.showSnackbar(__('presets.json_formatted'), "success");
                } catch (error) {
                    window.showSnackbar(__('presets.json_format_failed', { message: error.message }), "error");
                }
            };
        }

        const updatePresetSelectorOptions = (presets, selectedFile = '') => {
            if (!presetSelector) return;
            const safePresets = Array.isArray(presets) ? presets : [];
            presetSelector.innerHTML = '<mdui-menu-item value="">' + __('presets.select_preset_hint') + '</mdui-menu-item>'
                + (safePresets.length
                    ? safePresets.map((item) => `<mdui-menu-item value="${String(item.fileName || '')}">${String(item.displayName || '')}</mdui-menu-item>`).join('')
                    : '<mdui-menu-item value="" disabled>(' + __('presets.no_available') + ')</mdui-menu-item>');
            presetSelector.value = String(selectedFile || '');
        };

        const parsePresetEditorJson = () => {
            if (!presetJsonEditor) return null;
            try {
                const sourceText = String(presetJsonEditor.value || '').trim() || '{}';
                return JSON.parse(sourceText);
            } catch {
                return null;
            }
        };

        const writePresetEditorJson = (parsed) => {
            if (!presetJsonEditor || !parsed || typeof parsed !== 'object') return false;
            presetJsonEditor.value = JSON.stringify(parsed, null, 2);
            return true;
        };

        const sliderConfigs = [
            { sliderId: 'slider-temperature', valueId: 'val-temperature', key: 'temperature', digits: 2, min: 0, max: 2 },
            { sliderId: 'slider-top_p', valueId: 'val-top_p', key: 'top_p', digits: 2, min: 0, max: 1 },
            { sliderId: 'slider-top_k', valueId: 'val-top_k', key: 'top_k', digits: 0, min: 0, max: 100 },
            { sliderId: 'slider-min_p', valueId: 'val-min_p', key: 'min_p', digits: 2, min: 0, max: 1 },
            { sliderId: 'slider-top_a', valueId: 'val-top_a', key: 'top_a', digits: 2, min: 0, max: 1 },
            { sliderId: 'slider-repetition_penalty', valueId: 'val-repetition_penalty', key: 'repetition_penalty', digits: 2, min: 1, max: 2 },
            { sliderId: 'slider-frequency_penalty', valueId: 'val-frequency_penalty', key: 'frequency_penalty', digits: 2, min: -2, max: 2 },
            { sliderId: 'slider-presence_penalty', valueId: 'val-presence_penalty', key: 'presence_penalty', digits: 2, min: -2, max: 2 },
        ];
        const checkboxConfigs = [
            { id: 'check-stream_openai', key: 'stream_openai' },
            { id: 'check-wrap_in_quotes', key: 'wrap_in_quotes' },
        ];

        const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

        const applySamplingFromJson = () => {
            const parsed = parsePresetEditorJson();
            if (!parsed) return;
            const openai = (parsed.openai && typeof parsed.openai === 'object') ? parsed.openai : {};

            sliderConfigs.forEach((cfg) => {
                const slider = document.querySelector(`#${cfg.sliderId}`);
                const valueEl = document.querySelector(`#${cfg.valueId}`);
                if (!slider || !valueEl) return;
                const raw = Number(openai[cfg.key]);
                const fallback = Number(slider.value || 0);
                const normalized = Number.isFinite(raw) ? clampNumber(raw, cfg.min, cfg.max) : fallback;
                slider.value = String(normalized);
                valueEl.textContent = cfg.digits > 0 ? normalized.toFixed(cfg.digits) : String(Math.round(normalized));
            });

            checkboxConfigs.forEach((cfg) => {
                const box = document.querySelector(`#${cfg.id}`);
                if (!box) return;
                box.checked = !!openai[cfg.key];
            });
        };

        let samplingSyncTimer = null;
        const scheduleSamplingToJson = () => {
            if (!presetJsonEditor) return;
            if (samplingSyncTimer) clearTimeout(samplingSyncTimer);
            samplingSyncTimer = setTimeout(() => {
                const parsed = parsePresetEditorJson();
                if (!parsed) return;
                if (!parsed.openai || typeof parsed.openai !== 'object') parsed.openai = {};
                const openai = parsed.openai;

                sliderConfigs.forEach((cfg) => {
                    const slider = document.querySelector(`#${cfg.sliderId}`);
                    if (!slider) return;
                    const num = Number(slider.value);
                    if (Number.isFinite(num)) {
                        openai[cfg.key] = cfg.digits > 0 ? Number(num.toFixed(cfg.digits)) : Math.round(num);
                    }
                });
                checkboxConfigs.forEach((cfg) => {
                    const box = document.querySelector(`#${cfg.id}`);
                    if (!box) return;
                    openai[cfg.key] = !!box.checked;
                });

                writePresetEditorJson(parsed);
            }, 80);
        };

        sliderConfigs.forEach((cfg) => {
            const slider = document.querySelector(`#${cfg.sliderId}`);
            const valueEl = document.querySelector(`#${cfg.valueId}`);
            if (!slider || !valueEl) return;
            slider.addEventListener('input', () => {
                const num = Number(slider.value || 0);
                valueEl.textContent = cfg.digits > 0 ? num.toFixed(cfg.digits) : String(Math.round(num));
                scheduleSamplingToJson();
            });
            slider.addEventListener('change', scheduleSamplingToJson);
        });
        checkboxConfigs.forEach((cfg) => {
            const box = document.querySelector(`#${cfg.id}`);
            if (!box) return;
            box.addEventListener('change', scheduleSamplingToJson);
        });
        if (presetJsonEditor) {
            presetJsonEditor.addEventListener('change', applySamplingFromJson);
            applySamplingFromJson();
        }

        const presetEditorForm = document.querySelector('#preset-editor-form');
        const presetFileHiddenInput = presetEditorForm?.querySelector('input[name="presetFile"]');
        const presetNameField = presetEditorForm?.querySelector('[name="presetName"]');
        const fileChip = document.querySelector('.preset-stat-chip.hint');
        const openDeletePresetDialogBtn = document.querySelector('#open-delete-preset-dialog');
        const openRestorePresetDialogBtn = document.querySelector('#open-restore-preset-dialog');
        const deletePresetDialog = document.querySelector('#delete-preset-confirm-dialog');
        const restorePresetDialog = document.querySelector('#restore-preset-confirm-dialog');
        const confirmDeletePresetBtn = document.querySelector('#confirm-delete-preset-btn');
        const confirmRestorePresetBtn = document.querySelector('#confirm-restore-preset-btn');

        const encodeFormBody = (obj) => {
            const params = new URLSearchParams();
            Object.entries(obj).forEach(([k, v]) => params.set(k, String(v ?? '')));
            return params.toString();
        };

        const getCurrentPresetMeta = () => ({
            apiId: 'api',
            presetFile: String(presetFileHiddenInput?.value || '').trim(),
        });

        const renderPresetEmptyState = () => {
            const main = document.querySelector('.presets-main');
            if (!main) return;
            main.innerHTML = `
                <div class="empty-state">
                    <mdui-icon name="settings_input_component"></mdui-icon>
                    <p>${__('presets.select_preset_hint')}</p>
                </div>
            `;
        };

        if (presetEditorForm && presetJsonEditor) {
            const submitPresetForm = async (event) => {
                if (event) event.preventDefault();
                
                // Force sync prompt UI state into JSON before reading form
                if (typeof syncPromptUiToJson === 'function') {
                    syncPromptUiToJson();
                }
                
                const formData = new FormData(presetEditorForm);
                const payload = Object.fromEntries(formData.entries());
                try {
                    const res = await fetch('/presets/save', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            Accept: 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        body: encodeFormBody(payload),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) {
                        window.showSnackbar(data.error || __('common.save_failed'), "error");
                        return;
                    }
                    updatePresetSelectorOptions(data.presets || [], data.selectedFile || payload.presetFile);
                    if (presetFileHiddenInput) presetFileHiddenInput.value = String(data.selectedFile || payload.presetFile || '');
                    if (fileChip) fileChip.textContent = String(data.selectedFile || payload.presetFile || '');
                    if (presetNameField && data.saved?.displayName) presetNameField.value = data.saved.displayName;
                    const nextUrl = `/presets?preset=${encodeURIComponent(data.selectedFile || payload.presetFile || '')}`;
                    window.history.replaceState(null, '', nextUrl);
                    window.showSnackbar(data.message || __('presets.save_success'), "success");
                } catch {
                    window.showSnackbar(__('common.network_error'), "error");
                }
            };
            
            presetEditorForm.addEventListener('submit', submitPresetForm);
            
            // Also wire up the save button click as a fallback for mdui-button shadow DOM edge cases
            const presetSaveBtn = document.querySelector('#preset-save-btn');
            if (presetSaveBtn) {
                presetSaveBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    submitPresetForm(event);
                });
            }

        }
        
        if (openDeletePresetDialogBtn && deletePresetDialog) {
            openDeletePresetDialogBtn.onclick = () => { deletePresetDialog.open = true; };
        }
        if (openRestorePresetDialogBtn && restorePresetDialog) {
            openRestorePresetDialogBtn.onclick = () => { restorePresetDialog.open = true; };
        }

        if (confirmRestorePresetBtn) {
            confirmRestorePresetBtn.onclick = async () => {
                const meta = getCurrentPresetMeta();
                if (!meta.presetFile) return;
                try {
                    const res = await fetch('/presets/restore', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            Accept: 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        body: encodeFormBody(meta),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) {
                        window.showSnackbar(data.error || __('presets.restore_failed'), "error");
                        return;
                    }
                    if (restorePresetDialog) restorePresetDialog.open = false;
                    if (presetJsonEditor && data.preset?.jsonText) {
                        presetJsonEditor.value = String(data.preset.jsonText || '');
                        presetJsonEditor.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    if (presetNameField && data.preset?.displayName) presetNameField.value = data.preset.displayName;
                    updatePresetSelectorOptions(data.presets || [], data.selectedFile || meta.presetFile);
                    if (presetFileHiddenInput) presetFileHiddenInput.value = String(data.selectedFile || meta.presetFile);
                    if (fileChip) fileChip.textContent = String(data.selectedFile || meta.presetFile);
                    const nextUrl = `/presets?preset=${encodeURIComponent(data.selectedFile || meta.presetFile)}`;
                    window.history.replaceState(null, '', nextUrl);
                    window.showSnackbar(data.message || __('presets.restore_success'), "success");
                } catch {
                    window.showSnackbar(__('common.network_error'), "error");
                }
            };
        }

        if (confirmDeletePresetBtn) {
            confirmDeletePresetBtn.onclick = async () => {
                const meta = getCurrentPresetMeta();
                if (!meta.presetFile) return;
                try {
                    const res = await fetch('/presets/delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            Accept: 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        body: encodeFormBody(meta),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) {
                        window.showSnackbar(data.error || __('presets.delete_failed'), "error");
                        return;
                    }
                    if (deletePresetDialog) deletePresetDialog.open = false;
                    updatePresetSelectorOptions(data.presets || [], '');
                    if (presetFileHiddenInput) presetFileHiddenInput.value = '';
                    window.history.replaceState(null, '', '/presets');
                    renderPresetEmptyState();
                    window.showSnackbar(data.message || __('presets.delete_success'), "success");
                } catch {
                    window.showSnackbar(__('common.network_error'), "error");
                }
            };
        }

        const promptContainer = document.querySelector('#ui-prompt-collapse-container');
        const enabledStatsChip = document.querySelector('.preset-stat-chip.on');
        let syncPromptUiToJson = null; // hoisted so save handler can call it
        if (presetJsonEditor && promptContainer) {
            let applyingPromptUiToJson = false;
            let promptSyncTimer = null;
            let promptsLoaded = !!promptContainer.querySelector('[data-prompt-item]');
            const deferredNotice = promptContainer.querySelector('[data-prompts-deferred="1"]');

            const escapeHtml = (value) => String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

            const parsePresetJson = () => {
                try {
                    const valueText = String(presetJsonEditor.value || '').trim();
                    const fallbackText = String(presetJsonEditor.textContent || '').trim();
                    const sourceText = valueText || fallbackText || '{}';
                    return JSON.parse(sourceText);
                } catch (error) {
                    return null;
                }
            };

            const ensurePromptOrderTarget = (openai) => {
                if (!Array.isArray(openai.prompt_order)) {
                    openai.prompt_order = [];
                }
                let target = openai.prompt_order.find((item) => Number(item?.character_id) === 100000 && Array.isArray(item?.order));
                if (!target) {
                    target = openai.prompt_order.find((item) => Array.isArray(item?.order));
                }
                if (!target) {
                    target = { character_id: 100000, order: [] };
                    openai.prompt_order.push(target);
                }
                if (!Array.isArray(target.order)) {
                    target.order = [];
                }
                return target;
            };

            const resolveEnabledMap = (openai) => {
                const target = ensurePromptOrderTarget(openai);
                const map = new Map();
                target.order.forEach((item) => {
                    const identifier = String(item?.identifier || '').trim();
                    if (!identifier) return;
                    map.set(identifier, !!item.enabled);
                });
                return map;
            };

            const updateStatsChip = (items) => {
                if (!enabledStatsChip) return;
                const total = items.length;
                const enabled = items.filter((item) => item.enabled).length;
                if (total === 0) return; // Don't overwrite server stats if we have no items to count
                enabledStatsChip.textContent = __('presets.enabled_count', { enabled, total });
            };

            const updatePromptItemVisual = (itemEl) => {
                if (!itemEl) return;
                const enabled = !!itemEl.querySelector('[data-prompt-enabled]')?.checked;
                itemEl.classList.toggle('disabled', !enabled);
            };

            const updateStatsFromDom = () => {
                const items = Array.from(promptContainer.querySelectorAll('[data-prompt-item]'));
                updateStatsChip(items.map((itemEl) => ({
                    enabled: !!itemEl.querySelector('[data-prompt-enabled]')?.checked,
                })));
            };

            const renderPromptItems = () => {
                if (applyingPromptUiToJson) return;
                const parsed = parsePresetJson();
                if (!parsed) {
                    promptContainer.innerHTML = `
                        <div class="error-msg">
                            <mdui-icon name="error"></mdui-icon>
                            <p>${__('presets.parse_error')}</p>
                        </div>
                    `;
                    return;
                }

                const openai = (parsed.openai && typeof parsed.openai === 'object') ? parsed.openai : {};
                const prompts = Array.isArray(openai.prompts) ? openai.prompts : [];
                const orderTarget = ensurePromptOrderTarget(openai);
                const orderList = Array.isArray(orderTarget?.order) ? orderTarget.order : [];
                const indexByIdentifier = new Map();
                prompts.forEach((prompt, index) => {
                    const identifier = String(prompt?.identifier || '').trim();
                    if (!identifier || indexByIdentifier.has(identifier)) return;
                    indexByIdentifier.set(identifier, index);
                });
                const orderedIndexes = [];
                const seenIndexes = new Set();
                orderList.forEach((item) => {
                    const identifier = String(item?.identifier || '').trim();
                    if (!identifier) return;
                    const promptIndex = indexByIdentifier.get(identifier);
                    if (!Number.isInteger(promptIndex) || seenIndexes.has(promptIndex)) return;
                    seenIndexes.add(promptIndex);
                    orderedIndexes.push(promptIndex);
                });
                prompts.forEach((_prompt, index) => {
                    if (seenIndexes.has(index)) return;
                    orderedIndexes.push(index);
                });
                const enabledMap = resolveEnabledMap(openai);
                const items = orderedIndexes.map((index) => {
                    const prompt = prompts[index] || {};
                    const identifier = String(prompt?.identifier || `prompt_${index + 1}`).trim();
                    const title = String(prompt?.name || identifier || `Prompt ${index + 1}`).trim();
                    const role = String(prompt?.role || (prompt?.system_prompt ? 'system' : 'assistant')).trim() || 'assistant';
                    const enabled = typeof prompt?.enabled === 'boolean'
                        ? !!prompt.enabled
                        : (enabledMap.has(identifier) ? !!enabledMap.get(identifier) : true);
                    return {
                        index,
                        identifier,
                        title,
                        role,
                        enabled,
                        content: String(prompt?.content || ''),
                        marker: !!prompt?.marker,
                    };
                });

                updateStatsChip(items);

                if (!items.length) {
                    promptContainer.innerHTML = `
                        <div class="empty-msg">
                            <mdui-icon name="inbox"></mdui-icon>
                            <p>${__('presets.no_prompts')}</p>
                        </div>
                    `;
                    return;
                }

                promptContainer.innerHTML = items.map((item, idx) => `
                    <article class="prompt-collapse-item ${item.enabled ? '' : 'disabled'}" data-prompt-item data-prompt-index="${item.index}" data-prompt-identifier="${escapeHtml(item.identifier)}" draggable="true">
                        <header class="prompt-collapse-header" data-prompt-toggle>
                            <mdui-switch class="prompt-enabled-toggle" data-prompt-enabled ${item.enabled ? 'checked' : ''}></mdui-switch>
                            <div class="prompt-collapse-title-box">
                                <span class="prompt-role-tag role-${escapeHtml(item.role)}">${escapeHtml(item.role.toUpperCase())}</span>
                                <span class="prompt-name-text">${escapeHtml(item.title)}</span>
                                <span class="id-badge">${escapeHtml(item.identifier || `prompt_${item.index + 1}`)}</span>
                                ${item.marker ? '<span class="marker-badge">MARKER</span>' : ''}
                            </div>
                            <div class="prompt-item-actions">
                                <mdui-button-icon data-move-up data-move-idx="${idx}" icon="arrow_upward" title="${__('presets.move_up')}"></mdui-button-icon>
                                <mdui-button-icon data-move-down data-move-idx="${idx}" icon="arrow_downward" title="${__('presets.move_down')}"></mdui-button-icon>
                                <mdui-button-icon data-delete-entry data-delete-idx="${idx}" icon="delete" title="${__('presets.delete_entry')}" style="color:rgb(var(--mdui-color-error));"></mdui-button-icon>
                            </div>
                            <mdui-icon class="expand-icon" name="expand_more"></mdui-icon>
                        </header>
                        <div class="prompt-collapse-content">
                            <mdui-select data-prompt-role label="${__('presets.role')}" value="${escapeHtml(item.role)}">
                                <mdui-menu-item value="system">system</mdui-menu-item>
                                <mdui-menu-item value="user">user</mdui-menu-item>
                                <mdui-menu-item value="assistant">assistant</mdui-menu-item>
                            </mdui-select>
                            <textarea class="prompt-content-edit" data-prompt-content rows="6" placeholder="${__('presets.input_prompt_placeholder')}">${escapeHtml(item.content)}</textarea>
                        </div>
                    </article>
                `).join('');
                promptsLoaded = true;
            };

            syncPromptUiToJson = () => {
                const parsed = parsePresetJson();
                if (!parsed) {
                    return;
                }
                if (!parsed.openai || typeof parsed.openai !== 'object') {
                    parsed.openai = {};
                }
                const openai = parsed.openai;
                if (!Array.isArray(openai.prompts)) {
                    openai.prompts = [];
                }
                const promptOrderTarget = ensurePromptOrderTarget(openai);
                const orderMap = new Map();
                promptOrderTarget.order.forEach((item) => {
                    const identifier = String(item?.identifier || '').trim();
                    if (!identifier) return;
                    orderMap.set(identifier, item);
                });

                const promptItems = promptContainer.querySelectorAll('[data-prompt-item]');
                const orderedPromptOrder = [];
                promptItems.forEach((itemEl) => {
                    const promptIndex = Number(itemEl.getAttribute('data-prompt-index'));
                    if (!Number.isInteger(promptIndex) || promptIndex < 0 || !openai.prompts[promptIndex]) {
                        return;
                    }
                    const prompt = openai.prompts[promptIndex];
                    const identifier = String(prompt?.identifier || itemEl.getAttribute('data-prompt-identifier') || '').trim();
                    const enabled = !!itemEl.querySelector('[data-prompt-enabled]')?.checked;
                    const role = String(itemEl.querySelector('[data-prompt-role]')?.value || 'assistant').trim() || 'assistant';
                    const content = String(itemEl.querySelector('[data-prompt-content]')?.value || '');

                    prompt.enabled = enabled;
                    prompt.role = role;
                    prompt.content = content;

                    if (identifier) {
                        const orderItem = orderMap.get(identifier) || { identifier, enabled: true };
                        orderItem.enabled = enabled;
                        orderMap.set(identifier, orderItem);
                        orderedPromptOrder.push(orderItem);
                    }
                });
                promptOrderTarget.order = orderedPromptOrder.length ? orderedPromptOrder : Array.from(orderMap.values());

                applyingPromptUiToJson = true;
                presetJsonEditor.value = JSON.stringify(parsed, null, 2);
                applyingPromptUiToJson = false;
            };

            const schedulePromptSync = () => {
                if (promptSyncTimer) {
                    clearTimeout(promptSyncTimer);
                }
                promptSyncTimer = setTimeout(() => {
                    promptSyncTimer = null;
                    syncPromptUiToJson();
                }, 120);
            };

            const addEntryDialog = document.querySelector('#add-prompt-entry-dialog');
            const confirmAddEntryBtn = document.querySelector('#confirm-add-entry-btn');
            const deleteEntryDialog = document.querySelector('#delete-entry-confirm-dialog');
            const deleteEntryNameDisplay = document.querySelector('#delete-entry-name-display');
            const confirmDeleteEntryBtn = document.querySelector('#confirm-delete-entry-btn');
            let pendingDeleteEntryIdx = -1;

            const reorderPromptOrder = (fromIdx, toIdx) => {
                const parsed = parsePresetJson();
                if (!parsed) return;
                const openai = (parsed.openai && typeof parsed.openai === 'object') ? parsed.openai : {};
                const orderTarget = ensurePromptOrderTarget(openai);
                const orderList = Array.isArray(orderTarget.order) ? orderTarget.order : [];
                orderTarget.order = orderList;

                if (fromIdx < 0 || fromIdx >= orderList.length || toIdx < 0 || toIdx >= orderList.length) return;
                if (fromIdx === toIdx) return;

                const moved = orderList.splice(fromIdx, 1)[0];
                orderList.splice(toIdx, 0, moved);

                applyingPromptUiToJson = true;
                presetJsonEditor.value = JSON.stringify(parsed, null, 2);
                applyingPromptUiToJson = false;
                renderPromptItems();
            };

            const movePromptEntry = (fromIdx, toIdx) => {
                reorderPromptOrder(fromIdx, toIdx);
            };

            if (addEntryDialog && confirmAddEntryBtn) {
                confirmAddEntryBtn.addEventListener('click', () => {
                    const identifier = String(document.querySelector('#new-entry-identifier')?.value || '').trim();
                    if (!identifier) { window.showSnackbar(__('presets.entry_identifier_required'), 'error'); return; }

                    const name = String(document.querySelector('#new-entry-name')?.value || '').trim() || identifier;
                    const role = String(document.querySelector('#new-entry-role')?.value || 'system').trim() || 'system';
                    const content = String(document.querySelector('#new-entry-content')?.value || '').trim();

                    const parsed = parsePresetJson();
                    if (!parsed) { window.showSnackbar(__('presets.parse_error'), 'error'); return; }

                    const openai = (parsed.openai && typeof parsed.openai === 'object') ? parsed.openai : {};
                    if (!Array.isArray(openai.prompts)) openai.prompts = [];
                    parsed.openai = openai;

                    if (openai.prompts.some((p) => String(p?.identifier || '').trim() === identifier)) {
                        window.showSnackbar(__('presets.entry_identifier_duplicate', { identifier }), 'error');
                        return;
                    }

                    const newPrompt = {
                        name,
                        system_prompt: true,
                        role,
                        content,
                        identifier,
                    };
                    openai.prompts.push(newPrompt);

                    const orderTarget = ensurePromptOrderTarget(openai);
                    if (!Array.isArray(orderTarget.order)) orderTarget.order = [];
                    if (!orderTarget.order.some((o) => String(o?.identifier || '').trim() === identifier)) {
                        orderTarget.order.push({ identifier, enabled: true });
                    }

                    applyingPromptUiToJson = true;
                    presetJsonEditor.value = JSON.stringify(parsed, null, 2);
                    applyingPromptUiToJson = false;

                    addEntryDialog.open = false;
                    document.querySelector('#new-entry-identifier').value = '';
                    document.querySelector('#new-entry-name').value = '';
                    document.querySelector('#new-entry-content').value = '';
                    renderPromptItems();
                    updatePromptCountBadge(openai.prompts.length);
                    window.showSnackbar(__('presets.entry_added', { name }), 'success');
                });
            }

            const updatePromptCountBadge = (count) => {
                const chip = document.querySelector('.preset-stat-chip.on');
                if (!chip || !promptContainer) return;
                const items = promptContainer.querySelectorAll('[data-prompt-item]');
                const enabled = Array.from(items).filter((el) => el.querySelector('[data-prompt-enabled]')?.checked).length;
                chip.textContent = `${enabled}/${count}`;
            };

            if (confirmDeleteEntryBtn) {
                confirmDeleteEntryBtn.addEventListener('click', () => {
                    if (!Number.isInteger(pendingDeleteEntryIdx) || pendingDeleteEntryIdx < 0) return;

                    const parsed = parsePresetJson();
                    if (!parsed) { window.showSnackbar(__('presets.parse_error'), 'error'); return; }

                    const openai = (parsed.openai && typeof parsed.openai === 'object') ? parsed.openai : {};
                    if (!Array.isArray(openai.prompts)) openai.prompts = [];
                    parsed.openai = openai;

                    const allItems = promptContainer.querySelectorAll('[data-prompt-item]');
                    const targetEl = allItems[pendingDeleteEntryIdx];
                    if (!targetEl) { deleteEntryDialog.open = false; pendingDeleteEntryIdx = -1; return; }

                    const promptIdx = Number(targetEl.getAttribute('data-prompt-index'));
                    const identifier = String(targetEl.getAttribute('data-prompt-identifier') || '').trim();

                    if (Number.isInteger(promptIdx) && promptIdx >= 0 && promptIdx < openai.prompts.length) {
                        openai.prompts.splice(promptIdx, 1);
                    }

                    const orderTarget = ensurePromptOrderTarget(openai);
                    if (Array.isArray(orderTarget.order) && identifier) {
                        orderTarget.order = orderTarget.order.filter((o) => String(o?.identifier || '').trim() !== identifier);
                    }

                    applyingPromptUiToJson = true;
                    presetJsonEditor.value = JSON.stringify(parsed, null, 2);
                    applyingPromptUiToJson = false;

                    deleteEntryDialog.open = false;
                    pendingDeleteEntryIdx = -1;
                    renderPromptItems();
                    window.showSnackbar(__('presets.entry_deleted'), 'success');
                });
            }

            promptContainer.addEventListener('click', (event) => {
                const loadBtn = event.target.closest('#load-prompts-now');
                if (loadBtn) {
                    renderPromptItems();
                    return;
                }
                const moveUpBtn = event.target.closest('[data-move-up]');
                if (moveUpBtn) {
                    event.stopPropagation();
                    const idx = Number(moveUpBtn.getAttribute('data-move-idx'));
                    if (Number.isInteger(idx) && idx > 0) {
                        movePromptEntry(idx, idx - 1);
                    }
                    return;
                }
                const moveDownBtn = event.target.closest('[data-move-down]');
                if (moveDownBtn) {
                    event.stopPropagation();
                    const allItems = promptContainer.querySelectorAll('[data-prompt-item]');
                    const idx = Number(moveDownBtn.getAttribute('data-move-idx'));
                    if (Number.isInteger(idx) && idx < allItems.length - 1) {
                        movePromptEntry(idx, idx + 1);
                    }
                    return;
                }
                const deleteEntryBtn = event.target.closest('[data-delete-entry]');
                if (deleteEntryBtn) {
                    event.stopPropagation();
                    const idx = Number(deleteEntryBtn.getAttribute('data-delete-idx'));
                    const itemEl = deleteEntryBtn.closest('[data-prompt-item]');
                    const identifier = String(itemEl?.getAttribute('data-prompt-identifier') || '').trim();
                    const nameText = itemEl?.querySelector('.prompt-name-text')?.textContent || identifier || idx;
                    deleteEntryDialog.open = true;
                    deleteEntryNameDisplay.textContent = `"${nameText}" (${identifier || `#${idx}`})`;
                    pendingDeleteEntryIdx = idx;
                    return;
                }
                const header = event.target.closest('[data-prompt-toggle]');
                if (!header) {
                    return;
                }
                if (event.target.closest('mdui-switch') || event.target.closest('mdui-select') || event.target.closest('textarea')) {
                    return;
                }
                const item = header.closest('[data-prompt-item]');
                if (!item) {
                    return;
                }
                item.classList.toggle('open');
            });

            promptContainer.addEventListener('change', (event) => {
                if (!event.target.closest('[data-prompt-item]')) {
                    return;
                }
                const item = event.target.closest('[data-prompt-item]');
                updatePromptItemVisual(item);
                updateStatsFromDom();
                syncPromptUiToJson();
            });

            promptContainer.addEventListener('input', (event) => {
                if (!event.target.closest('[data-prompt-item]')) {
                    return;
                }
                schedulePromptSync();
            });

            const addPromptEntryBtn = document.querySelector('#add-prompt-entry-btn');
            if (addPromptEntryBtn && addEntryDialog) {
                addPromptEntryBtn.addEventListener('click', () => { addEntryDialog.open = true; });
            }

            let dragSourceIdx = -1;
            promptContainer.addEventListener('dragstart', (event) => {
                const item = event.target.closest('[data-prompt-item]');
                if (!item) return;
                const allItems = promptContainer.querySelectorAll('[data-prompt-item]');
                dragSourceIdx = Array.from(allItems).indexOf(item);
                item.classList.add('dragging');
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(dragSourceIdx));
            });
            promptContainer.addEventListener('dragend', (event) => {
                const item = event.target.closest('[data-prompt-item]');
                if (item) item.classList.remove('dragging');
                promptContainer.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
                dragSourceIdx = -1;
            });
            promptContainer.addEventListener('dragover', (event) => {
                event.preventDefault();
                const item = event.target.closest('[data-prompt-item]');
                if (!item) return;
                event.dataTransfer.dropEffect = 'move';
                promptContainer.querySelectorAll('.drag-over').forEach((el) => {
                    if (el !== item) el.classList.remove('drag-over');
                });
                item.classList.add('drag-over');
            });
            promptContainer.addEventListener('drop', (event) => {
                event.preventDefault();
                const targetItem = event.target.closest('[data-prompt-item]');
                if (!targetItem || dragSourceIdx < 0) return;
                const allItems = promptContainer.querySelectorAll('[data-prompt-item]');
                const targetIdx = Array.from(allItems).indexOf(targetItem);
                targetItem.classList.remove('drag-over');
                if (dragSourceIdx !== targetIdx && targetIdx >= 0) {
                    reorderPromptOrder(dragSourceIdx, targetIdx);
                }
                dragSourceIdx = -1;
            });

            presetJsonEditor.addEventListener('input', renderPromptItems);
            presetJsonEditor.addEventListener('change', renderPromptItems);
            if (promptsLoaded) {
                updateStatsFromDom();
            } else if (!deferredNotice) {
                renderPromptItems();
                setTimeout(renderPromptItems, 0);
            } else {
                const tabsRoot = document.querySelector('.preset-editor-tabs');
                const tryLoadPrompts = () => {
                    if (promptsLoaded) return;
                    renderPromptItems();
                };
                const promptsTab = document.querySelector('mdui-tab[value="tab-prompts"]');
                if (promptsTab) promptsTab.addEventListener('click', tryLoadPrompts);
                if (tabsRoot) {
                    tabsRoot.addEventListener('change', (event) => {
                        const value = String(event?.target?.value || event?.detail?.value || '').trim();
                        if (value === 'tab-prompts') {
                            tryLoadPrompts();
                        }
                    });
                }
            }
        }

        if (presetSelector) {
            presetSelector.addEventListener('change', async () => {
                const preset = String(presetSelector.value || '').trim();
                if (!preset) {
                    Turbo.visit('/presets', { action: 'replace' });
                    return;
                }
                
                try {
                    window.showSnackbar(__('presets.loading') || 'Loading...', 'info');
                    const res = await fetch(`/api/presets/detail/${encodeURIComponent(preset)}?type=api`);
                    const data = await res.json();
                    if (!data.ok) throw new Error(data.error);
                    
                    // Smoothly update the workspace
                    const editorForm = document.querySelector('#preset-editor-form');
                    const emptyState = document.querySelector('.presets-main .empty-state');
                    
                    if (emptyState) {
                        // If we were in empty state, we need a full refresh or we have to build the form
                        // For simplicity, if we go from nothing to something, use Turbo once
                        Turbo.visit(`/presets?preset=${encodeURIComponent(preset)}`, { action: 'replace' });
                        return;
                    }
                    
                    if (editorForm) {
                        const jsonEditor = document.querySelector('#preset-json-editor');
                        const nameField = editorForm.querySelector('[name="presetName"]');
                        const fileHidden = editorForm.querySelector('input[name="presetFile"]');
                        const fileChip = document.querySelector('.preset-stat-chip.file');
                        
                        if (jsonEditor) jsonEditor.value = data.preset.jsonText;
                        if (nameField) nameField.value = data.preset.displayName;
                        if (fileHidden) fileHidden.value = data.preset.fileName;
                        if (fileChip) fileChip.textContent = data.preset.fileName;
                        
                        // Re-trigger all reactive logic
                        if (typeof applySamplingFromJson === 'function') applySamplingFromJson();
                        
                        // Force prompts to reload and animate
                        const promptContainer = document.querySelector('#ui-prompt-collapse-container');
                        if (promptContainer) {
                            promptContainer.innerHTML = ''; // Clear to force fresh staggered animation
                            if (typeof renderPromptItems === 'function') renderPromptItems();
                        }
                        
                        const nextUrl = `/presets?preset=${encodeURIComponent(preset)}`;
                        window.history.replaceState(null, '', nextUrl);
                        window.showSnackbar(__('presets.loaded') || 'Preset loaded', 'success');
                    }
                } catch (err) {
                    window.showSnackbar(err.message, 'error');
                }
            });
        }
        const editRoomWorldBook = document.querySelector('#edit-room-worldbook');
        if (editRoomWorldBook) {
            editRoomWorldBook.addEventListener('change', async () => {
                const worldBookFile = editRoomWorldBook.value;
                try {
                    const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/worldbook`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ worldBookFile }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                        window.showSnackbar(__('room.worldbook_switched') || 'World book switched', 'success');
                        if (!isWsConnected) fetchRoomState();
                    } else {
                        window.showSnackbar(data.error || __('room.switch_failed'), 'error');
                    }
                } catch {
                    window.showSnackbar(__('common.network_error'), 'error');
                }
            });
        }
    }

    function initApiConfigPage() {
        const dialog = document.querySelector('#api-profile-dialog');
        if (!dialog) return;

        const escapeHtml = (v) => String(v || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        const $ = (id) => document.querySelector(id);
        const setVal = (id, val) => { const el = $(id); if (el) el.value = String(val || ''); };

        // ---- Internal state ----
        let allModels = [];

        // ---- Helper: SPA refresh ----
        const spaRefresh = () => {
            if (window.Turbo) {
                Turbo.visit(window.location.href, { action: 'replace' });
            } else {
                window.location.reload();
            }
        };

        // ---- Helper: format auto-fill base url ----
        const normalizeUrl = (url, format) => {
            let u = (url || '').trim().replace(/\/+$/, '');
            if (format === 'gemini') {
                if (!u.includes('/v1') && !u.includes('/v1beta')) u += '/v1beta';
            }
            return u;
        };

        // ---- Open create dialog ----
        ['#open-create-api-dialog', '#open-create-api-dialog-empty'].forEach(sel => {
            const btn = $(sel);
            if (!btn) return;
            btn.addEventListener('click', () => {
                $('#api-profile-dialog-title').textContent = __('api.add_api_provider');
                setVal('#api-profile-id', '');
                setVal('#api-profile-name', '');
                setVal('#api-profile-format', 'openai');
                setVal('#api-profile-baseurl', 'https://api.openai.com/v1');
                setVal('#api-profile-apikey', '');
                setVal('#api-profile-model', '');
                hideTestResult();
                hideModelPanel();
                dialog.open = true;
            });
        });

        // ---- Open edit dialog ----
        document.querySelectorAll('.open-edit-api-dialog').forEach(btn => {
            btn.addEventListener('click', () => {
                $('#api-profile-dialog-title').textContent = __('api.edit_provider');
                setVal('#api-profile-id', btn.dataset.profileId);
                setVal('#api-profile-name', btn.dataset.profileName);
                setVal('#api-profile-format', btn.dataset.profileFormat);
                setVal('#api-profile-baseurl', btn.dataset.profileBaseurl);
                setVal('#api-profile-apikey', btn.dataset.profileApikey);
                setVal('#api-profile-model', btn.dataset.profileModel);
                hideTestResult();
                hideModelPanel();
                dialog.open = true;
            });
        });

        // ---- Save via AJAX ----
        const saveBtn = $('#api-profile-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const profileId = String($('#api-profile-id')?.value || '').trim();
                const action = 'save_profile';
                saveBtn.loading = true;
                try {
                    const res = await fetch('/api-config', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        body: new URLSearchParams({
                            action,
                            profileId,
                            profileName: String($('#api-profile-name')?.value || '').trim(),
                            profileFormat: String($('#api-profile-format')?.value || 'openai').trim(),
                            profileBaseUrl: String($('#api-profile-baseurl')?.value || '').trim(),
                            profileApiKey: String($('#api-profile-apikey')?.value || '').trim(),
                            profileModel: String($('#api-profile-model')?.value || '').trim(),
                        }).toString(),
                    });
                    const data = await res.json();
                    if (!data.ok) {
                        window.showSnackbar(data.error || __('common.save_failed'), 'error');
                        return;
                    }
                    dialog.open = false;
                    window.showSnackbar(__('api.node_saved'), 'success');
                    spaRefresh();
                } catch {
                    window.showSnackbar(__('common.network_error'), 'error');
                } finally {
                    saveBtn.loading = false;
                }
            });
        }

        // ---- Toggle API key visibility ----
        const toggleKeyBtn = $('#toggle-api-key-visibility');
        const apiKeyField = $('#api-profile-apikey');
        if (toggleKeyBtn && apiKeyField) {
            toggleKeyBtn.addEventListener('click', () => {
                const isPass = apiKeyField.type === 'password';
                apiKeyField.type = isPass ? 'text' : 'password';
                toggleKeyBtn.icon = isPass ? 'visibility' : 'visibility_off';
            });
        }

        // ---- Model panel helpers ----
        const modelPanel = $('#model-list-panel');
        const modelGrid = $('#model-list-grid');
        const modelInput = $('#api-profile-model');
        const modelSearchInput = $('#model-search-input');
        const modelCountLabel = $('#model-count-label');

        const hideModelPanel = () => {
            if (modelPanel) modelPanel.style.display = 'none';
            allModels = [];
        };

        const renderModelChips = (filter = '') => {
            if (!modelGrid) return;
            const q = filter.toLowerCase().trim();
            const filtered = q ? allModels.filter(m => m.toLowerCase().includes(q)) : allModels;
            if (modelCountLabel) modelCountLabel.textContent = __('api.x_models', { filtered: filtered.length, total: allModels.length });
            modelGrid.innerHTML = filtered.map(m => `
                <button type="button" class="api-model-chip${modelInput?.value === m ? ' selected' : ''}" data-model="${escapeHtml(m)}">${escapeHtml(m)}</button>
            `).join('');
            modelGrid.querySelectorAll('.api-model-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    if (modelInput) modelInput.value = chip.dataset.model;
                    modelGrid.querySelectorAll('.api-model-chip').forEach(c => c.classList.remove('selected'));
                    chip.classList.add('selected');
                });
            });
        };

        if (modelSearchInput) {
            modelSearchInput.addEventListener('input', () => renderModelChips(modelSearchInput.value));
        }

        // ---- Fetch models button ----
        const fetchModelsBtn = $('#fetch-models-btn');
        if (fetchModelsBtn) {
            fetchModelsBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                let baseUrl = $('#api-profile-baseurl')?.value?.trim();
                const apiKey = $('#api-profile-apikey')?.value?.trim();
                const format = $('#api-profile-format')?.value;

                if (!baseUrl || !apiKey) {
                    window.showSnackbar(__('api.fill_base_url_key'), 'info');
                    return;
                }

                baseUrl = normalizeUrl(baseUrl, format);
                setVal('#api-profile-baseurl', baseUrl);

                fetchModelsBtn.loading = true;
                try {
                    const res = await fetch('/api/api-config/fetch-models', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ baseUrl, apiKey, format })
                    });
                    const data = await res.json();
                    if (!data.ok) {
                        window.showSnackbar(data.error || __('api.fetch_models_failed'), 'error');
                        return;
                    }
                    if (!data.models || data.models.length === 0) {
                        window.showSnackbar(__('api.no_models'), 'info');
                        return;
                    }
                    allModels = data.models;
                    if (modelPanel) modelPanel.style.display = 'block';
                    if (modelSearchInput) modelSearchInput.value = '';
                    renderModelChips();
                    window.showSnackbar(__('api.fetch_models_success', { count: allModels.length }), 'success');
                } catch (err) {
                    window.showSnackbar(__('api.request_failed', { message: err.message }), 'error');
                } finally {
                    fetchModelsBtn.loading = false;
                }
            });
        }

        // ---- Test result helpers ----
        const testResultEl = $('#api-test-result');
        const hideTestResult = () => {
            if (testResultEl) { testResultEl.style.display = 'none'; testResultEl.className = 'api-test-result'; }
        };
        const showTestResult = (ok, html) => {
            if (!testResultEl) return;
            testResultEl.style.display = 'flex';
            testResultEl.className = `api-test-result ${ok ? 'success' : 'failure'}`;
            testResultEl.innerHTML = `<mdui-icon name="${ok ? 'check_circle' : 'error'}" style="font-size:18px;"></mdui-icon> ${html}`;
        };

        // ---- Test API button (inside dialog) ----
        const testApiBtn = $('#test-api-btn');
        if (testApiBtn) {
            testApiBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                let baseUrl = $('#api-profile-baseurl')?.value?.trim();
                const apiKey = $('#api-profile-apikey')?.value?.trim();
                const format = $('#api-profile-format')?.value;
                const model = $('#api-profile-model')?.value?.trim();

                if (!baseUrl || !apiKey || !model) {
                    window.showSnackbar(__('api.fill_all_fields'), 'info');
                    return;
                }

                baseUrl = normalizeUrl(baseUrl, format);
                setVal('#api-profile-baseurl', baseUrl);
                hideTestResult();
                testApiBtn.loading = true;

                try {
                    const startTime = Date.now();
                    const res = await fetch('/api/api-config/test-api', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ baseUrl, apiKey, format, model })
                    });
                    const latency = Date.now() - startTime;
                    const data = await res.json();
                    if (data.ok) {
                        showTestResult(true, __('api.connect_success_latency', { latency }));
                    } else {
                        showTestResult(false, data.error || __('api.connect_failed'));
                    }
                } catch (err) {
                    showTestResult(false, __('api.request_failed', { message: err.message }));
                } finally {
                    testApiBtn.loading = false;
                }
            });
        }

        // ---- Inline test buttons ----
        document.querySelectorAll('.inline-test-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const profileId = btn.dataset.profileId;
                if (!profileId) return;

                btn.loading = true;
                const card = btn.closest('.api-provider-card') || btn.closest('.api-provider-row');

                try {
                    const startTime = Date.now();
                    const res = await fetch('/api/api-config/test-profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ profileId })
                    });
                    const data = await res.json();
                    const latency = data.latency || (Date.now() - startTime);

                    const dot = card?.querySelector('.api-status-dot');
                    if (dot) {
                        dot.className = `api-status-dot api-status-dot-${data.ok ? 'green' : 'red'}`;
                        dot.title = data.ok ? __('api.online') : __('api.abnormal');
                    }

                    const latencyCell = document.querySelector(`#latency-${profileId}`);
                    if (latencyCell) {
                        if (data.ok) {
                            const cls = latency < 500 ? 'fast' : latency < 1500 ? 'mid' : 'slow';
                            latencyCell.innerHTML = `<span class="api-latency-badge api-latency-${cls}">${latency}ms</span>`;
                        } else {
                            latencyCell.innerHTML = '<span class="api-text-error">' + __('api.connect_failed') + '</span>';
                        }
                    }

                    const testedCell = document.querySelector(`#tested-at-${profileId}`);
                    if (testedCell && data.lastTestAt) {
                        const dateStr = new Date(data.lastTestAt).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
                        testedCell.textContent = dateStr;
                    }

                    if (data.ok) {
                        window.showSnackbar(__('api.test_success_latency', { latency }), 'success');
                    } else {
                        window.showSnackbar(__('api.test_failed_msg', { error: data.error }), 'error');
                    }
                } catch (err) {
                    window.showSnackbar(__('api.request_failed', { message: err.message }), 'error');
                } finally {
                    btn.loading = false;
                }
            });
        });

        // ---- Set default via AJAX ----
        document.querySelectorAll('.set-default-api-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const profileId = btn.dataset.profileId;
                if (!profileId) return;
                try {
                    const res = await fetch('/api-config', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        body: new URLSearchParams({ action: 'set_default_profile', profileId }).toString(),
                    });
                    const data = await res.json();
                    if (!data.ok) {
                        window.showSnackbar(data.error || __('common.error'), 'error');
                        return;
                    }
                    window.showSnackbar(__('api.switched_default'), 'success');
                    spaRefresh();
                } catch {
                    window.showSnackbar(__('common.network_error'), 'error');
                }
            });
        });

        // ---- Delete confirm dialog ----
        const deleteConfirmDialog = $('#delete-api-confirm-dialog');
        const deleteProfileIdInput = $('#delete-api-profile-id');
        const deleteConfirmText = $('#delete-api-confirm-text');
        document.querySelectorAll('.delete-api-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (deleteProfileIdInput) deleteProfileIdInput.value = btn.dataset.profileId;
                if (deleteConfirmText) deleteConfirmText.textContent = __('common.delete_node_confirm', { name: btn.dataset.profileName });
                if (deleteConfirmDialog) deleteConfirmDialog.open = true;
            });
        });

        // ---- Confirm delete via AJAX ----
        const confirmDeleteBtn = $('#confirm-delete-api-btn');
        if (confirmDeleteBtn && deleteProfileIdInput) {
            confirmDeleteBtn.addEventListener('click', async () => {
                const profileId = String(deleteProfileIdInput.value || '').trim();
                if (!profileId) return;
                confirmDeleteBtn.loading = true;
                try {
                    const res = await fetch('/api-config', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        body: new URLSearchParams({ action: 'delete_profile', profileId }).toString(),
                    });
                    const data = await res.json();
                    if (!data.ok) {
                        window.showSnackbar(data.error || __('common.error'), 'error');
                        return;
                    }
                    deleteConfirmDialog.open = false;
                    window.showSnackbar(__('api.node_deleted'), 'success');
                    spaRefresh();
                } catch {
                    window.showSnackbar(__('common.network_error'), 'error');
                } finally {
                    confirmDeleteBtn.loading = false;
                }
            });
        }
    }

    function initWorldBookPage() {
        const worldbookSelector = document.querySelector('#worldbook-selector');
        if (worldbookSelector) {
            worldbookSelector.addEventListener('change', (e) => {
                const selectedFile = e.target.value;
                if (window.Turbo) {
                    Turbo.visit(`/worldbooks?book=${encodeURIComponent(selectedFile)}`);
                } else {
                    window.location.href = `/worldbooks?book=${encodeURIComponent(selectedFile)}`;
                }
            });
        }

        const createDialog = document.querySelector('#create-worldbook-dialog');
        const openCreateDialog = document.querySelector('#open-create-worldbook-dialog');
        const createForm = document.querySelector('#create-worldbook-form');
        if (createDialog && openCreateDialog) {
            openCreateDialog.onclick = () => { createDialog.open = true; };
        }
        if (createForm && createDialog) {
            createForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const nameInput = createForm.querySelector('[name="worldBookName"]');
                const jsonInputText = createForm.querySelector('[name="worldBookJson"]');
                const worldBookName = nameInput ? nameInput.value.trim() : '';
                const worldBookJson = jsonInputText ? jsonInputText.value.trim() : '';

                if (!worldBookName) {
                    window.showSnackbar(__('worldbooks.name_empty') || 'Name cannot be empty', 'error');
                    return;
                }

                try {
                    const res = await fetch('/api/worldbooks/create', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ worldBookName, worldBookJson })
                    });
                    const data = await res.json();
                    if (data.ok) {
                        createDialog.open = false;
                        createForm.reset();
                        window.showSnackbar(__('worldbooks.create_success'), 'success');
                        
                        if (window.Turbo) {
                            Turbo.visit(`/worldbooks?book=${encodeURIComponent(data.fileName)}`);
                        } else {
                            window.location.href = `/worldbooks?book=${encodeURIComponent(data.fileName)}`;
                        }
                    } else {
                        window.showSnackbar(data.error || __('common.error'), 'error');
                    }
                } catch (err) {
                    window.showSnackbar(__('common.network_error'), 'error');
                }
            });
        }

        const tabs = document.querySelectorAll('.editor-tab[data-tab-target]');
        tabs.forEach((tab) => {
            tab.onclick = () => {
                const target = tab.getAttribute('data-tab-target');
                if (!target) return;
                tabs.forEach((t) => t.classList.remove('active'));
                document.querySelectorAll('.editor-panel[data-tab-panel]').forEach((p) => p.classList.remove('active'));
                tab.classList.add('active');
                const panel = document.querySelector(`.editor-panel[data-tab-panel="${target}"]`);
                if (panel) panel.classList.add('active');
            };
        });

        const syncWordCount = () => {
            document.querySelectorAll('[data-word-count]').forEach((el) => {
                const counter = el.closest('.wb-form-field')?.querySelector('.word-count-display');
                if (!counter) return;
                const text = String(el.value || '').trim();
                counter.textContent = String(text ? text.split(/\s+/).length : 0);
            });
        };
        document.querySelectorAll('[data-word-count]').forEach((el) => {
            el.addEventListener('input', syncWordCount);
        });
        syncWordCount();

        const saveFab = document.querySelector('#worldbook-save-fab');
        const editorForm = document.querySelector('#worldbook-editor-form');
        const jsonOutput = document.querySelector('#worldbook-json-output');
        const nameSource = document.querySelector('#worldbook-name-source');

        const parseBool = (value) => {
            if (value === 'true') return true;
            if (value === 'false') return false;
            return '';
        };

        const entryListRoot = document.querySelector('#worldbook-entry-list');
        const jsonPreview = document.querySelector('#worldbook-json-preview');
        const applyJsonBtn = document.querySelector('#worldbook-json-apply');
        let jsonPreviewDirty = false;

        const updateEntryBadges = (card) => {
            if (!card) return;
            const getVal = (f) => card.querySelector(`[data-field="${f}"]`)?.value || '';
            const comment = getVal('comment') || __('worldbooks.new_entry');
            const depth = getVal('depth') || '0';
            const prob = getVal('probability') || '0';
            const pos = Number(card.querySelector(`[data-field="position"]`)?.value || 2);
            card.setAttribute('data-position', String(pos));
            const posLabels = [
                __('worldbooks.position_before_char'),
                __('worldbooks.position_after_char'),
                __('worldbooks.position_depth'),
                __('worldbooks.position_an_top'),
                __('worldbooks.position_an_bottom')
            ];
            
            const commentEl = card.querySelector('[data-display-comment]');
            if (commentEl) commentEl.textContent = comment;
            const depthEl = card.querySelector('[data-display-depth]');
            if (depthEl) depthEl.textContent = depth;
            const probEl = card.querySelector('[data-display-probability]');
            if (probEl) probEl.textContent = prob + '%';
            const posEl = card.querySelector('[data-display-position]');
            if (posEl) posEl.textContent = posLabels[pos] || posLabels[2];

            const enabled = !!card.querySelector('[data-field="enabled"]')?.checked;
            card.classList.toggle('disabled', !enabled);
        };

        const createFallbackEntryCard = () => {
            const wrapper = document.createElement('article');
            wrapper.className = 'wb-entry prompt-collapse-item';
            wrapper.setAttribute('data-entry-card', '');
            wrapper.setAttribute('data-position', '2');
            wrapper.innerHTML = `
                <header class="wb-summary prompt-collapse-header" data-toggle-entry>
                    <mdui-switch class="prompt-enabled-toggle" data-field="enabled" checked></mdui-switch>
                    <div class="wb-header-title-box prompt-collapse-title-box">
                        <span class="prompt-role-tag role-assistant" data-display-position>${__('worldbooks.position_depth')}</span>
                        <span class="prompt-name-text" data-display-comment>${__('worldbooks.new_entry')}</span>
                        <span class="id-badge">Depth: <span data-display-depth>0</span></span>
                        <span class="marker-badge"><span data-display-probability>100%</span></span>
                    </div>

                    <div class="wb-header-right prompt-item-actions">
                        <mdui-button-icon type="button" data-action="duplicate" icon="content_copy" title="${__('worldbooks.duplicate')}"></mdui-button-icon>
                        <mdui-button-icon type="button" data-action="delete" icon="delete_outline" title="${__('common.delete')}" style="color:rgb(var(--mdui-color-error));"></mdui-button-icon>
                    </div>
                    <mdui-icon class="expand-icon" name="expand_more"></mdui-icon>
                </header>
                <div class="wb-content prompt-collapse-content">
                    <div class="wb-section">
                        <div class="wb-section-title"><mdui-icon name="tag"></mdui-icon> ${__('worldbooks.section_keywords')}</div>
                        <div class="wb-form-grid">
                            <div class="wb-form-field">
                                <label><mdui-icon name="vpn_key"></mdui-icon> ${__('worldbooks.primary_keys')}</label>
                                <input class="wb-input" data-field="keys" placeholder="${__('worldbooks.keys_placeholder')}">
                            </div>
                            <div class="wb-form-field">
                                <label><mdui-icon name="edit_note"></mdui-icon> ${__('worldbooks.entry_title_placeholder')}</label>
                                <input class="wb-input" data-field="comment" value="${__('worldbooks.new_entry')}" placeholder="${__('worldbooks.entry_title_placeholder')}">
                            </div>
                            <div class="wb-form-field">
                                <label><mdui-icon name="call_split"></mdui-icon> ${__('worldbooks.logic')}</label>
                                <select data-field="selectiveLogic" class="wb-select">
                                    <option value="0" selected>${__('worldbooks.logic_and_any')}</option>
                                    <option value="1">${__('worldbooks.logic_not_all')}</option>
                                    <option value="2">${__('worldbooks.logic_not_any')}</option>
                                    <option value="3">${__('worldbooks.logic_and_all')}</option>
                                </select>
                            </div>
                            <div class="wb-form-field">
                                <label><mdui-icon name="filter_alt"></mdui-icon> ${__('worldbooks.filter_expression')}</label>
                                <input class="wb-input" data-field="filterExpression" placeholder="${__('worldbooks.filter_placeholder')}">
                            </div>
                        </div>
                    </div>
                    <div class="wb-section">
                        <div class="wb-section-title"><mdui-icon name="manage_search"></mdui-icon> ${__('worldbooks.section_scan')}</div>
                        <div class="wb-form-grid compact">
                            <div class="wb-form-field">
                                <label>${__('worldbooks.select_label')}</label>
                                <select data-field="position" class="wb-select">
                                    <option value="0">${__('worldbooks.position_before_char')}</option>
                                    <option value="1">${__('worldbooks.position_after_char')}</option>
                                    <option value="2" selected>${__('worldbooks.position_depth')}</option>
                                    <option value="3">${__('worldbooks.position_an_top')}</option>
                                    <option value="4">${__('worldbooks.position_an_bottom')}</option>
                                </select>
                            </div>
                            <div class="wb-form-field">
                                <label>${__('worldbooks.depth')}</label>
                                <input class="wb-input" type="number" data-field="depth" value="0">
                            </div>
                            <div class="wb-form-field">
                                <label>${__('worldbooks.scan_depth')}</label>
                                <input class="wb-input" type="number" data-field="scanDepth" value="999">
                            </div>
                            <div class="wb-form-field">
                                <label>${__('worldbooks.probability')}</label>
                                <input class="wb-input" type="number" data-field="probability" value="100">
                            </div>
                            <div class="wb-form-field">
                                <label>${__('worldbooks.case_sensitive')}</label>
                                <select data-field="caseSensitive" class="wb-select">
                                    <option value="" selected>${__('worldbooks.default_option')}</option>
                                    <option value="true">${__('worldbooks.yes')}</option>
                                    <option value="false">${__('worldbooks.no')}</option>
                                </select>
                            </div>
                            <div class="wb-form-field">
                                <label>${__('worldbooks.match_whole_words')}</label>
                                <select data-field="matchWholeWords" class="wb-select">
                                    <option value="" selected>${__('worldbooks.default_option')}</option>
                                    <option value="true">${__('worldbooks.yes')}</option>
                                    <option value="false">${__('worldbooks.no')}</option>
                                </select>
                            </div>
                            <div class="wb-form-field">
                                <label>${__('worldbooks.group_scoring')}</label>
                                <select data-field="useGroupScoring" class="wb-select">
                                    <option value="" selected>${__('worldbooks.default_option')}</option>
                                    <option value="true">${__('worldbooks.yes')}</option>
                                    <option value="false">${__('worldbooks.no')}</option>
                                </select>
                            </div>
                            <div class="wb-form-field">
                                <label>${__('worldbooks.automation_id')}</label>
                                <input class="wb-input" data-field="automationId" placeholder="${__('worldbooks.automation_id')}">
                            </div>
                        </div>
                    </div>

                    <div class="wb-section">
                        <div class="wb-section-title"><mdui-icon name="article"></mdui-icon> ${__('worldbooks.section_content')}</div>
                        <div class="wb-form-grid">
                            <div class="wb-form-field full-width">
                                <textarea class="wb-textarea" data-field="content" data-word-count></textarea>
                                <div class="wb-word-counter">
                                    <mdui-icon name="text_fields"></mdui-icon>
                                    <span class="word-count-display">0</span> ${__('worldbooks.words')}
                                </div>
                            </div>
                        </div>
                        <div class="wb-checkbox-group" style="margin-top: 12px;">
                            <label class="wb-checkbox-item"><input type="checkbox" data-field="excludeRecursion"> <span>${__('worldbooks.exclude_recursion')}</span></label>
                            <label class="wb-checkbox-item"><input type="checkbox" data-field="delayUntilRecursion"> <span>${__('worldbooks.delay_recursion')}</span></label>
                            <label class="wb-checkbox-item"><input type="checkbox" data-field="preventRecursion"> <span>${__('worldbooks.prevent_recursion')}</span></label>
                            <label class="wb-checkbox-item"><input type="checkbox" data-field="ignoreBudget"> <span>${__('worldbooks.ignore_budget')}</span></label>
                        </div>
                    </div>

                    <div class="wb-section">
                        <div class="wb-section-title"><mdui-icon name="folder"></mdui-icon> ${__('worldbooks.section_groups')}</div>
                        <div class="wb-form-grid compact">
                            <div class="wb-form-field">
                                <label>${__('worldbooks.group_include')}</label>
                                <input class="wb-input" data-field="group" placeholder="${__('worldbooks.group_placeholder')}">
                            </div>
                            <div class="wb-form-field">
                                <label>${__('worldbooks.group_weight')}</label>
                                <input class="wb-input" type="number" data-field="groupWeight" value="100">
                            </div>
                            <div class="wb-form-field">
                                <label>${__('worldbooks.sticky')}</label>
                                <input class="wb-input" type="number" data-field="sticky" value="0">
                            </div>
                            <div class="wb-form-field">
                                <label>${__('worldbooks.cooldown')}</label>
                                <input class="wb-input" type="number" data-field="cooldown" value="0">
                            </div>
                            <div class="wb-form-field">
                                <label>${__('worldbooks.delay')}</label>
                                <input class="wb-input" type="number" data-field="delay" value="0">
                            </div>
                            <div class="wb-form-field" style="justify-content: flex-end;">
                                <label class="wb-checkbox-item" style="padding: 0; margin: 0;">
                                    <input type="checkbox" data-field="groupOverride">
                                    <span>${__('worldbooks.group_override')}</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="wb-section">
                        <div class="wb-section-title"><mdui-icon name="link"></mdui-icon> ${__('worldbooks.section_binding')}</div>
                        <div class="wb-form-grid wide">
                            <div class="wb-form-field">
                                <label>${__('worldbooks.character_binding')}</label>
                                <input class="wb-input" data-field="characterFilterText" placeholder="${__('worldbooks.binding_placeholder')}">
                            </div>
                            <div class="wb-form-field">
                                <label>${__('worldbooks.trigger_type')}</label>
                                <select data-field="triggerType" class="wb-select">
                                    <option value="" selected>${__('worldbooks.default_option')}</option>
                                    <option value="keyword">${__('worldbooks.keyword')}</option>
                                    <option value="manual">${__('worldbooks.manual')}</option>
                                </select>
                            </div>
                            <div class="wb-form-field" style="justify-content: flex-end;">
                                <label class="wb-checkbox-item" style="padding: 0; margin: 0;">
                                    <input type="checkbox" data-field="characterFilterExclude">
                                    <span>${__('worldbooks.bind_exclude')}</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            wrapper.classList.remove('open');
            return wrapper;
        };

        const getEntryCards = () => Array.from(document.querySelectorAll('[data-entry-card]'));

        const serializeEntryCard = (card, index) => {
            const q = (field) => card.querySelector(`[data-field="${field}"]`);
            const text = (field) => String(q(field)?.value || '').trim();
            const num = (field, fallback = 0) => {
                const v = Number(q(field)?.value);
                return Number.isFinite(v) ? v : fallback;
            };
            const checked = (field) => !!q(field)?.checked;
            return {
                uid: index,
                key: text('keys').split(',').map((item) => item.trim()).filter(Boolean),
                keysecondary: [],
                comment: text('comment'),
                content: text('content'),
                selectiveLogic: num('selectiveLogic', 0),
                order: 100 + index,
                disable: !checked('enabled'),
                position: num('position', 1),
                depth: num('depth', 0),
                probability: num('probability', 100),
                scanDepth: num('scanDepth', 999),
                caseSensitive: parseBool(String(q('caseSensitive')?.value ?? '')),
                matchWholeWords: parseBool(String(q('matchWholeWords')?.value ?? '')),
                useGroupScoring: parseBool(String(q('useGroupScoring')?.value ?? '')),
                automationId: text('automationId'),
                excludeRecursion: checked('excludeRecursion'),
                delayUntilRecursion: checked('delayUntilRecursion'),
                preventRecursion: checked('preventRecursion'),
                ignoreBudget: checked('ignoreBudget'),
                group: text('group'),
                groupOverride: checked('groupOverride'),
                groupWeight: num('groupWeight', 100),
                sticky: num('sticky', 0),
                cooldown: num('cooldown', 0),
                delay: num('delay', 0),
                characterFilter: {
                    names: text('characterFilterText').split(',').map((item) => item.trim()).filter(Boolean),
                    isExclude: checked('characterFilterExclude'),
                },
                extensions: {
                    filter: text('filterExpression'),
                    trigger_type: text('triggerType'),
                },
            };
        };

        const buildWorldBookJson = () => {
            const entries = {};
            getEntryCards().forEach((card, index) => {
                entries[String(index)] = serializeEntryCard(card, index);
            });
            return {
                name: String(nameSource?.value || '').trim() || 'Worldbook',
                entries,
            };
        };

        const setFieldValue = (card, field, value, type = 'text') => {
            const target = card.querySelector(`[data-field="${field}"]`);
            if (!target) return;
            if (type === 'checked') {
                target.checked = !!value;
                return;
            }
            target.value = value ?? '';
        };

        const fillEntryCardFromObject = (card, entry) => {
            setFieldValue(card, 'comment', String(entry?.comment || '').trim());
            setFieldValue(card, 'keys', Array.isArray(entry?.key) ? entry.key.join(', ') : '');
            setFieldValue(card, 'content', String(entry?.content || '').trim());
            setFieldValue(card, 'selectiveLogic', Number(entry?.selectiveLogic ?? entry?.extensions?.selectiveLogic ?? 0));
            setFieldValue(card, 'position', Number(entry?.position ?? entry?.extensions?.position ?? 2)); // Default to position 2 (depth)
            setFieldValue(card, 'depth', Number(entry?.depth ?? entry?.extensions?.depth ?? 0));
            setFieldValue(card, 'probability', Number(entry?.probability ?? entry?.extensions?.probability ?? 100));
            setFieldValue(card, 'scanDepth', Number(entry?.scanDepth ?? entry?.extensions?.scan_depth ?? 999));
            setFieldValue(card, 'caseSensitive', entry?.caseSensitive ?? entry?.extensions?.case_sensitive ?? '');
            setFieldValue(card, 'matchWholeWords', entry?.matchWholeWords ?? entry?.extensions?.match_whole_words ?? '');
            setFieldValue(card, 'useGroupScoring', entry?.useGroupScoring ?? entry?.extensions?.use_group_scoring ?? '');
            setFieldValue(card, 'automationId', String(entry?.automationId ?? entry?.extensions?.automation_id ?? ''));
            setFieldValue(card, 'group', String(entry?.group ?? entry?.extensions?.group ?? ''));
            setFieldValue(card, 'groupWeight', Number(entry?.groupWeight ?? entry?.extensions?.group_weight ?? 100));
            setFieldValue(card, 'sticky', Number(entry?.sticky ?? entry?.extensions?.sticky ?? 0));
            setFieldValue(card, 'cooldown', Number(entry?.cooldown ?? entry?.extensions?.cooldown ?? 0));
            setFieldValue(card, 'delay', Number(entry?.delay ?? entry?.extensions?.delay ?? 0));
            setFieldValue(card, 'characterFilterText', Array.isArray(entry?.characterFilter?.names) ? entry.characterFilter.names.join(', ') : '');
            setFieldValue(card, 'filterExpression', String(entry?.extensions?.filter || ''));
            setFieldValue(card, 'triggerType', String(entry?.extensions?.trigger_type || ''));
            setFieldValue(card, 'enabled', !(entry?.disable === true || entry?.enabled === false), 'checked');
            setFieldValue(card, 'excludeRecursion', !!entry?.excludeRecursion, 'checked');
            setFieldValue(card, 'delayUntilRecursion', !!entry?.delayUntilRecursion, 'checked');
            setFieldValue(card, 'preventRecursion', !!entry?.preventRecursion, 'checked');
            setFieldValue(card, 'ignoreBudget', !!entry?.ignoreBudget, 'checked');
            setFieldValue(card, 'groupOverride', !!(entry?.groupOverride ?? entry?.extensions?.group_override), 'checked');
            setFieldValue(card, 'characterFilterExclude', !!entry?.characterFilter?.isExclude, 'checked');
            
            updateEntryBadges(card);
        };

        const bindEntryFieldListeners = (root = document) => {
            root.querySelectorAll('[data-entry-card] [data-field]').forEach((el) => {
                if (el.dataset.boundWorldbookField === '1') return;
                el.dataset.boundWorldbookField = '1';
                const card = el.closest('[data-entry-card]');
                el.addEventListener('input', () => {
                    syncWorldBookOutput();
                    updateEntryBadges(card);
                });
                el.addEventListener('change', () => {
                    syncWorldBookOutput();
                    updateEntryBadges(card);
                });
                el.addEventListener('input', syncWordCount);
            });
        };

        const syncWorldBookOutput = () => {
            if (!jsonOutput) return;
            const next = JSON.stringify(buildWorldBookJson(), null, 2);
            jsonOutput.value = next;
            if (jsonPreview) jsonPreview.value = next;
        };

        const applyJsonToEntryCards = () => {
            if (!entryListRoot || !jsonPreview) return false;
            let parsed;
            try {
                parsed = JSON.parse(String(jsonPreview.value || '{}'));
            } catch {
                window.showSnackbar(__('worldbooks.json_parse_failed'), "error");
                return false;
            }
            const sourceEntries = parsed?.entries && typeof parsed.entries === 'object'
                ? Object.values(parsed.entries)
                : [];
            if (!sourceEntries.length) {
                window.showSnackbar(__('worldbooks.no_wb_entries'), "info");
                return false;
            }

            entryListRoot.innerHTML = '';
            sourceEntries.forEach((entry, index) => {
                const card = createFallbackEntryCard();
                if (index === 0) {
                    card.classList.add('open');
                    const content = card.querySelector('.prompt-collapse-content');
                    if (content) content.style.maxHeight = 'none';
                }
                fillEntryCardFromObject(card, entry);
                entryListRoot.appendChild(card);
            });
            bindEntryFieldListeners(entryListRoot);
            syncWordCount();
            syncWorldBookOutput();
            window.showSnackbar(__('worldbooks.rebuilt_from_json'), "success");
            return true;
        };

        bindEntryFieldListeners(document);
        syncWorldBookOutput();
        
        // Update badges for initial items
        getEntryCards().forEach(card => {
            updateEntryBadges(card);
            if (card.dataset.startOpen === '1') {
                card.classList.add('open');
                const content = card.querySelector('.prompt-collapse-content');
                if (content) content.style.maxHeight = 'none';
            }
        });

        if (applyJsonBtn) {
            applyJsonBtn.onclick = () => {
                applyJsonToEntryCards();
            };
        }

        if (jsonPreview) {
            jsonPreview.addEventListener('input', () => {
                jsonPreviewDirty = true;
            });
        }

        const toggleEntryCollapse = (card) => {
            const content = card.querySelector('.prompt-collapse-content');
            if (!content) return;
            const isOpen = card.classList.contains('open');

            if (isOpen) {
                // Close
                content.style.maxHeight = content.scrollHeight + 'px';
                content.offsetHeight; // force reflow
                card.classList.remove('open');
                content.style.maxHeight = '0px';
            } else {
                // Open
                card.classList.add('open');
                content.style.maxHeight = content.scrollHeight + 'px';
                
                const onTransitionEnd = (e) => {
                    if (e.propertyName === 'max-height') {
                        if (card.classList.contains('open')) {
                            content.style.maxHeight = 'none';
                        }
                        content.removeEventListener('transitionend', onTransitionEnd);
                    }
                };
                content.addEventListener('transitionend', onTransitionEnd);
            }
        };

        if (entryListRoot) {
            entryListRoot.addEventListener('click', (event) => {
                const actionButton = event.target.closest('[data-action]');
                const card = event.target.closest('[data-entry-card]');
                if (!card) return;

                if (actionButton) {
                    const action = String(actionButton.dataset.action || '');
                    if (action === 'delete') {
                        card.remove();
                        syncWordCount();
                        syncWorldBookOutput();
                        window.showSnackbar(__('worldbooks.entry_deleted'), "success");
                        return;
                    }

                    if (action === 'duplicate') {
                        const clone = card.cloneNode(true);
                        clone.classList.remove('open');
                        clone.querySelectorAll('[data-bound-worldbook-field]').forEach((field) => {
                            field.dataset.boundWorldbookField = '';
                        });
                        card.after(clone);
                        bindEntryFieldListeners(clone);
                        updateEntryBadges(clone);
                        syncWordCount();
                        syncWorldBookOutput();
                        window.showSnackbar(__('worldbooks.entry_duplicated'), "success");
                        return;
                    }
                }

                // Toggle open state
                const toggleTrigger = event.target.closest('[data-toggle-entry]');
                if (toggleTrigger) {
                    // Don't toggle if clicking on sub-elements like switch or buttons
                    if (event.target.closest('mdui-switch') || event.target.closest('mdui-button-icon') || event.target.closest('input') || event.target.closest('select')) {
                        return;
                    }
                    toggleEntryCollapse(card);
                }
            });
        }

        if (saveFab && editorForm) {
            saveFab.onclick = async () => {
                if (jsonPreview && jsonPreviewDirty) {
                    try {
                        const parsed = JSON.parse(String(jsonPreview.value || '{}'));
                        jsonOutput.value = JSON.stringify(parsed, null, 2);
                        jsonPreviewDirty = false;
                    } catch {
                        window.showSnackbar(__('worldbooks.json_invalid_save'), "error");
                        return;
                    }
                } else {
                    syncWorldBookOutput();
                }

                // Show saving state on the FAB
                saveFab.disabled = true;
                const originalIcon = saveFab.icon;
                saveFab.icon = 'hourglass_empty';
                window.showSnackbar(__('worldbooks.save_snackbar'), "success");

                try {
                    const fileName = editorForm.querySelector('[name="fileName"]')?.value || '';
                    const res = await fetch('/api/worldbooks/save', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            fileName: fileName,
                            worldBookJson: jsonOutput.value
                        })
                    });
                    const data = await res.json();
                    if (data.ok) {
                        window.showSnackbar(data.displayName + ' ' + __('worldbooks.save_success'), 'success');
                    } else {
                        window.showSnackbar(data.error || __('common.error'), 'error');
                    }
                } catch (err) {
                    window.showSnackbar(__('common.network_error'), 'error');
                } finally {
                    saveFab.disabled = false;
                    saveFab.icon = originalIcon;
                }
            };
        }

        if (editorForm) {
            editorForm.addEventListener('submit', (event) => {
                event.preventDefault();
            });
        }
    }

    function initSettingsPage() {
        const themeSelect = document.querySelector('#settings-theme-select');
        const colorSelect = document.querySelector('#settings-color-select');
        const colorPicker = document.querySelector('#settings-color-picker');
        const colorHex = document.querySelector('#settings-color-hex');
        const htmlRenderSwitch = document.querySelector('#settings-html-render-switch');
        const wholeHtmlRenderSwitch = document.querySelector('#settings-whole-html-render-switch');
        const jsRenderSwitch = document.querySelector('#settings-js-render-switch');
        const htmlSaveBtn = document.querySelector('#settings-html-save');
        const saveBtn = document.querySelector('#settings-appearance-save');
        const accountSaveBtn = document.querySelector('#settings-account-save');
        const usernameInput = document.querySelector('#settings-username-input');
        const avatarUploadInput = document.querySelector('#settings-avatar-upload');
        const quoteColorPicker = document.querySelector('#settings-quote-color-picker');
        const quoteColorHex = document.querySelector('#settings-quote-color-hex');
        const drawerPushSwitch = document.querySelector('#settings-drawer-push-switch');
        const localeSelect = document.querySelector('#settings-locale-select');

        const updateAllAvatars = (username) => {
            const timeStr = '?t=' + Date.now();
            document.querySelectorAll('.user-avatar-sync').forEach(img => {
                if (img.tagName.toLowerCase() === 'mdui-avatar' || img.tagName.toLowerCase() === 'img') {
                    img.setAttribute('src', '/api/user/avatar/' + encodeURIComponent(username) + timeStr);
                }
            });
        };

        if (!themeSelect || !saveBtn) return;

        const normalizeHexColor = (value) => {
            const clean = String(value || '').trim();
            return /^#([0-9a-fA-F]{6})$/.test(clean) ? clean.toLowerCase() : '#3f51b5';
        };
        const getColorValue = () => {
            if (colorHex) return normalizeHexColor(colorHex.value);
            if (colorPicker) return normalizeHexColor(colorPicker.value);
            if (colorSelect) return normalizeHexColor(colorSelect.value);
            return '#3f51b5';
        };
        const setColorValue = (value) => {
            const next = normalizeHexColor(value);
            if (colorPicker) colorPicker.value = next;
            if (colorHex) colorHex.value = next;
            if (colorSelect) colorSelect.value = next;
        };

        const getQuoteColorValue = () => {
            const val = quoteColorHex ? String(quoteColorHex.value).trim() : (quoteColorPicker ? quoteColorPicker.value : '');
            if (!val) return '';
            return /^#([0-9a-fA-F]{6})$/.test(val) ? val.toLowerCase() : '';
        };
        const setQuoteColorValue = (value) => {
            const next = value || '';
            if (quoteColorPicker) quoteColorPicker.value = next || '#000000';
            if (quoteColorHex) quoteColorHex.value = next;
        };

        themeSelect.value = localStorage.getItem('theme') || 'auto';
        setColorValue(localStorage.getItem('seed-color') || '#3f51b5');
        setQuoteColorValue(localStorage.getItem('quote-color') || '');
        if (drawerPushSwitch) {
            drawerPushSwitch.checked = localStorage.getItem('drawer-push') !== 'false';
        }

        if (localeSelect) {
            const currentLocale = window.__locale ? window.__locale() : (document.documentElement.lang || 'zh-CN');
            localeSelect.value = currentLocale;
            let localeReady = false;
            requestAnimationFrame(() => { localeReady = true; });
            localeSelect.addEventListener('change', () => {
                if (!localeReady) return;
                const nextLocale = localeSelect.value;
                if (!nextLocale || nextLocale === currentLocale) return;
                const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
                document.cookie = 'kelpie_locale=' + encodeURIComponent(nextLocale)
                    + ';expires=' + expires + ';path=/;SameSite=Lax';
                window.location.reload();
            });
        }

        const swatches = document.querySelectorAll('#theme-color-swatches .color-swatch-btn');
        const updateSwatchesUI = (hex) => {
            const lowerHex = String(hex || '').trim().toLowerCase();
            swatches.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.color.toLowerCase() === lowerHex);
            });
        };

        if (swatches && swatches.length) {
            swatches.forEach(btn => {
                btn.addEventListener('click', () => {
                    const color = btn.dataset.color;
                    if (colorPicker) colorPicker.value = color;
                    if (colorHex) colorHex.value = color;
                    mdui.setColorScheme(color);
                    updateSwatchesUI(color);
                });
            });
            updateSwatchesUI(getColorValue());
        }

        if (colorPicker) {
            colorPicker.addEventListener('input', () => {
                const updated = normalizeHexColor(colorPicker.value);
                if (colorHex) colorHex.value = updated;
                mdui.setColorScheme(updated);
                updateSwatchesUI(updated);
            });
        }
        if (colorHex) {
            colorHex.addEventListener('input', () => {
                const val = colorHex.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    const normalized = normalizeHexColor(val);
                    if (colorPicker) colorPicker.value = normalized;
                    mdui.setColorScheme(normalized);
                    updateSwatchesUI(normalized);
                }
            });
            colorHex.addEventListener('change', () => {
                const next = normalizeHexColor(colorHex.value);
                colorHex.value = next;
                if (colorPicker) colorPicker.value = next;
                mdui.setColorScheme(next);
                updateSwatchesUI(next);
            });
        }
        if (quoteColorPicker) {
            quoteColorPicker.addEventListener('input', () => {
                const val = quoteColorPicker.value;
                if (quoteColorHex) quoteColorHex.value = val;
                document.documentElement.style.setProperty('--quote-color', val);
            });
        }
        if (quoteColorHex) {
            quoteColorHex.addEventListener('input', () => {
                const val = quoteColorHex.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    if (quoteColorPicker) quoteColorPicker.value = val;
                    document.documentElement.style.setProperty('--quote-color', val.toLowerCase());
                } else if (val === '') {
                    document.documentElement.style.removeProperty('--quote-color');
                }
            });
            quoteColorHex.addEventListener('change', () => {
                const next = getQuoteColorValue();
                quoteColorHex.value = next;
                if (quoteColorPicker) quoteColorPicker.value = next || '#000000';
                if (next) {
                    document.documentElement.style.setProperty('--quote-color', next);
                } else {
                    document.documentElement.style.removeProperty('--quote-color');
                }
            });
        }

        const saveHtmlPreferences = async () => {
            if (!htmlRenderSwitch) return true;
            const wholeHtmlChecked = wholeHtmlRenderSwitch ? !!wholeHtmlRenderSwitch.checked : true;
            const res = await fetch('/api/settings/preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    regexHtmlRenderEnabled: !!htmlRenderSwitch.checked,
                    wholeHtmlBlockRenderEnabled: wholeHtmlChecked,
                    jsRenderEnabled: wholeHtmlChecked,
                }),
            });
            const data = await res.json();
            if (!data.ok) {
                window.showSnackbar(data.error || __('settings.save_failed'), "error");
                return false;
            }
            return true;
        };

        saveBtn.onclick = async () => {
            if (drawerPushSwitch) {
                localStorage.setItem('drawer-push', drawerPushSwitch.checked ? 'true' : 'false');
                applyDrawerPushMode(); // Refresh immediately
            }
            applyAppearance(themeSelect.value, getColorValue(), getQuoteColorValue());
            try {
                window.showSnackbar(__('settings.appearance_applied'), "success");
            } catch {
                window.showSnackbar(__('settings.network_save_failed'), "error");
            }
        };

        if (htmlSaveBtn) {
            htmlSaveBtn.onclick = async () => {
                try {
                    const ok = await saveHtmlPreferences();
                    if (ok) {
                        window.showSnackbar(__('settings.html_render_applied'), "success");
                    }
                } catch {
                    window.showSnackbar(__('settings.network_save_failed'), "error");
                }
            };
        }

        if (avatarUploadInput) {
            const confirmCropBtn = document.querySelector('#avatar-crop-confirm');
            const cancelCropBtn = document.querySelector('#avatar-crop-cancel');
            const cropDialog = document.querySelector('#avatar-crop-dialog');
            const cropImage = document.querySelector('#avatar-crop-image');

            avatarUploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    cropImage.src = event.target.result;
                    if (window.avatarCropper) {
                        window.avatarCropper.destroy();
                    }
                    cropDialog.open = true;
                    // Initialize cropper after a short delay so the dialog renders and bounds are known
                    setTimeout(() => {
                        window.avatarCropper = new Cropper(cropImage, {
                            aspectRatio: 1,
                            viewMode: 1,
                            dragMode: 'move',
                            autoCropArea: 1,
                            restore: false,
                            guides: false,
                            center: true,
                            highlight: false,
                            cropBoxMovable: true,
                            cropBoxResizable: true,
                            toggleDragModeOnDblclick: false,
                        });
                    }, 100);
                };
                reader.readAsDataURL(file);
                avatarUploadInput.value = '';
            });

            if (confirmCropBtn) {
                confirmCropBtn.addEventListener('click', () => {
                    if (!window.avatarCropper) return;
                    window.avatarCropper.getCroppedCanvas({ width: 300, height: 300 }).toBlob(async (blob) => {
                        const formData = new FormData();
                        formData.append('avatarFile', blob, 'avatar.png');
                        try {
                            const res = await fetch('/api/user/avatar', { method: 'POST', body: formData });
                            const data = await res.json();
                            if (data.ok) {
                                window.showSnackbar(__('settings.avatar_upload_success'), "success");
                                updateAllAvatars(usernameInput ? usernameInput.value : '');
                            } else {
                                window.showSnackbar(data.error || __('settings.avatar_upload_failed'), "error");
                            }
                        } catch {
                            window.showSnackbar(__('settings.network_avatar_upload_failed'), "error");
                        }
                        cropDialog.open = false;
                    }, 'image/png');
                });
            }

            if (cancelCropBtn) {
                cancelCropBtn.addEventListener('click', () => {
                    cropDialog.open = false;
                });
            }
        }

        if (accountSaveBtn && usernameInput) {
            accountSaveBtn.onclick = async () => {
                const newUsername = usernameInput.value.trim();
                const oldUsername = document.querySelector('.drawer-header .username')?.textContent.trim() || '';
                if (!newUsername) {
                    window.showSnackbar(__('settings.username_empty'), "error");
                    return;
                }

                try {
                    const res = await fetch('/api/user/profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: newUsername })
                    });
                    const data = await res.json();
                    if (data.ok) {
                        window.showSnackbar(__('settings.account_update_success'), "success");
                        // Sync drawer username text
                        const drawerUsername = document.querySelector('.drawer-header .username');
                        if (drawerUsername) drawerUsername.textContent = newUsername;
                        
                        // Sync avatar src pattern if username changed
                        if (oldUsername !== newUsername) {
                            updateAllAvatars(newUsername);
                        }
                    } else {
                        window.showSnackbar(data.error || __('settings.account_update_failed'), "error");
                    }
                } catch (e) {
                    window.showSnackbar(__('settings.network_account_update_failed'), "error");
                }
            };
        }
    }

    function initRoomPage() {
        const roomPage = document.querySelector('[data-room-page]');
        if (!roomPage) return;

        // Create the sandbox API blob URL in the parent window so that sub-iframe importmaps can resolve it immediately
        if (!window.__sandboxApiUrl) {
            const _apiSource = `
export function send2input(text) {
    if (typeof text !== 'string') text = String(text ?? '');
    try { window.parent.postMessage({ __roomHtmlRenderInput: text }, '*'); } catch (e) {}
}
export function writeUserMD(content) {
    if (typeof content !== 'string') content = String(content ?? '');
    try { window.parent.postMessage({ __roomHtmlRenderPersonaContent: content }, '*'); } catch (e) {}
}
export function writeRN(displayName) {
    if (typeof displayName !== 'string') displayName = String(displayName ?? '');
    try { window.parent.postMessage({ __roomHtmlRenderPersonaDisplayName: displayName }, '*'); } catch (e) {}
}
export function getInputBox() { return { send: send2input }; }

const sandBox = { send2input, writeUserMD, writeRN, getInputBox };
export { sandBox };
export default sandBox;
`;
            try {
                const blob = new Blob([_apiSource], { type: 'text/javascript' });
                window.__sandboxApiUrl = URL.createObjectURL(blob);
            } catch (e) {
                window.__sandboxApiUrl = '';
            }
        }

        const roomCode = String(roomPage.dataset.roomCode || '').trim();
        const narratorName = String(roomPage.dataset.narratorName || __('room.ai_narrator'));
        const narratorAvatar = String(roomPage.dataset.narratorAvatar || '');
        const selfUserId = String(roomPage.dataset.userId || '');
        const isHostUser = String(roomPage.dataset.isHost || '') === '1';
        const roomHtmlRenderToggle = document.querySelector('#room-html-render-toggle');
        const roomRegexToggle = document.querySelector('#room-regex-toggle');
        const roomRegexDialog = document.querySelector('#room-regex-dialog');
        const roomRegexList = document.querySelector('#room-regex-list');
        const roomRegexPresetName = document.querySelector('#room-regex-preset-name');
        const roomAdditionalWbToggle = document.querySelector('#room-additional-wb-toggle');
        const roomAdditionalWbDialog = document.querySelector('#room-additional-wb-dialog');
        const roomAdditionalWbSave = document.querySelector('#room-additional-wb-save');
        const roomInfoToggle = document.querySelector('#room-info-toggle');
        const roomInfoDrawer = document.querySelector('#room-info-drawer');
        const roomMembersList = document.querySelector('#room-members-list');
        const roomReadyButton = document.querySelector('#room-ready-button');
        const roomEditButton = document.querySelector('#room-edit-button');

        // Feature flags and preferences
        let regexHtmlRenderEnabled = roomPage.dataset.htmlRenderEnabled !== 'false';
        let wholeHtmlBlockRenderEnabled = roomPage.dataset.wholeHtmlBlockRenderEnabled !== 'false';
        let jsRenderEnabled = roomPage.dataset.jsRenderEnabled === 'true';

        const roomLeaveButton = document.querySelector('#room-leave-button');
        const leaveRoomConfirmDialog = document.querySelector('#leave-room-confirm-dialog');
        const leaveRoomHeadline = document.querySelector('#leave-room-headline');
        const leaveRoomMessage = document.querySelector('#leave-room-message');
        const confirmLeaveRoomBtn = document.querySelector('#confirm-leave-room-btn');
        const roomPresetSelector = document.querySelector('#room-preset-selector');
        const roomPresetApply = document.querySelector('#room-preset-apply');
        const roomOpeningSelector = document.querySelector('#room-opening-selector');
        const roomOpeningApply = document.querySelector('#room-opening-apply');
        const roomInput = document.querySelector('#room-input-content');
        const roomTimeline = document.querySelector('#room-timeline');
        const floorValue = document.querySelector('#room-floor-value');
        const progress = document.querySelector('#room-turn-progress');
        const presetCurrent = document.querySelector('#room-preset-current');
        const editMessageDialog = document.querySelector('#edit-message-dialog');
        const editMessageContent = document.querySelector('#edit-message-content');
        const editMessageIdInput = document.querySelector('#edit-message-id');
        const confirmEditMessageBtn = document.querySelector('#confirm-edit-message-btn');
        const roomDiagnosticsBtn = document.querySelector('#room-diagnostics-btn');
        const roomDiagnosticsDialog = document.querySelector('#room-diagnostics-dialog');
        const roomDiagnosticsContent = document.querySelector('#room-diagnostics-content');
        const roomPersonaToggle = document.querySelector('#room-persona-toggle');
        const roomPersonaDialog = document.querySelector('#room-persona-dialog');
        const roomPersonaInput = document.querySelector('#room-persona-input');
        const roomPersonaSave = document.querySelector('#room-persona-save');
        const composer = document.querySelector('.room-composer');
        const roomConnectionStatus = document.querySelector('#room-connection-status');
        const roomMenuBtn = document.querySelector('#room-menu-btn');
        const roomQuickMenu = document.querySelector('#room-quick-menu');
        const forceStartConfirmDialog = document.querySelector('#force-start-confirm-dialog');
        const regenerateConfirmDialog = document.querySelector('#regenerate-confirm-dialog');
        const deleteMessageConfirmDialog = document.querySelector('#delete-message-confirm-dialog');
        const confirmForceStartBtn = document.querySelector('#confirm-force-start-btn');
        const confirmRegenerateBtn = document.querySelector('#confirm-regenerate-btn');
        const confirmDeleteMsgBtn = document.querySelector('#confirm-delete-msg-btn');
        let pendingDeleteMsgId = null;

        if (roomMenuBtn && roomQuickMenu) {
            roomMenuBtn.onclick = (e) => {
                e.stopPropagation();
                roomQuickMenu.style.display = roomQuickMenu.style.display === 'none' ? '' : 'none';
            };
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#room-composer-menu')) {
                    roomQuickMenu.style.display = 'none';
                }
            });
        }

        if (roomInfoToggle && roomInfoDrawer) {
            roomInfoToggle.style.display = '';
            roomInfoToggle.onclick = () => { roomInfoDrawer.open = !roomInfoDrawer.open; };
        }

        // Click-to-copy for room code / join code
        document.querySelectorAll('.copyable-code').forEach((el) => {
            el.addEventListener('click', () => {
                const text = String(el.getAttribute('data-copy') || '').trim();
                if (!text) return;
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(text).then(() => {
                        window.showSnackbar(__('room.content_copied'), 'success');
                    }).catch(() => {
                        fallbackCopy(text);
                    });
                } else {
                    fallbackCopy(text);
                }
            });
        });
        const fallbackCopy = (text) => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); window.showSnackbar(__('room.content_copied'), 'success'); }
            catch { window.showSnackbar(__('room.copy_failed'), 'error'); }
            document.body.removeChild(ta);
        };

        // Auto-close room info drawer when navigating to non-room page
        if (roomInfoDrawer) {
            document.addEventListener('turbo:before-visit', () => {
                try { roomInfoDrawer.open = false; } catch {}
            });
        }
        if (roomAdditionalWbToggle && roomAdditionalWbDialog) {
            roomAdditionalWbToggle.style.display = 'inline-flex';
            roomAdditionalWbToggle.onclick = () => {
                roomAdditionalWbDialog.open = true;
            };
        }
        if (roomRegexToggle && roomRegexDialog) {
            roomRegexToggle.style.display = 'inline-flex';
            roomRegexToggle.onclick = async () => {
                await fetchRegexState();
                roomRegexDialog.open = true;
            };
        }
        if (roomInfoToggle && roomInfoDrawer) {
            roomInfoToggle.style.display = 'inline-flex';
            roomInfoToggle.onclick = () => { roomInfoDrawer.open = !roomInfoDrawer.open; };
        }
        if (roomPersonaToggle && roomPersonaDialog) {
            roomPersonaToggle.style.display = 'inline-flex';
        }

        if (roomAdditionalWbToggle && roomAdditionalWbDialog) {
            roomAdditionalWbToggle.style.display = '';
            roomAdditionalWbToggle.onclick = () => {
                roomAdditionalWbDialog.open = true;
            };
        }
        if (roomPersonaToggle && roomPersonaDialog) {
            roomPersonaToggle.style.display = '';
        }

        const closeAllTooltips = () => {
            document.querySelectorAll('mdui-tooltip').forEach(t => { t.open = false; });
        };
        const openPersonaDialog = async (triggerEl) => {
            try {
                if (triggerEl) {
                    triggerEl.loading = true;
                    closeAllTooltips();
                    triggerEl.blur();
                }
                const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/persona`);
                const data = await res.json();
                if (data.ok) {
                    roomPersonaInput.value = data.content || '';
                    const displayNameField = document.querySelector('#room-persona-displayname');
                    if (displayNameField) displayNameField.value = data.displayName || '';
                    if (document.querySelector('#persona-editor-tabs')) {
                        document.querySelector('#persona-editor-tabs').value = 'tab-edit';
                    }
                    updatePersonaPreview();
                }
                roomPersonaDialog.open = true;
            } catch (err) {
                window.showSnackbar(__('room.cannot_load_persona'), 'error');
            } finally {
                if (triggerEl) triggerEl.loading = false;
            }
        };


        if (roomPersonaToggle) {
            roomPersonaToggle.onclick = () => openPersonaDialog(roomPersonaToggle);
        }

        const updatePersonaPreview = () => {
            const previewEl = document.querySelector('#room-persona-preview');
            if (!previewEl) return;
            const raw = String(roomPersonaInput.value || '').trim();
            if (!raw) {
                previewEl.innerHTML = '<span style="opacity: 0.5;">' + __('room.no_preview') + '</span>';
                return;
            }
            if (typeof marked !== 'undefined') {
                previewEl.innerHTML = marked.parse(raw);
            } else {
                previewEl.textContent = raw;
            }
        };

        const personaTabsElement = document.querySelector('#persona-editor-tabs');
        if (personaTabsElement) {
            personaTabsElement.addEventListener('change', () => {
                if (personaTabsElement.value === 'tab-preview') {
                    updatePersonaPreview();
                }
            });
        }

        if (roomPersonaSave) {
            roomPersonaSave.onclick = async () => {
                const content = String(roomPersonaInput.value || '');
                const displayName = String(document.querySelector('#room-persona-displayname')?.value || '').trim();
                roomPersonaSave.loading = true;
                try {
                    const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/persona`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content, displayName }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                        window.showSnackbar(__('room.persona_saved'), 'success');
                        roomPersonaDialog.open = false;
                    } else {
                        window.showSnackbar(data.error || __('common.save_failed'), 'error');
                    }
                } catch (err) {
                    window.showSnackbar(__('common.network_error'), 'error');
                } finally {
                    roomPersonaSave.loading = false;
                }
            };
        }

        if (roomAdditionalWbSave) {
            roomAdditionalWbSave.onclick = async () => {
                const selectedWbs = Array.from(document.querySelectorAll('.additional-wb-checkbox'))
                    .filter(el => el.checked)
                    .map(el => el.value);
                
                roomAdditionalWbSave.loading = true;
                try {
                    const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ additionalWorldBooks: selectedWbs }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                        window.showSnackbar(__('room.worldbooks_updated') || 'World books updated', 'success');
                        roomAdditionalWbDialog.open = false;
                        if (!isWsConnected) fetchRoomState();
                    } else {
                        window.showSnackbar(data.error || __('room.update_failed'), 'error');
                    }
                } catch (err) {
                    window.showSnackbar(__('common.network_error'), 'error');
                } finally {
                    roomAdditionalWbSave.loading = false;
                }
            };
        }

        // --- Room Settings Logic (Host Only) ---
        const roomSettingsBtn = document.querySelector('#room-settings-btn');
        const roomSettingsDialog = document.querySelector('#room-settings-dialog');
        const roomSettingsSave = document.querySelector('#room-settings-save');

        if (roomSettingsBtn && roomSettingsDialog) {
            roomSettingsBtn.onclick = () => {
                roomSettingsDialog.open = true;
            };
        }

        if (roomSettingsSave) {
            roomSettingsSave.onclick = async () => {
                const title = document.querySelector('#edit-room-title')?.value;
                const password = document.querySelector('#edit-room-password')?.value;
                const isPublic = document.querySelector('#edit-room-public')?.checked ? 'on' : 'off';
                const presetFile = document.querySelector('#edit-room-preset')?.value;
                const apiProfileId = document.querySelector('#edit-room-api-profile')?.value;
                const worldBookFile = document.querySelector('#edit-room-worldbook')?.value;
                const takeoverPrompt = document.querySelector('#edit-room-takeover-prompt')?.value;

                roomSettingsSave.loading = true;
                try {
                    const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            roomTitle: title,
                            roomPassword: password,
                            isPublic: isPublic,
                            presetFile: presetFile,
                            apiProfileId,
                            worldBookFile,
                            takeoverPrompt: takeoverPrompt
                        }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                        window.showSnackbar(__('room.room_settings_updated'), 'success');
                        roomSettingsDialog.open = false;
                        // Trigger a reload or update title if needed
                        // Turbo.visit(window.location.href, { action: 'replace' });
                    } else {
                        window.showSnackbar(data.error || __('room.update_failed'), 'error');
                    }
                } catch (err) {
                    window.showSnackbar(__('common.network_error'), 'error');
                } finally {
                    roomSettingsSave.loading = false;
                }
            };
        }
        let isSubmitting = false;
        let isProcessing = false;
        let roomSocket = null;
        let roomReconnectTimer = null;
        let roomHeartbeatTimer = null;
        let roomStatePollTimer = null;
        let isWsConnected = false;
        let shouldReconnectRoomSocket = true;
        let renderedSignature = '';
        let streamingRoundNo = 0;
        let streamContentEl = null;
        let currentNarratorOpening = '';
        let roomRegexState = { rules: [] };
        let latestDiagnostics = null;
        let latestTimelineMessages = [];
        let latestMembersState = [];
        const htmlRenderFrames = new Map();

        const updatePersonaRemote = async ({ content, displayName }) => {
            try {
                const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/persona`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, displayName }),
                });
                if (res.redirected || res.url.includes('/login')) {
                    window.showSnackbar(__('auth.session_expired') || 'Session expired, please refresh and login again', 'error');
                    return;
                }
                const contentType = res.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    window.showSnackbar(__('auth.session_expired') || 'Session expired, please refresh and login again', 'error');
                    return;
                }
                const data = await res.json();
                if (data.ok) {
                    window.showSnackbar(__('room.persona_saved') || 'Persona saved', 'success');
                    if (content !== undefined && roomPersonaInput) {
                        roomPersonaInput.value = content;
                    }
                    if (displayName !== undefined) {
                        const displayNameField = document.querySelector('#room-persona-displayname');
                        if (displayNameField) displayNameField.value = displayName;
                    }
                } else {
                    window.showSnackbar(data.error || __('common.save_failed'), 'error');
                }
            } catch (err) {
                console.error('[updatePersonaRemote] Error:', err);
                window.showSnackbar(__('common.network_error'), 'error');
            }
        };
        let scrollStabilizeTimers = [];
        let pageScrollStabilizeTimers = [];
        let hasInitializedReadyState = false;
        const memberReadyStateMap = new Map();

        const escapeHtml = (value) => String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const formatMessageTime = (value) => {
            const raw = String(value || '').trim();
            if (!raw) return '';
            const parsed = new Date(raw);
            if (Number.isNaN(parsed.getTime())) return '';
            return parsed.toLocaleTimeString('zh-CN', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        };

        const PAIR_RULES = [
            { left: '「', right: '」', type: 'speech' },
            { left: '『', right: '』', type: 'speech' },
            { left: '“', right: '”', type: 'speech' },
            { left: '"', right: '"', type: 'speech' },
            { left: '（', right: '）', type: 'aside' },
            { left: '(', right: ')', type: 'aside' },
            { left: '【', right: '】', type: 'aside' },
            { left: '《', right: '》', type: 'generic' },
        ];

        const SEPARATOR_BETWEEN_QUOTES_RE = /^[\s，。！？、,.!?;:：；'"“”‘’`~\-—…]+$/;

        const extractPairMatches = (text) => {
            const source = String(text || '');
            const matches = [];
            let cursor = 0;
            while (cursor < source.length) {
                let best = null;
                for (const rule of PAIR_RULES) {
                    const start = source.indexOf(rule.left, cursor);
                    if (start < 0) continue;
                    const end = source.indexOf(rule.right, start + rule.left.length);
                    if (end < 0) continue;
                    const inner = source.slice(start + rule.left.length, end);
                    if (!inner.trim() || inner.length > 500) continue;
                    const candidate = {
                        start,
                        end: end + rule.right.length - 1,
                        type: rule.type,
                    };
                    if (!best || candidate.start < best.start || (candidate.start === best.start && candidate.end < best.end)) {
                        best = candidate;
                    }
                }
                if (!best) break;
                matches.push(best);
                cursor = best.end + 1;
            }
            return matches;
        };

        const assignSpeechGroups = (text, matches) => {
            let group = -1;
            let previous = null;
            for (const item of matches) {
                if (item.type !== 'speech') continue;
                if (!previous) {
                    group = 0;
                    item.group = group;
                    previous = item;
                    continue;
                }
                const between = text.slice(previous.end + 1, item.start);
                if (!SEPARATOR_BETWEEN_QUOTES_RE.test(between)) {
                    group += 1;
                }
                item.group = group;
                previous = item;
            }
        };

        const buildHighlightedFragment = (text) => {
            const source = String(text || '');
            const matches = extractPairMatches(source);
            if (!matches.length) return null;
            assignSpeechGroups(source, matches);

            const fragment = document.createDocumentFragment();
            let index = 0;
            matches.forEach((item) => {
                if (item.start > index) {
                    fragment.appendChild(document.createTextNode(source.slice(index, item.start)));
                }
                const span = document.createElement('span');
                span.classList.add('room-paired-symbol');
                if (item.type === 'speech') {
                    span.classList.add('room-paired-speech', `speech-group-${Number(item.group || 0) % 4}`);
                } else if (item.type === 'aside') {
                    span.classList.add('room-paired-aside');
                } else {
                    span.classList.add('room-paired-generic');
                }
                span.textContent = source.slice(item.start, item.end + 1);
                fragment.appendChild(span);
                index = item.end + 1;
            });
            if (index < source.length) {
                fragment.appendChild(document.createTextNode(source.slice(index)));
            }
            return fragment;
        };

        const highlightTextToHtml = (text) => {
            const source = String(text || '');
            const matches = extractPairMatches(source);
            if (!matches.length) {
                return escapeHtml(source).replace(/\n/g, '<br>');
            }
            assignSpeechGroups(source, matches);
            let index = 0;
            let html = '';
            matches.forEach((item) => {
                if (item.start > index) {
                    html += escapeHtml(source.slice(index, item.start)).replace(/\n/g, '<br>');
                }
                const className = item.type === 'speech'
                    ? `room-paired-symbol room-paired-speech speech-group-${Number(item.group || 0) % 4}`
                    : (item.type === 'aside'
                        ? 'room-paired-symbol room-paired-aside'
                        : 'room-paired-symbol room-paired-generic');
                html += `<span class="${className}">${escapeHtml(source.slice(item.start, item.end + 1)).replace(/\n/g, '<br>')}</span>`;
                index = item.end + 1;
            });
            if (index < source.length) {
                html += escapeHtml(source.slice(index)).replace(/\n/g, '<br>');
            }
            return html;
        };

        const applyPairedSymbolHighlight = (root) => {
            if (!root) return;
            root.querySelectorAll('p, li, blockquote').forEach((block) => {
                if (!block) return;
                if (block.querySelector(':scope *:not(br)')) return;
                if (block.querySelector('.room-paired-symbol')) return;
                const plainText = String(block.innerText || block.textContent || '');
                if (!plainText.trim()) return;
                const highlighted = highlightTextToHtml(plainText);
                if (highlighted === escapeHtml(plainText).replace(/\n/g, '<br>')) return;
                block.innerHTML = highlighted;
            });
            const textNodes = [];
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) => {
                    if (!node || !String(node.nodeValue || '').trim()) return NodeFilter.FILTER_REJECT;
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    if (parent.closest('pre, code, a, .room-paired-symbol')) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                },
            });
            while (walker.nextNode()) {
                textNodes.push(walker.currentNode);
            }
            textNodes.forEach((node) => {
                const fragment = buildHighlightedFragment(node.nodeValue || '');
                if (!fragment) return;
                node.replaceWith(fragment);
            });
        };

        const sanitizeMarkdownSource = (content) => String(content || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const stripDangerousHtml = (content, allowStyle = false) => {
            const source = String(content || '');
            
            const codeBlocks = [];
            let tempSource = source.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
                const placeholder = `__HTML_SAN_PLACEHOLDER_${codeBlocks.length}__`;
                codeBlocks.push(match);
                return placeholder;
            });

            let out = tempSource;
            if (jsRenderEnabled) {
                out = out
                    .replace(/<(iframe|object|embed|meta|base|form|input|button|textarea|select|option)[\s\S]*?>[\s\S]*?<\/\1>/gi, '')
                    .replace(/<(iframe|object|embed|meta|base|form|input|button|textarea|select|option)[\s\S]*?>/gi, '');
            } else {
                out = out
                    .replace(/<(script|iframe|object|embed|meta|base|form|input|button|textarea|select|option)[\s\S]*?>[\s\S]*?<\/\1>/gi, '')
                    .replace(/<(script|iframe|object|embed|meta|base|form|input|button|textarea|select|option)[\s\S]*?>/gi, '');
            }

            if (!allowStyle) {
                out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
                        .replace(/<style[\s\S]*?>/gi, '');
            }

            out = out
                .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
                .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
                .replace(/javascript:/gi, 'java-script:');

            for (let i = 0; i < codeBlocks.length; i++) {
                out = out.replace(`__HTML_SAN_PLACEHOLDER_${i}__`, codeBlocks[i]);
            }

            return out;
        };

        const decodeHtmlEntities = (value) => {
            const temp = document.createElement('textarea');
            temp.innerHTML = String(value || '');
            return temp.value;
        };

        const isLikelyHtmlSnippet = (source) => {
            const text = String(source || '').trim();
            if (!text) return false;
            if (/^<!doctype html>/i.test(text)) return true;
            if (/<html[\s>]/i.test(text)) return true;
            const knownTags = /<\/?(body|div|span|p|a|ul|ol|li|table|tr|td|th|tbody|thead|tfoot|style|script|iframe|svg|details|summary|form|input|button|img|video|audio|h[1-6]|main|nav|header|footer|section|article|blockquote|hr|pre|code)\b/i;
            return knownTags.test(text);
        };

        const hasBodyPair = (source) => {
            const text = String(source || '');
            return /<body[\s>]/i.test(text) && /<\/body>/i.test(text);
        };

        const isWholeHtmlDocument = (source) => {
            const text = String(source || '').trim();
            return /<!doctype\s+html/i.test(text) || /<html[\s>]/i.test(text);
        };

        const RENDERER_STYLE = `
<style id="room-html-renderer-style">
html, body {
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    width: 100% !important;
    height: auto;
    min-height: 0;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    background: transparent !important;
    display: flow-root;
    scrollbar-width: thin;
    color-scheme: light dark;
}
* { box-sizing: border-box; }
table {
    border-collapse: collapse;
    width: max-content;
    min-width: 100%;
}
img, video, canvas, svg, details, summary, figure, fieldset {
    max-width: 100%;
    box-sizing: border-box;
    height: auto;
}
details > summary { cursor: pointer; }
#room-html-wrapper { display: flow-root; width: 100%; }
pre, code { white-space: pre-wrap; word-break: break-word; }
</style>`;

        const API_DEFINITION_SCRIPT = `
<script id="room-html-renderer-api">
(() => {
    window.send2input = function(text) {
        if (typeof text !== 'string') text = String(text ?? '');
        try { window.parent.postMessage({ __roomHtmlRenderInput: text }, '*'); } catch (e) {}
    };
    window.writeUserMD = function(content) {
        if (typeof content !== 'string') content = String(content ?? '');
        try { window.parent.postMessage({ __roomHtmlRenderPersonaContent: content }, '*'); } catch (e) {}
    };
    window.writeRN = function(displayName) {
        if (typeof displayName !== 'string') displayName = String(displayName ?? '');
        try { window.parent.postMessage({ __roomHtmlRenderPersonaDisplayName: displayName }, '*'); } catch (e) {}
    };
    window.send2RN = window.writeRN;
    window.send2UserMD = window.writeUserMD;
    window.getInputBox = function() { return { send: window.send2input }; };
    
    window.kelpie = {
        send2input: window.send2input,
        writeUserMD: window.writeUserMD,
        send2UserMD: window.send2UserMD,
        writeRN: window.writeRN,
        send2RN: window.send2RN,
        getInputBox: window.getInputBox
    };
    window.sandBox = window.kelpie;
})();
</script>`;

        const HEIGHT_RESIZE_SCRIPT = `
<script id="room-html-renderer-runtime">
(() => {
    let _lastReportedH = 0;
    const sendHeight = () => {
        const doc = document.documentElement;
        const body = document.body;
        if (!doc || !body) return;

        const origHtmlH = doc.style.getPropertyValue('height');
        const origHtmlMinH = doc.style.getPropertyValue('min-height');
        const origBodyH = body.style.getPropertyValue('height');
        const origBodyMinH = body.style.getPropertyValue('min-height');

        doc.style.setProperty('height', 'auto', 'important');
        doc.style.setProperty('min-height', '0px', 'important');
        body.style.setProperty('height', 'auto', 'important');
        body.style.setProperty('min-height', '0px', 'important');
        
        let h = 0;
        const wrapper = document.getElementById('room-html-wrapper');
        if (wrapper) {
            h = wrapper.scrollHeight;
        } else {
            h = Math.max(body.scrollHeight, body.offsetHeight, doc.scrollHeight, doc.offsetHeight);
            try {
                const all = body.getElementsByTagName('*');
                let maxBottom = 0;
                for (let i = 0; i < all.length; i++) {
                    try {
                        const el = all[i];
                        const tagName = el.tagName.toLowerCase();
                        if (tagName === 'script' || tagName === 'style' || tagName === 'link') continue;
                        
                        // Skip elements inside closed details
                        const closedDetails = el.closest('details:not([open])');
                        if (closedDetails && el !== closedDetails && !el.closest('summary')) {
                            continue;
                        }

                        // Skip hidden elements (display: none)
                        if (el.offsetParent === null && el !== body && el !== doc) {
                            const style = window.getComputedStyle(el);
                            if (style && style.position !== 'fixed') continue;
                        }

                        const rect = el.getBoundingClientRect();
                        if (rect.height <= 0 && rect.width <= 0) continue;
                        
                        let bottom = rect.top + window.pageYOffset + rect.height;
                        if (el.scrollHeight > rect.height) {
                            const style = window.getComputedStyle(el);
                            const overflowY = (style && style.overflowY) || '';
                            if (overflowY !== 'hidden') {
                                bottom += (el.scrollHeight - rect.height);
                            }
                        }
                        if (bottom > maxBottom) maxBottom = bottom;
                    } catch (e) {}
                }
                if (maxBottom > 0) h = maxBottom;
            } catch (e) {}
        }
        
        if (origHtmlH) doc.style.setProperty('height', origHtmlH); else doc.style.removeProperty('height');
        if (origHtmlMinH) doc.style.setProperty('min-height', origHtmlMinH); else doc.style.removeProperty('min-height');
        if (origBodyH) body.style.setProperty('height', origBodyH); else body.style.removeProperty('height');
        if (origBodyMinH) body.style.setProperty('min-height', origBodyMinH); else body.style.removeProperty('min-height');

        h = Math.ceil(h + 8);
        if (h < 30) h = 30;
        if (Math.abs(h - _lastReportedH) < 1) return;
        _lastReportedH = h;
        try { window.parent.postMessage({ __roomHtmlRenderHeight: h }, '*'); } catch (e) {}
    };

    const ro = window.ResizeObserver ? new window.ResizeObserver(() => sendHeight()) : null;
    if (ro) {
        if (document.body) ro.observe(document.body);
        ro.observe(document.documentElement);
    }
    setInterval(sendHeight, 500);
    window.addEventListener('load', sendHeight);
})();
</script>`;

        const injectRendererRuntime = (html, wholeDoc) => {
            const source = String(html || '');
            const importMap = `\n<script type="importmap">{\n  "imports": {\n    "kelpie": "/js/kelpie-api.js",\n    "sandBox": "/js/kelpie-api.js"\n  }\n}<\/script>\n`;
            if (wholeDoc) {
                let out = source;
                if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, `${importMap}${API_DEFINITION_SCRIPT}${RENDERER_STYLE}</head>`);
                else if (/<head[^>]*>/i.test(out)) out = out.replace(/<head([^>]*)>/i, `<head$1>${importMap}${API_DEFINITION_SCRIPT}${RENDERER_STYLE}`);
                else out = out.replace(/<html([^>]*)>/i, `<html$1><head>${importMap}${API_DEFINITION_SCRIPT}${RENDERER_STYLE}</head>`);
                
                if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${HEIGHT_RESIZE_SCRIPT}</body>`);
                else out += HEIGHT_RESIZE_SCRIPT;
                return out;
            }
            return `<!DOCTYPE html><html><head><meta charset="utf-8">${importMap}${API_DEFINITION_SCRIPT}<meta name="viewport" content="width=device-width, initial-scale=1">${RENDERER_STYLE}</head><body style="margin:0;padding:0;overflow:hidden;background:transparent;"><div id="room-html-wrapper" style="display:flow-root;height:auto;overflow:hidden">${source}</div>${HEIGHT_RESIZE_SCRIPT}</body></html>`;
        };

        const createScopedHtmlHost = (rawHtml, allowJs = false) => {
            const host = document.createElement('div');
            host.className = 'room-html-block-render';
            let sourceRaw = String(rawHtml || '');

            if (!allowJs) {
                sourceRaw = sourceRaw
                    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
                    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
                    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
            }

            const useWholeDocument = isWholeHtmlDocument(sourceRaw) && hasBodyPair(sourceRaw);
            const iframe = document.createElement('iframe');
            iframe.className = 'room-html-render-frame';
            
            iframe.setAttribute('sandbox', allowJs
                ? 'allow-scripts allow-forms allow-modals allow-pointer-lock allow-same-origin'
                : 'allow-forms allow-modals allow-pointer-lock allow-same-origin');
            
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            iframe.setAttribute('loading', 'lazy');
            iframe.setAttribute('allowtransparency', 'true');
            iframe.style.width = '100%';
            iframe.style.border = '0';
            iframe.style.display = 'block';
            iframe.style.background = 'transparent';
            iframe.style.colorScheme = 'light dark';
            
            iframe.srcdoc = injectRendererRuntime(sourceRaw, useWholeDocument);

            iframe.addEventListener('load', () => {
                if (iframe.contentWindow) htmlRenderFrames.set(iframe.contentWindow, iframe);
                
                if (!allowJs) {
                    const doc = iframe.contentDocument;
                    if (!doc) return;
                    const syncHeight = () => {
                        const htmlEl = doc.documentElement;
                        const bodyEl = doc.body;
                        if (!htmlEl || !bodyEl) return;

                        const origHtmlH = htmlEl.style.getPropertyValue('height');
                        const origHtmlMinH = htmlEl.style.getPropertyValue('min-height');
                        const origBodyH = bodyEl.style.getPropertyValue('height');
                        const origBodyMinH = bodyEl.style.getPropertyValue('min-height');

                        htmlEl.style.setProperty('height', 'auto', 'important');
                        htmlEl.style.setProperty('min-height', '0px', 'important');
                        bodyEl.style.setProperty('height', 'auto', 'important');
                        bodyEl.style.setProperty('min-height', '0px', 'important');

                        const wrapper = doc.getElementById('room-html-wrapper');
                        let h = 0;
                        if (wrapper) {
                            h = wrapper.scrollHeight;
                        } else {
                            h = Math.max(bodyEl.scrollHeight, bodyEl.offsetHeight, htmlEl.scrollHeight, htmlEl.offsetHeight);
                            try {
                                const all = bodyEl.getElementsByTagName('*');
                                let maxBottom = 0;
                                for (let i = 0; i < all.length; i++) {
                                    try {
                                        const el = all[i];
                                        const tagName = el.tagName.toLowerCase();
                                        if (tagName === 'script' || tagName === 'style' || tagName === 'link') continue;
                                        
                                        // Skip elements inside closed details
                                        const closedDetails = el.closest('details:not([open])');
                                        if (closedDetails && el !== closedDetails && !el.closest('summary')) {
                                            continue;
                                        }

                                        // Skip hidden elements (display: none)
                                        if (el.offsetParent === null && el !== bodyEl && el !== htmlEl) {
                                            const style = iframe.contentWindow?.getComputedStyle(el);
                                            if (style && style.position !== 'fixed') continue;
                                        }

                                        const rect = el.getBoundingClientRect();
                                        if (rect.height <= 0 && rect.width <= 0) continue;

                                        let bottom = rect.top + (iframe.contentWindow?.pageYOffset || 0) + rect.height;
                                        if (el.scrollHeight > rect.height) {
                                            const style = iframe.contentWindow?.getComputedStyle(el);
                                            const overflowY = (style && style.overflowY) || '';
                                            if (overflowY !== 'hidden') {
                                                bottom += (el.scrollHeight - rect.height);
                                            }
                                        }
                                        if (bottom > maxBottom) maxBottom = bottom;
                                    } catch (e) {}
                                }
                                if (maxBottom > 0) h = maxBottom;
                            } catch (e) {}
                        }

                        if (origHtmlH) htmlEl.style.setProperty('height', origHtmlH); else htmlEl.style.removeProperty('height');
                        if (origHtmlMinH) htmlEl.style.setProperty('min-height', origHtmlMinH); else htmlEl.style.removeProperty('min-height');
                        if (origBodyH) bodyEl.style.setProperty('height', origBodyH); else bodyEl.style.removeProperty('height');
                        if (origBodyMinH) bodyEl.style.setProperty('min-height', origBodyMinH); else bodyEl.style.removeProperty('min-height');

                        h = Math.ceil(h + 8);
                        if (h < 30) h = 30;
                        iframe.style.height = `${h}px`;
                    };
                    syncHeight();
                    if (window.ResizeObserver) {
                        const ro = new window.ResizeObserver(() => syncHeight());
                        if (doc.body) ro.observe(doc.body);
                        ro.observe(doc.documentElement);
                    }
                    const syncInterval = setInterval(syncHeight, 500);
                    // Store the interval ID on the iframe so it can be cleaned up if needed
                    iframe.dataset.syncIntervalId = syncInterval;
                }
            });
            
            host.appendChild(iframe);
            if (iframe.contentWindow) htmlRenderFrames.set(iframe.contentWindow, iframe);
            return host;
        };

        const cleanupHtmlRenderFrames = (force = false) => {
            [...htmlRenderFrames.entries()].forEach(([win, frame]) => {
                if (force || !frame || !document.contains(frame)) {
                    const blobUrl = String(frame?.dataset?.blobUrl || '');
                    if (blobUrl) {
                        try {
                            URL.revokeObjectURL(blobUrl);
                        } catch {}
                    }
                    if (frame?.dataset?.syncIntervalId) {
                        try {
                            clearInterval(Number(frame.dataset.syncIntervalId));
                        } catch {}
                    }
                    htmlRenderFrames.delete(win);
                }
            });
        };

        const onHtmlFrameMessage = (event) => {
            let iframe = htmlRenderFrames.get(event.source);
            if (!iframe && event.source) {
                iframe = [...document.querySelectorAll('iframe.room-html-render-frame')].find(
                    f => f.contentWindow === event.source
                );
                if (iframe) {
                    htmlRenderFrames.set(event.source, iframe);
                }
            }
            if (!iframe) return;

            // Handle send2InputBox communication API
            if (event.data && typeof event.data.__roomHtmlRenderInput === 'string') {
                if (roomInput && !roomInput.disabled) {
                    const text = event.data.__roomHtmlRenderInput;
                    const val = roomInput.value || '';
                    roomInput.value = val ? val + '\n' + text : text;
                    roomInput.dispatchEvent(new Event('input', { bubbles: true }));
                    // Optional: automatically focus
                    roomInput.focus();
                }
                return;
            }

            // Handle persona/RN update API
            if (event.data && typeof event.data.__roomHtmlRenderPersonaContent === 'string') {
                updatePersonaRemote({ content: event.data.__roomHtmlRenderPersonaContent });
                return;
            }
            if (event.data && typeof event.data.__roomHtmlRenderPersonaDisplayName === 'string') {
                updatePersonaRemote({ displayName: event.data.__roomHtmlRenderPersonaDisplayName });
                return;
            }

            const h = Number(event.data?.__roomHtmlRenderHeight || 0);
            if (!Number.isFinite(h) || h <= 0) return;

            const currentH = parseFloat(iframe.style.height || 0);
            if (Math.abs(currentH - h) < 1.1) return;

            const panel = getRoomPanel();
            const shouldStickBottom = isNearBottom(120);

            iframe.style.height = `${h}px`;
            
            if (panel && shouldStickBottom) {
                scrollToBottom('auto');
            }
        };
        window.addEventListener('message', onHtmlFrameMessage);

        const applyDisplayRegex = (content) => {
            const source = String(content || '');
            const rules = Array.isArray(roomRegexState?.rules) ? roomRegexState.rules : [];
            if (!rules.length) {
                return source;
            }
            let output = source;
            rules.forEach((rule) => {
                const stages = Array.isArray(rule?.stages) ? rule.stages : [];
                if (!stages.includes('display')) {
                    return;
                }
                const pattern = String(rule.pattern || '');
                const flags = String(rule.flags || 'g');
                if (!pattern) {
                    return;
                }
                try {
                    output = output.replace(new RegExp(pattern, flags), String(rule.replacement ?? ''));
                } catch {
                    // Ignore invalid regex in display layer.
                }
            });
            return output;
        };

        const renderMarkdown = (content) => {
            const rawSource = String(content || '');
            let replaced = applyDisplayRegex(rawSource);
            
            // Fix for Markdown headers (###) not rendering correctly after custom HTML tags
            // If the regex replacement injected common block-level HTML tags, ensure they are followed by newlines.
            if (replaced.includes('</details>') || replaced.includes('</div>') || replaced.includes('</mdui-') || replaced.includes('</table>')) {
                // Heuristic: Add double newlines after common closing block tags if they aren't followed by one.
                replaced = replaced.replace(/(<\/(?:details|div|table|mdui-[a-z0-9-]+)>)(?!\n\n)/gi, '$1\n\n');
            }

            // If HTML render is blocked, we escape the source BEFORE passing to marked
            // We allow <style> tags here even if not in a code block yet, 
            // because they will be caught and sandboxed by applyMarkdownToTimeline fallback.
            const source = regexHtmlRenderEnabled
                ? stripDangerousHtml(replaced, true)
                : sanitizeMarkdownSource(replaced);

            const markedLib = typeof marked !== 'undefined' ? marked : (window.marked || null);
            if (markedLib) {
                try {
                    // Handle both old (function) and new (parse method) marked API
                    const parseFn = typeof markedLib.parse === 'function' ? markedLib.parse.bind(markedLib) : (typeof markedLib === 'function' ? markedLib : null);
                    if (parseFn) {
                        // Options bitmask or object depending on version
                        const options = { breaks: true, gfm: true, mangle: false, headerIds: false };
                        if (markedLib.setOptions) {
                            markedLib.setOptions(options);
                        }
                        return parseFn(source, options);
                    }
                } catch (e) {
                    console.error('Markdown parse error:', e);
                }
            }
            
            console.warn('Markdown library (marked) is not available, falling back to primitive renderer.');
            const blocks = source.split(/\n{2,}/);
            return blocks.map(block => `<p style="margin-top: 0; margin-bottom: 1em;">${block.replace(/\n/g, '<br>')}</p>`).join('');
        };

        const applyMarkdownToTimeline = (container = roomTimeline, isStreaming = false) => {
            if (!container) return;
            if (!isStreaming) cleanupHtmlRenderFrames();
            container.querySelectorAll('.markdown-body').forEach((el) => {
                if (el.dataset.rendered) return;
                // Prefer textContent to get the original un-escaped markdown source from the escaped EJS/JS render
                const source = (typeof el._rawContent === 'string') ? el._rawContent : el.textContent;
                el.innerHTML = renderMarkdown(source);
                if (wholeHtmlBlockRenderEnabled && !isStreaming) {
                    let replacedHtmlBlock = false;
                    el.querySelectorAll('pre > code').forEach((codeNode) => {
                        const rawCode = decodeHtmlEntities(codeNode.textContent || '');
                        if (!isLikelyHtmlSnippet(rawCode)) return;
                        const rendered = createScopedHtmlHost(rawCode, jsRenderEnabled);
                        const pre = codeNode.closest('pre');
                        if (pre) {
                            pre.replaceWith(rendered);
                            replacedHtmlBlock = true;
                        }
                    });

                    // Auto-sandbox if the rendered result contains global styling or layout tags, or executable script tags
                    const renderedHtml = el.innerHTML;
                    if (!replacedHtmlBlock && (/<style[\s>]/i.test(renderedHtml) || /<html[\s>]/i.test(renderedHtml) || /<body[\s>]/i.test(renderedHtml) || /<script[\s>]/i.test(renderedHtml))) {
                        const rawSource = applyDisplayRegex(decodeHtmlEntities(source)); 
                        const sandbox = createScopedHtmlHost(rawSource, jsRenderEnabled);
                        el.innerHTML = '';
                        el.appendChild(sandbox);
                        replacedHtmlBlock = true;
                    }

                    if (replacedHtmlBlock) {
                        const card = el.closest('.room-floor-content');
                        if (card) card.classList.add('contains-html-render');
                    }
                }
                // Also detect inline HTML block elements rendered directly via regex HTML render
                if (!el.closest('.contains-html-render')) {
                    const hasBlockHtml = el.querySelector('details, table, figure, img, video, iframe, canvas, svg, fieldset, form, hr');
                    if (hasBlockHtml) {
                        const card = el.closest('.room-floor-content');
                        if (card) card.classList.add('contains-html-render');
                    }
                }
                applyPairedSymbolHighlight(el);
                el.dataset.rendered = '1';
            });
        };

        const getRoomPanel = () => document.querySelector('.room-stream-panel');
        const getMainLayoutScroller = () => document.querySelector('mdui-layout-main');

        const capturePageScrollSnapshot = () => {
            const scrollingEl = document.scrollingElement;
            const canScrollWindow = !!(
                scrollingEl
                && (scrollingEl.scrollHeight - scrollingEl.clientHeight > 2)
            );
            const main = getMainLayoutScroller();
            const canScrollMain = !!(
                main
                && (main.scrollHeight - main.clientHeight > 2)
            );
            return {
                canScrollWindow,
                canScrollMain,
                windowY: canScrollWindow ? Number(window.scrollY || window.pageYOffset || 0) : 0,
                mainTop: canScrollMain ? Number(main.scrollTop || 0) : 0,
            };
        };

        const restorePageScrollSnapshot = (snapshot) => {
            if (!snapshot) return;
            const main = getMainLayoutScroller();
            if (snapshot.canScrollMain && main) {
                main.scrollTop = Number(snapshot.mainTop || 0);
            }
            if (snapshot.canScrollWindow) {
                window.scrollTo(0, Number(snapshot.windowY || 0));
            }
        };

        const schedulePageScrollStabilize = (snapshot) => {
            if (!snapshot) return;
            if (!snapshot.canScrollWindow && !snapshot.canScrollMain) return;
            pageScrollStabilizeTimers.forEach((timer) => clearTimeout(timer));
            pageScrollStabilizeTimers = [];
            [0, 32, 120, 320].forEach((delay) => {
                const timer = setTimeout(() => restorePageScrollSnapshot(snapshot), delay);
                pageScrollStabilizeTimers.push(timer);
            });
        };

        const getMessageRenderKey = (msg, index) => {
            const rawId = msg?.id;
            if (rawId !== null && rawId !== undefined && String(rawId).trim()) {
                return String(rawId);
            }
            return `k_${String(msg?.floorNo || index + 1)}_${String(msg?.speakerType || 'msg')}_${String(msg?.username || '')}_${index}`;
        };

        const findAnchorByRenderKey = (panel, key) => {
            if (!panel || !key) return null;
            const anchors = panel.querySelectorAll('article[data-msg-key]');
            for (const anchor of anchors) {
                if (String(anchor.getAttribute('data-msg-key') || '') === key) {
                    return anchor;
                }
            }
            return null;
        };

        const capturePanelSnapshot = (panel) => {
            if (!panel) return null;
            const shouldStickBottom = isNearBottom();
            const snapshot = {
                shouldStickBottom,
                progress: 0,
                anchorKey: '',
                anchorOffset: 0,
            };
            const previousScrollable = Math.max(1, panel.scrollHeight - panel.clientHeight);
            snapshot.progress = panel.scrollTop / previousScrollable;

            if (shouldStickBottom) {
                return snapshot;
            }

            const panelRect = panel.getBoundingClientRect();
            const anchors = panel.querySelectorAll('article[data-msg-key]');
            for (const anchor of anchors) {
                const rect = anchor.getBoundingClientRect();
                if (rect.bottom >= panelRect.top + 8) {
                    snapshot.anchorKey = String(anchor.getAttribute('data-msg-key') || '');
                    snapshot.anchorOffset = rect.top - panelRect.top;
                    break;
                }
            }
            return snapshot;
        };

        const restorePanelSnapshot = (panel, snapshot) => {
            if (!panel || !snapshot) return;
            if (snapshot.shouldStickBottom) {
                // Ensure layout has settled before scrolling to bottom
                requestAnimationFrame(() => scrollToBottom('auto'));
                return;
            }

            if (snapshot.anchorKey) {
                const panelRect = panel.getBoundingClientRect();
                const anchor = findAnchorByRenderKey(panel, snapshot.anchorKey);
                if (anchor) {
                    const newOffset = anchor.getBoundingClientRect().top - panelRect.top;
                    panel.scrollTop += (newOffset - snapshot.anchorOffset);
                    return;
                }
            }

            const nextScrollable = Math.max(0, panel.scrollHeight - panel.clientHeight);
            panel.scrollTop = Math.min(nextScrollable, Math.max(0, snapshot.progress * nextScrollable));
        };

        if (roomDiagnosticsBtn && roomDiagnosticsDialog && roomDiagnosticsContent) {
            roomDiagnosticsBtn.onclick = () => {
                const renderDiagnostics = (data) => {
                    const contentEl = roomDiagnosticsContent;
                    if (!data || !Array.isArray(data.requestMessages)) {
                        contentEl.innerHTML = `
                            <div style="text-align: center; padding: 40px; opacity: 0.6;">
                                <mdui-icon name="history" style="font-size: 48px; margin-bottom: 12px;"></mdui-icon>
                                <div>${__('room.no_api_diag_logs')}</div>
                            </div>
                        `;
                        return;
                    }

                    const messages = data.requestMessages;
                    const model = data.selectedModel || __('room.unknown_model');
                    
                    let html = `
                        <div style="padding: 12px; background: rgb(var(--mdui-color-surface-container-high)); border-radius: 12px; margin-bottom: 12px; border: 1px solid rgb(var(--mdui-color-outline-variant));">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-weight: 700; color: rgb(var(--mdui-color-primary));">${__('room.model')}: ${escapeHtml(model)}</span>
                                <span style="font-family: var(--mdui-font-family-mono); opacity: 0.7;">Tokens: ${data.tokenUsed || 0}</span>
                            </div>
                            <div style="font-size: 12px; opacity: 0.7;">
                                ${__('room.triggered_worldbook')}: ${data.triggeredWorldInfoCount || 0} (${(data.triggeredWorldInfoIds || []).join(', ') || '—'})
                            </div>
                        </div>
                    `;

                    html += messages.map((m, idx) => {
                        const isSystem = m.role === 'system';
                        const isAssistant = m.role === 'assistant';
                        const bgColor = isSystem ? 'rgb(var(--mdui-color-surface-container-highest))' : (isAssistant ? 'rgb(var(--mdui-color-primary-container))' : 'rgb(var(--mdui-color-surface-container-low))');
                        const borderColor = isSystem ? 'rgb(var(--mdui-color-outline))' : (isAssistant ? 'rgb(var(--mdui-color-primary))' : 'rgb(var(--mdui-color-outline-variant))');
                        const roleColor = isSystem ? 'rgb(var(--mdui-color-error))' : (isAssistant ? 'rgb(var(--mdui-color-primary))' : 'rgb(var(--mdui-color-secondary))');
                        
                        return `
                            <div style="padding: 12px; background: ${bgColor}; border-left: 4px solid ${borderColor}; border-radius: 8px; margin-bottom: 8px;">
                                <div style="font-weight: 700; color: ${roleColor}; margin-bottom: 4px; display: flex; justify-content: space-between;">
                                    <span>${m.role.toUpperCase()}</span>
                                    <span style="opacity: 0.5;">#${idx}</span>
                                </div>
                                <div style="white-space: pre-wrap; font-family: var(--mdui-font-family-mono); font-size: 13px; line-height: 1.5; opacity: 0.9;">${escapeHtml(m.content)}</div>
                            </div>
                        `;
                    }).join('');

                    contentEl.innerHTML = html;
                };

                renderDiagnostics(latestDiagnostics);
                roomDiagnosticsDialog.open = true;
            };
        }

        // --- Persona Editor Handled Above ---

        // --- Sequence Priority Optimization ---
        // Ensure that if a dialog is open, overlay clicks only close the dialog, not both the dialog and drawer.
        const allRoomDialogs = document.querySelectorAll('mdui-dialog');
        allRoomDialogs.forEach(dialog => {
            dialog.addEventListener('overlay-click', (e) => {
                // MDUI handles dialog close on overlay click by default. 
                // We stop propagation if needed to prevent others from reacting.
                e.stopPropagation();
            });
        });

        if (roomInfoDrawer) {
            roomInfoDrawer.addEventListener('overlay-click', (e) => {
                // If any room dialog is open, prevent drawer from closing on this specific click.
                const anyDialogOpen = Array.from(allRoomDialogs).some(d => d.open);
                if (anyDialogOpen) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
        }

        const isNearBottom = (threshold = 10) => {
            const panel = getRoomPanel();
            if (!panel) return false;
            // More robust check: use a small threshold to account for floating point errors
            const distance = panel.scrollHeight - (panel.scrollTop + panel.clientHeight);
            return distance <= threshold;
        };

        const scrollToBottom = (behavior = 'auto') => {
            const panel = getRoomPanel();
            if (!panel) return;
            panel.scrollTo({ top: panel.scrollHeight, behavior });
        };

        const getStreamingBubble = () => roomTimeline?.querySelector('[data-streaming-bubble="1"]') || null;

        const clearStreamingBubble = () => {
            const bubble = getStreamingBubble();
            if (bubble) bubble.remove();
            streamContentEl = null;
            streamingRoundNo = 0;
        };

        const ensureStreamingBubble = (roundNo) => {
            if (!roomTimeline) return null;
            const safeRoundNo = Number(roundNo || 0);
            if (streamingRoundNo && safeRoundNo && safeRoundNo !== streamingRoundNo) {
                clearStreamingBubble();
            }

            const exists = getStreamingBubble();
            if (exists) {
                streamContentEl = exists.querySelector('.markdown-body');
                if (safeRoundNo) streamingRoundNo = safeRoundNo;
                return streamContentEl;
            }

            const thinking = roomTimeline.querySelector('.thinking-bubble');
            if (thinking) thinking.remove();

            const bubble = document.createElement('article');
            bubble.className = 'room-floor-card ai streaming-bubble';
            bubble.dataset.streamingBubble = '1';
            bubble.innerHTML = `
                <img class="room-floor-avatar" src="${narratorAvatar}" alt="Avatar">
                <div class="room-floor-main">
                    <div class="room-floor-head">
                        <span class="room-player-title">${escapeHtml(narratorName)}</span>
                        <mdui-badge class="room-inline-badge" variant="warning">${__('room.generating')}</mdui-badge>
                    </div>
                    <mdui-card class="room-floor-content room-message-card" variant="filled">
                        <div class="room-player-line markdown-body"></div>
                    </mdui-card>
                </div>
            `;
            roomTimeline.appendChild(bubble);
            streamContentEl = bubble.querySelector('.markdown-body');
            if (streamContentEl) streamContentEl._rawContent = '';
            streamingRoundNo = safeRoundNo;
            if (isNearBottom()) {
                scrollToBottom('smooth');
            }
            return streamContentEl;
        };

        const buildPendingReadyMessages = (members, messages) => {
            const safeMembers = Array.isArray(members) ? members : [];
            const safeMessages = Array.isArray(messages) ? messages : [];
            
            const normalizeContent = (c) => String(c || '').trim().replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n\n');

            const existing = new Set(
                safeMessages
                    .slice(-60) // Increased window for safety
                    .filter((msg) => msg.speakerType === 'player' || !msg.speakerType)
                    .map((msg) => {
                        const uname = String(msg.username || '').trim();
                        const ucontent = normalizeContent(msg.content);
                        return `${uname}::${ucontent}`;
                    }),
            );


            return safeMembers
                .filter((member) => member.isOnline !== false && member.isReady && String(member.lastInput || '').trim())
                .map((member) => ({
                    id: `pending_${String(member.username || '')}`,
                    speakerType: 'player',
                    username: member.username,
                    displayName: member.displayName || member.username,
                    userId: member.isSelf ? selfUserId : null,
                    content: String(member.lastInput || '').trim(),
                    pending: true,
                    meta: { source: 'player_submit' },
                }))
                .filter((item) => {
                    const itemKey = `${String(item.username || '').trim()}::${normalizeContent(item.content)}`;
                    return !existing.has(itemKey);
                });

        };

        const splitGroupedPlayerMessagesForUi = (messages) => {
            const source = Array.isArray(messages) ? messages : [];
            const expanded = [];
            source.forEach((msg) => {
                const isPlayer = String(msg?.speakerType || '') === 'player';
                const rawContent = String(msg?.content || '').trim();
                const groupedByMeta = String(msg?.meta?.source || '') === 'player_submit_group';
                const blocks = rawContent ? rawContent.split(/\n{2,}/).map((item) => String(item || '').trim()).filter(Boolean) : [];

                // Frontend-only compatibility: old grouped messages are split into per-player bubbles.
                if (isPlayer && (groupedByMeta || blocks.length > 1)) {
                    const parsed = blocks
                        .map((block) => {
                            const match = block.match(/^([^:\n]{1,80})\s*:\s*([\s\S]+)$/);
                            if (!match) return null;
                            return {
                                username: String(match[1] || '').trim(),
                                content: String(match[2] || '').trim(),
                            };
                        })
                        .filter(Boolean);
                    if (parsed.length >= 2) {
                        const baseFloor = Number(msg.floorNo || 0);
                        parsed.forEach((item, index) => {
                            expanded.push({
                                ...msg,
                                id: null,
                                userId: null,
                                username: item.username || msg.username,
                                content: item.content || '',
                                floorNo: Number.isFinite(baseFloor) && baseFloor > 0 ? (baseFloor + index) : (msg.floorNo || 0),
                                meta: {
                                    ...(msg.meta || {}),
                                    source: 'player_submit',
                                    uiSplitFromGroup: true,
                                },
                            });
                        });
                        return;
                    }
                }
                expanded.push(msg);
            });
            return expanded;
        };

        const renderTimeline = (messages, members = []) => {
            if (!roomTimeline) return;
            const safeMessages = splitGroupedPlayerMessagesForUi(Array.isArray(messages) ? [...messages].filter(m => !m.meta?.deleted) : []);
            const hasOpening = safeMessages.some((msg) => String(msg?.meta?.source || '') === 'character_opening');
            if (!hasOpening && String(currentNarratorOpening || '').trim()) {
                safeMessages.unshift({
                    id: 'synthetic_opening',
                    speakerType: 'ai',
                    username: narratorName,
                    content: String(currentNarratorOpening || '').trim(),
                    meta: { source: 'character_opening', synthetic: true },
                    createdAt: null,
                });
            }
            const pendingMessages = buildPendingReadyMessages(members, safeMessages);
            const timelineMessages = [...safeMessages, ...pendingMessages].map((item, index) => ({
                ...item,
                _renderKey: getMessageRenderKey(item, index),
            }));
            latestTimelineMessages = safeMessages;
            latestMembersState = Array.isArray(members) ? members : [];
            const nextSignature = timelineMessages.map((message) => {
                const source = String(message?.meta?.source || '');
                const edited = message?.meta?.edited ? '1' : '0';
                const createdAt = String(message?.createdAt || '');
                return `${message._renderKey}:${message.content}:${message.pending ? 'p' : 'n'}:${source}:${edited}:${createdAt}`;
            }).join('|');
            const isFirstRender = !renderedSignature;
            if (nextSignature && renderedSignature === nextSignature) return;
            renderedSignature = nextSignature;

            // Robust scroll pinning: Detect if we're near bottom before update
            // Using a larger threshold (100px) to handle dynamic content loading better
            const pinnedToBottom = isNearBottom(100);
            const currentClientHeight = roomTimeline.clientHeight;
            if (currentClientHeight > 0) {
                roomTimeline.style.minHeight = currentClientHeight + 'px';
            }

            if (!timelineMessages.length) {
                roomTimeline.innerHTML = `
                    <mdui-card class="empty-state" variant="outlined">
                        <mdui-icon name="forum_outline"></mdui-icon>
                        <p>${__('room.no_messages')}</p>
                    </mdui-card>
                `;
                return;
            }

            const panel = getRoomPanel();
            const panelSnapshot = capturePanelSnapshot(panel);

            // AI Streaming Protection: Save active streaming bubble if present
            const activeStreamingBubble = getStreamingBubble();
            let streamingBubbleContent = null;
            if (activeStreamingBubble) {
                // If it's still being updated, we temporarily move it to a safe place
                streamingBubbleContent = activeStreamingBubble;
                activeStreamingBubble.remove();
            }
            roomTimeline.innerHTML = timelineMessages.map((msg, index) => {
                const floorNo = Number(msg.floorNo || index + 1);
                const isAiMessage = msg.speakerType === 'ai';
                const isSystemMessage = msg.speakerType === 'system';
                const isSelf = String(msg.userId || '') === selfUserId;
                let displayName = isAiMessage ? narratorName : (isSystemMessage ? __('room.system_message') : '');
                if (!displayName) {
                    const memberInfo = members.find(m => m.userid === msg.userid || m.username === msg.userid || m.userid === msg.username || m.username === msg.username);
                    if (memberInfo && memberInfo.displayName) {
                        displayName = memberInfo.displayName;
                    } else {
                        displayName = String(msg.displayName || msg.username || msg.userid || `Player ${floorNo}`);
                    }
                }
                
                return `
                    <article class="room-floor-card ${isSystemMessage ? 'system' : (isAiMessage ? 'ai' : 'player')} ${isSelf ? 'is-self' : ''} ${msg.pending ? 'pending' : ''}" data-floor="${floorNo}" data-msg-id="${msg.id}" data-msg-key="${msg._renderKey}">
                        <img class="room-floor-avatar" src="${isSystemMessage ? '/img/system-avatar.png' : (isAiMessage ? narratorAvatar : ('/api/user/avatar/' + encodeURIComponent(msg.userid || msg.username || 'player')))}" alt="Avatar" onerror="this.src='/api/user/avatar/system'">
                        <div class="room-floor-main">
                            <div class="room-floor-head">
                                <span class="room-player-title">${escapeHtml(displayName)}</span>
                                ${isSystemMessage ? '<mdui-badge class="room-inline-badge" variant="secondary">' + __('room.system_message') + '</mdui-badge>' : ''}
                                ${(msg.meta?.source === 'character_opening') ? '<mdui-badge class="room-inline-badge" variant="success">' + __('room.opening') + '</mdui-badge>' : ''}
                                ${msg.pending ? '<mdui-badge class="room-inline-badge room-pending-badge" variant="primary"><mdui-icon class="room-pending-icon" name="schedule"></mdui-icon>' + __('room.pending') + '</mdui-badge>' : ''}
                                ${msg.meta?.edited ? '<mdui-badge class="room-inline-badge" variant="secondary">' + __('room.edited') + '</mdui-badge>' : ''}
                                ${msg.createdAt ? `<span class="room-message-time">${escapeHtml(formatMessageTime(msg.createdAt))}</span>` : ''}
                                <span class="floor-number">#${floorNo}</span>
                            </div>
                            <mdui-card class="room-floor-content room-message-card ${isSystemMessage ? 'system-content' : ''}" variant="${isSystemMessage ? 'outlined' : 'filled'}">
                                <div class="room-player-line markdown-body">${escapeHtml(msg.content || '')}</div>
                                ${msg.meta && (msg.meta.tokens || msg.meta.seconds) ? `
                                    <div class="room-message-metrics-line">
                                        [${msg.meta.seconds ? msg.meta.seconds + 's' : ''}${msg.meta.seconds && msg.meta.tokens ? ' | ' : ''}${msg.meta.tokens ? msg.meta.tokens + 't' : ''}]
                                    </div>
                                ` : ''}
                            </mdui-card>
                            ${!isSystemMessage ? `
                            <div class="room-floor-actions">
                                <mdui-button-icon class="room-floor-copy-btn" icon="content_copy" variant="text" size="small" data-id="${escapeHtml(String(msg.id || ''))}" data-content="${escapeHtml(String(msg.content || ''))}"></mdui-button-icon>
                                <mdui-button-icon class="room-floor-edit-btn" icon="edit" variant="text" size="small" data-id="${escapeHtml(String(msg.id || ''))}" data-pending="${msg.pending ? '1' : '0'}"></mdui-button-icon>
                                ${isHostUser ? `<mdui-button-icon class="room-floor-delete-btn" icon="delete" variant="text" size="small" data-id="${escapeHtml(String(msg.id || ''))}" style="color:rgb(var(--mdui-color-error));"></mdui-button-icon>` : ''}
                            </div>
                            ` : ''}
                        </div>
                    </article>
                `;
            }).join('');
            
            // Re-insert streaming bubble if we saved it
            if (streamingBubbleContent && roomTimeline) {
                roomTimeline.appendChild(streamingBubbleContent);
            }

            applyMarkdownToTimeline();
            if (window.mdui?.mutation) window.mdui.mutation();
            
            // Restore scroll or pin to bottom
            if (pinnedToBottom) {
                scrollToBottom('auto');
            } else if (!isFirstRender) {
                restorePanelSnapshot(panel, panelSnapshot);
            }

            // Release the scroll jump lock with a slight delay for layout stability
            setTimeout(() => {
                if (roomTimeline) roomTimeline.style.minHeight = '';
                // Final re-pin after layout settles if we were pinned
                if (pinnedToBottom) scrollToBottom('auto');
            }, 50);
        };

        const setLocalEditBadge = (messageId, text, variant = 'secondary') => {
            const selector = String(messageId || '');
            const target = roomTimeline?.querySelector(`article[data-msg-id="${selector}"] .room-floor-head`);
            if (!target) return;
            let badge = target.querySelector('[data-edit-status-badge="1"]');
            if (!badge) {
                badge = document.createElement('mdui-badge');
                badge.style.marginLeft = '4px';
                badge.dataset.editStatusBadge = '1';
                target.insertBefore(badge, target.querySelector('.floor-number') || null);
            }
            badge.setAttribute('variant', variant);
            badge.textContent = String(text || '');
        };

        const renderMembers = (members) => {
            if (!roomMembersList) return;
            const safeMembers = Array.isArray(members) ? members : [];
            roomMembersList.innerHTML = safeMembers.map((member) => {
                let statusText = __('room.thinking');
                let statusColor = 'rgb(var(--mdui-color-on-surface-variant))';
                let isOnline = member.isOnline !== false && !member.isLeft;
                if (member.isLeft) { statusText = __('room.left'); isOnline = false; }
                else if (member.isOnline === false) { statusText = __('room.offline'); isOnline = false; }
                else if (member.isReady) { statusText = __('room.ready'); statusColor = 'rgb(var(--mdui-color-primary))'; }
                const dotHtml = `<span class="member-online-dot${isOnline ? ' online' : ' offline'}" data-member-online style="position:absolute; bottom:-2px; right:-2px; width:10px; height:10px; border-radius:50%; border:2px solid rgb(var(--mdui-color-surface-container-low)); background:${isOnline ? '#4caf50' : 'rgb(var(--mdui-color-outline))'}; flex-shrink:0;"></span>`;
                return `
                    <mdui-list-item rounded data-member-userid="${escapeHtml(String(member.userid || ''))}">
                        <div slot="icon" style="position:relative; width:32px; height:32px;">
                            <mdui-avatar src="/api/user/avatar/${encodeURIComponent(member.userid || member.username || 'player')}" style="width:32px; height:32px;"></mdui-avatar>
                            ${dotHtml}
                        </div>
                        ${escapeHtml(member.displayName || member.username || member.userid || '')}
                        <span slot="end-icon" class="mdui-typo-caption" style="font-weight: 600; color: ${statusColor};" data-member-status>${statusText}</span>
                    </mdui-list-item>
                `;
            }).join('');
        };

        const notifyReadyStateChanges = (members) => {
            const safeMembers = Array.isArray(members) ? members : [];
            if (!hasInitializedReadyState) {
                safeMembers.forEach((member) => {
                    if (member.isSelf) return;
                    memberReadyStateMap.set(String(member.username || ''), !!member.isReady);
                });
                hasInitializedReadyState = true;
                return;
            }

            safeMembers.forEach((member) => {
                if (member.isSelf) return;
                const username = String(member.username || __('room.unknown_player'));
                const nextReady = !!member.isReady;
                const prevReady = memberReadyStateMap.get(username);
                if (prevReady === undefined) {
                    memberReadyStateMap.set(username, nextReady);
                    if (nextReady) {
                        showTopReadySnackbar(__('room.ready_notification', { username }));
                    }
                    return;
                }
                if (prevReady !== nextReady) {
                    memberReadyStateMap.set(username, nextReady);
                    window.showSnackbar(nextReady ? __('room.ready_notification', { username }) : __('room.unready_notification', { username }), 'ready');
                }
            });
        };

        const syncSelfState = (members) => {
            const safeMembers = Array.isArray(members) ? members : [];
            const self = safeMembers.find((member) => member.isSelf);
            if (!self) return;

            // Only sync into local input if local is currently empty or user is not focuses.
            // This prevents the server from wiping a draft the user is currently typing.
            if (roomInput && document.activeElement !== roomInput && !self.isReady && !isProcessing) {
                const localVal = String(roomInput.value || '').trim();
                const remoteVal = String(self.lastInput || '').trim();
                if (!localVal) {
                    roomInput.value = remoteVal;
                }
            }

            if (roomEditButton) roomEditButton.style.display = (self.isReady && !isProcessing) ? '' : 'none';
            if (roomReadyButton) {
                roomReadyButton.classList.toggle('ready-active', !!self.isReady);
                roomReadyButton.icon = self.isReady ? 'check_circle' : 'send';
                roomReadyButton.title = self.isReady ? __('room.not_ready') : __('room.submit_ready');
                roomReadyButton.disabled = isProcessing || isSubmitting;
                // If it was already in a loading state, reset it once we get a firm status
                roomReadyButton.loading = false;
            }
            if (roomInput) roomInput.disabled = !!self.isReady || isProcessing;
        };

        const setSubmitState = (submitting) => {
            isSubmitting = !!submitting;
            if (roomReadyButton) roomReadyButton.disabled = submitting || isProcessing;
            if (roomEditButton) roomEditButton.disabled = submitting || isProcessing;
            if (roomPresetApply) roomPresetApply.disabled = submitting || isProcessing;
            if (roomOpeningApply) roomOpeningApply.disabled = submitting || isProcessing;
        };

        const createThinkingBubble = () => {
            if (!roomTimeline || roomTimeline.querySelector('.thinking-bubble') || getStreamingBubble()) return;
            const bubble = document.createElement('article');
            bubble.className = 'room-floor-card ai thinking-bubble';
            bubble.innerHTML = `
                <img class="room-floor-avatar" src="${narratorAvatar}" alt="Avatar">
                <div class="room-floor-main">
                    <div class="room-floor-head">
                        <span class="room-player-title">${escapeHtml(narratorName)}</span>
                        <mdui-badge class="room-inline-badge" variant="warning">${__('room.generating')}</mdui-badge>
                    </div>
                    <mdui-card class="room-floor-content room-message-card" variant="filled">
                        <div class="room-player-line">
                            <mdui-circular-progress class="room-thinking-progress" size="small"></mdui-circular-progress>
                            ${__('room.ai_thinking')}
                        </div>
                    </mdui-card>
                </div>
            `;
            roomTimeline.appendChild(bubble);
            if (isNearBottom()) {
                scrollToBottom('smooth');
            }
        };

        const updateProcessingState = (processing) => {
            if (isProcessing === processing) {
                if (isProcessing && !roomTimeline.querySelector('.thinking-bubble') && !getStreamingBubble()) {
                    createThinkingBubble();
                }
                return;
            }
            isProcessing = processing;
            if (!composer) return;

            if (isProcessing) {
                composer.classList.add('processing');
                if (roomInput) roomInput.placeholder = __('room.ai_thinking_placeholder');
                createThinkingBubble();
            } else {
                composer.classList.remove('processing');
                if (roomInput) roomInput.placeholder = __('room.input_placeholder_full');
                const bubble = roomTimeline.querySelector('.thinking-bubble');
                if (bubble) bubble.remove();
            }
        };

        const applyRoomState = (state) => {
            const room = state?.room || {};
            const members = Array.isArray(state?.members) ? state.members : [];
            currentNarratorOpening = String(state?.narrator?.opening || '').trim();

            // Stability: Capture current scroll positions before updating the DOM
            const pageSnapshot = capturePageScrollSnapshot();
            const panel = getRoomPanel();
            const panelSnapshot = capturePanelSnapshot(panel);

            updateProcessingState(!!room.isProcessing);
            if (!room.isProcessing) clearStreamingBubble();
            if (floorValue) floorValue.textContent = String(Number(room.floorCount || 0));
            if (presetCurrent) presetCurrent.textContent = state?.session?.presetFile || __('room.default_params');
            if (progress) progress.textContent = `${members.filter((item) => item.isReady).length}/${members.length}`;
            const rawMessages = Array.isArray(state?.messages) ? state.messages : [];
            
            // Deduplication and local pending state synchronization
            const renderMessages = Array.isArray(state?.messages) ? [...state.messages] : [];
            renderTimeline(renderMessages, members);
            renderMembers(members);
            notifyReadyStateChanges(members);
            syncSelfState(members);

            // Restoration: Stabilize scroll and handle potential layout shifts
            if (panel && panelSnapshot) {
                restorePanelSnapshot(panel, panelSnapshot);
            }
            if (pageSnapshot) {
                schedulePageScrollStabilize(pageSnapshot);
            }

            if (roomOpeningSelector) {
                const options = Array.isArray(state?.narrator?.openingOptions) && state.narrator.openingOptions.length
                    ? state.narrator.openingOptions
                    : [String(state?.narrator?.opening || '')].filter(Boolean);
                roomOpeningSelector.innerHTML = options.map((item, index) => `
                    <mdui-menu-item value="${escapeHtml(item)}">${__('room.option_plan', { index: index + 1 })}</mdui-menu-item>
                `).join('');
                const selectedOpening = String(room.selectedOpening || state?.narrator?.opening || options[0] || '');
                roomOpeningSelector.value = selectedOpening;
                roomOpeningSelector.disabled = !room.isHost || !!room.openingLocked || !!room.isProcessing || isSubmitting;
            }
            if (roomOpeningApply) {
                roomOpeningApply.disabled = !(room.isHost) || !!room.openingLocked || !!room.isProcessing || isSubmitting;
            }
        };

        const applyPresetState = (state) => {
            if (!roomPresetSelector || !state) return;
            const currentPresetFile = String(state.currentPresetFile || '');
            const presets = Array.isArray(state.presets) ? state.presets : [];
            roomPresetSelector.innerHTML = [
                '<mdui-menu-item value="">' + __('room.default_params_desc') + '</mdui-menu-item>',
                ...presets.map((preset) => `<mdui-menu-item value="${escapeHtml(preset.fileName || '')}">${escapeHtml(preset.displayName || '')}</mdui-menu-item>`),
            ].join('');
            roomPresetSelector.value = currentPresetFile;
        };

        const applyRegexState = (state) => {
            if (!state) return;
            roomRegexState = state;
            if (roomRegexPresetName) {
                roomRegexPresetName.textContent = String(state.currentPresetName || state.currentPresetFile || __('room.default_params'));
            }
            if (!roomRegexList) return;
            const rules = Array.isArray(state.rules) ? state.rules : [];
            if (!rules.length) {
                roomRegexList.innerHTML = '<mdui-list-item rounded icon="info">' + __('room.no_matching_rules') + '</mdui-list-item>';
                return;
            }
            roomRegexList.innerHTML = rules.map((rule, index) => `
                <mdui-list-item rounded>
                    <span slot="headline">${escapeHtml(rule.name || __('room.rule_n', { index: index + 1 }))}</span>
                    <span slot="description">${escapeHtml(rule.pattern || '')}</span>
                    <span slot="end-icon">${rule.source === 'character' ? __('room.character_card') : __('room.preset')} · ${(Array.isArray(rule.stageLabels) ? rule.stageLabels.join('/') : '')} · ${escapeHtml(rule.flags || 'g')}</span>
                </mdui-list-item>
            `).join('');

            // Regex state is fetched asynchronously; force a re-render so display-scope rules
            // apply immediately to already-rendered timeline messages.
            renderedSignature = '';
            renderTimeline(latestTimelineMessages, latestMembersState);
        };

        const fetchRoomState = async () => {
            try {
                const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/state`);
                if (!res.ok) return;
                const payload = await res.json();
                if (payload.ok) applyRoomState(payload.state);
            } catch {
                // Ignore transient pull failure.
            }
        };

        const fetchRegexState = async () => {
            if (!roomRegexList && !roomRegexPresetName) return;
            try {
                const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/regex`);
                if (!res.ok) return;
                const payload = await res.json();
                if (payload.ok) applyRegexState(payload.state);
            } catch {
                // Ignore transient pull failure.
            }
        };

        const saveRoomRenderPreferences = async () => {
            const res = await fetch('/api/settings/preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    regexHtmlRenderEnabled: !!regexHtmlRenderEnabled,
                    wholeHtmlBlockRenderEnabled: !!wholeHtmlBlockRenderEnabled,
                }),
            });
            const payload = await res.json();
            if (!payload.ok) {
                throw new Error(payload.error || __('room.save_preference_failed'));
            }
            regexHtmlRenderEnabled = payload?.settings?.regexHtmlRenderEnabled !== false;
            wholeHtmlBlockRenderEnabled = payload?.settings?.wholeHtmlBlockRenderEnabled !== false;
        };

        const fetchPresetState = async () => {
            if (!roomPresetSelector) return;
            try {
                const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/presets`);
                if (!res.ok) return;
                const payload = await res.json();
                if (payload.ok) applyPresetState(payload.state);
            } catch {
                // Ignore transient pull failure.
            }
        };

        let roomReconnectCount = 0;
        const connectRoomSocket = () => {
            if (!roomCode) return;
            if (roomSocket && (roomSocket.readyState === WebSocket.OPEN || roomSocket.readyState === WebSocket.CONNECTING)) return;

            roomSocket = new WebSocket(buildWsUrl('room', roomCode));
            roomSocket.onopen = () => {
                const wasDisconnected = roomReconnectCount > 0;
                isWsConnected = true;
                roomReconnectCount = 0; // Reset count on successful connection
                if (roomConnectionStatus) roomConnectionStatus.style.display = 'none';
                if (roomReadyButton) roomReadyButton.disabled = false;
                
                if (wasDisconnected) {
                    window.showSnackbar(__('room.server_reconnected'), 'success');
                    fetchRoomState();
                    fetchPresetState();
                    fetchRegexState();
                }

                if (roomHeartbeatTimer) clearInterval(roomHeartbeatTimer);
                roomHeartbeatTimer = setInterval(() => {
                    if (!roomSocket || roomSocket.readyState !== WebSocket.OPEN) return;
                    try {
                        roomSocket.send(JSON.stringify({ type: 'heartbeat' }));
                    } catch {
                        // Ignore heartbeat send failures.
                    }
                }, 8000);
            };
            roomSocket.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data || '{}');
                    if (payload.type === 'room.state') {
                        applyRoomState(payload.state);
                        return;
                    }
                    if (payload.type === 'room.presets') {
                        applyPresetState(payload.state);
                        if (roomRegexDialog?.open) {
                            fetchRegexState();
                        }
                        return;
                    }
                    if (payload.type === 'room.stream') {
                        const streamEvent = payload.event || {};
                        const phase = String(streamEvent.phase || '');
                        if (phase === 'diagnostics') {
                            latestDiagnostics = streamEvent.diagnostics;
                            return;
                        }
                        if (phase === 'start') {
                            ensureStreamingBubble(streamEvent.roundNo);
                            return;
                        }
                        if (phase === 'chunk') {
                            const contentEl = ensureStreamingBubble(streamEvent.roundNo);
                            if (!contentEl) return;
                            const delta = String(streamEvent.delta || '');
                            contentEl._rawContent = (contentEl._rawContent || '') + delta;
                            contentEl.removeAttribute('data-rendered');
                            
                            // Throttle Markdown rendering and scrolling to save CPU & avoid lag
                            const now = Date.now();
                            window._lastStreamRenderTime = window._lastStreamRenderTime || 0;
                            const performRender = () => {
                                applyMarkdownToTimeline(contentEl.closest('article'), true);
                                if (isNearBottom(150)) scrollToBottom('auto');
                                window._lastStreamRenderTime = Date.now();
                            };
                            
                            if (window._streamRenderTimer) clearTimeout(window._streamRenderTimer);
                            if (now - window._lastStreamRenderTime > 80) {
                                performRender();
                            } else {
                                window._streamRenderTimer = setTimeout(performRender, 80);
                            }
                            return;
                        }
                        if (phase === 'done') {
                            const bubble = getStreamingBubble();
                            if (bubble) {
                                const badge = bubble.querySelector('mdui-badge');
                                if (badge) badge.textContent = __('room.generated');

                                // Non-streaming fallback: If we never got chunks, or just for safety,
                                // ensure we render the content from the streamEvent if present.
                                const body = bubble.querySelector('.markdown-body');
                                if (body) {
                                    if (streamEvent.content && !body._rawContent) {
                                        body._rawContent = streamEvent.content;
                                    }
                                    body.removeAttribute('data-rendered');
                                    applyMarkdownToTimeline(bubble, false);
                                }
                            }
                            return;
                        }
                        if (phase === 'error') {
                            clearStreamingBubble();
                            window.showSnackbar(streamEvent.error || __('room.stream_failed'), "error");
                            return;
                        }
                    }
                    if (payload.type === 'room.presence') {
                        const presence = payload.event || {};
                        const presenceUserId = String(presence.userId || '');
                        if (!presenceUserId || presenceUserId === selfUserId) return;
                        const username = String(presence.username || __('room.unknown_player'));
                        if (presence.isOnline) {
                            window.showSnackbar(__('room.back_to_room', { username }), "success");
                        } else {
                            window.showSnackbar(__('room.left_room_ai', { username }), "success");
                        }
                        // Update member list online status
                        const memberItem = roomMembersList?.querySelector(`[data-member-userid="${CSS.escape(presenceUserId)}"]`);
                        if (memberItem) {
                            const dot = memberItem.querySelector('[data-member-online]');
                            const statusEl = memberItem.querySelector('[data-member-status]');
                            if (dot) {
                                dot.classList.toggle('online', !!presence.isOnline);
                                dot.classList.toggle('offline', !presence.isOnline);
                            }
                            if (statusEl && !presence.isOnline) {
                                statusEl.textContent = __('room.offline');
                                statusEl.style.color = 'rgb(var(--mdui-color-on-surface-variant))';
                            }
                        }
                        return;
                    }
                    if (payload.type === 'room.closed') {
                        shouldReconnectRoomSocket = false;
                        window.showSnackbar(payload.message || payload.error || __('room.room_closed'), "error");
                        setTimeout(() => { window.location.href = '/'; }, 300);
                    }
                } catch {
                    // Ignore malformed payload.
                }
            };
            roomSocket.onclose = () => {
                isWsConnected = false;
                if (shouldReconnectRoomSocket) {
                    if (roomConnectionStatus) {
                        roomConnectionStatus.style.display = 'flex';
                        const bannerText = roomConnectionStatus.querySelector('span');
                        if (bannerText) bannerText.textContent = __('room.disconnected');
                    }
                    if (roomReadyButton) roomReadyButton.disabled = true;
                }
                if (roomHeartbeatTimer) {
                    clearInterval(roomHeartbeatTimer);
                    roomHeartbeatTimer = null;
                }
                if (!shouldReconnectRoomSocket) {
                    return;
                }
                if (roomReconnectTimer) clearTimeout(roomReconnectTimer);
                
                // USER REQUEST: Optimization - Exponential backoff for reconnection
                roomReconnectCount++;
                const nextDelay = Math.min(1000 * Math.pow(1.5, roomReconnectCount - 1), 10000); 
                
                if (roomConnectionStatus) {
                    const bannerText = roomConnectionStatus.querySelector('span');
                    if (bannerText) bannerText.textContent = __('room.connection_retry', { seconds: Math.round(nextDelay/1000) });
                }

                roomReconnectTimer = setTimeout(connectRoomSocket, nextDelay);
            };
            roomSocket.onerror = () => {
                try {
                    roomSocket.close();
                } catch {
                    // Ignore close errors.
                }
            };
        };

        const submitInput = async (ready) => {
            if (isSubmitting || isProcessing) return;
            const content = String(roomInput?.value || '').trim();
            
            // Allow commands to be submitted even if "Ready" would normally require content
            // or if the content is JUST a command.
            if (ready && !content) {
                window.showSnackbar(__('room.please_input'), "info");
                return;
            }

            // Treat commands as separate from the "Ready" flow
            const effectivelyReady = content.startsWith('/') ? false : !!ready;

            setSubmitState(true);
            try {
                const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/input`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, ready: effectivelyReady }),
                });
                const payload = await res.json();
                if (!payload.ok) {
                    window.showSnackbar(payload.error || __('room.submit_failed'), "error");
                    // Pull full state on error just in case
                    fetchRoomState();
                    return;
                }
                
                // CRITICAL: Successfully submitted, ONLY now we clear the input
                if (roomInput) roomInput.value = '';

                // Relying on WebSocket room.state for snackbar/state update
                if (!isWsConnected) fetchRoomState();
            } catch {
                window.showSnackbar(__('common.network_error'), "error");
                fetchRoomState();
            } finally {
                setSubmitState(false);
            }
        };

        if (roomReadyButton) {
            roomReadyButton.onclick = () => {
                if (!String(roomInput?.value || '').trim()) return;
                const isReady = roomReadyButton.classList.contains('ready-active');

                // Optimistic Button Local Toggle (Visual Only)
                if (roomReadyButton) {
                    roomReadyButton.loading = true;
                    roomReadyButton.disabled = true;
                }
                
                submitInput(!isReady);
            };
        }
        if (roomEditButton) roomEditButton.onclick = () => { submitInput(false); };



        if (roomTimeline) {
            roomTimeline.addEventListener('click', (event) => {
                const copyBtn = event.target.closest('.room-floor-copy-btn');
                if (copyBtn) {
                    let messageContent = copyBtn.dataset.content;
                    if (!messageContent) {
                        const article = copyBtn.closest('article.room-floor-card');
                        if (article) {
                            const markdownEl = article.querySelector('.markdown-body');
                            if (markdownEl && typeof markdownEl._rawContent === 'string') {
                                messageContent = markdownEl._rawContent;
                            }
                            if (!messageContent) {
                                const msgKey = article.getAttribute('data-msg-key');
                                const message = latestTimelineMessages.find(m => String(m._renderKey) === String(msgKey) || String(m.id) === String(msgKey));
                                if (message) messageContent = message.content;
                            }
                        }
                    }
                    if (messageContent) {
                        navigator.clipboard.writeText(String(messageContent)).then(() => {
                            const origIcon = copyBtn.icon;
                            copyBtn.icon = 'check';
                            copyBtn.style.color = 'rgb(var(--mdui-color-primary))';
                            window.showSnackbar(__('room.content_copied'), "success");
                            setTimeout(() => {
                                copyBtn.icon = origIcon;
                                copyBtn.style.color = '';
                            }, 1500);
                        }).catch(() => {
                            window.showSnackbar(__('room.copy_failed'), "error");
                        });
                    } else {
                        window.showSnackbar(__('room.cannot_get_content'), "error");
                    }
                    return;
                }

                const editBtn = event.target.closest('.room-floor-edit-btn');
                if (editBtn && editMessageDialog) {
                    if (!isHostUser) {
                        window.showSnackbar(__('room.no_permission_edit'), "error");
                        return;
                    }
                    const msgId = editBtn.dataset.id;
                    const isPending = editBtn.dataset.pending === '1';
                    let messageContent = editBtn.dataset.content;
                    if (!messageContent) {
                        const article = editBtn.closest('article.room-floor-card');
                        if (article) {
                            const markdownEl = article.querySelector('.markdown-body');
                            if (markdownEl && typeof markdownEl._rawContent === 'string') {
                                messageContent = markdownEl._rawContent;
                            }
                            if (!messageContent) {
                                const msgKey = article.getAttribute('data-msg-key');
                                const message = latestTimelineMessages.find(m => String(m._renderKey) === String(msgKey) || String(m.id) === String(msgKey));
                                if (message) messageContent = message.content;
                            }
                        }
                    }
                    if (msgId && messageContent !== undefined) {
                        editMessageIdInput.value = String(msgId);
                        editMessageIdInput.dataset.pending = isPending ? '1' : '0';
                        editMessageContent.value = String(messageContent);
                        editMessageDialog.open = true;
                    }
                }
                const deleteBtn = event.target.closest('.room-floor-delete-btn');
                if (deleteBtn && deleteMessageConfirmDialog) {
                    pendingDeleteMsgId = String(deleteBtn.dataset.id || '').trim();
                    deleteMessageConfirmDialog.open = true;
                }
            });
        }

        if (confirmEditMessageBtn) {
            confirmEditMessageBtn.onclick = async () => {
                const messageId = String(editMessageIdInput.value || '').trim();
                const content = String(editMessageContent.value || '');
                const isPending = editMessageIdInput.dataset.pending === '1';
                if (!messageId) return;

                confirmEditMessageBtn.loading = true;
                setLocalEditBadge(messageId, __('room.editing'), 'warning');

                if (isPending) {
                    // Pending messages haven't been persisted yet — use the input API
                    try {
                        const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/input`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content, ready: true }),
                        });
                        const payload = await res.json();
                        if (!payload.ok) {
                            window.showSnackbar(payload.error || __('room.modify_failed'), "error");
                            return;
                        }
                        window.showSnackbar(__('room.pending_content_updated'), "success");
                        editMessageDialog.open = false;
                        if (!isWsConnected) fetchRoomState();
                    } catch {
                        setLocalEditBadge(messageId, __('room.edit_failed'), 'error');
                        window.showSnackbar(__('common.network_error'), "error");
                    } finally {
                        confirmEditMessageBtn.loading = false;
                    }
                    return;
                }

                try {
                    const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/update-message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ messageId, content }),
                    });
                    const payload = await res.json();
                    if (!payload.ok) {
                        window.showSnackbar(payload.error || __('room.modify_failed'), "error");
                        return;
                    }
                    window.showSnackbar(__('room.modify_success'), "success");
                    setLocalEditBadge(messageId, __('room.edited'), 'secondary');
                    editMessageDialog.open = false;
                    if (!isWsConnected) fetchRoomState();
                } catch {
                    setLocalEditBadge(messageId, __('room.edit_failed'), 'error');
                    window.showSnackbar(__('common.network_error'), "error");
                } finally {
                    confirmEditMessageBtn.loading = false;
                }
            };
        }

        if (roomInput) {
            const updateButtonState = () => {
                const hasContent = String(roomInput.value || '').trim().length > 0;
                if (roomReadyButton) {
                    roomReadyButton.disabled = !hasContent;
                    roomReadyButton.classList.toggle('btn-disabled', !hasContent);
                }
            };
            roomInput.addEventListener('input', updateButtonState);
            updateButtonState();
            roomInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    const isReady = roomReadyButton?.classList.contains('ready-active');
                    submitInput(!isReady);
                }
            });
        }

        // Room quick menu - dropdown handles open/close natively
        // Force start menu item
        const forceStartItem = document.querySelector('#room-force-start-item');
        if (forceStartItem && forceStartConfirmDialog) {
            forceStartItem.addEventListener('click', () => {
                forceStartConfirmDialog.open = true;
                const roomQuickMenu = document.querySelector('#room-quick-menu');
                if (roomQuickMenu) roomQuickMenu.style.display = 'none';
            });
        }
        if (confirmForceStartBtn) {
            confirmForceStartBtn.onclick = async () => {
                confirmForceStartBtn.loading = true;
                try {
                    const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/force-start`, {
                        method: 'POST',
                        headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    });
                    const data = await res.json();
                    if (!data.ok) { window.showSnackbar(data.error || __('room.submit_failed'), 'error'); return; }
                    forceStartConfirmDialog.open = false;
                    window.showSnackbar(__('room.force_started'), 'success');
                } catch { window.showSnackbar(__('common.network_error'), 'error'); }
                finally { confirmForceStartBtn.loading = false; }
            };
        }
        // Regenerate menu item
        const regenerateItem = document.querySelector('#room-regenerate-item');
        if (regenerateItem && regenerateConfirmDialog) {
            regenerateItem.addEventListener('click', () => {
                regenerateConfirmDialog.open = true;
                const roomQuickMenu = document.querySelector('#room-quick-menu');
                if (roomQuickMenu) roomQuickMenu.style.display = 'none';
            });
        }
        if (confirmRegenerateBtn) {
            confirmRegenerateBtn.onclick = async () => {
                confirmRegenerateBtn.loading = true;
                try {
                    const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/regenerate`, {
                        method: 'POST',
                        headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    });
                    const data = await res.json();
                    if (!data.ok) { window.showSnackbar(data.error || __('room.submit_failed'), 'error'); return; }
                    regenerateConfirmDialog.open = false;
                    window.showSnackbar(__('room.regenerate_success'), 'success');
                } catch { window.showSnackbar(__('common.network_error'), 'error'); }
                finally { confirmRegenerateBtn.loading = false; }
            };
        }
        // Delete message handlers
        if (confirmDeleteMsgBtn) {
            confirmDeleteMsgBtn.onclick = async () => {
                if (!pendingDeleteMsgId) return;
                confirmDeleteMsgBtn.loading = true;
                try {
                    const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/delete-message`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        body: new URLSearchParams({ messageId: pendingDeleteMsgId }).toString(),
                    });
                    const data = await res.json();
                    if (!data.ok) { window.showSnackbar(data.error || __('room.update_failed'), 'error'); return; }
                    deleteMessageConfirmDialog.open = false;
                    window.showSnackbar(__('room.message_deleted'), 'success');
                    pendingDeleteMsgId = null;
                } catch { window.showSnackbar(__('common.network_error'), 'error'); }
                finally { confirmDeleteMsgBtn.loading = false; }
            };
        }

        if (roomLeaveButton) {
            roomLeaveButton.onclick = () => {
                const isHost = String(roomPage.dataset.isHost || "") === "1";
                if (leaveRoomHeadline) leaveRoomHeadline.textContent = __('room.leave_confirm');
                if (leaveRoomMessage) leaveRoomMessage.textContent = isHost ? __('room.leave_host_msg') : __('room.leave_member_msg');
                leaveRoomConfirmDialog.open = true;
            };
        }
        if (confirmLeaveRoomBtn) {
            confirmLeaveRoomBtn.onclick = async () => {
                confirmLeaveRoomBtn.loading = true;
                try {
                    const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/leave`, { method: "POST" });
                    const payload = await res.json();
                    if (!payload.ok) {
                        window.showSnackbar(payload.error || __('room.leave_failed'), "error");
                        confirmLeaveRoomBtn.loading = false;
                        return;
                    }
                } catch (err) {
                    window.showSnackbar(__('common.network_error'), "error");
                    confirmLeaveRoomBtn.loading = false;
                    return;
                }

                if (roomReconnectTimer) clearTimeout(roomReconnectTimer);
                shouldReconnectRoomSocket = false;
                if (roomHeartbeatTimer) { clearInterval(roomHeartbeatTimer); roomHeartbeatTimer = null; }
                if (roomSocket) { try { roomSocket.close(); } catch {} roomSocket = null; }
                window.location.href = '/';
            };
        }

        if (roomPresetApply && roomPresetSelector) {
            roomPresetApply.onclick = async () => {
                try {
                    const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/preset`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ presetFile: String(roomPresetSelector.value || '') }),
                    });
                    const payload = await res.json();
                    if (!payload.ok) {
                        window.showSnackbar(payload.error || __('room.switch_failed'), "error");
                        return;
                    }
                    window.showSnackbar(__('room.session_preset_updated'), "success");
                    if (!isWsConnected) {
                        fetchRoomState();
                        fetchPresetState();
                        fetchRegexState();
                    }
                } catch {
                    window.showSnackbar(__('common.network_error'), "error");
                }
            };
        }

        if (roomOpeningApply && roomOpeningSelector) {
            roomOpeningApply.onclick = async () => {
                const openingText = String(roomOpeningSelector.value || '');
                if (!openingText) {
                    window.showSnackbar(__('room.no_opening'), "info");
                    return;
                }
                try {
                    const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/opening`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ openingText }),
                    });
                    const payload = await res.json();
                    if (!payload.ok) {
                        window.showSnackbar(payload.error || __('room.switch_failed'), "error");
                        return;
                    }
                    window.showSnackbar(__('room.opening_switched'), "success");
                    if (!isWsConnected) fetchRoomState();
                } catch {
                    window.showSnackbar(__('common.network_error'), "error");
                }
            };
        }

        if (roomHtmlRenderToggle) {
            roomHtmlRenderToggle.onclick = async () => {
                const previous = regexHtmlRenderEnabled;
                regexHtmlRenderEnabled = !regexHtmlRenderEnabled;
                try {
                    await saveRoomRenderPreferences();
                    renderedSignature = '';
                    renderTimeline(latestTimelineMessages, latestMembersState);
                    window.showSnackbar(regexHtmlRenderEnabled ? __('room.html_render_on') : __('room.html_render_off'), "success");
                } catch (error) {
                    regexHtmlRenderEnabled = previous;
                    window.showSnackbar(error.message || __('common.save_failed'), "error");
                }
            };
        }

        const initialStateNode = document.querySelector('#room-initial-state');
        if (initialStateNode) {
            try {
                const initialState = JSON.parse(initialStateNode.textContent || '{}');
                if (initialState && typeof initialState === 'object') {
                    regexHtmlRenderEnabled = initialState?.preferences?.regexHtmlRenderEnabled !== false;
                    wholeHtmlBlockRenderEnabled = initialState?.preferences?.wholeHtmlBlockRenderEnabled !== false;
                    jsRenderEnabled = initialState?.preferences?.jsRenderEnabled === true || roomPage.dataset.jsRenderEnabled === 'true';
                    applyRoomState(initialState);
                }
            } catch {
                // Ignore invalid initial payload.
            }
        }

        connectRoomSocket();
        roomStatePollTimer = setInterval(() => {
            if (!isWsConnected) fetchRoomState();
        }, 2500);
        const cleanRoom = () => {
            window.removeEventListener('message', onHtmlFrameMessage);
            if (roomReconnectTimer) clearTimeout(roomReconnectTimer);
            scrollStabilizeTimers.forEach((timer) => clearTimeout(timer));
            scrollStabilizeTimers = [];
            pageScrollStabilizeTimers.forEach((timer) => clearTimeout(timer));
            pageScrollStabilizeTimers = [];
            cleanupHtmlRenderFrames(true);
            if (roomStatePollTimer) {
                clearInterval(roomStatePollTimer);
                roomStatePollTimer = null;
            }
            shouldReconnectRoomSocket = false;
            if (roomHeartbeatTimer) {
                clearInterval(roomHeartbeatTimer);
                roomHeartbeatTimer = null;
            }
            if (roomSocket) {
                try {
                    roomSocket.close(1000, 'Page unload');
                } catch {}
                roomSocket = null;
            }
        };
        window.addEventListener('beforeunload', cleanRoom);
        document.addEventListener('turbo:before-render', cleanRoom, { once: true });
        fetchPresetState();
        fetchRegexState();
        fetchRoomState();
    }

        try { initBaseUi(); } catch(e) { console.error('initBaseUi Error', e); }
        try { initIndexPage(); } catch(e) { console.error('initIndexPage Error', e); }
        try { initCharacterPage(); } catch(e) { console.error('initCharacterPage Error', e); }
        try { initPresetPage(); } catch(e) { console.error('initPresetPage Error', e); }
        try { initApiConfigPage(); } catch(e) { console.error('initApiConfigPage Error', e); }
        try { initWorldBookPage(); } catch(e) { console.error('initWorldBookPage Error', e); }
        try { initSettingsPage(); } catch(e) { console.error('initSettingsPage Error', e); }
        try { initRoomPage(); } catch(e) { console.error('initRoomPage Error', e); }
        if (window.mdui && window.mdui.mutation) window.mdui.mutation();
    });

    // Fallback: Guarantee initialization even if script is evaluated late
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => document.dispatchEvent(new Event('turbo:load')), 1);
    }
}
