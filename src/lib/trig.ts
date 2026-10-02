// Math.cos/sin can differ in the last bit between the server's and the browser's JS engines,
// which breaks hydration of SVG coordinates. Rounding makes them identical everywhere.
export const cos = (a: number) => Math.round(Math.cos(a) * 1e9) / 1e9;
export const sin = (a: number) => Math.round(Math.sin(a) * 1e9) / 1e9;
