
import { parseStringPromise, processors } from 'xml2js';
import dotenv from 'dotenv';

dotenv.config();

const SOAP_URL = 'https://rapor.otobil.com/OtobilWebService/Reports.asmx';

const CONFIG = {
  username: '169975',
  password: process.env.OPET_BERMER_PASSWORD || 'Dino3545.',
  fleetCode: 279362,
  customerCode: 169975
};

async function testCookieFlow() {
  console.log('Testing Cookie Flow...');

  // Step 1: CheckState
  const checkStateXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CheckState xmlns="http://tempuri.org/">
      <username>${CONFIG.username}</username>
      <password>${CONFIG.password}</password>
    </CheckState>
  </soap:Body>
</soap:Envelope>`;

  let cookie = '';
  
  try {
    const res1 = await fetch(SOAP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://tempuri.org/CheckState'
      },
      body: checkStateXml
    });
    
    const text1 = await res1.text();
    console.log('CheckState Response:', text1.substring(0, 200));
    
    const setCookie = res1.headers.get('set-cookie');
    if (setCookie) {
      console.log('Cookie received:', setCookie);
      cookie = setCookie;
    } else {
      console.log('No cookie received.');
    }

  } catch (err) {
    console.error('CheckState failed:', err);
    return;
  }

  // Step 2: GetFirmTxnDetail
  const startStr = new Date().toISOString().split('T')[0] + 'T00:00:00';
  const endStr = new Date().toISOString().split('T')[0] + 'T23:59:59';

  const dataXml = `<?xml version="1.0" encoding="utf-8"?>
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
      <tokenKey>başarılı</tokenKey> 
    </GetFirmTxnDetail>
  </soap:Body>
</soap:Envelope>`;
// Trying "başarılı" as token, or maybe empty?

  try {
    const res2 = await fetch(SOAP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://tempuri.org/GetFirmTxnDetail',
        'Cookie': cookie
      },
      body: dataXml
    });

    const text2 = await res2.text();
    console.log('GetFirmTxnDetail Response:', text2.substring(0, 500));
    
  } catch (err) {
    console.error('GetFirmTxnDetail failed:', err);
  }
}

testCookieFlow();
