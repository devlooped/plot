---
title: Charts
---

A bar chart in a `plot` fence:

```plot
{
  "title": "Penguin body mass",
  "y": {"grid": true},
  "marks": [
    {"mark": "barY", "data": [{"species": "Adelie", "mass": 3750}, {"species": "Gentoo", "mass": 5000}, {"species": "Chinstrap", "mass": 3500}], "x": "species", "y": "mass", "fill": "species"},
    {"mark": "ruleY", "data": [0]}
  ]
}
```

A line in an `oplot` fence:

```oplot
{
  "marks": [
    {"mark": "lineY", "data": [1, 3, 2, 5, 4, 6], "curve": "catmull-rom"},
    {"mark": "ruleY", "data": [0]}
  ]
}
```

A block that fails (unknown mark) stays code, with the reason under it:

```plot
{"marks": [{"mark": "pie", "data": [1, 2]}]}
```

A JavaScript block stays code:

```js
console.log("not a chart");
```
