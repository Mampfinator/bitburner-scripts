import ReactNamespace from "react";
import ReactDomNamespace from "react-dom";

const React = globalThis.React as typeof ReactNamespace;
const ReactDOM = globalThis.ReactDOM as typeof ReactDomNamespace;

export default React;
export { ReactDOM };
