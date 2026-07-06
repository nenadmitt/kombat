import { BattleshipGameState } from "./battleship.game";

export class BattleshipGameHandler {

}

export class BattleshipGameCache {
    cache: Map<string, BattleshipGameState> = new Map()

    public async set(id: string, state: BattleshipGameState) {
        this.cache.set(id, state)
    }

    public async delete(id: string) {
        this.cache.delete(id)
    }

    public async get(id: string){
        return this.cache.get(id)
    }
}