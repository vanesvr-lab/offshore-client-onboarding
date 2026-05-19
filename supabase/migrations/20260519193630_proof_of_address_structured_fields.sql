-- B-136 — Extend "Proof of Residential Address" AI extraction config to
-- emit structured address components alongside the existing composite
-- string. Each component maps to its own prefill_field so the KYC form's
-- structured residential-address fields get populated automatically on
-- Re-apply (combined with B-135's persistence fix).

UPDATE public.document_types
SET ai_extraction_fields = '[
  {
    "key": "address_on_document",
    "label": "Address",
    "ai_hint": "Full address as it appears on the document (single line, components separated by commas)",
    "type": "string",
    "prefill_field": "address"
  },
  {
    "key": "address_line_1",
    "label": "Address line 1",
    "ai_hint": "Street address line 1 — house/building number plus street name (e.g. ''10880 Malibu Point'')",
    "type": "string",
    "prefill_field": "address_line_1"
  },
  {
    "key": "address_line_2",
    "label": "Address line 2",
    "ai_hint": "Apartment, suite, building, or unit identifier if present; null if not on document",
    "type": "string",
    "prefill_field": "address_line_2"
  },
  {
    "key": "address_city",
    "label": "City",
    "ai_hint": "City or town name",
    "type": "string",
    "prefill_field": "address_city"
  },
  {
    "key": "address_state",
    "label": "State / province",
    "ai_hint": "State, province, or region (full name preferred; e.g. ''California'' not ''CA'')",
    "type": "string",
    "prefill_field": "address_state"
  },
  {
    "key": "address_postal_code",
    "label": "Postal code",
    "ai_hint": "ZIP, postal code, or postcode",
    "type": "string",
    "prefill_field": "address_postal_code"
  },
  {
    "key": "address_country",
    "label": "Country",
    "ai_hint": "Country as an ISO 3166-1 alpha-3 code (e.g. ''USA'' for United States, ''GBR'' for United Kingdom, ''FRA'' for France). Convert full country names to ISO3.",
    "type": "string",
    "prefill_field": "address_country"
  },
  {
    "key": "document_date",
    "label": "Document date",
    "ai_hint": "Statement or issue date",
    "type": "date",
    "prefill_field": null
  },
  {
    "key": "account_holder_name",
    "label": "Name on document",
    "ai_hint": "Account holder or addressee",
    "type": "string",
    "prefill_field": null
  }
]'::jsonb
WHERE name = 'Proof of Residential Address';
