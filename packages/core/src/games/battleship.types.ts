export interface BattleshipPlayerState {
    userId: string
    board: number[][]
}

export enum BattleshipFieldStatus {
    Default = 0, // field
    Taken = 1,
    Mint = 2
}