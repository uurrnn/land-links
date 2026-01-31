export const GRID_SIZE = { width: 72, height: 72 };
export const TILE_SIZE = { width: 64, height: 32 };

export const TILE_TYPES = {
    grass: 0x5ba337,
    sand: 0xf1c40f,
    water: 0x3498db,
    fairway: 0x5ba337,
    green: 0x86e04c,
    rough: 0x457d2a,
    tee: 0x4a8c2a
};

export const DECO_TYPES = {
    tree: { color: 0x3d7030, size: { w: 32, h: 64 } },
    bush: { color: 0x5fa855, size: { w: 24, h: 24 } },
    bench: { color: 0x8e44ad, size: { w: 48, h: 24 } },
    cup: { color: 0x000000, size: { w: 16, h: 48 } }
};

export const DECO_NAMES = Object.keys(DECO_TYPES);

export const EDITOR_STATES = {
    IDLE: 'IDLE',
    PLACING_TEE: 'PLACING_TEE',
    CONSTRUCTING: 'CONSTRUCTING',
    PLAYING: 'PLAYING'
};

export const TERRAIN_PHYSICS = {
    fairway: { friction: 0.92, bounceMult: 0.25, rollMult: 0.25 },
    green:   { friction: 0.96, bounceMult: 0.25, rollMult: 0.275 },
    rough:   { friction: 0.81, bounceMult: 0.10, rollMult: 0.075 },
    sand:    { friction: 0.70, bounceMult: 0, rollMult: 0 },
    out:     { friction: 0.85, bounceMult: 0.25, rollMult: 0.25 },
    grass:   { friction: 0.92, bounceMult: 0.25, rollMult: 0.25 },
    tee:     { friction: 0.92, bounceMult: 0.25, rollMult: 0.25 },
    water:   { friction: 0, bounceMult: 0, rollMult: 0 }
};

export const SAVE_KEY_PREFIX = 'iso_golf_save_';
export const SAVE_SLOTS = [1, 2, 3];

export const AUTO_SLOT_ID = 'auto';

export const UI_LAYOUT = {
    SIDEBAR_WIDTH: 250,
    SIDEBAR_PADDING: 25,
    BUTTON_WIDTH: 200
};

export const NOTIFY_COLORS = {
    error: '#ff0000',
    success: '#00ff00',
    info: '#ffffff',
    warning: '#ffff00',
    water: '#3498db',
    sand: '#f1c40f'
};

export const DEPTH = {
    PREVIEW: 5000,
    UI: 10000,
    HUD: 10100,
    OVERLAY: 20000
};

export function createEmptyTile() {
    return { type: 'grass', height: 0, decoration: null, holeId: null };
}

export const UI_COLORS = {
    primary: 0x4a90e2,
    secondary: 0x357abd,
    accent: 0xf1c40f,
    text: '#ffffff',
    textHover: '#ffff00',
    background: 0x1a252f,
    panel: 0x333333,
    panelAlpha: 0.8,
    button: 0x2c3e50,
    buttonHover: 0x34495e,
    buttonBorder: 0xffffff
};

export const TEXT_STYLES = {
    fontFamily: '"Outfit", sans-serif',
    title:        { fontFamily: '"Outfit", sans-serif', fontSize: '64px', fill: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 6 },
    heading:      { fontFamily: '"Outfit", sans-serif', fontSize: '24px', fill: '#fff', fontStyle: 'bold' },
    button:       { fontFamily: '"Outfit", sans-serif', fontSize: '24px', fill: '#fff', fontStyle: 'bold' },
    buttonSmall:  { fontFamily: '"Outfit", sans-serif', fontSize: '16px', fill: '#fff', fontStyle: 'bold' },
    sectionLabel: { fontFamily: '"Outfit", sans-serif', fontSize: '12px', fill: '#888', fontStyle: 'bold' },
    sidebarBtn:   { fontFamily: '"Outfit", sans-serif', fontSize: '14px', fill: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } },
    label:        { fontFamily: '"Outfit", sans-serif', fontSize: '18px', fill: '#fff' },
    labelSmall:   { fontFamily: '"Outfit", sans-serif', fontSize: '16px', fill: '#888' },
    body:         { fontFamily: '"Outfit", sans-serif', fontSize: '14px', fill: '#888' },
    popup:        { fontFamily: '"Outfit", sans-serif', fontSize: '18px', fill: '#fff', fontStyle: 'bold' },
    popupBtn:     { fontFamily: '"Outfit", sans-serif', fontSize: '16px', fill: '#000', backgroundColor: '#fff', padding: { x: 10, y: 5 } },
    notification: { fontFamily: '"Outfit", sans-serif', fontSize: '20px', fill: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }
};
