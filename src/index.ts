import * as express from "express";
import * as http from "http";
import * as socketio from "socket.io";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import socketioclient from "socket.io-client";
import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';
import cfg from '../config.json';
import * as tmi from 'tmi.js';
import crypto from "crypto";
import * as fs from "node:fs/promises";
import open from "open";

const USE_MOCK = !!process.env.USE_FDGT_MOCK;
const TOKEN_SCOPES = "chat:read chat:edit channel:moderate moderator:manage:banned_users channel:manage:moderators channel:manage:vips";
const TOKEN_CACHE_PATH = "./token_cache.json";

interface TokenCache {
  access_token: string;
  expiry_time: number;
  refresh_token: string;
}

let tokenCache: TokenCache = {
  access_token: "",
  expiry_time: 0,
  refresh_token: "",
};

enum WheelTriggerType {
  SUB_GIFTS,
  DONATION
}

class AppState {
  twitch: tmi.Client;
  db: sqlite.Database;
  io: socketio.Server;

  isStarted: boolean;
  startedAt: number;

  endingAt: number;
  baseTime: number;

  randomTarget = "definitelynotyannis";
  randomTargetUserId = "";
  randomTargetIsMod = false;

  spins: Map<string, any> = new Map();
  wheelMode: string = "default";

  constructor(twitch: tmi.Client, db: sqlite.Database, io: socketio.Server,
              isStarted: boolean, startedAt: number, endingAt: number, baseTime: number) {
    this.twitch = twitch;
    this.db = db;
    this.io = io;
    this.isStarted = isStarted;
    this.startedAt = startedAt;
    this.endingAt = endingAt;
    this.baseTime = baseTime;

    setInterval(async () => {
      if(!this.isStarted || this.endingAt < Date.now()) return;
      await db.run(`INSERT INTO graph VALUES(?, ?);`, [Date.now(), this.endingAt]);
      // Keep only the latest 120 records
      await db.run('DELETE FROM graph WHERE timestamp IN (SELECT timestamp FROM graph ORDER BY timestamp DESC LIMIT -1 OFFSET 120);');
      await this.broadcastGraph();
    }, 1000*60);
  }

  async updateBaseTime(newBaseTime: number) {
    this.baseTime = newBaseTime;
    this.io.emit('update_incentives', {
      'tier_1': Math.round(this.baseTime * cfg.time.multipliers.tier_1),
      'tier_2': Math.round(this.baseTime * cfg.time.multipliers.tier_2),
      'tier_3': Math.round(this.baseTime * cfg.time.multipliers.tier_3),
      'bits': Math.round(this.baseTime * cfg.time.multipliers.bits),
      'donation': Math.round(this.baseTime * cfg.time.multipliers.donation),
      'follow': Math.round(this.baseTime * cfg.time.multipliers.follow)
    });
    await this.db.run('INSERT OR REPLACE INTO settings VALUES (?, ?);', ['base_time', newBaseTime]);
  }

  async start(seconds: number) {
    this.isStarted = true;
    this.startedAt = Date.now();
    this.forceTime(seconds);
    this.io.emit('update_uptime', {'started_at': this.startedAt});
    await this.db.run('INSERT OR REPLACE INTO settings VALUES (?, ?);', ['started_at', this.startedAt]);
  }

  async updateStartedAt(newStartedAt: number) {
    this.startedAt = newStartedAt
    this.io.emit('update_uptime', {'started_at': this.startedAt});
    await this.db.run('INSERT OR REPLACE INTO settings VALUES (?, ?);', ['started_at', this.startedAt]);
  }

  forceTime(seconds: number) {
    this.endingAt = Date.now() + (seconds * 1000);
    this.io.emit('update_timer', {'ending_at': this.endingAt, 'forced': true});
  }

  addTime(seconds: number) {
    if(seconds == null) {
      return
    }
    this.endingAt = this.endingAt + (seconds * 1000);
    this.io.emit('update_timer', {'ending_at': this.endingAt});

  }

  displayAddTimeUpdate(seconds: number, reason: string) {
    this.io.emit('time_add_reason', {'seconds_added': seconds, 'reason': reason})
  }

