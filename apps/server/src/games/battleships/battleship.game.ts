export enum FieldStatus {
  Free = 0,
  Taken = 1,
  Destroyed = 2,
}

export enum ShipType {
  Carrier = 5,
  Battleship = 4,
  Cruiser = 3,
  Destroyer = 2,
}

enum BattleshipGameStatus {
  Setup = 0,
  Play = 1,
  End = 2,
}

interface Point {
    x: number
    y: number
}

export enum Orientation {
    Horizontal = "horizontal",
    Vertical = "vertical"
}

export interface BattleshipPlayerState {
  fields: number[][];
  connected: boolean
}

export interface BattleshipGameState {
  roomId: string;
  players: Map<string, BattleshipPlayerState>;
}

export class BattleshipGame {
  private roomId: string;
  private status: BattleshipGameStatus;
  private players: Map<string, BattleshipPlayerState> = new Map();
  private startTime: Date;
  private shipsSet: Map<string, number> = new Map();
  
  private currentTurnUserId: string
  private currentTurnStated: Date

  constructor(roomId: string) {
    this.roomId = roomId;
    this.status = BattleshipGameStatus.Setup;
  }

  public start(playOneId: string, playerTwoId: string) {
    this.players.set(playOneId, {
      fields: this.createBoard(),
      connected: false
    });
    this.players.set(playerTwoId, {
      fields: this.createBoard(),
      connected: false
    });
    this.startTime = new Date();
  }

  public setShip(userId: string, shipType: ShipType, orientation: Orientation, startPoint: Point ) {
    // check point is out of bounds
    
    // check 
  }

  private createBoard() {
    return Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => FieldStatus.Free),
    );
  }
}
