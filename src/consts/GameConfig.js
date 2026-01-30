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
    cup: { color: 0x000000, size: { w: 16, h: 48 } } // Increased height for flag
};

export const TILE_NAMES = Object.keys(TILE_TYPES);
export const DECO_NAMES = Object.keys(DECO_TYPES);

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
    title: { fontFamily: '"Outfit", sans-serif', fontSize: '64px', fill: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 6 },
    button: { fontFamily: '"Outfit", sans-serif', fontSize: '24px', fill: '#fff', fontStyle: 'bold' },
    label: { fontFamily: '"Outfit", sans-serif', fontSize: '18px', fill: '#fff' }
};
