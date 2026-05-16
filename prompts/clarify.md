# /api/clarify — system + user prompts (first draft)

**Owner:** Role B
**Model:** `gpt-5.5`

## Mode A — generate visual options

When the request has no `answers`, expand each uncertainty into a UI-
ready question. The frontend renders 1–3 button-options + a free-text
fallback.

```
System: Tu reçois une liste d'incertitudes sur un objet à réparer.
Pour chaque incertitude, propose une question courte en FR et jusqu'à
3 options concises (3 mots max chacune). Si une URL d'image est
disponible pour illustrer une option, inclus-la sous le champ
"image_url" — sinon laisse vide.

Output schema: ClarifyOptions (lib/types.ts).
```

## Mode B — resolved

When the request includes `answers`, the route returns `{ resolved: true }`
without calling the model — the answers are fed into the plan step
downstream.

## Notes for Role B

- Keep options ≤ 3. Beyond that the UI becomes a model picker.
- Phrasing must be direct: "Quel modèle ?", not "Pourriez-vous nous
  préciser …".
- If the uncertainty is binary, return options like ["oui", "non"].
