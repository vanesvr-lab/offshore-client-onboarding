-- ============================================================
-- GWMS Onboarding — Seed Data
-- Run AFTER schema.sql
-- ============================================================

-- Service Templates (fixed UUIDs for easy reference)
insert into service_templates (id, name, description) values
  ('11111111-1111-1111-1111-111111111111', 'Global Business Corporation (GBC)', 'Setup and licensing of a GBC for international business through the Mauritius IFC'),
  ('22222222-2222-2222-2222-222222222222', 'Authorised Company (AC)', 'Non-resident company with central management outside Mauritius'),
  ('33333333-3333-3333-3333-333333333333', 'Trust', 'Setup and administration of various trust structures under the Trust Act 2001'),
  ('44444444-4444-4444-4444-444444444444', 'Foundation', 'Setup of charitable or wealth management foundation under Foundations Act 2012'),
  ('55555555-5555-5555-5555-555555555555', 'Collective Investment Scheme (CIS)', 'Fund setup and ongoing administration'),
  ('66666666-6666-6666-6666-666666666666', 'Bank Account Opening', 'Corporate or personal bank account opening assistance')
on conflict (id) do nothing;

-- ============================================================
-- GBC Document Requirements — Corporate (6 docs)
-- ============================================================
insert into document_requirements (template_id, name, description, category, is_required, sort_order, verification_rules) values

('11111111-1111-1111-1111-111111111111',
 'Certificate of Incorporation',
 'Upload the original certificate issued by the registrar of companies in the country of incorporation',
 'corporate', true, 1,
 '{"extract_fields":["company_name","incorporation_date","company_number","country"],"match_rules":[{"field":"company_name","match_against":"business_name","required":true,"description":"Company name must match application"}],"document_type_expected":"certificate_of_incorporation","notes":"Must be certified copy"}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Memorandum and Articles of Association',
 'Upload the full constitutional documents of the company',
 'corporate', true, 2,
 '{"extract_fields":["company_name","date"],"match_rules":[{"field":"company_name","match_against":"business_name","required":true,"description":"Company name must match application"}],"document_type_expected":"memorandum_articles","notes":"Must be certified copy"}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Register of Directors',
 'Current and complete register showing all appointed directors',
 'corporate', true, 3,
 '{"extract_fields":["company_name","directors"],"match_rules":[{"field":"company_name","match_against":"business_name","required":false,"description":"Company name should match application"}],"document_type_expected":"register_of_directors","notes":null}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Register of Shareholders',
 'Current register showing all shareholders and their ownership percentages',
 'corporate', true, 4,
 '{"extract_fields":["company_name","shareholders","ownership_percentages"],"match_rules":[{"field":"company_name","match_against":"business_name","required":false,"description":"Company name should match application"}],"document_type_expected":"register_of_shareholders","notes":null}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Proof of Registered Address',
 'Utility bill or official correspondence showing the company''s registered address, dated within 3 months',
 'corporate', true, 5,
 '{"extract_fields":["address","date","company_name"],"match_rules":[{"field":"date","check":"within_3_months","required":true,"description":"Document must be dated within 3 months"}],"document_type_expected":"proof_of_address","notes":"Must be dated within 3 months"}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Certificate of Good Standing',
 'Must be issued within the last 6 months. Required for companies existing more than 12 months',
 'corporate', true, 6,
 '{"extract_fields":["company_name","issue_date"],"match_rules":[{"field":"company_name","match_against":"business_name","required":true,"description":"Company name must match application"},{"field":"issue_date","check":"within_6_months","required":true,"description":"Must be issued within last 6 months"}],"document_type_expected":"certificate_of_good_standing","notes":"Must be certified copy"}'::jsonb),

-- ============================================================
-- GBC Document Requirements — KYC (7 docs)
-- ============================================================

