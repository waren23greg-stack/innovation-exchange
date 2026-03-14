// src/services/certificateService.js
// Generates a legal PDF certificate of IP ownership

const PDFDocument = require('pdfkit');
const crypto      = require('crypto');

// ─── Generate ownership certificate PDF ───────────────────────────────────────
const generateOwnershipCertificate = (data) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 60, size: 'A4' });
      const buffers = [];

      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const {
        ideaTitle, ideaId, fingerprint,
        creatorName, ownerName, transferType,
        priceUsd, effectiveDate, platformVersion,
        transactionRef,
      } = data;

      // ── Header ──────────────────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 120).fill('#050810');

      doc.fillColor('#e8c97a')
         .font('Helvetica-Bold')
         .fontSize(22)
         .text('INNOVATION EXCHANGE', 60, 30, { align: 'center' });

      doc.fillColor('#63b3ed')
         .fontSize(11)
         .font('Helvetica')
         .text('The Global Stock Market for Ideas', 60, 58, { align: 'center' });

      doc.fillColor('#718096')
         .fontSize(9)
         .text('INTELLECTUAL PROPERTY OWNERSHIP CERTIFICATE', 60, 78, { align: 'center', characterSpacing: 1.5 });

      // ── Certificate border ───────────────────────────────────────────────────
      doc.rect(40, 130, doc.page.width - 80, doc.page.height - 180)
         .lineWidth(1)
         .strokeColor('#2d3748')
         .stroke();

      // ── Certificate title ────────────────────────────────────────────────────
      doc.fillColor('#e2e8f0')
         .font('Helvetica-Bold')
         .fontSize(16)
         .text('CERTIFICATE OF IP OWNERSHIP', 60, 155, { align: 'center' });

      doc.fillColor('#718096')
         .font('Helvetica')
         .fontSize(10)
         .text(`Certificate ID: ${transactionRef}`, 60, 178, { align: 'center' });

      // ── Divider ──────────────────────────────────────────────────────────────
      doc.moveTo(60, 200).lineTo(doc.page.width - 60, 200)
         .lineWidth(0.5).strokeColor('#2d3748').stroke();

      // ── Idea details ─────────────────────────────────────────────────────────
      let y = 220;

      doc.fillColor('#e8c97a')
         .font('Helvetica-Bold')
         .fontSize(10)
         .text('IDEA INFORMATION', 60, y, { characterSpacing: 1.2 });
      y += 20;

      const fields = [
        ['Title',           ideaTitle],
        ['Idea ID',         ideaId],
        ['SHA-256 Fingerprint', fingerprint],
        ['Algorithm',       'SHA-256 (collision-resistant)'],
        ['Transfer Type',   transferType?.toUpperCase()],
        ['Transaction Value', priceUsd ? `USD $${Number(priceUsd).toLocaleString()}` : 'Undisclosed'],
        ['Effective Date',  new Date(effectiveDate).toUTCString()],
        ['Platform',        `Innovation Exchange v${platformVersion || '1.0.0'}`],
      ];

      fields.forEach(([key, value]) => {
        doc.fillColor('#718096').font('Helvetica').fontSize(9).text(key + ':', 60, y);
        doc.fillColor('#e2e8f0').font('Helvetica').fontSize(9).text(String(value || '—'), 220, y, { width: 300 });
        y += 18;
      });

      y += 10;
      doc.moveTo(60, y).lineTo(doc.page.width - 60, y)
         .lineWidth(0.5).strokeColor('#2d3748').stroke();
      y += 20;

      // ── Parties ──────────────────────────────────────────────────────────────
      doc.fillColor('#e8c97a')
         .font('Helvetica-Bold')
         .fontSize(10)
         .text('PARTIES', 60, y, { characterSpacing: 1.2 });
      y += 20;

      doc.fillColor('#718096').font('Helvetica').fontSize(9).text('Original Creator:', 60, y);
      doc.fillColor('#e2e8f0').font('Helvetica-Bold').fontSize(9).text(creatorName, 220, y);
      y += 18;

      doc.fillColor('#718096').font('Helvetica').fontSize(9).text('New Owner:', 60, y);
      doc.fillColor('#e2e8f0').font('Helvetica-Bold').fontSize(9).text(ownerName, 220, y);
      y += 30;

      // ── Legal text ───────────────────────────────────────────────────────────
      doc.moveTo(60, y).lineTo(doc.page.width - 60, y)
         .lineWidth(0.5).strokeColor('#2d3748').stroke();
      y += 20;

      doc.fillColor('#e8c97a')
         .font('Helvetica-Bold')
         .fontSize(10)
         .text('LEGAL DECLARATION', 60, y, { characterSpacing: 1.2 });
      y += 16;

      doc.fillColor('#718096')
         .font('Helvetica')
         .fontSize(8.5)
         .text(
           `This certificate confirms that the intellectual property described above has been formally transferred ` +
           `on the Innovation Exchange platform. The SHA-256 fingerprint recorded herein constitutes cryptographic ` +
           `proof of the idea's content at the time of creation, anchored to the Idea Ownership Ledger (IOL). ` +
           `This document is legally recognized as evidence of IP transfer in jurisdictions that accept electronic ` +
           `records and RFC 3161 trusted timestamps. The platform attestation signature below confirms the ` +
           `authenticity of this certificate.`,
           60, y, { width: doc.page.width - 120, lineGap: 3 }
         );
      y += 90;

      // ── Platform attestation ─────────────────────────────────────────────────
      const attestation = crypto
        .createHash('sha256')
        .update(`${ideaId}:${fingerprint}:${transactionRef}:${effectiveDate}`)
        .digest('hex');

      doc.fillColor('#718096').font('Helvetica').fontSize(8)
         .text('Platform Attestation Hash (SHA-256):', 60, y);
      y += 14;
      doc.fillColor('#63b3ed').font('Helvetica').fontSize(7.5)
         .text(attestation, 60, y, { width: doc.page.width - 120 });
      y += 30;

      // ── Signature lines ──────────────────────────────────────────────────────
      doc.moveTo(60, y).lineTo(220, y).lineWidth(0.5).strokeColor('#4a5568').stroke();
      doc.moveTo(doc.page.width - 220, y).lineTo(doc.page.width - 60, y).lineWidth(0.5).strokeColor('#4a5568').stroke();
      y += 8;
      doc.fillColor('#718096').font('Helvetica').fontSize(8)
         .text('Original Creator', 60, y)
         .text('New Owner / Authorized Signatory', doc.page.width - 220, y);

      // ── Footer ───────────────────────────────────────────────────────────────
      doc.rect(0, doc.page.height - 50, doc.page.width, 50).fill('#050810');
      doc.fillColor('#4a5568').font('Helvetica').fontSize(7.5)
         .text(
           `Generated by Innovation Exchange • ${new Date().toUTCString()} • innovation-exchange.vercel.app`,
           60, doc.page.height - 32, { align: 'center' }
         );

      doc.end();
    } catch(err) {
      reject(err);
    }
  });
};

module.exports = { generateOwnershipCertificate };
