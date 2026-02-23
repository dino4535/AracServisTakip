
import { parseStringPromise, processors } from 'xml2js';
import dotenv from 'dotenv';

dotenv.config();

const SOAP_URL = 'https://rapor.otobil.com/OtobilWebService/Reports.asmx';

const PASS = process.env.OPET_BERMER_PASSWORD || 'Dino3545.';

async function login(user: string, pass: string, desc: string) {
  console.log(`Trying Login (${desc}): User=${user}, Pass=${pass}`);
  
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Login xmlns="http://tempuri.org/">
      <username>${user}</username>
      <password>${pass}</password>
    </Login>
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await fetch(SOAP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://tempuri.org/Login'
      },
      body: xml
    });

    const text = await response.text();
    const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log('Result:', cleanText.substring(0, 100));

    if (text.includes('<LoginResult>')) {
        const match = text.match(/<LoginResult>(.*?)<\/LoginResult>/);
        if (match) console.log('LoginResult Token:', match[1]);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

async function run() {
  await login('169975', PASS, 'Username');
  await login('279362', PASS, 'FleetCode');
  await login('169975', 'Dino3545', 'Password without dot'); // Maybe the dot is typo?
  await login('Dino3545.', '169975', 'Swapped');
}

run();
