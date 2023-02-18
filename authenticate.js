const mysql = require('./utils/mysql');
const { v4: uuidv4 } = require('uuid');
const listenPort = 6200;
const hostname = 'authentication.treepadcloud.com'
const privateKeyPath = `/etc/letsencrypt/live/${hostname}/privkey.pem`;
const fullchainPath = `/etc/letsencrypt/live/${hostname}/fullchain.pem`;

const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(express.static('public'));
app.use(express.json({limit: '200mb'})); 
app.use(cors());

const createLoginTable = async () => {
    const q = `CREATE TABLE IF NOT EXISTS login(
        user_id VARCHAR(40) NOT NULL,
        user_name VARCHAR(512) NOT NULL,
        email VARCHAR(325) NOT NULL,
        password VARCHAR(512) NOT NULL,
        token VARCHAR(40000) NOT NULL,
        PRIMARY KEY (user_id),
        UNIQUE KEY (user_name),
        UNIQUE KEY (email)
    )`;

    return mysql.query(q);
}

const uuid = () => uuidv4();


app.get('/', (req, res) => {
    res.send('Hello, Authentication!');
});

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