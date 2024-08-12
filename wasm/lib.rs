use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    pub fn log(s: &str);

    #[wasm_bindgen]
    pub type NS;

    #[wasm_bindgen(method, structural)]
    pub fn alert(this: &NS, s: &str);
}

#[wasm_bindgen]
pub fn test(ns: &NS) {
    ns.alert("Hello from Rust!")
}