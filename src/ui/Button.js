import Phaser from 'phaser';
import { UI_COLORS, TEXT_STYLES } from '../consts/GameConfig.js';

export default class Button extends Phaser.GameObjects.Container {
    constructor(scene, x, y, text, callback, config = {}) {
        super(scene, x, y);
        this.scene = scene;
        this.callback = callback;

        // Button dimensions
        const width = config.width || 200;
        const height = config.height || 50;
        
        // Handle color (hex string or number)
        this.baseColor = UI_COLORS.button;
        if (config.backgroundColor) {
            if (typeof config.backgroundColor === 'string') {
                this.baseColor = Phaser.Display.Color.HexStringToColor(config.backgroundColor.replace('#', '0x')).color;
            } else {
                this.baseColor = config.backgroundColor;
            }
        }
        
        this.baseAlpha = config.alpha !== undefined ? config.alpha : 0.8;

        // Background
        this.background = scene.add.rectangle(0, 0, width, height, this.baseColor, this.baseAlpha);
        
        // Text
        const textStyle = { ...TEXT_STYLES.button };
        if (config.fontSize) textStyle.fontSize = config.fontSize;

        this.textObj = scene.add.text(0, 0, text, textStyle)
            .setOrigin(0.5);

        this.add([this.background, this.textObj]);

        // Interaction
        this.setSize(width, height);
        this.setInteractive({ useHandCursor: true });

        this.on('pointerover', this.onHover, this);
        this.on('pointerout', this.onOut, this);
        this.on('pointerdown', this.onDown, this);
        this.on('pointerup', this.onUp, this);

        scene.add.existing(this);
    }

    onHover() {
        // Brighten slightly on hover
        this.background.setFillStyle(this.baseColor, Math.min(1, this.baseAlpha + 0.1));
        this.textObj.setStyle({ fill: UI_COLORS.textHover });
    }

    onOut() {
        this.background.setFillStyle(this.baseColor, this.baseAlpha);
        this.textObj.setStyle({ fill: UI_COLORS.text });
    }

    onDown() {
        this.background.setFillStyle(this.baseColor, Math.max(0.5, this.baseAlpha - 0.2));
        this.y += 2;
    }

    onUp() {
        this.background.setFillStyle(this.baseColor, Math.min(1, this.baseAlpha + 0.1));
        this.y -= 2;
        if (this.callback) {
            this.callback();
        }
    }
}
