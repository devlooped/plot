# plotdown sample

Each block below is a `plot` code block of JSON. With the plugin on, it shows as a chart, in reading view and in live preview.

## Bars

```plot
{
  "data": {"penguins": {"csv": "species,body_mass_g\nAdelie,3750\nGentoo,5000\nChinstrap,3500\n"}},
  "marks": [
    {"mark": "barY", "data": "penguins", "x": "species", "y": "body_mass_g", "fill": "species", "tip": true},
    {"mark": "ruleY", "data": [0]}
  ]
}
```

## A line with a title and a legend

```oplot
{
  "title": "Temperature",
  "subtitle": "Two cities, one week",
  "color": {"legend": true},
  "data": {"t": {"csv": "day,city,temp\n1,Lisbon,18\n2,Lisbon,19\n3,Lisbon,21\n4,Lisbon,20\n1,Oslo,6\n2,Oslo,4\n3,Oslo,7\n4,Oslo,9\n"}},
  "marks": [
    {"mark": "lineY", "data": "t", "x": "day", "y": "temp", "stroke": "city"},
    {"mark": "dot", "data": "t", "x": "day", "y": "temp", "fill": "city", "tip": true}
  ]
}
```

## A histogram

```observable-plot
{
  "marks": [
    {"mark": "rectY", "data": [1, 2, 2, 3, 3, 3, 4, 4, 5, 7, 8, 8, 9], "transform": [{"binX": {"y": "count"}}]},
    {"mark": "ruleY", "data": [0]}
  ]
}
```

## A mistake

This block names a mark that does not exist: it stays code, with the reason under it.

```plot
{"marks": [{"mark": "bars", "data": [1, 2, 3]}]}
```