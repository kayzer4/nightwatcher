interface GameConfig {
  time: {
    startHour: number;
    endHour: number;
    defaultSpeed: number;
    maxSpeed: number;
  };
}

export const gameConfig: GameConfig = {
  time: {
    startHour: 23,
    endHour: 6,
    defaultSpeed: 1,
    maxSpeed: 10,
  },
};
