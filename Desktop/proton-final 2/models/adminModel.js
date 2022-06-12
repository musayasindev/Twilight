const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
  time: String,
  type: String,
  message: String,
});

const adminSchema = new mongoose.Schema({
  username: { type: String, default: "admin" },
  password: String,
  loginToken: String,
  logs: [logSchema],
  ipLog: Array,
});

const Admin = mongoose.model("Admin", adminSchema);

// ///////////////////// INITIALIZE ADMIN //////////////////////////
const initAdmin = async () => {
  const admin = await Admin.findOne({ username: "admin" });

  if (!admin) {
    await Admin.create({
      username: "admin",
      password: "",
      loginToken: "",
      logs: [],
      ipLog: [],
    });
  }
};

initAdmin();

module.exports = Admin;
