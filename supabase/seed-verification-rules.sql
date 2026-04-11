-- Seed default plain-English verification rules for common document types.
-- Run after 002-fix-service-field-labels.sql (requires verification_rules_text column on document_types).

UPDATE public.document_types
SET verification_rules_text = '1. Check passport expiry date is not expired
2. Check name on passport matches the client name provided
3. Document must be a certified copy (look for certification stamp, notary signature, or attestation)
4. Photo page must be clearly readable with no obstructions
5. Extract passport number, nationality, and date of birth'
WHERE name = 'Certified Passport Copy';

UPDATE public.document_types
SET verification_rules_text = '1. Document must be dated within the last 3 months
2. Name on document must match client name
3. Full residential address must be visible
4. Document must be a utility bill, bank statement, or government correspondence
5. PO Box addresses are not acceptable'
WHERE name = 'Proof of Residential Address';

UPDATE public.document_types
SET verification_rules_text = '1. Company name must match the business name in the application
2. Document must be a certified copy
3. Extract company registration number, date of incorporation, and jurisdiction
4. Document must be from a recognized registrar of companies'
WHERE name = 'Certificate of Incorporation';

UPDATE public.document_types
SET verification_rules_text = '1. Letter must be on official bank letterhead
2. Must confirm the individual or entity is a customer in good standing
3. Must be signed by an authorized bank official
4. Name must match client name
5. Must be dated within the last 3 months'
WHERE name = 'Bank Reference Letter';

UPDATE public.document_types
SET verification_rules_text = '1. Company name must match the application
2. Must be issued within the last 6 months
3. Must be a certified copy
4. Must be from the registrar of companies in the country of incorporation'
WHERE name = 'Certificate of Good Standing';

UPDATE public.document_types
SET verification_rules_text = '1. Name must match the client name
2. Must show professional qualifications and business background
3. Must include employment history'
WHERE name = 'Curriculum Vitae / Resume';

UPDATE public.document_types
SET verification_rules_text = '1. Must be signed by the declarant
2. Name must match client name
3. Must clearly explain the origin of funds
4. Must include a date'
WHERE name = 'Declaration of Source of Funds';

UPDATE public.document_types
SET verification_rules_text = '1. Must be signed by the declarant
2. Name must match client name
3. All required fields must be completed
4. PEP status must be clearly indicated (yes or no)'
WHERE name = 'PEP Declaration Form';

UPDATE public.document_types
SET verification_rules_text = '1. Company name must match the application
2. Must show all currently appointed directors
3. Must include full names and dates of appointment'
WHERE name = 'Register of Directors';

UPDATE public.document_types
SET verification_rules_text = '1. Company name must match the application
2. Must show all shareholders with ownership percentages
3. Total shareholding must equal 100 percent'
WHERE name = 'Register of Shareholders/Members';
