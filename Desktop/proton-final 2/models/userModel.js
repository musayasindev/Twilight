const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  name: {
    type: String,
    trim: true,
    unique: true,
  },
  password: {
    type: String,
    required: [true, "Password is required to create an account."],
    select: false,
  }
});

const User = mongoose.model("User", userSchema);

module.exports = User;
