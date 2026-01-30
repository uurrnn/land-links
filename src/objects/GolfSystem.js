import Phaser from 'phaser';

export default class GolfSystem {
    constructor(scene) {
        this.scene = scene;
        
        this.golfer = null;
        this.ball = null;
        this.aimGraphics = null;
        
        this.isBallInFlight = false;
        this.isBallRolling = false;
        this.canSwing = false;
        this.rollData = null;
        this.golferGrid = null;
        this.ballGrid = null;
    }

    enterPlayMode(course) {
        if (course.holes.length === 0) {
            this.scene.showNotification("Need at least 1 hole to play!", "#ff0000");
            return false;
        }

        // Cleanup existing
        if (this.ball) this.scene.tweens.killTweensOf(this.ball);
        if (this.golfer) this.scene.tweens.killTweensOf(this.golfer);
        this.cleanup();

        this.canSwing = false;
        this.scene.showNotification("ENTERING PLAY MODE - ESC to Exit", "#3498db");

        // Use the first hole for now
        const firstHole = course.holes[0];
        this.golferGrid = { x: firstHole.tee.x, y: firstHole.tee.y };
        this.ballGrid = { x: firstHole.tee.x, y: firstHole.tee.y };

        const teePos = this.scene.gridToIso(this.golferGrid.x, this.golferGrid.y);

        // Spawn Golfer
        this.golfer = this.scene.add.sprite(teePos.x, teePos.y, 'golfer');
        this.golfer.setOrigin(0.5, 1);
        this.scene.worldContainer.add(this.golfer);

        // Spawn Ball
        this.ball = this.scene.add.sprite(teePos.x + 10, teePos.y, 'ball');
        this.ball.setOrigin(0.5, 0.5);
        this.scene.worldContainer.add(this.ball);

        // Setup Aiming Graphics
        this.aimGraphics = this.scene.add.graphics();
        this.scene.worldContainer.add(this.aimGraphics);

        this.scene.cameras.main.centerOn(teePos.x, teePos.y);

        // Prevent accidental swing from the button click
        this.scene.time.delayedCall(100, () => {
            this.canSwing = true;
        });

        return true;
    }

    exitPlayMode() {
        this.canSwing = false;
        this.cleanup();
    }

    cleanup() {
        if (this.golfer) this.golfer.destroy();
        if (this.ball) this.ball.destroy();
        if (this.aimGraphics) this.aimGraphics.destroy();
        this.golfer = null;
        this.ball = null;
        this.aimGraphics = null;
        this.isBallInFlight = false;
        this.isBallRolling = false;
        this.rollData = null;
    }

    update(delta) {
        if (!this.golfer || !this.ball) return;

        if (this.isBallRolling) {
            this.updateBallPhysics(delta);
        } else if (!this.isBallInFlight && this.canSwing) {
            this.updateAiming();
        }
    }

    updateAiming() {
        const pointer = this.scene.input.activePointer;
        const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);

        // Update Golfer Rotation/Flip to face mouse
        this.golfer.flipX = (worldPoint.x < this.golfer.x);

        // Draw Trajectory Arc
        this.aimGraphics.clear();
        this.aimGraphics.lineStyle(2, 0xffffff, 0.5);

        const startX = this.ball.x;
        const startY = this.ball.y;
        const endX = worldPoint.x;
        const endY = worldPoint.y;

        const dist = Phaser.Math.Distance.Between(startX, startY, endX, endY);
        const maxHeight = Math.min(dist / 2, 100);

        // Simple quadratic bezier for the arc
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - maxHeight;