  setWheelMode(mode: string) {
    this.wheelMode = mode;
  }

  getWheelMode() {
    return this.wheelMode;
  }

  triggerWheelSpin(triggerType: WheelTriggerType, triggerValue: number, username: string, userLogin: string = "", userId: string = "", userIsMod: boolean = false) {
    if (!cfg.enable_wheel) {
      return;
    }

    let possibleResults = cfg.wheel.filter(res => {
      if (!(res.conditions.mode ?? ["default"]).map(s => s.toLowerCase()).includes(this.wheelMode.toLowerCase())) {
        return false;
      }
      if (triggerType == WheelTriggerType.DONATION && res.conditions.donation) {
        return res.conditions.donation.min ?? 0 <= triggerValue && res.conditions.donation.max ?? Number.MAX_SAFE_INTEGER >= triggerValue;
      }
      if (triggerType == WheelTriggerType.SUB_GIFTS && res.conditions.gifts) {
        return res.conditions.gifts.min ?? 0 <= triggerValue && res.conditions.gifts.max ?? Number.MAX_SAFE_INTEGER >= triggerValue;
      }
      return false;
    });

    if(triggerType == WheelTriggerType.DONATION || (triggerType == WheelTriggerType.SUB_GIFTS && isWheelBlacklisted(username))) {
      possibleResults = possibleResults.filter(res => !(res.type === "timeout" && res.target === "self"))
    }
    if(possibleResults.length > 0) {
      const totalChances = possibleResults.map(r => r.chance).reduce((a,b) => a+b);
      possibleResults.forEach(r => r.chance = r.chance / totalChances);
      const rand = Math.random();
      let result = possibleResults[0];
      let resRand = 0;
      for (const sp of possibleResults) {
        resRand += sp.chance;
        if(resRand >= rand) {
          result = sp;
          break;
        }
      }

      const spinId = crypto.randomBytes(8).toString("hex");
      const spin = {results: possibleResults, random: rand, id: spinId, res: result, sender: userLogin, userId, userIsMod};
      this.spins.set(spinId, spin);
      this.io.emit('display_spin', spin);
    }
  }

  async executeSpinResult(spinId: string) {
    if(!this.spins.has(spinId)) return;
    const spin = this.spins.get(spinId);
    this.spins.delete(spinId);

    if(spin.res.type === 'time') {
      this.addTime(spin.res.value);
      this.displayAddTimeUpdate(spin.res.value, `${spin.sender} (wheel)`)
    } else if(spin.res.type === 'timeout') {
      if(spin.res.target === 'random') {
        const target = this.randomTarget;
        const targetUserId = this.randomTargetUserId;
        const targetIsMod = this.randomTargetIsMod;
        await timeoutUser(targetUserId, spin.res.value, "WHEEL SPIN").catch(err => console.log('Could not execute wheel TO!', err));
        if(targetIsMod) {
          console.log(`Remodding ${target} in ${(1000*spin.res.value) + 5000}ms`);
          setTimeout(async () => {
            await modUser(targetUserId).catch(err => console.log('Could not remod user after wheel TO!', err));
          }, (1000*spin.res.value) + 5000);
        }
      } else if(spin.res.target === 'sender') {
        const wasMod = spin.res.mod;
        await timeoutUser(spin.senderId, spin.res.value, "WHEEL SPIN").catch(err => console.log('Could not execute wheel TO!', err));
        if(wasMod) {
          console.log(`Remodding ${spin.sender} in ${(1000*spin.res.value) + 5000}ms`);
          setTimeout(async () => {
            await modUser(spin.senderId).catch(err => console.log('Could not remod user after wheel TO!', err));
          }, (1000*spin.res.value) + 5000);
        }
      }
    }
  }

  async broadcastGraph() {
    const res = await this.db.all('SELECT timestamp,ending_at FROM graph ORDER BY timestamp DESC LIMIT 50;');
    const graphArray : any[] = Array.from({length: 60}, (_, n) => {
      if(res.length === 0) return 0;
      else if(n < 60 - res.length) return res[res.length - 1].ending_at - res[res.length - 1].timestamp;
      else return res[60-(1+n)].ending_at - res[60-(1+n)].timestamp;
    });
    this.io.emit('update_graph', {data: graphArray});
  }


}

