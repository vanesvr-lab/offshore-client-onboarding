-- Seed 32 document types for the GWMS onboarding redesign
-- Run after schema migration. Safe to re-run (ON CONFLICT DO NOTHING).

insert into public.document_types (name, category, applies_to, description, validity_period_days, sort_order) values

-- ── Identity (6) ────────────────────────────────────────────────────────────
('Passport',                   'identity', 'individual', 'Valid national passport — all pages including blank pages', 3650, 10),
('National ID Card',           'identity', 'individual', 'Government-issued national identity card (front and back)', 3650, 20),
('Driver''s Licence',          'identity', 'individual', 'Valid driver''s licence (front and back)', 3650, 30),
('Proof of Address (Utility Bill)',    'identity', 'individual', 'Recent utility bill (electricity, water, telephone) — not older than 3 months', 90,  40),
('Proof of Address (Bank Statement)', 'identity', 'individual', 'Recent bank statement showing residential address — not older than 3 months', 90,  50),
('Birth Certificate',          'identity', 'individual', 'Official birth certificate', null, 60),

-- ── Corporate (9) ───────────────────────────────────────────────────────────
('Certificate of Incorporation',             'corporate', 'organisation', 'Official certificate confirming company registration', null, 110),
('Memorandum & Articles of Association',     'corporate', 'organisation', 'Constitutional documents of the company', null, 120),
('Business Registration Certificate',        'corporate', 'organisation', 'Current business registration or trade licence', 365,  130),
('Certificate of Good Standing',             'corporate', 'organisation', 'Issued by the registrar confirming active status — not older than 3 months', 90,  140),
('Share Register',                           'corporate', 'organisation', 'Up-to-date register of shareholders', 90,  150),
('Register of Directors',                    'corporate', 'organisation', 'Up-to-date register of directors and officers', 90,  160),
('Registered Office Certificate',            'corporate', 'organisation', 'Confirmation of registered office address', 365,  170),
('Company Profile',                          'corporate', 'organisation', 'Overview of the company''s business activities, structure, and key personnel', null, 180),
('Incumbency Certificate',                   'corporate', 'organisation', 'Notarised certificate confirming directors, officers, and shareholders', 90,  190),

-- ── Financial (7) ───────────────────────────────────────────────────────────
('Bank Statement (3 months)',         'financial', 'both', 'Most recent 3 months of bank statements', 90,  210),
('Bank Statement (6 months)',         'financial', 'both', 'Most recent 6 months of bank statements', 180, 220),
('Audited Financial Statements',      'financial', 'organisation', 'Most recent audited accounts signed by a registered auditor', 365, 230),
('Management Accounts',               'financial', 'organisation', 'Latest management accounts (not older than 6 months)', 180, 240),
('Source of Funds Declaration',       'financial', 'both', 'Signed declaration explaining the origin of funds to be deposited or invested', null, 250),
('Source of Wealth Declaration',      'financial', 'individual', 'Signed declaration explaining how personal wealth was accumulated', null, 260),
('Tax Returns',                       'financial', 'both', 'Most recent filed tax return', 365, 270),

-- ── Compliance (6) ──────────────────────────────────────────────────────────
('Anti-Money Laundering Policy',      'compliance', 'organisation', 'Company AML/CFT policy document signed by a director', null, 310),
('Board Resolution',                  'compliance', 'organisation', 'Certified board resolution authorising the engagement or transaction', null, 320),
('Power of Attorney',                 'compliance', 'both', 'Notarised power of attorney where applicable', 365, 330),
('Sanctions Screening Certificate',   'compliance', 'both', 'Evidence of sanctions screening carried out on the entity or individual', 30,  340),
('PEP Declaration',                   'compliance', 'both', 'Signed declaration confirming or denying politically exposed person status', null, 350),
('CDD Questionnaire',                 'compliance', 'both', 'Completed Customer Due Diligence questionnaire', null, 360),

-- ── Additional (4) ──────────────────────────────────────────────────────────
('Organisation Chart',                'additional', 'organisation', 'Diagram showing the corporate structure and ownership chain', null, 410),
('Group Structure Chart',             'additional', 'organisation', 'Full group structure chart showing ultimate beneficial ownership', null, 420),
('Reference Letter (Bank)',           'additional', 'both', 'Reference letter from the client''s existing bank confirming good standing', 90,  430),
('Reference Letter (Professional)',   'additional', 'both', 'Reference letter from a lawyer, accountant, or other regulated professional', 90,  440)

on conflict (name) do nothing;
