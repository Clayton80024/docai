# Google Document AI Setup

This application uses Google Document AI to automatically extract information from passport, I-94, I-20, and bank statement documents.

## Prerequisites

1. A Google Cloud Project with Document AI API enabled
2. A Document AI processor (Custom Extractor) created
3. A service account with Document AI permissions

## Current Configuration

- **Project ID**: `684267792607`
- **Location**: `us`

### Processors

#### Passport Processor
- **Processor ID**: `634b89fd7307082e`
- **Processor Endpoint**: `https://us-documentai.googleapis.com/v1/projects/684267792607/locations/us/processors/634b89fd7307082e:process`
- **Document Types**: `passport`, `dependent_passport`

#### I-94 Processor
- **Processor ID**: `620a6a45d473d87f`
- **Processor Endpoint**: `https://us-documentai.googleapis.com/v1/projects/684267792607/locations/us/processors/620a6a45d473d87f:process`
- **Document Types**: `i94`, `dependent_i94`

#### I-20 Processor
- **Processor ID**: `808078d27b2f653e`
- **Processor Endpoint**: `https://us-documentai.googleapis.com/v1/projects/684267792607/locations/us/processors/808078d27b2f653e:process`
- **Document Types**: `i20`

#### Bank Statement Processor
- **Processor ID**: `72bcc1007ce8bf72`
- **Processor Endpoint**: `https://us-documentai.googleapis.com/v1/projects/684267792607/locations/us/processors/72bcc1007ce8bf72:process`
- **Document Types**: `bank_statement`, `sponsor_bank_statement`

## Setup Instructions

### 1. Create a Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **IAM & Admin** > **Service Accounts**
3. Click **Create Service Account**
4. Give it a name (e.g., `document-ai-processor`)
5. Grant it the **Document AI API User** role
6. Click **Done**

### 2. Create and Download Service Account Key

1. Click on the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key** > **Create new key**
4. Choose **JSON** format
5. Download the JSON file

### 3. Add Credentials to Environment Variables

Add the service account JSON content to your `.env.local` file. **The JSON must be complete and on a single line.**

#### Step-by-Step Instructions:

