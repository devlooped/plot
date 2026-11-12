// A last check of what Plot drew, in case a rule upstream missed something:
// no script, no event handler, no unsafe link, no remote url(), images only as allowed.
import {fail} from "./errors.js";
import {checkRemote, isInlineImage, isSafeHref, type RemotePolicy} from "./urls.js";

const REMOTE_CSS_URL = /\burl\s*\(\s*(?!['"]?\s*#)/i;
const FORBIDDEN_ELEMENTS = new Set(["script", "foreignobject", "iframe", "object", "embed", "use", "animate", "set", "animatemotion", "animatetransform", "link", "meta", "base", "form", "input", "button", "textarea", "img", "audio", "video", "source", "track", "frame", "frameset"]);

export function sanitize(root: Element, policy: RemotePolicy): void {
  const stack: Element[] = [root];
  while (stack.length) {
    const element = stack.pop()!;
    const tag = element.localName.toLowerCase();
    if (FORBIDDEN_ELEMENTS.has(tag)) fail([], `the chart contains a <${tag}> element, which is not allowed`);
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name.startsWith("on")) fail([], `the chart contains an event handler (${name}), which is not allowed`);
      if (REMOTE_CSS_URL.test(value)) fail([], `the chart contains a remote url() in ${name}, which is not allowed`);
      if (name === "href" || name === "xlink:href" || name === "src") {
        if (tag === "a") {
          if (!isSafeHref(value)) fail([], `the chart contains a link to "${value}", which is not allowed`);
        } else if (tag === "image") {
          if (!isInlineImage(value)) checkRemote(value, policy, [], "the image");
        } else if (!value.startsWith("#")) fail([], `the chart contains a reference to "${value}" on <${tag}>, which is not allowed`);
      }
    }
    if (tag === "style" && /@import|\burl\s*\(\s*(?!['"]?\s*#)/i.test(element.textContent ?? "")) fail([], "the chart contains a style sheet that loads from the network");
    for (let child = element.firstElementChild; child; child = child.nextElementSibling) stack.push(child);
  }
}