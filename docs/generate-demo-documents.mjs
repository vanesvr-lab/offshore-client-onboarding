// docs/generate-demo-documents.mjs
//
// Generates the 7 demo KYC documents (Tony Stark + Stark Industries
// Holdings Ltd) for use in pitch demo recordings. Each document is
// rendered HTML → PDF via Playwright Chromium with realistic-but-fake
// field data so AI extraction returns proper values during the demo.
//
// Output:
//   docs/demo-documents/tony-stark/01-passport-certified-copy.pdf
//   docs/demo-documents/tony-stark/02-proof-of-address-utility-bill.pdf
//   docs/demo-documents/tony-stark/03-bank-statement.pdf
//   docs/demo-documents/tony-stark/04-source-of-funds-declaration.pdf
//   docs/demo-documents/tony-stark/05-pep-sanctions-declaration.pdf
//   docs/demo-documents/tony-stark/06-reference-letter.pdf
//   docs/demo-documents/stark-industries/01-certificate-of-incorporation.pdf
//
// Run from the project root:
//   node docs/generate-demo-documents.mjs

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

// ─── Shared subject data ─────────────────────────────────────────────────

const TONY = {
  full_name: "Anthony Edward Stark",
  short_name: "Anthony E. Stark",
  surname: "STARK",
  given_names: "ANTHONY EDWARD",
  dob_iso: "1970-05-29",
  dob_display: "29 MAY 1970",
  dob_short: "29/05/1970",
  nationality: "UNITED STATES OF AMERICA",
  sex: "M",
  place_of_birth: "LONG ISLAND, NEW YORK, U.S.A.",
  passport_number: "599384279",
  passport_issue: "14 MAY 2022",
  passport_expiry: "13 MAY 2032",
  passport_authority: "U.S. DEPARTMENT OF STATE",
  address_line1: "10880 Malibu Point",
  address_city: "Malibu",
  address_state: "California",
  address_zip: "90265",
  address_country: "United States of America",
  full_address: "10880 Malibu Point, Malibu, CA 90265, United States of America",
};

const STARK = {
  legal_name: "STARK INDUSTRIES HOLDINGS LTD",
  display_name: "Stark Industries Holdings Ltd",
  registration_number: "C123456",
  jurisdiction: "Mauritius",
  entity_type: "Global Business Company",
  incorporation_date: "15 January 2024",
  registered_office: "365 Royal Road, Rose Hill, 71368, Republic of Mauritius",
  authorized_capital: "USD 100,000",
  share_structure: "10,000 ordinary shares of USD 10 each",
};

// ─── HTML templates ──────────────────────────────────────────────────────

