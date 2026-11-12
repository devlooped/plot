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
  "marks": [
    {"mark": "lineY", "data": [1, 3, 2, 5, 4, 6], "curve": "catmull-rom"},
    {"mark": "dotY", "data": [1, 3, 2, 5, 4, 6], "fill": "currentColor"}
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
