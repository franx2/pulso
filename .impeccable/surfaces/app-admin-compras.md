---
version: 1
slug: "app-admin-compras"
primary_target: "app/admin/compras"
related_targets: ["app/api/compras", "lib/compras"]
---

## Scope

`/admin/compras`, desktop and mobile. Mode: Operate. Covers purchase totals,
verified delivery notes, ice-cream consumption equivalences and royalty control.

## Audience, job, proof, constraints

The owner or operations manager needs to understand each location before
opening individual documents. Every amount must retain its source period and
location. Estimated consumption must disclose coverage and cannot be labelled
as waste until opening and closing stock exist.

## Direction contract

THESIS: One location and one period govern the page; separate overview,
ice-cream control, delivery notes and royalty instead of mixing them.

OWN-WORLD: Pulso teal and mint, warm white, dark ink, Geist, tabular numbers,
8px panels, thin rules and semantic amber or rose only for attention states.

STORY: Choose location and period. Chain scope compares locations; a selected
location replaces that comparison with its own recent purchases and controls.
Then scan purchase signals, compare kilograms received with equivalent
kilograms sold, inspect missing recipes, and open the supporting delivery note
or royalty calculation.

FIRST VIEWPORT: Sticky title, compact context selector, four navigation tabs
and a four-metric band. Desktop uses dense tables; mobile uses a native location
menu, two-row tabs and stacked detail rows without horizontal page overflow.

FORM: Code-led command center. Conversions are explicit business rules, not a
predictive model. Missing purchase history displays `Sin base`; ambiguous sold
products remain pending rather than receiving invented grams.

FINISH: Validate the live page at 1440x900 and 390x900, run typecheck, lint,
tests and production build, and keep this brief plus `HANDOFF.md` current.

## Unresolved decisions

Opening and closing stock capture, recipes for mixed products, and purchase
identity mapping for locations other than Las Cañas.
