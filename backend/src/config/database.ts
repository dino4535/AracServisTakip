import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

console.log('DB_SERVER:', process.env.DB_SERVER);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);

const config = {
  server: process.env.DB_SERVER || '77.83.37.248',
  port: parseInt(process.env.DB_PORT || '1433'),
  user: process.env.DB_USER || 'OGUZ',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'AracServisTakip',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 60000, // 60 seconds
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;

export const connectDB = async (): Promise<sql.ConnectionPool> => {
  try {
    if (!pool) {
      pool = await sql.connect(config);
      console.log('✅ MSSQL Database connected successfully');
    }
    return pool;
  } catch (error) {
    console.error('❌ MSSQL Database connection error:', error);
    throw error;
  }
};

export const getPool = (): sql.ConnectionPool => {
  if (!pool) {
    throw new Error('Database connection not established. Call connectDB() first.');
  }
  return pool;
};

export const closeDB = async (): Promise<void> => {
  try {
    if (pool) {
      await pool.close();
      pool = null;
      console.log('MSSQL Database connection closed');
    }
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
};

export default sql;