1. **Download the JSON file** from Google Cloud Console (from step 2 above)
2. **Open the JSON file** in a text editor
3. **Minify the JSON** (remove all newlines and extra spaces):
   - You can use an online tool like [jsonformatter.org](https://jsonformatter.org/) or [jsonminifier.com](https://jsonminifier.com/)
   - Or use a command-line tool: `cat your-service-account.json | jq -c .`
4. **Escape newlines in the private_key field**:
   - Find all `\n` in the `private_key` value
   - Replace them with `\\n` (double backslash + n)
   - Example: `"-----BEGIN PRIVATE KEY-----\nMIIE..."` becomes `"-----BEGIN PRIVATE KEY-----\\nMIIE..."`
5. **Add to `.env.local`** with single quotes:

```bash
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account","project_id":"684267792607","private_key_id":"abc123","private_key":"-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\\n-----END PRIVATE KEY-----\\n","client_email":"your-service-account@project-id.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40project-id.iam.gserviceaccount.com"}'
```

**Critical Requirements:**
- ✅ The entire JSON must be on **one single line** (no line breaks)
- ✅ Use **single quotes** around the entire JSON string
- ✅ Escape newlines in `private_key` as `\\n` (double backslash + n)
- ✅ The JSON should be **> 1000 characters** (a complete service account JSON is typically 2000-3000 characters)
- ✅ Do NOT wrap the JSON in additional quotes
- ✅ Do NOT truncate or cut off the JSON

#### Quick Validation:

After adding to `.env.local`, you can verify the length:

```bash
# Check the length (should be > 1000 characters)
echo $GOOGLE_APPLICATION_CREDENTIALS_JSON | wc -c
```

Or in Node.js:
```javascript
console.log(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.length); // Should be > 1000
```

#### Common Issues:

- **Error: "Expected double-quoted property name"**: Your JSON has single quotes or is malformed. Make sure all property names and string values use double quotes.
- **Error: "Invalid JSON"**: Check that newlines in `private_key` are escaped as `\\n` (double backslash)
- **Error: "Missing required fields"**: Ensure `client_email` and `private_key` are present in the JSON
- **Error: "Credentials appear to be incomplete or truncated"**: Your JSON is too short (< 500 chars). The complete JSON should be 1000+ characters. Make sure you copied the entire JSON file content, including the full `private_key` field.

### Alternative: Using a JSON File (Not Recommended for Production)

If you prefer to use a file path instead (not recommended for production):

1. Place the service account JSON file in your project (e.g., `google-credentials.json`)
2. Add to `.gitignore` to prevent committing credentials
3. Update the code to read from the file instead

## How It Works

1. **Upload**: When a user uploads a processable document (passport, I-94, I-20, or bank statement), it's uploaded to Supabase Storage.

2. **Processing**: The document is automatically sent to Google Document AI for processing:
   - Document status is set to `processing`
   - File is downloaded from Supabase Storage
   - File is sent to the appropriate Google Document AI processor
   - Extracted data is parsed and structured based on document type

3. **Storage**: The extracted information is stored in the `extracted_data` JSONB field in the `documents` table:

   **For Passport Documents** (`passport`, `dependent_passport`):
   - `name`: Full name from passport
   - `passportNumber`: Passport number
   - `dateOfBirth`: Date of birth
   - `placeOfBirth`: Place of birth
   - `nationality`: Nationality
   - `gender`: Gender
   - `issueDate`: Issue date
   - `expiryDate`: Expiry date
   - `issuingAuthority`: Issuing authority
   - Additional fields as extracted by your custom extractor

   **For I-94 Documents** (`i94`, `dependent_i94`):
   - `name`: Full name
   - `admissionNumber`: I-94 admission number
   - `classOfAdmission`: Class of admission
   - `dateOfAdmission`: Date of admission
   - `admitUntilDate`: Admit until date (expiration)
   - `passportNumber`: Passport number
   - `countryOfIssuance`: Country of passport issuance
   - `birthDate`: Date of birth
   - Additional fields as extracted by your custom extractor

   **For I-20 Documents** (`i20`):
   - `studentName`: Student's full name
   - `sevisId`: SEVIS ID number
   - `schoolName`: School/institution name
   - `programOfStudy`: Program of study
   - `programLevel`: Program level (e.g., Bachelor's, Master's)
   - `majorField`: Major field of study
   - `startDate`: Program start date
   - `endDate`: Program end date
   - `dateOfBirth`: Date of birth
   - `countryOfBirth`: Country of birth
   - `countryOfCitizenship`: Country of citizenship
   - `financialSupport`: Financial support information
   - Additional fields as extracted by your custom extractor

   **For Bank Statement Documents** (`bank_statement`, `sponsor_bank_statement`):
   - `accountHolderName`: Account holder's name
   - `accountNumber`: Bank account number
   - `accountType`: Type of account (e.g., Checking, Savings)
   - `bankName`: Name of the bank/institution
   - `statementPeriod`: Statement period description
   - `startDate`: Statement period start date
   - `endDate`: Statement period end date
   - `openingBalance`: Opening balance for the period
   - `closingBalance`: Closing balance for the period
   - `totalDeposits`: Total deposits during the period
   - `totalWithdrawals`: Total withdrawals during the period
   - `currency`: Currency code (e.g., USD, EUR)
   - Additional fields as extracted by your custom extractor

4. **Status Update**: Document status is updated to:
   - `completed` if processing succeeds
   - `error` if processing fails

## Extracted Data Structure

The extracted data is stored as JSON in the `extracted_data` field:

### Passport Document Example

```json
{
  "name": "John Doe",
  "passportNumber": "AB123456",
  "dateOfBirth": "1990-01-15",
  "placeOfBirth": "New York, USA",
  "nationality": "American",
  "gender": "M",
  "issueDate": "2020-01-01",
  "expiryDate": "2030-01-01",
  "issuingAuthority": "United States Department of State"
}
```

### I-94 Document Example

```json
{
  "name": "John Doe",
  "admissionNumber": "12345678901",
  "classOfAdmission": "F1",
  "dateOfAdmission": "2024-01-15",
  "admitUntilDate": "D/S",
  "passportNumber": "AB123456",
  "countryOfIssuance": "USA",
  "birthDate": "1990-01-15"
}
```

### I-20 Document Example

```json
{
  "studentName": "John Doe",
  "sevisId": "N0123456789",
  "schoolName": "University of Example",
  "programOfStudy": "Computer Science",
  "programLevel": "Master's",
  "majorField": "Computer Science",
  "startDate": "2024-08-15",
  "endDate": "2026-05-15",
  "dateOfBirth": "1990-01-15",
  "countryOfBirth": "USA",
  "countryOfCitizenship": "USA",
  "financialSupport": "Personal funds"
}
```

### Bank Statement Document Example

```json
{
  "accountHolderName": "John Doe",
  "accountNumber": "1234567890",
  "accountType": "Checking",
  "bankName": "Example Bank",
  "statementPeriod": "January 2024",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "openingBalance": "5000.00",
  "closingBalance": "7500.00",
  "totalDeposits": "3000.00",
  "totalWithdrawals": "500.00",
  "currency": "USD"
}
```

## Customizing Field Extraction

The field extraction logic in `src/app/actions/document-ai.ts` maps Google Document AI entity types to our data structure. You can customize the extraction functions to match your custom extractor's output format:

- `extractPassportData()` - For passport documents
- `extractI94Data()` - For I-94 documents
- `extractI20Data()` - For I-20 documents
- `extractBankStatementData()` - For bank statement documents (both applicant and sponsor)

All functions handle common field name variations and store the raw API response in `_rawResponse` for debugging.

## Testing

1. Upload a passport, I-94, I-20, or bank statement document through the application
2. Check the document status in the database - it should change from `pending` → `processing` → `completed`
3. Check the `extracted_data` field to see the extracted information
4. For debugging, check the `_rawResponse` field in `extracted_data` to see the full API response

## Troubleshooting

### Error: "Google Application Credentials not configured"
- Make sure `GOOGLE_APPLICATION_CREDENTIALS_JSON` is set in `.env.local`
- Restart your development server after adding the environment variable

### Error: "Failed to get access token"
- Verify the service account JSON is valid
- Check that the service account has the correct permissions
- Ensure the Document AI API is enabled in your Google Cloud project

### Error: "Document AI processing failed"
- Check that the processor ID is correct
- Verify the processor is enabled and accessible
- Check the file format is supported (PDF, JPEG, PNG)

### No data extracted
- Check the `_rawResponse` field in `extracted_data` to see the full API response
- Verify your custom extractor is configured correctly
- Check that the document type matches what your extractor expects

## Security Notes

- **Never commit** service account credentials to version control
- Use environment variables for credentials in production
- Consider using Google Cloud Secret Manager for production deployments
- The service account should have minimal required permissions (Document AI API User only)