(async () => {
  // Read token cache
  try {
    const cacheData = await fs.readFile(TOKEN_CACHE_PATH, "utf8");
    tokenCache = JSON.parse(cacheData);
  } catch (err) {}


  // open the database
  const db = await sqlite.open({
    filename: './data.db',
    driver: sqlite3.Database
  });
  await db.open();
  await db.run('CREATE TABLE IF NOT EXISTS subs (timestamp INTEGER, ending_at INTEGER, seconds_per_sub INTEGER, plan TEXT, user_name TEXT);');
  await db.run('CREATE TABLE IF NOT EXISTS sub_bombs (timestamp INTEGER, amount_subs INTEGER, plan TEXT, user_name TEXT);');
  await db.run('CREATE TABLE IF NOT EXISTS cheers (timestamp INTEGER, ending_at INTEGER, amount_bits INTEGER, user_name TEXT);');
  await db.run('CREATE TABLE IF NOT EXISTS graph (timestamp INTEGER, ending_at INTEGER);');
  await db.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value INTEGER);');


  const authToken = await getAuthToken();

  // Check expiry of token every 10 minutes and refresh if necessary
  setInterval(async () => {
    await getAuthToken();
  }, 1000*60*10);

  const twitch = !USE_MOCK ? tmi.Client({
    channels: [cfg.channel.toLowerCase()],
    identity: {
      username: cfg.channel.toLowerCase(),
      password: authToken
    }
  }) : tmi.Client({
    options: {debug: true},
    channels: [cfg.channel],
    identity: {
      username: "test",
      password: "oauth:test"
    },
    connection: {
      secure: true,
      server: 'irc.fdgt.dev'
    }
  });

  await twitch.connect().catch(console.error);

  const app = express.default();
  app.use(express.static('public'));

  const server = http.createServer(app);
  const io = new socketio.Server(server);

  let isStarted = false;
  let startedAt = 0;

  const resStart = await db.get("SELECT * FROM settings WHERE key='started_at';");
  if(resStart) {
    isStarted = true;
    startedAt = resStart.value;
    console.log(`Found started_at in data.db: ${new Date(startedAt).toISOString()}`);
  }

  let baseTime = cfg.time.base_value;
  const resTime = await db.get("SELECT * FROM settings WHERE key='base_time';");
  if(resTime) {
    baseTime = resTime.value;
    console.log(`Found base_time in data.db: ${baseTime}`);
  }

  let endingAt = 0;
  const resEndingAt = await db.get("SELECT timestamp,ending_at FROM subs UNION ALL SELECT timestamp,ending_at FROM graph ORDER BY timestamp DESC;")
  if(resEndingAt) {
    endingAt = resEndingAt.ending_at;
    console.log(`Found last timer value in data.db: Ending at ${new Date(endingAt).toISOString()}`);
  }

  const appState = new AppState(twitch, db, io, isStarted, startedAt, endingAt, baseTime);

  registerSocketEvents(appState);
  registerTwitchEvents(appState);
  if(cfg.use_streamlabs) {
    registerStreamlabsEvents(appState);
  }
  if(cfg.use_streamelements) {
    registerStreamelementsEvents(appState)
  }

  server.listen(cfg.port, () => {
    console.log(`Open the timer at http://localhost:${cfg.port}/timer.html`);
    console.log(`There is also a popup for time changes with reason available at http://localhost:${cfg.port}/reason_popup.html`)
    if(USE_MOCK) {
      setInterval(async () => {
        await twitch.say(cfg.channel, 'submysterygift');
        console.log("submysterygift");
      }, 22000);
    }
  });
})();

