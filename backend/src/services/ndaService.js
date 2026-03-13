// src/services/ndaService.js
// DocuSign NDA integration for CID Layer 2 unlock

const docusign = require('docusign-esign');
const fs       = require('fs');
const path     = require('path');

const SCOPES = ['signature', 'impersonation'];

// ─── Get DocuSign API client ──────────────────────────────────────────────────
const getApiClient = () => {
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(process.env.DOCUSIGN_BASE_URL || 'https://demo.docusign.net/restapi');
  return apiClient;
};

// ─── Authenticate via JWT Grant ───────────────────────────────────────────────
const authenticate = async () => {
  const apiClient = getApiClient();
  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY.replace(/\\n/g, '\n');

  const results = await apiClient.requestJWTUserToken(
    process.env.DOCUSIGN_INTEGRATION_KEY,
    process.env.DOCUSIGN_USER_ID,
    SCOPES,
    privateKey,
    3600
  );

  const accessToken = results.body.access_token;
  apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);
  return apiClient;
};

// ─── Generate NDA document content ───────────────────────────────────────────
const generateNDAContent = (ideaTitle, viewerName, creatorName) => {
  return `
NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of ${new Date().toLocaleDateString()} 
between ${creatorName} ("Disclosing Party") and ${viewerName} ("Receiving Party").

SUBJECT MATTER: "${ideaTitle}"

1. CONFIDENTIALITY
The Receiving Party agrees to keep confidential all information disclosed by the 
Disclosing Party regarding the above-referenced idea and intellectual property.

2. NON-USE
The Receiving Party agrees not to use any confidential information for any purpose 
except to evaluate the potential business relationship between the parties.

3. RESTRICTIONS
The Receiving Party shall not disclose confidential information to any third party 
without prior written consent from the Disclosing Party.

4. TERM
This Agreement shall remain in effect for 2 years from the date of signing.

5. PLATFORM
This agreement is executed through Innovation Exchange platform and is legally binding.

6. GOVERNING LAW
This Agreement shall be governed by applicable intellectual property laws.

By signing below, both parties agree to the terms of this Agreement.

_______________________          _______________________
Disclosing Party                 Receiving Party
${creatorName}                   ${viewerName}
`.trim();
};

// ─── Send NDA envelope for signing ───────────────────────────────────────────
const sendNDAForSigning = async ({ ideaId, ideaTitle, creatorName, viewerName, viewerEmail }) => {
  try {
    const apiClient = await authenticate();
    const envelopesApi = new docusign.EnvelopesApi(apiClient);

    // Create document
    const ndaContent = generateNDAContent(ideaTitle, viewerName, creatorName);
    const documentBase64 = Buffer.from(ndaContent).toString('base64');

    const document = docusign.Document.constructFromObject({
      documentBase64,
      name:           'Non-Disclosure Agreement',
      fileExtension:  'txt',
      documentId:     '1',
    });

    // Create signer
    const signer = docusign.Signer.constructFromObject({
      email:         viewerEmail,
      name:          viewerName,
      recipientId:   '1',
      routingOrder:  '1',
      tabs: docusign.Tabs.constructFromObject({
        signHereTabs: [
          docusign.SignHere.constructFromObject({
            documentId:  '1',
            pageNumber:  '1',
            xPosition:   '200',
            yPosition:   '600',
          }),
        ],
        dateSignedTabs: [
          docusign.DateSigned.constructFromObject({
            documentId: '1',
            pageNumber:  '1',
            xPosition:   '200',
            yPosition:   '650',
          }),
        ],
      }),
    });

    // Build envelope
    const envelopeDefinition = docusign.EnvelopeDefinition.constructFromObject({
      emailSubject: `NDA Required — Innovation Exchange: "${ideaTitle}"`,
      documents:    [document],
      recipients:   docusign.Recipients.constructFromObject({ signers: [signer] }),
      status:       'sent',
    });

    const envelope = await envelopesApi.createEnvelope(
      process.env.DOCUSIGN_ACCOUNT_ID,
      { envelopeDefinition }
    );

    console.log(`[NDA] Envelope sent to ${viewerEmail} — ID: ${envelope.envelopeId}`);
    return {
      success:    true,
      envelopeId: envelope.envelopeId,
      status:     envelope.status,
    };

  } catch (err) {
    console.error('[NDA] DocuSign error:', err.message);
    // Return stub for development if DocuSign not fully configured
    if (process.env.NODE_ENV !== 'production') {
      const stubId = `stub_${Date.now()}`;
      console.warn(`[NDA] Using stub envelope ID: ${stubId}`);
      return { success: true, envelopeId: stubId, status: 'sent', stub: true };
    }
    throw err;
  }
};

// ─── Check envelope signing status ───────────────────────────────────────────
const checkEnvelopeStatus = async (envelopeId) => {
  if (envelopeId.startsWith('stub_')) {
    return { status: 'completed', signed: true, stub: true };
  }
  try {
    const apiClient = await authenticate();
    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const envelope = await envelopesApi.getEnvelope(
      process.env.DOCUSIGN_ACCOUNT_ID,
      envelopeId,
      {}
    );
    return {
      status: envelope.status,
      signed: envelope.status === 'completed',
    };
  } catch (err) {
    console.error('[NDA] Status check error:', err.message);
    throw err;
  }
};

module.exports = { sendNDAForSigning, checkEnvelopeStatus, generateNDAContent };
