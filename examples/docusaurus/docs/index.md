---
slug: /
---

# plotdown sample

A paragraph before the chart.

```plot
{
  "title": "Penguin body mass",
  "data": {"penguins": {"csv": "species,body_mass_g\nAdelie,3750\nGentoo,5000\nChinstrap,3500\n"}},
  "marks": [
    {"mark": "barY", "data": "penguins", "x": "species", "y": "body_mass_g", "fill": "species"},
    {"mark": "ruleY", "data": [0]}
  ]
}
```

A line in an `oplot` fence:

```oplot
{
  "title": "{{ 6 * 7 }} stays text",
  "data": {"points": [{"day": 1, "value": 1}, {"day": 2, "value": 3}, {"day": 3, "value": 2}, {"day": 4, "value": 5}, {"day": 5, "value": 4}, {"day": 6, "value": 6}]},
  "marks": [
    {"mark": "lineY", "data": "points", "x": "day", "y": "value", "curve": "catmull-rom"},
    {"mark": "dot", "data": "points", "x": "day", "y": "value", "fill": "currentColor"}
  ]
}
```

A block that fails stays code, with the reason under it:

```observable-plot
{"marks": [{"mark": "pie", "data": [1, 2]}]}
```