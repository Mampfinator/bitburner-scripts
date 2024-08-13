use js_sys::{Object, Promise};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    pub fn log(s: &str);

    #[wasm_bindgen]
    pub type NS;

    #[wasm_bindgen(method, structural)]
    pub fn asleep(this: &NS, ms: i32) -> Promise;
    #[wasm_bindgen(method, structural, js_name = "writePort")]
    pub fn write_port(this: &NS, port: i32, data: &str);
    #[wasm_bindgen(method, structural)]
    pub fn alert(this: &NS, s: &str);
    #[wasm_bindgen(method, structural)]
    pub fn file_exists(this: &NS, path: &str) -> bool;
    pub fn file_exists(this: &NS, path: &str, hostname: &str) -> bool;

    #[wasm_bindgen(method, getter, structural)]
    pub fn gang(this: &NS) -> Gang;

    #[wasm_bindgen]
    pub type Gang;
    #[wasm_bindgen(method, structural, js_name = "getGangInformation")]
    pub fn get_gang_information(this: &Gang) -> GangGenInfo;
    #[wasm_bindgen(method, structural, js_name = "getMemberNames")]
    pub fn get_member_names(this: &Gang) -> Vec<String>;
    #[wasm_bindgen(method, structural, js_name = "canRecruitMember")]
    pub fn can_recruit_member(this: &Gang) -> bool;
    #[wasm_bindgen(method, structural, js_name = "recruitMember")]
    pub fn recruit_member(this: &Gang, name: &str) -> bool;
    #[wasm_bindgen(method, structural, js_name = "getOtherGangInformation")]
    pub fn get_other_gang_information(this: &Gang) -> Object;
    #[wasm_bindgen(method, structural, js_name = "setTerritoryWarfare")]
    pub fn set_territory_warfare(this: &Gang, value: bool);
    #[wasm_bindgen(method, structural, js_name = "getChanceToWinClash")]
    pub fn get_chance_to_win_clash(this: &Gang, other: &str) -> f64;
    #[wasm_bindgen(method, structural, js_name = "setMemberTask")]
    pub fn set_member_task(this: &Gang, member: &str, task: &str) -> bool;
    #[wasm_bindgen(method, structural, js_name = "getTaskNames")]
    pub fn get_task_names(this: &Gang) -> Vec<String>;
    #[wasm_bindgen(method, structural, js_name = "getTaskStats")]
    pub fn get_task_stats(this: &Gang, task: &str) -> GangTaskStats;
    #[wasm_bindgen(method, structural, js_name="getMemberInformation")]
    pub fn get_member_information(this: &Gang, member: &str) -> GangMemberInfo;

    #[wasm_bindgen]
    pub type GangGenInfo;
    #[wasm_bindgen(method, getter, structural)]
    pub fn faction(this: &GangGenInfo) -> String;
    #[wasm_bindgen(method, getter, structural, js_name = "isHacking")]
    pub fn is_hacking(this: &GangGenInfo) -> bool;
    #[wasm_bindgen(method, getter, structural, js_name = "moneyGainRate")]
    pub fn money_gain_rate(this: &GangGenInfo) -> f64;
    #[wasm_bindgen(method, getter, structural)]
    pub fn power(this: &GangGenInfo) -> f64;
    #[wasm_bindgen(method, getter, structural)]
    pub fn respect(this: &GangGenInfo) -> f64;
    #[wasm_bindgen(method, getter, structural, js_name = "respectGainRate")]
    pub fn respect_gain_rate(this: &GangGenInfo) -> f64;

    #[wasm_bindgen]
    pub type GangTaskStats;
    #[wasm_bindgen(method, getter, structural)]
    pub fn name(this: &GangTaskStats) -> String;
    #[wasm_bindgen(method, getter, structural, js_name = "baseMoney")]
    pub fn base_money(this: &GangTaskStats) -> f64;
    #[wasm_bindgen(method, getter, structural, js_name = "baseRespect")]
    pub fn base_respect(this: &GangTaskStats) -> f64;
    #[wasm_bindgen(method, getter, structural, js_name = "baseWanted")]
    pub fn base_wanted(this: &GangTaskStats) -> f64;

    #[wasm_bindgen]
    pub type GangMemberInfo;

    #[wasm_bindgen(method, getter, structural)]
    pub fn formulas(this: &NS) -> Formulas;
    #[wasm_bindgen]
    pub type Formulas;
    #[wasm_bindgen(method, getter, structural)]
    pub fn gang(this: &Formulas) -> GangFormulas;

    #[wasm_bindgen]
    pub type GangFormulas;
    #[wasm_bindgen(method, structural)]
    pub fn wanted_level_gain(
        this: &GangFormulas,
        gang: &GangGenInfo,
        member: &GangMemberInfo,
        task: &GangTaskStats,
    ) -> f64;
}