function registerTwitchEvents(state: AppState) {
  state.twitch.on('message', async (channel: string, userstate: tmi.ChatUserstate, message: string, self: boolean) => {
    if(self) return;
    if(!isWheelBlacklisted(userstate.username||"")) {
      if(Math.random() > 0.90) {
        state.randomTarget = userstate.username || "";
        state.randomTargetUserId = userstate.id!;
        state.randomTargetIsMod = userstate.mod || false;
      }
    }
    if(message.startsWith('?') && isAdmin(userstate.username||"")) {
      {
        // ?start
        const match = message.match(/^\?start ((\d+:)?\d{2}:\d{2})/);
        if(match) {
          if(!state.isStarted) {
            const timeStr = match[1].split(":");
            if(timeStr.length === 3) {
              const hours = parseInt(timeStr[0], 10);
              const minutes = parseInt(timeStr[1], 10);
              const seconds = parseInt(timeStr[2], 10);
              await state.start((((hours * 60) + minutes) * 60) + seconds);
            } else {
              const minutes = parseInt(timeStr[0], 10);
              const seconds = parseInt(timeStr[1], 10);
              await state.start((minutes * 60) + seconds);
            }
          }
        }
      }

      {
        // ?setbasetime
        const match = message.match(/^\?setbasetime (\d+)/);
        if(match) {
          await state.updateBaseTime(parseInt(match[1], 10));
        }
      }

      {
        // ?forcetimer
        const match = message.match(/^\?forcetimer ((\d+:)?\d{2}:\d{2})/);
        if(match) {
          if(state.isStarted) {
            const timeStr = match[1].split(":");
            if(timeStr.length === 3) {
              const hours = parseInt(timeStr[0], 10);
              const minutes = parseInt(timeStr[1], 10);
              const seconds = parseInt(timeStr[2], 10);
              await state.forceTime((((hours * 60) + minutes) * 60) + seconds);
            } else {
              const minutes = parseInt(timeStr[0], 10);
              const seconds = parseInt(timeStr[1], 10);
              await state.forceTime((minutes * 60) + seconds);
            }
          }
        }
      }

      {

        // ?forceuptime
        const match = message.match(/^\?forceuptime ((\d+:)?\d{2}:\d{2})/);
        if(match) {
          if(state.isStarted) {
            const timeStr = match[1].split(":");
            let minusSeconds;
            if(timeStr.length === 3) {
              const hours = parseInt(timeStr[0], 10);
              const minutes = parseInt(timeStr[1], 10);
              const seconds = parseInt(timeStr[2], 10);
              minusSeconds = (((hours*60) + minutes) * 60) + seconds
            } else {
              const minutes = parseInt(timeStr[0], 10);
              const seconds = parseInt(timeStr[1], 10);
              minusSeconds = (minutes * 60) + seconds
            }
            await state.updateStartedAt(Date.now() - (minusSeconds * 1000))
          }
        }

      }

      {

        // ?wheelmode
        if(message.startsWith("?wheelmode ")) {
          const mode = message.split(" ")[1]
          const oldWheelMode = state.getWheelMode();
          state.setWheelMode(mode);
          await state.twitch.say(cfg.channel, `Wheel mode switched from ${oldWheelMode} to ${mode}`);
        }

      }

    }
  });

  state.twitch.on('subgift', async (channel: string, username: string, streakMonths: number, recipient: string,
                        methods: tmi.SubMethods, _userstate: tmi.SubGiftUserstate) => {
    if(state.endingAt < Date.now()) return;
    const multiplier = multiplierFromPlan(methods.plan);
    const secondsToAdd = Math.round(state.baseTime * multiplier * 1000) / 1000;
    state.addTime(secondsToAdd);
    await state.db.run('INSERT INTO subs VALUES(?, ?, ?, ?, ?);', [Date.now(), state.endingAt, methods.plan||"undefined", username]);
  });

  state.twitch.on('submysterygift', async (channel: string, username: string, numbOfSubs: number,
                               methods: tmi.SubMethods, userstate: tmi.SubMysteryGiftUserstate) => {
    const multiplier = multiplierFromPlan(methods.plan);
    const secondsAdded = Math.round(state.baseTime * multiplier * 1000 * numbOfSubs) / 1000;
    state.displayAddTimeUpdate(secondsAdded, `${username || "anonymous"} (subgift)`);
    state.triggerWheelSpin(WheelTriggerType.SUB_GIFTS, numbOfSubs, username, userstate.login, userstate.id, userstate.mod);
    await state.db.run('INSERT INTO sub_bombs VALUES(?, ?, ?, ?);', [Date.now(), numbOfSubs, methods.plan||"undefined", username]);
  });

  state.twitch.on('subscription', async (channel: string, username: string, methods: tmi.SubMethods,
                             _message: string, _userstate: tmi.SubUserstate) => {
    if(state.endingAt < Date.now()) return;
    const multiplier = multiplierFromPlan(methods.plan);
    const secondsToAdd = Math.round(state.baseTime * multiplier * 1000) / 1000;
    state.addTime(secondsToAdd);
    state.displayAddTimeUpdate(secondsToAdd, `${username} (sub)`);
    await state.db.run('INSERT INTO subs VALUES(?, ?, ?, ?, ?);', [Date.now(), state.endingAt, methods.plan||"undefined", username]);
  });

  state.twitch.on('resub', async (channel: string, username: string, months: number, message: string,
                      userstate: tmi.SubUserstate, methods: tmi.SubMethods) => {
    if(state.endingAt < Date.now()) return;
    const multiplier = multiplierFromPlan(methods.plan);
    const secondsToAdd = Math.round(state.baseTime * multiplier * 1000) / 1000;
    state.addTime(secondsToAdd);
    state.displayAddTimeUpdate(secondsToAdd, `${username || "anonymous"} (sub)`);
    await state.db.run('INSERT INTO subs VALUES(?, ?, ?, ?, ?);', [Date.now(), state.endingAt, methods.plan||"undefined", username]);
  });

  state.twitch.on('cheer', async (channel: string, userstate: tmi.ChatUserstate, _message: string) => {
    const bits = parseInt(userstate.bits || "0", 10);
    if(state.endingAt < Date.now()) return;
    const multiplier = cfg.time.multipliers.bits;
    const secondsToAdd = Math.round((bits / 100) * multiplier * state.baseTime * 1000) / 1000;
    state.addTime(secondsToAdd);
    state.displayAddTimeUpdate(secondsToAdd, `${userstate.username || "anonymous"} (bits)`);
    await state.db.run('INSERT INTO cheers VALUES(?, ?, ?, ?);', [Date.now(), state.endingAt, bits, userstate.username||"ananonymouscheerer"]);
  });
}

