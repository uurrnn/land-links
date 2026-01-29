import Phaser from 'phaser';
import './style.css';
import MainMenuScene from './scenes/MainMenuScene.js';
import LevelEditorScene from './scenes/LevelEditorScene.js';
import PauseScene from './scenes/PauseScene.js';

const config = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: 'app',
    scene: [MainMenuScene, LevelEditorScene, PauseScene],
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    }
};

const game = new Phaser.Game(config);
