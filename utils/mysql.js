const mysqlDb = require('mysql');
require('dotenv').config();

const pool = mysqlDb.createPool({
  connectionLimit: 4,
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE
});

exports.sqlReady = false;
exports.mysql = mysqlDb;

pool.getConnection((err, connection) => {
    console.log('getting connection');
  if(err)
  throw err;
  console.log('Database connected successfully');
  connection.release();
  this.sqlReady = true;
});

exports.query = query => {
  return new Promise((resolve, reject) => {
    pool.query(query, (err, data) => {
      if(err) {
        reject(err);
        return;
      }
      resolve (data);
    })
  })
}