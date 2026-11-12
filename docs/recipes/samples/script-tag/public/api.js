// data-auto="false": nothing renders until start().
const {plotdown} = globalThis;
const first = await plotdown.start({theme: "light"});
console.log("start", JSON.stringify(first));

// A block added later renders by itself: start() watches the page.
document.querySelector("#later").innerHTML =
  '<pre><code class="language-plot">{"marks": [{"mark": "dot", "data": [1, 4, 2, 5]}]}</code></pre>';

// A shadow root is not watched by start(): give it a BlockRenderer of its own.
const shadow = document.querySelector("#host").attachShadow({mode: "open"});
shadow.innerHTML = '<pre><code class="language-oplot">{"marks": [{"mark": "barY", "data": [3, 1, 2]}]}</code></pre>';
const renderer = new plotdown.BlockRenderer(plotdown.configure({}));
console.log("shadow", JSON.stringify(await renderer.scan(shadow)));
renderer.observe(shadow);
