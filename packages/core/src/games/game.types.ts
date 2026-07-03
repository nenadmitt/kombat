enum GameStatus {
    Waiting = "waiting",
    InProgress = "in-progress",
    Completed = "completed",
    Failed = "failed"
    
}

interface GameState<T> {
    playerState: Map<string, T>
    playerCount: number
    started: Date
    status: GameStatus
}