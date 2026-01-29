import Phaser from 'phaser';
import { UI_COLORS, TEXT_STYLES } from '../consts/GameConfig.js';

export default class Button extends Phaser.GameObjects.Container {
    constructor(scene, x, y, text, callback) {
        super(scene, x, y);
        this.scene = scene;
        this.callback = callback;

        // Button dimensions
        const width = 200;
        const height = 50;

        // Background
        this.background = scene.add.rectangle(0, 0, width, height, UI_COLORS.button)
            .setStrokeStyle(2, UI_COLORS.buttonBorder);
        
        // Text
        this.textObj = scene.add.text(0, 0, text, TEXT_STYLES.button)
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
        this.background.setFillStyle(UI_COLORS.buttonHover);
        this.textObj.setStyle({ fill: UI_COLORS.textHover });
        this.scene.tweens.add({
            targets: this,
            scaleX: 1.05,
            scaleY: 1.05,
            duration: 100
        });
    }

    onOut() {
        this.background.setFillStyle(UI_COLORS.button);
        this.textObj.setStyle({ fill: UI_COLORS.text });
        this.scene.tweens.add({
            targets: this,
            scaleX: 1,
            scaleY: 1,
            duration: 100
        });
    }

    onDown() {
        this.background.setFillStyle(UI_COLORS.secondary);
        this.setScale(0.95);
    }

    onUp() {
        this.background.setFillStyle(UI_COLORS.buttonHover);
        this.setScale(1.05); // Return to hover scale
        if (this.callback) {
            this.callback();
        }
    }
}
