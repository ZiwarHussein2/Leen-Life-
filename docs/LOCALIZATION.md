# Localization

Languages: English (LTR), Arabic (RTL), Kurdish Sorani (RTL). Catalogs live in `packages/localization/src/messages/{en,ar,ku}.json`; keys — never hardcoded strings — are used across the web app.

- The root layout reads the `locale` cookie and sets `lang` + `dir` on `<html>`; the client-side switcher (on every portal and the login page) updates both live.
- Fonts: Inter for English; **Noto Kufi Arabic** for Arabic and Kurdish Sorani, loaded via `next/font` and switched by `html[lang]` CSS.
- Layout uses CSS logical properties (`margin-inline-start`, `padding-inline-end`, `text-align: start`) so components mirror automatically in RTL. Letter-spacing is zeroed for Arabic-script text.
- Database content is trilingual where user-facing: tests (`nameEn/nameAr/nameKu`), inventory items, work policies (one row per language, versioned). The UI picks the field matching the active locale.
- Users have a stored `language` preference used for notification/policy language.
- Print surfaces (receipt, report) inherit the active locale and direction.

To add a key: add it to all three JSON files, then use `t("your.key")`. Missing keys fall back to English, then to the key itself.

Remaining work: full translation coverage of every portal string (core flows are covered; some operational labels remain English-only), localized date/number formatting via `Intl` per locale, and automated RTL rendering tests.
