// The canned answer the "model" streams: no API key needed.
export const question = "How do the penguin species compare by body mass?";

const block = String.raw`{
  "title": "Penguin body mass by species",
  "subtitle": "Mean body mass in grams",
  "data": {
    "penguins": {"csv": "species,body_mass_g\nAdelie,3701\nChinstrap,3733\nGentoo,5076\n"}
  },
  "marks": [
    {"mark": "barY", "data": "penguins", "x": "species", "y": "body_mass_g", "fill": "species", "tip": true},
    {"mark": "ruleY", "data": [0]}
  ],
  "color": {"legend": true}
}`;

export const answer = `Here is how the three species compare by body mass:

\`\`\`plot
${block}
\`\`\`

**Gentoo** penguins are the heaviest, about 1.3 kg more than the other two.`;
