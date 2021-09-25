use std::env::VarError;
use std::fs;

fn main() {
  let target_dir = match std::env::var("ETWIN_NEON_TARGET") {
    Ok(target) => {
      format!("build/{}", target)
    }
    Err(VarError::NotPresent) => ".".to_string(),
    Err(VarError::NotUnicode(v)) => {
      panic!("InvalidTarget: {:?}", v);
    }
  };

  fs::create_dir_all(target_dir.as_str()).unwrap();

  neon_build::Setup::options()
    .output_dir(target_dir.as_str())
    .output_file("index.node")
    .setup();
}