const baseStyles = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: #1a202c;
    margin: 0;
  }
  h1, h2, h3, h4 { color: #0f172a; margin: 0; }
  h1 { font-size: 18pt; }
  h2 { font-size: 14pt; }
  h3 { font-size: 12pt; }
  table { border-collapse: collapse; width: 100%; }
  td, th { padding: 4pt 6pt; vertical-align: top; }
  .small { font-size: 9pt; }
  .muted { color: #64748b; }
  .center { text-align: center; }
  .right { text-align: right; }
  .uppercase { text-transform: uppercase; letter-spacing: 0.04em; }
  .border-top { border-top: 1pt solid #cbd5e1; }
  .border-bottom { border-bottom: 1pt solid #cbd5e1; }
  .mt-2 { margin-top: 8pt; }
  .mt-4 { margin-top: 16pt; }
  .mt-6 { margin-top: 24pt; }
  .mt-8 { margin-top: 32pt; }
  .mb-2 { margin-bottom: 8pt; }
  .mb-4 { margin-bottom: 16pt; }
  .mb-6 { margin-bottom: 24pt; }
  .pad { padding: 16pt; }
  .row { display: flex; gap: 16pt; }
  .col { flex: 1; }
  .stamp {
    display: inline-block;
    border: 2pt solid #b91c1c;
    color: #b91c1c;
    padding: 6pt 14pt;
    transform: rotate(-4deg);
    font-weight: bold;
    font-size: 11pt;
    letter-spacing: 0.05em;
  }
  .sig-line {
    border-bottom: 1pt solid #1a202c;
    height: 22pt;
    margin-top: 8pt;
  }
`;

// ─── 1. Certified Passport Copy ──────────────────────────────────────────

function passportHTML() {
  return /* html */ `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${baseStyles}
  .passport-page {
    border: 2pt solid #1e3a8a;
    padding: 18pt;
    background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
  }
  .passport-header {
    text-align: center;
    border-bottom: 2pt solid #1e3a8a;
    padding-bottom: 8pt;
    margin-bottom: 14pt;
  }
  .passport-header .country { font-size: 14pt; font-weight: bold; letter-spacing: 0.1em; }
  .passport-header .title { font-size: 22pt; font-weight: bold; letter-spacing: 0.15em; color: #1e3a8a; margin-top: 2pt; }
  .passport-body { display: flex; gap: 14pt; }
  .photo {
    width: 95pt; height: 120pt;
    background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
    border: 1pt solid #475569;
    display: flex; align-items: center; justify-content: center;
    color: #475569; font-size: 8pt; text-align: center;
  }
  .fields { flex: 1; font-size: 9.5pt; }
  .fields .field { margin-bottom: 5pt; }
  .fields .label { color: #475569; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.04em; }
  .fields .value { font-weight: 600; font-size: 10pt; }
  .mrz {
    margin-top: 16pt;
    padding: 8pt;
    background: #f1f5f9;
    border: 1pt solid #cbd5e1;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 8.5pt;
    line-height: 1.7;
    letter-spacing: 0.06em;
  }
  .certification {
    margin-top: 28pt;
    border: 1pt dashed #64748b;
    padding: 14pt;
    background: #fffbeb;
  }
  .cert-title { font-weight: bold; font-size: 11pt; letter-spacing: 0.05em; color: #92400e; margin-bottom: 8pt; }
  .cert-body { font-size: 9.5pt; line-height: 1.6; }
  .sig-block { display: flex; gap: 18pt; margin-top: 14pt; }
  .sig-block .col { flex: 1; }
</style></head><body>
  <div class="passport-page">
    <div class="passport-header">
      <div class="country">UNITED STATES OF AMERICA</div>
      <div class="title">PASSPORT</div>
    </div>
    <div class="passport-body">
      <div class="photo">[PHOTO]</div>
      <div class="fields">
        <div class="field"><div class="label">Type / Type / Tipo</div><div class="value">P</div></div>
        <div class="field"><div class="label">Code of issuing State</div><div class="value">USA</div></div>
        <div class="field"><div class="label">Passport No. / No. du Passeport</div><div class="value">${TONY.passport_number}</div></div>
        <div class="field"><div class="label">Surname / Nom</div><div class="value">${TONY.surname}</div></div>
        <div class="field"><div class="label">Given names / Prénoms</div><div class="value">${TONY.given_names}</div></div>
        <div class="field"><div class="label">Nationality / Nationalité</div><div class="value">${TONY.nationality}</div></div>
        <div class="field"><div class="label">Date of birth / Date de naissance</div><div class="value">${TONY.dob_display}</div></div>
        <div class="field"><div class="label">Sex / Sexe</div><div class="value">${TONY.sex}</div></div>
        <div class="field"><div class="label">Place of birth / Lieu de naissance</div><div class="value">${TONY.place_of_birth}</div></div>
        <div class="field"><div class="label">Date of issue / Date de délivrance</div><div class="value">${TONY.passport_issue}</div></div>
        <div class="field"><div class="label">Date of expiry / Date d'expiration</div><div class="value">${TONY.passport_expiry}</div></div>
        <div class="field"><div class="label">Authority / Autorité</div><div class="value">${TONY.passport_authority}</div></div>
      </div>
    </div>
    <div class="mrz">
      P&lt;USASTARK&lt;&lt;ANTHONY&lt;EDWARD&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;<br>
      ${TONY.passport_number}1USA7005298M3205135&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;06
    </div>
    <div class="certification">
      <div class="cert-title">★ CERTIFIED TRUE COPY ★</div>
      <div class="cert-body">
        I, the undersigned, hereby certify that this is a true and complete copy of the original passport produced to me on this day, and that the photograph appearing thereon is a true likeness of the holder.
      </div>
      <div class="sig-block">
        <div class="col">
          <div class="label small muted uppercase">Certifying officer</div>
          <div style="font-weight: 600; margin-top: 2pt;">Patricia Reyes, Notary Public</div>
          <div class="small muted">Reg. No. NP-2024-04471 · State of California</div>
          <div class="sig-line"></div>
          <div class="small muted">Signature</div>
        </div>
        <div class="col">
          <div class="label small muted uppercase">Date of certification</div>
          <div style="font-weight: 600; margin-top: 2pt;">02 April 2026</div>
          <div style="margin-top: 28pt; text-align: center;"><span class="stamp">NOTARY SEAL</span></div>
        </div>
      </div>
    </div>
  </div>
</body></html>`;
}

// ─── 2. Proof of Address — Utility Bill ──────────────────────────────────

function utilityBillHTML() {
  return /* html */ `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${baseStyles}
  .header { background: #0e7490; color: white; padding: 14pt 16pt; }
  .header .logo { font-weight: bold; font-size: 16pt; letter-spacing: 0.04em; }
  .header .tagline { font-size: 9pt; opacity: 0.9; margin-top: 2pt; }
  .meta { display: flex; gap: 16pt; padding: 14pt 16pt; background: #ecfeff; border-bottom: 2pt solid #0e7490; }
  .meta .col { flex: 1; font-size: 9.5pt; }
  .meta .label { color: #155e75; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 1pt; }
  .meta .value { font-weight: 600; font-size: 10pt; }
  .body { padding: 16pt; }
  .invoice-title { font-size: 13pt; font-weight: bold; color: #0e7490; margin-bottom: 10pt; }
  table.billing { font-size: 9.5pt; margin-top: 6pt; }
  table.billing th { background: #f1f5f9; text-align: left; border-bottom: 1pt solid #cbd5e1; font-size: 9pt; }
  table.billing td { border-bottom: 1pt solid #f1f5f9; }
  .totals { margin-top: 14pt; padding: 12pt; background: #f0f9ff; border: 1pt solid #bae6fd; border-radius: 4pt; }
  .totals .row { display: flex; justify-content: space-between; padding: 2pt 0; }
  .totals .row.due { font-weight: bold; font-size: 12pt; color: #0c4a6e; border-top: 1pt solid #bae6fd; padding-top: 6pt; margin-top: 4pt; }
  .footer { padding: 12pt 16pt; background: #f8fafc; border-top: 1pt solid #cbd5e1; font-size: 8pt; color: #64748b; }
</style></head><body>
  <div class="header">
    <div class="logo">⚡ PACIFIC EDISON POWER CO.</div>
    <div class="tagline">Reliable energy. Since 1962.</div>
  </div>
  <div class="meta">
    <div class="col">
      <div class="label">Customer</div>
      <div class="value">${TONY.short_name}</div>
      <div style="margin-top: 4pt;">${TONY.address_line1}</div>
      <div>${TONY.address_city}, ${TONY.address_state} ${TONY.address_zip}</div>
      <div>${TONY.address_country}</div>
    </div>
    <div class="col">
      <div class="label">Account number</div>
      <div class="value">4471-22938-01</div>
      <div class="label" style="margin-top: 8pt;">Invoice number</div>
      <div class="value">PEP-2026-03-04471</div>
      <div class="label" style="margin-top: 8pt;">Service address</div>
      <div>${TONY.address_line1}</div>
      <div>${TONY.address_city}, ${TONY.address_state} ${TONY.address_zip}</div>
    </div>
    <div class="col">
      <div class="label">Invoice date</div>
      <div class="value">01 April 2026</div>
      <div class="label" style="margin-top: 8pt;">Service period</div>
      <div class="value">01 Mar 2026 – 31 Mar 2026</div>
      <div class="label" style="margin-top: 8pt;">Due date</div>
      <div class="value" style="color: #b91c1c;">28 April 2026</div>
    </div>
  </div>
  <div class="body">
    <div class="invoice-title">Electricity statement</div>
    <table class="billing">
      <thead>
        <tr>
          <th>Description</th>
          <th class="right">Usage</th>
          <th class="right">Rate</th>
          <th class="right">Amount (USD)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Tier 1 — Baseline usage</td>
          <td class="right">650 kWh</td>
          <td class="right">$0.21 / kWh</td>
          <td class="right">$136.50</td>
        </tr>
        <tr>
          <td>Tier 2 — Above baseline</td>
          <td class="right">920 kWh</td>
          <td class="right">$0.18 / kWh</td>
          <td class="right">$165.60</td>
        </tr>
        <tr>
          <td>Tier 3 — High consumption</td>
          <td class="right">180 kWh</td>
          <td class="right">$0.12 / kWh</td>
          <td class="right">$21.60</td>
        </tr>
        <tr>
          <td>State energy surcharge (2.1%)</td>
          <td class="right">—</td>
          <td class="right">—</td>
          <td class="right">$6.79</td>
        </tr>
        <tr>
          <td>Service connection fee</td>
          <td class="right">—</td>
          <td class="right">—</td>
          <td class="right">$11.69</td>
        </tr>
      </tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>$330.49</span></div>
      <div class="row"><span>Tax (CA state, 3.5%)</span><span>$11.69</span></div>
      <div class="row due"><span>Total due</span><span>$342.18</span></div>
    </div>
  </div>
  <div class="footer">
    Pacific Edison Power Co. · 4400 Wilshire Blvd, Los Angeles, CA 90010 · Customer Care: 1-800-555-EDISON<br>
    This is an electronic statement; no signature required. Please retain for your records.
  </div>
</body></html>`;
}

// ─── 3. Bank Statement ───────────────────────────────────────────────────

function bankStatementHTML() {
  return /* html */ `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${baseStyles}
  .header { background: linear-gradient(90deg, #1e293b 0%, #334155 100%); color: white; padding: 18pt 18pt; }
  .header .row { display: flex; justify-content: space-between; align-items: center; }
  .header .logo { font-weight: bold; font-size: 18pt; letter-spacing: 0.05em; }
  .header .tagline { font-size: 8.5pt; opacity: 0.85; }
  .meta-bar { padding: 12pt 18pt; background: #f1f5f9; border-bottom: 1pt solid #cbd5e1; display: flex; gap: 20pt; }
  .meta-bar .col { font-size: 9.5pt; }
  .meta-bar .label { color: #475569; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 1pt; }
  .meta-bar .value { font-weight: 600; }
  .body { padding: 14pt 18pt; }
  .section-title { font-weight: bold; font-size: 11pt; color: #1e293b; margin-bottom: 6pt; }
  .balance-row { display: flex; gap: 12pt; margin-bottom: 14pt; }
  .balance-card { flex: 1; border: 1pt solid #cbd5e1; padding: 10pt; border-radius: 4pt; background: #f8fafc; }
  .balance-card .label { font-size: 7.5pt; text-transform: uppercase; color: #475569; letter-spacing: 0.04em; }
  .balance-card .amount { font-weight: bold; font-size: 14pt; color: #0f172a; margin-top: 2pt; }
  table.txns { font-size: 9pt; width: 100%; }
  table.txns th { background: #1e293b; color: white; text-align: left; padding: 4pt 6pt; font-size: 8.5pt; }
  table.txns td { padding: 4pt 6pt; border-bottom: 1pt solid #f1f5f9; }
  table.txns .credit { color: #15803d; }
  table.txns .debit { color: #b91c1c; }
  .footer { padding: 12pt 18pt; background: #f8fafc; border-top: 1pt solid #cbd5e1; font-size: 8pt; color: #64748b; }
</style></head><body>
  <div class="header">
    <div class="row">
      <div>
        <div class="logo">FIRST COASTAL BANK</div>
        <div class="tagline">Banking the West Coast since 1927</div>
      </div>
      <div class="right small" style="opacity: 0.85;">
        Statement period<br>
        <span style="font-weight: bold;">01 Mar 2026 – 31 Mar 2026</span>
      </div>
    </div>
  </div>
  <div class="meta-bar">
    <div class="col" style="flex: 1.5;">
      <div class="label">Account holder</div>
      <div class="value">${TONY.full_name}</div>
      <div>${TONY.address_line1}</div>
      <div>${TONY.address_city}, ${TONY.address_state} ${TONY.address_zip}, ${TONY.address_country}</div>
    </div>
    <div class="col">
      <div class="label">Account number</div>
      <div class="value">XXXX-XXXX-2847</div>
      <div class="label" style="margin-top: 6pt;">Account type</div>
      <div class="value">Premium Checking</div>
    </div>
    <div class="col">
      <div class="label">SWIFT / BIC</div>
      <div class="value">FCBKUS66</div>
      <div class="label" style="margin-top: 6pt;">Statement date</div>
      <div class="value">01 April 2026</div>
    </div>
  </div>
  <div class="body">
    <div class="balance-row">
      <div class="balance-card">
        <div class="label">Opening balance</div>
        <div class="amount">$1,247,892.43</div>
      </div>
      <div class="balance-card">
        <div class="label">Total credits</div>
        <div class="amount" style="color: #15803d;">+$203,500.00</div>
      </div>
      <div class="balance-card">
        <div class="label">Total debits</div>
        <div class="amount" style="color: #b91c1c;">−$100,342.18</div>
      </div>
      <div class="balance-card">
        <div class="label">Closing balance</div>
        <div class="amount">$1,351,050.25</div>
      </div>
    </div>
    <div class="section-title">Transaction history</div>
    <table class="txns">
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Reference</th>
          <th class="right">Amount (USD)</th>
          <th class="right">Balance</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>01/03/2026</td><td>Opening balance brought forward</td><td>—</td><td class="right">—</td><td class="right">$1,247,892.43</td></tr>
        <tr><td>03/03/2026</td><td>ACH credit · Stark Industries Inc. — Payroll</td><td>SI-PAY-2026030</td><td class="right credit">+$28,500.00</td><td class="right">$1,276,392.43</td></tr>
        <tr><td>05/03/2026</td><td>Wire received · Stark Patents Inc. — Royalty</td><td>WIRE-04419</td><td class="right credit">+$50,000.00</td><td class="right">$1,326,392.43</td></tr>
        <tr><td>12/03/2026</td><td>Internal transfer · To Investment Account ****1102</td><td>INT-22847</td><td class="right debit">−$100,000.00</td><td class="right">$1,226,392.43</td></tr>
        <tr><td>22/03/2026</td><td>Direct debit · Pacific Edison Power Co.</td><td>UB-44712293</td><td class="right debit">−$342.18</td><td class="right">$1,226,050.25</td></tr>
        <tr><td>28/03/2026</td><td>ACH credit · Stark Industries Inc. — Annual bonus</td><td>SI-BNS-2026Q1</td><td class="right credit">+$125,000.00</td><td class="right">$1,351,050.25</td></tr>
        <tr><td>31/03/2026</td><td>Closing balance</td><td>—</td><td class="right">—</td><td class="right" style="font-weight: bold;">$1,351,050.25</td></tr>
      </tbody>
    </table>
  </div>
  <div class="footer">
    First Coastal Bank, N.A. · 880 California Street, San Francisco, CA 94108 · Member FDIC · Customer service 1-800-555-FCBK<br>
    Statements are generated electronically. For inquiries, please contact your relationship manager.
  </div>
</body></html>`;
}

// ─── 4. Source of Funds Declaration ──────────────────────────────────────

function sourceOfFundsHTML() {
  return /* html */ `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${baseStyles}
  .doc-title { text-align: center; font-size: 16pt; font-weight: bold; color: #0f172a; margin-bottom: 4pt; letter-spacing: 0.04em; }
  .doc-subtitle { text-align: center; font-size: 10pt; color: #475569; margin-bottom: 20pt; }
  .section-h { font-weight: bold; font-size: 11pt; color: #1e293b; margin-top: 14pt; margin-bottom: 4pt; border-bottom: 1pt solid #cbd5e1; padding-bottom: 2pt; }
  p { margin: 6pt 0; text-align: justify; }
  table.sources { font-size: 10pt; margin-top: 6pt; }
  table.sources th { background: #f1f5f9; text-align: left; padding: 4pt 8pt; font-size: 9pt; border-bottom: 1pt solid #cbd5e1; }
  table.sources td { padding: 6pt 8pt; border-bottom: 1pt solid #f1f5f9; }
  .sig-section { margin-top: 32pt; display: flex; gap: 24pt; }
  .sig-section .col { flex: 1; }
  .label { color: #475569; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; }
</style></head><body>
  <div class="doc-title">SOURCE OF FUNDS DECLARATION</div>
  <div class="doc-subtitle">For Anti-Money Laundering (AML) and Know Your Customer (KYC) purposes</div>

  <div class="section-h">Declarant details</div>
  <table>
    <tr><td style="width: 38%;" class="label">Full legal name</td><td><strong>${TONY.full_name}</strong></td></tr>
    <tr><td class="label">Date of birth</td><td>${TONY.dob_short}</td></tr>
    <tr><td class="label">Nationality</td><td>United States of America</td></tr>
    <tr><td class="label">Passport number</td><td>${TONY.passport_number}</td></tr>
    <tr><td class="label">Residential address</td><td>${TONY.full_address}</td></tr>
  </table>

  <div class="section-h">Declaration</div>
  <p>I, the undersigned, <strong>${TONY.full_name}</strong>, hereby declare that the funds being used or to be used in connection with my engagement with the receiving institution and any related transactions originate from legitimate sources, and are not the proceeds of, nor are intended to facilitate, any criminal activity.</p>
  <p>I confirm that the following are the principal sources of my income and wealth:</p>

  <table class="sources">
    <thead>
      <tr>
        <th style="width: 32%;">Source</th>
        <th>Description</th>
        <th class="right" style="width: 22%;">Estimated annual amount (USD)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Employment income</td>
        <td>Salary, bonus, and equity compensation as Chief Executive Officer of <strong>Stark Industries Inc.</strong>, a US-incorporated technology and defence systems company.</td>
        <td class="right">~ $15,000,000</td>
      </tr>
      <tr>
        <td>Royalty income</td>
        <td>Licensing royalties from patents held under <strong>Stark Patents Inc.</strong>, primarily in advanced energy systems and propulsion technologies.</td>
        <td class="right">~ $5,000,000</td>
      </tr>
      <tr>
        <td>Investment income</td>
        <td>Dividends and capital gains from publicly-listed equities and private investments held in diversified portfolio.</td>
        <td class="right">~ $8,000,000</td>
      </tr>
    </tbody>
    <tfoot>
      <tr style="background: #f1f5f9; font-weight: bold;">
        <td colspan="2" style="padding: 8pt;">Estimated total annual source of funds</td>
        <td class="right" style="padding: 8pt;">~ $28,000,000</td>
      </tr>
    </tfoot>
  </table>

  <div class="section-h">Source of wealth</div>
  <p>My accumulated wealth derives principally from over three decades of employment compensation and equity stakes in Stark Industries Inc., a publicly-traded entity of which I am the founder and majority shareholder, together with returns on a diversified portfolio of long-term investments managed by Continental Trust &amp; Banking.</p>

  <div class="section-h">Undertakings</div>
  <p>I undertake to notify the receiving institution promptly of any material change in the sources of funds or wealth declared above. I confirm that the information provided is true, complete, and accurate to the best of my knowledge.</p>

  <div class="sig-section">
    <div class="col">
      <div class="label">Signed</div>
      <div class="sig-line"></div>
      <div style="font-weight: 600; margin-top: 4pt;">${TONY.full_name}</div>
    </div>
    <div class="col">
      <div class="label">Date</div>
      <div class="sig-line"></div>
      <div style="font-weight: 600; margin-top: 4pt;">12 April 2026</div>
    </div>
  </div>
</body></html>`;
}

// ─── 5. PEP / Sanctions Declaration ──────────────────────────────────────

function pepDeclarationHTML() {
  return /* html */ `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${baseStyles}
  .doc-title { text-align: center; font-size: 15pt; font-weight: bold; color: #0f172a; margin-bottom: 4pt; letter-spacing: 0.03em; }
  .doc-subtitle { text-align: center; font-size: 10pt; color: #475569; margin-bottom: 20pt; }
  .section-h { font-weight: bold; font-size: 11pt; color: #1e293b; margin-top: 14pt; margin-bottom: 4pt; border-bottom: 1pt solid #cbd5e1; padding-bottom: 2pt; }
  p { margin: 6pt 0; text-align: justify; }
  .confirm-block { padding: 10pt 14pt; background: #f8fafc; border-left: 3pt solid #1e3a8a; margin: 10pt 0; }
  .confirm-block .item { margin: 5pt 0; padding-left: 18pt; position: relative; }
  .confirm-block .item::before {
    content: "☐";
    position: absolute;
    left: 0;
    top: 0;
    font-weight: bold;
  }
  .confirm-block .item.checked::before {
    content: "☒";
    color: #15803d;
  }
  .sig-section { margin-top: 28pt; display: flex; gap: 24pt; }
  .sig-section .col { flex: 1; }
  .label { color: #475569; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; }
</style></head><body>
  <div class="doc-title">POLITICALLY EXPOSED PERSON &amp; SANCTIONS DECLARATION</div>
  <div class="doc-subtitle">Self-declaration for AML/KYC compliance</div>

  <div class="section-h">Declarant details</div>
  <table>
    <tr><td style="width: 38%;" class="label">Full legal name</td><td><strong>${TONY.full_name}</strong></td></tr>
    <tr><td class="label">Date of birth</td><td>${TONY.dob_short}</td></tr>
    <tr><td class="label">Nationality</td><td>United States of America</td></tr>
    <tr><td class="label">Passport number</td><td>${TONY.passport_number}</td></tr>
    <tr><td class="label">Residential address</td><td>${TONY.full_address}</td></tr>
  </table>

  <div class="section-h">Politically Exposed Person (PEP) status</div>
  <p>For the purposes of this declaration, a "Politically Exposed Person" includes individuals who are or have been entrusted with prominent public functions, their immediate family members, and known close associates.</p>
  <div class="confirm-block">
    <div class="item checked">I am <strong>NOT</strong> currently and have <strong>NOT</strong> within the past 12 months held any prominent public function (head of state, head of government, senior politician, senior government official, judicial or military official, senior executive of a state-owned enterprise, or important political party official).</div>
    <div class="item checked">No member of my immediate family (spouse, partner, parents, children, or in-laws) currently holds or has within the past 12 months held a position described above.</div>
    <div class="item checked">I have no known close associates (business partners, joint beneficial owners) who hold or have held such positions.</div>
  </div>

  <div class="section-h">Sanctions screening</div>
  <p>I confirm to the best of my knowledge that:</p>
  <div class="confirm-block">
    <div class="item checked">I am <strong>NOT</strong> listed on any sanctions list maintained by the United Nations, European Union, United Kingdom, United States Office of Foreign Assets Control (OFAC), or any other competent authority.</div>
    <div class="item checked">I am <strong>NOT</strong> a national of, ordinarily resident in, or operating from any sanctioned jurisdiction.</div>
    <div class="item checked">My business activities and the funds being used in this engagement are <strong>NOT</strong> in violation of any applicable sanctions program.</div>
  </div>

  <div class="section-h">Undertakings</div>
  <p>I undertake to notify the receiving institution in writing within thirty (30) days should any of the above representations cease to be accurate, including any change to my PEP status, any addition to a sanctions list, or any change to the nationality, residency, or operating jurisdictions of myself or my associates.</p>
  <p>I confirm that the information provided in this declaration is true, complete, and accurate to the best of my knowledge.</p>

  <div class="sig-section">
    <div class="col">
      <div class="label">Signed</div>
      <div class="sig-line"></div>
      <div style="font-weight: 600; margin-top: 4pt;">${TONY.full_name}</div>
    </div>
    <div class="col">
      <div class="label">Date</div>
      <div class="sig-line"></div>
      <div style="font-weight: 600; margin-top: 4pt;">12 April 2026</div>
    </div>
  </div>
</body></html>`;
}

// ─── 6. Reference Letter (from a bank) ──────────────────────────────────

function referenceLetterHTML() {
  return /* html */ `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${baseStyles}
  .letterhead { text-align: center; padding: 14pt 0 18pt 0; border-bottom: 2pt solid #1e293b; margin-bottom: 18pt; }
  .letterhead .name { font-size: 18pt; font-weight: bold; letter-spacing: 0.06em; color: #1e293b; }
  .letterhead .tagline { font-size: 9pt; color: #475569; margin-top: 2pt; letter-spacing: 0.04em; }
  .letterhead .address { font-size: 8.5pt; color: #64748b; margin-top: 6pt; }
  .meta { display: flex; justify-content: space-between; font-size: 9.5pt; margin-bottom: 16pt; }
  .meta .col { flex: 1; }
  .salutation { font-size: 10pt; font-weight: bold; margin-bottom: 8pt; }
  .subject { text-align: center; font-size: 11pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; padding: 6pt; border-top: 1pt solid #cbd5e1; border-bottom: 1pt solid #cbd5e1; margin: 12pt 0 14pt 0; }
  p { margin: 8pt 0; text-align: justify; line-height: 1.65; }
  .sig-block { margin-top: 36pt; }
  .sig-block .name-line { font-weight: 600; }
  .sig-block .title-line { font-size: 9pt; color: #475569; }
  .stamp-mark { display: inline-block; margin-top: 12pt; padding: 5pt 10pt; border: 1.5pt solid #1e3a8a; color: #1e3a8a; font-size: 9pt; font-weight: bold; letter-spacing: 0.06em; border-radius: 3pt; }
</style></head><body>
  <div class="letterhead">
    <div class="name">CONTINENTAL TRUST &amp; BANKING</div>
    <div class="tagline">Private Banking · Wealth Management · Trust Services</div>
    <div class="address">200 Park Avenue, 28th Floor, New York, NY 10166 · +1 212 555 0188 · privateoffice@continental-tb.com</div>
  </div>

  <div class="meta">
    <div class="col">
      <strong>Reference No.</strong> CTB-REF-2026-1847<br>
      <strong>Date</strong> 15 April 2026
    </div>
    <div class="col right">
      <strong>Strictly private &amp; confidential</strong>
    </div>
  </div>

  <div class="salutation">To Whom It May Concern,</div>

  <div class="subject">Banker's reference — Mr. ${TONY.full_name}</div>

  <p>We confirm that <strong>${TONY.full_name}</strong>, residing at ${TONY.full_address}, has been a private banking client of Continental Trust &amp; Banking since <strong>March 2008</strong>, a period of over 18 years.</p>

  <p>Throughout the duration of our relationship, Mr. Stark has maintained accounts with our institution in good standing. The accounts have been operated within the agreed parameters and within applicable regulatory requirements. We have no adverse information to report concerning Mr. Stark's conduct of his banking affairs.</p>

  <p>Based on our internal Know-Your-Customer and Anti-Money-Laundering processes, Mr. Stark's source of funds and source of wealth have been established and documented to our satisfaction. His banking activity is consistent with the disclosed sources of income, principally derived from his executive compensation at Stark Industries Inc. and from licensing and investment income.</p>

  <p>Mr. Stark has been a valued client and we have no reservations in providing this reference. This letter is issued at the client's request for the purposes of supporting his onboarding with a third-party regulated entity, and is provided without any liability or further engagement on the part of Continental Trust &amp; Banking.</p>

  <p>Should you require any further information, please do not hesitate to contact the undersigned through the private office line above.</p>

  <div class="sig-block">
    <p>Yours faithfully,</p>
    <div class="sig-line" style="width: 200pt;"></div>
    <div class="name-line">Margaret O'Connell, CFA</div>
    <div class="title-line">Senior Vice President — Private Banking</div>
    <div class="title-line">Continental Trust &amp; Banking</div>
    <div class="stamp-mark">OFFICIAL BANK STAMP</div>
  </div>
</body></html>`;
}

// ─── 7. Certificate of Incorporation (Stark Industries Holdings Ltd) ─────

function certificateOfIncorporationHTML() {
  return /* html */ `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${baseStyles}
  body { padding: 22pt 14pt; }
  .crest {
    text-align: center;
    margin-bottom: 8pt;
    font-size: 11pt;
    color: #1e3a8a;
    font-weight: bold;
    letter-spacing: 0.08em;
  }
  .registrar {
    text-align: center;
    font-size: 9.5pt;
    color: #475569;
    margin-bottom: 4pt;
  }
  .cert-frame {
    border: 4pt double #1e3a8a;
    padding: 32pt 36pt;
    background: #fefce8;
    background: linear-gradient(180deg, #fefce8 0%, #fef9c3 100%);
  }
  .cert-title {
    text-align: center;
    font-size: 22pt;
    font-weight: bold;
    color: #1e3a8a;
    letter-spacing: 0.08em;
    margin-bottom: 4pt;
  }
  .cert-subtitle {
    text-align: center;
    font-size: 11pt;
    font-style: italic;
    color: #475569;
    margin-bottom: 24pt;
  }
  .cert-body { font-size: 11pt; line-height: 1.8; text-align: center; }
  .cert-body strong { color: #0f172a; }
  .entity-name {
    display: block;
    margin: 14pt 0;
    font-size: 18pt;
    font-weight: bold;
    color: #1e3a8a;
    letter-spacing: 0.04em;
  }
  .details {
    margin-top: 24pt;
    padding-top: 16pt;
    border-top: 1pt solid #cbd5e1;
  }
  .details table { width: 100%; font-size: 10pt; }
  .details td { padding: 5pt 0; }
  .details .label { color: #475569; text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.04em; width: 50%; }
  .details .value { font-weight: 600; text-align: right; }
  .sig-row { display: flex; justify-content: space-between; margin-top: 36pt; gap: 24pt; }
  .sig-block { flex: 1; text-align: center; }
  .sig-block .line { border-bottom: 1pt solid #1a202c; margin-bottom: 4pt; height: 28pt; }
  .sig-block .name { font-weight: 600; font-size: 10pt; }
  .sig-block .title { font-size: 8.5pt; color: #64748b; }
  .embossed {
    display: inline-block;
    width: 70pt; height: 70pt;
    border: 3pt double #1e3a8a;
    border-radius: 50%;
    color: #1e3a8a;
    font-size: 7pt;
    font-weight: bold;
    line-height: 1.1;
    padding-top: 18pt;
    text-align: center;
  }
</style></head><body>
  <div class="crest">★ REPUBLIC OF MAURITIUS ★</div>
  <div class="registrar">Office of the Registrar of Companies — Companies and Business Registration Department</div>

  <div class="cert-frame">
    <div class="cert-title">CERTIFICATE OF INCORPORATION</div>
    <div class="cert-subtitle">Companies Act 2001 · Issued under the authority of the Registrar of Companies</div>

    <div class="cert-body">
      This is to certify that
      <span class="entity-name">${STARK.legal_name}</span>
      bearing registration number <strong>${STARK.registration_number}</strong>, was duly incorporated under the laws of the <strong>${STARK.jurisdiction}</strong> as a <strong>${STARK.entity_type}</strong> on this <strong>${STARK.incorporation_date}</strong>.
    </div>

    <div class="details">
      <table>
        <tr>
          <td class="label">Company name</td>
          <td class="value">${STARK.display_name}</td>
        </tr>
        <tr>
          <td class="label">Registration number</td>
          <td class="value">${STARK.registration_number}</td>
        </tr>
        <tr>
          <td class="label">Entity type</td>
          <td class="value">${STARK.entity_type}</td>
        </tr>
        <tr>
          <td class="label">Date of incorporation</td>
          <td class="value">${STARK.incorporation_date}</td>
        </tr>
        <tr>
          <td class="label">Jurisdiction</td>
          <td class="value">${STARK.jurisdiction}</td>
        </tr>
        <tr>
          <td class="label">Registered office</td>
          <td class="value">${STARK.registered_office}</td>
        </tr>
        <tr>
          <td class="label">Authorised capital</td>
          <td class="value">${STARK.authorized_capital}</td>
        </tr>
        <tr>
          <td class="label">Share structure</td>
          <td class="value">${STARK.share_structure}</td>
        </tr>
      </table>
    </div>

    <div class="sig-row">
      <div class="sig-block">
        <div class="line"></div>
        <div class="name">Dr. Devanand Ramautar</div>
        <div class="title">Registrar of Companies, Republic of Mauritius</div>
      </div>
      <div style="display: flex; align-items: center;">
        <div class="embossed">
          REGISTRAR<br>OF<br>COMPANIES<br>—<br>OFFICIAL SEAL
        </div>
      </div>
      <div class="sig-block">
        <div class="line"></div>
        <div class="name">Issued on this date</div>
        <div class="title">${STARK.incorporation_date}</div>
      </div>
    </div>
  </div>
</body></html>`;
}

// ─── Render pipeline ────────────────────────────────────────────────────

const PROJECT_ROOT = "/Users/elaris/Documents/Claude_webapp_client_onboarding/.claude/worktrees/blissful-mccarthy-f4abb7";

const DOCS = [
  { html: passportHTML, out: "docs/demo-documents/tony-stark/01-passport-certified-copy.pdf", label: "Passport (certified copy)" },
  { html: utilityBillHTML, out: "docs/demo-documents/tony-stark/02-proof-of-address-utility-bill.pdf", label: "Proof of Address (utility bill)" },
  { html: bankStatementHTML, out: "docs/demo-documents/tony-stark/03-bank-statement.pdf", label: "Bank statement" },
  { html: sourceOfFundsHTML, out: "docs/demo-documents/tony-stark/04-source-of-funds-declaration.pdf", label: "Source of funds declaration" },
  { html: pepDeclarationHTML, out: "docs/demo-documents/tony-stark/05-pep-sanctions-declaration.pdf", label: "PEP & sanctions declaration" },
  { html: referenceLetterHTML, out: "docs/demo-documents/tony-stark/06-reference-letter.pdf", label: "Bank reference letter" },
  { html: certificateOfIncorporationHTML, out: "docs/demo-documents/stark-industries/01-certificate-of-incorporation.pdf", label: "Certificate of Incorporation" },
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const doc of DOCS) {
  const html = doc.html();
  const outPath = `${PROJECT_ROOT}/${doc.out}`;
  mkdirSync(dirname(outPath), { recursive: true });

  await page.setContent(html, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: outPath,
    format: "A4",
    printBackground: true,
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
  });

  console.log(`✓ ${doc.label} → ${doc.out}`);
}

await browser.close();
console.log(`\nDone — ${DOCS.length} documents generated.`);