('11111111-1111-1111-1111-111111111111',
 'Certified Passport Copy',
 'Clear copy of the bio-data page. Must not be expired. Certified by a notary, lawyer, or bank official. Note: For this demo, upload for the primary contact. In production, this is required per director and UBO.',
 'kyc', true, 7,
 '{"extract_fields":["full_name","passport_number","expiry_date","nationality","date_of_birth"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":true,"description":"Name on passport must match applicant name"},{"field":"expiry_date","check":"not_expired","required":true,"description":"Passport must not be expired"}],"document_type_expected":"passport","notes":"Accept passports from any country. Reject if photo page is obscured."}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Proof of Residential Address',
 'Utility bill or bank statement showing residential address, dated within 3 months. Name must match passport. Note: For this demo, upload for the primary contact.',
 'kyc', true, 8,
 '{"extract_fields":["full_name","address","date"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":true,"description":"Name must match applicant"},{"field":"date","check":"within_3_months","required":true,"description":"Must be dated within 3 months"}],"document_type_expected":"proof_of_residential_address","notes":null}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Bank Reference Letter',
 'Letter from a recognized bank confirming the individual is a customer in good standing. Note: For this demo, upload for the primary contact.',
 'kyc', true, 9,
 '{"extract_fields":["full_name","bank_name","date"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":true,"description":"Name must match applicant"}],"document_type_expected":"bank_reference_letter","notes":null}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Professional Reference Letter',
 'Letter from a lawyer, accountant, or other professional, on official letterhead. Note: For this demo, upload for the primary contact.',
 'kyc', true, 10,
 '{"extract_fields":["full_name","professional_name","date"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":true,"description":"Name must match applicant"}],"document_type_expected":"professional_reference_letter","notes":null}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'CV / Resume',
 'Professional CV showing qualifications and business background. Note: For this demo, upload for the primary contact.',
 'kyc', true, 11,
 '{"extract_fields":["full_name"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":false,"description":"Name should match applicant"}],"document_type_expected":"cv_resume","notes":null}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Source of Funds Declaration',
 'Signed declaration explaining the origin of funds to be used in the business. Note: For this demo, upload for the primary contact.',
 'kyc', true, 12,
 '{"extract_fields":["full_name","date"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":true,"description":"Name must match applicant"}],"document_type_expected":"source_of_funds_declaration","notes":null}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Source of Wealth Declaration',
 'Signed declaration explaining how personal wealth was accumulated. Note: For this demo, upload for the primary contact.',
 'kyc', true, 13,
 '{"extract_fields":["full_name","date"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":true,"description":"Name must match applicant"}],"document_type_expected":"source_of_wealth_declaration","notes":null}'::jsonb),

-- ============================================================
-- GBC Document Requirements — Compliance (5 docs)
-- ============================================================

('11111111-1111-1111-1111-111111111111',
 'Business Plan',
 'Detailed description of the proposed business activities, target markets, and projected financials',
 'compliance', true, 14,
 '{"extract_fields":["company_name","business_activities"],"match_rules":[],"document_type_expected":"business_plan","notes":null}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'AML/CFT Declaration Form',
 'Completed and signed GWMS AML/CFT intake form (download template from portal)',
 'compliance', true, 15,
 '{"extract_fields":["company_name","signatory_name","date"],"match_rules":[{"field":"company_name","match_against":"business_name","required":true,"description":"Company name must match application"}],"document_type_expected":"aml_cft_declaration","notes":null}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Tax Identification Document',
 'Tax registration or identification document from the home country',
 'compliance', true, 16,
 '{"extract_fields":["company_name","tax_id","country"],"match_rules":[],"document_type_expected":"tax_identification","notes":null}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Corporate Banker''s Reference',
 'For existing companies: letter from the company''s bank confirming account in good standing',
 'compliance', false, 17,
 '{"extract_fields":["company_name","bank_name","date"],"match_rules":[{"field":"company_name","match_against":"business_name","required":false,"description":"Company name should match application"}],"document_type_expected":"corporate_bankers_reference","notes":null}'::jsonb),

('11111111-1111-1111-1111-111111111111',
 'Signed Engagement Letter',
 'GWMS engagement letter signed by authorized signatory (provided by GWMS upon application)',
 'compliance', true, 18,
 '{"extract_fields":["company_name","signatory_name","date"],"match_rules":[{"field":"company_name","match_against":"business_name","required":true,"description":"Company name must match application"}],"document_type_expected":"engagement_letter","notes":"Must be certified copy"}'::jsonb);

-- ============================================================
-- ADMIN USER SETUP
-- ============================================================
-- After running this seed:
-- 1. Go to Supabase Dashboard > Authentication > Users > Add user
--    Email: vanes.vr@gmail.com
--    Password: GWMSAdmin2026!   (change this after first login)
--    Check "Auto Confirm User"
-- 2. The trigger will auto-create a profiles row.
--    Update their name, then insert into admin_users:
--
--    UPDATE profiles SET full_name = 'Jane Doe'
--    WHERE email = 'vanes.vr@gmail.com';
--
--    INSERT INTO admin_users (user_id)
--    SELECT id FROM profiles WHERE email = 'vanes.vr@gmail.com';
--
-- That's it. Role is now derived from the admin_users table, not profiles.
-- ============================================================
