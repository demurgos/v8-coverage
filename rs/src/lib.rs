pub use coverage::*;
pub use merge::*;

mod coverage;
mod merge;
mod range_tree;

#[cfg(test)]
mod tests {
  #[test]
  fn it_works() {
    assert_eq!(2 + 2, 4);
  }
}
