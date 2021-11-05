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


  const twitch = tmi.Client({
    channels: [cfg.channel],
    identity: cfg.twitch_token ? {
      username: cfg.channel,
      password: cfg.twitch_token
    } : undefined
  });
  await twitch.connect().catch(console.error);

  twitch.on('message', (channel: string, userstate: tmi.ChatUserstate, message: string ,self: boolean) => {
    if(self) return;
    console.log(message);
  });

  const app = express.default();
  app.use(express.static('public'));

  const server = http.createServer(app);
  const io = new socketio.Server(server);


  io.on('connection', (socket) => {
    console.log(socket);
  });


  server.listen(cfg.port, () => {
    console.log(`Open the timer at http://localhost:${cfg.port}/timer.html`);
  });
})();