use js_sys::{Object, Reflect};
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};
use wasm_bindgen_futures::*;

use std::{cmp, collections::HashMap};

pub use ns::*;

use crate::ns;

enum GangMode {
    Respect,
    Territory,
    Money,
}

#[wasm_bindgen]
pub async fn gang(ns: &NS) {
    let gang = ns.gang();

    let tasks = gang
        .get_task_names()
        .into_iter()
        .map(|s| gang.get_task_stats(&s))
        .collect::<Vec<_>>();

    let wanted_task = tasks
        .iter()
        .min_by(|a, b| a.base_wanted().partial_cmp(&b.base_wanted()).unwrap())
        .unwrap();

    loop {
        JsFuture::from(ns.asleep(200)).await.ok();

        // TODO: sync members and send events. Figure out how to the latter.

        if gang.can_recruit_member() {
            gang.recruit_member("Bob");
        }

        let mode = if gang.get_member_names().len() < 12 {
            GangMode::Respect
        } else {
            match highest_power_gang(ns) {
                None => GangMode::Money,
                Some(other) => {
                    gang.set_territory_warfare(gang.get_chance_to_win_clash(&other) > 0.65);
                    GangMode::Territory
                }
            }
        };

        match mode {
            GangMode::Territory => {
                for member in gang.get_member_names() {
                    gang.set_member_task(&member, "Territory Warfare");
                }
            }
            GangMode::Money | GangMode::Respect => {
                for member in gang.get_member_names() {
                    gang.set_member_task(&member, &wanted_task.name());
                }

                if !ns.file_exists("Formulas.exe") {
                    continue;
                }

                let potential_tasks = match mode {
                    GangMode::Respect => {
                        let mut tasks = tasks
                            .iter()
                            .filter(|task| task.base_respect() > 0.)
                            .collect::<Vec<_>>();
                        tasks.sort_by(|a, b| {
                            b.base_respect().partial_cmp(&a.base_respect()).unwrap()
                        });
                        tasks
                    }
                    GangMode::Money => {
                        let mut tasks = tasks
                            .iter()
                            .filter(|task| task.base_money() > 0.)
                            .collect::<Vec<_>>();
                        tasks.sort_by(|a, b| b.base_money().partial_cmp(&a.base_money()).unwrap());
                        tasks
                    }
                    _ => panic!("Unreachable"),
                };

                let mut wanted_budget = 0.;

                for member in gang.get_member_names() {
                    gang.set_member_task(&member, &wanted_task.name());
                    wanted_budget += ns.formulas().gang().wanted_level_gain(
                        &gang.get_gang_information(),
                        &gang.get_member_information(&member),
                        wanted_task
                    )
                }

                for member_name in gang.get_member_names() {
                    let member = member_name.clone();
                    let task = potential_tasks.iter()
                        .find_map(move |task| {

                            let current = ns.formulas().gang().wanted_level_gain(
                                &ns.gang().get_gang_information(), 
                                &ns.gang().get_member_information(&member), 
                                wanted_task
                            );

                            let potential = ns.formulas().gang().wanted_level_gain(
                                &ns.gang().get_gang_information(), 
                                &ns.gang().get_member_information(&member), 
                                task
                            );


                            let wanted_delta = -current + potential;

                            if wanted_budget + wanted_delta > 0. {
                                Some((task, wanted_delta))
                            } else {
                                None
                            }
                        });
                    
                    if let Some((task, wanted_delta)) = task {
                        gang.set_member_task(&member_name, &task.name());
                        wanted_budget -= wanted_delta;
                    }
                }
            }
        }
    }
}

#[derive(Clone, Copy)]
struct GangInfo {
    pub power: f64,
}

fn get_other_gangs(ns: &NS) -> HashMap<String, GangInfo> {
    let obj = ns.gang().get_other_gang_information();

    Object::entries(&obj)
        .into_iter()
        .map(|entry| {
            let key = Reflect::get(&entry, &JsValue::from(0))
                .unwrap()
                .as_string()
                .unwrap();
            let value = Reflect::get(&entry, &JsValue::from(1)).unwrap();

            let power = Reflect::get(&value, &JsValue::from("power"))
                .unwrap()
                .as_f64()
                .unwrap();

            (key, GangInfo { power })
        })
        .collect()
}

fn highest_power_gang(ns: &NS) -> Option<String> {
    let us = ns.gang().get_gang_information();

    get_other_gangs(ns)
        .into_iter()
        .filter(|(name, info)| name != &us.faction() && info.power > 0.)
        .max_by(|(_, info_a), (_, info_b)| {
            match cmp::PartialOrd::partial_cmp(&info_a.power, &info_b.power) {
                Some(ord) => ord,
                None => panic!("NaN gang power!"),
            }
        })
        .map(|(name, _)| name)
}
