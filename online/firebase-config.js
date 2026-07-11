(function configureTeamBingoOnline(global) {
  "use strict";

  global.TEAM_BINGO_ONLINE_CONFIG = Object.freeze({
    enabled: true,
    firebase: {
      apiKey: "AIzaSyBwZ8eVnnhBIT2gdQqHborHLDPHzDjrp3Y",
      authDomain: "team-bingo-3b04c.firebaseapp.com",
      databaseURL: "https://team-bingo-3b04c-default-rtdb.asia-southeast1.firebasedatabase.app/",
      projectId: "team-bingo-3b04c",
      appId: "1:566058876542:web:039cf4f7766e72005e622f"
    },
    databaseRoot: "teamBingoV1",
    roomInactiveMinutes: 10,
    roomCleanupHours: 24,
    seatHoldSeconds: 60,
    masterHandoverSeconds: 30,
    actionLockSeconds: 45,
    firebaseSdkVersion: "12.15.0"
  });
})(window);
