/* 
 * Configuration
 */
const listenPort = 6200;
const hostname = 'authentication.treepadcloud.com'
const privateKeyPath = `/home/keys/treepadcloud.com.key`;
const fullchainPath = `/home/keys/treepadcloud.com.pem`;


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

const isValidHostName = name => {
    if (!name) return false;
    
    if (name.startsWith('-')) return false;
    if (name.endsWith('-')) return false;

    let test = name.indexOf('--');
    if (test !== -1) return false;

    return (/^[a-zA-Z0-9-]{1,63}$/.test(name))
}

const createLoginTable = async () => {
    const q = `CREATE TABLE IF NOT EXISTS login(
        user_id VARCHAR(40) NOT NULL,
        user_name VARCHAR(512) NOT NULL,
        email VARCHAR(325) NOT NULL,
        password VARCHAR(512) NOT NULL,
        forrest_server VARCHAR(512) NOT NULL,
        PRIMARY KEY (user_id),
        UNIQUE KEY (user_name),
        UNIQUE KEY (email)
    )`;

    return mysql.query(q);
}

const createAvailableServersTable = async () => {
    const q = `CREATE TABLE IF NOT EXISTS available_servers(
        hostname VARCHAR(512) NOT NULL,
        ip VARCHAR(256) NOT NULL,
        num_cpus INT(8) NOT NULL,
        num_users INT(8) NOT NULL DEFAULT 0,
        status VARCHAR(128) NOT NULL DEFAULT 'active',
        PRIMARY KEY (hostname),
        INDEX (status)
    )`;

    console.log(q);

    return mysql.query(q);
}

const addForrestServer = async (hostname, ip, numCpus, numUsers, status) => {
    const q = `INSERT IGNORE INTO available_servers 
    (hostname, ip, num_cpus, num_users, status)
    VALUES('${hostname}', '${ip}', ${numCpus}, ${numUsers}, '${status}')`;
    
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
            return resolve('errno: 1');
        }
    
        /*
         * Validate Password Strength
         */
        const strength = zxcvbn(password).score;
    
        if (strength < 3) {
            res.status(400).json({status: 'error', errno: 2, msg: 'weak password'});
            return resolve('errno: 2');
        }
    
        /*
         * Validate Format of Email Address
         */
        if (!emailValidator.validate(email)) {
            res.status(400).json({status: 'error', errno: 3, msg: 'invalid email address'});
            return resolve('errno: 3');
        }

        /*
         * Validate that userName can be a host name
         */
        if (!isValidHostName(userName)) {
            res.status(400).json({status: 'error', errno: 4, msg: 'invalid user name'});
            return resolve('errno: 3');
        }

        /*
         * Validate that the user name is not already taken
         */
        const q = `SELECT user_id FROM login WHERE user_name = ${mysql.escape(userName)}`;
        let result = await mysql.query(q);
        if (result.length) {
            res.status(400).json({status: 'error', errno: 4, msg: 'user name already exists'});
            return resolve('errno: 4');
        }
        
        let token = jwt.sign({
            userName, email, password
        }, process.env.JWT_SECRET_KEY, {expiresIn: '3h'});

        let emailResult = sendEmailVerification(email, token);
       
        if (emailResult) {
            res.status(200).json({status: 'success'});
            return resolve('okay');
        }
        
        res.status(401).json({status: 'error', errno: 5, msg: "failed to send verification email to " + email})
        resolve('errno: 5');
    })
}

const bcryptHash = val => bcrypt.hashSync(val, 10);

const getForrestServer = async () => {
    let q = 'SELECT * FROM available_servers WHERE status = "active"';

    let info = await mysql.query(q);

    if (!info.length) return false;

    let servers = info.map(server => {
        let serverInfo = {
            hostname: server.hostname,
            usage: Number(server['num_users']) / Number(server['num_cpus'])
        }
        return serverInfo;
    });

    let usage = 100000000000;
    let forrestServer = null;

    for (let i = 0; i < servers.length; ++i) {
        if (servers[i].usage < usage) {
            usage = servers[i].usage;
            forrestServer = servers[i].hostname;
        }
    }

    return forrestServer;
}

