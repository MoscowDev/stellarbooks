# Valuation design

Reviewed 2026-11-18.

The [IFRS IAS 21 overview](https://www.ifrs.org/issued-standards/list-of-standards/ias-21-the-effects-of-changes-in-foreign-exchange-rates/)
describes which exchange rates to use as a central accounting question. See the
[accounting research](accounting.md) for the project's distinction between native amounts and
valuation annotations.

The library accepts prices from a caller-supplied source. Its quote is a positive bigint
rational expressed in quote minor units per base minor unit. The caller selects rounding
explicitly. Valuation retains the original amount, quote, observation timestamp and source.
The built-in manual source selects the latest supplied rate at or before the cutoff and rejects
ambiguous rates for the same pair and observation instant. The source never supplies a default rate.
