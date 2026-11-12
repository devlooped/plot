# plotdown in VS Code

A bar chart:

```plot
{
  "title": "Penguins",
  "data": {"penguins": {"csv": "species,body_mass_g\nAdelie,3750\nGentoo,5000\nChinstrap,3500\n"}},
  "marks": [
    {"mark": "barY", "data": "penguins", "x": "species", "y": "body_mass_g", "fill": "species"},
    {"mark": "ruleY", "data": [0]}
  ]
}
```

A line, in an `oplot` fence:

```oplot
{
  "data": {"points": [{"day": 1, "value": 1}, {"day": 2, "value": 3}, {"day": 3, "value": 2}, {"day": 4, "value": 5}, {"day": 5, "value": 4}, {"day": 6, "value": 6}]},
  "marks": [
    {"mark": "lineY", "data": "points", "x": "day", "y": "value", "curve": "catmull-rom"},
    {"mark": "dot", "data": "points", "x": "day", "y": "value", "fill": "currentColor"}
  ]
}
```

A block with a mistake shows its source and the reason:

```plot
{
  "marks": [
    {"mark": "dot", "data": [{"a": 1}], "x": "a", "colour": "red"}
  ]
}
```

A gnuplot script in a `plot` fence stays code:

```plot
plot sin(x) with lines
```
