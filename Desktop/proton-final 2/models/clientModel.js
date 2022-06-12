const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
  clientID: String,
  firstSeen: String,
  lastSeen: String,
  isOnline: Boolean,
  owner: String,
  dynamicData: {
    clientIP: String,
    clientGeo: Object,
    device: {
      model: String,
      manufacture: String,
      version: String,
    },
  },
});

const Client = mongoose.model("Client", clientSchema);

module.exports = Client;
