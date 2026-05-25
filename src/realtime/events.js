let realtimeBridge = null;

export function setRealtimeBridge(bridgeFn) {
    realtimeBridge = typeof bridgeFn === 'function' ? bridgeFn : null;
}

export function publishRealtimeEvent(event) {
    if (!realtimeBridge) {
        return;
    }

    try {
        realtimeBridge(event || {});
    } catch {
        // Ignore realtime dispatch failures to avoid breaking core flows.
    }
}
