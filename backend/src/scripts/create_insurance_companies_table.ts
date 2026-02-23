
import { connectDB } from '../config/database';
import sql from 'mssql';

const createTable = async () => {
  try {
    const pool = await connectDB();
    
    // Check if table exists
    const tableCheck = await pool.request().query(`
      SELECT * FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'dbo' 
      AND TABLE_NAME = 'InsuranceCompanies'
    `);

    if (tableCheck.recordset.length === 0) {
      console.log('Creating InsuranceCompanies table...');
      await pool.request().query(`
        CREATE TABLE InsuranceCompanies (
          InsuranceCompanyID INT IDENTITY(1,1) PRIMARY KEY,
          Name NVARCHAR(100) NOT NULL,
          IsActive BIT DEFAULT 1,
          CreatedAt DATETIME2 DEFAULT GETDATE(),
          UpdatedAt DATETIME2 DEFAULT GETDATE()
        )
      `);
      console.log('InsuranceCompanies table created successfully.');
      
      // Insert some default data
      console.log('Seeding default insurance companies...');
      await pool.request().query(`
        INSERT INTO InsuranceCompanies (Name) VALUES 
        ('Allianz Sigorta'),
        ('Axa Sigorta'),
        ('Anadolu Sigorta'),
        ('Sompo Sigorta'),
        ('Mapfre Sigorta'),
        ('Aksigorta'),
        ('Türkiye Sigorta'),
        ('HDI Sigorta'),
        ('Doğa Sigorta'),
        ('Quick Sigorta')
      `);
      console.log('Default insurance companies seeded.');
    } else {
      console.log('InsuranceCompanies table already exists.');
    }

  } catch (error) {
    console.error('Error creating table:', error);
  } finally {
    process.exit();
  }
};

createTable();
