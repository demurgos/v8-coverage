use crate::neon_helpers::ModuleContextExt;
use neon::prelude::*;
mod merge;
mod neon_helpers;
mod tokio_runtime;

fn export(mut cx: ModuleContext) -> NeonResult<()> {
  let cx = &mut cx;
  cx.export_with("merge", crate::merge::create_namespace)?;
  Ok(())
}

#[neon::main]
fn main(cx: ModuleContext) -> NeonResult<()> {
  export(cx)
}
