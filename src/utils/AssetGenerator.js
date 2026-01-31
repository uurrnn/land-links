import { TILE_TYPES, DECO_TYPES, TILE_SIZE } from '../consts/GameConfig.js';

export default class AssetGenerator {
    constructor(scene) {
        this.scene = scene;
    }

    generateAll() {
        const gfx = this.scene.add.graphics();
        this.generateTiles(gfx);
        this.generateDecorations(gfx);
        this.generateActors(gfx);
        this.generateBackground(gfx);
        gfx.destroy();
    }

    removeIfExists(key) {
        if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    }

    generateTiles(gfx) {
        const { width, height } = TILE_SIZE;

        for (const [key, color] of Object.entries(TILE_TYPES)) {
            this.removeIfExists(key);

            gfx.clear();
            gfx.fillStyle(color);
            gfx.lineStyle(1, color); // Stroke with same color to fill sub-pixel gaps

            // Draw diamond shape
            gfx.beginPath();
            gfx.moveTo(0, height / 2);
            gfx.lineTo(width / 2, 0);
            gfx.lineTo(width, height / 2);
            gfx.lineTo(width / 2, height);
            gfx.closePath();
            gfx.fillPath();
            gfx.strokePath(); // Apply the bleed stroke

            // Special handling for Fairway stripes (Mowed pattern)
            if (key === 'fairway') {
                const numStripes = 4;
                const altColor = 0x4a852a; // Darker green

                for (let i = 0; i < numStripes; i++) {
                    if (i % 2 === 0) continue; // Skip base color (already drawn)

                    const t1 = i / numStripes;
                    const t2 = (i + 1) / numStripes;

                    // Calculate points along the top-left edge (Top -> Left)
                    const x1a = (width / 2) * (1 - t1);
                    const y1a = (height / 2) * t1;
                    const x1b = (width / 2) * (1 - t2);
                    const y1b = (height / 2) * t2;

                    // Calculate points along the bottom-right edge (Right -> Bottom)
                    const x2a = width - (width / 2) * t1;
                    const y2a = (height / 2) + (height / 2) * t1;
                    const x2b = width - (width / 2) * t2;
                    const y2b = (height / 2) + (height / 2) * t2;

                    gfx.fillStyle(altColor, 0.6); // Semi-transparent for blending
                    gfx.beginPath();
                    gfx.moveTo(x1a, y1a);
                    gfx.lineTo(x2a, y2a);
                    gfx.lineTo(x2b, y2b);
                    gfx.lineTo(x1b, y1b);
                    gfx.closePath();
                    gfx.fillPath();
                }
            }

            if (key === 'tee') {
                gfx.fillStyle(0xffffff);
                const markerRadius = 2;
                // Markers
                gfx.fillEllipse(width * 0.25, height * 0.5, markerRadius * 2, markerRadius);
                gfx.fillEllipse(width * 0.75, height * 0.5, markerRadius * 2, markerRadius);

                gfx.lineStyle(1, 0x888888);
                gfx.strokeEllipse(width * 0.25, height * 0.5, markerRadius * 2, markerRadius);
                gfx.strokeEllipse(width * 0.75, height * 0.5, markerRadius * 2, markerRadius);
            }

            gfx.generateTexture(key, width, height);
        }
    }

    generateDecorations(gfx) {
        for (const [key, value] of Object.entries(DECO_TYPES)) {
            this.removeIfExists(key);

            gfx.clear();
            gfx.fillStyle(value.color);

            if (key === 'cup') {
                const centerX = value.size.w / 2;
                const centerY = value.size.h - 4;

                // Cup
                gfx.fillStyle(0x000000);
                gfx.fillEllipse(centerX, centerY, 8, 4);
                // Pole
                gfx.lineStyle(1, 0xdddddd);
                gfx.lineBetween(centerX, centerY, centerX, 10);
                // Flag
                gfx.fillStyle(0xff0000);
                gfx.beginPath();
                gfx.moveTo(centerX, 10);
                gfx.lineTo(centerX + 8, 15);
                gfx.lineTo(centerX, 20);
                gfx.closePath();
                gfx.fillPath();
            } else {
                gfx.fillRect(0, 0, value.size.w, value.size.h);
            }
            gfx.generateTexture(key, value.size.w, value.size.h);
        }
    }

    generateActors(gfx) {
        // Golfer
        this.removeIfExists('golfer');
        gfx.clear();
        gfx.fillStyle(0x3498db); // Blue shirt
        gfx.fillRect(8, 16, 16, 24);
        gfx.fillStyle(0xe0ac69); // Skin
        gfx.fillCircle(16, 8, 8);
        gfx.fillStyle(0x333333); // Pants
        gfx.fillRect(8, 40, 16, 8);
        gfx.lineStyle(2, 0x999999);
        gfx.lineBetween(16, 30, 32, 30);
        gfx.generateTexture('golfer', 40, 48);

        // Ball
        this.removeIfExists('ball');
        gfx.clear();
        gfx.fillStyle(0xffffff);
        gfx.fillCircle(4, 4, 3);
        gfx.lineStyle(1, 0x888888);
        gfx.strokeCircle(4, 4, 3);
        gfx.generateTexture('ball', 8, 8);
    }

    generateBackground(gfx) {
        this.removeIfExists('bg');
        gfx.clear();
        gfx.fillStyle(0x4CB7E1);
        gfx.fillRect(0, 0, 64, 64);
        gfx.generateTexture('bg', 64, 64);
    }
}
