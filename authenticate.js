const mysql = require('./utils/mysql');

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

const launchService = async () => {
    console.log('launchService');

    await createLoginTable();
}

let waitId = setInterval(() => {
    if (mysql.sqlReady) {
        clearInterval(waitId);
        launchService();
    }
}, 1000);