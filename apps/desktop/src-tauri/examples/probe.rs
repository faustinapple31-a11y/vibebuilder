fn main() {
    let name = std::env::args().nth(1).unwrap_or_else(|| "claude".into());
    let path = worldforge_desktop_lib::commands::util::find_tool(&name);
    println!("path = {:?}", path);
    if let Some(p) = path {
        let t0 = std::time::Instant::now();
        let res = worldforge_desktop_lib::commands::util::run_capture(&p, &["--version"], None, 20);
        println!("elapsed {:?} → {:?}", t0.elapsed(), res.map(|(c, o, e)| (c, o.chars().take(120).collect::<String>(), e.chars().take(200).collect::<String>())));
    }
}
