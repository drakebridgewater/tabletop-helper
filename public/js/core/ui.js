// Small HTML helpers shared by the app shell and game screens.
const B = () => window.Bridgewater;

export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
export const chip = (c, round) => (c ? `<i class="chip${round ? " round" : ""}" style="--c:var(${c})"></i>` : "");
export const btn = (label, act, { v = "secondary", sm, data = "", pressed, disabled, cls = "", aria } = {}) =>
  `<button type="button" class="bw-btn bw-btn--${v}${sm ? " bw-btn--sm" : ""}${cls ? " " + cls : ""}" data-act="${act}" ${data}` +
  `${pressed === undefined ? "" : ` aria-pressed="${!!pressed}"`}${disabled ? " disabled" : ""}${aria ? ` aria-label="${esc(aria)}"` : ""}>${label}</button>`;
export const icon = (name) => B().Icon({ name }).outerHTML;
export const initials = (n) => {
  const w = String(n || "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  return w.length > 1 ? (w[0][0] + w[1][0]).toUpperCase() : w[0].slice(0, 3);
};