const insertUser = async (userName, email, password) => {
    userId = 'u-' + uuid();
    hash = bcryptHash(password);

    const forrestServer = await getForrestServer();

    if (!forrestServer) throw new Error('No available forrest servers');

    q = `INSERT INTO login 
    (user_id, user_name, email, password, forrest_server) 
    VALUES ('${userId}', ${mysql.escape(userName)}, ${mysql.escape(email)}, ${mysql.escape(hash)}, '${forrestServer}')`;

    return mysql.query(q);
}

const treePadMessage = (res, msg) => {
    console.log('treePadMessage()');
    let html = `
        <div style="width: 100%; max-width: 1200px; margin-auto">
            <h1 style="text-align: center">${msg.title}</h1>
            <p style="padding: 0 2rem;">${msg.msg}</p>
    `
    if (msg.button) {
        html += `<a href="${msg.button.url}" style="text-decoration: none; color: white; background-color: #3880ff; padding: .25rem .5rem; margin: auto; display:block; width: fit-content; border-radius: 4px; text-align: center">${msg.button.title}</a>`
    }

    html += '</div>';

    console.log(html);

    res.status(200).send(html);
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

            let tokenVerification = false;

            try {
                tokenVerification = jwt.verify(token, process.env.JWT_SECRET_KEY);
            } catch (e) {
                console.log(e);
            }
            
            if (!tokenVerification) {
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
                    msg: 'Token has expired. Please register again.',
                    button: {
                        title: "Register",
                        url: 'https://login.treepadcloud.com'
                    }
                }
                return treePadMessage(res, message);
            }

            let result = null;

            try {
                result = await insertUser(userName, email, password);
            } catch (e) {
                console.log(e);
                if (e.code !== 'ER_DUP_ENTRY') console.error(e);
                let message = {
                    title: "Email Verification Error",
                    msg: e.code === 'ER_DUP_ENTRY' ?
                        `User ${userName} is already verified.  You may now login to TreePad Cloud.` :
                        `Could not add user ${userName} into the database. Please try again later.`,
                    button: {
                        title: "Login",
                        url: 'https://login.treepadcloud.com'
                    }
                };
                return treePadMessage(res, message);
            }

            treePadMessage(res, {
                title: 'Email Verification Success',
                msg: 'Thank you for verifying your email address. You may now login to TreePad Cloud.',
            });

            //res.redirect('https://login.treepadcloud.com');
        }
        
        resolve('ok');
    });
}

const login = async (body, res) => {
    return new Promise(async (resolve, reject) => {
        const { userName, password } = body;

        if (!userName || !password) {
            res.status(400).json({status: 'error', errno: 1, msg: 'missing parameters'});
            return resolve('errno: 1');
        }

        const q = `SELECT password, forrest_server FROM login WHERE user_name = ${mysql.escape(userName)}`
        let result = await mysql.query(q);

        if (!result.length) {
            res.status(400).json({status: 'error', errno: 2, msg: 'user name does not exist'});
            return resolve('errno: 2');
        }

        let test = await bcrypt.compare(password, result[0].password);

        if (!test) {
            res.status(400).json({status: 'error', errno: 3, msg: 'incorrect password'});
            return resolve('errno: 3');
        }

        let token = {};
        token.info = {
            userName,
            forrestServer: result[0]['forrest_server']
        }

        token.signed = jwt.sign(token.info, process.env.JWT_SECRET_KEY, {expiresIn: '7d'});

        res.status(200).json(token);
        resolve('okay');
    })
}

app.get('/', (req, res) => res.send('Hello, Authentication!'));

app.post('/register', (req, res) => registerUser(req.body, res));

app.post('/login', (req, res) => login(req.body, res));

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
    await createAvailableServersTable();
    await addForrestServer('forrest-1.treepadcloud.com', '137.184.99.20', 2, 0, 'active');
    
}

let waitId = setInterval(() => {
    if (mysql.sqlReady) {
        clearInterval(waitId);
        launchService();
    }
}, 250);


