// Évite une fenêtre de terminal en plus sous Windows, en version finale.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lems_essais_lib::run()
}
