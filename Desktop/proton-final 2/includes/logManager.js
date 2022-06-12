const Admin = require('../models/adminModel');

module.exports = {
  log: async (type, message) => {
    // db.maindb.get('admin.logs').push({
    //     "time": new Date(),
    //     type: type.name,
    //     message
    // }).write();
    // console.log(type.name, message);

    const admin = await Admin.findOne({ username: 'admin' });

    admin.logs.push({
      time: new Date(),
      type: type.name,
      message,
    });

    await admin.save();
  },
  getLogs: async () => {
    // return db.maindb.get("admin.logs").sortBy("time").reverse().value();

    const admin = await Admin.findOne({ username: 'admin' });

    // Revers the array to sort it by time in descending order (latest first)
    // return admin.logs.reverse();

    return admin.logs.sort((a, b) => b.time - a.time);
  },
};
