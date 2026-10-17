const sql = require("mssql");
require("dotenv").config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER.split("\\")[0], // "DESKTOP-N4DP1VA"
    database: process.env.DB_NAME,
    options: {
        trustServerCertificate: true,
        encrypt: false,
        enableArithAbort: true,
        instanceName: process.env.DB_SERVER.split("\\")[1] // "SQLEXPRESS"
    }
};

const pool = new sql.ConnectionPool(dbConfig);
const poolConnect = pool.connect()
    .then(() => console.log("✅ Conectado a SQL Server"))
    .catch(err => console.error("❌ Error de conexión SQL:", err));

module.exports = { sql, pool, poolConnect };