import axios from 'axios';

export interface ViesValidationResult {
  valid: boolean;
  companyName?: string;
  companyAddress?: string;
  error?: string;
}

// EU country codes that support VIES validation
export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
];

export const isEUVatNumber = (vatNumber: string): boolean => {
  if (!vatNumber || vatNumber.length < 4) return false;
  const countryCode = vatNumber.substring(0, 2).toUpperCase();
  return EU_COUNTRIES.includes(countryCode);
};

export const validateVATNumber = async (vatNumber: string): Promise<ViesValidationResult> => {
  console.log(`🔍 VIES: Starting validation for VAT number: ${vatNumber}`);
  
  if (!vatNumber || vatNumber.length < 4) {
    console.log(`❌ VIES: Invalid VAT number format - too short`);
    return { valid: false, error: 'Invalid VAT number format' };
  }

  const countryCode = vatNumber.substring(0, 2).toUpperCase();
  const vatId = vatNumber.substring(2);
  
  console.log(`🔍 VIES: Parsed - Country: ${countryCode}, VAT ID: ${vatId}`);

  // Check if it's an EU VAT number
  if (!isEUVatNumber(vatNumber)) {
    console.log(`❌ VIES: ${countryCode} is not an EU country`);
    return { valid: false, error: 'VAT number is not from an EU country' };
  }

  console.log(`✅ VIES: ${countryCode} is valid EU country, proceeding with VIES API call`);

  try {
    // Using the public VIES SOAP service via HTTP
    const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:tns1="urn:ec.europa.eu:taxud:vies:services:checkVat:types"
               xmlns:impl="urn:ec.europa.eu:taxud:vies:services:checkVat">
  <soap:Header>
  </soap:Header>
  <soap:Body>
    <tns1:checkVat xmlns:tns1="urn:ec.europa.eu:taxud:vies:services:checkVat:types"
                   xmlns="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
      <tns1:countryCode>${countryCode}</tns1:countryCode>
      <tns1:vatNumber>${vatId}</tns1:vatNumber>
    </tns1:checkVat>
  </soap:Body>
</soap:Envelope>`;

    console.log(`🌐 VIES: Sending SOAP request to VIES service...`);
    console.log(`📤 VIES: Request payload - Country: ${countryCode}, VAT ID: ${vatId}`);

    const response = await axios.post(
      'https://ec.europa.eu/taxation_customs/vies/services/checkVatService',
      soapRequest,
      {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'urn:ec.europa.eu:taxud:vies:services:checkVat/checkVat',
        },
        timeout: 10000, // 10 seconds timeout
      }
    );

    console.log(`📥 VIES: Response status: ${response.status}`);
    console.log(`📥 VIES: Response received, parsing...`);

    const responseData = response.data;
    
    // Log the full response for debugging (truncated for readability)
    console.log(`📄 VIES: Raw response preview: ${responseData.substring(0, 200)}...`);

    // Parse the SOAP response
    if (responseData.includes('<ns2:valid>true</ns2:valid>')) {
      console.log(`✅ VIES: VAT number is VALID according to VIES`);
      
      // Extract company name and address if available
      const nameMatch = responseData.match(/<ns2:name><!\[CDATA\[(.*?)\]\]><\/ns2:name>/);
      const addressMatch = responseData.match(/<ns2:address><!\[CDATA\[(.*?)\]\]><\/ns2:address>/);

      const companyName = nameMatch ? nameMatch[1] : undefined;
      const companyAddress = addressMatch ? addressMatch[1] : undefined;

      console.log(`📊 VIES: Company Name: ${companyName || 'Not provided'}`);
      console.log(`📊 VIES: Company Address: ${companyAddress || 'Not provided'}`);

      return {
        valid: true,
        companyName,
        companyAddress,
      };
    } else if (responseData.includes('<ns2:valid>false</ns2:valid>')) {
      console.log(`❌ VIES: VAT number is INVALID according to VIES`);
      return { valid: false, error: 'VAT number is not valid according to VIES' };
    } else {
      console.log(`⚠️ VIES: Unexpected response format, unable to parse validation result`);
      console.log(`📄 VIES: Full response for debugging: ${responseData}`);
      return { valid: false, error: 'Unable to validate VAT number' };
    }
  } catch (error: any) {
    console.log(`💥 VIES: Error occurred during validation`);
    console.error('VIES validation error:', error.message || error);
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log(`🚫 VIES: Service unavailable (${error.code})`);
      return { valid: false, error: 'VIES service is temporarily unavailable' };
    } else if (error.code === 'ECONNABORTED') {
      console.log(`⏰ VIES: Request timed out after 10 seconds`);
      return { valid: false, error: 'VAT validation request timed out' };
    } else if (error.response?.status === 500) {
      console.log(`🔴 VIES: Service returned HTTP 500 error`);
      return { valid: false, error: 'VIES service returned an error' };
    } else if (error.response) {
      console.log(`🔴 VIES: HTTP ${error.response.status} - ${error.response.statusText}`);
    }
    
    console.log(`❌ VIES: Validation failed with generic error`);
    return { valid: false, error: 'Failed to validate VAT number' };
  }
};

// Format VAT number for display
export const formatVATNumber = (vatNumber: string): string => {
  if (!vatNumber) return '';
  return vatNumber.toUpperCase().replace(/\s/g, '');
};

// Validate VAT number format without VIES check
export const isValidVATFormat = (vatNumber: string): boolean => {
  if (!vatNumber) return false;
  
  const formatted = formatVATNumber(vatNumber);
  
  // Basic format: 2 letters + 4-15 alphanumeric characters
  return /^[A-Z]{2}[A-Z0-9]{4,15}$/.test(formatted);
};