function registerSocketEvents(state: AppState) {
  state.io.on('connection', async (socket) => {
    socket.emit('update_incentives', {
      'tier_1': Math.round(state.baseTime * cfg.time.multipliers.tier_1),
      'tier_2': Math.round(state.baseTime * cfg.time.multipliers.tier_2),
      'tier_3': Math.round(state.baseTime * cfg.time.multipliers.tier_3),
      'bits': Math.round(state.baseTime * cfg.time.multipliers.bits),
      'donation': Math.round(state.baseTime * cfg.time.multipliers.donation),
      'follow': Math.round(state.baseTime * cfg.time.multipliers.follow)
    });
    socket.emit('update_timer', {'ending_at': state.endingAt, 'forced': true});
    socket.emit('update_uptime', {'started_at': state.startedAt});
    await state.broadcastGraph();

    for(const spin of state.spins.values()) {
      socket.emit('display_spin', spin);
    }
    socket.on('spin_completed', async spinId => {
      await state.executeSpinResult(spinId);
    });});
}

function isAdmin(username: string) {
  return cfg.admins.filter(admin => admin.toLowerCase() === username.toLowerCase()).length > 0
}

function isWheelBlacklisted(username: string) {
  return cfg.wheel_blacklist.filter(b => b.toLowerCase() === username.toLowerCase()).length > 0
}

