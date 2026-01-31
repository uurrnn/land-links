import { SAVE_KEY_PREFIX, SAVE_SLOTS } from '../consts/GameConfig.js';

export function getSaveKey(slotId) {
    return `${SAVE_KEY_PREFIX}${slotId}`;
}

export function serializeGrid(gridData) {
    return gridData.map(row =>
        row.map(tile => ({
            type: tile.type,
            height: tile.height,
            decoration: tile.decoration ? tile.decoration.texture.key : null,
            holeId: tile.holeId
        }))
    );
}

export function saveToSlot(slotId, courseData) {
    const data = {
        ...courseData,
        timestamp: new Date().getTime()
    };
    localStorage.setItem(getSaveKey(slotId), JSON.stringify(data));
}

export function loadSlotData(slotId) {
    const raw = localStorage.getItem(getSaveKey(slotId));
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

export function findEmptySlot() {
    return SAVE_SLOTS.find(i => !localStorage.getItem(getSaveKey(i))) || null;
}

export function findMostRecentSave() {
    let recent = null;
    let maxTime = 0;

    SAVE_SLOTS.forEach(slot => {
        const data = loadSlotData(slot);
        if (data && data.timestamp > maxTime) {
            maxTime = data.timestamp;
            recent = data;
        }
    });
    return recent;
}

export function exportToFile(data) {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `golf_course_${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function importFromFile() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        document.body.appendChild(input);

        const cleanup = () => {
            input.onchange = null;
            if (input.parentNode) input.parentNode.removeChild(input);
        };

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) {
                cleanup();
                reject(new Error('No file selected'));
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                cleanup();
                try {
                    resolve(JSON.parse(event.target.result));
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => {
                cleanup();
                reject(new Error('Failed to read file'));
            };
            reader.readAsText(file);
        };
        input.click();
    });
}
