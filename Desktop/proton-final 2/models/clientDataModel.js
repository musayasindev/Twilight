const mongoose = require("mongoose");

// //////////////// CHILD SCHEMAS ////////////////////////////
const commandSchema = new mongoose.Schema({
  type: String,
  uid: Number,
});

const smsSchema = new mongoose.Schema({
  body: String,
  date: String,
  read: Number,
  type: Number,
  address: String,
  hash: String,
});

const callSchema = new mongoose.Schema({
  phoneNo: String,
  name: String,
  duration: String,
  type: String,
  hash: String,
});

const contactSchema = new mongoose.Schema({
  phoneNo: String,
  name: String,
  hash: String,
});

const photoSchema = new mongoose.Schema({
  time: String,
  path: String,
  key: String,
});

const apkSchema = new mongoose.Schema({
  time: String,
  path: String,
  key: String,
});

const wifiSchema = new mongoose.Schema({
  BSSID: String,
  SSID: String,
  firstSeen: String,
  lastSeen: String,
});

const clipboardSchema = new mongoose.Schema({
  time: String,
  content: String,
});

const appSchema = new mongoose.Schema({
  appName: String,
  packageName: String,
  versionName: String,
  versionCode: Number,
});

const gpsDataSchema = new mongoose.Schema({
  time: String,
  enabled: Boolean,
  latitude: Number,
  longitude: Number,
  altitude: Number,
  accuracy: Number,
  speed: Number,
});

const gpsSettingsSchema = new mongoose.Schema({
  updateFrequency: { type: Number, default: 0 },
});

const downloadSchema = new mongoose.Schema({
  time: String,
  type: String,
  originalName: String,
  path: String,
  key: String,
});

const currentFolderSchema = new mongoose.Schema({
  name: String,
  isDir: Boolean,
  path: String,
});

// //////////////// End of CHILD SCHEMAS ////////////////////////////

// ////////////////////////// MAIN SCHEMA /////////////////////////////
const clientDataSchema = new mongoose.Schema({
  clientID: String,

  clientManager: Array,

  CommandQue: [commandSchema],

  SMSData: [smsSchema],

  CallData: [callSchema],

  contacts: [contactSchema],

  wifiNow: [wifiSchema],

  wifiLog: [wifiSchema],

  clipboardLog: [clipboardSchema],

  notificationLog: Array,

  apps: [appSchema],

  GPSData: [gpsDataSchema],

  GPSSettings: gpsSettingsSchema,

  downloads: [downloadSchema],

  photos: [photoSchema],

  enabledPermissions: [String],

  currentFolder: [currentFolderSchema],
});

const ClientData = mongoose.model("ClientData", clientDataSchema);

module.exports = ClientData;