function registerStreamlabsEvents(state: AppState) {
  const slabs = socketioclient(`https://sockets.streamlabs.com?token=${cfg.streamlabs_token}`, {transports: ['websocket']});
  slabs.on('event', (eventData : any) => {
    if(eventData.type === 'donation') {
      for(const msg of eventData.message) {
        const amount = msg.amount;
        if(amount == null) {
          console.log(`Error adding donation! Amount seems to be null. Message: ${JSON.stringify(eventData)}`)
          return;
        }
        if(state.endingAt < Date.now()) return;
        const secondsToAdd = Math.round(state.baseTime * amount * cfg.time.multipliers.donation * 1000) / 1000;
        state.addTime(secondsToAdd);
        state.displayAddTimeUpdate(secondsToAdd, `${msg.name} (tip)`);
        state.triggerWheelSpin(WheelTriggerType.DONATION, amount, msg.name);
      }
    } else if(eventData.type === 'follow') {
      if(state.endingAt < Date.now()) return;
      const secondsToAdd = Math.round(state.baseTime * cfg.time.multipliers.follow * 1000) / 1000;
      const name = eventData.message[0]?.name || "undefined";
      state.addTime(secondsToAdd);
      state.displayAddTimeUpdate(secondsToAdd, `${name} (follow)`);
    }
  });
  slabs.on("connect_error", (err: any) => {
    console.log(`streamlabs connection error: ${err}`);
  });
  slabs.on("connect", () => {
    console.log(`successfully connected to streamlabs socket`);
  });
  slabs.on("reconnecting", (attempt: any) => {
    console.log(`streamlabs reconnecting (attempt ${attempt})`);
  });
  slabs.on("disconnect", (reason: any) => {
    console.log(`streamlabs disconnected! (${reason}) is your token valid?`);
  });
}

function registerStreamelementsEvents(state: AppState) {
  const seSocket = socketioclient(`https://realtime.streamelements.com`, {transports: ['websocket']});

  seSocket.on('event', (event: any) => {
    if(event.type == 'tip') {
      if(state.endingAt < Date.now()) return;
      const secondsToAdd = Math.round(state.baseTime * event.data.amount * cfg.time.multipliers.donation * 1000) / 1000;
      state.addTime(secondsToAdd);
      state.displayAddTimeUpdate(secondsToAdd, `${event.data.displayName || event.data.username || "anonymous"} (tip)`);
      state.triggerWheelSpin(WheelTriggerType.DONATION, event.data.amount, event.data.displayName || event.data.username || "anonymous");
    } else if(event.type == 'follower') {
      if(state.endingAt < Date.now()) return;
      const secondsToAdd = Math.round(state.baseTime * cfg.time.multipliers.follow * 1000) / 1000;
      state.addTime(secondsToAdd);
      state.displayAddTimeUpdate(secondsToAdd, `${event.data.displayName} (follow)`);
    }
  });

  seSocket.on("connect", () => {
    seSocket.emit('authenticate', {method: 'jwt', token: cfg.streamelements_token});
  })
  seSocket.on("connect_error", (err: any) => {
    console.log(`streamelements connection error: ${err}`);
  });
  seSocket.on("reconnecting", (attempt: any) => {
    console.log(`streamelements reconnecting (attempt ${attempt})`);
  });
  seSocket.on("disconnect", (reason: any) => {
    console.log(`streamelements disconnected! (${reason}) is your token valid?`);
  });
  seSocket.on('unauthorized', console.log);
  seSocket.on('authenticated', (data: any) => {
    const { channelId } = data;
    console.log(`streamelements: successfully connected to channel ${channelId}`)
  });

}

function multiplierFromPlan(plan: tmi.SubMethod|undefined) {
  if(!plan) return cfg.time.multipliers.tier_1;
  switch (plan) {
    case "Prime":
      return cfg.time.multipliers.tier_1;
    case "1000":
      return cfg.time.multipliers.tier_1;
    case "2000":
      return cfg.time.multipliers.tier_2;
    case "3000":
      return cfg.time.multipliers.tier_3;
  }
}

