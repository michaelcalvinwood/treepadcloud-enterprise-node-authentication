/* 
 * Configuration
 */
const listenPort = 6200;
const hostname = 'authentication.treepadcloud.com'
const privateKeyPath = `/etc/letsencrypt/live/${hostname}/privkey.pem`;
const fullchainPath = `/etc/letsencrypt/live/${hostname}/fullchain.pem`;


/*
 * Packages
 */

const { v4: uuidv4 } = require('uuid');
const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');
const zxcvbn = require('zxcvbn');
const emailValidator = require("email-validator");
const jwt = require('jsonwebtoken');
const bcrypt = require("bcrypt");

/*
 * Utils
 */

const mysql = require('./utils/mysql');
//const smtp = require('./utils/smtpCom');
const smtp = require('./utils/mailGun');
/*
 * Code
 */

const app = express();
app.use(express.static('public'));
app.use(express.json({limit: '200mb'})); 
app.use(cors());

const uuid = () => uuidv4();

const createLoginTable = async () => {
    const q = `CREATE TABLE IF NOT EXISTS login(
        user_id VARCHAR(40) NOT NULL,
        user_name VARCHAR(512) NOT NULL,
        email VARCHAR(325) NOT NULL,
        password VARCHAR(512) NOT NULL,
        PRIMARY KEY (user_id),
        UNIQUE KEY (user_name),
        UNIQUE KEY (email)
    )`;

    return mysql.query(q);
}

async function sleep(seconds) {
    return new Promise((resolve) =>setTimeout(resolve, seconds * 1000));
}

const sendEmailVerification = async (email, token) => {
    const sender = 'noreply@treepadcloud.com';
    const senderName = "TreePad Cloud";
    const subject = "TreePad Cloud Email Verification";
    const message = `
    <p>Thank you for subscribing to TreePad Cloud</p>
    <p>Pleave visit the following link to verify your email address: <a href='https://authentication.treepadcloud.com:6200/verify-email?token=${token}'>TreePad Email Verification</a></p>
    <p>With Regards,</p>
    <p>The TreePad Cloud Team</p>`;
    
    let emailResult = false;
    try {
        emailResult = await smtp.sendEmailViaMailGun(email, sender, subject, message, senderName);
        emailResult = true;
    } catch (e) {
        console.log(e);
    }

    return emailResult;
}

const registerUser = async (body, res) => {
    return new Promise (async (resolve, reject) => {
        const { userName, password, email } = body;

        if (!userName || !password || !email )  {
            res.status(400).json({status: 'error', errno: 1, msg: 'missing parameter'});
            resolve('errno: 1');
        }
    
        const strength = zxcvbn(password).score;
    
        if (strength < 3) {
            res.status(400).json({status: 'error', errno: 2, msg: 'weak password'});
            resolve('errno: 2');
        }
    
        if (!emailValidator.validate(email)) {
            res.status(400).json({status: 'error', errno: 3, msg: 'invalid email address'});
            resolve('errno: 3');
        }

        let token = jwt.sign({
            userName, email, password
        }, process.env.JWT_SECRET_KEY, {expiresIn: '3h'});
        
        let emailResult = sendEmailVerification(email, token);
       
        if (emailResult) res.status(200).json({status: 'success'});
        else res.status(401).json({status: 'error', errno: 4, msg: "failed to send verification email to " + email})

        resolve('okay');
    })
}

const insertUser = async (userName, email, password) => {
    userId = 'u-' + uuid();
    hash = bcrypt.hashSync(password, 10);

    const q = `INSERT INTO login (user_id, user_name, email, password) VALUES ('${userId}', ${mysql.escape(userName)}, ${mysql.escape(email)}, ${mysql.escape(hash)})`;

    return mysql.query(q);
}

const treePadMessage = (res, msg) => {
    res.redirect(`https://message.treepadcloud.com/?msg=${encodeURIComponent(JSON.stringify(msg))}`)
}

const verifyEmail = async (params, res) => {
    return new Promise(async (resolve, reject) => {
        const { token } = params;
        console.log(params);

        if (!token) {
            return treePadMessage(res, {
                title: "Email Verification Error",
                msg: "Missing token."
            })
        } else {
            
            if (!jwt.verify(token, process.env.JWT_SECRET_KEY)) {
                let message = {
                    title: 'Email Verification Error',
                    msg: 'Token is invalid'
                }
                return treePadMessage (res, message);
            } 
            const info = jwt.decode(token);

            const { userName, email, password, exp } = info;

            if (Date.now() >= exp * 1000) {
                let message = {
                    title: 'Email Verification Error',
                    msg: 'Token has expired. Please register again at <a href="https://login.treepadcloud.com">TreePad Cloud</a>.'
                }
                return treePadMessage(res, message);
            }

            let result = null;

            try {
                result = await insertUser(userName, email, password);
            } catch (e) {
                if (e.code !== 'ER_DUP_ENTRY') console.error(e);
                let message = {
                    title: "Email Verification Error",
                    msg: e.code === 'ER_DUP_ENTRY' ?
                        `User ${userName} is already verified.  You may now login to <a href="https://login.treepadcloud.com>TreePad Cloud</a>.` :
                        `Could not add user ${userName} into the database. Please try again later.`
                };
                return treePadMessage(res, message);
            }

            treePadMessage(res, {
                title: 'Email Verification Success',
                msg: 'Thank you for verifying your email address. You may now login to <a href="https://login.treepadcloud.com>TreePad Cloud</a>.'
            })
        }
        
        resolve('ok');
    });
}

app.get('/', (req, res) => res.send('Hello, Authentication!'));

app.post('/register', (req, res) => registerUser(req.body, res));

app.get('/verify-email', (req, res) => verifyEmail(req.query, res));

const httpsServer = https.createServer({
    key: fs.readFileSync(privateKeyPath),
    cert: fs.readFileSync(fullchainPath),
  }, app);
  

  httpsServer.listen(listenPort, () => {
    console.log(`HTTPS Server running on port ${listenPort}`);
});

const launchService = async () => {
    console.log('launchService', uuid());

    await createLoginTable();
}

let waitId = setInterval(() => {
    if (mysql.sqlReady) {
        clearInterval(waitId);
        launchService();
    }
}, 250);


