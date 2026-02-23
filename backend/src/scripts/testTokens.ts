
import { parseStringPromise, processors } from 'xml2js';
import dotenv from 'dotenv';

dotenv.config();

const SOAP_URL = 'https://rapor.otobil.com/OtobilWebService/Reports.asmx';

const CONFIG = {
  companyName: 'Bermer',
  username: '169975',
  password: process.env.OPET_BERMER_PASSWORD || 'Dino3545.',
  fleetCode: 279362,
  customerCode: 169975
};

async function testToken(tokenAttempt: string, description: string) {
  console.log(`Testing token: ${description} (${tokenAttempt})`);
  
  const startStr = new Date().toISOString().split('T')[0] + 'T00:00:00';
  const endStr = new Date().toISOString().split('T')[0] + 'T23:59:59';

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetFirmTxnDetail xmlns="http://tempuri.org/">
      <request>
        <CustomerCode>${CONFIG.customerCode}</CustomerCode>
        <FleetCode>${CONFIG.fleetCode}</FleetCode>
        <GroupCode>0</GroupCode>
        <ProcessBeginDate>${startStr}</ProcessBeginDate>
        <ProcessEndDate>${endStr}</ProcessEndDate>
      </request>
      <tokenKey>${tokenAttempt}</tokenKey>
    </GetFirmTxnDetail>
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await fetch(SOAP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://tempuri.org/GetFirmTxnDetail'
      },
      body: xml
    });

    const text = await response.text();
    // console.log('Response:', text.substring(0, 500)); // Log first 500 chars

    if (text.includes('TokenKey geçersiz')) {
      console.log('❌ Failed: TokenKey invalid');
    } else if (text.includes('Fault')) {
      console.log('❌ Failed: SOAP Fault');
    } else {
      console.log('✅ Success! (Likely)');
      console.log(text.substring(0, 200));
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

async function runTests() {
  await testToken(CONFIG.password, 'Password');
  await testToken(CONFIG.username, 'Username');
  await testToken(String(CONFIG.fleetCode), 'FleetCode');
  await testToken(CONFIG.username + CONFIG.password, 'Username + Password');
  await testToken(CONFIG.username + ':' + CONFIG.password, 'Username:Password');
}

runTests();
