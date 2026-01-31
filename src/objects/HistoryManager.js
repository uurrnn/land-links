const MAX_UNDO_STACK = 50;

export default class HistoryManager {
    constructor(scene) {
        this.scene = scene;
        this.undoStack = [];
        this.redoStack = [];
        this.currentBatch = null;
    }

    startBatch() {
        if (this.currentBatch) return;
        this.currentBatch = [];
    }

    endBatch() {
        if (this.currentBatch && this.currentBatch.length > 0) {
            this.undoStack.push(this.currentBatch);
            this.redoStack = [];
            if (this.undoStack.length > MAX_UNDO_STACK) this.undoStack.shift();
        }
        this.currentBatch = null;
    }

    getTileState(x, y) {
        const tile = this.scene.gridData[y][x];
        const hole = this.scene.currentHole || null;

        return {
            x, y,
            type: tile.type,
            height: tile.height,
            decoration: tile.decoration ? tile.decoration.texture.key : null,
            holeId: tile.holeId,
            isTee: (hole && hole.tee && hole.tee.x === x && hole.tee.y === y),
            isCup: (hole && hole.cup && hole.cup.x === x && hole.cup.y === y),
            holeRef: hole
        };
    }

    tileStatesEqual(a, b) {
        return a.type === b.type
            && a.height === b.height
            && a.decoration === b.decoration
            && a.holeId === b.holeId
            && a.isTee === b.isTee
            && a.isCup === b.isCup;
    }

    recordChange(x, y, beforeState) {
        if (!this.currentBatch) return;

        const afterState = this.getTileState(x, y);

        if (this.tileStatesEqual(beforeState, afterState)) return;

        const existing = this.currentBatch.find(r => r.x === x && r.y === y);
        if (existing) {
            existing.after = afterState;
        } else {
            this.currentBatch.push({
                x, y,
                before: beforeState,
                after: afterState
            });
        }
    }

    undo() {
        if (this.undoStack.length === 0) {
            this.scene.showNotification("Nothing to Undo", "#888");
            return;
        }

        const batch = this.undoStack.pop();
        this.redoStack.push(batch);

        [...batch].reverse().forEach(change => {
            this.restoreState(change.before);
        });

        this.scene.refreshAllTiles();
        this.scene.showNotification("Undo", "#fff");
    }

    redo() {
        if (this.redoStack.length === 0) {
            this.scene.showNotification("Nothing to Redo", "#888");
            return;
        }

        const batch = this.redoStack.pop();
        this.undoStack.push(batch);

        batch.forEach(change => {
            this.restoreState(change.after);
        });

        this.scene.refreshAllTiles();
        this.scene.showNotification("Redo", "#fff");
    }

    restoreState(state) {
        const { x, y, type, height, decoration, holeId, isTee, isCup, holeRef } = state;

        const tile = this.scene.gridData[y][x];
        tile.type = type;
        tile.height = height;
        tile.holeId = holeId;

        if (tile.decoration) {
            tile.decoration.destroy();
            tile.decoration = null;
        }
        if (decoration) {
            const isoPos = this.scene.gridToIso(x, y, height);
            const deco = this.scene.add.sprite(isoPos.x, isoPos.y, decoration);
            deco.setOrigin(0.5, 1);
            this.scene.worldContainer.add(deco);
            tile.decoration = deco;
        }

        if (holeRef) {
            if (isTee) holeRef.tee = { x, y };
            else if (holeRef.tee && holeRef.tee.x === x && holeRef.tee.y === y) holeRef.tee = null;

            if (isCup) holeRef.cup = { x, y };
            else if (holeRef.cup && holeRef.cup.x === x && holeRef.cup.y === y) holeRef.cup = null;

            if (this.scene.currentHole === holeRef) {
                this.scene.updateChecklist();
            }
        }
    }
}
