import * as express from "express";
import * as http from "http";
import * as socketio from "socket.io";
import sqlite3 from 'sqlite3'
import * as sqlite from 'sqlite'
import cfg from '../config.json'
import * as tmi from 'tmi.js';

(async () => {
  // open the database
  const db = await sqlite.open({
    filename: './data.db',
    driver: sqlite3.Database
  });
  await db.open();
  await db.run('CREATE TABLE IF NOT EXISTS subs (timestamp INTEGER, ending_at INTEGER, seconds_per_sub INTEGER, tier INTEGER, user_name TEXT);');
  await db.run('CREATE TABLE IF NOT EXISTS sub_bombs (timestamp INTEGER, amount_subs INTEGER, tier INTEGER, user_name TEXT);');
  await db.run('CREATE TABLE IF NOT EXISTS graph (timestamp INTEGER, ending_at INTEGER);');
  await db.run('CREATE TABLE IF NOT EXISTS settings (key TEXT, value INTEGER);');


  const twitch = tmi.Client({
    channels: [cfg.channel],
    identity: cfg.twitch_token ? {
      username: cfg.channel,
      password: cfg.twitch_token
    } : undefined
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

  const appState = new AppState(twitch, db, io, isStarted, startedAt, baseTime);

  registerSocketEvents(appState);
  registerTwitchEvents(appState);

  server.listen(cfg.port, () => {
    console.log(`Open the timer at http://localhost:${cfg.port}/timer.html`);
  });
})();

function registerTwitchEvents(state: AppState) {
  state.twitch.on('message', (channel: string, userstate: tmi.ChatUserstate, message: string ,self: boolean) => {
    if(self) return;
    console.log(message);
  });

  state.twitch.on('subgift', (channel: string, username: string, streakMonths: number, recipient: string,
                        methods: tmi.SubMethods, userstate: tmi.SubGiftUserstate) => {
    console.log('subgift');
  });

  state.twitch.on('submysterygift', (channel: string, username: string, numbOfSubs: number,
                               methods: tmi.SubMethods, userstate: tmi.SubMysteryGiftUserstate) => {
    console.log('submysterygift');
  });

  state.twitch.on('subscription', (channel: string, username: string, methods: tmi.SubMethods,
                             message: string, userstate: tmi.SubUserstate) => {
    console.log('subscription');
  });

  state.twitch.on('resub', (channel: string, username: string, months: number, message: string,
                      userstate: tmi.SubUserstate, methods: tmi.SubMethods) => {
    console.log('resub');
  });
}

function registerSocketEvents(state: AppState) {
  state.io.on('connection', (socket) => {
    console.log(socket);
  });
}

class AppState {
  twitch: tmi.Client;
  db: sqlite.Database;
  io: socketio.Server;

  isStarted: boolean;
  endingAt: number;

  baseTime: number;

  constructor(twitch: tmi.Client, db: sqlite.Database, io: socketio.Server,
              isStarted: boolean, endingAt: number, baseTime: number) {
    this.twitch = twitch;
    this.db = db;
    this.io = io;
    this.isStarted = isStarted;
    this.endingAt = endingAt;
    this.baseTime = baseTime;
  }

}