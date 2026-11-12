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
  "marks": [
    {"mark": "lineY", "data": [1, 3, 2, 5, 4, 6], "curve": "catmull-rom"},
    {"mark": "dotY", "data": [1, 3, 2, 5, 4, 6], "fill": "currentColor"}
  ]
}
```

A block that fails stays code, with the reason under it:

```observable-plot
{"marks": [{"mark": "pie", "data": [1, 2]}]}
```