async function getAuthToken(): Promise<string> {
  if (tokenCache.access_token && tokenCache.access_token.length > 0) {
    if (tokenCache.expiry_time > Date.now() - (1000*60*3)) {
      return tokenCache.access_token;
    } else {
      console.log("Refreshing access token...");
      const refreshData = new FormData();
      refreshData.append("client_id", cfg.twitch_client_id);
      refreshData.append("grant_type", "refresh_token");
      refreshData.append("refresh_token", tokenCache.refresh_token);

      const refreshResult = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        body: refreshData
      });

      if (refreshResult.ok) {
        const refreshResultJson = await refreshResult.json();
        tokenCache.access_token = refreshResultJson.access_token;
        tokenCache.refresh_token = refreshResultJson.refresh_token;
        tokenCache.expiry_time = Date.now() + (1000 * refreshResultJson.expires_in);

        await fs.writeFile(TOKEN_CACHE_PATH, JSON.stringify(tokenCache), 'utf8');

        return tokenCache.access_token;
      }

      console.log("Refreshing token failed...");
    }
  }

  console.log("Triggering device code flow.");
  return await triggerDeviceCodeFlow();
}

async function triggerDeviceCodeFlow(): Promise<string> {
  const formData = new FormData();
  formData.append("client_id", cfg.twitch_client_id);
  formData.append("scopes", TOKEN_SCOPES)

  const response = await fetch("https://id.twitch.tv/oauth2/device", {
    method: 'POST',
    body: formData
  });

  const responseJson = await response.json();

  const codeExpiry = new Date(Date.now() + (responseJson.expires_in * 1000));

  console.log("Opening browser to authenticate...");
  console.log(`Click here if your browser did not open: ${responseJson.verification_uri}`);
  await open(responseJson.verification_uri);

  while (new Date() < codeExpiry) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Poll device code flow
    const formDataPoll = new FormData();
    formDataPoll.append("client_id", cfg.twitch_client_id);
    formDataPoll.append("scopes", TOKEN_SCOPES);
    formDataPoll.append("device_code", responseJson.device_code);
    formDataPoll.append("grant_type", "urn:ietf:params:oauth:grant-type:device_code");

    const pollResult = await fetch("https://id.twitch.tv/oauth2/token", {
      method: 'POST',
      body: formDataPoll
    });

    if (!pollResult.ok) {
      if (pollResult.status == 400) {
        continue;
      } else {
        console.log("Error occured while fetching token from twitch device code.");
        throw new Error(`Error occured while fetching token from twitch device code: ${pollResult.statusText} ${pollResult.statusText}`);
      }
    }
    const pollResultJson = await pollResult.json();

    tokenCache = {
      access_token: pollResultJson.access_token,
      expiry_time: Date.now() + (pollResultJson.expires_in * 1000),
      refresh_token: pollResultJson.refresh_token
    };

    await fs.writeFile(TOKEN_CACHE_PATH, JSON.stringify(tokenCache), 'utf8');

    console.log("Authentication with Twitch succeeded!");

    return pollResultJson.access_token;
  }

  throw Error("Device code authentication timed out");
}

async function timeoutUser(userId: string, durationSeconds: number, reason: string) {
  const urlParams = new URLSearchParams();
  urlParams.append("broadcaster_id", cfg.twitch_channel_id);
  urlParams.append("moderator_id", cfg.twitch_user_id);

  const res = await fetch("https://api.twitch.tv/helix/moderation/bans?" + urlParams.toString(), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${await getAuthToken()}`,
      "Client-Id": cfg.twitch_client_id,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "data": {
        "user_id": userId,
        "duration": durationSeconds,
        "reason": reason
      }
    })
  });
  if (!res.ok) {
    console.log(await res.text())
    throw new Error("Failed to apply timeout: " + res.statusText);
  }
}

async function modUser(userId: string) {
  const urlParams = new URLSearchParams();
  urlParams.append("broadcaster_id", cfg.twitch_channel_id);
  urlParams.append("user_id", userId);

  const res = await fetch("https://api.twitch.tv/helix/moderation/moderators?" + urlParams.toString(), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${await getAuthToken()}`,
      "Client-Id": cfg.twitch_client_id
    }
  });
  if (!res.ok) {
    console.log(await res.text())
    throw new Error("Failed to add moderator: " + res.statusText);
  }
}