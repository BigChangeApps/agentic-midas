# UK finance sources

Used by `/triage-bug` when a bug involves money: what UK rules say the behaviour should be, and how the finance vendors we integrate with behave.

**Fetch the page and quote the passage you rely on, with its link.** Never cite a rule or a section number from memory: HMRC renumbers its notices when it updates them. If a page won't load, say so instead of answering from memory. Guidance is evidence for the verdict, not legal advice. Say how solid it is:

- **Stated:** HMRC says it outright.
- **Allowed:** HMRC allows more than one way, so either behaviour can be right.
- **No clear source:** nothing found; the team should confirm.

## The rules (HMRC and gov.uk)

| Topic | Source |
|---|---|
| VAT in general: tax points, deposits, discounts, rounding, foreign currency, credit notes | [VAT Notice 700: the VAT guide](https://www.gov.uk/guidance/vat-guide-notice-700) |
| VAT invoices: what must be on them, simplified invoices, credit and debit notes, record keeping | [VAT Notice 700/21: record keeping](https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021) |
| Which rate applies (standard, reduced, zero, exempt, outside the scope) | [Rates of VAT on goods and services](https://www.gov.uk/guidance/rates-of-vat-on-different-goods-and-services) |
| Domestic reverse charge for building and construction, and the invoice wording | [VAT domestic reverse charge](https://www.gov.uk/guidance/vat-domestic-reverse-charge-for-building-and-construction-services) |
| CIS deductions: labour vs materials, rates, statements | [CIS 340](https://www.gov.uk/government/publications/construction-industry-scheme-cis-340) |
| Making Tax Digital: digital records and digital links | [VAT Notice 700/22](https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat) |
| Cash accounting (VAT due when paid) | [VAT cash accounting scheme](https://www.gov.uk/vat-cash-accounting-scheme) |
| Flat rate scheme | [VAT flat rate scheme](https://www.gov.uk/vat-flat-rate-scheme) |
| Bad debt relief | [VAT Notice 700/18](https://www.gov.uk/guidance/relief-from-vat-on-bad-debts-notice-70018) |
| Late payment interest and compensation | [Late commercial payments](https://www.gov.uk/late-commercial-payments-interest-debt-recovery) |
| What a company must show on invoices and documents | [Signs, stationery and promotional material](https://www.gov.uk/running-a-limited-company/signs-stationery-and-promotional-material) |
| Edge cases the guidance doesn't settle | [HMRC internal manuals](https://www.gov.uk/government/collections/hmrc-manuals), then the [VAT Act 1994](https://www.legislation.gov.uk/ukpga/1994/23) |

## Where to look for common questions

- VAT rounded per line or on the invoice total: Notice 700, the section on calculating VAT on invoices.
- When VAT is due on a deposit or advance payment: Notice 700, tax points.
- A credit note against a VAT invoice: Notice 700/21 and Notice 700, credit and debit notes.
- An invoice in a foreign currency: Notice 700, foreign currency.
- Reverse charge or CIS on a mixed labour and materials invoice: the reverse charge guidance and CIS 340.
- Zero-rated, exempt or outside the scope: the rates page, then Notice 700.

## Vendor behaviour (not the rules)

| Vendor | Where we use it | Source |
|---|---|---|
| Xero | Accounting sync (`BigChange.Xero`) | How it calculates and rounds tax, what its API accepts and rejects: [Xero Central](https://central.xero.com/), the [Xero developer docs](https://developer.xero.com/documentation/) |
| Sage 50 Accounts (UK) | Accounting integration, with and without Sage invoice referencing | [Sage UK knowledge base](https://gb-kb.sage.com/). Sage's other sites refuse automated fetches: when a page won't load, say so and ask the user |
| Stripe | Online card payments, including pre-authorisation holds captured later | [Payment Intents](https://docs.stripe.com/payments/payment-intents), [holds and capture](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method), [refunds](https://docs.stripe.com/refunds), [disputes](https://docs.stripe.com/disputes), [currencies and minor units](https://docs.stripe.com/currencies), the [API reference](https://docs.stripe.com/api) |

A vendor's rules are its own, not HMRC's. A mismatch with Xero or Sage can be a sync bug even when both sides are legal. A Stripe amount, hold or refund that differs from the invoice can be a bug on either side.
