
import { opetService } from '../services/opetService';
import dotenv from 'dotenv';

dotenv.config();

async function testOpet() {
  try {
    console.log('Testing Opet Service...');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 3); // Last 3 days
    const endDate = new Date();

    console.log(`Date Range: ${startDate.toISOString()} - ${endDate.toISOString()}`);

    const result = await opetService.syncAllCompanies(startDate, endDate);
    console.log('Sync Result:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Test Failed:', error);
  }
}

testOpet();