        const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(startX, startY),
            new Phaser.Math.Vector2(midX, midY),
            new Phaser.Math.Vector2(endX, endY)
        );
        const points = curve.getPoints(20);
        this.aimGraphics.strokePoints(points);

        // Draw Landing Target
        this.aimGraphics.fillStyle(0xffffff, 0.3);
        this.aimGraphics.fillCircle(endX, endY, 10);
    }

    swingAndHit(pointer) {
        if (this.isBallInFlight || !this.canSwing) return;
        this.isBallInFlight = true;

        const targetPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);

        // "Rough" Swing Animation (Simple rotation)
        this.scene.tweens.add({
            targets: this.golfer,
            angle: this.golfer.flipX ? 45 : -45,
            duration: 150,
            yoyo: true,
            onComplete: () => {
                this.golfer.angle = 0;
                this.launchBall(targetPoint.x, targetPoint.y);
            }
        });
    }

    launchBall(endX, endY) {
        const startX = this.ball.x;
        const startY = this.ball.y;
        
        const dist = Phaser.Math.Distance.Between(startX, startY, endX, endY);
        const maxHeight = Math.min(dist / 2, 150);
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - maxHeight;

        this.aimGraphics.clear();

        // 1. FLIGHT PHASE
        const flightDuration = 600 + (dist / 1.5);
        
        this.scene.tweens.add({
            targets: { t: 0 },
            t: 1,
            duration: flightDuration,
            ease: 'Linear',
            onUpdate: (tween) => {
                if (!this.ball) return;
                const curT = tween.getValue();
                
                // Path on the ground plane (Linear)
                this.ball.x = (1 - curT) * (1 - curT) * startX + 2 * (1 - curT) * curT * midX + curT * curT * endX;
                this.ball.y = (1 - curT) * (1 - curT) * startY + 2 * (1 - curT) * curT * midY + curT * curT * endY;
                
                // Visual Height (Parabolic scale/offset)
                const height = Math.sin(curT * Math.PI);
                this.ball.setScale(1 + height * 0.6);
                this.ball.y -= height * maxHeight * 0.5; // Visual arc offset
            },
            onComplete: () => {
                if (!this.ball) return;
                this.handleImpact(endX, endY, (endX - startX) / dist, (endY - startY) / dist, dist);
            }
        });
    }

    handleImpact(x, y, dirX, dirY, power) {
        this.ball.setScale(1);
        const gridPos = this.scene.worldToGrid(x, y);
        const tile = this.scene.gridData[gridPos.y]?.[gridPos.x];
        const terrain = tile ? tile.type : 'out';

        // Dampen power for extremely long shots to prevent physics explosion
        let effectivePower = power;
        if (power > 400) {
            effectivePower = 400 + (power - 400) * 0.5;
        }

        if (terrain === 'water') {
            this.scene.showNotification("SPLASH!", "#3498db");
            this.scene.tweens.add({
                targets: this.ball,
                alpha: 0,
                scale: 0.5,
                duration: 500,
                onComplete: () => this.scene.exitPlayMode()
            });
            return;
        }

        if (terrain === 'sand') {
            this.scene.showNotification("PLOP!", "#f1c40f");
            this.ballGrid = gridPos;
            this.checkBallLanding();
            this.isBallInFlight = false;
            return;
        }

        // Determine bounce and roll based on terrain
        let bounceMult = 0.25; 
        let rollMult = 0.25; 

        if (terrain === 'green') { bounceMult = 0.25; rollMult = 0.275; } 
        if (terrain === 'rough') { bounceMult = 0.10; rollMult = 0.075; } 
        if (terrain === 'out') friction = 0.85; // wait friction not defined here, handled in roll

        const bounceDist = effectivePower * bounceMult * 1.5; 
        if (bounceDist > 20) {
            this.bounceBall(x, y, dirX, dirY, bounceDist, rollMult);
        } else {
            this.rollBall(x, y, dirX, dirY, effectivePower * bounceMult * rollMult * 0.5);
        }
    }

    bounceBall(startX, startY, dirX, dirY, dist, rollMult) {
        const endX = startX + dirX * dist;
        const endY = startY + dirY * dist;
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - (dist / 4); 

        const duration = 300 + (dist);

        this.scene.tweens.add({
            targets: { t: 0 },
            t: 1,
            duration: duration,
            ease: 'Linear',
            onUpdate: (tween) => {
                if (!this.ball) return;
                const curT = tween.getValue();
                this.ball.x = (1 - curT) * (1 - curT) * startX + 2 * (1 - curT) * curT * midX + curT * curT * endX;
                this.ball.y = (1 - curT) * (1 - curT) * startY + 2 * (1 - curT) * curT * midY + curT * curT * endY;
                
                const height = Math.sin(curT * Math.PI);
                this.ball.y -= height * (dist / 10); 
            },
            onComplete: () => {
                if (!this.ball) return;
                this.rollBall(this.ball.x, this.ball.y, dirX, dirY, dist * rollMult * 0.5);
            }
        });
    }

    rollBall(startX, startY, dirX, dirY, power) {
        this.isBallRolling = true;
        this.rollData = {
            x: startX,
            y: startY,
            dx: dirX,
            dy: dirY,
            v: power / 45 
        };
    }

    updateBallPhysics(delta) {
        if (!this.isBallRolling || !this.ball || !this.rollData) return;

        const dt = delta / 1000;
        const d = this.rollData.v * delta; 
        
        this.rollData.x += this.rollData.dx * d;
        this.rollData.y += this.rollData.dy * d;
        
        this.ball.x = this.rollData.x;
        this.ball.y = this.rollData.y;

        const currentHole = this.scene.course.holes[0];
        const cupPos = this.scene.gridToIso(currentHole.cup.x, currentHole.cup.y);
        const distToCup = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, cupPos.x, cupPos.y);

        if (distToCup < 12 && this.rollData.v < 0.8) {
            this.isBallRolling = false;
            this.isBallInFlight = false;
            this.triggerWin();
            return;
        }

        const gridPos = this.scene.worldToGrid(this.ball.x, this.ball.y);
        const tile = this.scene.gridData[gridPos.y]?.[gridPos.x];
        const terrain = tile ? tile.type : 'out';

        if (terrain === 'water') {
            this.isBallRolling = false;
            this.handleImpact(this.ball.x, this.ball.y, 0, 0, 0); 
            return;
        }

        if (terrain === 'sand') {
            this.isBallRolling = false;
            this.scene.showNotification("PLOP!", "#f1c40f");
            this.isBallInFlight = false;
            this.ballGrid = gridPos;
            this.checkBallLanding();
            return;
        }

        let friction = 0.92;
        if (terrain === 'green') friction = 0.96; 
        if (terrain === 'rough') friction = 0.81; 
        if (terrain === 'out') friction = 0.85;

        this.rollData.v *= Math.pow(friction, delta / 16); 

        if (this.rollData.v < 0.03) { 
            this.isBallRolling = false;
            this.isBallInFlight = false;
            this.ballGrid = gridPos;
            this.checkBallLanding();
        }
    }

    checkBallLanding() {
        const currentHole = this.scene.course.holes[0]; 
        const cupPos = this.scene.gridToIso(currentHole.cup.x, currentHole.cup.y);
        const dist = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, cupPos.x, cupPos.y);

        if (dist < 15) {
            this.triggerWin();
        } else {
            // Move golfer to ball for next shot
            const targetX = this.ball.x - 10;
            const targetY = this.ball.y;
            this.scene.tweens.add({
                targets: this.golfer,
                x: targetX,
                y: targetY,
                duration: 500,
                onComplete: () => {
                    this.golferGrid = this.scene.worldToGrid(targetX, targetY);
                }
            });
        }
    }

    triggerWin() {
        this.scene.showNotification("IN THE HOLE!", "#ffff00");
        this.ball.setVisible(false);
        this.canSwing = false;
        this.aimGraphics.clear();
        this.scene.time.delayedCall(2000, () => {
            this.scene.exitPlayMode();
        });
    }
    
    // Helper to sync positions if map rotates
    refreshPositions() {
        if (this.golfer) {
            const pos = this.scene.gridToIso(this.golferGrid.x, this.golferGrid.y);
            this.golfer.setPosition(pos.x, pos.y);
        }
        if (this.ball) {
            const pos = this.scene.gridToIso(this.ballGrid.x, this.ballGrid.y);
            this.ball.setPosition(pos.x, pos.y);
        }
    }
}
