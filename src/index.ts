import * as express from "express";
import * as http from "http";
import * as socketio from "socket.io";

const port = 8080;

const app = express.default();
app.use(express.static('public'));

const server = http.createServer(app);
const io = new socketio.Server(server);


io.on('connection', (socket) => {
  console.log(socket);
});


server.listen(port, () => {
  console.log(`server started at http://localhost:${port}`);
});