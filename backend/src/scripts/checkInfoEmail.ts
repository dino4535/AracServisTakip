import { connectDB } from '../config/database';
import sql from 'mssql';

const run = async () => {
  try {
    const pool = await connectDB();

    const before = await pool
      .request()
      .input('Email', sql.NVarChar(100), 'info@dinogida.com.tr')
      .query('SELECT UserID, Name, Surname, Email FROM Users WHERE Email = @Email');

    if (before.recordset.length === 0) {
      console.log('NO_USER');
      return;
    }

    console.log('FOUND_USERS_BEFORE');
    console.log(JSON.stringify(before.recordset, null, 2));

    const newEmail = 'deleted+info@dinogida.com.tr';

    const updateRes = await pool
      .request()
      .input('Email', sql.NVarChar(100), 'info@dinogida.com.tr')
      .input('NewEmail', sql.NVarChar(100), newEmail)
      .query('UPDATE Users SET Email = @NewEmail WHERE Email = @Email');

    console.log('UPDATED_ROWS', updateRes.rowsAffected[0]);

    const after = await pool
      .request()
      .input('Email', sql.NVarChar(100), 'info@dinogida.com.tr')
      .query('SELECT UserID, Name, Surname, Email FROM Users WHERE Email = @Email');

    console.log('AFTER_UPDATE');
    console.log(JSON.stringify(after.recordset, null, 2));
  } catch (err) {
    console.error('CHECK_ERROR', err);
  } finally {
    process.exit(0);
  }
};

run();
