import DOMPurify from "dompurify";

// Tags/attributes allowed in admin-authored rich text. Everything else (scripts,
// event handlers, iframes, inline styles, …) is stripped before the HTML is shown
// on the public landing page.
const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup",
  "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "a", "span", "div",
];
const ALLOWED_ATTR = ["href", "target", "rel"];

let hookInstalled = false;

/**
 * Sanitises admin-authored rich text (HTML) before it is rendered with
 * dangerouslySetInnerHTML. DOMPurify needs a DOM, so this returns "" on the
 * server — render the result only on the client (e.g. behind a `mounted` flag)
 * to keep server and client markup identical.
 */
export function sanitizeRichText(html: string): string {
  if (typeof window === "undefined") return "";
  if (!hookInstalled) {
    // Make every link safe to open from a public page.
    DOMPurify.addHook("afterSanitizeAttributes", (node: any) => {
      if (node?.tagName === "A" && node.getAttribute?.("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
    hookInstalled = true;
  }
  return DOMPurify.sanitize(html ?? "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
  });
}

export default sanitizeRichText;
